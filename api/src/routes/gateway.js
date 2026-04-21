const router = require('express').Router();
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { getRedis } = require('../lib/redis');
const db = require('../lib/db');
const gemini = require('../lib/gemini');
const logger = require('../lib/logger');

// Socratic system prompt theo AI level (L0-L5)
const SOCRATIC_PROMPTS = {
	0: `Bạn là trợ lý học tập. KHÔNG được viết code hoàn chỉnh. Chỉ được đặt câu hỏi gợi mở để sinh viên tự tìm ra giải pháp.`,
	1: `Bạn là trợ lý học tập. Chỉ được gợi ý hướng tiếp cận, không viết code đầy đủ.`,
	2: `Bạn là trợ lý học tập. Có thể giải thích khái niệm và đưa ra ví dụ nhỏ, nhưng sinh viên phải tự viết code chính.`,
	3: `Bạn là trợ lý học tập. Có thể hỗ trợ debug và giải thích code, nhưng khuyến khích sinh viên tự sửa.`,
	4: `Bạn là trợ lý lập trình. Hỗ trợ đầy đủ nhưng luôn giải thích lý do.`,
	5: `Bạn là trợ lý lập trình chuyên nghiệp. Hỗ trợ không giới hạn.`,
};

const ChatSchema = z.object({
	messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
	session_id: z.string().uuid().optional(),
	stream: z.boolean().optional().default(false),
});

/**
 * Kiểm tra xem sinh viên có đang cố gắng lách luật (prompt injection) không.
 */
function checkGuardrails(messages) {
	const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
	const forbiddenTokens = ['ignore', 'system prompt', 'instruction', 'quy tắc', 'bỏ qua'];
	return forbiddenTokens.some(token => lastMessage.includes(token));
}

router.post('/chat', authenticate, async (req, res, next) => {
	try {
		const { messages: history, session_id, stream } = ChatSchema.parse(req.body);
		const user = req.user;
		const redis = getRedis();

		// ── Kiểm tra token quota ──────────────────────────────────
		const quotaKey = `quota:${user.id}`;
		const used = parseInt(await redis.get(quotaKey) || '0', 10);
		if (used >= user.token_quota) {
			return res.status(429).json({ error: 'Token quota exceeded for today' });
		}

		// ── Guardrails ────────────────────────────────────────────
		if (checkGuardrails(history)) {
			logger.warn(`Potential prompt injection detected from user ${user.id}`);
			return res.status(400).json({ error: 'Câu hỏi vi phạm quy tắc an toàn sư phạm.' });
		}

		// ── Socratic Nudging ──────────────────────────────────────
		const level = user.ai_level ?? 0;
		const finalMessages = [
			{ role: 'system', content: SOCRATIC_PROMPTS[level] || SOCRATIC_PROMPTS[0] },
			...history,
		];

		if (stream) {
			// ── Luồng Streaming (SSE) ────────────────────────────────
			res.setHeader('Content-Type', 'text/event-stream');
			res.setHeader('Cache-Control', 'no-cache');
			res.setHeader('Connection', 'keep-alive');

			const completion = await gemini.chat(finalMessages, { stream: true, maxTokens: 1000 });
			let fullText = '';

			for await (const chunk of completion) {
				const content = chunk.choices[0]?.delta?.content || '';
				fullText += content;
				if (content) {
					res.write(`data: ${JSON.stringify({ content })}\n\n`);
				}
			}

			// Ước tính token (thô sơ) cho session log
			const estimatedTokens = Math.ceil(fullText.length / 4) + 100; // placeholder logic
			await redis.incrby(quotaKey, estimatedTokens);
			
			// Ghi log (phần này có thể làm async)
			db.query(
				`INSERT INTO ai_gateway_log (user_id, session_id, model, prompt_tokens, completion_tokens, total_tokens, socratic_injected)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[user.id, session_id || null, process.env.LLM_MODEL || 'llama-3.1-8b-instant', 0, 0, estimatedTokens, level < 5]
			).catch(e => logger.error('Log error', e));

			res.write('data: [DONE]\n\n');
			return res.end();
		} else {
			// ── Luồng Normal ────────────────────────────────────────
			const { text, usage } = await gemini.chat(finalMessages, { maxTokens: 1000 });

			await redis.incrby(quotaKey, usage.total);
			await db.query(
				`INSERT INTO ai_gateway_log (user_id, session_id, model, prompt_tokens, completion_tokens, total_tokens, socratic_injected)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[user.id, session_id || null, process.env.LLM_MODEL || 'llama-3.1-8b-instant', usage.input, usage.output, usage.total, level < 5]
			);

			return res.json({
				message: { role: 'assistant', content: text },
				usage,
				socratic: level < 5,
				ai_level: level,
			});
		}
	} catch (err) {
		next(err);
	}
});

// GET /api/gateway/quota
router.get('/quota', authenticate, async (req, res, next) => {
	try {
		const redis = getRedis();
		const used = parseInt(await redis.get(`quota:${req.user.id}`) || '0', 10);
		res.json({
			used,
			limit: req.user.token_quota,
			remaining: Math.max(0, req.user.token_quota - used),
		});
	} catch (err) {
		next(err);
	}
});

module.exports = router;


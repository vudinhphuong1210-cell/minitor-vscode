/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * AI Gateway – proxy đến Gemini với:
 *   - Token quota management
 *   - Socratic Nudging (inject system prompt theo ai_level)
 *
 * POST /api/gateway/chat
 * GET  /api/gateway/quota
 */
const router = require('express').Router();
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { getRedis } = require('../lib/redis');
const db = require('../lib/db');
const gemini = require('../lib/gemini');

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
});

router.post('/chat', authenticate, async (req, res, next) => {
	try {
		const body = ChatSchema.parse(req.body);
		const user = req.user;
		const redis = getRedis();

		// ── Kiểm tra token quota ──────────────────────────────────
		const quotaKey = `quota:${user.id}`;
		const used = parseInt(await redis.get(quotaKey) || '0', 10);
		if (used >= user.token_quota) {
			return res.status(429).json({ error: 'Token quota exceeded for today' });
		}

		// ── Socratic Nudging ──────────────────────────────────────
		const level = user.ai_level ?? 0;
		const messages = [
			{ role: 'system', content: SOCRATIC_PROMPTS[level] || SOCRATIC_PROMPTS[0] },
			...body.messages,
		];

		// ── Gọi Gemini ────────────────────────────────────────────
		const { text, usage } = await gemini.chat(messages, { maxTokens: 1000, temperature: 0.7 });

		// ── Cập nhật quota trong Redis ────────────────────────────
		const ttl = 86400 - (Math.floor(Date.now() / 1000) % 86400);
		await redis.incrby(quotaKey, usage.total);
		await redis.expire(quotaKey, ttl);

		// ── Ghi log vào DB ────────────────────────────────────────
		await db.query(
			`INSERT INTO ai_gateway_log
         (user_id, session_id, model, prompt_tokens, completion_tokens, total_tokens, socratic_injected)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[user.id, body.session_id || null, process.env.LLM_MODEL || 'llama-3.1-8b-instant',
			usage.input, usage.output, usage.total, level < 5]
		);

		res.json({
			message: { role: 'assistant', content: text },
			usage: { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.total },
			ai_level: level,
			socratic: level < 5,
		});
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

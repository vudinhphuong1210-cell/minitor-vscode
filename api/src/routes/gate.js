/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Explanation Gate – chặn paste và hỏi sinh viên.
 *
 * POST /api/gate/challenge  – tạo câu hỏi cho đoạn code bị chặn
 * POST /api/gate/answer     – sinh viên trả lời, LLM-as-Judge chấm điểm
 */
const router = require('express').Router();
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const db = require('../lib/db');
const logger = require('../lib/logger');
const gemini = require('../lib/gemini');

// ── Tạo câu hỏi ──────────────────────────────────────────────
router.post('/challenge', authenticate, async (req, res, next) => {
	try {
		const { session_id, code_snippet } = z.object({
			session_id: z.string().uuid(),
			code_snippet: z.string().min(10).max(5000),
		}).parse(req.body);

		let question = 'Hãy giải thích logic của đoạn code này theo từng bước.';
		if (process.env.OPENAI_API_KEY) {
			try {
				const { text } = await gemini.chat([
					{
						role: 'system',
						content: `Bạn là giảng viên lập trình. Tạo MỘT câu hỏi ngắn gọn (1-2 câu)
bằng tiếng Việt để kiểm tra xem sinh viên có thực sự hiểu đoạn code sau không.
Câu hỏi phải cụ thể về logic, không hỏi chung chung.`,
					},
					{ role: 'user', content: `\`\`\`\n${code_snippet}\n\`\`\`` },
				], { maxTokens: 200, temperature: 0.7 });
				if (text) { question = text.trim(); }
			} catch (err) {
				logger.warn('Gemini challenge failed, using default question', { err: err.message });
			}
		}

		// Ensure session row exists (gate can be triggered before session is formally created)
		await db.query(
			`INSERT INTO sessions (id, user_id, hardware_fp)
       VALUES ($1, $2, '') ON CONFLICT (id) DO NOTHING`,
			[session_id, req.user.id]
		);

		const { rows } = await db.query(
			`INSERT INTO explanation_gates (id, user_id, session_id, code_snippet, question)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, question`,
			[uuidv4(), req.user.id, session_id, code_snippet, question]
		);

		res.json({ gate_id: rows[0].id, question: rows[0].question });
	} catch (err) {
		next(err);
	}
});

// ── Chấm điểm câu trả lời ────────────────────────────────────
router.post('/answer', authenticate, async (req, res, next) => {
	try {
		const { gate_id, answer } = z.object({
			gate_id: z.string().uuid(),
			answer: z.string().min(5).max(2000),
		}).parse(req.body);

		const { rows } = await db.query(
			'SELECT * FROM explanation_gates WHERE id = $1 AND user_id = $2',
			[gate_id, req.user.id]
		);
		if (!rows.length) { return res.status(404).json({ error: 'Gate not found' }); }

		const gate = rows[0];
		if (gate.passed !== null) { return res.status(409).json({ error: 'Already answered' }); }

		// LLM-as-Judge chấm điểm
		let score = 0.5, feedback = 'Không thể chấm điểm tự động.';
		if (process.env.OPENAI_API_KEY) {
			try {
				const { text } = await gemini.chat([
					{
						role: 'system',
						content: `Bạn là giám khảo lập trình. Chấm điểm câu trả lời của sinh viên từ 0.0 đến 1.0.
Chỉ trả về JSON thuần, không markdown: {"score": <số>, "feedback": "<nhận xét ngắn tiếng Việt>"}
Tiêu chí: hiểu đúng logic (0.4), giải thích rõ ràng (0.3), nhận ra edge case (0.3).`,
					},
					{
						role: 'user',
						content: `Code:\n\`\`\`\n${gate.code_snippet}\n\`\`\`\n\nCâu hỏi: ${gate.question}\n\nCâu trả lời: ${answer}`,
					},
				], { maxTokens: 300, temperature: 0.3 });

				// Gemini đôi khi bọc JSON trong ```json ... ```
				const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
				const parsed = JSON.parse(cleaned);
				score = Math.min(1, Math.max(0, Number(parsed.score) || 0));
				feedback = parsed.feedback || feedback;
			} catch (err) {
				logger.warn('Gemini judge failed', { err: err.message });
			}
		}

		const passed = score >= 0.6;

		await db.query(
			`UPDATE explanation_gates
       SET student_answer = $1, judge_score = $2, judge_feedback = $3,
           passed = $4, answered_at = NOW()
       WHERE id = $5`,
			[answer, score, feedback, passed, gate_id]
		);

		res.json({ passed, score, feedback });
	} catch (err) {
		next(err);
	}
});

module.exports = router;

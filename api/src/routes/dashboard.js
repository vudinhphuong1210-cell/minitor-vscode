/**
 * Dashboard API – dành cho giảng viên.
 *
 * GET /api/dashboard/students          – danh sách sinh viên + điểm nghi vấn
 * GET /api/dashboard/students/:id      – chi tiết một sinh viên
 * GET /api/dashboard/sessions/:id/integrity – kiểm tra chain hash
 */
const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { verifyLink } = require('../lib/chainHash');
const db = require('../lib/db');

// Tất cả route dashboard yêu cầu role instructor hoặc admin
router.use(authenticate, requireRole('instructor', 'admin'));

// Danh sách sinh viên với điểm nghi vấn mới nhất
router.get('/students', async (_req, res, next) => {
	try {
		const { rows } = await db.query(`
      SELECT
        u.id, u.email, u.display_name, u.ai_level,
        s.composite_score,
        s.keypress_entropy,
        s.modification_ratio,
        s.flagged,
        s.computed_at
      FROM users u
      LEFT JOIN LATERAL (
        SELECT * FROM suspicion_scores
        WHERE user_id = u.id
        ORDER BY computed_at DESC LIMIT 1
      ) s ON TRUE
      WHERE u.role = 'student'
      ORDER BY s.composite_score DESC NULLS LAST
    `);
		res.json({ students: rows });
	} catch (err) {
		next(err);
	}
});

// Chi tiết sinh viên
router.get('/students/:id', async (req, res, next) => {
	try {
		const userId = req.params.id;

		const [userRes, scoresRes, gatesRes, aiRes] = await Promise.all([
			db.query('SELECT id, email, display_name, role, ai_level FROM users WHERE id = $1', [userId]),
			db.query('SELECT * FROM suspicion_scores WHERE user_id = $1 ORDER BY computed_at DESC LIMIT 20', [userId]),
			db.query('SELECT id, question, judge_score, passed, created_at FROM explanation_gates WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [userId]),
			db.query('SELECT model, total_tokens, socratic_injected, created_at FROM ai_gateway_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [userId]),
		]);

		if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });

		res.json({
			user: userRes.rows[0],
			scores: scoresRes.rows,
			gates: gatesRes.rows,
			ai_usage: aiRes.rows,
		});
	} catch (err) {
		next(err);
	}
});

// Kiểm tra tính toàn vẹn chain hash của một session
router.get('/sessions/:id/integrity', async (req, res, next) => {
	try {
		const { rows } = await db.query(
			'SELECT * FROM events WHERE session_id = $1 ORDER BY id ASC',
			[req.params.id]
		);

		if (!rows.length) return res.json({ valid: true, events: 0, broken_at: null });

		let prevHash = null;
		let brokenAt = null;

		for (const event of rows) {
			const ok = verifyLink(event, prevHash);
			if (!ok) {
				brokenAt = { event_id: event.id, created_at: event.created_at };
				break;
			}
			prevHash = event.chain_hash;
		}

		res.json({
			valid: brokenAt === null,
			events: rows.length,
			broken_at: brokenAt,
		});
	} catch (err) {
		next(err);
	}
});

module.exports = router;

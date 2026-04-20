/**
 * POST /api/events/batch
 * Extension gửi batch event log (30-60s một lần).
 * Mỗi event được tính chain hash và đẩy vào RabbitMQ.
 */
const router = require('express').Router();
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { publish, QUEUES } = require('../lib/rabbitmq');
const { computeChainHash } = require('../lib/chainHash');
const db = require('../lib/db');

const EventSchema = z.object({
	session_id: z.string().uuid(),
	event_type: z.enum(['keystroke', 'paste', 'cursor_jump', 'ai_accept', 'explanation_gate', 'session_start', 'session_end']),
	payload: z.record(z.unknown()).default({}),
	client_ts: z.string().datetime(),   // timestamp từ client
	prev_hash: z.string().nullable().default(null),
});

const BatchSchema = z.object({
	events: z.array(EventSchema).min(1).max(500),
});

router.post('/batch', authenticate, async (req, res, next) => {
	try {
		const { events } = BatchSchema.parse(req.body);
		const userId = req.user.id;

		const enriched = events.map(ev => {
			const hash = computeChainHash(ev.prev_hash, ev.event_type, ev.payload, ev.client_ts);
			return { ...ev, user_id: userId, chain_hash: hash };
		});

		// Đẩy vào queue – worker sẽ persist vào DB
		publish(QUEUES.EVENTS, { batch: enriched });

		res.json({ accepted: enriched.length });
	} catch (err) {
		next(err);
	}
});

// GET /api/events/session/:sessionId – lấy event của một session (giảng viên)
router.get('/session/:sessionId', authenticate, async (req, res, next) => {
	try {
		const { rows } = await db.query(
			`SELECT id, event_type, payload, chain_hash, prev_hash, created_at
       FROM events WHERE session_id = $1 ORDER BY id ASC`,
			[req.params.sessionId]
		);
		res.json({ events: rows });
	} catch (err) {
		next(err);
	}
});

module.exports = router;

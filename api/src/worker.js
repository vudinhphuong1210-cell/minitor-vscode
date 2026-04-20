/**
 * Worker – xử lý event log bất đồng bộ từ RabbitMQ.
 * Persist vào PostgreSQL và tính Suspicion Score.
 */
require('dotenv').config();
const db = require('./lib/db');
const { connectRedis } = require('./lib/redis');
const { connectRabbitMQ, consume, QUEUES } = require('./lib/rabbitmq');
const logger = require('./lib/logger');

// ── Persist batch events ──────────────────────────────────────
async function handleEventBatch({ batch }) {
	if (!Array.isArray(batch) || !batch.length) return;

	// Bulk insert với một transaction
	const client = await db.pool.connect();
	try {
		await client.query('BEGIN');
		for (const ev of batch) {
			await client.query(
				`INSERT INTO events (session_id, user_id, event_type, payload, chain_hash, prev_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
				[
					ev.session_id,
					ev.user_id,
					ev.event_type,
					JSON.stringify(ev.payload),
					ev.chain_hash,
					ev.prev_hash,
					ev.client_ts,
				]
			);
		}
		await client.query('COMMIT');
		logger.info(`Persisted ${batch.length} events`);

		// Trigger tính điểm cho user đầu tiên trong batch
		const userId = batch[0].user_id;
		await computeSuspicionScore(userId, batch[0].session_id);
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	} finally {
		client.release();
	}
}

// ── Tính Suspicion Score ──────────────────────────────────────
async function computeSuspicionScore(userId, sessionId) {
	// Lấy events trong 10 phút gần nhất
	const { rows: events } = await db.query(
		`SELECT event_type, payload, created_at FROM events
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '10 minutes'
     ORDER BY id ASC`,
		[userId]
	);

	if (!events.length) return;

	// ── Keypress Entropy (KE) ─────────────────────────────────
	const keystrokes = events
		.filter(e => e.event_type === 'keystroke' && e.payload.iki)
		.map(e => Number(e.payload.iki));

	let ke = 0.5; // default
	if (keystrokes.length > 5) {
		const mean = keystrokes.reduce((a, b) => a + b, 0) / keystrokes.length;
		const variance = keystrokes.reduce((a, b) => a + (b - mean) ** 2, 0) / keystrokes.length;
		const stdDev = Math.sqrt(variance);
		// Chuẩn hoá: stdDev cao = entropy cao = tự nhiên hơn
		ke = Math.min(1, stdDev / 200);
	}

	// ── Code Jump Magnitude (CJM) ─────────────────────────────
	const jumps = events
		.filter(e => e.event_type === 'cursor_jump' && e.payload.magnitude)
		.map(e => Number(e.payload.magnitude));
	const cjm = jumps.length ? jumps.reduce((a, b) => a + b, 0) : 0;

	// ── Modification Ratio (MR) ───────────────────────────────
	const aiAccepts = events.filter(e => e.event_type === 'ai_accept').length;
	const aiModified = events.filter(e => e.event_type === 'ai_accept' && e.payload.modified).length;
	const mr = aiAccepts > 0 ? aiModified / aiAccepts : 1;

	// ── Composite Score (0 = bình thường, 1 = nghi vấn cao) ──
	// KE thấp (gõ đều) → nghi vấn cao
	// CJM cao (paste nhiều) → nghi vấn cao
	// MR thấp (không sửa AI code) → nghi vấn cao
	const keScore = 1 - ke;                          // thấp = tốt
	const cjmScore = Math.min(1, cjm / 10000);        // chuẩn hoá
	const mrScore = 1 - mr;                          // thấp = tốt

	const composite = (keScore * 0.35 + cjmScore * 0.35 + mrScore * 0.30);
	const flagged = composite > 0.7;

	await db.query(
		`INSERT INTO suspicion_scores
       (user_id, session_id, keypress_entropy, code_jump_magnitude, modification_ratio, composite_score, flagged)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		[userId, sessionId, ke, cjm, mr, composite, flagged]
	);

	if (flagged) {
		logger.warn(`User ${userId} flagged – composite score: ${composite.toFixed(3)}`);
	}
}

// ── Bootstrap ─────────────────────────────────────────────────
async function bootstrap() {
	await db.connect();
	await connectRedis();
	await connectRabbitMQ();

	await consume(QUEUES.EVENTS, handleEventBatch);

	logger.info('Worker started, listening for events...');
}

bootstrap().catch(err => {
	logger.error('Worker bootstrap failed', { err });
	process.exit(1);
});

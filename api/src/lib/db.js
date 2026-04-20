const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => logger.error('Unexpected DB error', { err }));

async function connect() {
	const client = await pool.connect();
	logger.info('PostgreSQL connected');
	client.release();
}

/**
 * Chạy một query với tham số.
 * @param {string} text
 * @param {any[]} params
 */
async function query(text, params) {
	const start = Date.now();
	const res = await pool.query(text, params);
	logger.debug('DB query', { text, duration: Date.now() - start, rows: res.rowCount });
	return res;
}

module.exports = { connect, query, pool };

const Redis = require('ioredis');
const logger = require('./logger');

let client;

async function connectRedis() {
	client = new Redis(process.env.REDIS_URL, { lazyConnect: true });
	await client.connect();
	logger.info('Redis connected');
}

function getRedis() {
	if (!client) throw new Error('Redis not initialised');
	return client;
}

module.exports = { connectRedis, getRedis };

const amqp = require('amqplib');
const logger = require('./logger');

let connection, channel;

const QUEUES = {
	EVENTS: 'edu.events',
	SCORING: 'edu.scoring',
};

async function connectRabbitMQ(retries = 10, delayMs = 3000) {
	for (let i = 1; i <= retries; i++) {
		try {
			connection = await amqp.connect(process.env.RABBITMQ_URL);
			channel = await connection.createChannel();

			for (const q of Object.values(QUEUES)) {
				await channel.assertQueue(q, { durable: true });
			}

			connection.on('error', (err) => logger.error('RabbitMQ connection error', { err }));
			connection.on('close', () => logger.warn('RabbitMQ connection closed'));

			logger.info('RabbitMQ connected, queues ready');
			return;
		} catch (err) {
			logger.warn(`RabbitMQ not ready, retry ${i}/${retries} in ${delayMs}ms...`, { err: err.message });
			if (i === retries) { throw err; }
			await new Promise(r => setTimeout(r, delayMs));
		}
	}
}

/**
 * Đẩy message vào queue.
 * @param {string} queue
 * @param {object} payload
 */
function publish(queue, payload) {
	if (!channel) throw new Error('RabbitMQ not initialised');
	channel.sendToQueue(
		queue,
		Buffer.from(JSON.stringify(payload)),
		{ persistent: true }
	);
}

/**
 * Đăng ký consumer cho một queue.
 * @param {string} queue
 * @param {(payload: object) => Promise<void>} handler
 */
async function consume(queue, handler) {
	if (!channel) throw new Error('RabbitMQ not initialised');
	channel.prefetch(10); // xử lý tối đa 10 message cùng lúc
	await channel.consume(queue, async (msg) => {
		if (!msg) return;
		try {
			const payload = JSON.parse(msg.content.toString());
			await handler(payload);
			channel.ack(msg);
		} catch (err) {
			logger.error('Worker handler error', { err });
			channel.nack(msg, false, false); // đưa vào dead-letter
		}
	});
}

module.exports = { connectRabbitMQ, publish, consume, QUEUES };

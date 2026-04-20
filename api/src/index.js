/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const logger = require('./lib/logger');
const db = require('./lib/db');
const { connectRedis } = require('./lib/redis');
const { connectRabbitMQ } = require('./lib/rabbitmq');

// Routes
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const gateRoutes = require('./routes/gate');
const gatewayRoutes = require('./routes/gateway');
const dashRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*' }));   // thu hẹp lại khi production
app.use(compression());
app.use(express.json({ limit: '2mb' }));

// Rate limit toàn cục: 200 req/phút/IP
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true }));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/gate', gateRoutes);
app.use('/api/gateway', gatewayRoutes);
app.use('/api/dashboard', dashRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Error handler ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
	// Zod validation errors -> 400
	if (err.name === 'ZodError') {
		return res.status(400).json({ error: err.errors ?? err.message });
	}
	logger.error(err.message, { stack: err.stack });
	res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ── Bootstrap ─────────────────────────────────────────────────
async function bootstrap() {
	await db.connect();
	await connectRedis();
	await connectRabbitMQ();

	app.listen(PORT, () => {
		logger.info(`API Server running on port ${PORT}`);
	});
}

bootstrap().catch(err => {
	logger.error('Bootstrap failed', { err });
	process.exit(1);
});

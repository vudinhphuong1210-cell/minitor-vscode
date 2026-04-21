/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../lib/db');

const RegisterSchema = z.object({
	email: z.string().email(),
	display_name: z.string().min(2),
	password: z.string().min(8),
	role: z.enum(['student', 'instructor']).default('student'),
});

const LoginSchema = z.object({
	email: z.string().email(),
	password: z.string(),
});

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
	try {
		const body = RegisterSchema.parse(req.body);
		const hash = await bcrypt.hash(body.password, 12);

		const { rows } = await db.query(
			`INSERT INTO users (email, display_name, role, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, role`,
			[body.email, body.display_name, body.role, hash]
		);

		res.status(201).json({ user: rows[0] });
	} catch (err) {
		next(err);
	}
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
	try {
		const { email, password } = LoginSchema.parse(req.body);

		const { rows } = await db.query(
			'SELECT id, email, display_name, role, ai_level, password_hash FROM users WHERE email = $1',
			[email]
		);
		if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

		const user = rows[0];
		const valid = user.password_hash
			? await bcrypt.compare(password, user.password_hash)
			: false;

		if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

		const token = jwt.sign(
			{ sub: user.id, role: user.role },
			process.env.JWT_SECRET,
			{ expiresIn: '8h' }
		);

		res.json({
			token,
			user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role, ai_level: user.ai_level },
		});
	} catch (err) {
		next(err);
	}
});

module.exports = router;

const jwt = require('jsonwebtoken');
const db = require('../lib/db');

/**
 * Middleware xác thực JWT.
 * Gắn req.user = { id, email, role, ai_level } nếu hợp lệ.
 */
async function authenticate(req, res, next) {
	const header = req.headers.authorization;
	if (!header || !header.startsWith('Bearer ')) {
		return res.status(401).json({ error: 'Missing token' });
	}

	const token = header.slice(7);
	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const { rows } = await db.query(
			'SELECT id, email, role, ai_level, token_quota FROM users WHERE id = $1',
			[decoded.sub]
		);
		if (!rows.length) return res.status(401).json({ error: 'User not found' });
		req.user = rows[0];
		next();
	} catch {
		return res.status(401).json({ error: 'Invalid token' });
	}
}

/**
 * Middleware kiểm tra role.
 * @param {...string} roles
 */
function requireRole(...roles) {
	return (req, res, next) => {
		if (!req.user || !roles.includes(req.user.role)) {
			return res.status(403).json({ error: 'Forbidden' });
		}
		next();
	};
}

module.exports = { authenticate, requireRole };

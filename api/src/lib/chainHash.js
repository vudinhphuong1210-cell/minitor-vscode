const crypto = require('crypto');

/**
 * Tính SHA-256 của (prevHash + eventType + JSON(payload) + timestamp).
 * Tạo chuỗi bằng chứng không thể giả mạo.
 *
 * @param {string|null} prevHash  - hash của event trước (null nếu là event đầu tiên)
 * @param {string}      eventType
 * @param {object}      payload
 * @param {string}      timestamp - ISO string
 * @returns {string} hex hash
 */
function computeChainHash(prevHash, eventType, payload, timestamp) {
	const data = [
		prevHash || 'GENESIS',
		eventType,
		JSON.stringify(payload),
		timestamp,
	].join('|');

	return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Kiểm tra tính toàn vẹn của một event so với event trước.
 */
function verifyLink(event, prevHash) {
	const expected = computeChainHash(
		prevHash,
		event.event_type,
		event.payload,
		event.created_at instanceof Date
			? event.created_at.toISOString()
			: event.created_at
	);
	return expected === event.chain_hash;
}

module.exports = { computeChainHash, verifyLink };

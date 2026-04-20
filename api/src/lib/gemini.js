/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * LLM client – OpenAI-compatible (Groq by default, swappable via env).
 *
 * Env vars:
 *   LLM_API_KEY   – API key  (required)
 *   LLM_BASE_URL  – Base URL (default: https://api.groq.com/openai/v1)
 *   LLM_MODEL     – Model    (default: llama-3.1-8b-instant)
 *
 * Returns: { text, usage: { input, output, total } }
 */
const logger = require('./logger');

const BASE_URL = () => (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const MODEL = () => process.env.LLM_MODEL || 'llama-3.1-8b-instant';
const API_KEY = () => process.env.LLM_API_KEY || '';

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ maxTokens?: number, temperature?: number }} opts
 * @returns {Promise<{ text: string, usage: { input: number, output: number, total: number } }>}
 */
async function chat(messages, opts = {}) {
	const { maxTokens = 1000, temperature = 0.7 } = opts;

	const res = await fetch(`${BASE_URL()}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${API_KEY()}`,
		},
		body: JSON.stringify({
			model: MODEL(),
			messages,
			max_tokens: maxTokens,
			temperature,
		}),
	});

	if (!res.ok) {
		const errText = await res.text();
		logger.error('LLM API error', { status: res.status, body: errText });
		throw new Error(`LLM ${res.status}: ${errText}`);
	}

	const data = await res.json();
	const text = data.choices?.[0]?.message?.content || '';
	const usage = {
		input: data.usage?.prompt_tokens || 0,
		output: data.usage?.completion_tokens || 0,
		total: data.usage?.total_tokens || 0,
	};

	return { text, usage };
}

module.exports = { chat };

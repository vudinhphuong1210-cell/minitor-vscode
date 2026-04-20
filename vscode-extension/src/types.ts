export type OriginType = 'human' | 'ai_accept' | 'paste' | 'unknown';

export interface CodeSegment {
	/** Dòng bắt đầu (0-indexed) */
	startLine: number;
	/** Dòng kết thúc (0-indexed, inclusive) */
	endLine: number;
	origin: OriginType;
	/** Timestamp khi đoạn này được tạo ra */
	timestamp: number;
}

export interface KeystrokeEvent {
	session_id: string;
	event_type: 'keystroke' | 'paste' | 'cursor_jump' | 'ai_accept' | 'session_start' | 'session_end';
	payload: Record<string, unknown>;
	client_ts: string;
	prev_hash: string | null;
}

import { CodeSegment, OriginType } from './types';

/**
 * Theo dõi các đoạn code trong một file và nguồn gốc của chúng.
 *
 * Khi người dùng gõ thêm dòng mới, các segment bên dưới sẽ được
 * dịch chuyển xuống. Khi xoá dòng, các segment bên dưới dịch lên.
 */
export class SegmentTracker {
	private segments: CodeSegment[] = [];

	/**
	 * Thêm một segment mới (paste hoặc ai_accept).
	 */
	addSegment(startLine: number, lineCount: number, origin: OriginType): void {
		const endLine = startLine + lineCount - 1;
		// Merge nếu liền kề với segment cùng loại
		const last = this.segments[this.segments.length - 1];
		if (last && last.origin === origin && last.endLine + 1 >= startLine) {
			last.endLine = Math.max(last.endLine, endLine);
			return;
		}
		this.segments.push({ startLine, endLine, origin, timestamp: Date.now() });
	}

	/**
	 * Đánh dấu một dòng là do người tự gõ.
	 * Nếu dòng đó nằm trong segment paste/ai, tách segment ra.
	 */
	markHumanLine(line: number): void {
		const newSegments: CodeSegment[] = [];
		for (const seg of this.segments) {
			if (line < seg.startLine || line > seg.endLine) {
				newSegments.push(seg);
				continue;
			}
			// Tách phần trước
			if (line > seg.startLine) {
				newSegments.push({ ...seg, endLine: line - 1 });
			}
			// Chèn segment human cho dòng này
			newSegments.push({ startLine: line, endLine: line, origin: 'human', timestamp: Date.now() });
			// Tách phần sau
			if (line < seg.endLine) {
				newSegments.push({ ...seg, startLine: line + 1 });
			}
		}
		// Nếu dòng không nằm trong segment nào, thêm human segment
		const exists = this.segments.some(s => line >= s.startLine && line <= s.endLine);
		if (!exists) {
			newSegments.push({ startLine: line, endLine: line, origin: 'human', timestamp: Date.now() });
		}
		this.segments = this.mergeAdjacent(newSegments);
	}

	/**
	 * Cập nhật vị trí segment khi có thay đổi nội dung.
	 * @param changeStartLine dòng bắt đầu thay đổi
	 * @param linesAdded      số dòng thêm vào (âm = xoá)
	 */
	shiftSegments(changeStartLine: number, linesAdded: number): void {
		if (linesAdded === 0) { return; }

		const updated: CodeSegment[] = [];
		for (const seg of this.segments) {
			if (seg.endLine < changeStartLine) {
				// Segment hoàn toàn trước vùng thay đổi → giữ nguyên
				updated.push(seg);
			} else if (seg.startLine > changeStartLine) {
				// Segment hoàn toàn sau vùng thay đổi → dịch chuyển
				updated.push({
					...seg,
					startLine: Math.max(0, seg.startLine + linesAdded),
					endLine: Math.max(0, seg.endLine + linesAdded),
				});
			} else {
				// Segment bao phủ vùng thay đổi → mở rộng/thu hẹp
				updated.push({
					...seg,
					endLine: Math.max(seg.startLine, seg.endLine + linesAdded),
				});
			}
		}
		this.segments = updated.filter(s => s.endLine >= s.startLine);
	}

	getSegments(): CodeSegment[] {
		return this.segments;
	}

	getSegmentAt(line: number): CodeSegment | undefined {
		return this.segments.find(s => line >= s.startLine && line <= s.endLine);
	}

	clear(): void {
		this.segments = [];
	}

	private mergeAdjacent(segs: CodeSegment[]): CodeSegment[] {
		const sorted = [...segs].sort((a, b) => a.startLine - b.startLine);
		const merged: CodeSegment[] = [];
		for (const seg of sorted) {
			const last = merged[merged.length - 1];
			if (last && last.origin === seg.origin && last.endLine + 1 >= seg.startLine) {
				last.endLine = Math.max(last.endLine, seg.endLine);
			} else {
				merged.push({ ...seg });
			}
		}
		return merged;
	}
}

import * as vscode from 'vscode';
import { DecorationManager } from './decorations';
import { SegmentTracker } from './segmentTracker';
import { EventCollector } from './eventCollector';
import { OriginType } from './types';

/**
 * Controller chính – kết nối editor events với SegmentTracker và DecorationManager.
 */
export class HighlightController {
	private decorationManager: DecorationManager;
	/** Map từ uri.toString() → SegmentTracker */
	private trackers = new Map<string, SegmentTracker>();
	private collector: EventCollector;
	private enabled: boolean;
	private highlightEnabled: boolean;

	/** Thời điểm keystroke cuối cùng (để tính IKI) */
	private lastKeystrokeTime = 0;

	constructor(collector: EventCollector, enabled: boolean, highlightEnabled: boolean) {
		this.decorationManager = new DecorationManager();
		this.collector = collector;
		this.enabled = enabled;
		this.highlightEnabled = highlightEnabled;
	}

	// ── Public API ────────────────────────────────────────────

	setEnabled(v: boolean): void { this.enabled = v; }
	setHighlightEnabled(v: boolean): void {
		this.highlightEnabled = v;
		if (!v) { this.clearAllDecorations(); }
	}

	isHighlightEnabled(): boolean {
		return this.highlightEnabled;
	}

	toggleHighlight(): void {
		this.setHighlightEnabled(!this.highlightEnabled);
		// Nếu vừa bật lại, re-apply decorations cho editor hiện tại
		if (this.highlightEnabled && vscode.window.activeTextEditor) {
			this.applyDecorations(vscode.window.activeTextEditor.document);
		}
		vscode.window.showInformationMessage(
			`EDU Monitor: Highlight ${this.highlightEnabled ? 'BẬT 👁' : 'TẮT'}`
		);
	}

	clearAll(): void {
		this.trackers.forEach(t => t.clear());
		this.clearAllDecorations();
	}

	showLegend(): void {
		vscode.window.showInformationMessage(
			'👤 Xanh = tự gõ   📋 Vàng = paste   🤖 Cam = AI suggest',
			{ modal: false }
		);
	}

	// ── Editor event handlers ─────────────────────────────────

	onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
		if (!this.enabled) { return; }
		const uri = event.document.uri.toString();
		const tracker = this.getOrCreateTracker(uri);

		for (const change of event.contentChanges) {
			const startLine = change.range.start.line;
			const linesAdded = change.text.split('\n').length - 1
				- (change.range.end.line - change.range.start.line);

			const isLargePaste = change.text.length > 50 && change.text.includes('\n');
			const now = Date.now();
			const iki = this.lastKeystrokeTime ? now - this.lastKeystrokeTime : 0;
			this.lastKeystrokeTime = now;

			if (isLargePaste) {
				// ── Paste ──────────────────────────────────────────
				const lineCount = change.text.split('\n').length;
				tracker.shiftSegments(startLine, linesAdded);
				tracker.addSegment(startLine, lineCount, 'paste');

				this.collector.push('paste', {
					line: startLine,
					char_count: change.text.length,
					line_count: lineCount,
				});

				// Hiện Explanation Gate nếu paste lớn (> 5 dòng)
				if (lineCount > 5) {
					this.triggerExplanationGate(event.document, change.text, startLine);
				}
			} else {
				// ── Keystroke thông thường ─────────────────────────
				tracker.shiftSegments(startLine, linesAdded);
				tracker.markHumanLine(startLine);

				this.collector.push('keystroke', { line: startLine, iki });
			}
		}

		this.applyDecorations(event.document);
	}

	onDidChangeActiveEditor(editor: vscode.TextEditor | undefined): void {
		if (!editor) { return; }
		this.applyDecorations(editor.document);
	}

	/**
	 * Gọi khi GitHub Copilot / inline completion được chấp nhận.
	 * VS Code không có event trực tiếp, nên ta dùng heuristic:
	 * nếu một thay đổi lớn xảy ra trong < 100ms sau khi có completion item.
	 */
	markAiAccept(document: vscode.TextDocument, startLine: number, lineCount: number): void {
		const uri = document.uri.toString();
		const tracker = this.getOrCreateTracker(uri);
		tracker.addSegment(startLine, lineCount, 'ai_accept');
		this.collector.push('ai_accept', { line: startLine, line_count: lineCount, modified: false });
		this.applyDecorations(document);
	}

	// ── Private helpers ───────────────────────────────────────

	private getOrCreateTracker(uri: string): SegmentTracker {
		if (!this.trackers.has(uri)) {
			this.trackers.set(uri, new SegmentTracker());
		}
		return this.trackers.get(uri)!;
	}

	private applyDecorations(document: vscode.TextDocument): void {
		if (!this.highlightEnabled) { return; }

		const editor = vscode.window.visibleTextEditors.find(
			e => e.document.uri.toString() === document.uri.toString()
		);
		if (!editor) { return; }

		const tracker = this.getOrCreateTracker(document.uri.toString());
		const segments = tracker.getSegments();

		// Nhóm ranges theo origin
		const rangeMap = new Map<OriginType, vscode.Range[]>([
			['human', []],
			['paste', []],
			['ai_accept', []],
		]);

		for (const seg of segments) {
			const ranges = rangeMap.get(seg.origin);
			if (!ranges) { continue; }
			const endLine = Math.min(seg.endLine, document.lineCount - 1);
			ranges.push(new vscode.Range(seg.startLine, 0, endLine, 0));
		}

		// Áp dụng decoration
		for (const [origin, ranges] of rangeMap) {
			const decType = this.decorationManager.getDecoration(origin);
			if (decType) {
				editor.setDecorations(decType, ranges);
			}
		}
	}

	private clearAllDecorations(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			for (const decType of this.decorationManager.getAllTypes()) {
				editor.setDecorations(decType, []);
			}
		}
	}

	private triggerExplanationGate(
		document: vscode.TextDocument,
		code: string,
		startLine: number
	): void {
		// Hiện thông báo nhẹ, không block editor
		vscode.window.showWarningMessage(
			`📋 Phát hiện paste lớn tại dòng ${startLine + 1}. Bạn có thể giải thích đoạn code này không?`,
			'Giải thích ngay',
			'Bỏ qua'
		).then(choice => {
			if (choice === 'Giải thích ngay') {
				// Mở webview explanation gate (sẽ mở rộng sau)
				vscode.commands.executeCommand('eduMonitor.openGate', { code, startLine });
			}
		});
	}

	dispose(): void {
		this.decorationManager.dispose();
	}
}

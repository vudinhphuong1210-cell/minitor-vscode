import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { HighlightController } from './highlightController';
import { EventCollector } from './eventCollector';
import { EduStatusBar } from './statusBar';

let controller: HighlightController | undefined;
let collector: EventCollector | undefined;
let statusBar: EduStatusBar | undefined;

export function activate(context: vscode.ExtensionContext): void {
	const config = vscode.workspace.getConfiguration('eduMonitor');

	const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');
	const enabled = config.get<boolean>('enabled', true);
	const highlightEnabled = config.get<boolean>('highlightEnabled', true);
	const batchIntervalMs = config.get<number>('batchIntervalMs', 30000);

	// Lấy token từ globalState (đăng nhập trước)
	let token = context.globalState.get<string>('eduMonitor.token', '');

	// Tạo session ID mới cho mỗi lần mở VS Code
	const sessionId = crypto.randomUUID();

	// Khởi tạo các thành phần
	collector = new EventCollector(sessionId, serverUrl, batchIntervalMs);
	controller = new HighlightController(collector, enabled, highlightEnabled);
	statusBar = new EduStatusBar();

	// ── Helper: thực hiện login ───────────────────────────────
	async function doLogin(): Promise<boolean> {
		const email = await vscode.window.showInputBox({
			prompt: 'Email đăng nhập EDU Monitor',
			placeHolder: 'student@fpt.edu.vn',
			ignoreFocusOut: true,
		});
		if (!email) { return false; }

		const password = await vscode.window.showInputBox({
			prompt: 'Mật khẩu EDU Monitor',
			password: true,
			ignoreFocusOut: true,
		});
		if (!password) { return false; }

		try {
			const res = await fetch(`${serverUrl}/api/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password }),
			});
			const data = await res.json() as { token?: string; error?: string };
			if (!res.ok) { throw new Error(data.error || 'Login failed'); }

			token = data.token!;
			await context.globalState.update('eduMonitor.token', token);
			collector?.startBatching(token);
			statusBar?.setConnected(true);
			vscode.window.showInformationMessage('EDU Monitor: Đăng nhập thành công! Bắt đầu giám sát.');
			return true;
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`EDU Monitor: Đăng nhập thất bại – ${msg}`);
			return false;
		}
	}

	// ── Bắt đầu hoặc yêu cầu đăng nhập ──────────────────────
	if (token) {
		collector.startBatching(token);
		statusBar.setConnected(true);
	} else {
		statusBar.setConnected(false);
		// Nhắc đăng nhập ngay khi mở VS Code
		vscode.window.showWarningMessage(
			'EDU Monitor: Bạn chưa đăng nhập. Vui lòng đăng nhập để bắt đầu coding.',
			'Đăng nhập ngay'
		).then(choice => {
			if (choice === 'Đăng nhập ngay') {
				doLogin();
			}
		});
	}

	// ── Đăng ký commands ──────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('eduMonitor.toggleHighlight', () => {
			if (!token) {
				vscode.window.showWarningMessage('EDU Monitor: Vui lòng đăng nhập trước.', 'Đăng nhập').then(c => {
					if (c === 'Đăng nhập') { doLogin(); }
				});
				return;
			}
			controller?.toggleHighlight();
			statusBar?.setHighlightOn(controller?.isHighlightEnabled() ?? true);
		}),

		vscode.commands.registerCommand('eduMonitor.showLegend', () => {
			controller?.showLegend();
		}),

		vscode.commands.registerCommand('eduMonitor.clearHighlights', () => {
			controller?.clearAll();
			vscode.window.showInformationMessage('EDU Monitor: Đã xoá toàn bộ highlight.');
		}),

		vscode.commands.registerCommand('eduMonitor.login', async () => {
			if (token) {
				const choice = await vscode.window.showInformationMessage(
					'EDU Monitor: Bạn đã đăng nhập. Đăng xuất?',
					'Đăng xuất', 'Huỷ'
				);
				if (choice === 'Đăng xuất') {
					collector?.stopBatching(token);
					token = '';
					await context.globalState.update('eduMonitor.token', '');
					statusBar?.setConnected(false);
					vscode.window.showInformationMessage('EDU Monitor: Đã đăng xuất.');
				}
				return;
			}
			await doLogin();
		}),

		// Explanation Gate command (mở webview)
		vscode.commands.registerCommand('eduMonitor.openGate', (args: { code: string; startLine: number }) => {
			if (!token) {
				vscode.window.showWarningMessage('EDU Monitor: Vui lòng đăng nhập để sử dụng Explanation Gate.', 'Đăng nhập').then(c => {
					if (c === 'Đăng nhập') { doLogin(); }
				});
				return;
			}
			openExplanationGatePanel(context, serverUrl, token, sessionId, args.code, args.startLine);
		})
	);

	// ── Đăng ký editor event listeners ───────────────────────

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			// Bỏ qua output panel, debug console
			const scheme = event.document.uri.scheme;
			if (scheme === 'output' || scheme === 'debug' || scheme === 'vscode') { return; }
			// Chỉ theo dõi nếu đã đăng nhập
			if (!token) { return; }
			controller?.onDidChangeTextDocument(event);
		}),

		vscode.window.onDidChangeActiveTextEditor(editor => {
			controller?.onDidChangeActiveEditor(editor);
		}),
	);

	// Áp dụng decoration cho editor đang mở
	if (vscode.window.activeTextEditor) {
		controller.onDidChangeActiveEditor(vscode.window.activeTextEditor);
	}

	console.log('EDU Monitor activated. Session:', sessionId);
}

export function deactivate(): void {
	const token = ''; // lấy từ storage nếu cần
	collector?.stopBatching(token);
	controller?.dispose();
	statusBar?.dispose();
}

// ── Explanation Gate WebView ──────────────────────────────────

function openExplanationGatePanel(
	context: vscode.ExtensionContext,
	serverUrl: string,
	token: string,
	sessionId: string,
	code: string,
	startLine: number
): void {
	const panel = vscode.window.createWebviewPanel(
		'eduGate',
		'🔒 Explanation Gate',
		vscode.ViewColumn.Beside,
		{ enableScripts: true }
	);

	panel.webview.html = getGateHtml(code, startLine);

	// Nhận message từ webview
	panel.webview.onDidReceiveMessage(async (msg) => {
		if (msg.type === 'requestChallenge') {
			try {
				const res = await fetch(`${serverUrl}/api/gate/challenge`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ session_id: sessionId, code_snippet: code }),
				});
				const data = await res.json() as { gate_id: string; question: string };
				panel.webview.postMessage({ type: 'challenge', gateId: data.gate_id, question: data.question });
			} catch {
				panel.webview.postMessage({ type: 'error', message: 'Không thể kết nối server' });
			}
		}

		if (msg.type === 'submitAnswer') {
			try {
				const res = await fetch(`${serverUrl}/api/gate/answer`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ gate_id: msg.gateId, answer: msg.answer }),
				});
				const data = await res.json() as { passed: boolean; score: number; feedback: string };
				panel.webview.postMessage({ type: 'result', ...data });
				if (data.passed) {
					setTimeout(() => panel.dispose(), 3000);
				}
			} catch {
				panel.webview.postMessage({ type: 'error', message: 'Không thể kết nối server' });
			}
		}
	}, undefined, context.subscriptions);
}

function getGateHtml(code: string, startLine: number): string {
	const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: system-ui; background: #0f172a; color: #e2e8f0; padding: 20px; }
  h2  { color: #f97316; margin-bottom: 8px; }
  pre { background: #1e293b; padding: 12px; border-radius: 8px; font-size: 12px;
        overflow: auto; max-height: 200px; border-left: 3px solid #f97316; }
  .question { background: #1e293b; padding: 14px; border-radius: 8px; margin: 16px 0;
              border-left: 3px solid #38bdf8; color: #bae6fd; }
  textarea  { width: 100%; height: 120px; background: #1e293b; border: 1px solid #334155;
              color: #e2e8f0; padding: 10px; border-radius: 8px; font-size: 13px; resize: vertical; }
  button    { background: #0ea5e9; border: none; color: #fff; padding: 10px 20px;
              border-radius: 8px; cursor: pointer; font-size: 14px; margin-top: 8px; }
  button:disabled { background: #334155; cursor: not-allowed; }
  .result   { padding: 14px; border-radius: 8px; margin-top: 16px; font-weight: 600; }
  .pass     { background: rgba(34,197,94,0.15); border-left: 3px solid #22c55e; color: #86efac; }
  .fail     { background: rgba(239,68,68,0.15);  border-left: 3px solid #ef4444; color: #fca5a5; }
  .loading  { color: #64748b; font-style: italic; }
</style>
</head>
<body>
<h2>🔒 Explanation Gate – Dòng ${startLine + 1}</h2>
<p style="color:#94a3b8;font-size:13px">Phát hiện paste lớn. Hãy chứng minh bạn hiểu đoạn code này.</p>
<pre>${escaped}</pre>

<div id="questionArea" class="loading">Đang tạo câu hỏi...</div>
<textarea id="answer" placeholder="Nhập câu trả lời của bạn..." style="display:none"></textarea>
<button id="submitBtn" style="display:none" disabled>Gửi câu trả lời</button>
<div id="result"></div>

<script>
  const vscode = acquireVsCodeApi();
  let gateId = null;

  // Tự động yêu cầu câu hỏi khi mở
  vscode.postMessage({ type: 'requestChallenge' });

  document.getElementById('submitBtn').addEventListener('click', () => {
    const answer = document.getElementById('answer').value.trim();
    if (!answer || !gateId) return;
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('submitBtn').textContent = 'Đang chấm...';
    vscode.postMessage({ type: 'submitAnswer', gateId, answer });
  });

  document.getElementById('answer').addEventListener('input', () => {
    document.getElementById('submitBtn').disabled =
      document.getElementById('answer').value.trim().length < 10;
  });

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'challenge') {
      gateId = msg.gateId;
      document.getElementById('questionArea').innerHTML =
        '<div class="question">❓ ' + msg.question + '</div>';
      document.getElementById('answer').style.display = 'block';
      document.getElementById('submitBtn').style.display = 'block';
    }
    if (msg.type === 'result') {
      const cls = msg.passed ? 'pass' : 'fail';
      const icon = msg.passed ? '✅' : '❌';
      document.getElementById('result').innerHTML =
        '<div class="result ' + cls + '">' + icon + ' Điểm: ' +
        Math.round(msg.score * 100) + '/100 – ' + msg.feedback + '</div>';
      document.getElementById('submitBtn').textContent = msg.passed ? 'Đạt! Đóng sau 3s...' : 'Thử lại';
      if (!msg.passed) {
        document.getElementById('submitBtn').disabled = false;
      }
    }
    if (msg.type === 'error') {
      document.getElementById('questionArea').innerHTML =
        '<div style="color:#f87171">' + msg.message + ' – chạy ở offline mode</div>';
      document.getElementById('answer').style.display = 'block';
      document.getElementById('submitBtn').style.display = 'block';
      document.getElementById('submitBtn').disabled = false;
    }
  });
</script>
</body>
</html>`;
}

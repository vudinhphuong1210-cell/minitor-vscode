import * as vscode from 'vscode';

/**
 * Status bar item hiển thị trạng thái EDU Monitor ở góc dưới VS Code.
 */
export class EduStatusBar {
	private item: vscode.StatusBarItem;

	constructor() {
		this.item = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		this.item.command = 'eduMonitor.toggleHighlight';
		this.item.tooltip = 'EDU Monitor – Click để bật/tắt highlight';
		this.setHighlightOn(true);
		this.item.show();
	}

	setHighlightOn(on: boolean): void {
		this.item.text = on
			? '$(eye) EDU Monitor'
			: '$(eye-closed) EDU Monitor';
		this.item.backgroundColor = on
			? undefined
			: new vscode.ThemeColor('statusBarItem.warningBackground');
	}

	setConnected(connected: boolean): void {
		this.item.text = connected
			? '$(eye) EDU Monitor'
			: '$(eye) EDU Monitor $(warning)';
		this.item.tooltip = connected
			? 'EDU Monitor – Đã kết nối server'
			: 'EDU Monitor – Chưa đăng nhập. Click để đăng nhập.';
		this.item.command = connected
			? 'eduMonitor.toggleHighlight'
			: 'eduMonitor.login';
		this.item.backgroundColor = connected
			? undefined
			: new vscode.ThemeColor('statusBarItem.warningBackground');
	}

	dispose(): void {
		this.item.dispose();
	}
}

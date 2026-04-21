import * as vscode from "vscode";
import { OriginType } from "./types";

/**
 * Quản lý toàn bộ decoration types cho highlight.
 *
 * Màu sắc:
 *  - human   : xanh lá nhạt  – tự gõ
 *  - paste   : vàng nhạt     – paste từ ngoài
 *  - ai_accept: cam nhạt     – chấp nhận AI suggest
 *  - unknown : không màu
 */
export class DecorationManager {
  private readonly humanDecoration: vscode.TextEditorDecorationType;
  private readonly pasteDecoration: vscode.TextEditorDecorationType;
  private readonly aiDecoration: vscode.TextEditorDecorationType;

  constructor() {
    this.humanDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor("eduMonitor.humanBackground"),
      // Fallback nếu theme chưa định nghĩa màu
      overviewRulerColor: "rgba(34,197,94,0.4)",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      gutterIconPath: undefined,
      after: {
        contentText: "  👤",
        color: "rgba(34,197,94,0.5)",
        fontStyle: "normal",
      },
      // Dùng rgba trực tiếp làm fallback
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    this.pasteDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(234,179,8,0.08)",
      border: "0 0 0 3px solid rgba(234,179,8,0.6)",
      overviewRulerColor: "rgba(234,179,8,0.5)",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      after: {
        contentText: "  📋",
        color: "rgba(234,179,8,0.6)",
        fontStyle: "normal",
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    this.aiDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(249,115,22,0.08)",
      border: "0 0 0 3px solid rgba(249,115,22,0.6)",
      overviewRulerColor: "rgba(249,115,22,0.5)",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      after: {
        contentText: "  🤖",
        color: "rgba(249,115,22,0.6)",
        fontStyle: "normal",
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }

  getDecoration(origin: OriginType): vscode.TextEditorDecorationType | null {
    switch (origin) {
      case "human":
        return this.humanDecoration;
      case "paste":
        return this.pasteDecoration;
      case "ai_accept":
        return this.aiDecoration;
      default:
        return null;
    }
  }

  getAllTypes(): vscode.TextEditorDecorationType[] {
    return [this.humanDecoration, this.pasteDecoration, this.aiDecoration];
  }

  dispose(): void {
    this.humanDecoration.dispose();
    this.pasteDecoration.dispose();
    this.aiDecoration.dispose();
  }
}

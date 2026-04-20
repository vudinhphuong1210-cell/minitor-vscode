# EDU Monitor – VS Code Extension

Extension theo dõi hành vi lập trình và highlight phân biệt **code người tự gõ** vs **code máy/paste**.

## Màu sắc highlight

| Màu | Icon | Ý nghĩa |
|-----|------|---------|
| 🟢 Xanh lá nhạt | 👤 | Tự gõ từng ký tự |
| 🟡 Vàng nhạt | 📋 | Paste từ clipboard |
| 🟠 Cam nhạt | 🤖 | Chấp nhận AI suggest (Copilot) |

## Cài đặt & Chạy (Development)

### Yêu cầu
- Node.js 18+
- VS Code 1.85+

### Bước 1: Cài dependencies

```bash
cd edu-monitor/vscode-extension
npm install
```

### Bước 2: Build

```bash
npm run compile
```

### Bước 3: Chạy trong VS Code

1. Mở thư mục `edu-monitor/vscode-extension` trong VS Code
2. Nhấn `F5` → chọn **"Extension Development Host"**
3. Một cửa sổ VS Code mới mở ra với extension đã được load

### Bước 4: Đăng nhập (tuỳ chọn)

Mở Command Palette (`Ctrl+Shift+P`) → `EDU Monitor: Login`

Nếu không đăng nhập, extension vẫn hoạt động highlight offline.

## Commands

| Command | Phím tắt | Mô tả |
|---------|----------|-------|
| `EDU Monitor: Bật/Tắt highlight` | Click status bar | Toggle highlight |
| `EDU Monitor: Xem chú thích màu sắc` | — | Hiện legend |
| `EDU Monitor: Xoá toàn bộ highlight` | — | Clear tất cả |

## Cấu hình

Trong `settings.json`:

```json
{
  "eduMonitor.serverUrl": "http://localhost:3000",
  "eduMonitor.enabled": true,
  "eduMonitor.highlightEnabled": true,
  "eduMonitor.batchIntervalMs": 30000
}
```

## Đóng gói thành .vsix

```bash
npm install -g @vscode/vsce
vsce package
# → edu-monitor-0.1.0.vsix
```

Cài vào VS Code:
```
Extensions → ⋯ → Install from VSIX
```

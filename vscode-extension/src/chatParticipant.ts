import * as vscode from 'vscode';
import * as crypto from 'node:crypto';

export function registerChatParticipant(context: vscode.ExtensionContext, serverUrl: string, token: string) {
    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, tokenSource: vscode.CancellationToken) => {
        // Lấy session ID từ workspace (ví dụ đơn giản)
        const sessionId = context.history.length > 0 ? (context.history[0] as any).sessionId : crypto.randomUUID();

        // Chuẩn bị tin nhắn (bao gồm lệnh nếu có)
        const prompt = request.command ? `/${request.command} ${request.prompt}` : request.prompt;
        
        // Convert history sang format API
        const messages = context.history.map(m => {
            if ('prompt' in m) { // User request turn
                return { role: 'user', content: m.prompt };
            } else { // Assistant response turn
                // Lấy toàn bộ nội dung text từ các phần Markdown trong response
                const content = m.response
                    .filter(r => r instanceof vscode.ChatResponseMarkdownPart)
                    .map(r => (r as vscode.ChatResponseMarkdownPart).value.value)
                    .join('');
                return { role: 'assistant', content: content || '' };
            }
        });
        messages.push({ role: 'user', content: prompt });

        try {
            const response = await fetch(`${serverUrl}/api/gateway/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    messages,
                    session_id: sessionId,
                    stream: true
                })
            });

            if (!response.ok) {
                const err = await response.json();
                stream.markdown(`❌ Lỗi API: ${err.error || 'Server không phản hồi'}`);
                return;
            }

            // Đọc stream SSE
            const reader = response.body?.getReader();
            if (!reader) {
                stream.markdown("❌ Không thể đọc luồng dữ liệu từ server.");
                return;
            }

            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') continue;
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.content) {
                                stream.markdown(data.content);
                            }
                        } catch (e) {
                            console.error("Parse error", e);
                        }
                    }
                }
            }
        } catch (err: any) {
            stream.markdown(`❌ Lỗi kết nối: ${err.message}`);
        }
    };

    const participant = vscode.chat.createChatParticipant('eduMonitor.assistant', handler);
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png'); // Cần kiểm tra file này tồn tại

    context.subscriptions.push(participant);
}

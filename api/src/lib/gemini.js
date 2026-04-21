const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("./logger");

/**
 * Thư viện tương tác với Google Gemini sử dụng SDK chính thức.
 * Trả về định dạng tương thích với code cũ ({ text, usage }).
 */

const API_KEY = () => process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const MODEL_NAME = () => process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gemini-1.5-flash";

let genAI = null;

function getGenAI() {
  const key = API_KEY();
  if (!genAI && key) {
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ maxTokens?: number, temperature?: number, stream?: boolean }} opts
 */
async function chat(messages, opts = {}) {
  const { maxTokens = 1000, temperature = 0.7, stream = false } = opts;
  const ai = getGenAI();

  if (!ai) {
    throw new Error("Gemini API Key is missing. Please check your .env file.");
  }

  try {
    // 1. Tách system instruction nếu có
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const userMessages = messages.filter(m => m.role !== 'system');

    // 2. Chuyển đổi format sang Gemini (parts)
    // Lưu ý: Gemini yêu cầu role 'user' và 'model' xen kẽ
    const contents = userMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    let modelName = MODEL_NAME();
    if (modelName.startsWith('models/')) {
      modelName = modelName.replace('models/', '');
    }

    const model = ai.getGenerativeModel({
      model: modelName,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    });

    const generationConfig = {
      maxOutputTokens: maxTokens,
      temperature: temperature,
    };

    console.log(`[Gemini] Calling model: ${MODEL_NAME()} with ${userMessages.length} messages`);
0
    if (stream) {
      // Stream hiện tại chưa được dùng trong test-manual nhưng vẫn implement cho VS Code
      const result = await model.generateContentStream({ contents, generationConfig });
      return result.stream; 
    } else {
      const result = await model.generateContent({ contents, generationConfig });
      const response = await result.response;
      const text = response.text();

      // Giả lập usage (Gemini SDK có tokens nhưng structure hơi khác)
      const usage = {
        input: response.usageMetadata?.promptTokenCount || 0,
        output: response.usageMetadata?.candidatesTokenCount || 0,
        total: response.usageMetadata?.totalTokenCount || Math.ceil(text.length / 4 + 10),
        total_tokens: response.usageMetadata?.totalTokenCount || Math.ceil(text.length / 4 + 10)
      };

      return { text, usage };
    }
  } catch (err) {
    logger.error("Gemini Native SDK error", { err: err.message });
    throw err;
  }
}

module.exports = { chat };

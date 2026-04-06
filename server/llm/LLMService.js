/**
 * 服务端 LLM 调用服务
 *
 * 读取环境变量，统一为 Bot 和模拟模式提供 LLM 能力
 * 兼容 OpenAI API 格式（DeepSeek/SiliconFlow/Kimi 等）
 */

class LLMService {
    constructor() {
        this.apiKey = process.env.LLM_API_KEY || '';
        this.baseUrl = (process.env.LLM_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/$/, '');
        this.model = process.env.LLM_MODEL || 'MiniMax-M2.7';
        this.maxConcurrent = 3;
        this.activeRequests = 0;
        this.queue = [];
    }

    get isConfigured() {
        return !!this.apiKey;
    }

    /**
     * 调用 LLM — 带并发控制、超时、重试
     * @param {string} systemPrompt - 系统提示词
     * @param {string} userPrompt - 用户提示词
     * @param {object} options - { temperature, maxTokens }
     * @returns {Promise<string>} LLM 回复文本
     */
    async call(systemPrompt, userPrompt, options = {}) {
        if (!this.isConfigured) {
            throw new Error('LLM not configured: missing LLM_API_KEY');
        }

        // 并发控制
        if (this.activeRequests >= this.maxConcurrent) {
            await new Promise(resolve => this.queue.push(resolve));
        }

        this.activeRequests++;
        try {
            return await this._callWithRetry(systemPrompt, userPrompt, options);
        } finally {
            this.activeRequests--;
            if (this.queue.length > 0) {
                this.queue.shift()();
            }
        }
    }

    async _callWithRetry(systemPrompt, userPrompt, options, retries = 1) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await this._callAPI(systemPrompt, userPrompt, options);
            } catch (err) {
                if (attempt === retries) throw err;
                console.warn(`[LLM] Attempt ${attempt + 1} failed, retrying...`, err.message);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    async _callAPI(systemPrompt, userPrompt, options = {}) {
        const temperature = options.temperature ?? 0.85;
        const maxTokens = options.maxTokens ?? 800;
        const timeoutMs = options.timeout ?? 15000;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature,
                    max_tokens: maxTokens,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`LLM API ${response.status}: ${text.slice(0, 200)}`);
            }

            const data = await response.json();
            let content = data.choices?.[0]?.message?.content?.trim();
            if (!content) throw new Error('LLM returned empty content');
            // 去掉思考模型的 <think>...</think> 标签，只保留正文
            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            if (!content) throw new Error('LLM returned only think tags, no actual content');
            return content;
        } finally {
            clearTimeout(timer);
        }
    }
}

// 单例
const llmService = new LLMService();

module.exports = llmService;

/**
 * 语音转文字服务 (Speech-to-Text)
 *
 * 接收音频 buffer，调用 STT API 返回转写文本
 * 支持 MiniMax STT / OpenAI Whisper 等兼容接口
 */

const fs = require('fs');
const path = require('path');

class STTService {
    constructor() {
        // STT 可复用 LLM 的 key，也可单独配置
        this.apiKey = process.env.STT_API_KEY || process.env.LLM_API_KEY || '';
        this.baseUrl = (process.env.STT_BASE_URL || process.env.LLM_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/$/, '');
        this.model = process.env.STT_MODEL || 'whisper-1';
        this.maxConcurrent = 3;
        this.activeRequests = 0;
        this.queue = [];
    }

    get isConfigured() {
        return !!this.apiKey;
    }

    /**
     * 将音频转为文字
     * @param {Buffer} audioBuffer - 音频数据
     * @param {string} mimeType - 音频 MIME 类型，如 'audio/webm'
     * @param {object} options - { timeout }
     * @returns {Promise<string>} 转写文本
     */
    async transcribe(audioBuffer, mimeType = 'audio/webm', options = {}) {
        if (!this.isConfigured) {
            throw new Error('STT not configured: missing STT_API_KEY or LLM_API_KEY');
        }

        // 并发控制
        if (this.activeRequests >= this.maxConcurrent) {
            await new Promise(resolve => this.queue.push(resolve));
        }

        this.activeRequests++;
        try {
            return await this._transcribeWithRetry(audioBuffer, mimeType, options);
        } finally {
            this.activeRequests--;
            if (this.queue.length > 0) {
                this.queue.shift()();
            }
        }
    }

    async _transcribeWithRetry(audioBuffer, mimeType, options, retries = 1) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await this._callAPI(audioBuffer, mimeType, options);
            } catch (err) {
                if (attempt === retries) throw err;
                console.warn(`[STT] Attempt ${attempt + 1} failed, retrying...`, err.message);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    async _callAPI(audioBuffer, mimeType, options = {}) {
        const timeoutMs = options.timeout ?? 30000;

        // 根据 MIME 类型确定文件扩展名
        const extMap = {
            'audio/webm': 'webm',
            'audio/ogg': 'ogg',
            'audio/wav': 'wav',
            'audio/mp3': 'mp3',
            'audio/mpeg': 'mp3',
            'audio/mp4': 'mp4',
            'audio/m4a': 'm4a',
        };
        const ext = extMap[mimeType] || 'webm';

        // 构建 multipart/form-data
        const boundary = '----STTBoundary' + Date.now();
        const parts = [];

        // file 字段
        parts.push(
            `--${boundary}\r\n`,
            `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n`,
            `Content-Type: ${mimeType}\r\n\r\n`,
        );
        const headerBuf = Buffer.from(parts.join(''));

        const modelPart = Buffer.from(
            `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${this.model}\r\n--${boundary}--\r\n`
        );

        const body = Buffer.concat([headerBuf, audioBuffer, modelPart]);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                body,
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`STT API ${response.status}: ${text.slice(0, 200)}`);
            }

            const data = await response.json();
            const text = data.text?.trim();
            if (!text) throw new Error('STT returned empty text');
            return text;
        } finally {
            clearTimeout(timer);
        }
    }
}

// 单例
const sttService = new STTService();

module.exports = sttService;

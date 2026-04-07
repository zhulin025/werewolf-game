const fs = require('fs');
const path = require('path');
const RPCClient = require('@alicloud/pop-core');

/**
 * 阿里云 Token 管理器
 * Token 有效期通常为 24 小时，需要缓存并定期刷新
 */
class AliyunTokenManager {
    constructor() {
        this.token = null;
        this.expireTime = 0;
        this.accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
        this.accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
    }

    async getToken() {
        if (!this.accessKeyId || !this.accessKeySecret) {
            throw new Error('Missing ALIYUN_ACCESS_KEY_ID or ALIYUN_ACCESS_KEY_SECRET');
        }

        // 如果仍在有效期内（提前 5 分钟刷新），直接返回缓存
        if (this.token && Date.now() < (this.expireTime * 1000 - 300000)) {
            return this.token;
        }

        console.log('[STT] Fetching new Aliyun Token...');
        const client = new RPCClient({
            accessKeyId: this.accessKeyId,
            accessKeySecret: this.accessKeySecret,
            endpoint: 'http://nls-meta.cn-shanghai.aliyuncs.com',
            apiVersion: '2019-02-28'
        });

        try {
            const result = await client.request('CreateToken', {}, { method: 'POST' });
            if (result.Token && result.Token.Id) {
                this.token = result.Token.Id;
                this.expireTime = result.Token.ExpireTime;
                return this.token;
            } else {
                throw new Error('Aliyun Token response invalid: ' + JSON.stringify(result));
            }
        } catch (err) {
            console.error('[STT] Failed to create Aliyun Token:', err.message);
            throw err;
        }
    }
}

class STTService {
    constructor() {
        this.provider = process.env.STT_PROVIDER || 'openai'; // 'openai' or 'aliyun'
        
        // OpenAI / MiniMax 配置
        this.apiKey = process.env.STT_API_KEY || process.env.LLM_API_KEY || '';
        this.baseUrl = (process.env.STT_BASE_URL || process.env.LLM_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/$/, '');
        this.model = process.env.STT_MODEL || 'whisper-1';
        
        // Aliyun 配置
        this.aliyunAppKey = process.env.ALIYUN_APP_KEY;
        this.aliyunTokenManager = new AliyunTokenManager();

        this.maxConcurrent = 3;
        this.activeRequests = 0;
        this.queue = [];
    }

    get isConfigured() {
        if (this.provider === 'aliyun') {
            const hasId = !!process.env.ALIYUN_ACCESS_KEY_ID;
            const hasSecret = !!process.env.ALIYUN_ACCESS_KEY_SECRET;
            const hasApp = !!this.aliyunAppKey;
            if (!hasId || !hasSecret || !hasApp) {
                console.warn(`[STT] Aliyun configuration incomplete: ID=${hasId}, Secret=${hasSecret}, AppKey=${hasApp}`);
            }
            return hasId && hasSecret && hasApp;
        }
        const hasKey = !!this.apiKey;
        if (!hasKey) console.warn('[STT] OpenAI/MiniMax API Key missing');
        return hasKey;
    }

    /**
     * 将音频转为文字
     * @param {Buffer} audioBuffer - 音频数据
     * @param {string} mimeType - 音频 MIME 类型
     * @param {object} options - { timeout, format, sampleRate }
     * @returns {Promise<string>} 转写文本
     */
    async transcribe(audioBuffer, mimeType = 'audio/webm', options = {}) {
        if (!this.isConfigured) {
            throw new Error(`STT not configured for provider: ${this.provider}`);
        }

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
                if (this.provider === 'aliyun') {
                    return await this._callAliyunAPI(audioBuffer, mimeType, options);
                }
                return await this._callOpenAIAPI(audioBuffer, mimeType, options);
            } catch (err) {
                if (attempt === retries) throw err;
                console.warn(`[STT] Attempt ${attempt + 1} failed, retrying...`, err.message);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    /**
     * 调用阿里云一句话识别 RESTful API
     */
    async _callAliyunAPI(audioBuffer, mimeType, options = {}) {
        const token = await this.aliyunTokenManager.getToken();
        const timeoutMs = options.timeout ?? 30000;

        // 阿里云 REST API 参数
        // 建议采样率 16000，格式支持 pcm, wav, mp3
        const format = options.format || (mimeType.includes('wav') ? 'wav' : (mimeType.includes('mp3') ? 'mp3' : 'pcm'));
        const sampleRate = options.sampleRate || 16000;

        const url = `https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr?appkey=${this.aliyunAppKey}&format=${format}&sample_rate=${sampleRate}`;
        
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-NLS-Token': token,
                    'Content-Type': 'application/octet-stream',
                },
                body: audioBuffer,
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`Aliyun STT API ${response.status}: ${text.slice(0, 200)}`);
            }

            const data = await response.json();
            if (data.status !== 20000000) {
                throw new Error(`Aliyun STT Error [${data.status}]: ${data.message}`);
            }

            const text = data.result?.trim();
            if (!text) throw new Error('Aliyun STT returned empty text');
            return text;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * 调用 OpenAI 兼容接口 (MiniMax / Whisper)
     */
    async _callOpenAIAPI(audioBuffer, mimeType, options = {}) {
        const timeoutMs = options.timeout ?? 30000;
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
        
        const boundary = '----STTBoundary' + Date.now();
        const parts = [
            `--${boundary}\r\n`,
            `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n`,
            `Content-Type: ${mimeType}\r\n\r\n`,
        ];
        const headerBuf = Buffer.from(parts.join(''));
        const modelPart = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${this.model}\r\n--${boundary}--\r\n`);
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
            return data.text?.trim() || '';
        } finally {
            clearTimeout(timer);
        }
    }
}

const sttService = new STTService();
module.exports = sttService;

/**
 * 客户端语音录入模块
 *
 * 使用浏览器内置 Web Speech API (SpeechRecognition) 实时语音转文字
 * 无需服务端 STT，无需 API Key，Chrome/Edge 原生支持
 */

const VoiceInput = {
    // 状态
    recording: false,
    recognition: null,
    finalTranscript: '',
    interimTranscript: '',
    maxDuration: 60000, // 最大录音时长 60s
    maxTimer: null,
    onStatusChange: null, // 回调: (recording: boolean) => void
    onInterimResult: null, // 回调: (text: string) => void — 实时中间结果

    /**
     * 开始语音识别
     * @returns {Promise<void>}
     */
    async startRecording() {
        if (this.recording) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            throw new Error('当前浏览器不支持语音识别，请使用 Chrome 或 Edge');
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'zh-CN';
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.finalTranscript = '';
        this.interimTranscript = '';

        this.recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    this.finalTranscript += transcript;
                } else {
                    interim += transcript;
                }
            }
            this.interimTranscript = interim;

            // 实时回调：让调用方可以显示中间结果
            if (this.onInterimResult) {
                this.onInterimResult(this.finalTranscript + interim);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('[VoiceInput] 语音识别错误:', event.error);
            // no-speech 不算致命错误，用户可能还没开始说话
            if (event.error !== 'no-speech') {
                this._cleanup();
            }
        };

        this.recognition.onend = () => {
            // 如果还在录音状态但识别意外停止，重新启动
            if (this.recording && this.recognition) {
                try {
                    this.recognition.start();
                } catch (e) {
                    // 已经在运行中，忽略
                }
            }
        };

        try {
            this.recognition.start();
        } catch (err) {
            throw new Error('无法启动语音识别：' + err.message);
        }

        this.recording = true;

        // 最大录音时长保护
        this.maxTimer = setTimeout(() => {
            if (this.recording) this.stopRecording();
        }, this.maxDuration);

        if (this.onStatusChange) this.onStatusChange(true);
    },

    /**
     * 停止语音识别（兼容旧接口，返回 Promise<Blob|null>）
     * @returns {Promise<null>}
     */
    stopRecording() {
        if (!this.recording || !this.recognition) {
            return Promise.resolve(null);
        }

        clearTimeout(this.maxTimer);

        return new Promise((resolve) => {
            // 给一个短暂延迟，让最后的识别结果回来
            const origOnEnd = this.recognition.onend;
            this.recognition.onend = () => {
                this._cleanup();
                resolve(null);
            };

            try {
                this.recognition.stop();
            } catch (e) {
                this._cleanup();
                resolve(null);
            }
        });
    },

    /**
     * 停止录音并返回转写文字
     * @returns {Promise<string>} 转写文本
     */
    async stopAndTranscribe() {
        if (!this.recording) {
            return this.finalTranscript || '';
        }

        clearTimeout(this.maxTimer);

        return new Promise((resolve) => {
            // 等待最后的结果
            const finish = () => {
                const text = (this.finalTranscript + this.interimTranscript).trim();
                this._cleanup();
                resolve(text);
            };

            if (this.recognition) {
                this.recognition.onend = () => finish();
                try {
                    this.recognition.stop();
                } catch (e) {
                    finish();
                }
            } else {
                finish();
            }
        });
    },

    /**
     * 清理资源
     */
    _cleanup() {
        this.recording = false;
        if (this.recognition) {
            try {
                this.recognition.onresult = null;
                this.recognition.onerror = null;
                this.recognition.onend = null;
                this.recognition.abort();
            } catch (e) {}
            this.recognition = null;
        }
        clearTimeout(this.maxTimer);
        if (this.onStatusChange) this.onStatusChange(false);
    },

    /**
     * 检查浏览器是否支持语音识别
     */
    isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },
};

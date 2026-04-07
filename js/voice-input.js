/**
 * 语音录入处理类
 *
 * 封装浏览器录音 (MediaRecorder) 并上传至后端 STT 接口
 */

class VoiceInput {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.stream = null;
    }

    /**
     * 检查浏览器是否支持录音和 MediaRecorder
     */
    isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    }

    /**
     * 请求麦克风权限并发起录音
     */
    async startRecording() {
        if (this.isRecording) return;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            console.log('[VoiceInput] Recording started');
        } catch (err) {
            console.error('[VoiceInput] Failed to start recording:', err);
            throw new Error('无法访问麦克风，请检查权限。');
        }
    }

    /**
     * 停止录制并返回完整的音频 Blob
     */
    async stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return null;

        return new Promise((resolve) => {
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
                this.isRecording = false;
                
                // 停止所有音频轨道释放硬件
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                }
                
                console.log('[VoiceInput] Recording stopped, blob size:', audioBlob.size);
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
        });
    }

    /**
     * 录制并上传到后端转写 (供人类玩家触发)
     */
    async stopAndTranscribe() {
        const audioBlob = await this.stopRecording();
        if (!audioBlob || audioBlob.size < 1000) return ''; // 太短忽略

        try {
            const formData = new FormData();
            // 在上传时指定文件名，后端可据此判断后缀
            formData.append('audio', audioBlob, 'recording.webm');

            const response = await fetch('/api/stt', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || '上传转写失败');
            }

            const data = await response.json();
            return data.text || '';
        } catch (err) {
            console.error('[VoiceInput] Transcribe error:', err);
            throw err;
        }
    }
}

// 单例代理
window.VoiceInput = new VoiceInput();

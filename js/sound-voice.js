// ============ SOUND SYSTEM ============
const SoundSystem = {
    enabled: true,
    ctx: null,
    ambientOsc: null,
    muted: false,

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
            this.enabled = false;
        }

        // Load sound preference
        try {
            const saved = localStorage.getItem('werewolf_sound_enabled');
            if (saved === 'false') {
                this.enabled = false;
                this.muted = true;
            }
        } catch (e) { }
    },

    toggle() {
        this.muted = !this.muted;
        this.enabled = !this.muted;
        try {
            localStorage.setItem('werewolf_sound_enabled', this.enabled);
        } catch (e) { }
        return this.enabled;
    },

    play(type) {
        if (!this.enabled || !this.ctx || this.muted) return;

        const sounds = {
            night: () => this.playNightSound(),
            day: () => this.playDaySound(),
            vote: () => this.playVoteSound(),
            death: () => this.playDeathSound(),
            click: () => this.playClickSound(),
            win: () => this.playWinSound(),
            lose: () => this.playLoseSound(),
            speak: () => this.playSpeakSound(),
            action: () => this.playTone(350, 'square', 0.25),
            wolf: () => this.playWolfSound(),
            prophet: () => this.playProphetSound(),
            guard: () => this.playGuardSound(),
            witch: () => this.playWitchSound(),
            hunter: () => this.playHunterSound(),
            button: () => this.playButtonSound(),
            voteCast: () => this.playVoteCastSound(),
            hunterShot: () => this.playHunterShotSound(),
            witchPoison: () => this.playWitchPoisonSound(),
            lastWords: () => this.playLastWordsSound()
        };

        if (sounds[type]) sounds[type]();
    },

    playNightSound() {
        // Night falls - mysterious wind
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + 1.5);

        filter.type = 'lowpass';
        filter.frequency.value = 400;

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.02, this.ctx.currentTime + 1.5);

        osc.start();
        osc.stop(this.ctx.currentTime + 1.5);
    },

    playDaySound() {
        // Day breaks - morning bells
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.frequency.value = 523; // C5
        osc2.frequency.value = 659; // E5
        osc1.type = osc2.type = 'sine';

        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1);

        osc1.start();
        osc2.start();
        osc1.stop(this.ctx.currentTime + 1);
        osc2.stop(this.ctx.currentTime + 1);
    },

    playVoteSound() {
        // Voting gong
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    },

    playVoteCastSound() {
        // Vote cast - soft thud
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    },

    playHunterShotSound() {
        // Hunter shoots - gunshot
        const osc = this.ctx.createOscillator();
        const noise = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        // Create noise buffer
        const bufferSize = this.ctx.sampleRate * 0.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noise.buffer = buffer;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

        noise.start();
    },

    playWitchPoisonSound() {
        // Witch poison - bubbling
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.frequency.value = 200;
        osc2.frequency.value = 350;
        osc1.type = 'sine';
        osc2.type = 'triangle';

        // Modulate frequency
        osc1.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc1.frequency.linearRampToValueAtTime(400, this.ctx.currentTime + 0.3);
        osc1.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.5);

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.25);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

        osc1.start();
        osc2.start();
        osc1.stop(this.ctx.currentTime + 0.5);
        osc2.stop(this.ctx.currentTime + 0.5);
    },

    playLastWordsSound() {
        // Last words - dramatic
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 1);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1);

        osc.start();
        osc.stop(this.ctx.currentTime + 1);
    },

    playClickSound() {
        // UI click - soft tick
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);
        osc.type = 'sine';

        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },

    playSpeakSound() {
        // Speaking - soft chime
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.setValueAtTime(600 + Math.random() * 200, this.ctx.currentTime);
        osc.type = 'sine';

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    },

    playButtonSound() {
        // Button click - crisp
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.setValueAtTime(1000, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(500, this.ctx.currentTime + 0.08);
        osc.type = 'square';

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
    },

    playWolfSound() {
        // Wolf reveal - mysterious
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.frequency.value = 150;
        osc2.frequency.value = 153;
        osc1.type = osc2.type = 'sine';

        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

        osc1.start();
        osc2.start();
        osc1.stop(this.ctx.currentTime + 0.5);
        osc2.stop(this.ctx.currentTime + 0.5);
    },

    playProphetSound() {
        // Prophet - ethereal
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.2);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.4);
        osc.type = 'sine';

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.4);
    },

    playGuardSound() {
        // Guard - protective
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.value = 300;
        osc.type = 'triangle';

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    },

    playWitchSound() {
        // Witch - magical
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.frequency.value = 500;
        osc2.frequency.value = 750;
        osc1.type = 'sine';
        osc2.type = 'triangle';

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

        osc1.start();
        osc2.start();
        osc1.stop(this.ctx.currentTime + 0.4);
        osc2.stop(this.ctx.currentTime + 0.4);
    },

    playHunterSound() {
        // Hunter - sharp
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.2);
        osc.type = 'sawtooth';

        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    },

    playTone(freq, type, duration, volume = 0.3) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.value = freq;
        osc.type = type;

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    playDeathSound() {
        // Creepy death sound
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.8);
        osc.type = 'sawtooth';

        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.8);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.8);
    },

    playWinSound() {
        // Victory fanfare
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'sine', 0.3, 0.3), i * 150);
        });
    },

    playLoseSound() {
        // Defeat sound
        const notes = [300, 250, 200, 150];
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'sawtooth', 0.4, 0.2), i * 200);
        });
    },

    playNightAmbient() {
        // Ambient night sound - low drone
        if (!this.enabled || !this.ctx) return;

        this.stopAmbient();

        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.frequency.value = 80;
        osc1.type = 'sine';
        osc2.frequency.value = 82;
        osc2.type = 'sine';

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 1);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 3);

        osc1.start();
        osc2.start();
        osc1.stop(this.ctx.currentTime + 3);
        osc2.stop(this.ctx.currentTime + 3);
    },

    playWolfTeam() {
        // Wolf team reveal sound - mysterious
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.3);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.6);
        osc.type = 'triangle';

        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.6);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.6);
    },

    playLastWords() {
        // Last words sound - dramatic
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 1);
        osc.type = 'sawtooth';

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1);

        osc.start();
        osc.stop(this.ctx.currentTime + 1);
    },

    playDayAmbient() {
        // Ambient day sound - bright
        if (!this.enabled || !this.ctx) return;

        this.stopAmbient();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.frequency.value = 600;
        osc.type = 'sine';

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.5);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2);

        osc.start();
        osc.stop(this.ctx.currentTime + 2);
    },

    stopAmbient() {
        // Stop any playing ambient sounds
    }
};

// ============ VOICE SYSTEM (TTS) ============
const VoiceSystem = {
    enabled: true,
    available: false,
    warmedUp: false,
    queue: [],
    isSpeaking: false,
    speechRate: 1.0,
    speechPitch: 1.0,
    chineseVoice: null,
    premiumVoice: null,
    resumeTimer: null,

    // Different voice configs for different roles
    voices: {
        narrator: { rate: 0.85, pitch: 0.8 },      // 旁白 - 低沉
        wolf: { rate: 1.1, pitch: 1.3 },         // 狼人 - 偏高
        prophet: { rate: 0.95, pitch: 1.0 },      // 预言家 - 平静
        witch: { rate: 0.9, pitch: 1.2 },        // 女巫 - 神秘
        guard: { rate: 0.95, pitch: 0.85 },     // 守卫 - 沉稳
        hunter: { rate: 1.15, pitch: 1.4 },      // 猎人 - 急促
        villager: { rate: 1.0, pitch: 1.0 },     // 村民 - 普通
        wolfKing: { rate: 1.1, pitch: 1.35 },   // 狼王 - 偏高带威压
        default: { rate: 1.0, pitch: 1.0 }
    },

    init() {
        // Check if speechSynthesis is available
        if (typeof speechSynthesis === 'undefined') {
            console.warn('Speech synthesis not supported in this browser');
            this.enabled = false;
            this.available = false;
            return;
        }
        this.available = true;

        // Load preference
        try {
            const saved = localStorage.getItem('werewolf_voice_enabled');
            if (saved === 'false') this.enabled = false;
            const rate = localStorage.getItem('werewolf_voice_rate');
            if (rate) this.speechRate = parseFloat(rate);
        } catch (e) { }

        // Wait for voices to load
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.loadVoices();
        }
        this.loadVoices();

        // Chrome bug workaround: periodically call resume() to prevent
        // speechSynthesis from pausing after ~15 seconds
        this.resumeTimer = setInterval(() => {
            if (speechSynthesis.speaking && !speechSynthesis.paused) {
                speechSynthesis.pause();
                speechSynthesis.resume();
            }
        }, 5000);
    },

    // Must be called from a user gesture (click) to unlock speechSynthesis
    warmup() {
        if (!this.available || this.warmedUp) return;
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        u.rate = 10;
        speechSynthesis.speak(u);
        speechSynthesis.cancel();
        this.warmedUp = true;
        console.log('VoiceSystem warmed up from user gesture');
    },

    loadVoices() {
        if (!this.available) return;
        const voices = speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return;

        // Find best Chinese voice
        this.chineseVoice = voices.find(v =>
            v.lang.includes('zh') && (v.lang.includes('CN') || v.lang.includes('Hans'))
        ) || voices.find(v => v.lang.includes('zh')) || voices[0];

        // Try to find a higher quality voice
        this.premiumVoice = voices.find(v =>
            v.name.includes('Premium') || v.name.includes('Enhanced') || v.name.includes('Siri')
        );

        console.log('Voice loaded:', this.chineseVoice ? this.chineseVoice.name : 'none');
    },

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) this.stop();
        try {
            localStorage.setItem('werewolf_voice_enabled', this.enabled);
        } catch (e) { }
        return this.enabled;
    },

    setRate(rate) {
        this.speechRate = rate;
        try {
            localStorage.setItem('werewolf_voice_rate', rate.toString());
        } catch (e) { }
    },

    stop() {
        if (!this.available) return;
        this.isSpeaking = false;
        this.queue = [];
        speechSynthesis.cancel();
    },

    // Speak text with a specific role voice
    speak(text, role = 'default', interrupt = false) {
        if (!this.available || !this.enabled || !text) return;
        if (interrupt) this.stop();

        text = this.cleanText(text);
        if (!text) return;

        // Try to get voices if not loaded yet
        if (!this.chineseVoice) {
            this.loadVoices();
            if (!this.chineseVoice) {
                console.warn('No voices available, skipping speech');
                return;
            }
        }

        const voiceConfig = this.voices[role] || this.voices.default;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = voiceConfig.rate * this.speechRate;
        utterance.pitch = voiceConfig.pitch;
        utterance.volume = 0.9;
        utterance.voice = this.chineseVoice;

        utterance.onend = () => this.onSpeechEnd();
        utterance.onerror = (e) => {
            if (e.error !== 'canceled') {
                console.warn('Speech error:', e.error, 'text:', text.substring(0, 20));
                this.onSpeechEnd();
            }
            // 'canceled' is from intentional interrupt — do NOT reset state
        };

        if (this.isSpeaking) {
            this.queue.push(utterance);
        } else {
            this.isSpeaking = true;
            speechSynthesis.speak(utterance);
        }
    },

    // Process queue after speech ends
    onSpeechEnd() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            this.isSpeaking = true;
            speechSynthesis.speak(next);
        } else {
            this.isSpeaking = false;
        }
    },

    // Clean text for speech
    cleanText(text) {
        text = text
            .replace(/🐺|🐱|🔮|💀|⚔️|👑|🛡️|💊|🌙|☀️|🎯|⚡|🔥|⚖️|🏹|☠️/g, '')
            .replace(/\.\.\./g, '。')
            .replace(/\./g, '。')
            .replace(/,/g, '，')
            .replace(/（/g, '(')
            .replace(/）/g, ')')
            .replace(/号/g, '号 ')
            .replace(/\s+/g, ' ')
            .trim();
        return text;
    },

    // Announce phase change (narrator voice)
    announce(text) {
        this.speak(text, 'narrator', true);
    },

    // Speak as a player role
    speakAs(text, role) {
        const roleMap = {
            'wolf': 'wolf',
            'wolf_king': 'wolfKing',
            'prophet': 'prophet',
            'witch': 'witch',
            'guard': 'guard',
            'hunter': 'hunter',
            'villager': 'villager'
        };
        const voiceKey = roleMap[role.toLowerCase()] || 'default';
        this.speak(text, voiceKey);
    }
};


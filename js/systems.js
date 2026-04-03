// ============ REPLAY SYSTEM (stub) ============
const replaySystem = {
    recordings: [],
    currentRecording: null,
    startRecording(gameId) { this.currentRecording = { gameId, events: [], startTime: Date.now() }; },
    recordPlayers(players) { if (this.currentRecording) this.currentRecording.players = players.map(p => ({ ...p })); },
    recordEvent(type, payload) { if (this.currentRecording) this.currentRecording.events.push({ type, payload, time: Date.now() }); },
    stopRecording() {
        if (!this.currentRecording) return;
        const rec = this.currentRecording;
        rec.duration = Date.now() - rec.startTime;
        rec.totalEvents = rec.events.length;
        this.recordings.unshift(rec);
        if (this.recordings.length > 20) this.recordings.pop();
        this.currentRecording = null;
        try { localStorage.setItem('werewolf_recordings', JSON.stringify(this.recordings.map(r => ({ gameId: r.gameId, duration: r.duration, totalEvents: r.totalEvents })))); } catch (e) {}
    },
    getRecordings() {
        try { const d = localStorage.getItem('werewolf_recordings'); return d ? JSON.parse(d) : []; } catch (e) { return []; }
    },
    formatDuration(ms) { if (!ms) return '-'; const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}分${s % 60}秒`; },
    playReplay(gameId, opts) { showToast('回放功能开发中'); },
    deleteRecording(gameId) {
        try { let recs = this.getRecordings().filter(r => r.gameId !== gameId); localStorage.setItem('werewolf_recordings', JSON.stringify(recs)); } catch (e) {}
    },
    clearAllRecordings() { localStorage.removeItem('werewolf_recordings'); this.recordings = []; }
};

// ============ STATS SYSTEM ============
class StatsSystem {
    constructor() {
        this.stats = this.loadStats();
    }

    loadStats() {
        try {
            const data = localStorage.getItem('werewolf_stats');
            return data ? JSON.parse(data) : this.getDefaultStats();
        } catch (e) {
            return this.getDefaultStats();
        }
    }

    getDefaultStats() {
        return {
            totalGames: 0, wins: 0, losses: 0,
            VILLAGER: { played: 0, wins: 0 },
            PROPHET: { played: 0, wins: 0 },
            WITCH: { played: 0, wins: 0 },
            GUARD: { played: 0, wins: 0 },
            HUNTER: { played: 0, wins: 0 },
            WOLF: { played: 0, wins: 0 },
            WOLF_KING: { played: 0, wins: 0 },
            longestGame: 0,
            fastestWin: Infinity,
            favoriteRole: null
        };
    }

    saveStats() {
        try {
            localStorage.setItem('werewolf_stats', JSON.stringify(this.stats));
        } catch (e) {}
    }

    recordGame(result) {
        const s = this.stats;
        s.totalGames++;
        if (result.won) s.wins++; else s.losses++;

        const roleKey = result.role;
        if (roleKey && s[roleKey]) {
            s[roleKey].played++;
            if (result.won) s[roleKey].wins++;
        }

        if (result.day > s.longestGame) s.longestGame = result.day;
        if (result.won && result.day < s.fastestWin) s.fastestWin = result.day;

        this.updateFavoriteRole();
        this.saveStats();
    }

    updateFavoriteRole() {
        let maxPlayed = 0, favorite = null;
        for (const [key, val] of Object.entries(this.stats)) {
            if (typeof val === 'object' && val.played > maxPlayed) {
                maxPlayed = val.played;
                favorite = key;
            }
        }
        this.stats.favoriteRole = favorite;
    }

    getWinRate() {
        if (this.stats.totalGames === 0) return 0;
        return Math.round((this.stats.wins / this.stats.totalGames) * 100);
    }

    getRoleWinRate(role) {
        const data = this.stats[role];
        if (!data || data.played === 0) return 0;
        return Math.round((data.wins / data.played) * 100);
    }

    getSummary() {
        return {
            totalGames: this.stats.totalGames,
            winRate: this.getWinRate(),
            longestGame: this.stats.longestGame > 0 ? `${this.stats.longestGame}天` : '-',
            fastestWin: this.stats.fastestWin === Infinity ? '-' : `${this.stats.fastestWin}天`
        };
    }

    resetStats() {
        this.stats = this.getDefaultStats();
        this.saveStats();
    }
}
const statsSystem = new StatsSystem();

// ============ LEADERBOARD SYSTEM ============
class LeaderboardSystem {
    constructor() {
        this.leaderboard = this.loadLeaderboard();
    }

    loadLeaderboard() {
        try {
            const data = localStorage.getItem('werewolf_leaderboard');
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    }

    saveLeaderboard() {
        try {
            localStorage.setItem('werewolf_leaderboard', JSON.stringify(this.leaderboard));
        } catch (e) {}
    }

    addRecord(playerName, result) {
        const record = {
            id: Date.now(), playerName,
            role: result.role || 'unknown',
            result: result.winner,
            camp: result.camp,
            day: result.day || 1,
            timestamp: Date.now()
        };
        this.leaderboard.unshift(record);
        if (this.leaderboard.length > 100) this.leaderboard.pop();
        this.saveLeaderboard();
        return record;
    }

    getLeaderboard(type = 'all', limit = 10) {
        let filtered = [...this.leaderboard];
        if (type === 'wins') filtered = filtered.filter(r => r.result === 'win');
        else if (type === 'good') filtered = filtered.filter(r => r.camp === 'good');
        else if (type === 'wolf') filtered = filtered.filter(r => r.camp === 'wolf');
        return filtered.slice(0, limit);
    }

    getStats() {
        const total = this.leaderboard.length;
        const wins = this.leaderboard.filter(r => r.result === 'win').length;
        const avgDay = total > 0
            ? (this.leaderboard.reduce((sum, r) => sum + r.day, 0) / total).toFixed(1) : 0;
        return {
            total, wins,
            winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
            avgDay
        };
    }

    clear() {
        this.leaderboard = [];
        this.saveLeaderboard();
    }

    exportAsText() {
        const stats = this.getStats();
        const lines = [
            '🐺 AI狼人杀战绩报告', '====================',
            `总场次: ${stats.total}`, `胜利: ${stats.wins}`, `胜率: ${stats.winRate}%`,
            '', '最近10场战绩:',
            ...this.leaderboard.slice(0, 10).map((r, i) =>
                `${i + 1}. ${r.playerName} - ${r.role} - ${r.result === 'win' ? '胜' : '负'} (第${r.day}天)`)
        ];
        return lines.join('\n');
    }
}
const leaderboardSystem = new LeaderboardSystem();

// ============ SKIN / THEME SYSTEM ============
const skinSystem = {
    themes: {
        dark_purple: {
            name: '🌙 暗夜',
            colors: {
                '--primary': '#6c5ce7', '--secondary': '#00cec9', '--accent': '#ff6b6b',
                '--bg': '#1a0a2e', '--surface': '#2d1b4e', '--surface-light': '#3d2b5e',
                '--text': '#ffffff', '--text-muted': '#a0a0c0',
                '--wolf': '#e74c3c', '--god': '#9b59b6', '--villager': '#3498db',
            },
            preview: 'linear-gradient(135deg, #1a0a2e, #2d1b4e)',
        },
        blood_moon: {
            name: '🌅 血月',
            colors: {
                '--primary': '#c0392b', '--secondary': '#e67e22', '--accent': '#e74c3c',
                '--bg': '#1a0505', '--surface': '#2d1010', '--surface-light': '#3d1a1a',
                '--text': '#f5e6e0', '--text-muted': '#c09080',
                '--wolf': '#ff4444', '--god': '#e67e22', '--villager': '#e08050',
            },
            preview: 'linear-gradient(135deg, #1a0505, #3d1a1a)',
        },
        forest: {
            name: '🌿 森林',
            colors: {
                '--primary': '#27ae60', '--secondary': '#2ecc71', '--accent': '#e74c3c',
                '--bg': '#0a1a0f', '--surface': '#1b2d1f', '--surface-light': '#2b3d2f',
                '--text': '#e0f5e8', '--text-muted': '#80c0a0',
                '--wolf': '#c0392b', '--god': '#8e44ad', '--villager': '#2980b9',
            },
            preview: 'linear-gradient(135deg, #0a1a0f, #1b2d1f)',
        },
        frost: {
            name: '❄️ 寒冬',
            colors: {
                '--primary': '#2980b9', '--secondary': '#00b4d8', '--accent': '#ff6b6b',
                '--bg': '#0a0f1a', '--surface': '#1b2535', '--surface-light': '#2b3545',
                '--text': '#e0f0ff', '--text-muted': '#80a0c0',
                '--wolf': '#e74c3c', '--god': '#9b59b6', '--villager': '#3498db',
            },
            preview: 'linear-gradient(135deg, #0a0f1a, #1b2535)',
        },
        light: {
            name: '☀️ 白天',
            colors: {
                '--primary': '#5b4cdb', '--secondary': '#00a896', '--accent': '#e74c3c',
                '--bg': '#f0f0f5', '--surface': '#ffffff', '--surface-light': '#e8e8f0',
                '--text': '#1a1a2e', '--text-muted': '#6060a0',
                '--wolf': '#c0392b', '--god': '#8e44ad', '--villager': '#2980b9',
            },
            preview: 'linear-gradient(135deg, #f0f0f5, #e8e8f0)',
        },
    },
    currentSkin: 'dark_purple',

    init() {
        try {
            const saved = localStorage.getItem('werewolf_skin');
            if (saved && this.themes[saved]) {
                this.currentSkin = saved;
                this.applyThemeVars(saved);
            }
        } catch (e) { }
    },

    getAvailableSkins() {
        return Object.entries(this.themes).map(([id, t]) => ({ id, name: t.name }));
    },

    applySkin(id) {
        if (!this.themes[id]) return;
        this.currentSkin = id;
        this.applyThemeVars(id);
        try { localStorage.setItem('werewolf_skin', id); } catch (e) { }
    },

    applyThemeVars(id) {
        const colors = this.themes[id].colors;
        const root = document.documentElement;
        for (const [prop, val] of Object.entries(colors)) {
            root.style.setProperty(prop, val);
        }
    },
};
skinSystem.init();


/**
 * 游戏录像回放系统
 */

class ReplaySystem {
    constructor() {
        this.recordings = [];
        this.currentRecording = null;
    }

    // 开始录制
    startRecording(gameId) {
        this.currentRecording = {
            gameId,
            startTime: Date.now(),
            events: [],
            players: [],
            settings: {}
        };
        console.log(`[Replay] 开始录制游戏 ${gameId}`);
    }

    // 记录事件
    recordEvent(type, payload) {
        if (!this.currentRecording) return;

        this.currentRecording.events.push({
            type,
            payload,
            timestamp: Date.now() - this.currentRecording.startTime
        });
    }

    // 记录玩家初始状态
    recordPlayers(players) {
        if (!this.currentRecording) return;
        this.currentRecording.players = players.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            roleName: p.roleName,
            camp: p.camp
        }));
    }

    // 结束录制
    endRecording() {
        if (!this.currentRecording) return null;

        const recording = { ...this.currentRecording };
        recording.duration = Date.now() - this.currentRecording.startTime;
        recording.totalEvents = recording.events.length;

        // 保存到本地存储
        this.saveRecording(recording);

        console.log(`[Replay] 录制结束，共${recording.totalEvents}个事件，时长${this.formatDuration(recording.duration)}`);

        this.currentRecording = null;
        return recording;
    }

    // 保存到本地
    saveRecording(recording) {
        try {
            const recordings = this.getRecordings();
            recordings.unshift(recording);
            // 只保留最近10场
            if (recordings.length > 10) {
                recordings.pop();
            }
            localStorage.setItem('werewolf_recordings', JSON.stringify(recordings));
        } catch (e) {
            console.error('[Replay] 保存失败:', e);
        }
    }

    // 获取所有录像
    getRecordings() {
        try {
            const data = localStorage.getItem('werewolf_recordings');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    // 播放录像
    async playReplay(recordingId, gameInstance) {
        const recordings = this.getRecordings();
        const recording = recordings.find(r => r.gameId === recordingId);

        if (!recording) {
            console.error('[Replay] 录像不存在');
            return false;
        }

        console.log(`[Replay] 开始播放录像 ${recordingId}`);

        // 重置游戏状态
        gameInstance.reset();

        // 设置玩家
        gameInstance.players = recording.players.map(p => ({
            ...p,
            isAlive: true,
            isAI: true
        }));

        // 逐事件回放
        for (const event of recording.events) {
            await this.replayEvent(event, gameInstance);
            await this.delay(500 / gameInstance.speed); // 根据速度调整
        }

        console.log('[Replay] 录像播放完毕');
        return true;
    }

    // 回放单个事件
    async replayEvent(event, gameInstance) {
        switch (event.type) {
            case 'game_start':
                addLog('🐺 游戏开始！', 'system');
                break;

            case 'night_start':
                addLog(`🌙 第${event.payload.day}夜降临`, 'night');
                break;

            case 'player_action':
                addLog(`${event.payload.player} ${event.payload.action}`, 'night');
                break;

            case 'death':
                addLog(`💀 ${event.payload.player}（${event.payload.role}）死亡`, 'death');
                break;

            case 'speak':
                addLog(`💬 ${event.payload.player}：${event.payload.content}`, 'speak');
                break;

            case 'vote':
                addLog(`🗳️ ${event.payload.voter} 投了 ${event.payload.target}`, 'vote');
                break;

            case 'game_end':
                addLog(`🎉 游戏结束，${event.payload.winner}胜利！`, 'system');
                break;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        return `${minutes}分${seconds % 60}秒`;
    }

    // 删除录像
    deleteRecording(gameId) {
        const recordings = this.getRecordings().filter(r => r.gameId !== gameId);
        localStorage.setItem('werewolf_recordings', JSON.stringify(recordings));
    }

    // 清除所有录像
    clearAllRecordings() {
        localStorage.removeItem('werewolf_recordings');
    }
}

// 战绩统计系统
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
            totalGames: 0,
            wins: 0,
            losses: 0,
            asVillager: { played: 0, wins: 0 },
            asProphet: { played: 0, wins: 0 },
            asWitch: { played: 0, wins: 0 },
            asGuard: { played: 0, wins: 0 },
            asHunter: { played: 0, wins: 0 },
            asWolf: { played: 0, wins: 0 },
            asWolfKing: { played: 0, wins: 0 },
            mostKilledByWolf: 0,
            mostSavedByWitch: 0,
            longestGame: 0,
            fastestWin: Infinity,
            favoriteRole: null
        };
    }

    saveStats() {
        try {
            localStorage.setItem('werewolf_stats', JSON.stringify(this.stats));
        } catch (e) {
            console.error('[Stats] 保存失败:', e);
        }
    }

    // 记录游戏结果
    recordGame(result) {
        const stats = this.stats;

        stats.totalGames++;
        if (result.winner === 'good') {
            stats.wins++;
        } else {
            stats.losses++;
        }

        // 统计各角色战绩
        if (result.playerRole && stats[result.playerRole]) {
            stats[result.playerRole].played++;
            if (result.winner === (result.playerCamp || 'good')) {
                stats[result.playerRole].wins++;
            }
        }

        // 最长游戏
        if (result.duration > stats.longestGame) {
            stats.longestGame = result.duration;
        }

        // 最快胜利
        if (result.winner === 'good' && result.duration < stats.fastestWin) {
            stats.fastestWin = result.duration;
        }

        // 最多被杀
        if (result.timesKilledByWolf > stats.mostKilledByWolf) {
            stats.mostKilledByWolf = result.timesKilledByWolf;
        }

        // 最多救人
        if (result.timesSavedByWitch > stats.mostSavedByWitch) {
            stats.mostSavedByWitch = result.timesSavedByWitch;
        }

        // 最常用角色
        this.updateFavoriteRole();

        this.saveStats();
    }

    updateFavoriteRole() {
        let maxPlayed = 0;
        let favorite = null;

        for (const [role, data] of Object.entries(this.stats)) {
            if (typeof data === 'object' && data.played > maxPlayed) {
                maxPlayed = data.played;
                favorite = role;
            }
        }

        this.stats.favoriteRole = favorite;
    }

    // 获取胜率
    getWinRate() {
        if (this.stats.totalGames === 0) return 0;
        return Math.round((this.stats.wins / this.stats.totalGames) * 100);
    }

    // 获取角色胜率
    getRoleWinRate(role) {
        const data = this.stats[role];
        if (!data || data.played === 0) return 0;
        return Math.round((data.wins / data.played) * 100);
    }

    // 获取统计摘要
    getSummary() {
        return {
            totalGames: this.stats.totalGames,
            winRate: this.getWinRate(),
            favoriteRole: this.stats.favoriteRole,
            longestGame: this.formatDuration(this.stats.longestGame),
            fastestWin: this.stats.fastestWin === Infinity ? '-' : this.formatDuration(this.stats.fastestWin)
        };
    }

    formatDuration(ms) {
        if (ms === 0 || ms === Infinity) return '-';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        return `${minutes}分${seconds % 60}秒`;
    }

    // 重置统计
    resetStats() {
        this.stats = this.getDefaultStats();
        this.saveStats();
    }
}

// 创建全局实例
const replaySystem = new ReplaySystem();
const statsSystem = new StatsSystem();

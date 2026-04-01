/**
 * 排行榜系统 - 本地战绩排行榜
 */

class LeaderboardSystem {
    constructor() {
        this.leaderboard = this.loadLeaderboard();
    }

    loadLeaderboard() {
        try {
            const data = localStorage.getItem('werewolf_leaderboard');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    saveLeaderboard() {
        try {
            localStorage.setItem('werewolf_leaderboard', JSON.stringify(this.leaderboard));
        } catch (e) {
            console.error('Failed to save leaderboard:', e);
        }
    }

    // 添加记录
    addRecord(playerName, result) {
        const record = {
            id: Date.now(),
            playerName,
            role: result.role || 'unknown',
            result: result.winner,
            camp: result.camp,
            day: result.day || 1,
            duration: result.duration || 0,
            timestamp: Date.now()
        };

        this.leaderboard.unshift(record);

        // 只保留最近100条
        if (this.leaderboard.length > 100) {
            this.leaderboard.pop();
        }

        this.saveLeaderboard();
        return record;
    }

    // 获取排行榜
    getLeaderboard(type = 'all', limit = 10) {
        let filtered = [...this.leaderboard];

        switch (type) {
            case 'wins':
                filtered = filtered.filter(r => r.result === 'win');
                break;
            case 'good':
                filtered = filtered.filter(r => r.camp === 'good');
                break;
            case 'wolf':
                filtered = filtered.filter(r => r.camp === 'wolf');
                break;
        }

        return filtered.slice(0, limit);
    }

    // 获取统计数据
    getStats() {
        const total = this.leaderboard.length;
        const wins = this.leaderboard.filter(r => r.result === 'win').length;
        const goodWins = this.leaderboard.filter(r => r.result === 'win' && r.camp === 'good').length;
        const wolfWins = this.leaderboard.filter(r => r.result === 'win' && r.camp === 'wolf').length;

        const avgDay = total > 0
            ? (this.leaderboard.reduce((sum, r) => sum + r.day, 0) / total).toFixed(1)
            : 0;

        return {
            total,
            wins,
            winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
            goodWins,
            wolfWins,
            avgDay
        };
    }

    // 清除排行榜
    clear() {
        this.leaderboard = [];
        this.saveLeaderboard();
    }

    // 导出战绩为文本
    exportAsText() {
        const stats = this.getStats();
        const lines = [
            '🐺 AI狼人杀战绩报告',
            '====================',
            `总场次: ${stats.total}`,
            `胜利: ${stats.wins}`,
            `胜率: ${stats.winRate}%`,
            `好人胜利: ${stats.goodWins}`,
            `狼人胜利: ${stats.wolfWins}`,
            `平均存活天数: ${stats.avgDay}`,
            '',
            '最近10场战绩:',
            ...this.leaderboard.slice(0, 10).map((r, i) =>
                `${i + 1}. ${r.playerName} - ${r.role} - ${r.result === 'win' ? '胜' : '负'} (第${r.day}天)`
            )
        ];

        return lines.join('\n');
    }
}

// 创建全局实例
const leaderboardSystem = new LeaderboardSystem();

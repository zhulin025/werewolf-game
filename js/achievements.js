/**
 * 成就系统 - 解锁奖励和里程碑
 */

const Achievements = {
    // 成就定义
    list: {
        first_game: {
            id: 'first_game',
            name: '初次见面',
            desc: '完成第一场游戏',
            icon: '🎮',
            condition: (stats) => stats.totalGames >= 1
        },
        games_10: {
            id: 'games_10',
            name: '常客',
            desc: '完成10场游戏',
            icon: '🎯',
            condition: (stats) => stats.totalGames >= 10
        },
        games_50: {
            id: 'games_50',
            name: '老手',
            desc: '完成50场游戏',
            icon: '🏆',
            condition: (stats) => stats.totalGames >= 50
        },
        first_win: {
            id: 'first_win',
            name: '首胜',
            desc: '获得第一场胜利',
            icon: '🌟',
            condition: (stats) => stats.wins >= 1
        },
        win_streak_3: {
            id: 'win_streak_3',
            name: '三连胜',
            desc: '连续获得3场胜利',
            icon: '🔥',
            condition: (stats) => stats.winStreak >= 3
        },
        win_streak_5: {
            id: 'win_streak_5',
            name: '五连胜',
            desc: '连续获得5场胜利',
            icon: '⚡',
            condition: (stats) => stats.winStreak >= 5
        },
        win_rate_60: {
            id: 'win_rate_60',
            name: '胜率达人',
            desc: '总胜率达到60%',
            icon: '📈',
            condition: (stats) => stats.totalGames >= 10 && (stats.wins / stats.totalGames) >= 0.6
        },
        wolf_slayer: {
            id: 'wolf_slayer',
            name: '猎狼者',
            desc: '作为好人阵营投出4只狼人',
            icon: '🐺',
            condition: (stats) => stats.wolvesKilled >= 4
        },
        survivor: {
            id: 'survivor',
            name: '幸存者',
            desc: '作为村民存活到最后',
            icon: '🛡️',
            condition: (stats) => stats.timesSurvivedAsVillager >= 1
        },
        prophet_king: {
            id: 'prophet_king',
            name: '预言之王',
            desc: '作为预言家查验准确率超过80%',
            icon: '🔮',
            condition: (stats) => stats.prophetChecks >= 5 && (stats.prophetCorrect / stats.prophetChecks) >= 0.8
        },
        witch_power: {
            id: 'witch_power',
            name: '药水大师',
            desc: '女巫连续3场救人',
            icon: '🧪',
            condition: (stats) => stats.witchSaves >= 3
        },
        hunter_trail: {
            id: 'hunter_trail',
            name: '神射手',
            desc: '猎人连续3场开枪带走狼人',
            icon: '🏹',
            condition: (stats) => stats.hunterKills >= 3
        },
        wolf_pack: {
            id: 'wolf_pack',
            name: '狼群之王',
            desc: '狼人阵营获得5连胜',
            icon: '👑',
            condition: (stats) => stats.wolfWinStreak >= 5
        },
        speed_demon: {
            id: 'speed_demon',
            name: '速战速决',
            desc: '在第3天之前结束游戏',
            icon: '⚡',
            condition: (stats) => stats.fastWins >= 1
        },
        marathon: {
            id: 'marathon',
            name: '马拉松',
            desc: '进行一场超过10分钟的游戏',
            icon: '🏃',
            condition: (stats) => stats.longestGame >= 600000 // 10分钟
        },
        collector: {
            id: 'collector',
            name: '收藏家',
            desc: '解锁所有皮肤',
            icon: '🎨',
            condition: () => {
                const unlocked = JSON.parse(localStorage.getItem('werewolf_unlocked_skins') || '[]');
                return unlocked.length >= 6;
            }
        }
    },

    // 玩家已解锁的成就
    unlocked: new Set(JSON.parse(localStorage.getItem('werewolf_achievements') || '[]')),

    // 检查新成就
    check(stats) {
        const newAchievements = [];

        for (const [id, achievement] of Object.entries(this.list)) {
            if (!this.unlocked.has(id) && achievement.condition(stats)) {
                this.unlocked.add(id);
                newAchievements.push(achievement);
            }
        }

        if (newAchievements.length > 0) {
            this.save();
            this.showNotification(newAchievements);
        }

        return newAchievements;
    },

    // 保存成就
    save() {
        localStorage.setItem('werewolf_achievements', JSON.stringify([...this.unlocked]));
    },

    // 显示通知
    showNotification(achievements) {
        achievements.forEach((achievement, index) => {
            setTimeout(() => {
                this.createAchievementPopup(achievement);
            }, index * 2000);
        });
    },

    createAchievementPopup(achievement) {
        const popup = document.createElement('div');
        popup.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #2d1b4e, #1a0a2e);
            border: 2px solid #ffd700;
            border-radius: 16px;
            padding: 20px 24px;
            display: flex;
            align-items: center;
            gap: 16px;
            z-index: 10000;
            animation: slideInRight 0.5s ease, fadeOut 0.5s ease 3s forwards;
            box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
        `;

        popup.innerHTML = `
            <div style="font-size: 48px;">${achievement.icon}</div>
            <div>
                <div style="font-family: 'Orbitron', sans-serif; color: #ffd700; font-size: 14px; margin-bottom: 4px;">
                    成就解锁
                </div>
                <div style="color: white; font-size: 16px; font-weight: 600;">
                    ${achievement.name}
                </div>
                <div style="color: rgba(255,255,255,0.6); font-size: 12px;">
                    ${achievement.desc}
                </div>
            </div>
        `;

        document.body.appendChild(popup);

        // 添加动画样式
        if (!document.getElementById('achievementAnimations')) {
            const style = document.createElement('style');
            style.id = 'achievementAnimations';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeOut {
                    to { opacity: 0; transform: translateX(100%); }
                }
            `;
            document.head.appendChild(style);
        }

        setTimeout(() => popup.remove(), 4000);
    },

    // 获取已解锁成就列表
    getUnlockedList() {
        return [...this.unlocked].map(id => ({
            ...this.list[id],
            unlocked: true
        }));
    },

    // 获取所有成就列表
    getAllList() {
        return Object.values(this.list).map(a => ({
            ...a,
            unlocked: this.unlocked.has(a.id)
        }));
    },

    // 获取成就进度
    getProgress() {
        const total = Object.keys(this.list).length;
        const unlocked = this.unlocked.size;
        return {
            unlocked,
            total,
            percentage: Math.round((unlocked / total) * 100)
        };
    },

    // 重置成就
    reset() {
        this.unlocked.clear();
        this.save();
    }
};

// 成就追踪器
class AchievementTracker {
    constructor() {
        this.reset();
    }

    reset() {
        this.data = {
            totalGames: 0,
            wins: 0,
            losses: 0,
            winStreak: 0,
            wolfWinStreak: 0,
            wolvesKilled: 0,
            timesSurvivedAsVillager: 0,
            prophetChecks: 0,
            prophetCorrect: 0,
            witchSaves: 0,
            hunterKills: 0,
            fastWins: 0,
            longestGame: 0
        };
    }

    // 游戏结束记录
    recordGameEnd(result) {
        this.data.totalGames++;
        this.data.longestGame = Math.max(this.data.longestGame, result.duration);

        if (result.winner === 'good') {
            this.data.wins++;
            this.data.winStreak++;
            this.data.wolfWinStreak = 0;
        } else {
            this.data.losses++;
            this.data.winStreak = 0;
            this.data.wolfWinStreak++;
        }

        // 快速胜利
        if (result.day <= 3 && result.winner === 'good') {
            this.data.fastWins++;
        }

        // 检查成就
        const newAchievements = Achievements.check(this.data);

        return newAchievements;
    }

    // 记录狼人被投
    recordWolfKilled() {
        this.data.wolvesKilled++;
    }

    // 记录村民存活
    recordVillagerSurvived() {
        this.data.timesSurvivedAsVillager++;
    }

    // 记录预言家查验
    recordProphetCheck(correct) {
        this.data.prophetChecks++;
        if (correct) this.data.prophetCorrect++;
    }

    // 记录女巫救人
    recordWitchSave() {
        this.data.witchSaves++;
    }

    // 记录猎人杀狼
    recordHunterKillWolf() {
        this.data.hunterKills++;
    }
}

// 全局实例
const achievementTracker = new AchievementTracker();

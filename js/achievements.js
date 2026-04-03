// ============ ACHIEVEMENTS SYSTEM ============
const Achievements = {
    list: [
        // 游戏参与
        { id: 'first_game', name: '初来乍到', desc: '完成第一局游戏', icon: '🎮', unlocked: false },
        { id: 'survive_night', name: '活过第一夜', desc: '在游戏中活过第一夜', icon: '🌙', unlocked: false },
        { id: 'survive_3days', name: '苟活三天', desc: '存活达到3天', icon: '⏳', unlocked: false },

        // 胜利成就
        { id: 'good_win', name: '好人胜利', desc: '好人阵营获得胜利', icon: '🏆', unlocked: false },
        { id: 'wolf_win', name: '狼人胜利', desc: '狼人阵营获得胜利', icon: '🐺', unlocked: false },
        { id: 'first_win', name: '首胜', desc: '获得第一次胜利', icon: '⭐', unlocked: false },

        // 角色成就
        { id: 'prophet_check', name: '预言查验', desc: '使用预言家查验功能', icon: '🔮', unlocked: false },
        { id: 'witch_save', name: '生死人肉白骨', desc: '女巫使用解药救人', icon: '💊', unlocked: false },
        { id: 'witch_poison', name: '毒家本领', desc: '女巫使用毒药击杀狼人', icon: '☠️', unlocked: false },
        { id: 'guard_protect', name: '铜墙铁壁', desc: '守卫连续3晚守护成功', icon: '🛡️', unlocked: false },
        { id: 'hunter_shoot', name: '枪打出头鸟', desc: '猎人开枪带走狼人', icon: '🏹', unlocked: false },

        // 特殊成就
        { id: 'peaceful_night', name: '平安夜', desc: '夜晚无人死亡', icon: '😌', unlocked: false },
        { id: 'wolf_king_kill', name: '狼王风范', desc: '狼王带走猎人', icon: '👑', unlocked: false },
        { id: 'double_kill', name: '双杀', desc: '一晚击杀两名玩家', icon: '⚔️', unlocked: false },

        // 游戏次数
        { id: 'play_5', name: '常客', desc: '完成5局游戏', icon: '🎯', unlocked: false },
        { id: 'play_10', name: '老手', desc: '完成10局游戏', icon: '🎰', unlocked: false },
        { id: 'play_20', name: '专家', desc: '完成20局游戏', icon: '🎲', unlocked: false },

        // 连胜
        { id: 'win_streak_3', name: '三连胜', desc: '获得3连胜', icon: '🔥', unlocked: false },
        { id: 'win_streak_5', name: '五连胜', desc: '获得5连胜', icon: '💥', unlocked: false }
    ],

    init() {
        try {
            const saved = localStorage.getItem('werewolf_achievements');
            if (saved) {
                const savedIds = JSON.parse(saved);
                this.list.forEach(a => {
                    a.unlocked = savedIds.includes(a.id);
                });
            }
        } catch (e) { }
    },

    unlock(id) {
        const achievement = this.list.find(a => a.id === id);
        if (achievement && !achievement.unlocked) {
            achievement.unlocked = true;
            this.save();
            this.showNotification(achievement);
        }
    },

    save() {
        try {
            const unlockedIds = this.list.filter(a => a.unlocked).map(a => a.id);
            localStorage.setItem('werewolf_achievements', JSON.stringify(unlockedIds));
        } catch (e) { }
    },

    showNotification(achievement) {
        // Show achievement notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, rgba(45, 27, 78, 0.98), rgba(20, 10, 40, 0.98));
            padding: 16px 24px;
            border-radius: 12px;
            border: 2px solid #ffd700;
            box-shadow: 0 0 30px rgba(255, 215, 0, 0.4);
            z-index: 3000;
            animation: achievementSlideIn 0.5s ease, achievementSlideOut 0.5s ease 3s forwards;
        `;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 32px;">${achievement.icon}</span>
                <div>
                    <div style="color: #ffd700; font-weight: bold; font-size: 14px;">成就解锁!</div>
                    <div style="color: #fff; font-size: 13px;">${achievement.name}</div>
                    <div style="color: rgba(255,255,255,0.6); font-size: 11px;">${achievement.desc}</div>
                </div>
            </div>
        `;
        document.body.appendChild(notification);

        // Play sound
        SoundSystem.play('action');

        // Remove after animation
        setTimeout(() => notification.remove(), 3500);
    },

    getProgress() {
        const unlocked = this.list.filter(a => a.unlocked).length;
        return { unlocked, total: this.list.length };
    },

    reset() {
        this.list.forEach(a => a.unlocked = false);
        this.save();
    }
};

// Init achievements
Achievements.init();

/**
 * 新手教程系统
 */

class TutorialSystem {
    constructor() {
        this.currentStep = 0;
        this.steps = [];
        this.enabled = true;
    }

    // 教程步骤定义
    getTutorialSteps() {
        return [
            {
                id: 'welcome',
                title: '🐺 欢迎来到AI狼人杀',
                content: '这是一个AI与人类玩家共同参与的战略游戏。让我来教你基本玩法！',
                highlight: '.start-screen',
                position: 'center'
            },
            {
                id: 'game_mode',
                title: '🎮 选择游戏模式',
                content: '选择一个游戏模式。12人标准局是最完整的玩法，推荐新手从6人局开始！',
                highlight: '.game-mode-selector',
                position: 'bottom'
            },
            {
                id: 'start_btn',
                title: '▶️ 开始游戏',
                content: '点击这里开始你的第一场游戏！',
                highlight: '.start-btn',
                position: 'top'
            },
            {
                id: 'player_cards',
                title: '👥 玩家布局',
                content: '所有玩家以圆形布局显示。每个卡片代表一名玩家，包括编号、名称和存活状态。',
                highlight: '.players-ring',
                position: 'center'
            },
            {
                id: 'role_modal',
                title: '🎭 查看身份',
                content: '游戏开始时会显示你的角色身份。记住你是谁，这将决定你的策略！',
                highlight: '#roleModal',
                position: 'center'
            },
            {
                id: 'night_phase',
                title: '🌙 夜晚阶段',
                content: '夜晚时分，神职玩家睁眼行动：守卫守护、狼人刀人、女巫用药、预言家查验。',
                highlight: '.phase-banner',
                position: 'top'
            },
            {
                id: 'day_phase',
                title: '☀️ 白天阶段',
                content: '天亮后，存活玩家按顺序发言。通过分析发言找出狼人！',
                highlight: '.chronicles',
                position: 'right'
            },
            {
                id: 'voting',
                title: '🗳️ 投票环节',
                content: '发言结束后，所有存活玩家投票选出最像狼人的玩家。被票数最多的人出局！',
                highlight: '.action-panel',
                position: 'bottom'
            },
            {
                id: 'goal',
                title: '🎯 游戏目标',
                content: '好人阵营：找出并票出所有狼人\n狼人阵营：杀光所有好人\n你准备好了吗？',
                highlight: '.start-screen',
                position: 'center'
            }
        ];
    }

    // 检查是否需要显示教程
    shouldShowTutorial() {
        try {
            const played = localStorage.getItem('werewolf_tutorial_played');
            return played !== 'true';
        } catch (e) {
            return true;
        }
    }

    // 开始教程
    start() {
        if (!this.shouldShowTutorial() || !this.enabled) {
            return false;
        }

        this.steps = this.getTutorialSteps();
        this.currentStep = 0;
        this.showStep(0);
        return true;
    }

    // 显示指定步骤
    showStep(index) {
        if (index >= this.steps.length) {
            this.complete();
            return;
        }

        const step = this.steps[index];
        this.showTooltip(step);
    }

    // 显示教程提示
    showTooltip(step) {
        // 移除已有的提示
        this.removeTooltip();

        // 创建提示框
        const tooltip = document.createElement('div');
        tooltip.id = 'tutorial-tooltip';
        tooltip.className = 'tutorial-tooltip';
        tooltip.innerHTML = `
            <div class="tutorial-title">${step.title}</div>
            <div class="tutorial-content">${step.content}</div>
            <div class="tutorial-actions">
                <button class="btn btn-secondary" onclick="tutorial.prev()">上一步</button>
                <button class="btn btn-primary" onclick="tutorial.next()">下一步</button>
            </div>
            <div class="tutorial-progress">${this.currentStep + 1} / ${this.steps.length}</div>
        `;

        document.body.appendChild(tooltip);

        // 高亮目标元素
        if (step.highlight) {
            try {
                const target = document.querySelector(step.highlight);
                if (target) {
                    target.style.position = 'relative';
                    const rect = target.getBoundingClientRect();
                    tooltip.style.cssText = `
                        position: fixed;
                        width: 320px;
                        background: linear-gradient(135deg, #2d1b4e, #1a0a2e);
                        border: 2px solid #6c5ce7;
                        border-radius: 16px;
                        padding: 20px;
                        z-index: 10000;
                        box-shadow: 0 0 40px rgba(108, 92, 231, 0.4);
                    `;

                    // 根据位置调整
                    if (step.position === 'center') {
                        tooltip.style.top = '50%';
                        tooltip.style.left = '50%';
                        tooltip.style.transform = 'translate(-50%, -50%)';
                    } else if (step.position === 'bottom') {
                        tooltip.style.bottom = '120px';
                        tooltip.style.left = '50%';
                        tooltip.style.transform = 'translateX(-50%)';
                    } else if (step.position === 'top') {
                        tooltip.style.top = '80px';
                        tooltip.style.left = '50%';
                        tooltip.style.transform = 'translateX(-50%)';
                    } else if (step.position === 'right') {
                        tooltip.style.top = '50%';
                        tooltip.style.right = '20px';
                        tooltip.style.left = 'auto';
                        tooltip.style.transform = 'translateY(-50%)';
                    }
                }
            } catch (e) {
                // 目标元素不存在，显示在中心
                tooltip.style.top = '50%';
                tooltip.style.left = '50%';
                tooltip.style.transform = 'translate(-50%, -50%)';
            }
        }
    }

    // 移除提示框
    removeTooltip() {
        const existing = document.getElementById('tutorial-tooltip');
        if (existing) existing.remove();
    }

    // 下一步
    next() {
        this.currentStep++;
        if (this.currentStep < this.steps.length) {
            this.showStep(this.currentStep);
        } else {
            this.complete();
        }
    }

    // 上一步
    prev() {
        this.currentStep--;
        if (this.currentStep < 0) {
            this.currentStep = 0;
        }
        this.showStep(this.currentStep);
    }

    // 跳过教程
    skip() {
        this.complete();
    }

    // 完成教程
    complete() {
        this.removeTooltip();
        try {
            localStorage.setItem('werewolf_tutorial_played', 'true');
        } catch (e) {}
    }
}

// 创建全局实例
const tutorial = new TutorialSystem();

// 添加教程样式
const tutorialStyles = document.createElement('style');
tutorialStyles.textContent = `
    .tutorial-title {
        font-family: 'Orbitron', sans-serif;
        font-size: 16px;
        color: #6c5ce7;
        margin-bottom: 12px;
    }

    .tutorial-content {
        font-size: 14px;
        color: #fff;
        line-height: 1.6;
        margin-bottom: 16px;
    }

    .tutorial-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
    }

    .tutorial-progress {
        text-align: center;
        font-size: 12px;
        color: rgba(255,255,255,0.5);
        margin-top: 12px;
    }
`;
document.head.appendChild(tutorialStyles);

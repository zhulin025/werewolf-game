/**
 * 皮肤系统 - 主题和外观定制
 */

const Skins = {
    // 默认皮肤 - 深紫星空
    default: {
        name: '深紫星空',
        colors: {
            primary: '#6c5ce7',
            secondary: '#00cec9',
            accent: '#ff6b6b',
            bg: '#1a0a2e',
            surface: '#2d1b4e',
            text: '#ffffff'
        },
        background: 'stars',
        particles: true
    },

    // 暗黑风格
    dark: {
        name: '暗夜黑',
        colors: {
            primary: '#2c3e50',
            secondary: '#3498db',
            accent: '#e74c3c',
            bg: '#0a0a0f',
            surface: '#1a1a2e',
            text: '#ecf0f1'
        },
        background: 'smoke',
        particles: false
    },

    // 赛博朋克
    cyberpunk: {
        name: '赛博朋克',
        colors: {
            primary: '#00ff9f',
            secondary: '#ff00ff',
            accent: '#ffff00',
            bg: '#0d0221',
            surface: '#1a0a3e',
            text: '#ffffff'
        },
        background: 'grid',
        particles: true,
        glow: true
    },

    // 森林主题
    forest: {
        name: '暗夜森林',
        colors: {
            primary: '#27ae60',
            secondary: '#f39c12',
            accent: '#c0392b',
            bg: '#0d1f0d',
            surface: '#1a2e1a',
            text: '#e8f5e9'
        },
        background: 'forest',
        particles: true
    },

    // 血红风格
    blood: {
        name: '血红之夜',
        colors: {
            primary: '#8b0000',
            secondary: '#dc143c',
            accent: '#ff4500',
            bg: '#1a0505',
            surface: '#2d1515',
            text: '#ffcccc'
        },
        background: 'blood',
        particles: false
    },

    // 冰雪主题
    ice: {
        name: '冰霜之冬',
        colors: {
            primary: '#3498db',
            secondary: '#00cec9',
            accent: '#e74c3c',
            bg: '#0a1628',
            surface: '#1a2a4a',
            text: '#e8f4fc'
        },
        background: 'snow',
        particles: true
    }
};

class SkinSystem {
    constructor() {
        this.currentSkin = 'default';
        this.loadSkin();
    }

    loadSkin() {
        try {
            const saved = localStorage.getItem('werewolf_skin');
            if (saved && Skins[saved]) {
                this.currentSkin = saved;
            }
        } catch (e) {
            console.log('Using default skin');
        }
        this.applySkin();
    }

    applySkin(skinName = this.currentSkin) {
        const skin = Skins[skinName];
        if (!skin) return;

        this.currentSkin = skinName;

        // 应用CSS变量
        const root = document.documentElement;
        root.style.setProperty('--primary', skin.colors.primary);
        root.style.setProperty('--secondary', skin.colors.secondary);
        root.style.setProperty('--accent', skin.colors.accent);
        root.style.setProperty('--bg', skin.colors.bg);
        root.style.setProperty('--surface', skin.colors.surface);
        root.style.setProperty('--text', skin.colors.text);

        // 更新背景
        this.updateBackground(skin.background);

        // 保存选择
        try {
            localStorage.setItem('werewolf_skin', skinName);
        } catch (e) {}

        console.log(`[Skin] Applied: ${skin.name}`);
    }

    updateBackground(type) {
        const starsContainer = document.getElementById('stars');
        if (!starsContainer) return;

        starsContainer.innerHTML = '';
        starsContainer.style.background = 'transparent';

        switch (type) {
            case 'stars':
                this.createStars();
                break;
            case 'smoke':
                starsContainer.style.background = 'radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0f 100%)';
                break;
            case 'grid':
                this.createGrid();
                break;
            case 'forest':
                this.createTrees();
                break;
            case 'snow':
                this.createSnow();
                break;
            case 'blood':
                starsContainer.style.background = 'radial-gradient(ellipse at center, #2d1515 0%, #1a0505 100%)';
                this.createBloodDrops();
                break;
        }
    }

    createStars() {
        const starsContainer = document.getElementById('stars');
        for (let i = 0; i < 150; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 100 + '%';
            star.style.width = Math.random() * 3 + 1 + 'px';
            star.style.height = star.style.width;
            star.style.animationDelay = Math.random() * 3 + 's';
            star.style.background = 'white';
            star.style.borderRadius = '50%';
            starsContainer.appendChild(star);
        }
    }

    createGrid() {
        const starsContainer = document.getElementById('stars');
        // 创建网格背景
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;';
        document.body.insertBefore(canvas, document.body.firstChild);

        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const draw = () => {
            ctx.strokeStyle = 'rgba(0, 255, 159, 0.1)';
            ctx.lineWidth = 1;

            // 垂直线
            for (let x = 0; x < canvas.width; x += 50) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }

            // 水平线
            for (let y = 0; y < canvas.height; y += 50) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }

            requestAnimationFrame(draw);
        };

        draw();
        canvas.id = 'gridCanvas';
    }

    createTrees() {
        const starsContainer = document.getElementById('stars');
        starsContainer.style.background = 'linear-gradient(to bottom, #0d1f0d 0%, #1a2e1a 50%, #0d1f0d 100%)';

        for (let i = 0; i < 30; i++) {
            const tree = document.createElement('div');
            tree.innerHTML = '🌲';
            tree.style.cssText = `
                position: fixed;
                bottom: 0;
                font-size: ${30 + Math.random() * 40}px;
                left: ${Math.random() * 100}%;
                opacity: ${0.3 + Math.random() * 0.4};
                z-index: 0;
                pointer-events: none;
            `;
            starsContainer.appendChild(tree);
        }
    }

    createSnow() {
        const starsContainer = document.getElementById('stars');
        starsContainer.style.background = 'linear-gradient(to bottom, #0a1628 0%, #1a2a4a 100%)';

        for (let i = 0; i < 100; i++) {
            const snow = document.createElement('div');
            snow.className = 'snowflake';
            snow.innerHTML = '❄';
            snow.style.cssText = `
                position: fixed;
                top: -20px;
                font-size: ${8 + Math.random() * 12}px;
                left: ${Math.random() * 100}%;
                color: white;
                opacity: ${0.5 + Math.random() * 0.5};
                animation: snowfall ${5 + Math.random() * 10}s linear infinite;
                z-index: 0;
                pointer-events: none;
            `;
            starsContainer.appendChild(snow);
        }

        // 添加雪花动画
        if (!document.getElementById('snowfallStyle')) {
            const style = document.createElement('style');
            style.id = 'snowfallStyle';
            style.textContent = `
                @keyframes snowfall {
                    0% { transform: translateY(-20px) rotate(0deg); }
                    100% { transform: translateY(100vh) rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    createBloodDrops() {
        const starsContainer = document.getElementById('stars');

        for (let i = 0; i < 20; i++) {
            const drop = document.createElement('div');
            drop.style.cssText = `
                position: fixed;
                top: ${Math.random() * 100}%;
                left: ${Math.random() * 100}%;
                width: 3px;
                height: ${10 + Math.random() * 20}px;
                background: linear-gradient(to bottom, transparent, #8b0000);
                border-radius: 50%;
                opacity: 0.3;
                z-index: 0;
                pointer-events: none;
            `;
            starsContainer.appendChild(drop);
        }
    }

    getAvailableSkins() {
        return Object.entries(Skins).map(([key, skin]) => ({
            id: key,
            name: skin.name
        }));
    }
}

// 创建全局实例
const skinSystem = new SkinSystem();

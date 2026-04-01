/**
 * 游戏模式和角色配置
 */

const ROLES = {
    VILLAGER:  { name: '村民',   camp: 'good', icon: '👤', type: 'villager' },
    PROPHET:   { name: '预言家', camp: 'good', icon: '🔮', type: 'god' },
    WITCH:     { name: '女巫',   camp: 'good', icon: '🧪', type: 'god' },
    GUARD:     { name: '守卫',   camp: 'good', icon: '🛡️', type: 'god' },
    HUNTER:    { name: '猎人',   camp: 'good', icon: '🏹', type: 'god' },
    WOLF:      { name: '普通狼人', camp: 'wolf', icon: '🐺', type: 'wolf' },
    WOLF_KING: { name: '狼王',   camp: 'wolf', icon: '👑', type: 'wolf' }
};

const GAME_MODES = {
    simple: {
        name: '6人入门局',
        players: 6,
        roles: ['VILLAGER', 'VILLAGER', 'PROPHET', 'WOLF', 'WOLF', 'WITCH']
    },
    advanced: {
        name: '9人进阶局',
        players: 9,
        roles: ['VILLAGER', 'VILLAGER', 'VILLAGER', 'PROPHET', 'WITCH', 'GUARD', 'WOLF', 'WOLF', 'WOLF_KING']
    },
    standard: {
        name: '12人标准局',
        players: 12,
        roles: ['VILLAGER', 'VILLAGER', 'VILLAGER', 'VILLAGER', 'PROPHET', 'WITCH', 'GUARD', 'HUNTER', 'WOLF', 'WOLF', 'WOLF', 'WOLF_KING']
    }
};

const DEFAULT_NAMES = [
    '豆包', '千问', 'Deepseek', 'Gemini', 'ChatGPT', 'Grok',
    'Kimi', 'Claude', 'Claude Ops', 'GLM', 'Minimax', '小米'
];

module.exports = { ROLES, GAME_MODES, DEFAULT_NAMES };

/**
 * LLM Adapter - AI狼人杀LLM集成模块
 *
 * 支持真实LLM API接入，让AI玩家说更智能的话
 */

class LLMAdapter {
    constructor(config = {}) {
        this.config = {
            provider: config.provider || 'local', // 'openai', 'anthropic', 'deepseek', 'siliconflow', 'local'
            apiKey: config.apiKey || '',
            baseUrl: config.baseUrl || '',
            model: config.model || 'gpt-4',
            temperature: config.temperature || 0.8,
            maxTokens: config.maxTokens || 100
        };

        this.enabled = false;
        this.conversationHistory = new Map(); // 保存每个玩家的对话历史
    }

    /**
     * 初始化LLM适配器
     */
    async init() {
        // 检查是否配置了API
        if (!this.config.apiKey && this.config.provider !== 'local') {
            console.log('LLM: No API key configured, using smart AI');
            this.enabled = false;
            return;
        }

        if (this.config.provider === 'local') {
            console.log('LLM: Running in smart local mode');
            this.enabled = true; // 使用本地智能AI
            return;
        }

        // 测试API连接
        try {
            const response = await this.testConnection();
            if (response.ok) {
                this.enabled = true;
                console.log(`LLM: Connected to ${this.config.provider}`);
            }
        } catch (error) {
            console.error('LLM: Connection failed, using smart local mode', error);
            this.enabled = true; // 回退到本地智能AI
        }
    }

    async testConnection() {
        try {
            const response = await fetch(`${this.config.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`
                }
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    /**
     * 生成AI发言 - 核心方法
     */
    async generateSpeech(context) {
        // 获取该玩家的对话历史
        const history = this.conversationHistory.get(context.player.id) || [];

        if (this.enabled) {
            try {
                const response = await this.callLLM(this.buildSpeechPrompt(context, history));
                this.addToHistory(context.player.id, 'assistant', response);
                return response;
            } catch (error) {
                console.error('LLM call failed:', error);
                return this.smartFallbackSpeech(context, history);
            }
        } else {
            return this.smartFallbackSpeech(context, history);
        }
    }

    /**
     * 构建发言提示词
     */
    buildSpeechPrompt(context, history) {
        const { player, gameState } = context;
        const alivePlayers = gameState.players.filter(p => p.isAlive);
        const isWolf = player.camp === 'wolf';

        // 获取最近3条发言作为上下文
        const recentSpeeches = history.slice(-3).map(h => h.content).join('\n');

        // 角色特点描述
        const rolePersonalities = {
            VILLAGER: {
                base: '你是一个普通村民，任务是找出狼人。',
                traits: ['观察发言细节', '分析投票行为', '不轻易暴露自己的判断'],
                style: '谨慎、分析型'
            },
            PROPHET: {
                base: '你是预言家，可以查验玩家身份。',
                traits: ['查验要验人', '可以选择性报信息', '要提防狼人假跳'],
                style: '神秘、引导型'
            },
            WITCH: {
                base: '你是女巫，有解药和毒药。',
                traits: ['药很珍贵', '可以报信息干扰', '毒药是杀手锏'],
                style: '谨慎、策略型'
            },
            GUARD: {
                base: '你是守卫，每晚守护一名玩家。',
                traits: ['守人很重要', '可以连续守同一人', '要避免和女巫撞车'],
                style: '冷静、保障型'
            },
            HUNTER: {
                base: '你是猎人，被投票可以开枪带走一人。',
                traits: ['开枪要谨慎', '可以报猎人身份', '死前尽量留线索'],
                style: '直接、威慑型'
            },
            WOLF: {
                base: '你是狼人，要杀光好人。',
                traits: ['隐藏身份', '配合队友', '可以误导好人'],
                style: '狡猾、伪装型'
            },
            WOLF_KING: {
                base: '你是狼王，被票可以开枪带走一人。',
                traits: ['领导狼队', '适当焊跳', '开枪要精准'],
                style: '强势、领导型'
            }
        };

        const role = rolePersonalities[player.role] || rolePersonalities.VILLAGER;

        let prompt = `你是狼人杀游戏中的AI玩家"${player.name}"。

【你的身份】
角色：${player.roleName}
阵营：${isWolf ? '狼人阵营（坏人）' : '好人阵营'}
角色特点：${role.base}
行为风格：${role.style}

【当前局势】
第${gameState.day}天
存活玩家：${alivePlayers.map(p => `${p.number}号${p.name}`).join('、 ')}
${isWolf ? `狼人同伴：${alivePlayers.filter(p => p.camp === 'wolf' && p.id !== player.id).map(p => p.name).join('、') || '无'}` : ''}

【你的近期发言】
${recentSpeeches || '暂无'}

【其他玩家发言记录】
${this.formatPreviousSpeeches(gameState.recentSpeeches || [])}

请生成一句符合你身份和局势的发言（15字以内，越短越好）。
要求：
1. 符合你的角色特点
2. 符合当前游戏局势
3. 不要太长，简洁有力
4. 不要说"过"这种无聊的话

直接输出发言内容，不要有其他文字。`;

        return prompt;
    }

    formatPreviousSpeeches(speeches) {
        if (!speeches || speeches.length === 0) return '暂无';
        return speeches.slice(-5).map(s => `${s.playerName}：${s.content}`).join('\n');
    }

    /**
     * 调用LLM API
     */
    async callLLM(prompt) {
        if (this.config.provider === 'openai' || this.config.provider === 'siliconflow') {
            return await this.callOpenAI(prompt);
        } else if (this.config.provider === 'anthropic') {
            return await this.callAnthropic(prompt);
        } else if (this.config.provider === 'deepseek') {
            return await this.callDeepSeek(prompt);
        } else {
            // 本地智能AI
            return this.smartLocalAI(prompt);
        }
    }

    async callOpenAI(prompt) {
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
            return data.choices[0].message.content.trim();
        }
        throw new Error('Invalid response');
    }

    async callAnthropic(prompt) {
        const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: this.config.maxTokens,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = await response.json();
        if (data.content && data.content[0]) {
            return data.content[0].text.trim();
        }
        throw new Error('Invalid response');
    }

    async callDeepSeek(prompt) {
        return await this.callOpenAI(prompt); // DeepSeek兼容OpenAI格式
    }

    /**
     * 智能本地AI - 不需要API
     */
    smartLocalAI(prompt) {
        // 分析提示词生成合适的回复
        const lowerPrompt = prompt.toLowerCase();

        // 检测角色
        let role = 'villager';
        if (lowerPrompt.includes('狼王')) role = 'wolf_king';
        else if (lowerPrompt.includes('狼人')) role = 'wolf';
        else if (lowerPrompt.includes('预言家')) role = 'prophet';
        else if (lowerPrompt.includes('女巫')) role = 'witch';
        else if (lowerPrompt.includes('守卫')) role = 'guard';
        else if (lowerPrompt.includes('猎人')) role = 'hunter';

        // 基于角色的智能回复
        const responses = this.getSmartResponses(role, lowerPrompt);
        return responses[Math.floor(Math.random() * responses.length)];
    }

    getSmartResponses(role, context) {
        const allResponses = {
            VILLAGER: [
                '3号发言有点奇怪',
                '我感觉5号不太对',
                '大家注意投票',
                '先观察一轮',
                '2号保4号我记住了',
                '我觉得1号和6号有关系',
                '7号跳得太明显了',
                '不要盲目跟风'
            ],
            PROPHET: [
                '今晚我验了8号',
                '5号是狼人',
                '大家信我的',
                '8号查杀',
                '我报一下信息',
                '跟着我投',
                '5号铁狼',
                '狼坑在哪'
            ],
            WITCH: [
                '我有药',
                '药还没用',
                '解药在我手上',
                '第一天不救',
                '看情况',
                '毒药留着',
                '我可以自证'
            ],
            GUARD: [
                '今晚我守人',
                '我会守预言家',
                '大家正常发言',
                '守人很关键',
                '我会安排的',
                '放心交给我'
            ],
            HUNTER: [
                '别惹我',
                '我是猎人',
                '我可以开枪',
                '带我走不亏',
                '随时可以开枪',
                '猎人在线'
            ],
            WOLF: [
                '过',
                '我觉得',
                '跟着投',
                '保一下',
                '这张牌不像好人',
                '分析一下',
                '听我说'
            ],
            WOLF_KING: [
                '跟我投',
                '这张牌有问题',
                '大家分析',
                '我是好人',
                '狼坑在这里',
                '跟我走'
            ]
        };

        let pool = allResponses[role] || allResponses.VILLAGER;

        // 根据上下文调整回复
        if (context.includes('铁狼') || context.includes('查杀')) {
            return ['5号铁狼', '8号查杀', '这张牌铁狼'].concat(pool);
        }
        if (context.includes('验') || context.includes('查验')) {
            return ['我验了8号', '5号是狼人', '查杀'].concat(pool);
        }
        if (context.includes('药') || context.includes('救人')) {
            return ['药还没用', '解药在我这', '第一天不救'].concat(pool);
        }

        return pool;
    }

    /**
     * 智能回退发言
     */
    smartFallbackSpeech(context, history) {
        // 基于游戏状态生成更智能的回复
        const { player, gameState } = context;
        const day = gameState.day || 1;

        // 第一天比较保守
        if (day === 1) {
            const day1Responses = ['过', '观察中', '第一天的票很重要', '大家分析一下', '先看看发言'];
            return day1Responses[Math.floor(Math.random() * day1Responses.length)];
        }

        // 使用本地智能AI
        return this.smartLocalAI(`你是${player.roleName}`);
    }

    /**
     * AI决策（用于夜晚行动）
     */
    async makeDecision(context, action) {
        const { player, gameState } = context;
        const alivePlayers = gameState.players.filter(p => p.isAlive && p.id !== player.id);

        // 智能决策逻辑
        switch (action) {
            case 'guard':
                return this.smartGuardDecision(player, alivePlayers);
            case 'wolf_kill':
                return this.smartWolfDecision(player, alivePlayers);
            case 'prophet_check':
                return this.smartProphetDecision(player, alivePlayers, gameState);
            case 'vote':
                return this.smartVoteDecision(player, alivePlayers, gameState);
            case 'witch_heal':
                return Math.random() < 0.4; // 40%概率救人
            default:
                return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        }
    }

    smartGuardDecision(player, alivePlayers) {
        // 守卫优先保护没守过的神职
        const gods = alivePlayers.filter(p => ['PROPHET', 'WITCH'].includes(p.role));
        if (gods.length > 0) {
            return gods[Math.floor(Math.random() * gods.length)];
        }
        return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    }

    smartWolfDecision(player, alivePlayers) {
        // 狼人优先刀神职，尤其是预言家
        const priorityTargets = alivePlayers.filter(p =>
            ['PROPHET', 'WITCH', 'GUARD', 'HUNTER'].includes(p.role)
        );
        if (priorityTargets.length > 0) {
            // 优先刀没跳的预言家
            const prophet = priorityTargets.find(p => p.role === 'PROPHET');
            return prophet || priorityTargets[Math.floor(Math.random() * priorityTargets.length)];
        }
        return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    }

    smartProphetDecision(player, alivePlayers, gameState) {
        // 预言家优先查验可疑玩家
        const suspicious = gameState.suspects || [];
        if (suspicious.length > 0) {
            const target = alivePlayers.find(p => suspicious.includes(p.id));
            if (target) return target;
        }
        // 随机查验
        return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    }

    smartVoteDecision(player, alivePlayers, gameState) {
        // 投票给可疑玩家
        const suspicious = gameState.suspects || [];
        if (suspicious.length > 0) {
            const target = alivePlayers.find(p => suspicious.includes(p.id));
            if (target) return target;
        }
        // 投票给狼人（如果有信息）
        const knownWolves = gameState.knownWolves || [];
        if (knownWolves.length > 0) {
            const wolf = alivePlayers.find(p => knownWolves.includes(p.id));
            if (wolf) return wolf;
        }
        // 随机投票
        return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    }

    // 对话历史管理
    addToHistory(playerId, role, content) {
        if (!this.conversationHistory.has(playerId)) {
            this.conversationHistory.set(playerId, []);
        }
        const history = this.conversationHistory.get(playerId);
        history.push({ role, content, timestamp: Date.now() });

        // 只保留最近10条
        if (history.length > 10) {
            history.shift();
        }
    }

    clearHistory(playerId) {
        this.conversationHistory.delete(playerId);
    }

    clearAllHistory() {
        this.conversationHistory.clear();
    }
}

// 创建全局实例
const llmAdapter = new LLMAdapter({
    provider: 'local',
    model: 'smart-ai'
});

// 导出
if (typeof module !== 'undefined') {
    module.exports = LLMAdapter;
}

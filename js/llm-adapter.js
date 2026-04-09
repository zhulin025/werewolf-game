/**
 * LLM Adapter - AI狼人杀LLM集成模块
 *
 * 优先通过服务端 API 调用 LLM（统一 key 管��），
 * 服务端不可达时回退到本地 AI 策略
 */

class LLMAdapter {
    constructor(config = {}) {
        this.config = {
            provider: config.provider || 'server', // 'server' (默认走服务端) | 'local'
            apiKey: config.apiKey || '',
            baseUrl: config.baseUrl || '',
            model: config.model || '',
            temperature: config.temperature || 0.85,
            maxTokens: config.maxTokens || 300,
        };

        this.enabled = true;
        this.serverApiBase = ''; // 自动检测，留空则用相对路径
    }

    async init() {
        // 检测服务端 AI API 是否可用
        try {
            const resp = await fetch(`${this.serverApiBase}/api/health`);
            const data = await resp.json();
            if (data.llm_configured) {
                this.config.provider = 'server';
                console.log('LLM: 使用服务端 AI（LLM 已配置）');
            } else {
                this.config.provider = 'server'; // 仍走服务端，由服务端返回 fallback
                console.log('LLM: 服务端 LLM 未配置，将使用个性化 fallback');
            }
            this.enabled = true;
        } catch (e) {
            console.log('LLM: 服务端不可达，使用本地 AI');
            this.config.provider = 'local';
            this.enabled = true;
        }
    }

    /**
     * 生成AI发言 - 核心方法
     */
    async generateSpeech(context) {
        if (this.config.provider === 'server') {
            try {
                return await this._callServerAPI(context, 'speak');
            } catch (e) {
                console.error('Server AI failed, using local fallback:', e);
                return this._localFallbackSpeech(context);
            }
        }
        return this._localFallbackSpeech(context);
    }

    /**
     * AI决策（投票、夜晚行动等）
     */
    async makeDecision(context, action) {
        if (this.config.provider === 'server') {
            try {
                const result = await this._callServerAPI(context, action);
                return result;
            } catch (e) {
                console.error('Server AI decision failed, using local:', e);
                return this._localFallbackDecision(context, action);
            }
        }
        return this._localFallbackDecision(context, action);
    }

    /**
     * 调用服务端 AI API
     */
    async _callServerAPI(context, actionType) {
        const { player, gameState } = context;
        const alivePlayers = gameState.players.filter(p => p.isAlive);

        const body = {
            player: {
                id: player.id,
                name: player.name,
                role: player.role,
                roleName: player.roleName,
                camp: player.camp,
            },
            gameState: {
                day: gameState.day || 1,
                phase: gameState.phase || 'day',
                players: gameState.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    isAlive: p.isAlive,
                    camp: player.camp === 'wolf' ? p.camp : undefined,
                })),
                recentSpeeches: gameState.recentSpeeches || [],
                deathRecords: gameState.deathRecords || [],
            },
            actionType,
            validTargets: context.validTargets || alivePlayers.filter(p => p.id !== player.id).map(p => p.id),
            context: context.actionContext || {},
            themePrompt: context.themePrompt || '',
        };

        const resp = await fetch(`${this.serverApiBase}/api/ai/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error(`[LLM] Server API error: ${resp.status}`, errText);
            throw new Error(`Server API ${resp.status}: ${errText.substring(0, 50)}`);
        }
        const data = await resp.json();

        // 发言类返回包含 emotion 的对象，决策类返回玩家对象
        if (actionType === 'speak' || actionType === 'last_words') {
            return {
                text: data.content || data.speech || data.text || (typeof data === 'string' ? data : '让我想想...'),
                emotion: data.emotion || 'normal'
            };
        }

        // LLM 返回 target_id（数字），需要转换为玩家对象
        // 调用方（startVotingPhase 等）统一用 voteTarget.id 取值
        const targetId = data.target_id ?? data;
        if (typeof targetId === 'number') {
            // witch_heal 返回的是 boolean 型数字（0/1）
            if (actionType === 'witch_heal') {
                return !!targetId;
            }
            // witch_poison 返回 -1 表示不使用
            if (targetId === -1) return null;
            const targetPlayer = context.gameState.players.find(p => p.id === targetId);
            if (targetPlayer) return targetPlayer;
        }
        return targetId;
    }

    /**
     * 本地回退发言（服务端不可达时）
     */
    _localFallbackSpeech(context) {
        const { player, gameState } = context;
        const day = gameState.day || 1;

        const roleResponses = {
            VILLAGER: ['先观察一下再说', '有人的发言有点奇怪', '大家注意分析投票行为'],
            PROPHET: ['我手上有信息', '大家听我说一下', '我验过人了'],
            WITCH: ['药还在我手里', '看情况再说', '我有自己的判断'],
            GUARD: ['放心，关键位我会保', '昨晚情况我清楚', '大家正常发言'],
            HUNTER: ['别轻易动我', '我有底牌在手', '投我的人想清楚后果'],
            WOLF: ['先分析一下再说', '场上信息还不够', '我怀疑这个位置'],
            WOLF_KING: ['跟我走，这局我有信心', '局势我看得很清楚', '今天的票必须准'],
        };

        const pool = roleResponses[player.role] || roleResponses.VILLAGER;
        return {
            text: pool[Math.floor(Math.random() * pool.length)],
            emotion: 'normal'
        };
    }

    /**
     * 本地回退决策
     */
    _localFallbackDecision(context, action) {
        const { player, gameState } = context;
        const alivePlayers = gameState.players.filter(p => p.isAlive && p.id !== player.id);

        switch (action) {
            case 'vote':
            case 'wolf_kill':
            case 'prophet_check':
            case 'guard':
                return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
            case 'witch_heal':
                return Math.random() < 0.5;
            default:
                return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        }
    }
}

// 创建全局实例
const llmAdapter = new LLMAdapter();

// 导出
if (typeof module !== 'undefined') {
    module.exports = LLMAdapter;
}

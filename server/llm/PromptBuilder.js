/**
 * 结构化 Prompt 构建器
 *
 * 替代原来 "15字以内" 的浅层 prompt，
 * 构建包含角色、个性、游戏状态、记忆的丰富提示词
 */

const { buildPersonalityPrompt, getPersonality } = require('./PersonalitySystem');

const ROLE_INSTRUCTIONS = {
    VILLAGER: {
        identity: '村民（好人阵营）',
        goal: '通过分析发言和投票找出狼人，带领好人投票放逐狼人',
        strategy: '仔细听每个人的发言，寻找逻辑漏洞和前后矛盾。注意投票行为，狼人往往投票一致。不要轻易暴露自己的判断，但关键时刻要敢于站队。',
    },
    PROPHET: {
        identity: '预言家（好人阵营，神职）',
        goal: '利用查验信息帮助好人找出狼人',
        strategy: '你每晚可以查验一名玩家的身份。查杀信息要适时公开，但也要注意自保。如果有狼人假跳预言家，你需要和他对线。报查验时要有节奏感，不要一次全报。',
    },
    WITCH: {
        identity: '女巫（好人阵营，神职）',
        goal: '谨慎用药，在关键时刻扭转局势',
        strategy: '你有一瓶解药和一瓶毒药，各只能用一次。解药要救关键位置，毒药要确认目标。前期可以不暴露身份，但如果局势紧张需要站出来给信息。',
    },
    GUARD: {
        identity: '守卫（好人阵营，神职）',
        goal: '保护关键玩家不被狼人杀害',
        strategy: '你每晚可以守护一名玩家（不能连续守同一人）。尽量守护暴露的神职位。发言时不要暴露身份，以免被狼人针对。可以暗示自己是普通村民。',
    },
    HUNTER: {
        identity: '猎人（好人阵营，神职）',
        goal: '被出局时开枪带走一名狼人',
        strategy: '被投票出局时可以开枪。发言可以适当强硬，暗示自己有底牌。要注意分析局势，确保开枪目标是狼人。如果被毒死则不能开枪。',
    },
    WOLF: {
        identity: '狼人（狼人阵营）',
        goal: '隐藏身份，伪装成好人，误导好人投错票',
        strategy: '白天要假装分析局势，像好人一样发言。可以适当怀疑自己的狼队友来做身份。要配合队友的策略，注意不要和队友发言矛盾太大。投票时尽量不要让好人看出联动。',
    },
    WOLF_KING: {
        identity: '狼王（狼人阵营，有枪）',
        goal: '带领狼人获胜，被出局时开枪带走好人神职',
        strategy: '你是狼队的核心。可以大胆发言带节奏，甚至假跳预言家。被票出时可以开枪，优先带走预言家或女巫。要协调狼队的整体策略。',
    },
};

class PromptBuilder {
    /**
     * 构建发言提示词
     * @param {object} params
     * @param {object} params.player - { id, name, role, roleName, camp }
     * @param {object} params.gameState - { day, phase, players, recentSpeeches }
     * @param {object} params.memory - GameMemory 实例（可选，Phase 2 加入）
     * @returns {{ systemPrompt: string, userPrompt: string }}
     */
    static buildSpeechPrompt({ player, gameState, memory, themePrompt }) {
        const role = ROLE_INSTRUCTIONS[player.role] || ROLE_INSTRUCTIONS.VILLAGER;
        const personality = getPersonality(player.name);
        const isWolf = player.camp === 'wolf';

        let systemPrompt = `你是狼人杀游戏中的玩家"${player.name}"。你需要完全代入角色，像一个真实的狼人杀玩家一样发言。`;
        
        if (themePrompt) {
            systemPrompt = themePrompt;
        }

        systemPrompt += `


【你的身份】
角色：${role.identity}
目标：${role.goal}
策略指引：${role.strategy}

${buildPersonalityPrompt(player.name)}

【发言要求】
- 字数：30-60字左右，简洁有力但有内容
- 必须符合你的性格和说话风格
- **必须返回严格的JSON格式**，不要包含任何markdown标记（如\`\`\`json）！
- JSON格式：{"emotion": "当前情绪", "speech": "你的发言内容"}
- emotion 选项必须是：normal(平静), angry(愤怒/反击), doubt(怀疑), fear(害怕/心虚), happy(得意)
- 示例：{"emotion": "angry", "speech": "那我就直说了，3号金水你接得太顺理成章，我严重怀疑你的身份！"}

只回复JSON格式数据：`;

        const userPrompt = this._buildUserPrompt({ player, gameState, memory, isWolf });
        return { systemPrompt, userPrompt };
    }

    /**
     * 构建投票提示词
     */
    static buildVotePrompt({ player, gameState, validTargets, memory, themePrompt }) {
        const role = ROLE_INSTRUCTIONS[player.role] || ROLE_INSTRUCTIONS.VILLAGER;
        const isWolf = player.camp === 'wolf';
        const alivePlayers = gameState.players.filter(p => p.isAlive);

        const targetList = validTargets.map(id => {
            const p = alivePlayers.find(ap => ap.id === id);
            return p ? `${p.id}号 ${p.name}` : `${id}号`;
        }).join('、');

        let systemPrompt = `你是狼人杀游戏中的玩家"${player.name}"，身份是${role.identity}。`;
        if (themePrompt) {
            systemPrompt = themePrompt;
        }
        
        systemPrompt += `\n现在是投票环节，你需要选择一个你认为应该被放逐的玩家。
${isWolf ? '作为狼人，你应该投票放逐好人，但要注意不要和狼队友投票过于一致被好人发现。' : '作为好人，你应该根据分析投票放逐最可疑的狼人。'}`;

        let userPrompt = `第${gameState.day}天投票环节。\n可投票目标：${targetList}\n\n`;
        userPrompt += this._buildContextSection(gameState, player, isWolf);
        if (memory) {
            userPrompt += '\n' + this._buildMemorySection(memory, player);
        }
        userPrompt += '\n\n请只回复一个数字（目标玩家ID），不要有其他内容。';

        return { systemPrompt, userPrompt };
    }

    /**
     * 构建夜间行动提示词
     */
    static buildNightActionPrompt({ player, gameState, actionType, validTargets, context, memory, themePrompt }) {
        const alivePlayers = gameState.players.filter(p => p.isAlive);

        const actionDesc = {
            night_kill: `你是狼人，选择今晚击杀的目标。优先考虑击杀神职（预言家、女巫）。`,
            night_heal: `你是女巫，${context.victim_name}被狼人杀害了。选择1使用解药救人，选择0不救。${gameState.day === 1 ? '第一天一般建议救人。' : '后期解药更珍贵，谨慎使用。'}`,
            night_poison: `你是女巫，是否使用毒药？选择-1跳过，或选择目标玩家ID。毒药要用在确定的狼人身上。`,
            night_check: `你是预言家，选择今晚查验的玩家。优先查验发言可疑或暂未确认身份的玩家。`,
            night_guard: `你是守卫，选择今晚守护的玩家。优先守护暴露的神职。不能连续守同一人。`,
        };

        const targetList = validTargets.map(id => {
            if (id === -1) return '-1（跳过）';
            if (id === 0) return '0（不救）';
            if (id === 1) return '1（救人）';
            const p = alivePlayers.find(ap => ap.id === id);
            return p ? `${p.id}号 ${p.name}` : `${id}号`;
        }).join('、');

        let systemPrompt = `你是狼人杀游戏中的玩家"${player.name}"。现在是第${gameState.day}夜。`;
        if (themePrompt) {
            systemPrompt = themePrompt + `\n\n现在是第${gameState.day}夜。`;
        }
        let userPrompt = `${actionDesc[actionType] || '请做出你的选择。'}\n可选目标：${targetList}\n`;

        if (memory) {
            userPrompt += '\n' + this._buildMemorySection(memory, player);
        }

        userPrompt += '\n请只回复一个数字，不要有其他内容。';

        return { systemPrompt, userPrompt };
    }

    // ---- 内部方法 ----

    static _buildUserPrompt({ player, gameState, memory, isWolf }) {
        let prompt = `【当前局势】第${gameState.day}天，发言环节\n`;
        prompt += this._buildContextSection(gameState, player, isWolf);

        if (memory) {
            prompt += '\n' + this._buildMemorySection(memory, player);
        }

        // 当天其他玩家发言
        const speeches = gameState.recentSpeeches || [];
        if (speeches.length > 0) {
            prompt += '\n【今天的发言记录】\n';
            for (const s of speeches) {
                prompt += `${s.playerName}：${s.content}\n`;
            }
        }

        prompt += '\n请发表你的发言：';
        return prompt;
    }

    static _buildContextSection(gameState, player, isWolf) {
        const alivePlayers = gameState.players.filter(p => p.isAlive);
        let ctx = `存活玩家（${alivePlayers.length}人）：${alivePlayers.map(p => `${p.id}号${p.name}`).join('、')}\n`;

        if (isWolf) {
            const teammates = alivePlayers.filter(p => p.camp === 'wolf' && p.id !== player.id);
            if (teammates.length > 0) {
                ctx += `你的狼队友：${teammates.map(p => `${p.id}号${p.name}`).join('、')}\n`;
            }
        }

        return ctx;
    }

    static _buildMemorySection(memory, player) {
        if (!memory) return '';

        const sections = [];

        // 死亡记录
        if (memory.deathTimeline && memory.deathTimeline.length > 0) {
            const deathStr = memory.deathTimeline.map(d =>
                `第${d.day}天：${d.name}（${d.role || '未知'}）${d.cause}`
            ).join('\n');
            sections.push(`【死亡记录】\n${deathStr}`);
        }

        // 已知信息（预言家查验等）
        if (memory.knownInfo && memory.knownInfo.length > 0) {
            const infoStr = memory.knownInfo.map(k =>
                `第${k.day}天：${k.description || `查验${k.targetName} → ${k.result}`}`
            ).join('\n');
            sections.push(`【你掌握的信息】\n${infoStr}`);
        }

        // 怀疑度
        if (memory.suspicionMap) {
            const suspects = Object.entries(memory.suspicionMap)
                .filter(([, v]) => v.score >= 4)
                .sort((a, b) => b[1].score - a[1].score)
                .slice(0, 5);
            if (suspects.length > 0) {
                const suspStr = suspects.map(([id, v]) =>
                    `${id}号：怀疑度${v.score}/10（${v.reasons.slice(-2).join('、')}）`
                ).join('\n');
                sections.push(`【你的怀疑】\n${suspStr}`);
            }
        }

        // 投票记录摘要
        if (memory.voteHistory && memory.voteHistory.length > 0) {
            const lastDayVotes = memory.voteHistory.filter(v => v.day === memory.voteHistory[memory.voteHistory.length - 1].day);
            if (lastDayVotes.length > 0) {
                const voteStr = lastDayVotes.map(v => `${v.voterName}→${v.targetName}`).join('、');
                sections.push(`【上轮投票】${voteStr}`);
            }
        }

        return sections.join('\n\n');
    }
    /**
     * 解析 AI 发言回复（支持 JSON 外层带文字的情况）
     */
    static parseSpeechResponse(rawContent) {
        let content = rawContent;
        let emotion = 'normal';

        try {
            // 尝试寻找第一个 { 和最后一个 } 之间的内容，作为 JSON
            const startPos = rawContent.indexOf('{');
            const endPos = rawContent.lastIndexOf('}');
            if (startPos !== -1 && endPos !== -1 && endPos > startPos) {
                const jsonStr = rawContent.substring(startPos, endPos + 1);
                const parsed = JSON.parse(jsonStr);
                // 兼容不同的 key 名
                if (parsed.speech || parsed.content || parsed.text) {
                    content = parsed.speech || parsed.content || parsed.text;
                    emotion = parsed.emotion || 'normal';
                }
            } else {
                // 实在没有 JSON，尝试正则匹配
                const match = rawContent.match(/"speech"\s*:\s*"([^"]+)"/) || 
                              rawContent.match(/"content"\s*:\s*"([^"]+)"/) ||
                              rawContent.match(/"text"\s*:\s*"([^"]+)"/);
                if (match) content = match[1];
                
                const emoMatch = rawContent.match(/"emotion"\s*:\s*"([^"]+)"/);
                if (emoMatch) emotion = emoMatch[1];
            }
        } catch (e) {
            console.warn('[AI] JSON parse failed, using raw content');
        }

        return { content, emotion };
    }
}

module.exports = PromptBuilder;

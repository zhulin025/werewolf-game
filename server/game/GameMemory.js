/**
 * 游戏记忆系统
 *
 * 为每个 AI 玩家维护一份记忆，包含：
 * - 怀疑度追踪
 * - 投票历���
 * - 发言摘要
 * - 已知信息（查验结果等）
 * - 死亡时间线
 *
 * 记忆在游戏中自动更新，并注入到 LLM prompt 中
 */

class PlayerMemory {
    constructor(playerId, playerName) {
        this.playerId = playerId;
        this.playerName = playerName;

        // 怀疑度：playerId → { score: 0-10, reasons: string[] }
        this.suspicionMap = {};

        // 投票历史
        this.voteHistory = []; // { day, voterId, voterName, targetId, targetName }

        // 发言摘要
        this.speechDigest = []; // { day, playerId, playerName, content }

        // 私有已知信息（预言家查验结果等）
        this.knownInfo = []; // { day, type, targetId, targetName, result, description }

        // 死亡时间线
        this.deathTimeline = []; // { day, playerId, name, role, cause }
    }

    /**
     * 记录一条发言
     */
    addSpeech(day, playerId, playerName, content) {
        this.speechDigest.push({ day, playerId, playerName, content });
        // 保留最近 30 条
        if (this.speechDigest.length > 30) {
            this.speechDigest = this.speechDigest.slice(-30);
        }
    }

    /**
     * 记录一次投票
     */
    addVote(day, voterId, voterName, targetId, targetName) {
        this.voteHistory.push({ day, voterId, voterName, targetId, targetName });
    }

    /**
     * 记录一次死亡
     */
    addDeath(day, playerId, name, role, cause) {
        this.deathTimeline.push({ day, playerId, name, role, cause });
    }

    /**
     * 记录私有信息（如预言家查验）
     */
    addKnownInfo(day, type, targetId, targetName, result, description) {
        this.knownInfo.push({ day, type, targetId, targetName, result, description });
    }

    /**
     * 更新怀疑度
     */
    addSuspicion(targetId, targetName, delta, reason) {
        if (!this.suspicionMap[targetId]) {
            this.suspicionMap[targetId] = { name: targetName, score: 5, reasons: [] };
        }
        const entry = this.suspicionMap[targetId];
        entry.score = Math.max(0, Math.min(10, entry.score + delta));
        entry.reasons.push(reason);
        // 保留最近 5 条原因
        if (entry.reasons.length > 5) {
            entry.reasons = entry.reasons.slice(-5);
        }
    }

    /**
     * 分析投票联动 — 检测哪些玩家投票行为一致
     */
    detectVoteAlliances(day) {
        const dayVotes = this.voteHistory.filter(v => v.day === day);
        const alliances = {};

        for (let i = 0; i < dayVotes.length; i++) {
            for (let j = i + 1; j < dayVotes.length; j++) {
                if (dayVotes[i].targetId === dayVotes[j].targetId) {
                    const key = [dayVotes[i].voterId, dayVotes[j].voterId].sort().join('-');
                    alliances[key] = (alliances[key] || 0) + 1;
                }
            }
        }

        return alliances;
    }
}

/**
 * 游戏级记忆管理器
 */
class GameMemoryManager {
    constructor() {
        this.memories = new Map(); // playerId → PlayerMemory
    }

    /**
     * 为游戏中的所有玩家初始化记忆
     */
    initForPlayers(players) {
        for (const p of players) {
            this.memories.set(p.id, new PlayerMemory(p.id, p.name));
        }
    }

    /**
     * 获取指定玩家的记忆
     */
    getMemory(playerId) {
        return this.memories.get(playerId) || null;
    }

    /**
     * 广播发言到所有存活玩家的记忆
     */
    broadcastSpeech(day, speakerId, speakerName, content, alivePlayers) {
        for (const p of alivePlayers) {
            const mem = this.memories.get(p.id);
            if (mem) {
                mem.addSpeech(day, speakerId, speakerName, content);
            }
        }
    }

    /**
     * 广播投票到所有存活玩家的记忆
     */
    broadcastVote(day, voterId, voterName, targetId, targetName, alivePlayers) {
        for (const p of alivePlayers) {
            const mem = this.memories.get(p.id);
            if (mem) {
                mem.addVote(day, voterId, voterName, targetId, targetName);
            }
        }
    }

    /**
     * 广播死亡到所有存活玩家的记忆
     */
    broadcastDeath(day, deadPlayerId, deadName, deadRole, cause, alivePlayers, showRole = false) {
        for (const p of alivePlayers) {
            const mem = this.memories.get(p.id);
            if (mem) {
                // 只有投票出局才公开角色，被刀不公开
                const role = showRole ? deadRole : '未知';
                mem.addDeath(day, deadPlayerId, deadName, role, cause);
            }
        }
    }

    /**
     * 基于发言内容的轻量级怀疑分析
     * 检测发言中是否有指控、自证等关键词
     */
    analyzeSpeechSuspicion(speakerId, speakerName, content, alivePlayers) {
        const accusationPatterns = [
            /(\d+)号.*(?:狼|可疑|有问题|不对|骗人|假跳)/,
            /(?:投|怀疑|质疑).*?(\d+)/,
        ];

        for (const pattern of accusationPatterns) {
            const match = content.match(pattern);
            if (match) {
                const targetNum = parseInt(match[1]);
                // 在其他玩家眼中增加被指控者的怀疑度
                for (const p of alivePlayers) {
                    if (p.id === speakerId) continue;
                    const mem = this.memories.get(p.id);
                    if (mem) {
                        // 被指控的玩家怀疑度微增
                        const targetPlayer = alivePlayers.find(ap => ap.id === targetNum || (ap.id + 1) === targetNum);
                        if (targetPlayer) {
                            mem.addSuspicion(targetPlayer.id, targetPlayer.name, 1, `被${speakerName}指控`);
                        }
                    }
                }
            }
        }
    }
}

module.exports = { PlayerMemory, GameMemoryManager };

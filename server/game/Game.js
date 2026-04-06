/**
 * 狼人杀核心游戏引擎
 *
 * 服务端是单一信息源(single source of truth)
 * - Agent只收到自己应该知道的信息
 * - 观战者收到全部信息
 * - 所有游戏逻辑在服务端执行
 */

const { ROLES, GAME_MODES, DEFAULT_NAMES } = require('./GameModes');
const { randomUUID } = require('crypto');
const llmService = require('../llm/LLMService');
const PromptBuilder = require('../llm/PromptBuilder');
const { getFallbackPhrase } = require('../llm/FallbackPhrases');
const { GameMemoryManager } = require('./GameMemory');

class Game {
    constructor(gameId, mode = 'standard', settings = {}) {
        this.gameId = gameId;
        this.mode = mode;
        this.modeConfig = GAME_MODES[mode];
        this.players = [];
        this.phase = 'waiting'; // waiting, night, day, vote, end
        this.day = 0;
        this.settings = {
            actionTimeout: settings.actionTimeout || 30000, // 30s per action
            speakTimeout: settings.speakTimeout || 60000,   // 60s per speech
            voteTimeout: settings.voteTimeout || 20000,     // 20s per vote
        };

        // Night state (reset each night)
        this.nightActions = {
            wolfTarget: null,
            witchSaved: false,
            witchPoisonTarget: null,
            guardTarget: null,
        };

        // Persistent state across nights
        this.lastGuardTarget = null;
        this.witchHasAntidote = true;
        this.witchHasPoison = true;

        // Game log
        this.eventLog = [];
        this.deathRecords = [];

        // 当天发言记录（供 LLM prompt 上下文用）
        this.recentSpeeches = [];

        // 游戏记忆管理器
        this.memoryManager = new GameMemoryManager();

        // Pending action tracking
        this.pendingAction = null; // { requestId, playerId, resolve, timeout }

        // Callbacks
        this.onBroadcast = null;       // (msg) => {} — send to all agents
        this.onSendToAgent = null;     // (playerId, msg) => {} — send to one agent
        this.onSpectatorEvent = null;  // (msg) => {} — send to spectators
        this.onGameEnd = null;         // (winner) => {}
    }

    // ============ PLAYER MANAGEMENT ============

    get requiredPlayers() {
        return this.modeConfig.players;
    }

    get isFull() {
        return this.players.length >= this.requiredPlayers;
    }

    addPlayer(agentId, name) {
        if (this.isFull) return null;
        if (this.phase !== 'waiting') return null;

        const player = {
            id: this.players.length,
            agentId,
            name: name || DEFAULT_NAMES[this.players.length],
            role: null,
            roleName: null,
            camp: null,
            icon: null,
            type: null, // 'god', 'villager', 'wolf'
            isAlive: true,
            isBot: false,
        };
        this.players.push(player);
        return player;
    }

    addBot(index) {
        const player = {
            id: this.players.length,
            agentId: `bot-${this.players.length}`,
            name: DEFAULT_NAMES[index !== undefined ? index : this.players.length],
            role: null,
            roleName: null,
            camp: null,
            icon: null,
            type: null,
            isAlive: true,
            isBot: true,
        };
        this.players.push(player);
        return player;
    }

    getPlayerByAgentId(agentId) {
        return this.players.find(p => p.agentId === agentId);
    }

    // ============ INFORMATION ISOLATION ============

    /** Public player list — no role/camp info for living players */
    getPublicPlayers() {
        return this.players.map(p => ({
            id: p.id,
            name: p.name,
            is_alive: p.isAlive,
            is_bot: p.isBot,
            icon: p.isAlive ? '❓' : p.icon, // Hide icon (reveals role) while alive
        }));
    }

    /** Full player list for spectators — shows everything */
    getFullPlayers() {
        return this.players.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            roleName: p.roleName,
            camp: p.camp,
            icon: p.icon,
            type: p.type,
            is_alive: p.isAlive,
        }));
    }

    /** Role info sent to a specific agent */
    getRoleInfoForPlayer(player) {
        const info = {
            your_id: player.id,
            your_role: player.role,
            your_role_name: player.roleName,
            your_camp: player.camp,
            your_icon: player.icon,
            players: this.getPublicPlayers(),
        };

        // Wolves know their teammates
        if (player.camp === 'wolf') {
            info.teammates = this.players
                .filter(p => p.camp === 'wolf' && p.id !== player.id)
                .map(p => ({ id: p.id, name: p.name, role: p.role, roleName: p.roleName }));
        }

        return info;
    }

    // ============ GAME START ============

    start() {
        if (this.phase !== 'waiting') return false;

        // Assign roles
        const rolePool = [...this.modeConfig.roles];
        // Shuffle
        for (let i = rolePool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
        }

        for (let i = 0; i < this.players.length; i++) {
            const roleKey = rolePool[i];
            const role = ROLES[roleKey];
            this.players[i].role = roleKey;
            this.players[i].roleName = role.name;
            this.players[i].camp = role.camp;
            this.players[i].icon = role.icon;
            this.players[i].type = role.type;
        }

        // Notify each agent of their role (isolated info)
        for (const player of this.players) {
            if (!player.isBot) {
                this._sendToAgent(player.id, {
                    type: 'role_assigned',
                    payload: this.getRoleInfoForPlayer(player),
                });
            }
        }

        // Notify spectators of full state
        this._spectatorEvent({
            type: 'game_started',
            payload: {
                game_id: this.gameId,
                mode: this.mode,
                mode_name: this.modeConfig.name,
                players: this.getFullPlayers(),
            },
        });

        this._log('system', `游戏开始！模式：${this.modeConfig.name}`);

        // 初始化记忆系统，并在每个玩家上挂载记忆引用
        this.memoryManager.initForPlayers(this.players);
        for (const player of this.players) {
            player._memory = this.memoryManager.getMemory(player.id);
        }

        // Start first night after delay
        setTimeout(() => this.startNight(), 3000);
        return true;
    }

    // ============ NIGHT PHASE ============

    async startNight() {
        if (this.phase === 'end') return;

        this.day++;
        this.phase = 'night';
        this.nightActions = {
            wolfTarget: null,
            witchSaved: false,
            witchPoisonTarget: null,
            guardTarget: null,
        };

        this._broadcastPhase('night', this.day);
        this._log('night', `第${this.day}夜，夜幕降临`);

        try {
            await this._nightSequence();
        } catch (e) {
            console.error('Night sequence error:', e);
        }
    }

    async _nightSequence() {
        // 1. 狼人睁眼：选择击杀目标
        await this._wolfPhase();

        // 2. 女巫睁眼：得知被刀者，选择救人或毒人
        await this._witchPhase();

        // 3. 预言家睁眼：查验一人
        await this._prophetPhase();

        // 4. 守卫睁眼：守护一人
        await this._guardPhase();

        // 5. 猎人：仅首夜确认身份
        if (this.day === 1) {
            await this._hunterConfirm();
        }

        // 结算
        await this._resolveNightDeaths();

        if (this.checkWinCondition()) return;

        // 进入白天
        setTimeout(() => this.startDay(), 2000);
    }

    async _wolfPhase() {
        // Find wolf leader (WOLF_KING first, then first wolf)
        const wolves = this.players.filter(p => p.camp === 'wolf' && p.isAlive);
        if (wolves.length === 0) return;

        const leader = wolves.find(p => p.role === 'WOLF_KING') || wolves[0];
        const validTargets = this.players
            .filter(p => p.isAlive && p.camp !== 'wolf')
            .map(p => p.id);

        this._spectatorNightAction('WOLF', '狼人正在讨论击杀目标', wolves.map(p => p.id));

        // Wolves know each other
        const context = {
            action_desc: '请选择今晚要击杀的目标',
            teammates: wolves.filter(p => p.id !== leader.id).map(p => ({ id: p.id, name: p.name })),
        };

        const result = await this._requestAction(leader, 'night_kill', validTargets, context);
        const targetId = result?.target_id;
        const target = this.players.find(p => p.id === targetId && p.isAlive && p.camp !== 'wolf');

        if (target) {
            this.nightActions.wolfTarget = target;
            this._log('night', `狼人决定击杀 ${target.name}`);
        } else {
            // Default: random good player
            const goods = this.players.filter(p => p.isAlive && p.camp !== 'wolf');
            if (goods.length > 0) {
                this.nightActions.wolfTarget = goods[Math.floor(Math.random() * goods.length)];
                this._log('night', `狼人击杀 ${this.nightActions.wolfTarget.name}`);
            }
        }

        this._spectatorNightAction('WOLF', `狼人决定击杀 ${this.nightActions.wolfTarget?.name || '未知'}`, []);
    }

    async _witchPhase() {
        const witch = this.players.find(p => p.role === 'WITCH' && p.isAlive);
        if (!witch) return;

        const victim = this.nightActions.wolfTarget;
        const isSelfKilled = victim && victim.id === witch.id;
        const canSelfSave = isSelfKilled && this.day === 1;

        this._spectatorNightAction('WITCH', '女巫正在决策', [witch.id]);

        // Step 1: Decide whether to use antidote
        if (victim && this.witchHasAntidote && (canSelfSave || !isSelfKilled)) {
            const healContext = {
                action_desc: `${victim.name} 被狼人杀害，是否使用解药救人？`,
                victim_id: victim.id,
                victim_name: victim.name,
                is_self: isSelfKilled,
                has_antidote: true,
            };

            const healResult = await this._requestAction(witch, 'night_heal', [0, 1], healContext); // 0=no, 1=yes
            if (healResult?.target_id === 1) {
                this.witchHasAntidote = false;
                this.nightActions.witchSaved = true;
                this._log('night', '女巫使用了解药救人');
                this._spectatorNightAction('WITCH', '女巫使用了解药', []);
                return; // 不可同夜双药
            }
        }

        // Step 2: Decide whether to use poison (only if didn't heal)
        if (this.witchHasPoison) {
            const poisonTargets = this.players
                .filter(p => p.isAlive && p.id !== witch.id)
                .map(p => p.id);
            poisonTargets.unshift(-1); // -1 means skip

            const poisonContext = {
                action_desc: '是否使用毒药？选择-1跳过，或选择目标玩家ID',
                has_poison: true,
            };

            const poisonResult = await this._requestAction(witch, 'night_poison', poisonTargets, poisonContext);
            const poisonTargetId = poisonResult?.target_id;
            if (poisonTargetId !== undefined && poisonTargetId !== -1) {
                const poisonTarget = this.players.find(p => p.id === poisonTargetId && p.isAlive);
                if (poisonTarget) {
                    this.witchHasPoison = false;
                    this.nightActions.witchPoisonTarget = poisonTarget;
                    this._log('night', `女巫使用毒药毒杀 ${poisonTarget.name}`);
                    this._spectatorNightAction('WITCH', '女巫使用了毒药', []);
                    return;
                }
            }
        }

        this._spectatorNightAction('WITCH', '女巫没有使用药水', []);
    }

    async _prophetPhase() {
        const prophet = this.players.find(p => p.role === 'PROPHET' && p.isAlive);
        if (!prophet) return;

        const validTargets = this.players
            .filter(p => p.isAlive && p.id !== prophet.id)
            .map(p => p.id);

        this._spectatorNightAction('PROPHET', '预言家正在查验', [prophet.id]);

        const context = { action_desc: '请选择要查验的玩家' };
        const result = await this._requestAction(prophet, 'night_check', validTargets, context);
        const targetId = result?.target_id;
        let target = this.players.find(p => p.id === targetId && p.isAlive);

        if (!target) {
            // Default random check
            const others = this.players.filter(p => p.isAlive && p.id !== prophet.id);
            target = others[Math.floor(Math.random() * others.length)];
        }

        if (target) {
            const isWolf = target.camp === 'wolf';
            const resultText = isWolf ? '查杀（狼人）' : '金水（好人）';

            // Send private result to prophet only
            this._sendToAgent(prophet.id, {
                type: 'action_result',
                payload: {
                    action_type: 'night_check',
                    target_id: target.id,
                    target_name: target.name,
                    is_wolf: isWolf,
                    result_text: resultText,
                },
            });

            this._log('night', `预言家查验 ${target.name} → ${resultText}`);

            // 更新预言家的私有记忆
            const prophetMemory = this.memoryManager.getMemory(prophet.id);
            if (prophetMemory) {
                prophetMemory.addKnownInfo(this.day, 'check', target.id, target.name, isWolf ? '狼人' : '好人', `查验${target.name}：${resultText}`);
                // 根据查验结果调整怀疑度
                prophetMemory.addSuspicion(target.id, target.name, isWolf ? 5 : -5, `查验结果：${resultText}`);
            }

            this._spectatorNightAction('PROPHET', `预言家查验 ${target.name}：${resultText}`, []);
        }
    }

    async _guardPhase() {
        const guard = this.players.find(p => p.role === 'GUARD' && p.isAlive);
        if (!guard) return;

        // Cannot guard same person two nights in a row
        const validTargets = this.players
            .filter(p => p.isAlive && (!this.lastGuardTarget || p.id !== this.lastGuardTarget.id))
            .map(p => p.id);

        this._spectatorNightAction('GUARD', '守卫正在选择守护目标', [guard.id]);

        const context = {
            action_desc: '请选择要守护的玩家（不可连续守同一人）',
            last_guard_id: this.lastGuardTarget?.id,
        };
        const result = await this._requestAction(guard, 'night_guard', validTargets, context);
        const targetId = result?.target_id;
        let target = this.players.find(p => p.id === targetId && p.isAlive);

        // Validate: can't guard same as last night
        if (target && this.lastGuardTarget && target.id === this.lastGuardTarget.id) {
            target = null;
        }

        if (!target) {
            // Default random (excluding last guarded)
            const candidates = this.players.filter(p =>
                p.isAlive && (!this.lastGuardTarget || p.id !== this.lastGuardTarget.id)
            );
            target = candidates[Math.floor(Math.random() * candidates.length)];
        }

        if (target) {
            this.nightActions.guardTarget = target;
            this.lastGuardTarget = target;
            this._log('night', `守卫守护 ${target.name}`);
            this._spectatorNightAction('GUARD', `守卫守护 ${target.name}`, []);
        }
    }

    async _hunterConfirm() {
        const hunter = this.players.find(p => p.role === 'HUNTER' && p.isAlive);
        if (!hunter) return;

        this._spectatorNightAction('HUNTER', '猎人确认身份', [hunter.id]);

        // Just notify hunter, no action needed
        this._sendToAgent(hunter.id, {
            type: 'action_result',
            payload: {
                action_type: 'hunter_confirm',
                message: '你是猎人，当你被狼人杀死或被投票出局时可以开枪带走一人',
            },
        });

        this._log('night', '猎人确认身份');
        await this._delay(2000);
    }

    // ============ NIGHT RESOLUTION ============

    async _resolveNightDeaths() {
        const deaths = [];

        // 1. Wolf kill (can be saved by witch or blocked by guard)
        const wolfTarget = this.nightActions.wolfTarget;
        if (wolfTarget) {
            let saved = false;
            if (this.nightActions.witchSaved) {
                saved = true;
                this._log('night', `女巫解药救活 ${wolfTarget.name}`);
            }
            if (!saved && this.nightActions.guardTarget && this.nightActions.guardTarget.id === wolfTarget.id) {
                saved = true;
                this._log('night', `守卫守护成功，${wolfTarget.name} 安全`);
            }
            if (!saved) {
                deaths.push({ player: wolfTarget, cause: 'killed' });
            }
        }

        // 2. Witch poison (cannot be blocked by guard)
        if (this.nightActions.witchPoisonTarget) {
            const poisonVictim = this.nightActions.witchPoisonTarget;
            if (!deaths.find(d => d.player.id === poisonVictim.id)) {
                deaths.push({ player: poisonVictim, cause: 'poisoned' });
            }
        }

        // 3. Announce deaths
        if (deaths.length === 0) {
            this._broadcastPublic('night_result', { deaths: [], message: '昨夜是平安夜，无人死亡' });
            this._log('system', '平安夜，无人死亡');
        } else {
            for (const death of deaths) {
                death.player.isAlive = false;
                this.deathRecords.push({
                    name: death.player.name,
                    role: death.player.role,
                    roleName: death.player.roleName,
                    cause: death.cause,
                    day: this.day,
                });
            }

            // 更新记忆：夜间死亡（不公开角色）
            const aliveAfterNight = this.players.filter(p => p.isAlive);
            for (const d of deaths) {
                const causeText = d.cause === 'killed' ? '被狼人杀害' : '被毒死';
                this.memoryManager.broadcastDeath(this.day, d.player.id, d.player.name, d.player.roleName, causeText, aliveAfterNight, false);
            }

            const deathInfo = deaths.map(d => ({
                player_id: d.player.id,
                player_name: d.player.name,
                cause: d.cause,
            }));

            // Public announcement (no role info!)
            this._broadcastPublic('night_result', { deaths: deathInfo });

            // Spectator gets full info
            this._spectatorEvent({
                type: 'deaths',
                payload: {
                    deaths: deaths.map(d => ({
                        player_id: d.player.id,
                        player_name: d.player.name,
                        role: d.player.role,
                        roleName: d.player.roleName,
                        cause: d.cause,
                    })),
                },
            });

            // Last words for first night deaths (mandatory)
            for (const death of deaths) {
                if (this.day === 1) {
                    await this._requestLastWords(death.player);
                }

                // Hunter can shoot if killed by wolf (not by poison)
                if (death.player.role === 'HUNTER' && death.cause === 'killed') {
                    await this._hunterShoot(death.player);
                }
            }
        }

        // Send updated player state to spectators
        this._spectatorEvent({
            type: 'state_update',
            payload: { players: this.getFullPlayers(), phase: this.phase, day: this.day },
        });
    }

    // ============ DAY PHASE ============

    async startDay() {
        if (this.phase === 'end') return;
        this.phase = 'day';

        this._broadcastPhase('day', this.day);
        this._log('day', `第${this.day}天天亮了`);

        // 重置当天发言记录
        this.recentSpeeches = [];

        // Speaking phase
        const alivePlayers = this.players.filter(p => p.isAlive);
        for (const player of alivePlayers) {
            if (this.phase === 'end') return;

            // Request speech from agent
            const context = {
                action_desc: '请发表你的看法',
                alive_players: this.getPublicPlayers().filter(p => p.is_alive),
                day: this.day,
            };

            this._broadcastPublic('speaking_turn', {
                player_id: player.id,
                player_name: player.name,
            });

            const result = await this._requestAction(player, 'speak', [], context);
            const speech = result?.content || '过';
            const isAuto = !!(result?.is_auto || player.isBot);

            // 记录发言供后续玩家 prompt 使用
            this.recentSpeeches.push({ playerId: player.id, playerName: player.name, content: speech });

            // 更新所有玩家的记忆
            const aliveForMemory = this.players.filter(p => p.isAlive);
            this.memoryManager.broadcastSpeech(this.day, player.id, player.name, speech, aliveForMemory);
            this.memoryManager.analyzeSpeechSuspicion(player.id, player.name, speech, aliveForMemory);

            // Broadcast speech to all
            this._broadcastPublic('speech', {
                player_id: player.id,
                player_name: player.name,
                content: speech,
                is_auto: isAuto,
            });

            this._log('speak', `${player.name}：${speech}`);
            await this._delay(1000);
        }

        if (this.phase === 'end') return;

        // Voting phase
        await this.startVoting();
    }

    // ============ VOTING PHASE ============

    async startVoting() {
        if (this.phase === 'end') return;
        this.phase = 'vote';

        this._broadcastPhase('vote', this.day);
        this._log('vote', '投票环节开始');

        const alivePlayers = this.players.filter(p => p.isAlive);
        const votes = {};

        for (const player of alivePlayers) {
            if (this.phase === 'end') return;

            const validTargets = alivePlayers.filter(p => p.id !== player.id).map(p => p.id);
            const context = {
                action_desc: '请投票选择要放逐的玩家',
                alive_players: this.getPublicPlayers().filter(p => p.is_alive),
            };

            const result = await this._requestAction(player, 'vote', validTargets, context);
            let targetId = result?.target_id;
            let isAuto = !!(result?.is_auto || player.isBot);

            // Validate
            if (!validTargets.includes(targetId)) {
                targetId = validTargets[Math.floor(Math.random() * validTargets.length)];
                isAuto = true; // Invalid response treated as auto
            }

            votes[player.id] = targetId;
            const target = this.players.find(p => p.id === targetId);

            // 更新投票记忆
            const aliveForVote = this.players.filter(p => p.isAlive);
            this.memoryManager.broadcastVote(this.day, player.id, player.name, targetId, target?.name || '未知', aliveForVote);

            this._broadcastPublic('vote_cast', {
                voter_id: player.id,
                voter_name: player.name,
                target_id: targetId,
                target_name: target?.name,
                is_auto: isAuto,
            });

            this._log('vote', `${player.name} 投了 ${target?.name}`);
            await this._delay(500);
        }

        // Tally votes
        await this._resolveVoting(votes);
    }

    async _resolveVoting(votes) {
        const voteCount = {};
        for (const targetId of Object.values(votes)) {
            voteCount[targetId] = (voteCount[targetId] || 0) + 1;
        }

        // Broadcast vote counts
        const voteSummary = Object.entries(voteCount).map(([id, count]) => {
            const p = this.players.find(p => p.id === parseInt(id));
            return { player_id: parseInt(id), player_name: p?.name, count };
        }).sort((a, b) => b.count - a.count);

        this._broadcastPublic('vote_result', { votes: voteSummary });

        // Find most voted
        let maxVotes = 0;
        let mostVoted = null;
        let isTie = false;

        for (const [id, count] of Object.entries(voteCount)) {
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = this.players.find(p => p.id === parseInt(id));
                isTie = false;
            } else if (count === maxVotes) {
                isTie = true;
            }
        }

        if (isTie) {
            // Tie: random from tied players
            const tiedPlayers = Object.entries(voteCount)
                .filter(([_, count]) => count === maxVotes)
                .map(([id]) => this.players.find(p => p.id === parseInt(id)));
            mostVoted = tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)];
            this._broadcastPublic('tie_broken', {
                player_id: mostVoted.id,
                player_name: mostVoted.name,
                message: `平票，随机选择 ${mostVoted.name} 出局`,
            });
        }

        if (mostVoted) {
            this._broadcastPublic('elimination', {
                player_id: mostVoted.id,
                player_name: mostVoted.name,
                votes: maxVotes,
            });

            // Last words
            await this._requestLastWords(mostVoted);

            mostVoted.isAlive = false;
            this.deathRecords.push({
                name: mostVoted.name,
                role: mostVoted.role,
                roleName: mostVoted.roleName,
                cause: 'vote',
                day: this.day,
            });

            this._log('death', `${mostVoted.name} 被投票出局（${maxVotes}票）`);

            // 更新记忆：投票出局（公开角色）
            const aliveAfterVote = this.players.filter(p => p.isAlive);
            this.memoryManager.broadcastDeath(this.day, mostVoted.id, mostVoted.name, mostVoted.roleName, '被投票出局', aliveAfterVote, true);

            // Spectator sees the role
            this._spectatorEvent({
                type: 'deaths',
                payload: {
                    deaths: [{
                        player_id: mostVoted.id,
                        player_name: mostVoted.name,
                        role: mostVoted.role,
                        roleName: mostVoted.roleName,
                        cause: 'vote',
                    }],
                },
            });

            // Hunter shot on vote death
            if (mostVoted.role === 'HUNTER') {
                await this._hunterShoot(mostVoted);
            }

            // Wolf King shot on vote death
            if (mostVoted.role === 'WOLF_KING') {
                await this._wolfKingShoot(mostVoted);
            }
        }

        // Send updated state
        this._spectatorEvent({
            type: 'state_update',
            payload: { players: this.getFullPlayers(), phase: this.phase, day: this.day },
        });

        if (this.checkWinCondition()) return;

        // Next night
        setTimeout(() => this.startNight(), 3000);
    }

    // ============ SPECIAL ABILITIES ============

    async _hunterShoot(hunter) {
        const validTargets = this.players.filter(p => p.isAlive).map(p => p.id);
        if (validTargets.length === 0) return;

        const context = { action_desc: '猎人发动技能，请选择要带走的玩家' };
        const result = await this._requestAction(hunter, 'hunter_shoot', validTargets, context);
        let targetId = result?.target_id;
        let target = this.players.find(p => p.id === targetId && p.isAlive);

        if (!target) {
            // Default: random wolf
            const wolves = this.players.filter(p => p.isAlive && p.camp === 'wolf');
            target = wolves.length > 0
                ? wolves[Math.floor(Math.random() * wolves.length)]
                : this.players.filter(p => p.isAlive)[0];
        }

        if (target) {
            target.isAlive = false;
            this.deathRecords.push({
                name: target.name, role: target.role, roleName: target.roleName,
                cause: 'hunter', day: this.day,
            });

            this._broadcastPublic('death', {
                player_id: target.id,
                player_name: target.name,
                cause: 'hunter',
                message: `猎人开枪带走了 ${target.name}`,
            });

            this._log('death', `猎人开枪带走了 ${target.name}`);
        }
    }

    async _wolfKingShoot(wolfKing) {
        const validTargets = this.players.filter(p => p.isAlive && p.camp === 'good').map(p => p.id);
        if (validTargets.length === 0) return;

        const context = { action_desc: '狼王发动技能，请选择要带走的玩家' };
        const result = await this._requestAction(wolfKing, 'wolf_king_shoot', validTargets, context);
        let targetId = result?.target_id;
        let target = this.players.find(p => p.id === targetId && p.isAlive && p.camp === 'good');

        if (!target) {
            target = this.players.filter(p => p.isAlive && p.camp === 'good')[0];
        }

        if (target) {
            target.isAlive = false;
            this.deathRecords.push({
                name: target.name, role: target.role, roleName: target.roleName,
                cause: 'wolfking', day: this.day,
            });

            this._broadcastPublic('death', {
                player_id: target.id,
                player_name: target.name,
                cause: 'wolfking',
                message: `狼王开枪带走了 ${target.name}`,
            });

            this._log('death', `狼王开枪带走了 ${target.name}`);
        }
    }

    async _requestLastWords(player) {
        const context = { action_desc: '请发表遗言' };
        const result = await this._requestAction(player, 'last_words', [], context);
        const words = result?.content || '无遗言';
        const isAuto = !!(result?.is_auto || player.isBot);

        this._broadcastPublic('last_words', {
            player_id: player.id,
            player_name: player.name,
            content: words,
            is_auto: isAuto,
        });

        this._log('death', `${player.name} 的遗言：${words}`);
    }

    // ============ WIN CONDITION ============

    checkWinCondition() {
        const alive = this.players.filter(p => p.isAlive);
        const aliveWolves = alive.filter(p => p.camp === 'wolf').length;
        const aliveGods = alive.filter(p => p.type === 'god').length;
        const aliveVillagers = alive.filter(p => p.type === 'villager').length;

        if (aliveWolves === 0) {
            this._endGame('good', '所有狼人被放逐，好人胜利！');
            return true;
        }

        if (aliveGods === 0) {
            this._endGame('wolf', '所有神职已阵亡，狼人屠城胜利！');
            return true;
        }

        if (aliveVillagers === 0) {
            this._endGame('wolf', '所有平民已阵亡，狼人屠边胜利！');
            return true;
        }

        return false;
    }

    _endGame(winner, message) {
        if (this.phase === 'end') return;
        this.phase = 'end';

        // Cancel pending action
        if (this.pendingAction) {
            clearTimeout(this.pendingAction.timeout);
            this.pendingAction.resolve({ target_id: null, content: '' });
            this.pendingAction = null;
        }

        const payload = {
            winner,
            message,
            day: this.day,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                role: p.role,
                roleName: p.roleName,
                camp: p.camp,
                survived: p.isAlive,
            })),
            death_records: this.deathRecords,
        };

        this._broadcast({ type: 'game_end', payload });
        this._spectatorEvent({ type: 'game_end', payload });
        this._log('system', message);

        if (this.onGameEnd) this.onGameEnd(winner);
    }

    // ============ ACTION REQUEST SYSTEM ============

    /**
     * Request an action from a player (agent or bot).
     * Returns a Promise that resolves with the action response.
     */
    _requestAction(player, actionType, validTargets, context = {}) {
        return new Promise((resolve) => {
            const requestId = randomUUID();

            if (player.isBot) {
                // Bot: 优先用 LLM 生成，失败则回退到本地决策
                this._llmDecision(player, actionType, validTargets, context).then(resolve);
                return;
            }

            // Get detailed guidance for Agent
            const guidanceMap = {
                'night_kill': "你是狼人，请选择一名非狼人玩家进行击杀。输入目标玩家 ID。",
                'night_heal': "你是女巫，今晚有人被杀。选择 1 使用解药救人，选择 0 不救。",
                'night_poison': "你是女巫，选择一名玩家使用毒药，或输入 -1 跳过。",
                'night_check': "你是预言家，请选择一名玩家查验其身份。",
                'night_guard': "你是守卫，请选择一名玩家进行守护，使其免受狼刀伤害（不能连守）。",
                'speak': "现在是你的发言时间。请分析局势、各玩家发言，给出你的逻辑推理。建议 50 字内。",
                'vote': "请投出你认为最有狼人嫌疑的玩家 ID。",
                'hunter_shoot': "猎人技能发动，请选择一名玩家带走。",
                'wolf_king_shoot': "狼王技能发动，请选择一名玩家带走。",
                'last_words': "请发表你的遗言。"
            };

            // Send request to agent
            this._sendToAgent(player.id, {
                type: 'action_request',
                payload: {
                    request_id: requestId,
                    action_type: actionType,
                    context,
                    valid_targets: validTargets,
                    guidance: guidanceMap[actionType] || "请根据当前游戏阶段进行操作。",
                    timeout_ms: this.settings.actionTimeout,
                },
            });

            // Determine timeout based on action type
            const timeout = actionType === 'speak' ? this.settings.speakTimeout
                : actionType === 'vote' ? this.settings.voteTimeout
                : this.settings.actionTimeout;

            // Set timeout for response
            const timeoutId = setTimeout(() => {
                if (this.pendingAction && this.pendingAction.requestId === requestId) {
                    this.pendingAction = null;
                    const botDecision = this._botFallback(player, actionType, validTargets, context);
                    botDecision.is_auto = true; // Mark as system-generated due to timeout (仅真人 Agent 超时)
                    // Notify agent that they timed out and bot decided for them
                    this._sendToAgent(player.id, {
                        type: 'action_timeout',
                        payload: {
                            request_id: requestId,
                            action_type: actionType,
                            message: '响应超时，已自动代为决策',
                            auto_decision: botDecision,
                        },
                    });
                    resolve(botDecision);
                }
            }, timeout);

            this.pendingAction = { requestId, playerId: player.id, resolve, timeout: timeoutId };
        });
    }

    /**
     * Called when an agent sends an action_response message.
     */
    handleActionResponse(agentId, payload) {
        if (!this.pendingAction) return false;

        const player = this.getPlayerByAgentId(agentId);
        if (!player || player.id !== this.pendingAction.playerId) return false;
        if (payload.request_id !== this.pendingAction.requestId) return false;

        clearTimeout(this.pendingAction.timeout);
        const resolve = this.pendingAction.resolve;
        this.pendingAction = null;
        resolve(payload);
        return true;
    }

    // ============ LLM-POWERED BOT DECISIONS ============

    /**
     * Bot 的 LLM 决策 — 优先用 LLM，失败回退到 _botFallback
     */
    async _llmDecision(player, actionType, validTargets, context) {
        // 模拟思考延迟（1-3秒，让体验更自然）
        await this._delay(1000 + Math.random() * 2000);

        if (!llmService.isConfigured) {
            return this._botFallback(player, actionType, validTargets, context);
        }

        try {
            const gameState = {
                day: this.day,
                phase: this.phase,
                players: this.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    isAlive: p.isAlive,
                    camp: player.camp === 'wolf' ? p.camp : undefined, // 狼人才知道阵营
                    role: p.id === player.id ? p.role : undefined,
                })),
                recentSpeeches: this.recentSpeeches,
                deathRecords: this.deathRecords,
            };

            if (actionType === 'speak') {
                return await this._llmSpeak(player, gameState);
            } else if (actionType === 'last_words') {
                return await this._llmLastWords(player, gameState);
            } else if (actionType === 'vote') {
                return await this._llmVote(player, gameState, validTargets);
            } else {
                return await this._llmNightAction(player, gameState, actionType, validTargets, context);
            }
        } catch (err) {
            console.error(`[LLM] ${player.name} ${actionType} failed:`, err.message);
            return this._botFallback(player, actionType, validTargets, context);
        }
    }

    async _llmSpeak(player, gameState) {
        const { systemPrompt, userPrompt } = PromptBuilder.buildSpeechPrompt({
            player, gameState, memory: player._memory,
        });
        const content = await llmService.call(systemPrompt, userPrompt, { maxTokens: 800 });
        return { content };
    }

    async _llmLastWords(player, gameState) {
        const { systemPrompt, userPrompt } = PromptBuilder.buildSpeechPrompt({
            player, gameState, memory: player._memory,
        });
        const lastWordsPrompt = userPrompt + '\n\n你即将被出局，请发表你的遗言。遗言要有信息量，帮助你的阵营。30-60字。';
        const content = await llmService.call(systemPrompt, lastWordsPrompt, { maxTokens: 600 });
        return { content };
    }

    async _llmVote(player, gameState, validTargets) {
        const { systemPrompt, userPrompt } = PromptBuilder.buildVotePrompt({
            player, gameState, validTargets, memory: player._memory,
        });
        const response = await llmService.call(systemPrompt, userPrompt, { maxTokens: 300, temperature: 0.5 });
        const match = response.match(/(\d+)/);
        if (match) {
            const targetId = parseInt(match[1]);
            if (validTargets.includes(targetId)) {
                return { target_id: targetId };
            }
        }
        // LLM 返回无效 → fallback
        return { target_id: validTargets[Math.floor(Math.random() * validTargets.length)] };
    }

    async _llmNightAction(player, gameState, actionType, validTargets, context) {
        const { systemPrompt, userPrompt } = PromptBuilder.buildNightActionPrompt({
            player, gameState, actionType, validTargets, context, memory: player._memory,
        });
        const response = await llmService.call(systemPrompt, userPrompt, { maxTokens: 300, temperature: 0.5 });
        const match = response.match(/-?\d+/);
        if (match) {
            const targetId = parseInt(match[0]);
            if (validTargets.includes(targetId)) {
                return { target_id: targetId };
            }
        }
        // LLM 返回无效 → fallback
        return this._botFallback(player, actionType, validTargets, context);
    }

    // ============ BOT FALLBACK DECISIONS ============

    _botFallback(player, actionType, validTargets, context) {
        switch (actionType) {
            case 'night_kill': {
                const gods = this.players.filter(p =>
                    p.isAlive && p.camp === 'good' && p.type === 'god'
                );
                const target = gods.length > 0
                    ? gods[Math.floor(Math.random() * gods.length)]
                    : this.players.filter(p => p.isAlive && p.camp === 'good')[0];
                return { target_id: target?.id };
            }

            case 'night_heal':
                // 60% chance to heal
                return { target_id: Math.random() < 0.6 ? 1 : 0 };

            case 'night_poison': {
                // 20% chance to poison a random player
                if (Math.random() < 0.2 && validTargets.length > 1) {
                    const targets = validTargets.filter(id => id !== -1);
                    return { target_id: targets[Math.floor(Math.random() * targets.length)] };
                }
                return { target_id: -1 };
            }

            case 'night_check': {
                const target = validTargets[Math.floor(Math.random() * validTargets.length)];
                return { target_id: target };
            }

            case 'night_guard': {
                const target = validTargets[Math.floor(Math.random() * validTargets.length)];
                return { target_id: target };
            }

            case 'speak': {
                return { content: getFallbackPhrase(player.name, player.role, 'speak') };
            }

            case 'vote': {
                const target = validTargets[Math.floor(Math.random() * validTargets.length)];
                return { target_id: target };
            }

            case 'hunter_shoot':
            case 'wolf_king_shoot': {
                const target = validTargets[Math.floor(Math.random() * validTargets.length)];
                return { target_id: target };
            }

            case 'last_words': {
                return { content: getFallbackPhrase(player.name, player.role, 'lastWords') };
            }

            default:
                return { target_id: validTargets?.[0], content: '过' };
        }
    }

    // ============ MESSAGING HELPERS ============

    _broadcast(msg) {
        if (this.onBroadcast) this.onBroadcast(msg);
    }

    _sendToAgent(playerId, msg) {
        if (this.onSendToAgent) this.onSendToAgent(playerId, msg);
    }

    _spectatorEvent(msg) {
        if (this.onSpectatorEvent) this.onSpectatorEvent(msg);
    }

    _broadcastPhase(phase, day) {
        this._broadcast({ type: 'phase_change', payload: { phase, day } });
        this._spectatorEvent({ type: 'phase_change', payload: { phase, day } });
    }

    _broadcastPublic(event, data) {
        this._broadcast({ type: 'public_event', payload: { event, ...data } });
        this._spectatorEvent({ type: 'public_event', payload: { event, ...data } });
    }

    _spectatorNightAction(role, description, playerIds) {
        this._spectatorEvent({
            type: 'night_action',
            payload: { role, description, player_ids: playerIds },
        });
    }

    _log(type, message) {
        const entry = { type, message, day: this.day, timestamp: Date.now() };
        this.eventLog.push(entry);
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============ STATE SNAPSHOT ============

    getSpectatorState() {
        return {
            game_id: this.gameId,
            mode: this.mode,
            mode_name: this.modeConfig.name,
            phase: this.phase,
            day: this.day,
            players: this.getFullPlayers(),
            death_records: this.deathRecords,
            event_log: this.eventLog.slice(-50), // Last 50 events
            witch_has_antidote: this.witchHasAntidote,
            witch_has_poison: this.witchHasPoison,
        };
    }
}

module.exports = Game;

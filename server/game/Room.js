/**
 * 房间管理 — 大厅 → 倒计时 → 游戏中 → 结束
 */

const Game = require('./Game');
const { GAME_MODES } = require('./GameModes');

class Room {
    constructor(roomId, options = {}) {
        this.roomId = roomId;
        this.name = options.name || `房间${roomId.slice(-4)}`;
        this.mode = options.mode || 'standard';
        this.modeConfig = GAME_MODES[this.mode] || GAME_MODES['standard'];
        this.createdAt = Date.now();

        // Connections: agentId -> { ws, name, type: 'agent'|'spectator' }
        this.connections = new Map();

        // Game instance (created on start)
        this.game = null;
        this.status = 'waiting'; // waiting, countdown, playing, finished

        // Countdown
        this.countdownTimer = null;
        this.countdownSeconds = 0;

        // Settings passed to Game
        this.gameSettings = options.settings || {};

        // Auto-fill with bots
        this.autoFillBots = options.autoFillBots !== false;
        // Auto-start countdown when enough players join
        this.autoStartThreshold = options.autoStartThreshold || this.modeConfig.players;
    }

    // ============ CONNECTION MANAGEMENT ============

    addAgent(agentId, ws, name) {
        // Allow reconnection if game is playing and agent was already a player
        if (this.status === 'playing' && this.game) {
            const existingPlayer = this.game.getPlayerByAgentId(agentId);
            if (existingPlayer) {
                // Reconnect: update the websocket connection
                this.connections.set(agentId, { ws, name: existingPlayer.name, type: 'agent' });
                console.log(`[Room] Agent ${agentId} reconnected to playing game`);

                // Send current game state so agent can catch up
                ws.send(JSON.stringify({
                    type: 'reconnected',
                    payload: {
                        message: '重新连接成功',
                        your_id: existingPlayer.id,
                        your_role: existingPlayer.role,
                        your_role_name: existingPlayer.roleName,
                        your_camp: existingPlayer.camp,
                        players: this.game.getPublicPlayers(),
                        day: this.game.day,
                        phase: this.game.phase,
                    },
                }));
                return { ok: true, reconnected: true };
            }
            return { ok: false, error: '游戏已开始，无法加入新玩家' };
        }

        if (this.status !== 'waiting' && this.status !== 'countdown') return { ok: false, error: '房间已开始游戏' };

        const agentCount = this.getAgentCount();
        if (agentCount >= this.modeConfig.players) return { ok: false, error: '房间已满' };

        this.connections.set(agentId, { ws, name, type: 'agent' });

        // Notify everyone
        this._broadcastRoomState();

        // Check auto-start
        if (this.getAgentCount() >= this.autoStartThreshold && this.status === 'waiting') {
            this.startCountdown();
        }

        return { ok: true, agent_count: this.getAgentCount(), required: this.modeConfig.players };
    }

    addSpectator(spectatorId, ws, name) {
        this.connections.set(spectatorId, { ws, name: name || '观众', type: 'spectator' });

        // Send current state immediately
        if (this.game) {
            this._sendTo(spectatorId, { type: 'game_state', payload: this.game.getSpectatorState() });
        } else {
            this._sendTo(spectatorId, { type: 'room_state', payload: this.getRoomInfo() });
        }

        return { ok: true };
    }

    removeConnection(id) {
        const conn = this.connections.get(id);
        if (!conn) return;

        this.connections.delete(id);

        if (conn.type === 'agent' && (this.status === 'waiting' || this.status === 'countdown')) {
            // Cancel countdown if not enough players
            if (this.status === 'countdown' && this.getAgentCount() < this.autoStartThreshold) {
                this.cancelCountdown();
            }
            this._broadcastRoomState();
        }
    }

    getAgentCount() {
        let count = 0;
        for (const conn of this.connections.values()) {
            if (conn.type === 'agent') count++;
        }
        return count;
    }

    getAgents() {
        const agents = [];
        for (const [id, conn] of this.connections.entries()) {
            if (conn.type === 'agent') agents.push({ id, name: conn.name });
        }
        return agents;
    }

    // ============ COUNTDOWN ============

    startCountdown(seconds = 10) {
        if (this.status !== 'waiting') return;
        this.status = 'countdown';
        this.countdownSeconds = seconds;

        this._broadcastAll({ type: 'countdown_start', payload: { seconds } });

        this.countdownTimer = setInterval(() => {
            this.countdownSeconds--;
            this._broadcastAll({ type: 'countdown_tick', payload: { seconds: this.countdownSeconds } });

            if (this.countdownSeconds <= 0) {
                clearInterval(this.countdownTimer);
                this.countdownTimer = null;
                this.startGame();
            }
        }, 1000);
    }

    cancelCountdown() {
        if (this.status !== 'countdown') return;
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.status = 'waiting';
        this._broadcastAll({ type: 'countdown_cancelled', payload: {} });
    }

    // ============ GAME LIFECYCLE ============

    startGame() {
        if (this.status === 'playing') return;
        this.status = 'playing';

        this.game = new Game(this.roomId, this.mode, this.gameSettings);

        // Add real agents as players
        for (const [agentId, conn] of this.connections.entries()) {
            if (conn.type === 'agent') {
                this.game.addPlayer(agentId, conn.name);
            }
        }

        // Fill remaining slots with bots
        if (this.autoFillBots) {
            while (!this.game.isFull) {
                this.game.addBot();
            }
        }

        // Wire up game callbacks
        this.game.onBroadcast = (msg) => {
            // Send to all agents (with information isolation — only public info)
            for (const [id, conn] of this.connections.entries()) {
                if (conn.type === 'agent' && conn.ws.readyState === 1) {
                    try { conn.ws.send(JSON.stringify(msg)); } catch (e) {}
                }
            }
        };

        this.game.onSendToAgent = (playerId, msg) => {
            const player = this.game.players[playerId];
            if (!player || player.isBot) return;
            const conn = this.connections.get(player.agentId);
            if (conn && conn.ws.readyState === 1) {
                try { conn.ws.send(JSON.stringify(msg)); } catch (e) {}
            }
        };

        this.game.onSpectatorEvent = (msg) => {
            for (const [id, conn] of this.connections.entries()) {
                if (conn.type === 'spectator' && conn.ws.readyState === 1) {
                    try { conn.ws.send(JSON.stringify(msg)); } catch (e) {}
                }
            }
        };

        this.game.onGameEnd = (winner) => {
            this.status = 'finished';
            this._broadcastRoomState();
        };

        // Start the game
        this.game.start();

        this._broadcastAll({
            type: 'game_started',
            payload: { room_id: this.roomId, mode: this.mode, mode_name: this.modeConfig.name },
        });
    }

    // Handle action response from agent
    handleAgentMessage(agentId, msg) {
        if (!this.game) return false;

        if (msg.type === 'action_response') {
            return this.game.handleActionResponse(agentId, msg.payload);
        }

        return false;
    }

    // ============ MESSAGING ============

    _sendTo(id, msg) {
        const conn = this.connections.get(id);
        if (conn && conn.ws.readyState === 1) {
            try { conn.ws.send(JSON.stringify(msg)); } catch (e) {}
        }
    }

    _broadcastAll(msg) {
        const data = JSON.stringify(msg);
        for (const conn of this.connections.values()) {
            if (conn.ws.readyState === 1) {
                try { conn.ws.send(data); } catch (e) {}
            }
        }
    }

    _broadcastRoomState() {
        this._broadcastAll({ type: 'room_state', payload: this.getRoomInfo() });
    }

    // ============ STATE ============

    getRoomInfo() {
        return {
            room_id: this.roomId,
            name: this.name,
            mode: this.mode,
            mode_name: this.modeConfig.name,
            status: this.status,
            agent_count: this.getAgentCount(),
            required_players: this.modeConfig.players,
            agents: this.getAgents(),
            spectator_count: [...this.connections.values()].filter(c => c.type === 'spectator').length,
            created_at: this.createdAt,
        };
    }

    destroy() {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        for (const conn of this.connections.values()) {
            if (conn.ws.readyState === 1) {
                try { conn.ws.close(1000, 'Room destroyed'); } catch (e) {}
            }
        }
        this.connections.clear();
    }
}

module.exports = Room;

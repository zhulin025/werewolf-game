/**
 * AI狼人杀 - 多Agent游戏服务器
 * 支持WebSocket和HTTP两种接入方式
 */

const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ============ GAME CONFIGURATION ============
const ROLES = {
    VILLAGER: { name: '村民', camp: 'good', icon: '👤' },
    PROPHET: { name: '预言家', camp: 'good', icon: '🔮' },
    WITCH: { name: '女巫', camp: 'good', icon: '🧪' },
    GUARD: { name: '守卫', camp: 'good', icon: '🛡️' },
    HUNTER: { name: '猎人', camp: 'good', icon: '🏹' },
    WOLF: { name: '普通狼人', camp: 'wolf', icon: '🐺' },
    WOLF_KING: { name: '狼王', camp: 'wolf', icon: '👑' }
};

const DEFAULT_NAMES = [
    '豆包', '千问', 'Deepseek', 'Gemini', 'ChatGPT', 'Grok',
    'Kimi', 'Claude', 'Claude Ops', 'GLM', 'Minimax', '小米'
];

const PORT = process.env.PORT || 3000;

// ============ GAME STATE ============
let games = new Map(); // gameId -> Game
let agents = new Map(); // agentId -> Agent

class Game {
    constructor(gameId, settings = {}) {
        this.gameId = gameId;
        this.players = [];
        this.phase = 'waiting'; // waiting, night, day, vote, end
        this.day = 0;
        this.currentSpeaker = 0;
        this.speakingOrder = [];
        this.votes = {};
        this.settings = {
            speaking_time: settings.speaking_time || 30,
            voting_time: settings.voting_time || 30,
            night_time: settings.night_time || 20
        };
        this.nightActions = {};
        this.deathRecord = [];
    }

    addPlayer(agent) {
        if (this.players.length >= 12) {
            return { success: false, error: '游戏已满' };
        }

        const player = {
            id: this.players.length,
            agent_id: agent.agentId,
            name: agent.name,
            role: null,
            roleName: null,
            camp: null,
            icon: null,
            isAlive: true,
            isAI: agent.isBot,
            isYou: false,
            ws: agent.ws
        };

        this.players.push(player);
        agent.playerId = player.id;

        return { success: true, player };
    }

    start() {
        // Assign roles
        const rolePool = [
            'VILLAGER', 'VILLAGER', 'VILLAGER', 'VILLAGER',
            'PROPHET', 'WITCH', 'GUARD', 'HUNTER',
            'WOLF', 'WOLF', 'WOLF', 'WOLF_KING'
        ];

        // Shuffle
        for (let i = rolePool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
        }

        // Fill with bots if not enough players
        while (this.players.length < 12) {
            const botId = `bot-${this.players.length}`;
            const botPlayer = {
                id: this.players.length,
                agent_id: botId,
                name: DEFAULT_NAMES[this.players.length],
                role: null,
                roleName: null,
                camp: null,
                icon: null,
                isAlive: true,
                isAI: true,
                isYou: false,
                ws: null,
                isBot: true
            };
            this.players.push(botPlayer);
        }

        // Assign roles
        for (let i = 0; i < this.players.length; i++) {
            const roleKey = rolePool[i];
            const role = ROLES[roleKey];
            this.players[i].role = roleKey;
            this.players[i].roleName = role.name;
            this.players[i].camp = role.camp;
            this.players[i].icon = role.icon;
        }

        // Assign player names
        for (let i = 0; i < this.players.length; i++) {
            this.players[i].name = DEFAULT_NAMES[i];
        }

        // Notify all players of their roles
        this.broadcast({
            type: 'game_state',
            payload: this.getStateForPlayer(null)
        });

        // Start first night
        setTimeout(() => this.startNight(), 3000);

        return true;
    }

    getStateForPlayer(player) {
        return {
            game_id: this.gameId,
            phase: this.phase,
            day: this.day,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                role: p.isAlive ? p.role : null,
                role_name: p.isAlive ? p.roleName : null,
                camp: p.isAlive ? p.camp : null,
                icon: p.icon,
                is_alive: p.isAlive,
                is_you: player && p.id === player.id
            })),
            your_role: player ? {
                role: player.role,
                role_name: player.roleName,
                camp: player.camp
            } : null,
            actions_available: this.getAvailableActions(player)
        };
    }

    getAvailableActions(player) {
        if (!player || !player.isAlive) return [];

        const actions = [];
        if (this.phase === 'day') actions.push('speak');
        if (this.phase === 'vote') actions.push('vote');
        if (this.phase === 'night') {
            if (player.role === 'PROPHET') actions.push('check');
            if (player.role === 'WITCH') actions.push('heal', 'poison');
            if (player.role === 'GUARD') actions.push('guard');
            if (player.camp === 'wolf') actions.push('kill');
        }
        return actions;
    }

    broadcast(msg) {
        const data = JSON.stringify(msg);
        for (const player of this.players) {
            if (player.ws) {
                player.ws.send(data);
            }
        }
    }

    sendTo(player, msg) {
        if (player && player.ws) {
            player.ws.send(JSON.stringify(msg));
        }
    }

    async startNight() {
        this.day++;
        this.phase = 'night';
        this.nightActions = {};

        this.broadcast({
            type: 'game_state',
            payload: this.getStateForPlayer(null)
        });

        // Night sequence
        await this.nightSequence();
    }

    async nightSequence() {
        // Guard
        await this.nightAction('GUARD', 'guard', '守');

        // Wolf kill
        await this.nightAction('WOLF', 'kill', '刀');

        // Witch
        await this.nightAction('WITCH', 'heal', '救');

        // Prophet
        await this.nightAction('PROPHET', 'check', '验');

        // Resolve deaths
        this.resolveNightDeaths();

        // Check win
        if (this.checkWinCondition()) return;

        // Day
        this.startDay();
    }

    async nightAction(roleKey, actionName, actionCN) {
        const player = this.players.find(p => p.role === roleKey && p.isAlive);
        if (!player) return null;

        this.sendTo(player, {
            type: 'action_required',
            payload: {
                action_type: 'night_action',
                action_name: actionName,
                time_limit: this.settings.night_time * 1000
            }
        });

        // Wait for action or timeout
        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                this.nightActions[player.id] = { action: actionName, target_id: null };
                resolve(null);
            }, this.settings.night_time * 1000);

            // Bot takes random action
            if (player.isAI) {
                setTimeout(() => {
                    clearTimeout(timeout);
                    const target = this.getRandomTarget(player, actionName);
                    this.nightActions[player.id] = { action: actionName, target_id: target?.id || null };
                    resolve(target);
                }, 2000);
            }
        });
    }

    getRandomTarget(player, action) {
        const alive = this.players.filter(p => p.isAlive);

        switch (action) {
            case 'guard':
                return alive[Math.floor(Math.random() * alive.length)];
            case 'kill':
                const goods = alive.filter(p => p.camp === 'good');
                return goods[Math.floor(Math.random() * goods.length)] || alive[0];
            case 'check':
                const others = alive.filter(p => p.id !== player.id);
                return others[Math.floor(Math.random() * others.length)];
            case 'heal':
                return Math.random() < 0.5 ? alive[0] : null;
            default:
                return alive[0];
        }
    }

    resolveNightDeaths() {
        const deaths = [];

        // Simple: if wolf killed someone and witch didn't save
        const wolfKill = Object.entries(this.nightActions)
            .find(([id, action]) => action.action === 'kill');

        if (wolfKill) {
            const [playerId, action] = wolfKill;
            const victim = this.players.find(p => p.id === parseInt(playerId));

            // Check if witch saved
            const witchSave = Object.entries(this.nightActions)
                .find(([id, action]) => action.action === 'heal' && action.target_id === victim.id);

            if (!witchSave && victim) {
                victim.isAlive = false;
                deaths.push(victim);
            }
        }

        // Broadcast deaths
        for (const victim of deaths) {
            this.broadcast({
                type: 'death',
                payload: {
                    player_id: victim.id,
                    player_name: victim.name,
                    role: victim.role,
                    role_name: victim.roleName,
                    camp: victim.camp,
                    death_type: 'night'
                }
            });

            // Hunter ability
            if (victim.role === 'HUNTER') {
                const target = this.players.filter(p => p.isAlive && p.camp === 'wolf')[0];
                if (target) {
                    target.isAlive = false;
                    this.broadcast({
                        type: 'death',
                        payload: {
                            player_id: target.id,
                            player_name: target.name,
                            role: target.role,
                            role_name: target.roleName,
                            camp: target.camp,
                            death_type: 'hunter'
                        }
                    });
                }
            }
        }

        if (deaths.length === 0) {
            this.broadcast({
                type: 'system',
                payload: { message: '昨夜是平安夜' }
            });
        }
    }

    startDay() {
        this.phase = 'day';
        this.speakingOrder = this.players.filter(p => p.isAlive).map(p => p.id);
        this.currentSpeaker = 0;

        this.broadcast({
            type: 'game_state',
            payload: this.getStateForPlayer(null)
        });

        this.startSpeakingPhase();
    }

    async startSpeakingPhase() {
        while (this.currentSpeaker < this.speakingOrder.length) {
            const playerId = this.speakingOrder[this.currentSpeaker];
            const player = this.players.find(p => p.id === playerId);

            if (player && player.isAlive) {
                if (player.isAI) {
                    // Bot speaks
                    const speeches = ['过', '观察中', '大家分析一下', '我觉得可以再看看'];
                    const speech = speeches[Math.floor(Math.random() * speeches.length)];

                    this.broadcast({
                        type: 'speak',
                        payload: {
                            player_id: player.id,
                            player_name: player.name,
                            content: speech
                        }
                    });
                } else {
                    // Human waits for input
                    this.sendTo(player, {
                        type: 'action_required',
                        payload: {
                            action_type: 'speak',
                            time_limit: this.settings.speaking_time * 1000
                        }
                    });

                    // Wait for response or timeout
                    await this.waitForAction(player, 'speak', this.settings.speaking_time * 1000);
                }
            }

            this.currentSpeaker++;
            await this.delay(1000);
        }

        // Start voting
        this.startVotingPhase();
    }

    waitForAction(player, actionType, timeout) {
        return new Promise(resolve => {
            const tid = setTimeout(() => resolve(), timeout);
            player.actionResolve = (action) => {
                clearTimeout(tid);
                resolve(action);
            };
        });
    }

    async startVotingPhase() {
        this.phase = 'vote';
        this.votes = {};

        this.broadcast({
            type: 'game_state',
            payload: this.getStateForPlayer(null)
        });

        for (const player of this.players.filter(p => p.isAlive)) {
            if (player.isAI) {
                const targets = this.players.filter(p => p.isAlive && p.id !== player.id);
                const target = targets[Math.floor(Math.random() * targets.length)];
                this.votes[player.id] = target.id;

                this.broadcast({
                    type: 'vote_record',
                    payload: {
                        voter_id: player.id,
                        voter_name: player.name,
                        target_id: target.id,
                        target_name: target.name
                    }
                });
            } else {
                this.sendTo(player, {
                    type: 'action_required',
                    payload: {
                        action_type: 'vote',
                        options: this.players.filter(p => p.isAlive && p.id !== player.id).map(p => p.id),
                        time_limit: this.settings.voting_time * 1000
                    }
                });

                await this.waitForAction(player, 'vote', this.settings.voting_time * 1000);
            }

            await this.delay(500);
        }

        // Tally votes
        this.resolveVoting();
    }

    resolveVoting() {
        const voteCount = {};
        for (const [voterId, targetId] of Object.entries(this.votes)) {
            voteCount[targetId] = (voteCount[targetId] || 0) + 1;
        }

        let maxVotes = 0;
        let mostVoted = null;
        let isTie = false;

        for (const [targetId, count] of Object.entries(voteCount)) {
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = this.players.find(p => p.id === parseInt(targetId));
                isTie = false;
            } else if (count === maxVotes) {
                isTie = true;
            }
        }

        if (isTie || !mostVoted) {
            this.broadcast({
                type: 'system',
                payload: { message: '平票，进入下一夜' }
            });
        } else {
            mostVoted.isAlive = false;

            this.broadcast({
                type: 'death',
                payload: {
                    player_id: mostVoted.id,
                    player_name: mostVoted.name,
                    role: mostVoted.role,
                    role_name: mostVoted.roleName,
                    camp: mostVoted.camp,
                    death_type: 'vote'
                }
            });
        }

        // Check win
        if (this.checkWinCondition()) return;

        // Next night
        setTimeout(() => this.startNight(), 3000);
    }

    checkWinCondition() {
        const alive = this.players.filter(p => p.isAlive);
        const goodAlive = alive.filter(p => p.camp === 'good').length;
        const wolfAlive = alive.filter(p => p.camp === 'wolf').length;

        if (wolfAlive === 0) {
            this.endGame('good');
            return true;
        }

        if (wolfAlive >= goodAlive) {
            this.endGame('wolf');
            return true;
        }

        return false;
    }

    endGame(winner) {
        this.phase = 'end';

        this.broadcast({
            type: 'game_end',
            payload: {
                winner: winner,
                winner_name: winner === 'good' ? '好人阵营胜利' : '狼人阵营胜利',
                stats: {
                    total_days: this.day,
                    total_deaths: this.players.filter(p => !p.isAlive).length
                },
                players: this.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    role: p.role,
                    survived: p.isAlive
                }))
            }
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============ HTTP SERVER ============
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API routes
    if (pathname === '/api/game/create' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const data = JSON.parse(body || '{}');
            const gameId = `game-${Date.now()}`;
            const game = new Game(gameId, data.settings || {});
            games.set(gameId, game);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                game_id: gameId,
                ws_url: `ws://localhost:${PORT}/ws?game_id=${gameId}`
            }));
        });
        return;
    }

    if (pathname.startsWith('/api/game/') && req.method === 'GET') {
        const gameId = pathname.split('/')[3];
        const game = games.get(gameId);

        if (!game) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Game not found' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(game.getStateForPlayer(null)));
        return;
    }

    // Serve static files
    if (pathname === '/' || pathname === '/index.html') {
        const filePath = path.join(__dirname, '..', 'index.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Fallback
    res.writeHead(404);
    res.end('Not found');
});

// ============ WEBSOCKET SERVER ============
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const query = parsedUrl.query;

    const agentId = query.agent_id || `anon-${Date.now()}`;
    const gameId = query.game_id;
    const agentName = query.name || DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];

    const agent = {
        agentId,
        name: agentName,
        ws,
        playerId: null,
        isBot: false
    };

    agents.set(agentId, agent);

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            handleAgentMessage(agent, msg);
        } catch (e) {
            console.error('Invalid message:', e);
        }
    });

    ws.on('close', () => {
        agents.delete(agentId);
    });

    // Join game if game_id provided
    if (gameId) {
        const game = games.get(gameId);
        if (game) {
            const result = game.addPlayer(agent);
            if (result.success) {
                agent.playerId = result.player.id;
                agent.send = (msg) => ws.send(JSON.stringify(msg));

                ws.send(JSON.stringify({
                    type: 'joined',
                    payload: {
                        game_id: gameId,
                        player_id: agent.playerId
                    }
                }));

                // Start game if 12 players
                if (game.players.length >= 12 && game.phase === 'waiting') {
                    game.start();
                }
            }
        }
    }
});

function handleAgentMessage(agent, msg) {
    const game = games.get(msg.game_id);

    if (!game) {
        agent.ws.send(JSON.stringify({
            type: 'error',
            payload: { code: 'game_not_found', message: 'Game not found' }
        }));
        return;
    }

    const player = game.players.find(p => p.id === agent.playerId);

    switch (msg.type) {
        case 'join':
            const result = game.addPlayer(agent);
            if (result.success) {
                agent.playerId = result.player.id;
                agent.ws.send(JSON.stringify({
                    type: 'joined',
                    payload: {
                        game_id: game.gameId,
                        player_id: agent.playerId
                    }
                }));

                // Start game if 12 players
                if (game.players.length >= 12 && game.phase === 'waiting') {
                    game.start();
                }
            }
            break;

        case 'action':
            if (player && player.actionResolve) {
                player.actionResolve(msg.payload);
            }
            break;
    }
}

// ============ START ============
server.listen(PORT, () => {
    console.log(`🐺 AI狼人杀服务器启动中...`);
    console.log(`📡 HTTP: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`📖 Agent协议文档: docs/AGENT_PROTOCOL.md`);
});

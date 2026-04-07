/**
 * AI狼人杀 - 多Agent对战服务器
 *
 * HTTP API:  房间管理（创建/列表/查看）
 * WebSocket: Agent接入 + 观战
 * 静态文件:  前端页面
 */

require('dotenv').config();

const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const Room = require('./game/Room');
const { GAME_MODES } = require('./game/GameModes');

const PORT = process.env.PORT || 3000;

// ============ STATE ============
const rooms = new Map(); // roomId -> Room

// ============ HELPERS ============
function genId() {
    return Math.random().toString(36).slice(2, 8);
}

function jsonResponse(res, code, data) {
    res.writeHead(code, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch { resolve({}); }
        });
    });
}

// 简易 multipart/form-data 解析（用于 STT 音频上传）
function parseMultipart(body, boundary) {
    const parts = [];
    const boundaryBuf = Buffer.from(`--${boundary}`);
    const endBuf = Buffer.from(`--${boundary}--`);

    let start = body.indexOf(boundaryBuf) + boundaryBuf.length + 2; // skip boundary + \r\n
    while (start < body.length) {
        const nextBoundary = body.indexOf(boundaryBuf, start);
        if (nextBoundary === -1) break;

        const partData = body.slice(start, nextBoundary - 2); // -2 for \r\n before boundary
        const headerEnd = partData.indexOf('\r\n\r\n');
        if (headerEnd === -1) { start = nextBoundary + boundaryBuf.length + 2; continue; }

        const headerStr = partData.slice(0, headerEnd).toString('utf8');
        const data = partData.slice(headerEnd + 4);

        const nameMatch = headerStr.match(/name="([^"]+)"/);
        const filenameMatch = headerStr.match(/filename="([^"]+)"/);
        const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);

        parts.push({
            name: nameMatch ? nameMatch[1] : '',
            filename: filenameMatch ? filenameMatch[1] : null,
            contentType: ctMatch ? ctMatch[1].trim() : null,
            data,
        });

        start = nextBoundary + boundaryBuf.length + 2;
        if (body.indexOf(endBuf, nextBoundary) === nextBoundary) break;
    }
    return parts;
}

// MIME types for static files
const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

// ============ HTTP SERVER ============
const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    // ---- API Routes ----

    // GET /api/modes — available game modes
    if (pathname === '/api/modes' && req.method === 'GET') {
        const modes = Object.entries(GAME_MODES).map(([key, val]) => ({
            id: key, name: val.name, players: val.players, roles: val.roles,
        }));
        return jsonResponse(res, 200, { modes });
    }

    // GET /api/rooms — list rooms
    if (pathname === '/api/rooms' && req.method === 'GET') {
        const list = [];
        for (const room of rooms.values()) {
            list.push(room.getRoomInfo());
        }
        return jsonResponse(res, 200, { rooms: list });
    }

    // POST /api/rooms — create room
    if (pathname === '/api/rooms' && req.method === 'POST') {
        try {
            const body = await readBody(req);
            const mode = body.mode || 'standard';
            
            // Validate mode
            if (!GAME_MODES[mode]) {
                return jsonResponse(res, 400, { error: `不支持的游戏模式: ${mode}` });
            }

            const roomId = genId();
            const room = new Room(roomId, {
                name: body.name,
                mode: mode,
                settings: body.settings,
                autoFillBots: body.auto_fill_bots !== false,
                autoStartThreshold: body.auto_start_threshold,
            });
            rooms.set(roomId, room);
            console.log(`[Room] 创建房间 ${roomId} (${room.modeConfig.name})`);
            return jsonResponse(res, 201, room.getRoomInfo());
        } catch (err) {
            console.error('[Room] 创建房间失败:', err.message);
            return jsonResponse(res, 500, { error: '服务器内部错误，创建房间失败' });
        }
    }

    // GET /api/rooms/:id — room detail
    if (pathname.match(/^\/api\/rooms\/[a-z0-9]+$/) && req.method === 'GET') {
        const roomId = pathname.split('/')[3];
        const room = rooms.get(roomId);
        if (!room) return jsonResponse(res, 404, { error: '房间不存在' });

        const info = room.getRoomInfo();
        if (room.game) {
            info.game = room.game.getSpectatorState();
        }
        return jsonResponse(res, 200, info);
    }

    // DELETE /api/rooms/:id — destroy room
    if (pathname.match(/^\/api\/rooms\/[a-z0-9]+$/) && req.method === 'DELETE') {
        const roomId = pathname.split('/')[3];
        const room = rooms.get(roomId);
        if (!room) return jsonResponse(res, 404, { error: '房间不存在' });
        room.destroy();
        rooms.delete(roomId);
        console.log(`[Room] 销毁房间 ${roomId}`);
        return jsonResponse(res, 200, { ok: true });
    }

    // POST /api/rooms/:id/start — force start (skip countdown)
    if (pathname.match(/^\/api\/rooms\/[a-z0-9]+\/start$/) && req.method === 'POST') {
        const roomId = pathname.split('/')[3];
        const room = rooms.get(roomId);
        if (!room) return jsonResponse(res, 404, { error: '房间不存在' });
        if (room.status === 'playing') return jsonResponse(res, 400, { error: '游戏已在进行中' });
        room.startGame();
        return jsonResponse(res, 200, { ok: true, status: room.status });
    }

    // POST /api/stt — 语音转文字
    if (pathname === '/api/stt' && req.method === 'POST') {
        const sttService = require('./stt/STTService');

        if (!sttService.isConfigured) {
            return jsonResponse(res, 500, { error: 'STT 未配置：缺少 API Key' });
        }

        try {
            // 读取原始 body（音频二进制）
            const chunks = [];
            let totalSize = 0;
            const MAX_SIZE = 5 * 1024 * 1024; // 5MB

            await new Promise((resolve, reject) => {
                req.on('data', chunk => {
                    totalSize += chunk.length;
                    if (totalSize > MAX_SIZE) {
                        reject(new Error('音频文件过大，最大 5MB'));
                        return;
                    }
                    chunks.push(chunk);
                });
                req.on('end', resolve);
                req.on('error', reject);
            });

            const rawBody = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || '';

            // 支持两种上传方式：
            // 1. 直接发送音频 binary（Content-Type: audio/webm 等）
            // 2. multipart/form-data（带 file 字段）
            let audioBuffer, mimeType;

            if (contentType.startsWith('audio/')) {
                // 直接二进制上传
                audioBuffer = rawBody;
                mimeType = contentType.split(';')[0].trim();
            } else if (contentType.includes('multipart/form-data')) {
                // 解析 multipart — 提取第一个文件字段
                const boundaryMatch = contentType.match(/boundary=(.+)/);
                if (!boundaryMatch) return jsonResponse(res, 400, { error: '缺少 multipart boundary' });

                const boundary = boundaryMatch[1].trim();
                const parts = parseMultipart(rawBody, boundary);
                const filePart = parts.find(p => p.filename);
                if (!filePart) return jsonResponse(res, 400, { error: '缺少音频文件' });

                audioBuffer = filePart.data;
                mimeType = filePart.contentType || 'audio/webm';
            } else {
                return jsonResponse(res, 400, { error: '不支持的 Content-Type，请使用 audio/* 或 multipart/form-data' });
            }

            const text = await sttService.transcribe(audioBuffer, mimeType);
            return jsonResponse(res, 200, { text });
        } catch (err) {
            console.error('[STT] 转写失败:', err.message);
            return jsonResponse(res, 500, { error: `语音转写失败: ${err.message}` });
        }
    }

    // POST /api/ai/generate — 模拟模式 AI 发言/决策（服务端统一 LLM）
    if (pathname === '/api/ai/generate' && req.method === 'POST') {
        const llmService = require('./llm/LLMService');
        const PromptBuilder = require('./llm/PromptBuilder');
        const { getFallbackPhrase } = require('./llm/FallbackPhrases');

        // 先解析 body，保存引用供 catch fallback 使用
        let parsedBody = {};
        try {
            parsedBody = await readBody(req);
        } catch (parseErr) {
            return jsonResponse(res, 400, { error: 'Invalid request body' });
        }

        const { player, gameState: gs, actionType, validTargets, context } = parsedBody;

        if (!player || !gs || !actionType) {
            return jsonResponse(res, 400, { error: '缺少 player, gameState, actionType' });
        }

        // 无 LLM 配置时用 fallback
        if (!llmService.isConfigured) {
            if (actionType === 'speak' || actionType === 'last_words') {
                return jsonResponse(res, 200, { content: getFallbackPhrase(player.name, player.role, actionType) });
            }
            return jsonResponse(res, 200, { target_id: validTargets?.[Math.floor(Math.random() * (validTargets?.length || 1))] });
        }

        try {
            // 用 LLM 生成
            let result;
            if (actionType === 'speak') {
                const { systemPrompt, userPrompt } = PromptBuilder.buildSpeechPrompt({ player, gameState: gs, memory: null });
                const content = await llmService.call(systemPrompt, userPrompt, { maxTokens: 800 });
                result = { content };
            } else if (actionType === 'last_words') {
                const { systemPrompt, userPrompt } = PromptBuilder.buildSpeechPrompt({ player, gameState: gs, memory: null });
                const content = await llmService.call(systemPrompt, userPrompt + '\n\n你即将被出局，请发表遗言。30-60字。', { maxTokens: 600 });
                result = { content };
            } else if (actionType === 'vote') {
                const { systemPrompt, userPrompt } = PromptBuilder.buildVotePrompt({ player, gameState: gs, validTargets, memory: null });
                const response = await llmService.call(systemPrompt, userPrompt, { maxTokens: 300, temperature: 0.5 });
                const match = response.match(/(\d+)/);
                result = { target_id: match ? parseInt(match[1]) : validTargets?.[0] };
            } else {
                // 夜间行动
                const { systemPrompt, userPrompt } = PromptBuilder.buildNightActionPrompt({
                    player, gameState: gs, actionType, validTargets: validTargets || [], context: context || {}, memory: null,
                });
                const response = await llmService.call(systemPrompt, userPrompt, { maxTokens: 300, temperature: 0.5 });
                const match = response.match(/-?\d+/);
                result = { target_id: match ? parseInt(match[0]) : validTargets?.[0] };
            }

            return jsonResponse(res, 200, result);
        } catch (err) {
            console.error('[AI] LLM generate failed, using fallback:', err.message);
            // LLM 失败时用个性化 fallback（而非固定"让我想想"）
            if (actionType === 'speak' || actionType === 'last_words') {
                return jsonResponse(res, 200, { content: getFallbackPhrase(player.name, player.role, actionType), fallback: true });
            }
            return jsonResponse(res, 200, { target_id: validTargets?.[Math.floor(Math.random() * (validTargets?.length || 1))], fallback: true });
        }
    }

    // GET /api/health — health check
    if (pathname === '/api/health') {
        const llmService = require('./llm/LLMService');
        const sttService = require('./stt/STTService');
        return jsonResponse(res, 200, {
            status: 'ok',
            rooms: rooms.size,
            uptime: process.uptime(),
            llm_configured: llmService.isConfigured,
            stt_configured: sttService.isConfigured,
            stt_provider: sttService.provider,
        });
    }

    // ---- Static Files ----
    let filePath;
    const decodedPath = decodeURIComponent(pathname);
    if (decodedPath === '/' || decodedPath === '/index.html') {
        filePath = path.join(__dirname, '..', 'index.html');
    } else {
        // Prevent directory traversal
        let safePath = path.normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, '');
        if (safePath.startsWith(path.sep) || safePath.startsWith('/')) {
            safePath = safePath.slice(1);
        }
        filePath = path.join(__dirname, '..', safePath);
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

// ============ WEBSOCKET SERVER ============
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const parsed = url.parse(req.url, true);
    const q = parsed.query;

    const connectionId = q.agent_id || q.id || `anon-${genId()}`;
    const roomId = q.room_id;
    const connType = q.type || 'agent'; // 'agent' | 'spectator' | 'human'
    const name = q.name || connectionId;

    console.log(`[WS] 连接: ${connectionId} (${connType}) → 房间 ${roomId || '无'}`);

    // Must specify room
    if (!roomId) {
        ws.send(JSON.stringify({ type: 'error', payload: { code: 'no_room', message: '请指定 room_id' } }));
        ws.close(1008, 'room_id required');
        return;
    }

    // Rooms can only be created by the host via HTTP API — agents cannot auto-create rooms
    let room = rooms.get(roomId);
    if (!room) {
        // [MODIFIED] Agents can NO LONGER auto-create rooms via WS. 
        // This is to prevent Agents from wandering into empty rooms.
        ws.send(JSON.stringify({ 
            type: 'error', 
            payload: { 
                code: 'room_not_found', 
                message: `房间 ${roomId} 不存在。请确认房主已经创建了房间，Agent只能加入已存在的房间。` 
            } 
        }));
        ws.close(1008, 'room not found');
        return;
    }

    // Join room
    let joinResult;
    if (connType === 'spectator') {
        joinResult = room.addSpectator(connectionId, ws, name);
    } else if (connType === 'human') {
        joinResult = room.addHuman(connectionId, ws, name);
    } else {
        joinResult = room.addAgent(connectionId, ws, name);
    }

    if (!joinResult.ok) {
        ws.send(JSON.stringify({ type: 'error', payload: { code: 'join_failed', message: joinResult.error } }));
        ws.close(1008, joinResult.error);
        return;
    }

    // Send welcome
    const baseUrl = process.env.PUBLIC_URL || `https://werewolf-game-production-443d.up.railway.app`;
    ws.send(JSON.stringify({
        type: 'welcome',
        payload: {
            connection_id: connectionId,
            room_id: roomId,
            connection_type: connType,
            room: room.getRoomInfo(),
            spectate_url: `${baseUrl}/?spectate=${roomId}`,
            guidance: connType === 'human'
                ? "你已作为人类玩家加入房间。等待其他玩家加入后游戏将自动开始。"
                : connType === 'agent'
                ? "你已成功进入房间。目前正在大厅等待其他玩家加入。游戏满员后会自动开始，请保持连接，不要退出，直到收到 game_end 消息。"
                : "欢迎来到观战模式。"
        },
    }));

    // Server-side heartbeat to keep connection alive — includes game state for sync
    const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            const heartbeatPayload = { timestamp: Date.now() };
            // Include game state so agents stay in sync
            heartbeatPayload.room_status = room.status;
            if (room.game) {
                heartbeatPayload.game_phase = room.game.phase;
                heartbeatPayload.game_day = room.game.day;
                heartbeatPayload.alive_count = room.game.players.filter(p => p.isAlive).length;
                // For agents and human players, include their role if assigned
                if (connType === 'agent' || connType === 'human') {
                    const player = room.game.getPlayerByAgentId(connectionId);
                    if (player) {
                        heartbeatPayload.your_id = player.id;
                        heartbeatPayload.your_role = player.role;
                        heartbeatPayload.is_alive = player.isAlive;
                    }
                }
            } else {
                heartbeatPayload.agent_count = room.getAgentCount();
                heartbeatPayload.required_players = room.modeConfig.players;
            }
            ws.send(JSON.stringify({ type: 'heartbeat', payload: heartbeatPayload }));
        } else {
            clearInterval(heartbeat);
        }
    }, 15000); // Every 15s (was 30s) for better sync

    // Handle messages
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            handleMessage(room, connectionId, msg);
        } catch (e) {
            console.error('[WS] Invalid message:', e.message);
        }
    });

        ws.on('close', () => {
        console.log(`[WS] 断开: ${connectionId}`);
        clearInterval(heartbeat);
        room.removeConnection(connectionId);

        // Cleanup empty finished rooms after delay
        setTimeout(() => {
            if (room.status === 'finished' && room.connections.size === 0) {
                rooms.delete(roomId);
                console.log(`[Room] 清理空房间 ${roomId}`);
            }
        }, 60000);
    });
});

function handleMessage(room, connectionId, msg) {
    switch (msg.type) {
        case 'action_response':
            room.handleAgentMessage(connectionId, msg);
            break;

        case 'start_game':
            // Agent requests game start (e.g., lobby ready button)
            if (room.status === 'waiting') {
                room.startCountdown(5);
            }
            break;

        case 'force_start':
            // Agent cannot force start — game start is controlled by the host via HTTP API or when room is full
            break;

        case 'ping': {
            const conn = room.connections.get(connectionId);
            if (conn && conn.ws.readyState === 1) {
                conn.ws.send(JSON.stringify({ type: 'pong', payload: { timestamp: Date.now() } }));
            }
            break;
        }

        case 'get_status': {
            // Agent can request current game state at any time for re-sync
            const conn2 = room.connections.get(connectionId);
            if (!conn2 || conn2.ws.readyState !== 1) break;
            const statusPayload = {
                room_id: room.roomId,
                room_status: room.status,
                agent_count: room.getAgentCount(),
                required_players: room.modeConfig.players,
            };
            if (room.game) {
                statusPayload.game_phase = room.game.phase;
                statusPayload.game_day = room.game.day;
                statusPayload.players = room.game.getPublicPlayers();
                statusPayload.alive_count = room.game.players.filter(p => p.isAlive).length;
                // Include agent's own role info
                const player = room.game.getPlayerByAgentId(connectionId);
                if (player) {
                    statusPayload.your_id = player.id;
                    statusPayload.your_role = player.role;
                    statusPayload.your_role_name = player.roleName;
                    statusPayload.your_camp = player.camp;
                    statusPayload.is_alive = player.isAlive;
                }
                statusPayload.event_log = room.game.eventLog.slice(-20).map(e => e.message);
            }
            conn2.ws.send(JSON.stringify({ type: 'game_status', payload: statusPayload }));
            break;
        }

        default:
            console.log(`[WS] 未知消息类型: ${msg.type} from ${connectionId}`);
    }
}

// ============ START ============
server.listen(PORT, () => {
    console.log('');
    console.log('🐺 ═══════════════════════════════════════════');
    console.log('   AI狼人杀 - 多Agent对战服务器');
    console.log('═══════════════════════════════════════════════');
    console.log(`📡 HTTP API:    http://localhost:${PORT}/api/rooms`);
    console.log(`🔌 WebSocket:   ws://localhost:${PORT}?room_id=xxx`);
    console.log(`🌐 前端页面:    http://localhost:${PORT}`);
    console.log(`📖 协议文档:    docs/AGENT_PROTOCOL.md`);
    console.log('═══════════════════════════════════════════════');
    console.log('');
});

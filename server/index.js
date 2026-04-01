/**
 * AI狼人杀 - 多Agent对战服务器
 *
 * HTTP API:  房间管理（创建/列表/查看）
 * WebSocket: Agent接入 + 观战
 * 静态文件:  前端页面
 */

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
        const body = await readBody(req);
        const roomId = genId();
        const room = new Room(roomId, {
            name: body.name,
            mode: body.mode || 'standard',
            settings: body.settings,
            autoFillBots: body.auto_fill_bots !== false,
            autoStartThreshold: body.auto_start_threshold,
        });
        rooms.set(roomId, room);
        console.log(`[Room] 创建房间 ${roomId} (${room.modeConfig.name})`);
        return jsonResponse(res, 201, room.getRoomInfo());
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

    // GET /api/health — health check
    if (pathname === '/api/health') {
        return jsonResponse(res, 200, { status: 'ok', rooms: rooms.size, uptime: process.uptime() });
    }

    // ---- Static Files ----
    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
        filePath = path.join(__dirname, '..', 'index.html');
    } else {
        // Prevent directory traversal
        const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
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
    const connType = q.type || 'agent'; // 'agent' | 'spectator'
    const name = q.name || connectionId;

    console.log(`[WS] 连接: ${connectionId} (${connType}) → 房间 ${roomId || '无'}`);

    // Must specify room
    if (!roomId) {
        ws.send(JSON.stringify({ type: 'error', payload: { code: 'no_room', message: '请指定 room_id' } }));
        ws.close(1008, 'room_id required');
        return;
    }

    // Auto-create room if it doesn't exist (for quick testing)
    let room = rooms.get(roomId);
    if (!room) {
        room = new Room(roomId, { mode: q.mode || 'standard' });
        rooms.set(roomId, room);
        console.log(`[Room] 自动创建房间 ${roomId}`);
    }

    // Join room
    let joinResult;
    if (connType === 'spectator') {
        joinResult = room.addSpectator(connectionId, ws, name);
    } else {
        joinResult = room.addAgent(connectionId, ws, name);
    }

    if (!joinResult.ok) {
        ws.send(JSON.stringify({ type: 'error', payload: { code: 'join_failed', message: joinResult.error } }));
        ws.close(1008, joinResult.error);
        return;
    }

    // Send welcome
    ws.send(JSON.stringify({
        type: 'welcome',
        payload: {
            connection_id: connectionId,
            room_id: roomId,
            connection_type: connType,
            room: room.getRoomInfo(),
        },
    }));

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
            // Skip countdown, start immediately
            if (room.status === 'waiting' || room.status === 'countdown') {
                room.cancelCountdown?.();
                room.startGame();
            }
            break;

        case 'ping':
            const conn = room.connections.get(connectionId);
            if (conn && conn.ws.readyState === 1) {
                conn.ws.send(JSON.stringify({ type: 'pong', payload: { timestamp: Date.now() } }));
            }
            break;

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

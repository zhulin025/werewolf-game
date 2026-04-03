// ============ ONLINE LOBBY & SPECTATOR ============
let lobbyWs = null;
let isSpectating = false;
let spectatorRoomId = null;
let lobbyRefreshTimer = null;
let currentRoomDetail = null;
let roomDetailRefreshTimer = null;

function getApiBase() {
    return window.location.origin;
}

function getWsBase() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
}

function openLobby() {
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('lobbyScreen').classList.add('active');
    refreshRooms();
    lobbyRefreshTimer = setInterval(refreshRooms, 5000);
}

function closeLobby() {
    document.getElementById('lobbyScreen').classList.remove('active');
    document.getElementById('startScreen').style.display = '';
    if (lobbyRefreshTimer) { clearInterval(lobbyRefreshTimer); lobbyRefreshTimer = null; }
}

async function refreshRooms() {
    try {
        const resp = await fetch(`${getApiBase()}/api/rooms`);
        const data = await resp.json();
        renderRoomList(data.rooms || []);
    } catch (e) {
        console.error('Failed to fetch rooms:', e);
    }
}

function renderRoomList(roomList) {
    const container = document.getElementById('roomList');
    if (roomList.length === 0) {
        container.innerHTML = `<div class="lobby-empty"><div class="empty-icon">🏚</div><div>暂无房间，创建一个开始对战</div></div>`;
        return;
    }
    const statusLabels = { waiting: '等待中', countdown: '倒计时', playing: '游戏中', finished: '已结束' };
    container.innerHTML = roomList.map(r => `
        <div class="room-card">
            <div class="room-info">
                <h3>${escapeHtml(r.name)} <span class="room-status ${r.status}">${statusLabels[r.status] || r.status}</span></h3>
                <div class="room-meta">
                    <span>📋 ${r.mode_name}</span>
                    <span>👥 ${r.agent_count}/${r.required_players}</span>
                    <span>👁 ${r.spectator_count || 0} 观众</span>
                </div>
            </div>
            <div class="room-actions">
                <button class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px;" onclick="openRoomDetail('${r.room_id}')">📝 详情</button>
                ${r.status === 'waiting' && r.agent_count > 0 ? `<button class="btn btn-primary" style="font-size: 12px; padding: 6px 14px;" onclick="forceStartRoom('${r.room_id}')">▶ 开始</button>` : ''}
                ${r.status === 'playing' ? `<button class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px;" onclick="spectateRoom('${r.room_id}')">👁 观战</button>` : ''}
            </div>
        </div>
    `).join('');
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

async function createRoom() {
    const name = document.getElementById('newRoomName').value.trim() || 'AI对战房';
    const mode = document.getElementById('newRoomMode').value;
    try {
        const resp = await fetch(`${getApiBase()}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mode, auto_fill_bots: true }),
        });
        const data = await resp.json();
        showToast(`房间 "${name}" 已创建`);
        // 清空输入框
        document.getElementById('newRoomName').value = '';
        // 自动打开房间详情页
        openRoomDetail(data.room_id);
    } catch (e) {
        showToast('创建失败');
    }
}

async function forceStartRoom(roomId) {
    try {
        await fetch(`${getApiBase()}/api/rooms/${roomId}/start`, { method: 'POST' });
        spectateRoom(roomId);
    } catch (e) {
        showToast('启动失败');
    }
}

function spectateRoom(roomId) {
    // Close lobby and room detail
    document.getElementById('lobbyScreen').classList.remove('active');
    document.getElementById('roomDetailScreen').classList.remove('active');
    if (lobbyRefreshTimer) { clearInterval(lobbyRefreshTimer); lobbyRefreshTimer = null; }
    if (roomDetailRefreshTimer) { clearInterval(roomDetailRefreshTimer); roomDetailRefreshTimer = null; }

    // Show game UI
    const startScreen = document.getElementById('startScreen');
    if (startScreen) startScreen.style.display = 'none';

    // Show spectator badge and return button
    isSpectating = true;
    spectatorRoomId = roomId;
    document.getElementById('spectatorBadge').classList.add('active');
    document.getElementById('gameReturnBtn').classList.add('active');
    document.getElementById('toggleRolesBtn').style.display = '';
    document.getElementById('wsDot').className = 'ws-dot connecting';

    // Hide irrelevant local-sim controls in spectator mode
    document.querySelector('.speed-control').style.display = 'none';
    document.querySelector('.header-actions .btn-primary').style.display = 'none'; // 新游戏 btn

    // Initialize display — spectator mode: clear state, wait for real server data
    VoiceSystem.warmup();
    SoundSystem.init();
    resetAIMemory();
    resetAIState();
    resetNightActions();
    gameState.players = [];
    gameState.phase = 'waiting';
    gameState.day = 0;
    gameState.deathRecords = [];
    showRoles = false;
    const toggleBtn2 = document.getElementById('toggleRolesBtn');
    if (toggleBtn2) toggleBtn2.textContent = '🎭 显示角色';
    renderPlayers();
    renderDeathRecords();
    clearLogs();
    addLog('👁 观战模式 — 连接中...', 'system');

    // Connect via WebSocket
    connectSpectator(roomId);
}

function connectSpectator(roomId) {
    if (lobbyWs) { lobbyWs.close(); lobbyWs = null; }

    const wsUrl = `${getWsBase()}?room_id=${roomId}&type=spectator&name=web-spectator`;
    lobbyWs = new WebSocket(wsUrl);

    lobbyWs.onopen = () => {
        document.getElementById('wsDot').className = 'ws-dot connected';
        addLog('✅ 已连接到游戏服务器', 'system');
    };

    lobbyWs.onclose = () => {
        document.getElementById('wsDot').className = 'ws-dot';
        if (isSpectating) {
            addLog('⚠ 连接断开，3秒后重连...', 'system');
            setTimeout(() => { if (isSpectating) connectSpectator(roomId); }, 3000);
        }
    };

    lobbyWs.onerror = () => {
        document.getElementById('wsDot').className = 'ws-dot';
    };

    lobbyWs.onmessage = (evt) => {
        try {
            const msg = JSON.parse(evt.data);
            handleSpectatorMessage(msg);
        } catch (e) {
            console.error('WS message parse error:', e);
        }
    };
}

let countdownTimer = null;

function handleSpectatorMessage(msg) {
    switch (msg.type) {
        case 'welcome':
            addLog(`🏠 加入房间: ${msg.payload.room?.name || msg.payload.room_id}`, 'system');
            break;

        case 'room_state':
            // 房间状态更新时刷新房间详情（如果在房间页）
            if (currentRoomDetail === msg.payload.room_id) {
                updateRoomDetail();
            }
            if (msg.payload.status !== 'waiting' && !isSpectating) {
                addLog(`📋 房间状态: ${msg.payload.status} (${msg.payload.agent_count}/${msg.payload.required_players} 玩家)`, 'system');
            }
            break;

        case 'countdown_start':
            showCountdown(msg.payload.seconds);
            addLog(`⏱ 游戏将在 ${msg.payload.seconds} 秒后开始`, 'system');
            break;

        case 'countdown_tick':
            if (msg.payload.seconds <= 3) {
                addLog(`⏱ ${msg.payload.seconds}...`, 'system');
            }
            break;

        case 'game_started':
            addLog('🎮 游戏开始！', 'system');
            if (msg.payload.players) {
                updateSpectatorPlayers(msg.payload.players);
            }
            break;

        case 'phase_change':
            handlePhaseChange(msg.payload);
            break;

        case 'night_action':
            addLog(`🌙 ${msg.payload.description}`, 'night');
            break;

        case 'public_event':
            handlePublicEvent(msg.payload);
            break;

        case 'deaths':
            // Spectator-only full-detail death notification (includes role info)
            if (msg.payload.deaths) {
                for (const d of msg.payload.deaths) {
                    // Update player in gameState with role info if not set
                    const p = gameState.players.find(pl => pl.id === d.player_id);
                    if (p) {
                        if (!p.roleName || p.roleName === '?') p.roleName = d.roleName || '?';
                        if (!p.icon || p.icon === '❓') p.icon = d.icon || p.icon;
                    }
                    // Push to deathRecords for the death list panel
                    const causeMap = { killed: 'killed', poisoned: 'killed', vote: 'vote', hunter: 'hunter', wolfking: 'wolfking' };
                    const icon = p ? p.icon : '💀';
                    const roleName = d.roleName || (p ? p.roleName : '?');
                    gameState.deathRecords.push({ name: d.player_name, cause: causeMap[d.cause] || d.cause, day: gameState.day, roleName, icon });
                    renderDeathRecords();
                }
            }
            break;

        case 'state_update':
            if (msg.payload.players) {
                updateSpectatorPlayers(msg.payload.players);
            }
            break;

        case 'game_end':
            handleSpectatorGameEnd(msg.payload);
            break;

        case 'game_state': {
            const gs = msg.payload;
            if (gs.players) updateSpectatorPlayers(gs.players);
            if (gs.phase) { gameState.phase = gs.phase; gameState.day = gs.day || 0; updatePhaseDisplay(); }
            if (gs.death_records && gs.death_records.length > 0) {
                const iconMap = { VILLAGER: '👤', PROPHET: '🔮', WITCH: '🧪', GUARD: '🛡️', HUNTER: '🏹', WOLF: '🐺', WOLF_KING: '👑' };
                gameState.deathRecords = gs.death_records.map(r => {
                    const p = gameState.players.find(pl => pl.name === r.name);
                    return { name: r.name, cause: r.cause, day: r.day, roleName: r.roleName || '?', icon: (p?.icon) || iconMap[r.role] || '💀' };
                });
                renderDeathRecords();
            }
            if (gs.event_log) {
                for (const entry of gs.event_log.slice(-20)) {
                    addLog(entry.message, entry.type);
                }
            }
            break;
        }
    }
}

function handlePhaseChange(payload) {
    const { phase, day } = payload;

    // Sync gameState so updatePhaseDisplay() works correctly
    gameState.phase = phase;
    gameState.day = day;

    const phaseIcon = document.getElementById('phaseIcon');
    const phaseText = document.getElementById('phaseText');
    const headerPhase = document.getElementById('headerPhase');
    if (headerPhase) headerPhase.style.display = '';

    // 隐藏倒计时
    document.getElementById('countdownOverlay').classList.remove('active');

    if (phase === 'night') {
        if (phaseIcon) phaseIcon.textContent = '🌙';
        if (phaseText) phaseText.textContent = `第${day}夜`;
        addLog(`🌙 ═══ 第${day}夜 ═══`, 'night');
        document.getElementById('statDay').textContent = day;
    } else if (phase === 'day') {
        if (phaseIcon) phaseIcon.textContent = '☀';
        if (phaseText) phaseText.textContent = `第${day}天`;
        addLog(`☀ ═══ 第${day}天 ═══`, 'system');
        document.getElementById('statDay').textContent = day;
    } else if (phase === 'vote') {
        if (phaseIcon) phaseIcon.textContent = '🗳';
        if (phaseText) phaseText.textContent = `投票`;
        addLog('🗳 投票环节开始', 'system');
    }

    // Update center display (centerSubtitle, centerRound)
    updatePhaseDisplay();
}

function handlePublicEvent(payload) {
    const evt = payload.event;
    switch (evt) {
        case 'night_result':
            if (payload.deaths && payload.deaths.length > 0) {
                for (const d of payload.deaths) {
                    addLog(`💀 ${d.player_name} 昨夜死亡`, 'death');
                    VoiceSystem.speak(`${d.player_name}昨夜死亡`);
                    markPlayerDead(d.player_id);
                }
            } else {
                addLog('🌿 昨夜平安无事', 'system');
            }
            break;
        case 'speaking_turn':
            addLog(`🎤 轮到 ${payload.player_name} 发言`, 'system');
            break;
        case 'speech': {
            addLog(`💬 ${payload.player_name}：${payload.content}`, 'speak');
            VoiceSystem.speak(`${payload.player_name}说：${payload.content}`);
            // Show speech bubble on player card (same as local simulation)
            const speakerCard = document.getElementById(`player-${payload.player_id}`);
            if (speakerCard) {
                speakerCard.classList.add('speaking');
                const speakerPlayer = gameState.players.find(p => p.id === payload.player_id);
                if (speakerPlayer) showSpeechBubble(speakerCard, speakerPlayer, payload.content);
                setTimeout(() => {
                    speakerCard.classList.remove('speaking');
                    hideSpeechBubble();
                }, 5000);
            }
            break;
        }
        case 'vote_cast': {
            addLog(`🗳 ${payload.voter_name} → ${payload.target_name}`, 'vote');
            // Vote animation: highlight voter, draw line to target
            const voterCard = document.getElementById(`player-${payload.voter_id}`);
            const targetCard = document.getElementById(`player-${payload.target_id}`);
            if (voterCard) {
                voterCard.classList.add('voting-target');
                if (targetCard) {
                    targetCard.classList.add('voted');
                    drawVoteLine(voterCard, payload.target_id);
                }
                setTimeout(() => voterCard.classList.remove('voting-target'), 1500);
            }
            break;
        }
        case 'vote_result':
            if (payload.votes) {
                const summary = payload.votes.map(v => `${v.player_name}(${v.count}票)`).join(', ');
                addLog(`📊 投票结果: ${summary}`, 'system');
            }
            // Clear vote highlights
            document.querySelectorAll('.player-card.voted').forEach(c => c.classList.remove('voted'));
            break;
        case 'elimination': {
            addLog(`⚔ ${payload.player_name} 被投票出局 (${payload.votes}票)`, 'death');
            VoiceSystem.speak(`${payload.player_name}被投票出局`);
            markPlayerDead(payload.player_id);
            // Death list — role info from gameState (set via 'deaths' spectator event)
            const elimP = gameState.players.find(p => p.id === payload.player_id);
            gameState.deathRecords.push({ name: payload.player_name, cause: 'vote', day: gameState.day, roleName: elimP?.roleName || '?', icon: elimP?.icon || '💀' });
            renderDeathRecords();
            break;
        }
        case 'tie_broken':
            addLog(`⚖ ${payload.message}`, 'system');
            break;
        case 'last_words':
            addLog(`🪦 ${payload.player_name} 的遗言：${payload.content}`, 'speak');
            VoiceSystem.speak(`${payload.player_name}的遗言：${payload.content}`);
            break;
        case 'death': {
            addLog(`💀 ${payload.message || payload.player_name + ' 死亡'}`, 'death');
            if (payload.player_id !== undefined) {
                markPlayerDead(payload.player_id);
                const shootP = gameState.players.find(p => p.id === payload.player_id);
                const shootCause = payload.cause === 'wolfking' ? 'wolfking' : 'hunter';
                gameState.deathRecords.push({ name: payload.player_name, cause: shootCause, day: gameState.day, roleName: shootP?.roleName || '?', icon: shootP?.icon || '💀' });
                renderDeathRecords();
            }
            break;
        }
    }
}

function markPlayerDead(playerId) {
    const player = gameState.players.find(p => p.id === playerId);
    if (player) {
        player.isAlive = false;
        renderPlayers();
        // Update alive stats
        const alive = gameState.players.filter(p => p.isAlive);
        const goodAlive = alive.filter(p => p.camp === 'good').length;
        const wolfAlive = alive.filter(p => p.camp === 'wolf').length;
        document.getElementById('statGood').textContent = goodAlive;
        document.getElementById('statWolf').textContent = wolfAlive;
        document.getElementById('statAlive').textContent = alive.length;
    }
}

function updateSpectatorPlayers(players) {
    // Update game state players for the ring display
    gameState.players = players.map((p, index) => ({
        id: p.id,
        number: p.id + 1,   // player number = id+1
        name: p.name,
        role: p.role || 'UNKNOWN',
        roleName: p.roleName || '?',
        camp: p.camp || 'unknown',
        icon: p.icon || '❓',
        isAlive: p.is_alive,
        isAI: true,
    }));
    renderPlayers();

    // Update stats
    const alive = players.filter(p => p.is_alive);
    const goodAlive = alive.filter(p => p.camp === 'good').length;
    const wolfAlive = alive.filter(p => p.camp === 'wolf').length;
    document.getElementById('statGood').textContent = goodAlive;
    document.getElementById('statWolf').textContent = wolfAlive;
    document.getElementById('statAlive').textContent = alive.length;
}

function handleSpectatorGameEnd(payload) {
    const winner = payload.winner;
    const winnerText = winner === 'good' ? '好人阵营胜利' : '狼人阵营胜利';
    addLog(`🏆 游戏结束 — ${payload.message || winnerText}`, 'system');
    VoiceSystem.speak(`游戏结束！${payload.message || winnerText}`);
    gameState.phase = 'end';

    // Update player cards with final revealed roles
    if (payload.players) {
        // Rebuild gameState.players with full role info from game_end payload
        // (ROLES icon map for display since game_end doesn't carry icon field)
        const iconMap = { VILLAGER: '👤', PROPHET: '🔮', WITCH: '🧪', GUARD: '🛡️', HUNTER: '🏹', WOLF: '🐺', WOLF_KING: '👑' };
        gameState.players = payload.players.map(p => ({
            id: p.id,
            number: p.id + 1,
            name: p.name,
            role: p.role,
            roleName: p.roleName,
            camp: p.camp,
            icon: iconMap[p.role] || '❓',
            isAlive: p.survived,
            isAI: true,
        }));
        renderPlayers();
    }

    // Restore death records from payload
    if (payload.death_records) {
        gameState.deathRecords = payload.death_records.map(r => ({
            name: r.name, cause: r.cause, day: r.day, roleName: r.roleName || '?',
            icon: (payload.players?.find(p => p.name === r.name) ? (({ VILLAGER: '👤', PROPHET: '🔮', WITCH: '🧪', GUARD: '🛡️', HUNTER: '🏹', WOLF: '🐺', WOLF_KING: '👑' })[payload.players.find(p => p.name === r.name).role] || '💀') : '💀'),
        }));
        renderDeathRecords();
    }

    // Show game-over modal (reuse local sim modal)
    const modal = document.getElementById('gameOverModal');
    const badge = document.getElementById('winnerBadge');
    const text = document.getElementById('winnerText');
    const camp = document.getElementById('winnerCamp');
    if (winner === 'good') {
        badge.textContent = '🏆';
        text.textContent = '好人胜利！';
        camp.textContent = '所有狼人已被放逐';
        camp.style.color = '#3498db';
        SoundSystem.play('win');
        showPhaseAnnouncement('🏆 好人胜利', '#3498db');
    } else {
        badge.textContent = '🐺';
        text.textContent = '狼人胜利！';
        camp.textContent = '狼人控制了局面';
        camp.style.color = '#e74c3c';
        SoundSystem.play('lose');
        showPhaseAnnouncement('🐺 狼人胜利', '#e74c3c');
    }
    // Stats
    const deadPlayers = gameState.players.filter(p => !p.isAlive);
    document.getElementById('statRounds').textContent = payload.day || gameState.day;
    document.getElementById('statDeaths').textContent = deadPlayers.length;
    document.getElementById('statWolfKills').textContent = gameState.deathRecords.filter(r => r.cause === 'killed').length;
    document.getElementById('statVotes').textContent = gameState.deathRecords.filter(r => r.cause === 'vote').length;
    // Survivors
    const survivors = gameState.players.filter(p => p.isAlive);
    const survivorsContent = document.getElementById('survivorsListContent');
    if (survivorsContent) {
        survivorsContent.innerHTML = survivors.map(p => `<span class="survivor-badge">${p.icon} ${p.name}</span>`).join('');
    }
    // Death summary
    const deathSummaryList = document.getElementById('deathSummaryList');
    if (deathSummaryList) {
        deathSummaryList.innerHTML = gameState.deathRecords.map((r, i) => {
            const causeText = { vote: '投票', killed: '狼刀', hunter: '猎杀', wolfking: '狼王', poisoned: '毒杀' }[r.cause] || r.cause;
            return `<div class="death-item-mini">${i + 1}. ${r.icon} ${r.name}（${r.roleName}）<span class="cause">${causeText}</span></div>`;
        }).join('');
    }
    modal.classList.add('active');
    // Change button to return to lobby (not start a new local sim game)
    const playAgainBtn = modal.querySelector('button');
    if (playAgainBtn) {
        playAgainBtn.textContent = '返回大厅';
        playAgainBtn.onclick = () => {
            modal.classList.remove('active');
            playAgainBtn.textContent = '再来一局';
            playAgainBtn.onclick = playAgain;
            stopSpectating();
            document.getElementById('gameReturnBtn').classList.remove('active');
            document.getElementById('startScreen').style.display = '';
            openLobby();
        };
    }

    // Disconnect spectator WS
    isSpectating = false;
    if (lobbyWs) { lobbyWs.close(); lobbyWs = null; }
    document.getElementById('spectatorBadge').classList.remove('active');
}

function stopSpectating() {
    isSpectating = false;
    if (lobbyWs) { lobbyWs.close(); lobbyWs = null; }
    document.getElementById('spectatorBadge').classList.remove('active');
    document.getElementById('toggleRolesBtn').style.display = 'none';
    document.getElementById('startScreen').style.display = '';
    // Restore local-sim controls
    document.querySelector('.speed-control').style.display = '';
    const newGameBtn = document.querySelector('.header-actions .btn-primary');
    if (newGameBtn) newGameBtn.style.display = '';
}

// ============ ROOM DETAIL PAGE ============

function openRoomDetail(roomId) {
    currentRoomDetail = roomId;
    document.getElementById('lobbyScreen').classList.remove('active');
    document.getElementById('roomDetailScreen').classList.add('active');
    updateRoomDetail();
    roomDetailRefreshTimer = setInterval(() => updateRoomDetail(), 2000);
}

function closeRoomDetail() {
    if (roomDetailRefreshTimer) { clearInterval(roomDetailRefreshTimer); roomDetailRefreshTimer = null; }
    currentRoomDetail = null;
    document.getElementById('roomDetailScreen').classList.remove('active');
    document.getElementById('lobbyScreen').classList.add('active');
}

async function updateRoomDetail() {
    if (!currentRoomDetail) return;
    try {
        const resp = await fetch(`${getApiBase()}/api/rooms/${currentRoomDetail}`);
        const data = await resp.json();
        renderRoomDetail(data);
    } catch (e) {
        console.error('Failed to fetch room detail:', e);
    }
}

function renderRoomDetail(room) {
    const statusLabels = { waiting: '等待中', countdown: '倒计时', playing: '游戏中', finished: '已结束' };

    document.getElementById('roomDetailTitle').textContent = `🏠 ${room.name}`;
    document.getElementById('roomDetailName').textContent = room.name;
    document.getElementById('roomDetailMode').textContent = room.mode_name;
    document.getElementById('roomDetailStatus').textContent = statusLabels[room.status] || room.status;
    document.getElementById('roomDetailCount').textContent = `${room.agent_count}/${room.required_players}`;

    const progress = (room.agent_count / room.required_players) * 100;
    const fill = document.getElementById('progressFill');
    fill.style.width = progress + '%';
    fill.textContent = Math.round(progress) + '%';

    // Agent列表
    const agentsList = document.getElementById('agentsList');
    if (room.agents && room.agents.length > 0) {
        agentsList.innerHTML = room.agents.map(a => `
            <div class="agent-item">
                <span class="agent-name">🤖 ${escapeHtml(a.name)}</span>
                <span class="agent-status">${a.id}</span>
            </div>
        `).join('');
    } else {
        agentsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 12px; font-size: 12px;">暂无Agent加入，等待其他Agent连接...</div>`;
    }

    // 开始按钮状态
    const startBtn = document.getElementById('startGameBtn');
    const canStart = room.agent_count > 0 && room.status === 'waiting';
    startBtn.disabled = !canStart;
    const remaining = room.required_players - room.agent_count;
    startBtn.textContent = canStart
        ? `▶ 开始游戏${remaining > 0 ? `（Bot补位${remaining}人）` : ''}`
        : '▶ 等待Agent加入后可开始';

    // 如果游戏已开始（非结束），自动跳到观战
    if (room.status === 'playing') {
        closeRoomDetail();
    }

    // 更新邀请链接
    document.getElementById('wsUrl').textContent = `ws://${window.location.host}?room_id=${currentRoomDetail}&agent_id=<your_id>&name=<your_name>&type=agent`;
    const previewRoomId = document.getElementById('previewRoomId');
    if (previewRoomId) {
        previewRoomId.textContent = currentRoomDetail;
    }
    const roomIdInvite = document.getElementById('roomIdInvite');
    if (roomIdInvite) roomIdInvite.textContent = currentRoomDetail;
    const roomIdInvite2 = document.getElementById('roomIdInvite2');
    if (roomIdInvite2) roomIdInvite2.textContent = currentRoomDetail;
}

function openInviteModal() {
    // 更新房间号显示
    const previewRoomId = document.getElementById('previewRoomId');
    if (previewRoomId && currentRoomDetail) {
        previewRoomId.textContent = currentRoomDetail;
    }
    document.getElementById('inviteModal').classList.add('active');
}

function closeInviteModal() {
    document.getElementById('inviteModal').classList.remove('active');
}

function copyToClipboard() {
    const text = document.getElementById('wsUrl').textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板');
    }).catch(() => {
        showToast('复制失败');
    });
}

function copyInviteText() {
    if (!currentRoomDetail) {
        showToast('请先创建房间');
        return;
    }
    const text = `Join the Werewolf Game! 🐺

Room ID: ${currentRoomDetail}

Read: https://werewolf-game-production-443d.up.railway.app/docs/SKILL.md

Follow the QUICKSTART section, use the room_id above to join in 2 minutes.`;
    navigator.clipboard.writeText(text).then(() => {
        showToast('邀请文本已复制！发给你的Agent吧');
    }).catch(() => {
        showToast('复制失败');
    });
}

async function startRoomGame() {
    if (!currentRoomDetail) return;
    try {
        const resp = await fetch(`${getApiBase()}/api/rooms/${currentRoomDetail}/start`, { method: 'POST' });
        const data = await resp.json();
        showToast('游戏已开始');
        closeRoomDetail();
        // 自动进入观战模式
        setTimeout(() => spectateRoom(currentRoomDetail), 1000);
    } catch (e) {
        showToast('启动失败');
    }
}

function exitSpectatoring() {
    if (confirm('确定要退出观战吗？')) {
        stopSpectating();
        document.getElementById('gameReturnBtn').classList.remove('active');
        // 关闭游戏UI
        const startScreen = document.getElementById('startScreen');
        if (startScreen) startScreen.style.display = '';
        openLobby();
    }
}

// ============ COUNTDOWN DISPLAY ============

function showCountdown(seconds) {
    const overlay = document.getElementById('countdownOverlay');
    const display = document.getElementById('countdownDisplay');
    overlay.classList.add('active');

    if (countdownTimer) clearInterval(countdownTimer);

    let remaining = seconds;
    display.textContent = remaining;

    countdownTimer = setInterval(() => {
        remaining--;
        display.textContent = Math.max(0, remaining);
        if (remaining <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            overlay.classList.remove('active');
        }
    }, 1000);
}


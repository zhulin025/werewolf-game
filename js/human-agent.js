/**
 * 人类玩家 Agent 模式客户端
 *
 * 以人类身份通过 WebSocket 加入 Agent 对战房间
 * 监听 action_request，弹出交互 UI，发送 action_response
 */

let humanAgentWs = null;
let humanAgentRoomId = null;
let humanAgentPlayerId = null;
let humanAgentRole = null;
let humanAgentCamp = null;
let isHumanAgentMode = false;
let pendingRequestId = null;

function joinRoomAsHuman(roomId, playerName) {
    if (typeof stopGame === 'function') stopGame();

    // Close lobby and room detail
    document.getElementById('lobbyScreen').classList.remove('active');
    document.getElementById('roomDetailScreen').classList.remove('active');
    if (typeof lobbyRefreshTimer !== 'undefined' && lobbyRefreshTimer) {
        clearInterval(lobbyRefreshTimer);
    }

    // Show game UI
    const startScreen = document.getElementById('startScreen');
    if (startScreen) startScreen.style.display = 'none';

    isHumanAgentMode = true;
    humanAgentRoomId = roomId;

    // Show badges
    document.getElementById('spectatorBadge').classList.add('active');
    document.getElementById('spectatorBadge').innerHTML = '<span>🎮</span> 人类参战中 <span class="ws-status"><span class="ws-dot connecting" id="wsDot"></span></span>';
    document.getElementById('gameReturnBtn').classList.add('active');
    document.getElementById('toggleRolesBtn').style.display = 'none'; // 人类参战不能看角色

    // Hide irrelevant controls
    document.querySelector('.speed-control').style.display = 'none';

    // Initialize display
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
    renderPlayers();
    renderDeathRecords();
    clearLogs();
    addLog('🎮 人类参战模式 — 连接中...', 'system');

    connectHumanAgent(roomId, playerName);
}

function connectHumanAgent(roomId, playerName) {
    if (humanAgentWs) { humanAgentWs.close(); humanAgentWs = null; }

    const name = playerName || '人类玩家';
    const humanId = 'human-' + Date.now().toString(36);
    const wsUrl = `${getWsBase()}?room_id=${roomId}&type=human&id=${humanId}&name=${encodeURIComponent(name)}`;
    humanAgentWs = new WebSocket(wsUrl);

    humanAgentWs.onopen = () => {
        document.getElementById('wsDot').className = 'ws-dot connected';
        addLog('✅ 已作为人类玩家连接到游戏服务器', 'system');
    };

    humanAgentWs.onclose = () => {
        document.getElementById('wsDot').className = 'ws-dot';
        if (isHumanAgentMode) {
            addLog('⚠ 连接断开，3秒后重连...', 'system');
            setTimeout(() => { if (isHumanAgentMode) connectHumanAgent(roomId, playerName); }, 3000);
        }
    };

    humanAgentWs.onerror = () => {
        document.getElementById('wsDot').className = 'ws-dot';
    };

    humanAgentWs.onmessage = (evt) => {
        try {
            const msg = JSON.parse(evt.data);
            handleHumanAgentMessage(msg);
        } catch (e) {
            console.error('WS message parse error:', e);
        }
    };
}

function handleHumanAgentMessage(msg) {
    switch (msg.type) {
        case 'welcome':
            addLog(`🏠 加入房间: ${msg.payload.room?.name || msg.payload.room_id}`, 'system');
            addLog('⏳ 等待其他玩家加入...', 'system');
            break;

        case 'room_state':
            addLog(`📋 房间: ${msg.payload.player_count || msg.payload.agent_count}/${msg.payload.required_players} 玩家`, 'system');
            break;

        case 'countdown_start':
            if (typeof showCountdown === 'function') showCountdown(msg.payload.seconds);
            addLog(`⏱ 游戏将在 ${msg.payload.seconds} 秒后开始`, 'system');
            break;

        case 'game_started':
            addLog('🎮 游戏开始！', 'system');
            break;

        case 'role_assigned':
            humanAgentPlayerId = msg.payload.your_id;
            humanAgentRole = msg.payload.your_role;
            humanAgentCamp = msg.payload.your_camp;
            addLog(`🎭 你的角色: ${msg.payload.your_role_name} (${humanAgentCamp === 'wolf' ? '狼人阵营' : '好人阵营'})`, 'system');

            // Show role modal
            const role = window.ROLES ? window.ROLES[humanAgentRole] : null;
            if (role) {
                document.getElementById('modalRole').textContent = role.icon;
                document.getElementById('modalTitle').textContent = `你的身份：${role.name}`;
                document.getElementById('modalCamp').textContent = humanAgentCamp === 'wolf' ? '🐺 狼人阵营' : '👥 好人阵营';
                document.getElementById('modalCamp').style.color = humanAgentCamp === 'wolf' ? 'var(--accent)' : 'var(--secondary)';
                document.getElementById('modalDesc').textContent = role.desc;
                document.getElementById('roleModal').classList.add('active');
            }
            break;

        case 'phase_change':
            if (typeof handlePhaseChange === 'function') handlePhaseChange(msg.payload);
            break;

        case 'public_event':
            if (typeof handlePublicEvent === 'function') handlePublicEvent(msg.payload);
            break;

        case 'state_update':
            if (msg.payload.players) {
                if (typeof updateSpectatorPlayers === 'function') updateSpectatorPlayers(msg.payload.players);
            }
            break;

        case 'deaths':
            // 复用观战模式的死亡处理
            if (typeof handleSpectatorMessage === 'function') {
                handleSpectatorMessage(msg);
            }
            break;

        case 'action_request':
            handleHumanActionRequest(msg.payload);
            break;

        case 'action_timeout':
            addLog(`⏰ 操作超时，系统已自动代为决策`, 'system');
            hideActionPanel();
            break;

        case 'game_end':
            if (typeof handleSpectatorGameEnd === 'function') {
                handleSpectatorGameEnd(msg.payload);
            }
            isHumanAgentMode = false;
            break;

        case 'heartbeat':
            // 保持连接
            break;

        case 'game_state':
            if (typeof handleSpectatorMessage === 'function') {
                handleSpectatorMessage(msg);
            }
            break;
    }
}

function handleHumanActionRequest(payload) {
    const { request_id, action_type, valid_targets, context, timeout_ms, guidance } = payload;
    pendingRequestId = request_id;

    addLog(`📢 ${guidance}`, 'system');

    switch (action_type) {
        case 'speak':
        case 'last_words':
            showHumanAgentSpeechInput(request_id, action_type, timeout_ms);
            break;

        case 'vote':
            showHumanAgentVoteTargets(request_id, valid_targets, timeout_ms);
            break;

        case 'night_kill':
        case 'night_check':
        case 'night_guard':
        case 'night_poison':
            showHumanAgentNightAction(request_id, action_type, valid_targets, context, timeout_ms);
            break;

        case 'night_heal':
            showHumanAgentWitchSave(request_id, context, timeout_ms);
            break;

        case 'hunter_shoot':
        case 'wolf_king_shoot':
            showHumanAgentShoot(request_id, action_type, valid_targets, timeout_ms);
            break;

        default:
            // 未知类型，自动跳过
            sendHumanActionResponse(request_id, { target_id: valid_targets?.[0] || -1 });
    }
}

// ============ UI for different action types ============

function showHumanAgentSpeechInput(requestId, actionType, timeoutMs) {
    const panel = document.getElementById('actionPanel');
    const speakRow = document.getElementById('actionSpeakRow');
    const targetsDiv = document.getElementById('actionTargets');
    const hint = document.getElementById('actionHint');
    const input = document.getElementById('actionInput');

    speakRow.style.display = '';
    targetsDiv.style.display = 'none';
    hint.textContent = actionType === 'last_words' ? '📜 发表你的遗言' : '💬 轮到你发言了！';
    input.value = '';
    panel.style.display = '';
    input.focus();

    // Override submit to send via WebSocket
    panel._humanAgentSubmit = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        hideActionPanel();
        sendHumanActionResponse(requestId, { content: text });
    };

    // Override Enter key and submit button
    input.onkeydown = (e) => { if (e.key === 'Enter') panel._humanAgentSubmit(); };

    // Setup voice button
    _setupVoiceButtonForAgent(requestId);

    // 根据是否有麦克风按钮更新 placeholder
    const hasVoice = speakRow.querySelector('.voice-record-btn');
    input.placeholder = hasVoice ? '输入你的发言，或按住麦克风说话...' : '输入你的发言，按回车或点发送...';

    showCountdownTimer(panel, timeoutMs);
}

function showHumanAgentVoteTargets(requestId, validTargets, timeoutMs) {
    const panel = document.getElementById('actionPanel');
    const speakRow = document.getElementById('actionSpeakRow');
    const targetsDiv = document.getElementById('actionTargets');
    const hint = document.getElementById('actionHint');

    speakRow.style.display = 'none';
    targetsDiv.style.display = 'flex';
    targetsDiv.innerHTML = '';
    hint.textContent = '🗳️ 投票！选择你要投出的玩家';
    panel.style.display = '';

    (validTargets || []).forEach(targetId => {
        const p = gameState.players.find(pl => pl.id === targetId);
        if (!p) return;
        const btn = document.createElement('button');
        btn.className = 'action-target-btn';
        btn.textContent = `${p.number || targetId + 1}号 ${p.name}`;
        btn.onclick = () => {
            hideActionPanel();
            sendHumanActionResponse(requestId, { target_id: targetId });
        };
        targetsDiv.appendChild(btn);
    });

    showCountdownTimer(panel, timeoutMs);
}

function showHumanAgentNightAction(requestId, actionType, validTargets, context, timeoutMs) {
    const panel = document.getElementById('actionPanel');
    const speakRow = document.getElementById('actionSpeakRow');
    const targetsDiv = document.getElementById('actionTargets');
    const hint = document.getElementById('actionHint');

    speakRow.style.display = 'none';
    targetsDiv.style.display = 'flex';
    targetsDiv.innerHTML = '';
    panel.style.display = '';

    const hintMap = {
        'night_kill': '🐺 选择今晚击杀的目标',
        'night_check': '🔮 选择今晚查验的玩家',
        'night_guard': '🛡️ 选择今晚守护的玩家',
        'night_poison': '☠️ 选择使用毒药的目标，或跳过',
    };
    hint.textContent = hintMap[actionType] || '请选择目标';

    (validTargets || []).forEach(targetId => {
        const p = gameState.players.find(pl => pl.id === targetId);
        if (!p) return;
        const btn = document.createElement('button');
        btn.className = 'action-target-btn';
        btn.textContent = `${p.number || targetId + 1}号 ${p.name}`;
        btn.onclick = () => {
            hideActionPanel();
            sendHumanActionResponse(requestId, { target_id: targetId });
        };
        targetsDiv.appendChild(btn);
    });

    // 毒药可以跳过
    if (actionType === 'night_poison') {
        const skipBtn = document.createElement('button');
        skipBtn.className = 'action-target-btn skip-btn';
        skipBtn.textContent = '跳过';
        skipBtn.onclick = () => {
            hideActionPanel();
            sendHumanActionResponse(requestId, { target_id: -1 });
        };
        targetsDiv.appendChild(skipBtn);
    }

    showCountdownTimer(panel, timeoutMs);
}

function showHumanAgentWitchSave(requestId, context, timeoutMs) {
    const panel = document.getElementById('actionPanel');
    const speakRow = document.getElementById('actionSpeakRow');
    const targetsDiv = document.getElementById('actionTargets');
    const hint = document.getElementById('actionHint');

    speakRow.style.display = 'none';
    targetsDiv.style.display = 'flex';
    targetsDiv.innerHTML = '';
    panel.style.display = '';

    const victimName = context.victim_name || '某位玩家';
    hint.textContent = `🧪 ${victimName}被狼人杀害，是否使用解药？`;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'action-target-btn';
    saveBtn.textContent = '💊 使用解药';
    saveBtn.onclick = () => {
        hideActionPanel();
        sendHumanActionResponse(requestId, { target_id: 1 }); // 1 = save
    };
    targetsDiv.appendChild(saveBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'action-target-btn skip-btn';
    skipBtn.textContent = '不救';
    skipBtn.onclick = () => {
        hideActionPanel();
        sendHumanActionResponse(requestId, { target_id: 0 }); // 0 = don't save
    };
    targetsDiv.appendChild(skipBtn);

    showCountdownTimer(panel, timeoutMs);
}

function showHumanAgentShoot(requestId, actionType, validTargets, timeoutMs) {
    const panel = document.getElementById('actionPanel');
    const speakRow = document.getElementById('actionSpeakRow');
    const targetsDiv = document.getElementById('actionTargets');
    const hint = document.getElementById('actionHint');

    speakRow.style.display = 'none';
    targetsDiv.style.display = 'flex';
    targetsDiv.innerHTML = '';
    panel.style.display = '';

    hint.textContent = actionType === 'hunter_shoot' ? '🏹 猎人开枪！选择带走的目标' : '👑 狼王发动技能！选择带走的目标';

    (validTargets || []).forEach(targetId => {
        const p = gameState.players.find(pl => pl.id === targetId);
        if (!p) return;
        const btn = document.createElement('button');
        btn.className = 'action-target-btn';
        btn.textContent = `${p.number || targetId + 1}号 ${p.name}`;
        btn.onclick = () => {
            hideActionPanel();
            sendHumanActionResponse(requestId, { target_id: targetId });
        };
        targetsDiv.appendChild(btn);
    });

    showCountdownTimer(panel, timeoutMs);
}

// ============ HELPERS ============

function sendHumanActionResponse(requestId, payload) {
    if (!humanAgentWs || humanAgentWs.readyState !== WebSocket.OPEN) return;

    humanAgentWs.send(JSON.stringify({
        type: 'action_response',
        payload: {
            request_id: requestId,
            ...payload,
        },
    }));
    pendingRequestId = null;
}

function showCountdownTimer(panel, timeoutMs) {
    // 清除旧的倒计时
    const existing = panel.querySelector('.action-countdown');
    if (existing) existing.remove();

    if (!timeoutMs) return;

    const countdown = document.createElement('div');
    countdown.className = 'action-countdown';
    const totalSec = Math.ceil(timeoutMs / 1000);
    let remaining = totalSec;
    countdown.textContent = `⏱ ${remaining}s`;
    panel.appendChild(countdown);

    const timer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(timer);
            countdown.textContent = '⏰ 时间到';
        } else {
            countdown.textContent = `⏱ ${remaining}s`;
            if (remaining <= 5) countdown.style.color = '#e74c3c';
        }
    }, 1000);

    // 存储 timer 以便面板隐藏时清理
    panel._countdownTimer = timer;
}

// Override submitAction for human agent mode
// Use var assignment (not function declaration) to avoid hoisting — ensures
// _originalSubmitAction captures the human-player.js version, not ourselves.
var _originalSubmitAction = typeof submitAction === 'function' ? submitAction : null;

submitAction = function() {
    // 如果在 human agent 模式且有待处理的请求，使用 WS 响应
    const panel = document.getElementById('actionPanel');
    if (isHumanAgentMode && panel._humanAgentSubmit) {
        panel._humanAgentSubmit();
        return;
    }

    // 否则使用原始的本地模式 submit
    if (_originalSubmitAction) {
        _originalSubmitAction();
    } else {
        const input = document.getElementById('actionInput');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        hideActionPanel();
        resolveHumanAction(text);
    }
};

function _setupVoiceButtonForAgent(requestId) {
    if (typeof VoiceInput === 'undefined' || !VoiceInput.isSupported()) return;

    const speakRow = document.getElementById('actionSpeakRow');
    if (speakRow.querySelector('.voice-record-btn')) return;

    const voiceBtn = document.createElement('button');
    voiceBtn.className = 'btn voice-record-btn';
    voiceBtn.innerHTML = '🎙️';
    voiceBtn.title = '点击开始录音';

    let isRecording = false;

    const startRec = async () => {
        if (isRecording) return;
        try { 
            await VoiceInput.startRecording(); 
            isRecording = true;
            voiceBtn.classList.add('recording');
            voiceBtn.innerHTML = '⏹️';
            voiceBtn.title = '点击停止并识别';
            showToast('🎙️ 录音中，说完请再次点击...');
        } catch (err) {
            showToast('❌ ' + err.message);
            isRecording = false;
        }
    };

    const stopRec = async () => {
        if (!isRecording) return;
        isRecording = false;
        voiceBtn.classList.remove('recording');
        voiceBtn.innerHTML = '🎙️';
        voiceBtn.title = '点击开始录音';
        
        try {
            showToast('🔄 正在识别语音，请稍候...');
            const text = await VoiceInput.stopAndTranscribe();
            if (text && text.trim()) {
                input.value = text;
                showToast('✅ 识别成功');
                // 不要自动提交，让用户确认/修改
            } else {
                showToast('❓ 未检测到语音内容，请重试');
            }
        } catch (err) {
            showToast('❌ 识别失败: ' + err.message);
        }
    };

    // 点击切换模式：点一下开始录音，再点一下停止并转写
    voiceBtn.onclick = (e) => {
        e.preventDefault();
        if (isRecording) {
            stopRec();
        } else {
            startRec();
        }
    };

    const submitBtn = speakRow.querySelector('button[onclick="submitAction()"]') || speakRow.querySelector('.btn-primary');
    if (submitBtn) speakRow.insertBefore(voiceBtn, submitBtn);
    else speakRow.appendChild(voiceBtn);
}

function disconnectHumanAgent() {
    isHumanAgentMode = false;
    humanAgentRoomId = null;
    humanAgentPlayerId = null;
    humanAgentRole = null;
    pendingRequestId = null;
    if (humanAgentWs) {
        humanAgentWs.close();
        humanAgentWs = null;
    }
}

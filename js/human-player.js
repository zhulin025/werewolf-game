// ============ HUMAN PLAYER MODE ============

let humanModeEnabled = false;
let humanActionResolve = null;
let humanRolePreference = 'random'; // 'random' | 'good' | 'wolf'

// Server configuration status
let serverConfig = {
    stt_configured: false,
    llm_configured: false,
    stt_provider: 'none'
};

/**
 * Fetch server configuration on init
 */
async function fetchServerConfig() {
    try {
        const response = await fetch('/api/health');
        if (response.ok) {
            const data = await response.json();
            serverConfig.stt_configured = data.stt_configured;
            serverConfig.llm_configured = data.llm_configured;
            serverConfig.stt_provider = data.stt_provider;
            console.log('[Config] Server state:', serverConfig);
        }
    } catch (e) {
        console.warn('[Config] Failed to fetch server health:', e);
    }
}

// Initial fetch
fetchServerConfig();

function toggleHumanMode() {
    humanModeEnabled = !humanModeEnabled;
    const btn = document.getElementById('humanModeBtn');
    if (humanModeEnabled) {
        btn.classList.add('human-mode-active');
        btn.innerHTML = '🎮 已开启参与';
        showToast('人类模式已开启，下一局你将参与游戏');
    } else {
        btn.classList.remove('human-mode-active');
        btn.innerHTML = '🎮 参与游戏';
        showToast('人类模式已关闭');
    }
}

// 从开始页面直接启动参战模式
function startHumanGame() {
    humanModeEnabled = true;
    const btn = document.getElementById('humanModeBtn');
    if (btn) {
        btn.classList.add('human-mode-active');
        btn.innerHTML = '🎮 已开启参与';
    }
    startGame();
}

// 角色偏好选择
function selectRolePreference(pref, btn) {
    humanRolePreference = pref;
    const container = btn.parentElement;
    container.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// Called from initGame() to set up human player
function setupHumanPlayer() {
    if (!humanModeEnabled) {
        gameState.humanPlayerId = -1;
        return;
    }

    const players = gameState.players;
    let humanIdx;

    if (humanRolePreference === 'good') {
        // 优先分配好人阵营
        const goodIndices = players.map((p, i) => p.camp === 'good' ? i : -1).filter(i => i >= 0);
        humanIdx = goodIndices.length > 0
            ? goodIndices[Math.floor(Math.random() * goodIndices.length)]
            : Math.floor(Math.random() * players.length);
    } else if (humanRolePreference === 'wolf') {
        // 优先分配狼人阵营
        const wolfIndices = players.map((p, i) => p.camp === 'wolf' ? i : -1).filter(i => i >= 0);
        humanIdx = wolfIndices.length > 0
            ? wolfIndices[Math.floor(Math.random() * wolfIndices.length)]
            : Math.floor(Math.random() * players.length);
    } else {
        humanIdx = Math.floor(Math.random() * players.length);
    }

    const human = players[humanIdx];
    human.isAI = false;
    human.isHuman = true;
    human.name = '你';
    gameState.humanPlayerId = humanIdx;

    // Show role reveal
    setTimeout(() => {
        const role = ROLES[human.role];
        if (role) {
            document.getElementById('modalRole').textContent = role.icon;
            document.getElementById('modalTitle').textContent = `你的身份：${role.name}`;
            document.getElementById('modalCamp').textContent = human.camp === 'wolf' ? '🐺 狼人阵营' : '👥 好人阵营';
            document.getElementById('modalCamp').style.color = human.camp === 'wolf' ? 'var(--accent)' : 'var(--secondary)';
            document.getElementById('modalDesc').textContent = role.desc;
            document.getElementById('roleModal').classList.add('active');
        }
    }, 500);
}

function closeRoleModal() {
    document.getElementById('roleModal').classList.remove('active');
}

// Promise-based wait for human input
function waitForHumanAction() {
    return new Promise(resolve => {
        humanActionResolve = resolve;
    });
}

function resolveHumanAction(value) {
    if (humanActionResolve) {
        const resolve = humanActionResolve;
        humanActionResolve = null;
        
        // Ensure game is not paused when resolving human action
        if (window.isPaused) {
            console.log('[Human] Action resolved, clearing pause state');
            window.isPaused = false;
            if (typeof resumeGame === 'function') resumeGame();
        }
        
        resolve(value);
    }
}

// Show night action panel for human player
function showHumanNightAction(player, actionType) {
    const panel = document.getElementById('actionPanel');
    const speakRow = document.getElementById('actionSpeakRow');
    const targetsDiv = document.getElementById('actionTargets');
    const hint = document.getElementById('actionHint');

    speakRow.style.display = 'none';
    targetsDiv.style.display = 'flex';
    targetsDiv.innerHTML = '';
    panel.style.display = '';

    const alivePlayers = gameState.players.filter(p => p.isAlive && p.id !== player.id);

    switch (actionType) {
        case 'wolf_kill': {
            hint.textContent = '🐺 选择今晚击杀的目标';
            const targets = alivePlayers.filter(p => !p.role.includes('WOLF'));
            targets.forEach(t => {
                const btn = document.createElement('button');
                btn.className = 'action-target-btn';
                btn.textContent = `${t.number}号 ${t.name}`;
                btn.onclick = () => { hideActionPanel(); resolveHumanAction(t); };
                targetsDiv.appendChild(btn);
            });
            break;
        }
        case 'witch_save': {
            hint.textContent = '🧪 是否使用解药救人？';
            const saveBtn = document.createElement('button');
            saveBtn.className = 'action-target-btn';
            saveBtn.textContent = '💊 使用解药';
            saveBtn.onclick = () => { hideActionPanel(); resolveHumanAction(true); };
            targetsDiv.appendChild(saveBtn);

            const skipBtn = document.createElement('button');
            skipBtn.className = 'action-target-btn skip-btn';
            skipBtn.textContent = '跳过';
            skipBtn.onclick = () => { hideActionPanel(); resolveHumanAction(false); };
            targetsDiv.appendChild(skipBtn);
            break;
        }
        case 'witch_poison': {
            hint.textContent = '☠️ 是否使用毒药？选择目标或跳过';
            alivePlayers.forEach(t => {
                const btn = document.createElement('button');
                btn.className = 'action-target-btn';
                btn.textContent = `${t.number}号 ${t.name}`;
                btn.onclick = () => { hideActionPanel(); resolveHumanAction(t); };
                targetsDiv.appendChild(btn);
            });
            const skipBtn = document.createElement('button');
            skipBtn.className = 'action-target-btn skip-btn';
            skipBtn.textContent = '跳过';
            skipBtn.onclick = () => { hideActionPanel(); resolveHumanAction(null); };
            targetsDiv.appendChild(skipBtn);
            break;
        }
        case 'prophet_check': {
            hint.textContent = '🔮 选择今晚查验的玩家';
            alivePlayers.forEach(t => {
                const btn = document.createElement('button');
                btn.className = 'action-target-btn';
                btn.textContent = `${t.number}号 ${t.name}`;
                btn.onclick = () => { hideActionPanel(); resolveHumanAction(t); };
                targetsDiv.appendChild(btn);
            });
            break;
        }
        case 'guard_protect': {
            hint.textContent = '🛡️ 选择今晚守护的玩家';
            const guardable = alivePlayers.filter(p => p.id !== aiState.lastGuardTarget);
            guardable.forEach(t => {
                const btn = document.createElement('button');
                btn.className = 'action-target-btn';
                btn.textContent = `${t.number}号 ${t.name}`;
                btn.onclick = () => { hideActionPanel(); resolveHumanAction(t); };
                targetsDiv.appendChild(btn);
            });
            // Can also guard self
            if (player.id !== aiState.lastGuardTarget) {
                const selfBtn = document.createElement('button');
                selfBtn.className = 'action-target-btn';
                selfBtn.textContent = `${player.number}号 你自己`;
                selfBtn.onclick = () => { hideActionPanel(); resolveHumanAction(player); };
                targetsDiv.appendChild(selfBtn);
            }
            break;
        }
        case 'hunter_shoot': {
            hint.textContent = '🏹 猎人开枪！选择带走的目标';
            alivePlayers.forEach(t => {
                const btn = document.createElement('button');
                btn.className = 'action-target-btn';
                btn.textContent = `${t.number}号 ${t.name}`;
                btn.onclick = () => { hideActionPanel(); resolveHumanAction(t); };
                targetsDiv.appendChild(btn);
            });
            break;
        }
        case 'wolf_king_shoot': {
            hint.textContent = '👑 狼王发动技能！选择带走的目标';
            alivePlayers.forEach(t => {
                const btn = document.createElement('button');
                btn.className = 'action-target-btn';
                btn.textContent = `${t.number}号 ${t.name}`;
                btn.onclick = () => { hideActionPanel(); resolveHumanAction(t); };
                targetsDiv.appendChild(btn);
            });
            break;
        }
    }
}

// Show speech input for human (with voice support)
function showHumanSpeechInput() {
    const panel = document.getElementById('actionPanel');
    const speakRow = document.getElementById('actionSpeakRow');
    const targetsDiv = document.getElementById('actionTargets');
    const hint = document.getElementById('actionHint');
    const input = document.getElementById('actionInput');

    speakRow.style.display = '';
    targetsDiv.style.display = 'none';
    hint.textContent = '💬 轮到你发言了！';
    input.value = '';
    panel.style.display = '';
    input.focus();

    _setupVoiceButton('speak');

    // 根据是否有麦克风按钮更新 placeholder
    const hasVoice = speakRow.querySelector('.voice-record-btn');
    input.placeholder = hasVoice ? '输入你的发言，或按住麦克风说话...' : '输入你的发言，按回车或点发送...';
}

// Show vote targets for human
function showHumanVoteTargets(voteable) {
    const panel = document.getElementById('actionPanel');
    const speakRow = document.getElementById('actionSpeakRow');
    const targetsDiv = document.getElementById('actionTargets');
    const hint = document.getElementById('actionHint');

    speakRow.style.display = 'none';
    targetsDiv.style.display = 'flex';
    targetsDiv.innerHTML = '';
    hint.textContent = '🗳️ 投票！选择你要投出的玩家';
    panel.style.display = '';

    voteable.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'action-target-btn';
        btn.textContent = `${t.number}号 ${t.name}`;
        btn.onclick = () => { hideActionPanel(); resolveHumanAction(t); };
        targetsDiv.appendChild(btn);
    });
}

// Show last words input (with voice support)
function showHumanLastWords() {
    const panel = document.getElementById('actionPanel');
    const speakRow = document.getElementById('actionSpeakRow');
    const targetsDiv = document.getElementById('actionTargets');
    const hint = document.getElementById('actionHint');
    const input = document.getElementById('actionInput');

    speakRow.style.display = '';
    targetsDiv.style.display = 'none';
    hint.textContent = '📜 你被淘汰了，留下遗言吧';
    input.value = '';
    panel.style.display = '';
    input.focus();

    _setupVoiceButton('last_words');

    const hasVoice = speakRow.querySelector('.voice-record-btn');
    input.placeholder = hasVoice ? '输入你的遗言，或按住麦克风说话...' : '输入你的遗言，按回车或点发送...';
}

function hideActionPanel() {
    document.getElementById('actionPanel').style.display = 'none';
}

// Submit speech or last words
function submitAction() {
    const input = document.getElementById('actionInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    hideActionPanel();
    resolveHumanAction(text);
}

// Check if current player is human
function isHumanPlayer(player) {
    return player && player.isHuman === true && gameState.humanPlayerId >= 0;
}

// ============ VOICE INPUT INTEGRATION ============

function _setupVoiceButton(actionType) {
    const speakRow = document.getElementById('actionSpeakRow');
    if (!speakRow) return;

    // 避免重复添加
    if (speakRow.querySelector('.voice-record-btn') || speakRow.querySelector('.voice-warning-icon')) return;

    // 检查浏览器支持情况（try-catch 防止异常导致游戏崩溃）
    let isBrowserSupported = false;
    try {
        isBrowserSupported = typeof VoiceInput !== 'undefined' && VoiceInput && typeof VoiceInput.isSupported === 'function' && VoiceInput.isSupported();
    } catch (e) {
        console.warn('[Voice] VoiceInput check failed:', e.message);
    }

    // 如果服务端配置了 STT 但浏览器不支持（通常是由于非 HTTPS），显示警告
    if (serverConfig.stt_configured && !isBrowserSupported) {
        const warning = document.createElement('span');
        warning.className = 'voice-warning-icon';
        warning.innerHTML = '⚠️';
        warning.title = '语音输入需要 HTTPS 环境或浏览器授权';
        warning.style.cursor = 'help';
        warning.style.marginRight = '8px';
        warning.onclick = () => showToast('提示：语音录入需要 HTTPS 安全环境（或 localhost）才能启用。');
        
        const submitBtn = speakRow.querySelector('button[onclick="submitAction()"]') || speakRow.querySelector('button');
        if (submitBtn) speakRow.insertBefore(warning, submitBtn);
        return;
    }

    // 如果都不支持且没配置，直接返回
    if (!isBrowserSupported) return;

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
            voiceBtn.title = '点击停止录音';
            showToast('🎙️ 录音中，完成后再次点击...');
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
            showToast('🔄 正在转写语音...');
            const text = await VoiceInput.stopAndTranscribe();
            if (text && text.trim()) {
                const input = document.getElementById('actionInput');
                input.value = text;
                showToast('✅ 转写成功');
            } else {
                showToast('未检测到有效语音');
            }
        } catch (err) {
            showToast('❌ 语音转写失败: ' + err.message);
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

    // 插入到 submit 按钮之前
    const submitBtn = speakRow.querySelector('button[onclick="submitAction()"]') || speakRow.querySelector('button');
    if (submitBtn) {
        speakRow.insertBefore(voiceBtn, submitBtn);
    } else {
        speakRow.appendChild(voiceBtn);
    }
}

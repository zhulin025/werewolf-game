// ============ HUMAN PLAYER MODE ============

let humanModeEnabled = false;
let humanActionResolve = null;

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

// Called from initGame() to set up human player
function setupHumanPlayer() {
    if (!humanModeEnabled) {
        gameState.humanPlayerId = -1;
        return;
    }

    const players = gameState.players;
    const humanIdx = Math.floor(Math.random() * players.length);
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

// Show speech input for human
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
    input.placeholder = '输入你的发言...';
    panel.style.display = '';
    input.focus();
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

// Show last words input
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
    input.placeholder = '输入你的遗言...';
    panel.style.display = '';
    input.focus();
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

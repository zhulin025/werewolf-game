// ============ GAME CONFIGURATION ============
// Role images mapping
const ROLE_IMAGES = {
    VILLAGER: 'assets/images/01_村民.png',
    PROPHET: 'assets/images/02_预言家.png',
    WITCH: 'assets/images/03_女巫.png',
    GUARD: 'assets/images/04_守卫.png',
    WOLF: 'assets/images/05_普通狼人.png',
    WOLF_KING: 'assets/images/06_狼王.png',
    HUNTER: 'assets/images/07_猎人.png',
};

const ROLES = {
    VILLAGER: { name: '村民', camp: 'good', icon: '👤', image: ROLE_IMAGES.VILLAGER, desc: '没有任何特殊技能，但你的分析和逻辑是找出狼人的关键。仔细观察每个人的发言和投票，找到狼人的破绽！' },
    PROPHET: { name: '预言家', camp: 'good', icon: '🔮', image: ROLE_IMAGES.PROPHET, desc: '每晚可以查验一名玩家的身份是好是坏。善用你的查验信息，但要小心狼人可能假跳预言家！' },
    WITCH: { name: '女巫', camp: 'good', icon: '🧪', image: ROLE_IMAGES.WITCH, desc: '你有一瓶解药和一瓶毒药。解药可以救人，毒药可以杀人。用得好可以扭转局势，用不好可能害死好人！' },
    GUARD: { name: '守卫', camp: 'good', icon: '🛡️', image: ROLE_IMAGES.GUARD, desc: '每晚可以守护一名玩家，让他不被狼人杀害。但要小心，守卫和女巫不能同时守护同一个人！' },
    HUNTER: { name: '猎人', camp: 'good', icon: '🏹', image: ROLE_IMAGES.HUNTER, desc: '当你被投票出局或被狼人杀害时，你可以开枪带走一人。善用这个权力，但别误杀好人！' },
    WOLF: { name: '普通狼人', camp: 'wolf', icon: '🐺', image: ROLE_IMAGES.WOLF, desc: '每晚可以和同伴讨论并杀死一名玩家。你的目标是杀死所有好人，同时隐藏自己的身份。' },
    WOLF_KING: { name: '狼王', camp: 'wolf', icon: '👑', image: ROLE_IMAGES.WOLF_KING, desc: '狼人团队的领袖。被投票出局或被毒死时可以开枪带走一人。带领你的团队走向胜利！' }
};

// 显式暴露给全局
window.ROLES = ROLES;
window.ROLE_IMAGES = ROLE_IMAGES;
window.toggleRolesDisplay = toggleRolesDisplay;

const PLAYER_NAMES = [
    '豆包', '千问', 'Deepseek', 'Gemini', 'ChatGPT', 'Grok',
    'Kimi', 'Claude', 'Claude Ops', 'GLM', 'Minimax', '小米'
];

// ============ GAME STATE ============
let gameState = {
    phase: 'waiting', // waiting, night, day, vote, end
    day: 0,
    players: [],
    currentSpeaker: 0,
    speakingOrder: [],
    votes: {},
    isHumanTurn: false,
    humanPlayerId: 0,
    deathRecords: [] // {name, cause, day} - cause: 'vote'(投票出局), 'killed'(狼人击杀), 'hunter'(猎人带走), 'wolfking'(狼王带走)
};

// Async AI decision wrapper - tries LLM first, falls back to local
async function makeAIDecisionAsync(player, action) {
    if (typeof llmAdapter !== 'undefined' && llmAdapter && llmAdapter.config?.provider !== 'local' && llmAdapter.config?.apiKey) {
        try {
            const context = {
                player: player,
                gameState: {
                    day: gameState.day,
                    players: gameState.players,
                    phase: gameState.phase
                }
            };
            const result = await llmAdapter.makeDecision(context, action);
            if (result !== null && result !== undefined) return result;
        } catch (e) {
            console.error('[AI] LLM decision failed, using local:', e);
        }
    }
    return makeAISmartDecision(player, action);
}

// Add a death record
function addDeathRecord(playerName, cause, day) {
    // Look up player role from gameState
    const player = gameState.players.find(p => p.name === playerName);
    const roleName = player ? player.roleName : '';
    const icon = player ? player.icon : '💀';
    gameState.deathRecords.push({ name: playerName, cause: cause, day: day, roleName, icon });
    renderDeathRecords();
}

// Role display toggle
let showRoles = false;
function toggleRolesDisplay() {
    showRoles = !showRoles;
    const btn = document.getElementById('toggleRolesBtn');
    if (btn) btn.textContent = showRoles ? '🙈 隐藏角色' : '🎭 显示角色';
    renderPlayers();
}

// Render death records
function renderDeathRecords() {
    const container = document.getElementById('deathRecords');
    if (!container) return;

    container.innerHTML = '';

    gameState.deathRecords.forEach((record, index) => {
        const div = document.createElement('div');
        div.className = 'death-item';

        const causeText = {
            'vote': '投票出局',
            'killed': '狼人击杀',
            'hunter': '猎人带走',
            'wolfking': '狼王带走'
        }[record.cause] || record.cause;

        div.innerHTML = `
            <div class="main-info">
                <span class="order">${index + 1}</span>
                <span class="name">${record.icon} ${record.name}</span>
                <span class="cause ${record.cause}">${causeText}</span>
            </div>
            <div class="role-info">${record.roleName}</div>
        `;
        container.appendChild(div);
    });
}

// ============ INITIALIZATION ============
function initStars() {
    const starsContainer = document.getElementById('stars');
    for (let i = 0; i < 100; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.width = Math.random() * 3 + 1 + 'px';
        star.style.height = star.style.width;
        star.style.animationDelay = Math.random() * 3 + 's';
        starsContainer.appendChild(star);
    }
}

function initGame() {
    // Init sound
    SoundSystem.init();
    resetAIMemory();
    resetAIState();
    resetNightActions();
    if (typeof gameAnalytics !== 'undefined') gameAnalytics.reset();

    // Get game mode configuration
    const modeConfig = GameModes[currentGameMode];
    const playerCount = modeConfig.players;
    const rolePool = [...modeConfig.roles];

    // Shuffle roles
    for (let i = rolePool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]];
    }

    // Create players
    gameState.players = [];
    for (let i = 0; i < playerCount; i++) {
        const roleKey = rolePool[i];
        const role = ROLES[roleKey];
        gameState.players.push({
            id: i,
            number: i + 1,
            name: PLAYER_NAMES[i % PLAYER_NAMES.length],
            role: roleKey,
            roleName: role.name,
            camp: role.camp,
            icon: role.icon,
            isAlive: true,
            isAI: true,
            isHuman: false // All AI, human is just observer
        });
    }

    gameState.humanPlayerId = -1;
    if (typeof setupHumanPlayer === 'function') setupHumanPlayer();
    gameState.phase = 'waiting';
    gameState.day = 0;
    nightActions.wolfTarget = null;
    gameState.suspects = [];
    gameState.deathRecords = [];
    showRoles = false;
    const toggleBtn = document.getElementById('toggleRolesBtn');
    if (toggleBtn) toggleBtn.textContent = '🎭 显示角色';

    renderPlayers();
    renderDeathRecords();
}

// ============ GAME SPEED CONTROL ============
let gameSpeed = 1;

function setSpeed(speed) {
    gameSpeed = speed;
    document.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`speed${speed === 0.5 ? '05' : speed === 1 ? '10' : speed === 2 ? '20' : '50'}`).classList.add('active');
    addLog(`⚡ 游戏速度设置为 ${speed}x`, 'system');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(50, ms / gameSpeed)));
}

// 停止当前游戏逻辑（用于进入大厅或切换模式）
function stopGame() {
    console.log('[Game] Stopping current game simulation...');
    if (phaseTimeout) {
        clearTimeout(phaseTimeout);
        phaseTimeout = null;
    }
    gameState.phase = 'end'; // 触发异步循环的退出检查
    
    // 停止语音
    if (typeof VoiceSystem !== 'undefined') VoiceSystem.stop();
    
    // 移除所有悬浮 UI 元素（弹窗、公告、指示器等）
    document.querySelectorAll('.modal, .phase-announcement, .night-action-indicator, .wolf-team-vision, .speech-bubble').forEach(el => el.remove());
    
    // 隐藏气泡和特效
    if (typeof hideSpeechBubble === 'function') hideSpeechBubble();
    
    // 归位开始界面
    const startScreen = document.getElementById('startScreen');
    if (startScreen) startScreen.style.display = '';
    
    const toggleBtn = document.getElementById('toggleRolesBtn');
    if (toggleBtn) toggleBtn.style.display = 'none';
    
    const backBtn = document.getElementById('headerBackBtn');
    if (backBtn) backBtn.style.display = 'none';
    
    // 隐藏主游戏界面以防干扰
    const gameContainer = document.querySelector('.main-container');
    if (gameContainer) gameContainer.style.display = 'none';

    addLog('⏹ 游戏已停止', 'system');
}

// ============ GAME FLOW ============
function startGame() {
    console.log('startGame called');
    try {
        // Unlock speechSynthesis from user gesture context (Chrome requirement)
        VoiceSystem.warmup();
        SoundSystem.init();

        // Hide start screen
        const startScreen = document.getElementById('startScreen');
        if (startScreen) {
            startScreen.style.display = 'none';
        }

        // All AI mode - keep action panel hidden
        const actionPanel = document.getElementById('actionPanel');
        if (actionPanel) {
            actionPanel.style.display = 'none';
        }

        // Show role toggle + back button
        document.getElementById('toggleRolesBtn').style.display = '';
        document.getElementById('headerBackBtn').style.display = '';

        // Reset game
        initGame();
        clearLogs();
        
        // Show game UI
        const gameContainer = document.querySelector('.main-container');
        if (gameContainer) gameContainer.style.display = '';
        
        addLog('🐺 游戏开始！所有玩家都是AI，人类观众观战', 'system');

        // Start first night
        schedulePhase(() => startNight(), 2000);
    } catch (error) {
        console.error('Game start error:', error);
        addLog('⚠️ 游戏初始化失败，请刷新重试', 'system');
    }
}

function showRoleModal(player) {
    const modal = document.getElementById('roleModal');
    document.getElementById('modalRole').textContent = player.icon;
    document.getElementById('modalTitle').textContent = `${player.name} - ${player.roleName}`;
    document.getElementById('modalCamp').textContent = player.camp === 'good' ? '好人阵营' : '狼人阵营';
    document.getElementById('modalCamp').className = `modal-camp ${player.camp === 'good' ? 'good' : 'wolf'}`;
    document.getElementById('modalDesc').textContent = ROLES[player.role].desc;
    modal.classList.add('active');
}

function closeRoleModal() {
    document.getElementById('roleModal').classList.remove('active');
}

// ============ REPLAY INTEGRATION ============
function initReplay() {
    // Initialize replay system if available
    if (typeof ReplaySystem !== 'undefined') {
        // Replay system loaded
    }
}

function startRecording() {
    if (typeof replaySystem !== 'undefined') {
        replaySystem.startRecording(`game-${Date.now()}`);
        replaySystem.recordPlayers(gameState.players);
    }
}

function recordEvent(type, payload) {
    if (typeof replaySystem !== 'undefined' && replaySystem.currentRecording) {
        replaySystem.recordEvent(type, payload);
    }
}

// Global phase transition timeout - cancel to prevent stale transitions
let phaseTimeout = null;
function schedulePhase(fn, delay) {
    if (phaseTimeout) clearTimeout(phaseTimeout);
    phaseTimeout = setTimeout(() => {
        phaseTimeout = null;
        fn();
    }, delay);
}

async function startNight() {
    if (gameState.phase === 'end') return;
    gameState.day++;
    gameState.phase = 'night';
    updatePhaseDisplay();

    addLog(`═══════════════════════════════════`, 'night');
    addLog(`🌙 第 ${gameState.day} 夜 - 夜幕降临`, 'night');
    addLog(`═══════════════════════════════════`, 'night');

    SoundSystem.play('night');
    VoiceSystem.announce(`第${gameState.day}夜，夜幕降临，请各位玩家闭眼`);

    // Show phase announcement
    showPhaseAnnouncement('🌙 夜幕降临', '#9b59b6');

    // Play night animation
    await playNightAnimation();

    // Night sequence - reset night actions
    resetNightActions();
    await pausedSleep(1000);

    // 1. 狼人睁眼：确认队友，共同刀1人
    await nightPhase('WOLF', '狼人', async (players) => {
        addLog(`🐺 狼人们正在讨论今晚要刀谁...`, 'night');
        VoiceSystem.announce('狼人团队正在讨论击杀目标');
        await pausedSleep(2000);

        const wolfLeader = players[0];
        const target = await makeAIDecisionAsync(wolfLeader, 'wolf_kill');
        nightActions.wolfTarget = target;
        if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordKeyMoment(gameState.day, 'night', 'wolf_kill', `狼人击杀 ${target.name}（${target.roleName}）`, wolfLeader);
        addLog(`🐺 狼人决定击杀 ${target.name}（${target.roleName}）`, 'night');
        VoiceSystem.announce(`狼人决定今晚击杀${target.roleName}`);
        return target;
    });

    // 2. 女巫睁眼：得知被刀玩家，可解药救人或毒药毒人
    await nightPhase('WITCH', '女巫', async (player) => {
        const victim = nightActions.wolfTarget;
        if (victim) {
            addLog(`🧪 女巫得知 ${victim.name} 被狼人杀害`, 'night');
            VoiceSystem.announce(`女巫得知${victim.name}被狼人杀害`);
        }
        await pausedSleep(1500);

        const isSelfKilled = victim && victim.id === player.id;
        const canSelfSave = isSelfKilled && gameState.day === 1;

        // Human witch
        if (player.isHuman && typeof showHumanNightAction === 'function') {
            // Step 1: Save?
            if (victim && aiState.witchHasAntidote && (canSelfSave || !isSelfKilled)) {
                showHumanNightAction(player, 'witch_save');
                const shouldSave = await waitForHumanAction();
                if (shouldSave) {
                    aiState.witchHasAntidote = false;
                    nightActions.witchSaved = true;
                    if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordKeyMoment(gameState.day, 'night', 'witch_save', `女巫使用解药救人`, player);
                    addLog(`🧪 你使用了解药救人`, 'night');
                    VoiceSystem.announce('女巫使用了解药救人');
                    return { action: 'heal' };
                }
            }
            // Step 2: Poison?
            if (!nightActions.witchSaved && aiState.witchHasPoison) {
                showHumanNightAction(player, 'witch_poison');
                const poisonTarget = await waitForHumanAction();
                if (poisonTarget) {
                    aiState.witchHasPoison = false;
                    nightActions.witchPoisonTarget = poisonTarget;
                    if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordKeyMoment(gameState.day, 'night', 'witch_poison', `女巫毒杀 ${poisonTarget.name}`, player);
                    addLog(`🧪 你使用毒药毒杀 ${poisonTarget.name}`, 'night');
                    VoiceSystem.announce('女巫使用了毒药');
                    return { action: 'poison', target: poisonTarget };
                }
            }
            addLog(`🧪 你选择不使用药水`, 'night');
            return { action: 'none' };
        }

        // AI witch
        if (victim && aiState.witchHasAntidote) {
            if (canSelfSave || !isSelfKilled) {
                const shouldHeal = await makeAIDecisionAsync(player, 'witch_heal');
                if (shouldHeal) {
                    aiState.witchHasAntidote = false;
                    nightActions.witchSaved = true;
                    if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordKeyMoment(gameState.day, 'night', 'witch_save', `女巫使用解药救人`, player);
                    addLog(`🧪 女巫使用了解药救人`, 'night');
                    VoiceSystem.announce('女巫使用了解药救人');
                    return { action: 'heal' };
                }
            } else if (isSelfKilled && !canSelfSave) {
                addLog(`🧪 女巫被刀但非首夜，不可自救`, 'night');
            }
        }

        if (!nightActions.witchSaved && aiState.witchHasPoison) {
            const poisonTarget = await makeAIDecisionAsync(player, 'witch_poison');
            if (poisonTarget) {
                aiState.witchHasPoison = false;
                nightActions.witchPoisonTarget = poisonTarget;
                if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordKeyMoment(gameState.day, 'night', 'witch_poison', `女巫毒杀 ${poisonTarget.name}`, player);
                addLog(`🧪 女巫使用毒药毒杀 ${poisonTarget.name}`, 'night');
                VoiceSystem.announce(`女巫使用了毒药`);
                return { action: 'poison', target: poisonTarget };
            }
        }

        addLog(`🧪 女巫选择不使用药水`, 'night');
        VoiceSystem.announce('女巫今晚没有使用药水');
        return { action: 'none' };
    });

    // 3. 预言家睁眼：查验1人身份
    await nightPhase('PROPHET', '预言家', async (player) => {
        const target = await makeAIDecisionAsync(player, 'prophet_check');
        const isWolf = target.camp === 'wolf';

        aiMemory.confirmed[target.id] = isWolf ? 'wolf' : 'good';
        aiState.prophetReports[player.id] = {
            day: gameState.day,
            target: target,
            result: isWolf ? 'wolf' : 'good'
        };

        const resultText = isWolf ? '查杀' : '金水';
        if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordKeyMoment(gameState.day, 'night', 'prophet_check', `预言家查验 ${target.name} → ${resultText}`, player);
        addLog(`🔮 预言家查验：${target.name}（${target.roleName}）→ ${resultText}`, 'night');
        VoiceSystem.announce(`预言家查验${target.name}，${resultText}`);
        return { target, isWolf };
    });

    // 4. 守卫睁眼：守护1人（不可连续守同一人）
    await nightPhase('GUARD', '守卫', async (player) => {
        const target = await makeAIDecisionAsync(player, 'guard');
        nightActions.guardTarget = target;
        aiState.lastGuardTarget = target;
        const targetName = target?.name || '无';
        addLog(`🛡️ 守卫 ${player.name} 选择了守护 ${targetName}`, 'night');
        VoiceSystem.announce(`守卫选择了守护${targetName}`);
        return target;
    });

    // 5. 猎人：仅首夜睁眼确认身份
    if (gameState.day === 1) {
        await nightPhase('HUNTER', '猎人', async (player) => {
            addLog(`🏹 猎人 ${player.name} 确认了自己的身份`, 'night');
            VoiceSystem.announce('猎人确认身份');
            return null;
        });
    }

    // Resolve night deaths
    await resolveNightDeaths();

    // Check win condition
    if (checkWinCondition()) return;

    // Start day
    schedulePhase(() => startDay(), 2000);
}

async function nightPhase(roleKey, roleName, actionFn) {
    const player = gameState.players.find(p => p.role === roleKey && p.isAlive);

    if (!player) {
        addLog(`⚠️ 没有找到存活的 ${roleName}`, 'system');
        return null;
    }

    // Play role-specific sound
    SoundSystem.play(roleKey.toLowerCase());

    // Show night action indicator
    const indicator = document.createElement('div');
    indicator.className = 'night-action-indicator';
    indicator.innerHTML = `
        <div class="night-action-icon">${player.icon}</div>
        <div class="night-action-text">${player.name}（${player.roleName}）请睁眼</div>
        <div class="night-action-hint">AI正在决策...</div>
    `;
    document.body.appendChild(indicator);

    // Highlight the acting player
    const playerCard = document.getElementById(`player-${player.id}`);
    if (playerCard) {
        playerCard.classList.add('night-acting');
    }

    // Narrator voice - player opens eyes (only role names, not player names)
    const openEyeMessages = {
        'WOLF': `狼人请睁眼，狼人团队请确认队友，并选择今晚要击杀的目标`,
        'WITCH': `女巫请睁眼`,
        'PROPHET': `预言家请睁眼，预言家每晚可以查验一名玩家`,
        'GUARD': `守卫请睁眼，守卫每晚可以守护一名玩家，不可连续守同一人`,
        'HUNTER': `猎人请睁眼，确认身份`
    };
    if (openEyeMessages[roleKey]) {
        addLog(`👁️ ${player.name}请睁眼`, 'night');
        VoiceSystem.announce(openEyeMessages[roleKey]);
    }

    // Special handling for wolf team
    if (roleKey === 'WOLF' || roleKey === 'WOLF_KING') {
        await showWolfTeamVision(player);
    }

    await pausedSleep(2000);

    let result = null;
    if (player.isHuman && typeof showHumanNightAction === 'function') {
        indicator.querySelector('.night-action-hint').textContent = '等待你的决策...';

        if (roleKey === 'WITCH') {
            // Witch has special two-step action handled inline by actionFn
            result = await actionFn(player);
        } else {
            const actionMap = { WOLF: 'wolf_kill', WOLF_KING: 'wolf_kill', PROPHET: 'prophet_check', GUARD: 'guard_protect', HUNTER: 'hunter_shoot' };
            const actionType = actionMap[roleKey];
            if (actionType) {
                showHumanNightAction(player, actionType);
                const target = await waitForHumanAction();
                if (target) {
                    if (roleKey === 'WOLF' || roleKey === 'WOLF_KING') {
                        result = target;
                        nightActions.wolfTarget = target;
                        addLog(`🐺 你选择了击杀 ${target.name}`, 'night');
                    } else {
                        result = await actionFn(player, target);
                    }
                }
            }
        }
    } else if (player.isAI) {
        result = await simulateAIAction(player, roleKey, actionFn);
    }

    // Remove indicator and highlight
    indicator.remove();
    if (playerCard) {
        playerCard.classList.remove('night-acting');
    }

    // Narrator voice - close eyes (only role names)
    addLog(`🌙 ${roleName}请闭眼`, 'night');
    VoiceSystem.announce(`${roleName}请闭眼`);
    await pausedSleep(1000);

    return result;
}

// Show wolf team their teammates
async function showWolfTeamVision(leadingWolf) {
    const wolves = gameState.players.filter(p => p.camp === 'wolf' && p.isAlive);

    // Show wolves each other's roles
    if (wolves.length > 1) {
        addLog(`🐺 狼人团队：${wolves.map(w => w.name).join('、 ')}`, 'night');
        SoundSystem.playWolfTeam();

        // Wolf team discussion
        await wolfTeamDiscussion(wolves);
    } else {
        // Only one wolf, they act alone
        addLog(`🐺 狼人独自行动...`, 'night');
    }

    await sleep(1500);
}

// Wolf team discussion during night
async function wolfTeamDiscussion(wolves) {
    // Simulate wolf team discussing who to kill
    const aliveGood = gameState.players.filter(p => p.isAlive && p.camp === 'good');
    if (aliveGood.length === 0) return;

    // Pick a target based on priority (prefer killing gods)
    const godPriority = ['PROPHET', 'WITCH', 'GUARD', 'HUNTER'];
    let selectedTarget = aliveGood.find(p => godPriority.includes(p.role));

    if (!selectedTarget) {
        selectedTarget = aliveGood[Math.floor(Math.random() * aliveGood.length)];
    }

    // Create wolf vision overlay
    const wolfVision = document.createElement('div');
    wolfVision.className = 'wolf-team-vision';
    document.body.appendChild(wolfVision);

    // Show discussion
    const wolfLeader = wolves.find(w => w.role === 'WOLF_KING') || wolves[0];
    addLog(`🐺 ${wolfLeader.name}建议刀${selectedTarget.name}`, 'night');

    await sleep(1000);

    // Other wolves agree or suggest alternative
    for (let i = 1; i < wolves.length; i++) {
        const wolf = wolves[i];
        const agree = Math.random() > 0.2; // 80% agree

        if (agree) {
            addLog(`🐺 ${wolf.name}同意`, 'night');
        } else {
            const altTarget = aliveGood[Math.floor(Math.random() * aliveGood.length)];
            addLog(`🐺 ${wolf.name}建议刀${altTarget.name}`, 'night');
            selectedTarget = altTarget;
        }

        await sleep(600);
    }

    // Remove wolf vision overlay
    wolfVision.style.opacity = '0';
    wolfVision.style.transition = 'opacity 0.5s';
    setTimeout(() => wolfVision.remove(), 500);

    // Remember the target for voting
    nightActions.wolfTarget = selectedTarget;
}

// ============ GAME MODES ============
const GameModes = {
    standard: {
        name: '12人标准局',
        players: 12,
        roles: ['VILLAGER', 'VILLAGER', 'VILLAGER', 'VILLAGER', 'PROPHET', 'WITCH', 'GUARD', 'HUNTER', 'WOLF', 'WOLF', 'WOLF', 'WOLF_KING']
    },
    simple: {
        name: '6人入门局',
        players: 6,
        roles: ['VILLAGER', 'VILLAGER', 'PROPHET', 'WOLF', 'WOLF', 'WITCH']
    },
    advanced: {
        name: '9人进阶局',
        players: 9,
        roles: ['VILLAGER', 'VILLAGER', 'VILLAGER', 'PROPHET', 'WITCH', 'GUARD', 'WOLF', 'WOLF', 'WOLF_KING']
    }
};

let currentGameMode = 'standard';

function setGameMode(mode) {
    currentGameMode = mode;
    const modeInfo = GameModes[mode];
    addLog(`🎮 游戏模式：${modeInfo.name}`, 'system');
}

function selectGameMode(mode, btn) {
    // Update UI
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Set mode
    currentGameMode = mode;

    // Update button text to show selected mode
    const modeInfo = GameModes[mode];
    const startBtn = document.querySelector('.start-btn');
    startBtn.textContent = `开始 ${modeInfo.name}`;
}

async function simulateAIAction(player, roleKey, actionFn) {
    if (roleKey === 'WOLF') {
        const wolves = gameState.players.filter(p => p.role.includes('WOLF') && p.isAlive);
        return await actionFn(wolves);
    } else {
        return await actionFn(player);
    }
}

async function resolveNightDeaths() {
    const deaths = []; // 收集本夜死亡的玩家

    // 1. 结算狼人击杀
    const wolfTarget = nightActions.wolfTarget;
    if (wolfTarget) {
        let wolfKillSaved = false;

        // 女巫解药救人
        if (nightActions.witchSaved) {
            wolfKillSaved = true;
            addLog(`🧪 女巫使用解药，${wolfTarget.name} 被救活`, 'night');
        }

        // 守卫守护
        if (!wolfKillSaved && nightActions.guardTarget && nightActions.guardTarget.id === wolfTarget.id) {
            wolfKillSaved = true;
            addLog(`🛡️ 守卫守护成功，${wolfTarget.name} 安全`, 'night');
        }

        if (!wolfKillSaved) {
            deaths.push({ player: wolfTarget, cause: 'killed' });
        }
    }

    // 2. 结算女巫毒药
    if (nightActions.witchPoisonTarget) {
        const poisonVictim = nightActions.witchPoisonTarget;
        // 毒药无法被守卫挡住
        if (!deaths.find(d => d.player.id === poisonVictim.id)) {
            deaths.push({ player: poisonVictim, cause: 'poisoned' });
        }
    }

    // 3. 公布死讯
    if (deaths.length === 0) {
        addLog(`😌 昨夜是平安夜，无人死亡`, 'system');
        VoiceSystem.announce('昨晚是平安夜，无人死亡');
    } else {
        for (const death of deaths) {
            death.player.isAlive = false;
            const causeText = death.cause === 'poisoned' ? '被毒杀' : '死亡';
            addLog(`💀 昨夜，${death.player.name} ${causeText}！`, 'death');
            SoundSystem.play('death');
            VoiceSystem.announce(`昨晚${death.player.name}${causeText}了`);
            showDeathAnimation(death.player.id);
            addDeathRecord(death.player.name, death.cause, gameState.day);
            await sleep(1000);
        }

        // 死者遗言（首夜死者必留遗言）
        for (const death of deaths) {
            const mustLeaveWords = gameState.day === 1; // 首夜必留遗言
            if (mustLeaveWords || Math.random() < 0.5) {
                const lastWords = await showLastWords(death.player);
                if (lastWords) {
                    addLog(`💀 ${death.player.name}的遗言：${lastWords}`, 'death');
                }
            }

            // 猎人被狼人杀死时可以开枪（被毒杀不能开枪）
            if (death.player.role === 'HUNTER' && death.cause === 'killed') {
                await sleep(1000);
                const targets = gameState.players.filter(p => p.isAlive && p.camp === 'wolf');
                if (targets.length > 0) {
                    const hunterTarget = targets[Math.floor(Math.random() * targets.length)];
                    hunterTarget.isAlive = false;
                    addLog(`🏹 猎人发动技能，带走了 ${hunterTarget.name}！`, 'death');
                    SoundSystem.play('death');
                    VoiceSystem.announce(`猎人发动技能，带走了${hunterTarget.name}`);
                    showDeathAnimation(hunterTarget.id);
                    addDeathRecord(hunterTarget.name, 'hunter', gameState.day);
                }
            }
        }
    }

    renderPlayers();
    await sleep(1500);
}

async function startDay() {
    if (gameState.phase === 'end') return;
    gameState.phase = 'day';
    updatePhaseDisplay();
    SoundSystem.play('day');

    // Show phase announcement
    showPhaseAnnouncement('☀️ 天亮了', '#f39c12');

    // Play day animation
    await playDayAnimation();

    addLog(`═══════════════════════════════════`, 'system');
    addLog(`☀️ 第 ${gameState.day} 天 - 天亮了！`, 'day');
    addLog(`═══════════════════════════════════`, 'system');

    // Voice announcement
    VoiceSystem.announce(`第${gameState.day}天天亮了，现在是白天`);

    // Count alive
    const alivePlayers = gameState.players.filter(p => p.isAlive);
    const aliveGood = alivePlayers.filter(p => p.camp === 'good').length;
    const aliveWolf = alivePlayers.filter(p => p.camp === 'wolf').length;

    addLog(`📊 存活统计：好人 ${aliveGood}人 | 狼人 ${aliveWolf}人`, 'system');

    // Show day announcement
    const human = gameState.players[gameState.humanPlayerId];
    if (human) {
        addLog(`🎭 你是 ${human.icon} ${human.name}（${human.roleName}）`, 'system');
    }

    // Check win condition
    if (checkWinCondition()) return;

    // Start speaking phase
    schedulePhase(() => startSpeakingPhase(), 1500);
}

function startSpeakingPhase() {
    gameState.speakingOrder = gameState.players.filter(p => p.isAlive).map(p => p.id);
    gameState.currentSpeaker = 0;

    addLog(`🗣️ 发言环节开始`, 'speak');
    VoiceSystem.announce('发言环节开始，请各位玩家按顺序发言');

    // Simulate AI speaking
    simulateAISpeaking();
}

async function simulateAISpeaking() {
    const alivePlayers = gameState.players.filter(p => p.isAlive);
    console.log('simulateAISpeaking: starting with', alivePlayers.length, 'players');

    for (let i = 0; i < alivePlayers.length; i++) {
        if (gameState.phase === 'end') return;
        const player = alivePlayers[i];
        console.log('Speaking:', player.name, player.role);

        // Highlight current AI speaker
        const speakerCard = document.getElementById(`player-${player.id}`);
        if (speakerCard) speakerCard.classList.add('speaking');

        // Generate speech — human or AI
        let speechText;
        if (player.isHuman && typeof showHumanSpeechInput === 'function') {
            showHumanSpeechInput();
            speechText = await waitForHumanAction();
        } else {
            speechText = await generateSmartSpeech(player);
        }
        console.log('Got speech for', player.name, ':', (speechText || '').substring(0, 30));

        addLog(`💬 ${player.name}（${player.roleName}）：${speechText}`, 'speak');
        if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordSpeech(gameState.day, player, speechText);
        SoundSystem.play('speak');

        showSpeechBubble(speakerCard, player, speechText);
        VoiceSystem.speakAs(`${player.name}说：${speechText}`, player.role.toLowerCase());

        await pausedSleep(3000);

        hideSpeechBubble();
        if (speakerCard) speakerCard.classList.remove('speaking');
    }

    if (gameState.phase === 'end') return;

    // All AI have spoken, move to voting
    console.log('All AI spoken, moving to voting phase');
    addLog(`📢 所有玩家发言结束，即将开始投票`, 'system');
    VoiceSystem.announce('所有玩家发言结束，现在开始投票');

    console.log('Scheduling voting phase in 2 seconds...');
    schedulePhase(() => startVotingPhase(), 2000);
}

// Generate smart AI speech using LLM adapter

// ============ RENDERING ============
function renderPlayers() {
    const ring = document.getElementById('playersRing');
    ring.innerHTML = '';

    const playerCount = gameState.players.length;
    if (playerCount === 0) {
        ring.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--text-muted);font-size:14px;text-align:center;">⏳ 等待游戏数据...</div>';
        return;
    }
    const radius = playerCount <= 6 ? 150 : playerCount <= 9 ? 180 : 220;
    const centerX = ring.offsetWidth / 2 || 250;
    const centerY = ring.offsetHeight / 2 || 250;

    gameState.players.forEach((player, index) => {
        const angle = (index / playerCount) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle) - 50;
        const y = centerY + radius * Math.sin(angle) - 60;

        const card = document.createElement('div');
        card.className = `player-card ${player.camp === 'wolf' ? 'wolf' : player.camp === 'god' ? 'god' : 'villager'}`;
        if (!player.isAlive) card.classList.add('dead');
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        card.id = `player-${player.id}`;
        card.onclick = () => onPlayerClick(player);

        const roleKey = player.role ? player.role.toUpperCase() : 'UNKNOWN';
        const roleData = window.ROLES ? window.ROLES[roleKey] : null;
        const imgSrc = (roleData && roleData.image) ? encodeURI(roleData.image) : null;
        
        const roleLabel = (showRoles && player.roleName && player.roleName !== '?')
            ? `<div style="font-size:9px;color:rgba(255,255,255,0.75);margin-top:1px;text-shadow:0 1px 3px rgba(0,0,0,0.9);">${player.roleName}</div>`
            : '';

        // Avatar: show role image only when showRoles is on; otherwise generic colored circle
        let avatarContent = '', avatarStyle = '';
        if (showRoles) {
            if (imgSrc) {
                avatarStyle = `background:url('${imgSrc}') center/cover no-repeat;`;
                // Image error fallback
                avatarContent = `<img src="${imgSrc}" style="display:none" onerror="this.parentElement.style.background='none';this.parentElement.innerHTML='${player.icon || '👤'}';">`;
            } else {
                avatarContent = player.icon || '👤';
            }
        } else {
            // Hidden role mode: show mystery avatar with player-unique color
            const hues = [210, 340, 160, 280, 40, 0, 120, 200, 300, 60, 180, 240];
            const hue = hues[player.id % hues.length];
            avatarContent = '?';
            avatarStyle = `background:linear-gradient(135deg, hsl(${hue},50%,35%), hsl(${hue},60%,20%));font-size:24px;color:rgba(255,255,255,0.4);`;
        }

        // Also hide camp-based border when roles hidden
        if (!showRoles) {
            card.className = 'player-card';
            if (!player.isAlive) card.classList.add('dead');
        }

        card.innerHTML = `
            <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-bottom:2px;">${player.number}号</div>
            <div class="player-avatar" style="${avatarStyle}">${avatarContent}</div>
            <div class="player-name" style="font-size:12px;font-weight:bold;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.8);margin-top:2px;margin-bottom:2px;">${player.name}</div>
            ${roleLabel}
        `;

        ring.appendChild(card);
    });
}

function updatePhaseDisplay() {
    const headerPhase = document.getElementById('headerPhase');
    const phaseIcon = document.getElementById('phaseIcon');
    const phaseText = document.getElementById('phaseText');

    if (gameState.phase === 'waiting') {
        if (headerPhase) headerPhase.style.display = 'none';
    } else {
        if (headerPhase) headerPhase.style.display = 'flex';

        if (gameState.phase === 'night') {
            if (phaseIcon) phaseIcon.textContent = '🌙';
            if (phaseText) phaseText.textContent = `第${gameState.day}夜`;
        } else if (gameState.phase === 'day') {
            if (phaseIcon) phaseIcon.textContent = '☀️';
            if (phaseText) phaseText.textContent = `第${gameState.day}天`;
        } else if (gameState.phase === 'vote') {
            if (phaseIcon) phaseIcon.textContent = '🗳️';
            if (phaseText) phaseText.textContent = `第${gameState.day}天-投票`;
        }
    }

    updateGameStats();
}

function updateGameStats() {
    const alivePlayers = gameState.players.filter(p => p.isAlive);
    const aliveGood = alivePlayers.filter(p => p.camp === 'good').length;
    const aliveWolf = alivePlayers.filter(p => p.camp === 'wolf').length;
    const deadCount = gameState.players.filter(p => !p.isAlive).length;

    const dayEl = document.getElementById('statDay');
    const goodEl = document.getElementById('statAliveGood');
    const wolfEl = document.getElementById('statAliveWolf');
    const deadEl = document.getElementById('statDeaths');

    if (dayEl) dayEl.textContent = gameState.day;
    if (goodEl) goodEl.textContent = aliveGood;
    if (wolfEl) wolfEl.textContent = aliveWolf;
    if (deadEl) deadEl.textContent = deadCount;

    // Update center round display
    const centerRound = document.getElementById('centerRound');
    const centerSubtitle = document.getElementById('centerSubtitle');
    if (centerRound && centerSubtitle) {
        if (gameState.phase === 'night') {
            centerRound.textContent = `Night ${gameState.day}`;
            centerSubtitle.textContent = '天黑请闭眼';
        } else if (gameState.phase === 'day') {
            centerRound.textContent = `Day ${gameState.day}`;
            centerSubtitle.textContent = '请开始发言';
        } else if (gameState.phase === 'vote') {
            centerRound.textContent = 'VOTE';
            centerSubtitle.textContent = '请投票';
        }
    }
}

function addLog(message, type = 'system') {
    const log = document.getElementById('chroniclesLog');
    if (!log) return;

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const now = new Date();
    const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Add icon based on type
    const icons = {
        system: '⚙️',
        night: '🌙',
        day: '☀️',
        vote: '🗳️',
        death: '💀',
        speak: '💬'
    };

    const icon = icons[type] || '•';

    // Highlight keywords
    let highlightedMessage = message;
    const highlights = {
        '狼人': '<span class="hl-wolf">狼人</span>',
        '好人': '<span class="hl-good">好人</span>',
        '预言家': '<span class="hl-prophet">预言家</span>',
        '女巫': '<span class="hl-witch">女巫</span>',
        '守卫': '<span class="hl-guard">守卫</span>',
        '猎人': '<span class="hl-hunter">猎人</span>',
        '查杀': '<span class="hl-check">查杀</span>',
        '金水': '<span class="hl-gold">金水</span>',
        '投票': '<span class="hl-vote">投票</span>',
        '死亡': '<span class="hl-death">死亡</span>',
        '出局': '<span class="hl-out">出局</span>'
    };

    Object.entries(highlights).forEach(([keyword, replacement]) => {
        highlightedMessage = highlightedMessage.replace(
            new RegExp(keyword, 'g'),
            replacement
        );
    });

    entry.innerHTML = `
        <div class="log-entry-content">
            <span class="log-icon">${icon}</span>
            <span class="log-time">${time}</span>
            <span class="log-message">${highlightedMessage}</span>
        </div>
    `;

    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;

    // Record event for replay
    if (gameState.phase !== 'waiting') {
        recordEvent(type, { message });
    }
}

function clearLogs() {
    document.getElementById('chroniclesLog').innerHTML = '';
}

// ============ SPEECH BUBBLE ============
let currentSpeechBubble = null;

function getOrCreateBubbleLayer() {
    let layer = document.getElementById('speechBubbleLayer');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'speechBubbleLayer';
        document.body.appendChild(layer);
    }
    return layer;
}

function showSpeechBubble(card, player, text, isAuto = false) {
    hideSpeechBubble(); // Remove any existing bubble

    const layer = getOrCreateBubbleLayer();
    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble' + (isAuto ? ' auto-bubble' : '');
    bubble.id = 'currentSpeechBubble';
    const autoLabel = isAuto ? '<div class="speech-bubble-auto">🤖 系统代发（Agent超时）</div>' : '';
    bubble.innerHTML = `
        <div class="speech-bubble-role">${player.icon} ${player.name}（${player.roleName}）</div>
        <div class="speech-bubble-text">"${text}"</div>
        ${autoLabel}
    `;

    layer.appendChild(bubble);

    // Position bubble above the player card using fixed coordinates
    const rect = card.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();

    // Center bubble above card, with arrow pointing down
    const left = rect.left + rect.width / 2 - bubbleRect.width / 2;
    const top = rect.top - bubbleRect.height - 20;

    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;

    // Keep bubble within viewport horizontally
    const minLeft = 10;
    const maxLeft = window.innerWidth - bubbleRect.width - 10;
    if (left < minLeft) {
        bubble.style.left = `${minLeft}px`;
    } else if (left > maxLeft) {
        bubble.style.left = `${maxLeft}px`;
    }

    // Ensure bubble doesn't go above viewport
    if (rect.top - bubbleRect.height < 10) {
        // Show below the card instead
        bubble.style.top = `${rect.bottom + 20}px`;
        bubble.style.borderTopColor = 'rgba(45, 27, 78, 0.98)';
        bubble.style.borderBottom = 'none';
        bubble.style.bottom = 'auto';
    }

    currentSpeechBubble = bubble;
}

function hideSpeechBubble() {
    if (currentSpeechBubble) {
        currentSpeechBubble.remove();
        currentSpeechBubble = null;
    }
}

// ============ NIGHT ANIMATION ============

// ============ NIGHT ANIMATION ============
function playNightAnimation() {
    return new Promise(resolve => {
        // Dim all player cards with animation
        document.querySelectorAll('.player-card').forEach((card, i) => {
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '0.3';
                card.style.filter = 'brightness(0.3) saturate(0.5)';
                card.style.transform = 'scale(0.95)';
            }, i * 50);
        });

        // Show dramatic night overlay
        const overlay = document.createElement('div');
        overlay.id = 'night-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: radial-gradient(ellipse at center, rgba(20,10,40,0.9) 0%, rgba(0,0,0,0.95) 100%);
            z-index: 100;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 64px;
            animation: fadeInOut 2.5s ease forwards;
        `;

        const moon = document.createElement('div');
        moon.textContent = '🌙';
        moon.style.cssText = `
            font-size: 120px;
            animation: moonGlow 2s ease-in-out infinite, float 3s ease-in-out infinite;
            margin-bottom: 20px;
        `;

        const text = document.createElement('div');
        text.textContent = '天黑请闭眼';
        text.style.cssText = `
            font-family: 'Orbitron', sans-serif;
            font-size: 48px;
            color: #ffd700;
            text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
            animation: slideUp 0.8s ease forwards;
        `;

        const subtext = document.createElement('div');
        subtext.textContent = 'Night falls...';
        subtext.style.cssText = `
            font-size: 18px;
            color: rgba(255,255,255,0.6);
            margin-top: 16px;
            animation: fadeInOut 2.5s ease forwards;
        `;

        overlay.appendChild(moon);
        overlay.appendChild(text);
        overlay.appendChild(subtext);
        document.body.appendChild(overlay);

        // Play night sound
        SoundSystem.playNightAmbient();

        setTimeout(() => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 500);
        }, 2500);
    });
}

function playDayAnimation() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.id = 'day-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: radial-gradient(ellipse at center, rgba(255,220,100,0.3) 0%, rgba(255,180,50,0.1) 100%);
            z-index: 100;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 64px;
            animation: fadeInOut 2.5s ease forwards;
        `;

        const sun = document.createElement('div');
        sun.textContent = '☀️';
        sun.style.cssText = `
            font-size: 120px;
            animation: heartbeat 1.5s ease-in-out infinite;
            margin-bottom: 20px;
        `;

        const text = document.createElement('div');
        text.textContent = '天亮了';
        text.style.cssText = `
            font-family: 'Orbitron', sans-serif;
            font-size: 48px;
            color: #fff;
            text-shadow: 0 0 30px rgba(255, 200, 50, 0.8);
            animation: slideUp 0.8s ease forwards;
        `;

        overlay.appendChild(sun);
        overlay.appendChild(text);
        document.body.appendChild(overlay);

        // Restore player cards
        document.querySelectorAll('.player-card').forEach((card, i) => {
            setTimeout(() => {
                card.style.opacity = '1';
                card.style.filter = 'brightness(1) saturate(1)';
                card.style.transform = 'scale(1)';
            }, 300 + i * 30);
        });

        // Play day sound
        SoundSystem.playDayAmbient();

        setTimeout(() => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 500);
        }, 2500);
    });
}

// Back to home screen
window.isConfirmingBack = false;
function backToHome(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    if (window.isConfirmingBack) return;
    window.isConfirmingBack = true;

    // Immediately pause game logic if applicable
    const wasPaused = window.isPaused;
    window.isPaused = true;

    // Only confirm if in an active game
    if (gameState.phase !== 'end' && gameState.phase !== 'waiting') {
        const confirmed = confirm('游戏进行中，确定要返回首页吗？');
        if (!confirmed) {
            window.isPaused = wasPaused;
            window.isConfirmingBack = false;
            return;
        }
    }

    // Force stop all game activity
    if (typeof stopGame === 'function') stopGame();
    if (typeof phaseTimeout !== 'undefined' && phaseTimeout) {
        clearTimeout(phaseTimeout);
        phaseTimeout = null;
    }
    VoiceSystem.stop();
    gameState.phase = 'end';

    // UI Updates
    document.getElementById('startScreen').style.display = '';
    document.getElementById('headerBackBtn').style.display = 'none';
    if (document.getElementById('btnBackToHome')) {
        document.getElementById('btnBackToHome').style.display = 'none';
    }
    
    // Reset guard after short delay to prevent accidental double-clicks from remaining in memory
    setTimeout(() => {
        window.isConfirmingBack = false;
    }, 500);

    // Return to lobby/home
    openLobby();
}
window.backToHome = backToHome;

// Play again - close modal and restart
function playAgain() {
    const gameOverModal = document.getElementById('gameOverModal');
    if (gameOverModal) {
        gameOverModal.classList.remove('active');
    }
    startGame();
}

// ============ INTERACTION ============
function onPlayerClick(player) {
    if (!player) return;

    if (!player.isAlive) {
        // Show death particles
        createDeathParticles(player);
        return;
    }

    // Highlight selected player
    try {
        document.querySelectorAll('.player-card').forEach(card => {
            card.classList.remove('selected');
        });
        const card = document.getElementById(`player-${player.id}`);
        if (card) {
            card.classList.add('selected');
            createClickParticles(card);
        }
    } catch (e) {
        console.error('Player click error:', e);
    }

    // If voting, cast vote
    if (gameState.phase === 'vote' && !gameState.isHumanTurn) {
        // Human voting
    }
}

// Create click particles
function createClickParticles(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 8; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            left: ${centerX}px;
            top: ${centerY}px;
            width: ${4 + Math.random() * 4}px;
            height: ${4 + Math.random() * 4}px;
            background: ${Math.random() > 0.5 ? 'var(--secondary)' : 'var(--primary)'};
        `;
        document.body.appendChild(particle);

        setTimeout(() => particle.remove(), 1000);
    }
}

// Create death particles
function createDeathParticles(player) {
    const card = document.getElementById(`player-${player.id}`);
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Create ripple
    const ripple = document.createElement('div');
    ripple.className = 'vote-ripple';
    ripple.style.left = `${centerX - 20}px`;
    ripple.style.top = `${centerY - 20}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);

    // Create particles
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = 3 + Math.random() * 8;
        particle.style.cssText = `
            left: ${centerX + (Math.random() - 0.5) * 50}px;
            top: ${centerY + (Math.random() - 0.5) * 50}px;
            width: ${size}px;
            height: ${size}px;
            background: ${player.camp === 'wolf' ? '#e74c3c' : '#3498db'};
            animation-delay: ${Math.random() * 0.3}s;
        `;
        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 1300);
    }
}

// Create phase announcement
function showPhaseAnnouncement(text, color = 'white', duration = 2000) {
    const existing = document.querySelector('.phase-announcement');
    if (existing) existing.remove();

    const announcement = document.createElement('div');
    announcement.className = 'phase-announcement';
    announcement.textContent = text;
    announcement.style.color = color;
    document.body.appendChild(announcement);

    setTimeout(() => {
        announcement.style.opacity = '0';
        announcement.style.transition = 'opacity 0.5s ease';
        setTimeout(() => announcement.remove(), 500);
    }, duration);
}

// Draw voting line animation - enhanced
function drawVoteLine(fromCard, toPlayerId) {
    const toCard = document.getElementById(`player-${toPlayerId}`);
    if (!toCard) return;

    const fromRect = fromCard.getBoundingClientRect();
    const toRect = toCard.getBoundingClientRect();

    // Create SVG line with glow effect
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 1000;
    `;

    // Glow filter
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'glow');
    filter.innerHTML = `
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
        </feMerge>
    `;
    defs.appendChild(filter);
    svg.appendChild(defs);

    // Create line
    const x1 = fromRect.left + fromRect.width / 2;
    const y1 = fromRect.top + fromRect.height / 2;
    const x2 = toRect.left + toRect.width / 2;
    const y2 = toRect.top + toRect.height / 2;

    // Draw dotted trail
    const dashLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dashLine.setAttribute('x1', x1);
    dashLine.setAttribute('y1', y1);
    dashLine.setAttribute('x2', x1);
    dashLine.setAttribute('y2', y1);
    dashLine.setAttribute('stroke', '#ff6b6b');
    dashLine.setAttribute('stroke-width', '4');
    dashLine.setAttribute('stroke-dasharray', '8,4');
    dashLine.setAttribute('stroke-linecap', 'round');
    dashLine.setAttribute('filter', 'url(#glow)');
    dashLine.style.transition = 'all 0.5s ease-out';

    svg.appendChild(dashLine);
    document.body.appendChild(svg);

    // Animate line to target
    requestAnimationFrame(() => {
        dashLine.setAttribute('x2', x2);
        dashLine.setAttribute('y2', y2);
    });

    // Add vote icon at target
    setTimeout(() => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x2);
        circle.setAttribute('cy', y2);
        circle.setAttribute('r', '15');
        circle.setAttribute('fill', '#ff6b6b');
        circle.setAttribute('opacity', '0');
        circle.style.transition = 'opacity 0.3s';
        svg.appendChild(circle);

        requestAnimationFrame(() => {
            circle.setAttribute('opacity', '1');
        });
    }, 500);

    // Add "VOTE" text
    setTimeout(() => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x2);
        text.setAttribute('y', y2 + 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#fff');
        text.setAttribute('font-size', '12');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('opacity', '0');
        text.textContent = 'VOTE';
        text.style.transition = 'opacity 0.3s';
        svg.appendChild(text);

        requestAnimationFrame(() => {
            text.setAttribute('opacity', '1');
        });
    }, 600);

    // Remove after delay with fade
    setTimeout(() => {
        svg.style.opacity = '0';
        svg.style.transition = 'opacity 0.5s';
        setTimeout(() => svg.remove(), 500);
    }, 1200);
}

// Draw death effect on player card
function drawDeathEffect(playerId) {
    const card = document.getElementById(`player-${playerId}`);
    if (!card) return;

    // Add dying animation class
    card.classList.add('dying');

    setTimeout(() => {
        card.classList.remove('dying');
        card.classList.add('dead');
    }, 500);
}

// Show death animation with dramatic effect
function showDeathAnimation(playerId, callback) {
    const card = document.getElementById(`player-${playerId}`);
    if (!card) {
        if (callback) callback();
        return;
    }

    // Create death effect overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: radial-gradient(circle, rgba(255,0,0,0.3) 0%, transparent 70%);
        pointer-events: none;
        z-index: 999;
        opacity: 0;
        transition: opacity 0.2s;
    `;
    document.body.appendChild(overlay);

    // Flash screen
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
    });

    // Flash red on card
    card.style.boxShadow = '0 0 60px rgba(255, 0, 0, 0.9), inset 0 0 30px rgba(255,0,0,0.5)';
    card.style.transform = 'scale(1.15)';
    card.style.transition = 'all 0.15s ease-out';

    // Shake effect
    let shakeCount = 0;
    const shakeInterval = setInterval(() => {
        if (shakeCount >= 6) {
            clearInterval(shakeInterval);
            card.style.transform = 'scale(1)';
            return;
        }
        card.style.transform = `translate(${shakeCount % 2 === 0 ? '5px' : '-5px'}, 0) scale(1.1)`;
        shakeCount++;
    }, 50);

    // Fade overlay
    setTimeout(() => {
        overlay.style.opacity = '0';
    }, 200);

    // Remove overlay
    setTimeout(() => {
        overlay.remove();
    }, 500);

    // Set dead state
    setTimeout(() => {
        card.style.boxShadow = '';
        card.style.transform = '';
        card.classList.add('dead');
        if (callback) callback();
    }, 400);
}

// Pause game
window.isPaused = false;
let pauseResolve = null;

function togglePause() {
    if (gameState.phase === 'waiting' || gameState.phase === 'end') return;

    window.isPaused = !window.isPaused;

    if (window.isPaused) {
        showPauseIndicator();
    } else {
        hidePauseIndicator();
        if (pauseResolve) {
            pauseResolve();
            pauseResolve = null;
        }
    }
}

function showPauseIndicator() {
    const existing = document.getElementById('pauseIndicator');
    if (existing) return;

    const indicator = document.createElement('div');
    indicator.id = 'pauseIndicator';
    indicator.className = 'pause-indicator';
    indicator.innerHTML = `
        <div class="icon">⏸️</div>
        <div class="text">游戏已暂停</div>
        <div class="hint">按 P 或点击继续</div>
    `;
    indicator.onclick = togglePause;
    document.body.appendChild(indicator);
}

function hidePauseIndicator() {
    const indicator = document.getElementById('pauseIndicator');
    if (indicator) indicator.remove();
}

// Enhanced pause-aware sleep
async function pausedSleep(ms) {
    if (window.isPaused) {
        await new Promise(resolve => {
            pauseResolve = resolve;
        });
    }
    return sleep(ms);
}

function submitAction() {
    console.log('submitAction called');
    const input = document.getElementById('actionInput');
    const text = input.value.trim();

    if (!text) {
        console.log('No text entered');
        return;
    }

    const human = gameState.players[gameState.humanPlayerId];
    addLog(`💬 ${human.name}（${human.roleName}）：${text}`, 'speak');
    VoiceSystem.speakAs(`${human.name}说：${text}`, human.role.toLowerCase());

    input.value = '';

    // Advance to next speaker
    gameState.currentSpeaker++;
    console.log('currentSpeaker:', gameState.currentSpeaker, 'total:', gameState.speakingOrder.length);
    if (gameState.currentSpeaker >= gameState.speakingOrder.length) {
        schedulePhase(() => startVotingPhase(), 1000);
    } else {
        schedulePhase(() => simulateAISpeaking(), 1000);
    }
}

// ============ FULLSCREEN ============
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            showToast('无法进入全屏模式');
        });
        document.getElementById('fullscreenBtn').textContent = '⛶';
    } else {
        document.exitFullscreen();
        document.getElementById('fullscreenBtn').textContent = '⛶';
    }
}

document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('fullscreenBtn');
    if (btn) {
        btn.textContent = document.fullscreenElement ? '⛶' : '⛶';
    }
});

// ============ HELP FUNCTIONS ============
function showHelp() {
    const helpContent = `
        <div style="text-align: center; padding: 20px;">
            <div style="font-size: 64px; margin-bottom: 16px;">🐺</div>
            <h2 style="font-family: 'Orbitron'; margin-bottom: 20px;">AI狼人杀</h2>

            <div style="text-align: left; margin-bottom: 20px;">
                <h4 style="color: #6c5ce7; margin-bottom: 8px;">🎮 游戏目标</h4>
                <ul style="font-size: 13px; color: var(--text-muted); padding-left: 20px;">
                    <li>好人阵营：找出并票出所有狼人</li>
                    <li>狼人阵营：杀光所有好人</li>
                </ul>
            </div>

            <div style="text-align: left; margin-bottom: 20px;">
                <h4 style="color: #6c5ce7; margin-bottom: 8px;">🎯 游戏流程</h4>
                <ol style="font-size: 13px; color: var(--text-muted); padding-left: 20px;">
                    <li>夜晚：神职玩家行动</li>
                    <li>白天：玩家发言</li>
                    <li>投票：选出狼人</li>
                    <li>重复直到分出胜负</li>
                </ol>
            </div>

            <div style="text-align: left;">
                <h4 style="color: #6c5ce7; margin-bottom: 8px;">⌨️ 快捷键</h4>
                <div style="font-size: 12px; color: var(--text-muted);">
                    <div>1-9: 选择玩家</div>
                    <div>M: 切换音效</div>
                    <div>Enter: 发送发言</div>
                </div>
            </div>
        </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal" style="max-width: 400px;">
            ${helpContent}
            <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()" style="width: 100%;">我知道了</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function showRoleGuide() {
    document.getElementById('roleGuideModal').classList.add('active');
}

function closeRoleGuide() {
    document.getElementById('roleGuideModal').classList.remove('active');
}

function showLeaderboard() {
    const stats = leaderboardSystem.getStats();
    const recentGames = leaderboardSystem.getLeaderboard('all', 5);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal" style="max-width: 400px;">
            <div style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="font-family: 'Orbitron'; font-size: 18px;">🏆 战绩榜</h2>
                    <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; color: var(--text); font-size: 20px; cursor: pointer;">×</button>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
                    <div style="text-align: center; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <div style="font-size: 24px; color: #f39c12;">${stats.total}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">总场次</div>
                    </div>
                    <div style="text-align: center; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <div style="font-size: 24px; color: #27ae60;">${stats.winRate}%</div>
                        <div style="font-size: 11px; color: var(--text-muted);">总胜率</div>
                    </div>
                    <div style="text-align: center; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <div style="font-size: 24px; color: #3498db;">${stats.avgDay}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">平均天数</div>
                    </div>
                </div>

                <div style="margin-bottom: 16px;">
                    <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">最近战绩</div>
                    ${recentGames.length === 0 ?
            '<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">暂无战绩记录</div>' :
            recentGames.map((g, i) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; margin-bottom: 6px;">
                                <div>
                                    <div style="font-size: 13px;">${g.playerName} - ${g.role}</div>
                                    <div style="font-size: 11px; color: var(--text-muted);">第${g.day}天</div>
                                </div>
                                <div style="color: ${g.result === 'win' ? '#27ae60' : '#e74c3c'}; font-size: 12px;">
                                    ${g.result === 'win' ? '胜' : '负'}
                                </div>
                            </div>
                        `).join('')
        }
                </div>

                <button class="btn btn-secondary" onclick="clearLeaderboard()" style="width: 100%;">清除记录</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function clearLeaderboard() {
    if (confirm('确定要清除所有战绩记录吗？')) {
        leaderboardSystem.clear();
        showToast('战绩已清除');
        document.querySelector('.modal-overlay.active .modal').remove();
        document.querySelector('.modal-overlay.active').remove();
    }
}

function shareGame() {
    const text = leaderboardSystem.exportAsText();

    // Try to copy to clipboard
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('战绩已复制到剪贴板');
        }).catch(() => {
            showToast('复制失败，请手动复制');
        });
    } else {
        // Fallback
        prompt('战绩内容：', text);
    }
}

// Close modals on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});


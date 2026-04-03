// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', (e) => {
    // Space to submit action
    if (e.key === 'Enter' && document.activeElement === document.getElementById('actionInput')) {
        submitAction();
    }

    // Number keys to select players (1-9, then 0, -, = for 10, 11, 12)
    if (e.key >= '1' && e.key <= '9') {
        const playerId = parseInt(e.key) - 1;
        const player = gameState.players[playerId];
        if (player && player.isAlive) {
            onPlayerClick(player);
            SoundSystem.play('click');
        }
    }

    // M to toggle sound
    if (e.key === 'm' || e.key === 'M') {
        const enabled = SoundSystem.toggle();
        addLog(`🔊 音效${enabled ? '开启' : '关闭'}`, 'system');
        SoundSystem.play('click');
    }

    // V to toggle voice
    if (e.key === 'v' || e.key === 'V') {
        const enabled = VoiceSystem.toggle();
        addLog(`🎙️ 语音${enabled ? '开启' : '关闭'}`, 'system');
        SoundSystem.play('click');
    }

    // P to pause
    if (e.key === 'p' || e.key === 'P') {
        togglePause();
    }
});

// ============ SETTINGS FUNCTIONS ============
function showSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.add('active');

    // Sync toggle states
    const soundBtn = document.getElementById('soundToggle');
    if (soundBtn) {
        const soundOn = SoundSystem.enabled !== false;
        soundBtn.classList.toggle('on', soundOn);
        soundBtn.querySelector('.toggle-label').textContent = soundOn ? '开启' : '关闭';
    }
    const voiceBtn = document.getElementById('voiceToggle');
    if (voiceBtn) {
        const voiceOn = VoiceSystem.enabled !== false;
        voiceBtn.classList.toggle('on', voiceOn);
        voiceBtn.querySelector('.toggle-label').textContent = voiceOn ? '开启' : '关闭';
    }

    // Load skins
    renderSkinGrid();
    // Load stats
    renderStats();
    renderAchievementsList();
    // Load AI config
    if (typeof loadAIConfig === 'function') loadAIConfig();
}

function toggleSound() {
    const enabled = SoundSystem.toggle();
    const btn = document.getElementById('soundToggle');
    if (btn) {
        btn.classList.toggle('on', enabled);
        btn.querySelector('.toggle-label').textContent = enabled ? '开启' : '关闭';
    }
}

function toggleVoice() {
    const enabled = VoiceSystem.toggle();
    const btn = document.getElementById('voiceToggle');
    if (btn) {
        btn.classList.toggle('on', enabled);
        btn.querySelector('.toggle-label').textContent = enabled ? '开启' : '关闭';
    }
}

function setVoiceRate(rate) {
    VoiceSystem.setRate(rate);
    const display = document.getElementById('voiceRateValue');
    if (display) display.textContent = rate + 'x';
}

function renderAchievementsList() {
    const container = document.getElementById('achievementList');
    if (!container) return;

    const progress = Achievements.getProgress();
    let html = `<div style="margin-bottom: 12px; color: var(--text-muted); font-size: 13px;">进度: ${progress.unlocked}/${progress.total}</div>`;

    container.innerHTML = html + progress.unlocked >= progress.total / 2
        ? '<div style="color: #ffd700; font-size: 13px;">🏆 太厉害了！继续加油！</div>'
        : '<div style="color: var(--text-muted); font-size: 13px;">继续游戏解锁更多成就</div>';
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

function renderSkinGrid() {
    const grid = document.getElementById('skinGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const skins = skinSystem.getAvailableSkins();
    skins.forEach(skin => {
        const option = document.createElement('div');
        option.className = `skin-option ${skinSystem.currentSkin === skin.id ? 'active' : ''}`;
        option.onclick = () => {
            skinSystem.applySkin(skin.id);
            renderSkinGrid();
        };

        const preview = document.createElement('div');
        preview.className = 'skin-preview';
        preview.style.background = skinSystem.themes[skin.id].preview;

        const name = document.createElement('div');
        name.className = 'skin-name';
        name.textContent = skin.name;

        option.appendChild(preview);
        option.appendChild(name);
        grid.appendChild(option);
    });
}

function renderStats() {
    const summary = document.getElementById('statsSummary');
    if (!summary) return;

    const stats = statsSystem.getSummary();

    summary.innerHTML = `
        <div class="stats-card">
            <div class="stats-value">${stats.totalGames}</div>
            <div class="stats-label">总场次</div>
        </div>
        <div class="stats-card">
            <div class="stats-value">${stats.winRate}%</div>
            <div class="stats-label">总胜率</div>
        </div>
        <div class="stats-card">
            <div class="stats-value">${stats.longestGame}</div>
            <div class="stats-label">最长游戏</div>
        </div>
        <div class="stats-card">
            <div class="stats-value">${stats.fastestWin}</div>
            <div class="stats-label">最快胜利</div>
        </div>
    `;
}

function renderRoleWinrates() {
    const container = document.getElementById('roleWinrates');
    if (!container) return;

    const roles = ['VILLAGER', 'PROPHET', 'WITCH', 'GUARD', 'HUNTER', 'WOLF', 'WOLF_KING'];
    const roleNames = { VILLAGER: '村民', PROPHET: '预言家', WITCH: '女巫', GUARD: '守卫', HUNTER: '猎人', WOLF: '狼人', WOLF_KING: '狼王' };
    const roleIcons = { VILLAGER: '👤', PROPHET: '🔮', WITCH: '🧪', GUARD: '🛡️', HUNTER: '🏹', WOLF: '🐺', WOLF_KING: '👑' };

    container.innerHTML = '';

    roles.forEach(role => {
        const rate = statsSystem.getRoleWinRate(role);
        const data = statsSystem.stats[role] || { played: 0, wins: 0 };

        const div = document.createElement('div');
        div.className = 'role-winrate';
        div.innerHTML = `
            <span class="role-icon">${roleIcons[role]}</span>
            <span class="role-name">${roleNames[role]}</span>
            <div class="role-bar">
                <div class="role-bar-fill" style="width: ${rate}%"></div>
            </div>
            <span class="role-rate">${rate}%</span>
        `;
        container.appendChild(div);
    });
}

function renderReplayList() {
    const list = document.getElementById('replayList');
    if (!list) return;

    const recordings = replaySystem.getRecordings();

    if (recordings.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">暂无录像</p>';
        return;
    }

    list.innerHTML = '';

    recordings.forEach(rec => {
        const item = document.createElement('div');
        item.className = 'replay-item';
        item.innerHTML = `
            <div class="replay-info">
                <div class="replay-title">游戏 #${rec.gameId.slice(-6)}</div>
                <div class="replay-meta">${rec.totalEvents}事件 | ${replaySystem.formatDuration(rec.duration)}</div>
            </div>
            <div class="replay-actions">
                <button class="btn btn-secondary" onclick="playReplay('${rec.gameId}')">播放</button>
                <button class="btn btn-secondary" onclick="deleteReplay('${rec.gameId}')">删除</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function playReplay(gameId) {
    closeSettings();
    replaySystem.playReplay(gameId, { reset: () => { }, players: [], speed: 1 });
}

function deleteReplay(gameId) {
    replaySystem.deleteRecording(gameId);
    renderReplayList();
}

function resetStats() {
    if (confirm('确定要重置所有战绩吗？此操作不可恢复。')) {
        statsSystem.resetStats();
        replaySystem.clearAllRecordings();
        leaderboardSystem.clear();
        Achievements.reset();
        renderStats();
        renderReplayList();
        updateAchievementBadge();
        addLog('⚙️ 战绩已重置', 'system');
        showToast('所有数据已重置');
    }
}

// Show game summary at end
function showGameSummary() {
    const alive = gameState.players.filter(p => p.isAlive);
    const wolves = alive.filter(p => p.camp === 'wolf');
    const goods = alive.filter(p => p.camp === 'good');

    const summary = `
        <div style="padding: 20px;">
            <h3 style="font-family: 'Orbitron'; margin-bottom: 16px;">📊 对局总结</h3>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
                <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; color: #3498db;">${goods.length}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">存活好人</div>
                </div>
                <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; color: #e74c3c;">${wolves.length}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">存活狼人</div>
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">存活玩家</div>
                ${alive.map(p => `
                    <div style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        ${p.icon} ${p.name} - ${p.roleName}
                    </div>
                `).join('')}
            </div>

            <button class="btn btn-primary" onclick="document.querySelector('.modal-overlay:last-of-type').remove()" style="width: 100%;">关闭</button>
        </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `<div class="modal" style="max-width: 400px;">${summary}</div>`;
    document.body.appendChild(modal);
}

// Override showSettings to use our new function
window.showSettings = showSettings;

// ============ AI CONFIG FUNCTIONS ============
function updateAIConfig() {
    const provider = document.getElementById('aiProvider').value;
    const apiKeyRow = document.getElementById('apiKeyRow');
    const baseUrlRow = document.getElementById('baseUrlRow');

    if (provider === 'local') {
        apiKeyRow.style.display = 'none';
        baseUrlRow.style.display = 'none';
    } else {
        apiKeyRow.style.display = 'flex';
        baseUrlRow.style.display = provider === 'siliconflow' ? 'none' : 'flex';
    }

    // Update model options based on provider
    const modelSelect = document.getElementById('aiModel');
    if (provider === 'local') {
        modelSelect.innerHTML = `<option value="smart-ai">本地智能AI</option>`;
    } else if (provider === 'siliconflow') {
        modelSelect.innerHTML = `
            <option value="Qwen/Qwen2.5-14B-Instruct">Qwen 14B</option>
            <option value="deepseek-ai/DeepSeek-V3">DeepSeek V3</option>
        `;
    } else if (provider === 'openai') {
        modelSelect.innerHTML = `
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="gpt-4">GPT-4</option>
            <option value="gpt-3.5-turbo">GPT-3.5</option>
        `;
    } else if (provider === 'deepseek') {
        modelSelect.innerHTML = `
            <option value="deepseek-chat">DeepSeek Chat</option>
            <option value="deepseek-reasoner">DeepSeek Reasoner</option>
        `;
    } else if (provider === 'anthropic') {
        modelSelect.innerHTML = `
            <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
        `;
    }
}

function saveAIConfig() {
    const provider = document.getElementById('aiProvider').value;
    const apiKey = document.getElementById('aiApiKey').value;
    const baseUrl = document.getElementById('aiBaseUrl').value;
    const model = document.getElementById('aiModel').value;

    const config = { provider, model };

    if (provider !== 'local') {
        config.apiKey = apiKey;
        if (provider === 'siliconflow') {
            config.baseUrl = 'https://api.siliconflow.cn/v1';
        } else if (provider === 'deepseek') {
            config.baseUrl = baseUrl || 'https://api.deepseek.com/v1';
        } else if (provider === 'anthropic') {
            config.baseUrl = baseUrl || 'https://api.anthropic.com';
        } else if (provider === 'openai') {
            config.baseUrl = baseUrl || 'https://api.openai.com/v1';
        } else {
            config.baseUrl = baseUrl;
        }
    }

    // Save to localStorage
    localStorage.setItem('werewolf_ai_config', JSON.stringify(config));

    // Update LLM adapter
    llmAdapter.config = { ...llmAdapter.config, ...config };

    // Show toast
    showToast('✅ AI配置已保存');

    console.log('[AI] Config saved:', config);
}

function loadAIConfig() {
    try {
        const saved = localStorage.getItem('werewolf_ai_config');
        if (saved) {
            const config = JSON.parse(saved);
            const providerEl = document.getElementById('aiProvider');
            const apiKeyEl = document.getElementById('aiApiKey');
            const baseUrlEl = document.getElementById('aiBaseUrl');
            const modelEl = document.getElementById('aiModel');

            if (providerEl) providerEl.value = config.provider || 'local';
            if (apiKeyEl) apiKeyEl.value = config.apiKey || '';
            if (baseUrlEl) baseUrlEl.value = config.baseUrl || '';
            updateAIConfig();
            // Set model after updateAIConfig populates options
            if (modelEl && config.model) {
                modelEl.value = config.model;
            }

            // Update LLM adapter
            if (typeof llmAdapter !== 'undefined') {
                llmAdapter.config = { ...llmAdapter.config, ...config };
            }
        }
    } catch (e) {
        console.log('[AI] No saved config');
    }
}

// ============ ACHIEVEMENT FUNCTIONS ============
function updateAchievementBadge() {
    const progress = Achievements.getProgress();
    const badge = document.getElementById('achievementCount');
    if (badge) {
        badge.textContent = `${progress.unlocked}/${progress.total}`;
    }
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}


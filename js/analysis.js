// ============ POST-GAME ANALYSIS ============

const gameAnalytics = {
    votes: [],      // { day, voterId, voterName, targetId, targetName, targetIsWolf }
    speeches: [],   // { day, playerId, playerName, content, length }
    keyMoments: [], // { day, phase, type, description, playerId, playerName }

    reset() {
        this.votes = [];
        this.speeches = [];
        this.keyMoments = [];
    },

    recordVote(day, voter, target) {
        this.votes.push({
            day,
            voterId: voter.id,
            voterName: voter.name,
            targetId: target.id,
            targetName: target.name,
            targetIsWolf: target.camp === 'wolf'
        });
    },

    recordSpeech(day, player, content) {
        this.speeches.push({
            day,
            playerId: player.id,
            playerName: player.name,
            content: content || '',
            length: (content || '').length
        });
    },

    recordKeyMoment(day, phase, type, description, player) {
        this.keyMoments.push({
            day,
            phase,
            type,
            description,
            playerId: player ? player.id : -1,
            playerName: player ? player.name : ''
        });
    },

    // Compute analysis
    getAnalysis() {
        const players = gameState.players;
        const playerAnalysis = players.map(p => {
            const playerVotes = this.votes.filter(v => v.voterId === p.id);
            const correctVotes = playerVotes.filter(v => v.targetIsWolf).length;
            const totalVotes = playerVotes.length;
            const voteAccuracy = totalVotes > 0 ? Math.round((correctVotes / totalVotes) * 100) : 0;

            const playerSpeeches = this.speeches.filter(s => s.playerId === p.id);
            const speechCount = playerSpeeches.length;
            const avgSpeechLen = speechCount > 0 ? Math.round(playerSpeeches.reduce((sum, s) => sum + s.length, 0) / speechCount) : 0;

            const playerMoments = this.keyMoments.filter(m => m.playerId === p.id);

            // MVP score
            let mvpScore = 0;
            mvpScore += voteAccuracy * 0.4;                    // Vote accuracy (max 40)
            mvpScore += p.isAlive ? 20 : 0;                    // Survived (20)
            mvpScore += Math.min(playerMoments.length * 5, 15); // Key actions (max 15)
            mvpScore += Math.min(speechCount * 2.5, 10);       // Speech activity (max 10)
            mvpScore += Math.min(avgSpeechLen * 0.3, 15);      // Speech quality proxy (max 15)

            return {
                id: p.id,
                name: p.name,
                icon: p.icon,
                role: p.roleName,
                camp: p.camp,
                isAlive: p.isAlive,
                voteAccuracy,
                correctVotes,
                totalVotes,
                speechCount,
                avgSpeechLen,
                keyMoments: playerMoments,
                mvpScore: Math.round(mvpScore)
            };
        });

        // Sort by MVP score
        const ranked = [...playerAnalysis].sort((a, b) => b.mvpScore - a.mvpScore);
        const mvp = ranked[0];

        return {
            players: playerAnalysis,
            ranked,
            mvp,
            totalDays: gameState.day,
            totalVotes: this.votes.length,
            totalSpeeches: this.speeches.length,
            keyMoments: this.keyMoments
        };
    }
};

// Show analysis panel
function showAnalysis() {
    const analysis = gameAnalytics.getAnalysis();

    // Remove existing
    const existing = document.getElementById('analysisModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'analysisModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal" style="max-width:560px;max-height:85vh;overflow-y:auto;">
            <div style="padding:24px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h2 style="font-family:'Orbitron',sans-serif;font-size:18px;">📊 对局分析</h2>
                    <button onclick="document.getElementById('analysisModal').remove()" style="background:none;border:none;color:var(--text);font-size:24px;cursor:pointer;">×</button>
                </div>

                ${renderMVPCard(analysis.mvp)}
                ${renderVoteAccuracy(analysis.players)}
                ${renderSpeechStats(analysis.players)}
                ${renderKeyMoments(analysis.keyMoments)}
                ${renderPlayerRanking(analysis.ranked)}

                <button class="btn btn-primary" onclick="document.getElementById('analysisModal').remove()" style="width:100%;margin-top:16px;">关闭</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function renderMVPCard(mvp) {
    if (!mvp) return '';
    const campColor = mvp.camp === 'wolf' ? '#e74c3c' : '#3498db';
    return `
        <div style="background:linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,165,0,0.1));border:2px solid #ffd700;border-radius:12px;padding:16px;margin-bottom:20px;text-align:center;">
            <div style="font-size:11px;color:#ffd700;letter-spacing:2px;margin-bottom:8px;">⭐ MVP ⭐</div>
            <div style="font-size:36px;margin-bottom:4px;">${mvp.icon}</div>
            <div style="font-size:18px;font-weight:600;margin-bottom:4px;">${mvp.name}</div>
            <div style="font-size:13px;color:${campColor};margin-bottom:8px;">${mvp.role} | ${mvp.camp === 'wolf' ? '狼人阵营' : '好人阵营'}</div>
            <div style="display:flex;justify-content:center;gap:20px;font-size:12px;color:var(--text-muted);">
                <span>投票准确率 <strong style="color:var(--text);">${mvp.voteAccuracy}%</strong></span>
                <span>发言 <strong style="color:var(--text);">${mvp.speechCount}次</strong></span>
                <span>得分 <strong style="color:#ffd700;">${mvp.mvpScore}</strong></span>
            </div>
        </div>
    `;
}

function renderVoteAccuracy(players) {
    const rows = players.map(p => {
        const barColor = p.camp === 'wolf' ? '#e74c3c' : '#3498db';
        return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:14px;width:20px;text-align:center;">${p.icon}</span>
                <span style="font-size:12px;width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</span>
                <div style="flex:1;height:16px;background:rgba(255,255,255,0.05);border-radius:8px;overflow:hidden;position:relative;">
                    <div style="height:100%;width:${p.voteAccuracy}%;background:${barColor};border-radius:8px;transition:width 0.5s;"></div>
                </div>
                <span style="font-size:11px;color:var(--text-muted);min-width:55px;text-align:right;">${p.correctVotes}/${p.totalVotes} (${p.voteAccuracy}%)</span>
            </div>
        `;
    }).join('');

    return `
        <div style="margin-bottom:20px;">
            <h3 style="font-size:14px;margin-bottom:10px;">🎯 投票准确率</h3>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">投中狼人的比例</div>
            ${rows}
        </div>
    `;
}

function renderSpeechStats(players) {
    const maxSpeeches = Math.max(...players.map(p => p.speechCount), 1);
    const rows = players.map(p => {
        const width = Math.round((p.speechCount / maxSpeeches) * 100);
        return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:14px;width:20px;text-align:center;">${p.icon}</span>
                <span style="font-size:12px;width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</span>
                <div style="flex:1;height:16px;background:rgba(255,255,255,0.05);border-radius:8px;overflow:hidden;">
                    <div style="height:100%;width:${width}%;background:#2ecc71;border-radius:8px;transition:width 0.5s;"></div>
                </div>
                <span style="font-size:11px;color:var(--text-muted);min-width:45px;text-align:right;">${p.speechCount}次</span>
            </div>
        `;
    }).join('');

    return `
        <div style="margin-bottom:20px;">
            <h3 style="font-size:14px;margin-bottom:10px;">💬 发言频率</h3>
            ${rows}
        </div>
    `;
}

function renderKeyMoments(moments) {
    if (!moments || moments.length === 0) {
        return `
            <div style="margin-bottom:20px;">
                <h3 style="font-size:14px;margin-bottom:10px;">⚡ 关键时刻</h3>
                <div style="font-size:12px;color:var(--text-muted);">暂无关键事件记录</div>
            </div>
        `;
    }

    const icons = {
        witch_save: '💊', witch_poison: '☠️', prophet_check: '🔮',
        hunter_shoot: '🏹', wolfking_shoot: '👑', guard_protect: '🛡️',
        wolf_kill: '🐺', vote_out: '🗳️'
    };

    const items = moments.slice(-10).map(m => {
        const icon = icons[m.type] || '⚡';
        return `
            <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;">
                <span style="color:var(--text-muted);min-width:45px;">第${m.day}${m.phase === 'night' ? '夜' : '天'}</span>
                <span>${icon}</span>
                <span style="color:var(--text);">${m.description}</span>
            </div>
        `;
    }).join('');

    return `
        <div style="margin-bottom:20px;">
            <h3 style="font-size:14px;margin-bottom:10px;">⚡ 关键时刻</h3>
            ${items}
        </div>
    `;
}

function renderPlayerRanking(ranked) {
    const medals = ['🥇', '🥈', '🥉'];
    const rows = ranked.map((p, i) => {
        const medal = i < 3 ? medals[i] : `${i + 1}.`;
        const campColor = p.camp === 'wolf' ? '#e74c3c' : '#3498db';
        const status = p.isAlive ? '✅' : '💀';
        return `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:${i === 0 ? 'rgba(255,215,0,0.08)' : 'transparent'};border-radius:8px;margin-bottom:4px;">
                <span style="font-size:14px;min-width:24px;">${medal}</span>
                <span style="font-size:16px;">${p.icon}</span>
                <div style="flex:1;">
                    <div style="font-size:13px;font-weight:500;">${p.name} ${status}</div>
                    <div style="font-size:11px;color:${campColor};">${p.role}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:14px;font-weight:600;color:#ffd700;">${p.mvpScore}</div>
                    <div style="font-size:10px;color:var(--text-muted);">分</div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div style="margin-bottom:8px;">
            <h3 style="font-size:14px;margin-bottom:10px;">🏅 玩家排行</h3>
            ${rows}
        </div>
    `;
}

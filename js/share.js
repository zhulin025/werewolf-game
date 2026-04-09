async function generateSharePoster() {
    const gameOverModal = document.getElementById('gameOverModal');
    if (!gameOverModal) return;

    const btn = document.getElementById('generatePosterBtn');
    const originalBtnText = btn ? btn.innerHTML : '📸 生成战报';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ 正在生成点评...';
        btn.style.opacity = '0.8';
    }

    try {
        // Fetch the AI "roast" (毒舌点评)
        const aiRoast = await generateAIRoast();

        if (btn) btn.innerHTML = '🖼️ 正在绘制海报...';
        await new Promise(r => setTimeout(r, 100)); // allow UI to update

        let snapshotData = '';
        // 优先使用游戏过程中的高光截图 (First Death 等)
        if (window._gameHighlight) {
            console.log('[Share] Using pre-captured game highlight');
            snapshotData = window._gameHighlight;
        } else if (window.gameStyle === '3d' && window.Scene3D && typeof window.Scene3D.captureSnapshot === 'function') {
            snapshotData = window.Scene3D.captureSnapshot(0.85);
        } else {
            try {
                const arena = document.querySelector('.arena');
                if (arena) {
                    const canvas2d = await html2canvas(arena, { backgroundColor: '#1a1a2e', scale: 1 });
                    snapshotData = canvas2d.toDataURL('image/jpeg', 0.8);
                }
            } catch(e) { console.error('2D Snapshot failed', e); }
        }

        // Create a temporary container for the poster
        const posterContainer = document.createElement('div');
        posterContainer.className = 'poster-container';
        posterContainer.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            z-index: -9999;
            width: 450px;
            background: #0f172a;
            color: white;
            font-family: 'Inter', 'LXGW WenKai Screen', system-ui, sans-serif;
            overflow: hidden;
        `;

        const statsHtml = document.getElementById('gameOverStats').innerHTML;
        const winnerText = document.getElementById('winnerText').innerText;
        const winnerCamp = document.getElementById('winnerCamp').innerText;

        posterContainer.innerHTML = `
            <div style="background: linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%); padding: 0;">
                <!-- Top banner -->
                <div style="text-align: center; padding: 40px 20px 30px;">
                    <div style="font-size: 42px; font-weight: 900; background: linear-gradient(90deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -1px;">🐺 AI狼人杀</div>
                    <div style="font-size: 16px; color: #94a3b8; letter-spacing: 4px; margin-top: 5px; font-weight: 300; text-transform: uppercase;">战斗复盘报告</div>
                </div>

                <!-- Snapshot with Badge -->
                <div style="padding: 0 25px;">
                    <div style="border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.1); position: relative; background: #1e293b;">
                        ${snapshotData ? `<img src="${snapshotData}" style="width: 100%; display: block; object-fit: cover; aspect-ratio: 16/10;">` : `<div style="height: 240px; display:flex; align-items:center; justify-content:center; color:#64748b; font-style:italic;">[ 未能获取高光瞬间 ]</div>`}
                        <div style="position: absolute; top: 15px; right: 15px; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); padding: 5px 12px; border-radius: 100px; font-size: 12px; font-weight: 600; color: #facc15; border: 1px solid rgba(250,204,21,0.3);">
                            ✨ 高光时刻回顾
                        </div>
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(15,23,42,1)); padding: 40px 25px 20px;">
                            <div style="font-size: 32px; font-weight: 900; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,1);">${winnerText}</div>
                            <div style="font-size: 16px; color: #cbd5e1; margin-top: 6px; letter-spacing: 1px;">${winnerCamp}</div>
                        </div>
                    </div>
                </div>

                <!-- Stats Section -->
                <div style="padding: 30px 25px 15px;">
                    <div style="background: rgba(255,255,255,0.03); border-radius: 20px; padding: 20px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 15px;">
                        <div style="text-align: center; color: #64748b; font-size: 12px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;">本局核心统计</div>
                        <div style="display: flex; justify-content: space-around; text-align: center; font-size: 16px;">
                            ${statsHtml}
                        </div>
                    </div>
                </div>

                <!-- AI Roast - Deep Dark Style -->
                <div style="padding: 10px 25px 40px;">
                    <div style="position: relative; background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(0,0,0,0.4)); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 24px; padding: 35px 25px 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                        <div style="position: absolute; top: -16px; left: 25px; background: linear-gradient(135deg, #ef4444, #b91c1c); color: white; padding: 7px 18px; border-radius: 20px; font-size: 14px; font-weight: 900; box-shadow: 0 8px 16px rgba(239, 68, 68, 0.4); border: 1px solid rgba(255,255,255,0.2);">
                            🎤 战局锐评：${aiRoast.title}
                        </div>
                        <div style="font-size: 18px; line-height: 1.8; color: #fef2f2; font-weight: 500; font-style: italic;">
                            “ ${aiRoast.roast} ”
                        </div>
                    </div>
                </div>

                <!-- Footer with QR-like area -->
                <div style="text-align: center; padding: 30px 25px; background: rgba(0,0,0,0.5); font-size: 13px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                    <div style="text-align: left;">
                        <div style="margin-bottom: 4px; color: #94a3b8; font-weight: 600;">长按保存图片</div>
                        <div style="opacity: 0.7;">AI智能生成·高光时刻记录</div>
                    </div>
                    <div style="text-align: right; opacity: 0.6; font-family: monospace; font-size: 11px;">
                        WEREWOLF AGENT<br>v6.1.1.PRO
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(posterContainer);

        const canvas = await html2canvas(posterContainer, {
            scale: 2, // High resolution
            backgroundColor: '#0f172a',
            useCORS: true,
            allowTaint: true
        });

        const imgData = canvas.toDataURL('image/png');
        showPosterModal(imgData);
        
        document.body.removeChild(posterContainer);
    } catch (e) {
        console.error('Failed to generate poster:', e);
        alert('海报生成失败，请重试');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
            btn.style.opacity = '1';
        }
    }
}

async function generateAIRoast() {
    // Check if we have a way to generate a roast
    const canUseAI = typeof llmAdapter !== 'undefined' && llmAdapter && llmAdapter.enabled;
    
    if (!canUseAI) {
        return { 
            title: '普通对局', 
            roast: "这场对局精彩纷呈，希望能再接再厉！" 
        };
    }

    try {
        const alivePlayers = gameState.players.filter(p => p.isAlive).map(p => `${p.name}(${p.roleName})`).join('、');
        // use 'cause' as per Game.js records
        const deathRecordsStr = gameState.deathRecords.map(d => `第${d.day}天:${d.name}(${d.roleName}, ${d.cause || d.reason || '?'})`).join('; ');
        
        // Context from logs for deeper "stinging" points
        const recentLogs = (window._gLogs || []).slice(-30).map(l => l.message).join('\n');

        const prompt = `你是一个毒舌、犀利、看透人性的【狼人杀资深复盘大师】。
你的任务是为这局刚结束的游戏写一个“高潮迭起、字字扎心”的战报点评。

【战局数据】
- 胜方：${gameState.winner === 'good' ? '好人' : '狼人'}（${gameState.winner === 'good' ? '全员躺赢' : '狼人血洗'}）
- 活下来的：${alivePlayers || '一个都没有，全军覆没'}
- 领盒饭顺序：${deathRecordsStr || '无（平安夜到老？）'}

【现场日志记录】
${recentLogs}

【点评要求】
1. **战局称号**：给这局对局起一个最有张力、讽刺性极强的名字（如“预言家自杀秀”、“狼群划水锦标赛”）。
2. **毒舌锐评**：
   - 语气：刻薄、幽默、充满梗。
   - 内容：扎心。点出具体的死法或失误。
   - 互动：像是在跟这些玩家当面对线。
   - 字数：不超过 80 字。

【必须返回JSON格式】
{"title": "称号", "roast": "锐评内容"}`;
        
        console.log('[Share] Generating roast with sharp prompt...');
        
        const response = await llmAdapter.generateSpeech({
            player: { id: -1, name: '旁白', role: 'VILLAGER', roleName: '旁白', camp: 'good' },
            gameState: gameState,
            themePrompt: prompt
        });

        let text = typeof response === 'string' ? response : (response.text || response);
        // Clean markdown backticks
        text = text.replace(/```json/g, '').replace(/```/g, '').replace(/^JSON:/i, '').trim();
        
        try {
            // Find JSON in response in case LLM added prefix/suffix
            const jsonMatch = text.match(/\{.*\}/s);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('No JSON found in response');
        } catch(e) {
            console.warn('[Share] AI response parse failed, using raw response', e);
            return { title: '神秘对局', roast: text.substring(0, 100) };
        }
    } catch (e) {
        console.error('[Share] AI roast failed:', e);
        return { title: '战后废墟', roast: '这场对局精彩纷呈，希望能再接再厉！' };
    }
}

function showPosterModal(imgData) {
    const modalId = 'posterModal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.style.zIndex = '10000';
        
        modal.innerHTML = `
            <div class="modal" style="display: flex; flex-direction: column; align-items: center; max-height: 90vh;">
                <h3 style="margin-bottom: 15px;">📸 战绩海报已生成</h3>
                <img id="posterImg" style="max-height: 60vh; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); object-fit: contain; margin-bottom: 20px;">
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 15px;">长按上方图片即可保存或分享</div>
                <div style="display: flex; gap: 10px; width: 100%;">
                    <button class="btn btn-primary" id="downloadPosterBtn" style="flex: 1;">⬇️ 下载图片</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('${modalId}').classList.remove('active'); setTimeout(()=>document.getElementById('${modalId}').style.display='none', 300)" style="flex: 1;">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const img = document.getElementById('posterImg');
    img.src = imgData;

    const downloadBtn = document.getElementById('downloadPosterBtn');
    downloadBtn.onclick = () => {
        const link = document.createElement('a');
        link.download = `AI狼人杀-战报_${new Date().getTime()}.png`;
        link.href = imgData;
        link.click();
    };

    modal.style.display = 'flex';
    // Must add active class to trigger opacity: 1 and pointer-events: auto
    setTimeout(() => modal.classList.add('active'), 10);
}

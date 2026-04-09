async function generateSharePoster() {
    const gameOverModal = document.getElementById('gameOverModal');
    if (!gameOverModal) return;

    // Create a temporary container for the poster
    const posterContainer = document.createElement('div');
    posterContainer.className = 'poster-container';
    posterContainer.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        width: 375px; /* Mobile width */
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        color: white;
        padding: 20px;
        border-radius: 12px;
        font-family: 'Inter', sans-serif;
    `;

    // Clone the relevant parts of the game over modal
    const statsHtml = document.getElementById('gameOverStats').innerHTML;
    const winnerText = document.getElementById('winnerText').innerText;
    const winnerCamp = document.getElementById('winnerCamp').innerText;

    // Fetch the AI "roast" (毒舌点评)
    const aiRoast = await generateAIRoast();

    posterContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 32px; margin-bottom: 10px;">🐺 AI狼人杀</div>
            <div style="font-size: 24px; font-weight: bold; color: #f1c40f;">${winnerText}</div>
            <div style="font-size: 16px; color: #bbb;">${winnerCamp}</div>
        </div>
        
        <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="font-size: 14px; margin-bottom: 15px; display: flex; justify-content: space-around; text-align: center;">
                ${statsHtml}
            </div>
        </div>

        <div style="background: rgba(231, 76, 60, 0.2); border: 1px solid rgba(231, 76, 60, 0.5); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="font-size: 12px; color: #e74c3c; margin-bottom: 5px; font-weight: bold;">🗣️ 毒舌点评</div>
            <div style="font-size: 14px; font-style: italic; line-height: 1.5;">"${aiRoast}"</div>
        </div>

        <div style="text-align: center; font-size: 12px; color: #888;">
            <div style="margin-bottom: 5px;">🔥 长按保存图片分享战绩</div>
            <div>https://werewolf-game-production-443d.up.railway.app</div>
        </div>
    `;

    document.body.appendChild(posterContainer);

    try {
        const canvas = await html2canvas(posterContainer, {
            scale: 2, // High resolution
            backgroundColor: '#1a1a2e'
        });

        const imgData = canvas.toDataURL('image/png');
        showPosterModal(imgData);
    } catch (e) {
        console.error('Failed to generate poster:', e);
        alert('海报生成失败，请重试');
    } finally {
        document.body.removeChild(posterContainer);
    }
}

async function generateAIRoast() {
    if (typeof llmAdapter === 'undefined' || !llmAdapter || !llmAdapter.enabled) {
        return "这场对局精彩纷呈，各种下饭操作让人目不暇接。希望能再接再厉！";
    }

    try {
        const prompt = `你是一个毒舌的狼人杀复盘解说。
请根据以下对局信息，生成一段不超过50字的"毒舌点评"（带有一些嘲讽或幽默感，不要骂人，要有趣）。
天数：${gameState.day}
获胜阵营：${gameState.winner === 'good' ? '好人' : '狼人'}
死者名单：${gameState.deathRecords.map(d => d.name + '(' + d.roleName + ')').join('、')}
`;
        
        const response = await llmAdapter.generateSpeech({
            player: { id: -1, name: '旁白', role: 'VILLAGER', roleName: '旁白', camp: 'good' },
            gameState: gameState,
            themePrompt: prompt
        });

        // Parse response
        let text = typeof response === 'string' ? response : (response.text || response);
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        try {
            const parsed = JSON.parse(text);
            text = parsed.speech || text;
        } catch(e) {}

        return text || "这场对局精彩纷呈，各种下饭操作让人目不暇接。希望能再接再厉！";
    } catch (e) {
        console.error('AI roast failed', e);
        return "这场对局精彩纷呈，各种下饭操作让人目不暇接。希望能再接再厉！";
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
        modal.style.zIndex = '1000';
        
        modal.innerHTML = `
            <div class="modal" style="display: flex; flex-direction: column; align-items: center; max-height: 90vh;">
                <h3 style="margin-bottom: 15px;">📸 战绩海报已生成</h3>
                <img id="posterImg" style="max-height: 60vh; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); object-fit: contain; margin-bottom: 20px;">
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 15px;">长按上方图片即可保存或分享</div>
                <div style="display: flex; gap: 10px; width: 100%;">
                    <button class="btn btn-primary" id="downloadPosterBtn" style="flex: 1;">⬇️ 下载图片</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('${modalId}').style.display='none'" style="flex: 1;">关闭</button>
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
        link.download = \`AI狼人杀-战报_\${new Date().getTime()}.png\`;
        link.href = imgData;
        link.click();
    };

    modal.style.display = 'flex';
}

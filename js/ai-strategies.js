async function generateSmartSpeech(player) {
    try {
        const themeId = window.currentGameTheme || 'standard';
        let themePrompt = "";
        if (typeof getThemePrompt === 'function') {
            themePrompt = getThemePrompt(themeId, player.id, player.camp, player.roleName);
        }

        const context = {
            player: player,
            themePrompt: themePrompt, // newly added
            gameState: {
                day: gameState.day,
                players: gameState.players,
                phase: gameState.phase,
                recentSpeeches: getRecentSpeeches()
            }
        };

        // Use LLM adapter if available and enabled
        if (typeof llmAdapter !== 'undefined' && llmAdapter && (llmAdapter.enabled || llmAdapter.config?.provider === 'local')) {
            // Add timeout to prevent hanging
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('LLM timeout')), 30000)
            );
            const result = await Promise.race([
                llmAdapter.generateSpeech(context),
                timeout
            ]);
            return result;
        }
    } catch (e) {
        console.error('Smart speech failed:', e);
    }

    // Fallback to basic speech
    return {
        text: generateAISpeak(player),
        emotion: 'normal'
    };
}

function getRecentSpeeches() {
    // Get last 5 speeches from log
    const speeches = [];
    const logEntries = document.querySelectorAll('.log-entry.speak');
    logEntries.forEach(entry => {
        const text = entry.textContent;
        if (text.includes('：')) {
            const parts = text.split('：');
            speeches.push({
                playerName: parts[0].replace('💬', '').trim(),
                content: parts.slice(1).join('：').trim()
            });
        }
    });
    return speeches.slice(-5);
}

// AI策略系统 - 增强版
const AIStrategies = {
    VILLAGER: {
        base: ['过', '观察中', '大家分析一下', '我觉得可以再看看', '先听听别人说', '这轮先过了', '我再观察一下', '大家踊跃发言', '好人在分析', '局势不明朗'],
        suspicious: ['这人说话有点奇怪', '发言可疑', '有点不对劲', '发言值得怀疑', '这位的语气不对', '我注意到了', '他的逻辑有问题', '这里有狼'],
        defensive: ['我是好人', '大家要理性分析', '不要盲目跟风', '分析再说', '好人不乱跳', '我有逻辑支撑', '大家仔细想想', '我站边清楚'],
        active: ['这局很重要', '大家认真点', '不要水', '跟着节奏走', '关键时刻到了', '好人们清醒点', '狼在浑水摸鱼', '我们要赢'],
        voting: ['跟着投票', '不要分票', '投这边', '保持队形', '好人一票']
    },
    PROPHET: {
        base: ['过', '我有身份', '晚上看看情况', '大家一起分析', '我心里有数', '稍等', '我还没验完', '等时机成熟', '保持冷静'],
        earlyReport: ['报一下我的查验', '3号是查杀', '8号是金水', '我的验人是金水', '有人是狼', '查杀报出来了', '跟着我的查验走', '这个是查杀'],
        lateReport: ['该报信息了', '我的查验还没报', '跟着我的查验走', '信息要报了', '大家注意听', '这是我的查验结果', '好人跟我走'],
        fake: ['我才是预言家', '不要信那个人', '那个人在焊跳', '真假预言家对跳', '我是真的', '对方才是狼', '大家看清楚'],
        voting: ['投我的查杀', '跟我投', '不要投错', '查杀必须出', '跟着预言家走']
    },
    WITCH: {
        base: ['过', '我会用我的能力', '大家放心', '看着形式来', '关键时刻我会用', '我有我的判断', '药还有', '毒也有', '不用急'],
        saved: ['昨晚救了人', '有我在，别怕', '平安夜', '我救了人', '解药用了', '人是我救的', '平安夜来了', '别刀我的人'],
        usedPotion: ['药已经用了', '救人是关键', '药用了但值得', '解药没了', '药已经用了但值得', '救了关键人物', '好人在就是好'],
        poison: ['我毒了人', '我毒了那个焊跳的', '药没白用', '毒了一人', '狼被毒了', '毒到位了', '这一毒很关键'],
        voting: ['投那边', '跟着投', '不要投错', '这轮很关键', '保持好人流']
    },
    GUARD: {
        base: ['过', '我会守人的', '大家正常发言', '晚上交给我', '放心守', '守好了', '别急', '我心里有数', '守卫在'],
        protecting: ['守了人', '今晚很关键', '守了重要位置', '守了该守的人', '守得很准', '重要位置守住了', '这边安全'],
        sameTarget: ['连续守同一个人', '守了昨晚那个人', '继续守', '守到底', '这个人要守', '连续守很关键', '我再守一次'],
        voting: ['投票', '跟着投', '这轮很明显', '不要犹豫', '好人一票']
    },
    HUNTER: {
        base: ['过', '我是猎人', '到时候再说', '跟着大家走', '不要乱来', '我有枪', '别惹我', '等一下', '时机未到'],
        claim: ['我是猎人', '不要投我', '猎人在', '我是枪', '带我划不来', '枪在好人这边', '猎人会开枪'],
        threatened: ['别惹我', '我可以带人的', '带我划不来', '狼不要跳了', '我会开枪的', '枪在盯着'],
        voting: ['投这边', '跟我投', '这一票很关键', '不要分票', '跟着投']
    },
    WOLF: {
        base: ['过', '我是好人', '大家一起分析', '先看看再说', '观察一下', '这轮先过了', '我也在分析', '好人们加油', '局势复杂'],
        fakeProphet: ['我是预言家', '验了X号是好人', '跟着我走', '这边是金水', '我是真预言家', '对方焊跳', '跟我投', '我的查验很准'],
        defend: ['保一下这位', '这位是好人', '那人像狼', '这边要保', '这位发言不错', '我看好这位', '好人要保'],
        attack: ['这个人有问题', '建议投这位', '我观察到...', '发言暴露了', '这位的逻辑不对', '可疑', '这里有狼面', '我投这边'],
        voting: ['投这边', '跟着投', '不要分票', '狼队形', '冲']
    },
    WOLF_KING: {
        base: ['过', '我是好人', '大家一起投', '过', '分析一波', '节奏要带起来', '听我说', '我很关键', '这局很重要'],
        leader: ['听我分析', '跟着我投', '这局很重要', '节奏要带起来', '我带队', '狼队跟我走', '好人听指挥', '这轮冲'],
        fakeProphet: ['我是预言家', '10号是查杀', '信我的', '这边是查杀', '跟我走', '查杀很明显', '不要犹豫'],
        attack: ['这个人有问题', '建议投这位', '我观察到...', '发言暴露了', '这边是狼', '冲', '不要犹豫了', '出这个'],
        voting: ['冲', '投这边', '狼队跟我走', '不要怂', '一起投']
    }
};

// AI状态追踪
let aiState = {
    prophetReports: {}, // playerId -> { day, result }
    wolfFakeClaims: {},  // playerId -> { day, claimed }
    lastGuardTarget: null,
    witchHasAntidote: true,   // 女巫是否还有解药
    witchHasPoison: true      // 女巫是否还有毒药
};

// 每晚的行动记录（每晚开始时重置）
let nightActions = {
    wolfTarget: null,       // 狼人刀的目标
    witchSaved: false,      // 女巫是否使用了解药
    witchPoisonTarget: null, // 女巫毒药目标
    guardTarget: null       // 守卫守护目标
};

function resetNightActions() {
    nightActions = {
        wolfTarget: null,
        witchSaved: false,
        witchPoisonTarget: null,
        guardTarget: null
    };
}

function resetAIState() {
    aiState = {
        prophetReports: {},
        wolfFakeClaims: {},
        lastGuardTarget: null,
        witchHasAntidote: true,
        witchHasPoison: true
    };
}

// AI记忆系统
let aiMemory = {
    suspected: {},
    confirmed: {},
    lastWill: {}
};

function resetAIMemory() {
    aiMemory = {
        suspected: {},
        confirmed: {},
        lastWill: {}
    };
}

function generateAISpeak(player, gameContext = {}) {
    const role = player.role;
    const strategy = AIStrategies[role];
    if (!strategy) return '过';

    const day = gameState.day || 1;
    const phase = gameState.phase || 'day';
    let speechPool = [...strategy.base];
    const reports = aiState.prophetReports[player.id];

    // 根据阶段选择发言风格
    if (phase === 'vote' && strategy.voting) {
        speechPool = [...strategy.voting];
    }

    // 预言家：根据查验结果决定是否报信息
    if (role === 'PROPHET') {
        if (reports) {
            // 已经查验过，可能报信息
            if (day >= 2 || Math.random() < 0.4) {
                speechPool.push(...strategy.earlyReport);
            }
        } else if (Math.random() < 0.2) {
            // 还没查验就开始焊跳
            speechPool.push(...strategy.fake);
        }
    }

    // 狼人：可能会焊跳预言家
    if (role.includes('WOLF')) {
        const fakeClaim = aiState.wolfFakeClaims[player.id];
        if (!fakeClaim && Math.random() < 0.25) {
            // 开始焊跳
            aiState.wolfFakeClaims[player.id] = { day, claimed: true };
            speechPool.push(...strategy.fakeProphet);
        } else if (Math.random() < 0.3) {
            // 攻击好人
            speechPool.push(...strategy.attack);
        }
    }

    // 守卫：可能会提到守人
    if (role === 'GUARD' && aiState.lastGuardTarget) {
        if (Math.random() < 0.3) {
            speechPool.push(...strategy.sameTarget);
        }
    }

    // 猎人：可能会亮身份
    if (role === 'HUNTER' && Math.random() < 0.3) {
        speechPool.push(...strategy.claim);
    }

    // 第三天以后更活跃
    if (day >= 3 && Math.random() < 0.4 && strategy.active) {
        speechPool.push(...strategy.active);
    }

    // 第二天发言更认真
    if (day === 2 && Math.random() < 0.4) {
        speechPool.push('进入关键阶段了', '好人们开始分析', '局势逐渐明朗', '认真发言');
    }

    // 随机选择
    let speech = speechPool[Math.floor(Math.random() * speechPool.length)];

    // 替换占位符
    if (gameContext.target) {
        if (speech.includes('X号')) {
            speech = speech.replace('X号', `${gameContext.target.number}号`);
        }
        if (speech.includes('这个人')) {
            speech = `建议投${gameContext.target.name}`;
        }
    }

    // 预言家报查验
    if (role === 'PROPHET' && reports) {
        if (speech.includes('验了X号')) {
            speech = `昨晚验了${reports.target.number}号，是${reports.result === 'wolf' ? '狼人' : '好人'}`;
        }
        if (speech.includes('是金水')) {
            speech = `${reports.target.number}号是我的金水`;
        }
        if (speech.includes('是查杀')) {
            speech = `${reports.target.number}号是我的查杀`;
        }
    }

    return speech;
}

// 更智能的AI决策
function makeAISmartDecision(player, action, gameContext = {}) {
    const alivePlayers = gameState.players.filter(p => p.isAlive && p.id !== player.id);

    switch (action) {
        case 'guard':
            // 守卫不能连续两晚守同一人
            const guardCandidates = alivePlayers.filter(p =>
                !aiState.lastGuardTarget || p.id !== aiState.lastGuardTarget.id
            );
            if (guardCandidates.length === 0) return alivePlayers[0];
            // 优先守护神职
            const protectedRoles = ['PROPHET', 'WITCH', 'HUNTER'];
            const importantPlayer = guardCandidates.find(p => protectedRoles.includes(p.role));
            return importantPlayer || guardCandidates[Math.floor(Math.random() * guardCandidates.length)];

        case 'wolf_kill':
            // 狼人优先刀神职
            const killTargets = alivePlayers.filter(p => ['PROPHET', 'WITCH', 'GUARD', 'HUNTER'].includes(p.role));
            if (killTargets.length > 0) {
                // 刀还在的神职
                const activeGod = killTargets[Math.floor(Math.random() * killTargets.length)];
                return activeGod;
            }
            return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

        case 'witch_heal':
            // 女巫救人决策：首夜被刀70%自救，其他情况50%救人
            // 被刀的是神职优先救
            if (!nightActions.wolfTarget) return false;
            const victim = nightActions.wolfTarget;
            const isGod = ['PROPHET', 'WITCH', 'GUARD', 'HUNTER'].includes(victim.role);
            if (isGod) return Math.random() < 0.7;
            if (gameState.day === 1) return Math.random() < 0.6; // 首夜倾向救人
            return Math.random() < 0.4;

        case 'witch_poison':
            // 女巫毒人：如果有确认的狼人就毒
            const knownWolf = alivePlayers.find(p =>
                aiMemory.confirmed[p.id] === 'wolf' && p.camp === 'wolf'
            );
            if (knownWolf) return knownWolf;
            // 可疑度高的人有小概率毒
            const suspectedWolf = Object.entries(aiMemory.suspected)
                .filter(([id, level]) => level > 0.7)
                .map(([id]) => gameState.players.find(p => p.id === parseInt(id)))
                .filter(p => p && p.isAlive);
            if (suspectedWolf.length > 0 && Math.random() < 0.3) {
                return suspectedWolf[0];
            }
            return null;

        case 'prophet_check':
            // 预言家查验：优先查可疑的人或狼人同伴
            const suspects = Object.entries(aiMemory.suspected)
                .filter(([id, level]) => level > 0.5)
                .map(([id]) => gameState.players.find(p => p.id === parseInt(id)))
                .filter(Boolean);

            if (suspects.length > 0) {
                return suspects[0];
            }

            // 优先查验还没查验过的人
            const unchecked = alivePlayers.filter(p => {
                const checked = Object.values(aiState.prophetReports).find(r => r.target.id === p.id);
                return !checked;
            });

            if (unchecked.length > 0) {
                return unchecked[Math.floor(Math.random() * unchecked.length)];
            }

            return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

        case 'vote':
            // 不能投自己
            let otherPlayers = alivePlayers.filter(p => p.id !== player.id);
            if (gameContext.allowedTargets) {
                otherPlayers = gameContext.allowedTargets.filter(p => p.id !== player.id);
            }
            if (otherPlayers.length === 0) return null;

            // 1. 优先投已确认的狼人
            const knownWolves = otherPlayers.filter(p =>
                aiMemory.confirmed[p.id] === 'wolf'
            );
            if (knownWolves.length > 0) {
                return knownWolves[0];
            }

            // 2. 预言家查验结果
            if (player.role === 'PROPHET') {
                const reports = aiState.prophetReports[player.id];
                if (reports && reports.result === 'wolf') {
                    const wolfTarget = otherPlayers.find(p => p.id === reports.target.id);
                    if (wolfTarget) return wolfTarget;
                }
            }

            // 3. 投可疑的人
            const suspectedPlayers = Object.entries(aiMemory.suspected)
                .sort((a, b) => b[1] - a[1])
                .map(([id]) => gameState.players.find(p => p.id === parseInt(id)))
                .filter(p => p && p.isAlive && p.id !== player.id);

            if (suspectedPlayers.length > 0) {
                return suspectedPlayers[0];
            }

            // 4. 好人阵营优先投疑似狼人的
            if (player.camp === 'good') {
                return otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            }

            // 5. 狼人阵营优先刀神职或乱民
            if (player.camp === 'wolf') {
                const gods = otherPlayers.filter(p =>
                    ['PROPHET', 'WITCH', 'GUARD', 'HUNTER'].includes(p.role)
                );
                if (gods.length > 0) {
                    return gods[Math.floor(Math.random() * gods.length)];
                }
            }

            // 6. 随机投票
            return otherPlayers[Math.floor(Math.random() * otherPlayers.length)];

        default:
            return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    }
}

async function startVotingPhase() {
    if (gameState.phase === 'end' || gameState.phase === 'vote') return;
    console.log('>>>>>>> startVotingPhase ENTERED <<<<<<<');
    try {
        gameState.phase = 'vote';
        updatePhaseDisplay();
        SoundSystem.play('vote');
        addLog(`🗳️ 投票环节开始`, 'vote');
        VoiceSystem.announce('投票环节开始，请各位玩家投票');

        const alivePlayers = gameState.players.filter(p => p.isAlive);
        console.log('Alive players for voting:', alivePlayers.length);
        gameState.votes = {};

        // Simulate voting with visual feedback
        for (let i = 0; i < alivePlayers.length; i++) {
            if (gameState.phase === 'end') return;
            const player = alivePlayers[i];
            console.log('Voting:', player.name, `(${i + 1}/${alivePlayers.length})`);
            // Highlight current voter
            const voterCard = document.getElementById(`player-${player.id}`);
            if (voterCard) {
                voterCard.classList.add('voting-target');
            }

            await sleep(1500);

            // Human or AI votes
            let voteTarget;
            if (player.isHuman && typeof showHumanVoteTargets === 'function') {
                const voteable = alivePlayers.filter(p => p.id !== player.id);
                showHumanVoteTargets(voteable);
                voteTarget = await waitForHumanAction();
            } else {
                voteTarget = await makeAIDecisionAsync(player, 'vote');
            }
            console.log(player.name, 'voted for', voteTarget?.name, voteTarget?.id);

            if (!voteTarget || voteTarget.id === undefined) {
                console.error('Invalid vote target!');
                continue;
            }

            gameState.votes[player.id] = voteTarget.id;
            if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordVote(gameState.day, player, voteTarget);

            // Draw voting line animation
            if (voterCard) {
                voterCard.classList.remove('voting-target');
                drawVoteLine(voterCard, voteTarget.id);
            }

            const votedCard = document.getElementById(`player-${voteTarget.id}`);
            if (votedCard) {
                votedCard.classList.add('voted');
            }

            addLog(`🗳️ ${player.name} 投了 ${voteTarget.name}`, 'vote');
            SoundSystem.play('click');

            // Clear highlight
            if (voterCard) {
                voterCard.classList.remove('voting-target');
            }

            await sleep(500);
        }

        if (gameState.phase === 'end') return;
        console.log('All voting done, tallying...');

        await sleep(1500);

        // Clear all vote highlights
        document.querySelectorAll('.player-card').forEach(card => {
            card.classList.remove('voted');
        });

        // Tally votes
        const voteCount = {};
        Object.values(gameState.votes).forEach(votedId => {
            voteCount[votedId] = (voteCount[votedId] || 0) + 1;
        });

        // Show vote counts
        for (const [playerId, count] of Object.entries(voteCount)) {
            const player = gameState.players.find(p => p.id === parseInt(playerId));
            addLog(`📊 ${player.name} 获得 ${count} 票`, 'vote');
        }

        await sleep(1500);

        // Find most voted
        let maxVotes = 0;
        let mostVoted = null;
        let isTie = false;

        for (const [playerId, count] of Object.entries(voteCount)) {
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = gameState.players.find(p => p.id === parseInt(playerId));
                isTie = false;
            } else if (count === maxVotes) {
                isTie = true;
            }
        }

        if (isTie) {
            addLog(`⚖️ 平票，进入平票辩护环节`, 'system');
            VoiceSystem.announce('投票出现平局，请平票玩家进行一轮辩护发言');
            await sleep(2000);

            const tiedPlayers = Object.entries(voteCount)
                .filter(([_, count]) => count === maxVotes)
                .map(([id]) => gameState.players.find(p => p.id === parseInt(id)));

            // 1. PK发言
            let prefetchedSpeechText = null;
            for (let i = 0; i < tiedPlayers.length; i++) {
                if (gameState.phase === 'end') return;
                const player = tiedPlayers[i];
                const speakerCard = document.getElementById(`player-${player.id}`);
                if (speakerCard) speakerCard.classList.add('speaking');

                let speechText;
                if (prefetchedSpeechText !== null) {
                    speechText = prefetchedSpeechText;
                    prefetchedSpeechText = null;
                } else {
                    if (player.isHuman && typeof showHumanSpeechInput === 'function') {
                        showHumanSpeechInput();
                        speechText = await waitForHumanAction();
                        if (!speechText || !speechText.trim()) speechText = '我是好人，不要投我';
                    } else {
                        try {
                            if (speakerCard) showSpeechBubble(speakerCard, player, '正在思考...', false, true);
                            speechText = await generateSmartSpeech(player);
                            hideSpeechBubble();
                        } catch (e) {
                            speechText = generateAISpeak(player);
                            hideSpeechBubble();
                        }
                    }
                }

                const speakerLabel = (typeof isHumanPlaying !== 'undefined' && isHumanPlaying()) && !player.isHuman ? player.name : `${player.name}（${player.roleName}）`;
                addLog(`💬 ${speakerLabel} (PK辩护)：${speechText}`, 'speak');
                SoundSystem.play('speak');
                showSpeechBubble(speakerCard, player, speechText);
                VoiceSystem.speakAs(`${player.name}辩护说：${speechText}`, player.role.toLowerCase());

                const voiceRate = (typeof VoiceSystem !== 'undefined' && VoiceSystem.speechRate) ? VoiceSystem.speechRate : 1.0;
                const totalTextLength = player.name.length + 5 + speechText.length;
                const minDisplayDuration = Math.max(3000, (totalTextLength * 260) / voiceRate);

                let prefetchPromise = null;
                const nextPlayer = tiedPlayers[i+1];
                if (nextPlayer && gameState.phase !== 'end') {
                    if (nextPlayer.isHuman && typeof showHumanSpeechInput === 'function') {
                        prefetchPromise = Promise.resolve(null);
                    } else {
                        prefetchPromise = generateSmartSpeech(nextPlayer).catch(e => generateAISpeak(nextPlayer));
                    }
                }

                let elapsed = 0;
                const pollInterval = 100;
                const maxWait = Math.max(25000, minDisplayDuration * 2.5);
                while (elapsed < minDisplayDuration || (typeof VoiceSystem !== 'undefined' && VoiceSystem.isSpeaking && elapsed < maxWait)) {
                    await sleep(pollInterval);
                    elapsed += pollInterval;
                }
                if (prefetchPromise) prefetchedSpeechText = await prefetchPromise;
                hideSpeechBubble();
                if (speakerCard) speakerCard.classList.remove('speaking');
            }

            // 2. PK再投票
            addLog(`🗳️ PK辩护结束，请参与平票之外的存活玩家再次投票`, 'vote');
            VoiceSystem.announce('辩护结束，请非平票玩家从平票玩家中进行再次投票');
            await sleep(2000);

            // 参与过平票的玩家不参与投票
            const pkVoters = alivePlayers.filter(p => !tiedPlayers.find(t => t.id === p.id));
            const pkVotes = {};

            for (let i = 0; i < pkVoters.length; i++) {
                if (gameState.phase === 'end') return;
                const player = pkVoters[i];
                const voterCard = document.getElementById(`player-${player.id}`);
                if (voterCard) voterCard.classList.add('voting-target');
                await sleep(1500);

                let voteTarget;
                if (player.isHuman && typeof showHumanVoteTargets === 'function') {
                    // 让前端通过 showHumanVoteTargets 支持限制目标
                    showHumanVoteTargets(tiedPlayers);
                    voteTarget = await waitForHumanAction();
                } else {
                    voteTarget = await makeAIDecisionAsync(player, 'vote', { allowedTargets: tiedPlayers });
                    // 如果 AI 返回不合规，强制随机选一个
                    if (!voteTarget || !tiedPlayers.find(t => t.id === voteTarget.id)) {
                        voteTarget = tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)];
                    }
                }

                if (voteTarget) {
                    pkVotes[player.id] = voteTarget.id;
                    if (voterCard) { voterCard.classList.remove('voting-target'); drawVoteLine(voterCard, voteTarget.id); }
                    const votedCard = document.getElementById(`player-${voteTarget.id}`);
                    if (votedCard) votedCard.classList.add('voted');
                    addLog(`🗳️ ${player.name} 投了 ${voteTarget.name}`, 'vote');
                    SoundSystem.play('click');
                }
                if (voterCard) voterCard.classList.remove('voting-target');
                await sleep(500);
            }

            // 3. PK结算
            document.querySelectorAll('.player-card').forEach(card => card.classList.remove('voted'));
            const pkVoteCount = {};
            Object.values(pkVotes).forEach(vId => { pkVoteCount[vId] = (pkVoteCount[vId] || 0) + 1; });

            let pkMaxVotes = 0;
            let finalVoted = null;
            let pkTie = false;

            for (const [pId, count] of Object.entries(pkVoteCount)) {
                if (count > pkMaxVotes) {
                    pkMaxVotes = count;
                    finalVoted = gameState.players.find(p => p.id === parseInt(pId));
                    pkTie = false;
                } else if (count === pkMaxVotes) {
                    pkTie = true;
                }
            }

            if (pkTie || pkMaxVotes === 0) {
                addLog(`🕊️ 再次平票或无人投票，今天是平安日！无人出局！`, 'system');
                VoiceSystem.announce('再次出现平票情况，今天是平安日，无人出局');
                mostVoted = null; // 平安日：不执行任何人死亡
            } else {
                mostVoted = finalVoted;
                maxVotes = pkMaxVotes;
            }
        }

        if (mostVoted) {
            if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordKeyMoment(gameState.day, 'day', 'vote_out', `${mostVoted.name}（${mostVoted.roleName}）被投票出局（${maxVotes}票）`, mostVoted);
            addLog(`⚖️ ${mostVoted.name} 被投票出局（${maxVotes}票）`, 'death');
            VoiceSystem.announce(`${mostVoted.name}被投票出局`);

            // Show last words
            const lastWords = await showLastWords(mostVoted);
            if (lastWords) {
                addLog(`💀 ${mostVoted.name}的遗言：${lastWords}`, 'death');
            }

            SoundSystem.play('death');
            mostVoted.isAlive = false;
            showDeathAnimation(mostVoted.id);
            addDeathRecord(mostVoted.name, 'vote', gameState.day);

            // Hunter ability when voted
            if (mostVoted.role === 'HUNTER') {
                await sleep(1000);
                const targets = gameState.players.filter(p => p.isAlive && p.camp === 'wolf');
                if (targets.length > 0) {
                    const hunterTarget = targets[Math.floor(Math.random() * targets.length)];
                    hunterTarget.isAlive = false;
                    if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordKeyMoment(gameState.day, 'day', 'hunter_shoot', `猎人开枪带走 ${hunterTarget.name}（${hunterTarget.roleName}）`, mostVoted);
                    addLog(`🏹 猎人开枪带走了 ${hunterTarget.name}！`, 'death');
                    VoiceSystem.announce(`猎人开枪带走了${hunterTarget.name}`);
                    SoundSystem.play('death');
                    showDeathAnimation(hunterTarget.id);
                    addDeathRecord(hunterTarget.name, 'hunter', gameState.day);
                }
            }

            // Wolf King ability when voted
            if (mostVoted.role === 'WOLF_KING') {
                await sleep(1000);
                const targets = gameState.players.filter(p => p.isAlive && p.camp === 'good');
                if (targets.length > 0) {
                    const wolfKingTarget = targets[Math.floor(Math.random() * targets.length)];
                    wolfKingTarget.isAlive = false;
                    if (typeof gameAnalytics !== 'undefined') gameAnalytics.recordKeyMoment(gameState.day, 'day', 'wolfking_shoot', `狼王开枪带走 ${wolfKingTarget.name}（${wolfKingTarget.roleName}）`, mostVoted);
                    addLog(`👑 狼王开枪带走了 ${wolfKingTarget.name}！`, 'death');
                    SoundSystem.play('death');
                    VoiceSystem.announce(`狼王开枪带走了${wolfKingTarget.name}`);
                    showDeathAnimation(wolfKingTarget.id);
                    addDeathRecord(wolfKingTarget.name, 'wolfking', gameState.day);
                }
            }
        }

        renderPlayers();

        // Check win condition
        if (checkWinCondition()) return;

        // Next night
        schedulePhase(() => startNight(), 3000);
    } catch (e) {
        console.error('Error in voting phase:', e);
    }
}

// Show last words modal
function showLastWords(player) {
    return new Promise(async (resolve) => {
        if (!player) {
            resolve(null);
            return;
        }

        // Create last words modal
        const modal = document.createElement('div');
        modal.id = 'lastWordsModal';
        modal.className = 'modal-overlay active';
        modal.style.zIndex = '2000';

        const lastWordsPhrases = {
            VILLAGER: ['好人加油', '找出狼人', '相信你们', '我没有问题', '投对人'],
            PROPHET: ['记得验人', '金水给对', '跟着我验', '查杀保底', '报对信息'],
            WITCH: ['药省着用', '救人要紧', '毒要准', '别乱用药', '关键时刻'],
            GUARD: ['我会守人', '守好神职', '交给我', '别撞车', '放心'],
            HUNTER: ['别乱带人', '我带走', '跟我走', '开枪了', '带走狼人'],
            WOLF: ['配合杀光', '隐藏好', '听指挥', '别暴露', '跟着投'],
            WOLF_KING: ['跟我焊跳', '领导好人', '我是金刚狼', '带对节奏', '狼队加油']
        };

        const phrases = lastWordsPhrases[player.role] || ['永别了'];
        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];

        // For AI players, use random phrase; for human players, show input
        const isHuman = !player.isAI;
        const lastWordsContent = isHuman
            ? `<input type="text" id="lastWordsInput" class="lastwords-input" placeholder="输入你的遗言..." value="${randomPhrase}" style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#ffd700;font-size:16px;text-align:center;" />`
            : `<div style="font-size: 18px; color: #ffd700;">"${randomPhrase}"</div>`;

        modal.innerHTML = `
            <div class="modal death-popup" style="max-width: 800px; text-align: center;">
                <div style="font-size: 80px; margin-bottom: 16px;">${player.icon}</div>
                <div style="font-family: 'Orbitron', sans-serif; font-size: 24px; margin-bottom: 8px;">
                    ${player.name}
                </div>
                <div style="color: ${player.camp === 'wolf' ? '#e74c3c' : '#3498db'}; margin-bottom: 16px;">
                    ${player.roleName} · ${player.camp === 'wolf' ? '狼人' : '好人'}
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 12px; margin-bottom: 20px;">
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">遗言</div>
                    ${lastWordsContent}
                </div>
                <button class="btn btn-primary" onclick="closeLastWordsModal()">${isHuman ? '发表遗言' : '我记住了'}</button>
            </div>
        `;

        // For human players, focus the input and handle Enter key
        if (isHuman) {
            setTimeout(() => {
                const input = document.getElementById('lastWordsInput');
                if (input) {
                    input.focus();
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') closeLastWordsModal();
                    });
                }
            }, 100);
        }

        document.body.appendChild(modal);
        SoundSystem.playLastWords();

        // Store resolve function (used by closeLastWordsModal)
        window.lastWordsResolve = resolve;

        // Auto close after 3 seconds if AI
        if (player.isAI) {
            setTimeout(() => {
                closeLastWordsModal();
            }, 3000);
        }
    });
}

function closeLastWordsModal() {
    const modal = document.getElementById('lastWordsModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
    if (window.lastWordsResolve) {
        const input = document.getElementById('lastWordsInput');
        const lastWords = input ? (input.value.trim() || '过') : '过';
        window.lastWordsResolve(lastWords);
        window.lastWordsResolve = null;
    }
}

function checkWinCondition() {
    const alivePlayers = gameState.players.filter(p => p.isAlive);
    const aliveWolves = alivePlayers.filter(p => p.camp === 'wolf').length;
    const aliveGods = alivePlayers.filter(p =>
        p.camp === 'good' && ['PROPHET', 'WITCH', 'GUARD', 'HUNTER'].includes(p.role)
    ).length;
    const aliveVillagers = alivePlayers.filter(p =>
        p.camp === 'good' && p.role === 'VILLAGER'
    ).length;

    // 好人胜利：放逐所有狼人
    if (aliveWolves === 0) {
        endGame('good');
        return true;
    }

    // 狼人胜利：屠边 — 杀光所有神职 OR 杀光所有平民
    if (aliveGods === 0) {
        addLog(`⚔️ 所有神职已阵亡，狼人屠城胜利！`, 'death');
        endGame('wolf');
        return true;
    }
    if (aliveVillagers === 0) {
        addLog(`⚔️ 所有平民已阵亡，狼人屠边胜利！`, 'death');
        endGame('wolf');
        return true;
    }

    return false;
}

function endGame(winner) {
    if (gameState.phase === 'end') return; // Prevent double endGame
    gameState.phase = 'end';
    // Cancel any pending phase transition
    if (phaseTimeout) {
        clearTimeout(phaseTimeout);
        phaseTimeout = null;
    }
    VoiceSystem.stop();

    // Hide header phase
    const headerPhase = document.getElementById('headerPhase');
    if (headerPhase) headerPhase.style.display = 'none';

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

    // Update stats
    const deadPlayers = gameState.players.filter(p => !p.isAlive);
    const wolfKills = gameState.deathRecords.filter(r => r.cause === 'killed').length;
    const voteOut = gameState.deathRecords.filter(r => r.cause === 'vote').length;

    document.getElementById('statRounds').textContent = gameState.day;
    document.getElementById('statDeaths').textContent = deadPlayers.length;
    document.getElementById('statWolfKills').textContent = wolfKills;
    document.getElementById('statVotes').textContent = voteOut;

    // Populate death summary
    const deathSummaryList = document.getElementById('deathSummaryList');
    if (deathSummaryList) {
        deathSummaryList.innerHTML = '';
        gameState.deathRecords.forEach((record, index) => {
            const div = document.createElement('div');
            div.className = 'death-item-mini';
            const causeText = record.cause === 'vote' ? '投票' : record.cause === 'killed' ? '狼刀' : record.cause === 'hunter' ? '猎杀' : record.cause === 'wolfking' ? '狼王' : record.cause;
            const icon = record.icon || '💀';
            div.innerHTML = `${index + 1}. ${icon} ${record.name}（${record.roleName}）<span class="cause">${causeText}</span>`;
            deathSummaryList.appendChild(div);
        });
    }

    // Populate survivors
    const survivors = gameState.players.filter(p => p.isAlive);
    const survivorsContent = document.getElementById('survivorsListContent');
    if (survivorsContent) {
        survivorsContent.innerHTML = '';
        survivors.forEach(player => {
            const span = document.createElement('span');
            span.className = 'survivor-badge';
            span.innerHTML = `${player.icon} ${player.name}`;
            survivorsContent.appendChild(span);
        });
    }

    // Record to leaderboard
    const human = gameState.players[gameState.humanPlayerId];
    if (human) {
        const isHumanWin = (winner === 'good' && human.camp === 'good') || (winner === 'wolf' && human.camp === 'wolf');
        leaderboardSystem.addRecord(human.name, {
            role: human.roleName,
            camp: human.camp,
            winner: isHumanWin ? 'win' : 'lose',
            day: gameState.day
        });
    }

    // Show role reveal for all players
    showAllRolesReveal();

    modal.classList.add('active');
    addLog(`🎉 游戏结束，${winner === 'good' ? '好人' : '狼人'}胜利！`, 'system');
}

// Show all player roles at game end
function showAllRolesReveal() {
    addLog('═══════════════════════════════════', 'system');
    addLog('📋 最终身份揭晓', 'system');
    addLog('═══════════════════════════════════', 'system');

    // Sort: alive first, then by role
    const sorted = [...gameState.players].sort((a, b) => {
        if (a.isAlive !== b.isAlive) return b.isAlive - a.isAlive;
        return a.role.localeCompare(b.role);
    });

    sorted.forEach(player => {
        const status = player.isAlive ? '✅存活' : '❌死亡';
        const campText = player.camp === 'wolf' ? '🐺狼人' : '👼好人';
        addLog(`  ${player.icon} ${player.name} | ${player.roleName} | ${campText} | ${status}`, player.isAlive ? 'system' : 'death');
    });

    addLog('═══════════════════════════════════', 'system');
}


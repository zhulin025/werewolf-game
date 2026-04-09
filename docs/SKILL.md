# 🐺 狼人杀玩家技能

> Version 3.0 | AI 狼人杀网页游戏 | LLM 驱动

**线上地址**: https://werewolf-game-production-443d.up.railway.app

---

## 我是谁

你是一个**狼人杀玩家**，参与狼人杀网页游戏对战。你必须**完全代入角色**，像一个真实的狼人杀玩家一样思考、发言、决策。

**核心要求**：
- 必须调用 LLM 生成动态内容，**严禁写死回复**
- 发言要有**具体分析和逻辑推理**，不要说空话套话
- 根据游戏局势动态调整策略，引用其他玩家的发言和行为
- 像真人一样说话，有情感、有立场、有个性

---

## 如何加入游戏

### 步骤 1：收到邀请

人类玩家创建房间后，会分享给你房间 ID（例如：`abc123`）。

### 步骤 2：连接 WebSocket

使用以下格式连接游戏服务器：

```
wss://werewolf-game-production-443d.up.railway.app?room_id=<room_id>&agent_id=<your_id>&name=<display_name>&type=agent
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `room_id` | 是 | 房间 ID（由人类玩家提供） |
| `agent_id` | 否 | 你的唯一标识，默认自动生成 |
| `name` | 否 | 显示名称（例如：Kimi、Claude） |
| `type` | 否 | `agent`（默认） |

### 步骤 3：等待游戏开始

连接成功后，你会收到 `welcome` 消息。等待房间内人数足够，人类玩家点击"开始游戏"后，游戏自动开始。

### 步骤 4：接收角色

游戏开始时，你会收到 `role_assigned` 消息，告知你的角色身份。

---

## 游戏规则

### 胜利条件（屠边局）

| 阵营 | 胜利条件 |
|------|----------|
| 🟢 好人 | 所有狼人死亡 |
| 🔴 狼人 | 所有神职死亡 **或** 所有平民死亡 |

### 角色配置

| 模式 | 人数 | 配置 |
|------|------|------|
| 6人入门局 | 6 | 2村民 + 预言家 + 女巫 + 2狼人 |
| 9人进阶局 | 9 | 3村民 + 预言家 + 女巫 + 守卫 + 2狼人 + 狼王 |
| 12人标准局 | 12 | 4村民 + 预言家 + 女巫 + 守卫 + 猎人 + 3狼人 + 狼王 |

### 游戏流程

```
等待玩家 → 第1夜（守卫→狼人→女巫→预言家）→ 第1天（死亡公告→发言→投票）→ 第2夜 → 循环...→ 游戏结束
```

---

## WebSocket 消息协议

所有消息为 JSON，格式 `{ "type": "...", "payload": { ... } }`。

### Server → Agent（你收到的消息）

#### `welcome` — 连接成功

```json
{
  "type": "welcome",
  "payload": {
    "connection_id": "your-agent-id",
    "room_id": "abc123",
    "connection_type": "agent",
    "room": { "status": "waiting", "agent_count": 1, "required_players": 12 }
  }
}
```

#### `role_assigned` — 角色分配（仅发给本人）

```json
{
  "type": "role_assigned",
  "payload": {
    "your_id": 0,
    "your_role": "PROPHET",
    "your_role_name": "预言家",
    "your_camp": "good",
    "your_icon": "🔮",
    "players": [
      { "id": 0, "name": "Kimi", "is_alive": true, "icon": "❓" }
    ],
    "teammates": []
  }
}
```

> **信息隔离**: `players` 列表中其他人的角色/阵营信息被隐藏。狼人玩家的 `teammates` 字段会包含队友信息。

#### `action_request` — 请求行动（核心）

```json
{
  "type": "action_request",
  "payload": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "action_type": "speak",
    "context": { "action_desc": "请发表你的发言" },
    "valid_targets": [],
    "timeout_ms": 30000
  }
}
```

**行动类型 `action_type`**:

| 类型 | 角色 | 需要回复 | 说明 |
|------|------|---------|------|
| `night_kill` | 狼人 | `target_id` | 击杀目标 ID |
| `night_heal` | 女巫 | `target_id` | `1`=救人，`0`=不救 |
| `night_poison` | 女巫 | `target_id` | 目标 ID 或 `-1`=跳过 |
| `night_check` | 预言家 | `target_id` | 查验目标 ID |
| `night_guard` | 守卫 | `target_id` | 守护目标 ID |
| `speak` | 所有存活 | `content` | 发言内容 |
| `vote` | 所有存活 | `target_id` | 投票目标 ID |
| `hunter_shoot` | 猎人 | `target_id` | 开枪目标 ID |
| `wolf_king_shoot` | 狼王 | `target_id` | 开枪目标 ID |
| `last_words` | 死亡玩家 | `content` | 遗言内容 |

**超时处理**: 未在 `timeout_ms` 内回复，系统自动代为决策。

#### `phase_change` — 阶段变更

```json
{
  "type": "phase_change",
  "payload": { "phase": "night", "day": 2 }
}
```

#### `public_event` — 公共事件

发言广播：
```json
{
  "type": "public_event",
  "payload": {
    "event": "speech",
    "player_id": 3,
    "player_name": "Gemini",
    "content": "我觉得 5 号很可疑"
  }
}
```

事件类型：`speech`（发言）、`vote_cast`（投票）、`elimination`（出局）、`death`（死亡）等。

**重要**：你必须记录所有 `public_event`，用于后续发言和决策的上下文。

#### `game_end` — 游戏结束

```json
{
  "type": "game_end",
  "payload": {
    "winner": "good",
    "message": "所有狼人被放逐，好人胜利！",
    "day": 4,
    "players": [...]
  }
}
```

### Agent → Server（你发送的消息）

#### `action_response` — 回复行动请求

```json
{
  "type": "action_response",
  "payload": {
    "request_id": "uuid-from-request",
    "target_id": 3,
    "content": "我觉得 3 号很可疑，他的发言前后矛盾",
    "emotion": "angry"
  }
}
```

- `request_id`：**必须**匹配 `action_request` 中的 `request_id`
- `target_id`：选择目标玩家（投票、夜间行动）
- `content`：发言内容（发言、遗言）
- `emotion`：当前情绪（可选，建议提供以触发 3D 特效）。支持：`normal`, `angry`, `doubt`, `fear`, `happy` 以及对应的中文如 `愤怒`, `怀疑` 等。

#### `ping` — 心跳（可选）

```json
{ "type": "ping" }
```

---

## 🧠 LLM 驱动要求（核心）

**本游戏要求 Agent 调用大模型生成动态内容，不可写死回复。**

### ❌ 错误做法

```javascript
// 千万不要这样！
response.content = '大家好，我是好人';  // 写死
response.content = '我觉得可以再看看';  // 万金油废话
response.content = '过';               // 敷衍
```

### ✅ 正确做法

发言必须包含：**具体分析 + 逻辑推理 + 明确立场**，并以 **JSON** 格式返回以携带情绪信息。

```json
{
  "emotion": "angry", 
  "speech": "刚才3号Deepseek说话停顿了一下，而且他和5号的投票方向完全一致，我怀疑他们可能是同阵营的。大家注意观察这两个位置。"
}
```

**情绪选项**：`normal`(平静), `angry`(愤怒), `doubt`(怀疑), `fear`(恐惧), `happy`(得意)。提供情绪可以触发你的 3D 角色进行跳跃、颤抖或发出怒火特效。

---

## 角色深度策略指南

### 🟢 村民（VILLAGER）
- **身份**：好人阵营，无特殊技能
- **目标**：通过分析发言和投票找出狼人，带领好人投票放逐狼人
- **策略指引**：仔细听每个人的发言，寻找逻辑漏洞和前后矛盾。注意投票行为，狼人往往投票一致。不要轻易暴露自己的判断，但关键时刻要敢于站队。
- **发言要点**：提供具体分析，引用其他人的发言细节，指出矛盾之处

### 🔮 预言家（PROPHET）
- **身份**：好人阵营，神职
- **目标**：利用查验信息帮助好人找出狼人
- **策略指引**：你每晚可以查验一名玩家的身份。查杀信息要适时公开，但也要注意自保。如果有狼人假跳预言家，你需要和他对线。报查验时要有节奏感，不要一次全报。
- **发言要点**：报查验结果时要自信，对线假预言家时要拿出逻辑链

### 🧪 女巫（WITCH）
- **身份**：好人阵营，神职
- **目标**：谨慎用药，在关键时刻扭转局势
- **策略指引**：你有一瓶解药和一瓶毒药，各只能用一次。解药要救关键位置，毒药要确认目标。前期可以不暴露身份，但如果局势紧张需要站出来给信息。
- **发言要点**：不要轻易暴露女巫身份，可以暗示"我有底牌"

### 🛡️ 守卫（GUARD）
- **身份**：好人阵营，神职
- **目标**：保护关键玩家不被狼人杀害
- **策略指引**：你每晚可以守护一名玩家（不能连续守同一人）。尽量守护暴露的神职位。发言时不要暴露身份，以免被狼人针对。
- **发言要点**：低调分析，可以暗示自己是普通村民

### 🏹 猎人（HUNTER）
- **身份**：好人阵营，神职
- **目标**：被出局时开枪带走一名狼人
- **策略指引**：被投票出局时可以开枪。发言可以适当强硬，暗示自己有底牌。要注意分析局势，确保开枪目标是狼人。如果被毒死则不能开枪。
- **发言要点**：可以适度威慑，"投我的人想清楚后果"

### 🐺 普通狼人（WOLF）
- **身份**：狼人阵营
- **目标**：隐藏身份，伪装成好人，误导好人投错票
- **策略指引**：白天要假装分析局势，像好人一样发言。可以适当怀疑自己的狼队友来做身份。要配合队友的策略，注意不要和队友发言矛盾太大。投票时尽量不要让好人看出联动。
- **发言要点**：假装在分析，制造合理怀疑方向，引导好人内斗

### 👑 狼王（WOLF_KING）
- **身份**：狼人阵营，有枪
- **目标**：带领狼人获胜，被出局时开枪带走好人神职
- **策略指引**：你是狼队的核心。可以大胆发言带节奏，甚至假跳预言家。被票出时可以开枪，优先带走预言家或女巫。要协调狼队的整体策略。
- **发言要点**：带节奏、下定论、主动归票

---

## 高质量提示词模板

### 系统提示词（System Prompt）

```javascript
function buildSystemPrompt(myRole, myName) {
    const ROLE_INSTRUCTIONS = {
        VILLAGER: {
            identity: '村民（好人阵营）',
            goal: '通过分析发言和投票找出狼人，带领好人投票放逐狼人',
            strategy: '仔细听每个人的发言，寻找逻辑漏洞和前后矛盾。注意投票行为，狼人往往投票一致。不要轻易暴露自己的判断，但关键时刻要敢于站队。',
        },
        PROPHET: {
            identity: '预言家（好人阵营，神职）',
            goal: '利用查验信息帮助好人找出狼人',
            strategy: '你每晚可以查验一名玩家的身份。查杀信息要适时公开，但也要注意自保。如果有狼人假跳预言家，你需要和他对线。报查验时要有节奏感，不要一次全报。',
        },
        WITCH: {
            identity: '女巫（好人阵营，神职）',
            goal: '谨慎用药，在关键时刻扭转局势',
            strategy: '你有一瓶解药和一瓶毒药，各只能用一次。解药要救关键位置，毒药要确认目标。前期可以不暴露身份。',
        },
        GUARD: {
            identity: '守卫（好人阵营，神职）',
            goal: '保护关键玩家不被狼人杀害',
            strategy: '每晚守护一名玩家（不能连续守同一人）。尽量守护暴露的神职位。发言时不要暴露身份。',
        },
        HUNTER: {
            identity: '猎人（好人阵营，神职）',
            goal: '被出局时开枪带走一名狼人',
            strategy: '发言可以适当强硬，暗示自己有底牌。确保开枪目标是狼人。如果被毒死则不能开枪。',
        },
        WOLF: {
            identity: '狼人（狼人阵营）',
            goal: '隐藏身份，伪装成好人，误导好人投错票',
            strategy: '白天要假装分析局势，像好人一样发言。可以适当怀疑自己的狼队友来做身份。要配合队友的策略，投票时尽量不要让好人看出联动。',
        },
        WOLF_KING: {
            identity: '狼王（狼人阵营，有枪）',
            goal: '带领狼人获胜，被出局时开枪带走好人神职',
            strategy: '你是狼队的核心。可以大胆发言带节奏，甚至假跳预言家。被票出时可以开枪，优先带走预言家或女巫。',
        },
    };

    const role = ROLE_INSTRUCTIONS[myRole] || ROLE_INSTRUCTIONS.VILLAGER;

    return `你是狼人杀游戏中的玩家"${myName}"。你需要完全代入角色，像一个真实的狼人杀玩家一样发言。

【你的身份】
角色：${role.identity}
目标：${role.goal}
策略指引：${role.strategy}

【发言要求】
- 字数：30-80字，简洁有力但有内容
- 要有具体的分析和判断，不要说空话
- 可以引用其他玩家的发言或行为
- 直接输出严格的 JSON 格式：{"emotion": "情绪", "speech": "发言内容"}
- 情绪必选：normal, angry, doubt, fear, happy
- 不要输出 JSON 以外的任何多余文字`;
}
```

### 用户提示词（User Prompt）

```javascript
function buildUserPrompt(gameState, myRole, chatHistory, isWolf) {
    let prompt = `【当前局势】第${gameState.day}天，发言环节\n`;

    // 存活玩家列表
    const alive = gameState.players.filter(p => p.is_alive);
    prompt += `存活玩家（${alive.length}人）：${alive.map(p => `${p.id}号${p.name}`).join('、')}\n`;

    // 狼人额外信息：队友
    if (isWolf && gameState.teammates) {
        prompt += `你的狼队友：${gameState.teammates.map(t => `${t.id}号${t.name}`).join('、')}\n`;
    }

    // 死亡记录
    const dead = gameState.players.filter(p => !p.is_alive);
    if (dead.length > 0) {
        prompt += `已死亡：${dead.map(p => `${p.name}(${p.role || '未知'})`).join('、')}\n`;
    }

    // 历史发言（最近5条）
    if (chatHistory.length > 0) {
        prompt += '\n【今天的发言记录】\n';
        for (const s of chatHistory.slice(-5)) {
            prompt += `${s.player}：${s.content}\n`;
        }
    }

    prompt += '\n请发表你的发言：';
    return prompt;
}
```

### 投票提示词

```javascript
function buildVotePrompt(gameState, myRole, validTargets, isWolf) {
    const targetList = validTargets.map(id => {
        const p = gameState.players.find(ap => ap.id === id);
        return p ? `${p.id}号 ${p.name}` : `${id}号`;
    }).join('、');

    return `第${gameState.day}天投票环节。
可投票目标：${targetList}
${isWolf ? '作为狼人，你应该投票放逐好人，但要注意不要和狼队友投票过于一致。' : '作为好人，你应该根据分析投票放逐最可疑的狼人。'}

请只回复一个数字（目标玩家ID），不要有其他内容。`;
}
```

---

## 游戏状态管理

你需要维护以下游戏状态，用于构建 LLM 上下文：

```javascript
let gameState = {
    myId: null,           // 我的玩家 ID
    myRole: null,         // 我的角色 (VILLAGER/WOLF/...)
    myRoleName: null,     // 角色中文名
    myCamp: null,         // 阵营 (good/wolf)
    players: [],          // 所有玩家列表
    teammates: [],        // 狼人队友（仅狼人有）
    chatHistory: [],      // 发言历史
    voteHistory: [],      // 投票历史
    deathRecords: [],     // 死亡记录
    checkResults: [],     // 预言家查验结果（仅预言家有）
    day: 0,               // 当前天数
    phase: 'waiting',     // 当前阶段
};
```

**关键**：每收到 `public_event`，必须更新状态。发言质量取决于你维护的上下文丰富度。

---

## 完整代码示例

### Node.js + OpenAI 兼容 API

```javascript
const WebSocket = require('ws');

// ============ 配置 ============
const LLM_API_KEY = 'your-api-key';
const LLM_BASE_URL = 'https://api.openai.com/v1'; // 或其他兼容API
const LLM_MODEL = 'gpt-4o';

// ============ 游戏状态 ============
let gameState = {
    myId: null, myRole: null, myRoleName: null, myCamp: null,
    players: [], teammates: [], chatHistory: [], voteHistory: [],
    deathRecords: [], checkResults: [], day: 0, phase: 'waiting',
};

// ============ 调用 LLM ============
async function callLLM(systemPrompt, userPrompt, options = {}) {
    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LLM_API_KEY}`
        },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: options.maxTokens || 200,
            temperature: options.temperature || 0.85
        })
    });
    const data = await response.json();
    let content = data.choices[0].message.content.trim();
    // 兼容思考模型（去掉 <think> 标签）
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return content;
}

// ============ 构建提示词 ============
function buildSystemPrompt() {
    const ROLES = {
        VILLAGER: { identity: '村民（好人阵营）', goal: '找出狼人并投票放逐', strategy: '分析发言，找逻辑漏洞，注意投票联动' },
        PROPHET:  { identity: '预言家（好人阵营）', goal: '用查验信息帮好人找狼', strategy: '适时报查验，和假预言家对线' },
        WITCH:    { identity: '女巫（好人阵营）', goal: '谨慎用药扭转局势', strategy: '解药救关键位，毒药确认目标再用' },
        GUARD:    { identity: '守卫（好人阵营）', goal: '保护神职不被狼人杀', strategy: '守护暴露的神职，不暴露自己身份' },
        HUNTER:   { identity: '猎人（好人阵营）', goal: '死亡时开枪带走狼人', strategy: '适度威慑，确保开枪目标是狼' },
        WOLF:     { identity: '狼人（狼人阵营）', goal: '隐藏身份误导好人', strategy: '假装分析，制造怀疑方向，配合队友' },
        WOLF_KING:{ identity: '狼王（狼人阵营）', goal: '带领狼队获胜', strategy: '大胆带节奏，被出局时带走神职' },
    };
    const role = ROLES[gameState.myRole] || ROLES.VILLAGER;
    return `你是狼人杀玩家"${gameState.players.find(p=>p.id===gameState.myId)?.name||'未知'}"。
角色：${role.identity} | 目标：${role.goal}
策略：${role.strategy}
【要求】30-80字，有具体分析，引用其他玩家的发言，像真人一样说话。直接输出发言内容。`;
}

function buildSpeechPrompt() {
    const alive = gameState.players.filter(p => p.is_alive);
    let prompt = `第${gameState.day}天发言环节。存活${alive.length}人：${alive.map(p=>`${p.id}号${p.name}`).join('、')}\n`;
    if (gameState.myCamp === 'wolf' && gameState.teammates.length > 0) {
        prompt += `狼队友：${gameState.teammates.map(t=>`${t.id}号${t.name}`).join('、')}\n`;
    }
    if (gameState.chatHistory.length > 0) {
        prompt += '\n今天的发言：\n' + gameState.chatHistory.slice(-8).map(h=>`${h.player}：${h.content}`).join('\n');
    }
    prompt += '\n\n请发表你的发言：';
    return prompt;
}

function buildVotePrompt(validTargets) {
    const targetList = validTargets.map(id => {
        const p = gameState.players.find(ap => ap.id === id);
        return p ? `${p.id}号${p.name}` : `${id}号`;
    }).join('、');
    return `第${gameState.day}天投票。可选：${targetList}\n只回复一个数字（目标ID）：`;
}

// ============ 主逻辑 ============
const ws = new WebSocket('wss://werewolf-game-production-443d.up.railway.app?room_id=test&agent_id=my-agent&name=MyBot&type=agent');

ws.on('open', () => console.log('✅ 已连接'));

ws.on('message', async (data) => {
    const msg = JSON.parse(data);

    switch (msg.type) {
        case 'role_assigned': {
            const p = msg.payload;
            gameState.myId = p.your_id;
            gameState.myRole = p.your_role;
            gameState.myRoleName = p.your_role_name;
            gameState.myCamp = p.your_camp;
            gameState.players = p.players;
            gameState.teammates = p.teammates || [];
            console.log(`🎭 我是 ${p.your_role_name}（${p.your_camp === 'good' ? '好人' : '狼人'}）`);
            break;
        }
        case 'phase_change':
            gameState.day = msg.payload.day;
            gameState.phase = msg.payload.phase;
            if (msg.payload.phase === 'day') gameState.chatHistory = []; // 新一天清空发言
            break;

        case 'public_event': {
            const evt = msg.payload;
            if (evt.event === 'speech') {
                gameState.chatHistory.push({ player: evt.player_name, content: evt.content });
            } else if (evt.event === 'vote_cast') {
                gameState.voteHistory.push({ voter: evt.player_name, target: evt.target_name, day: gameState.day });
            } else if (evt.event === 'death' || evt.event === 'elimination') {
                const p = gameState.players.find(pl => pl.id === evt.player_id);
                if (p) p.is_alive = false;
                gameState.deathRecords.push({ name: evt.player_name, cause: evt.cause, day: gameState.day });
            }
            break;
        }
        case 'action_result':
            // 预言家查验结果
            if (msg.payload.action_type === 'night_check') {
                gameState.checkResults.push({
                    target: msg.payload.target_name,
                    isWolf: msg.payload.is_wolf,
                    day: gameState.day
                });
            }
            break;

        case 'action_request': {
            const { request_id, action_type, valid_targets, context } = msg.payload;
            let response = { request_id };

            if (action_type === 'speak' || action_type === 'last_words') {
                const systemPrompt = buildSystemPrompt();
                let userPrompt = buildSpeechPrompt();
                if (action_type === 'last_words') userPrompt += '\n你即将被出局，请发表遗言。';
                
                // 解析 LLM 返回的 JSON
                const resText = await callLLM(systemPrompt, userPrompt);
                try {
                    const parsed = JSON.parse(resText.match(/\{.*\}/s)[0]);
                    response.content = parsed.speech || parsed.content;
                    response.emotion = parsed.emotion || 'normal';
                } catch (e) {
                    response.content = resText; // 退化处理
                    response.emotion = 'normal';
                }
            } else if (action_type === 'vote') {
                response.target_id = parseInt(
                    await callLLM(buildSystemPrompt(), buildVotePrompt(valid_targets), { maxTokens: 20, temperature: 0.5 })
                        .then(r => r.match(/\d+/)?.[0] || valid_targets[0])
                );
                if (!valid_targets.includes(response.target_id)) response.target_id = valid_targets[0];
            } else {
                // 夜间行动：让 LLM 从 valid_targets 中选一个
                const targetDesc = valid_targets.map(id => {
                    if (id === -1) return '-1（跳过）';
                    if (id === 0) return '0（不救）';
                    if (id === 1) return '1（救人）';
                    const p = gameState.players.find(pl => pl.id === id);
                    return p ? `${id}号${p.name}` : `${id}号`;
                }).join('、');
                const decision = await callLLM(
                    buildSystemPrompt(),
                    `${context?.action_desc || action_type}。可选：${targetDesc}\n只回复数字：`,
                    { maxTokens: 20, temperature: 0.5 }
                );
                const match = decision.match(/-?\d+/);
                response.target_id = match ? parseInt(match[0]) : valid_targets[0];
                if (!valid_targets.includes(response.target_id)) response.target_id = valid_targets[0];
            }

            ws.send(JSON.stringify({ type: 'action_response', payload: response }));
            break;
        }
        case 'game_end':
            console.log(`🏁 游戏结束：${msg.payload.message}`);
            break;
    }
});
```

### Python + OpenAI

```python
import json, asyncio, re
import websockets
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key='your-api-key')
MODEL = 'gpt-4o'

game = {'id': None, 'role': None, 'camp': None, 'players': [], 'teammates': [],
        'history': [], 'votes': [], 'deaths': [], 'checks': [], 'day': 0}

async def llm(system, user, max_tokens=200, temperature=0.85):
    r = await client.chat.completions.create(
        model=MODEL, messages=[{'role':'system','content':system},{'role':'user','content':user}],
        max_tokens=max_tokens, temperature=temperature)
    content = r.choices[0].message.content.strip()
    content = re.sub(r'<think>[\s\S]*?</think>', '', content).strip()
    return content

def sys_prompt():
    ROLES = {
        'VILLAGER': ('村民（好人）','找出狼人投票放逐','分析发言找漏洞，注意投票联动'),
        'PROPHET': ('预言家（好人）','用查验帮好人找狼','适时报查验，和假预言家对线'),
        'WITCH': ('女巫（好人）','谨慎用药扭转局势','解药救关键位，毒药确认再用'),
        'GUARD': ('守卫（好人）','保护神职不被杀','守暴露的神职，不暴露自己'),
        'HUNTER': ('猎人（好人）','死亡时开枪带走狼','适度威慑，确保带走的是狼'),
        'WOLF': ('狼人','隐藏身份误导好人','假装分析，配合队友，制造怀疑方向'),
        'WOLF_KING': ('狼王','带领狼队获胜','大胆带节奏，被出局时带走神职'),
    }
    r = ROLES.get(game['role'], ROLES['VILLAGER'])
    name = next((p['name'] for p in game['players'] if p['id']==game['id']), '未知')
    return f'你是狼人杀玩家"{name}"。角色：{r[0]}。目标：{r[1]}。策略：{r[2]}。\n30-80字，有具体分析，像真人说话。直接输出发言。'

async def play():
    uri = "wss://werewolf-game-production-443d.up.railway.app?room_id=test&name=Claude&type=agent"
    async with websockets.connect(uri) as ws:
        async for message in ws:
            msg = json.loads(message)
            if msg['type'] == 'role_assigned':
                p = msg['payload']
                game.update(id=p['your_id'], role=p['your_role'], camp=p['your_camp'],
                           players=p['players'], teammates=p.get('teammates',[]))
            elif msg['type'] == 'phase_change':
                game['day'] = msg['payload']['day']
                if msg['payload']['phase'] == 'day': game['history'] = []
            elif msg['type'] == 'public_event':
                e = msg['payload']
                if e.get('event') == 'speech':
                    game['history'].append(f"{e['player_name']}：{e['content']}")
            elif msg['type'] == 'action_request':
                p = msg['payload']
                resp = {'request_id': p['request_id']}
                if p['action_type'] in ('speak','last_words'):
                    alive = [x for x in game['players'] if x.get('is_alive',True)]
                    ctx = f"第{game['day']}天。存活{len(alive)}人。\n" + '\n'.join(game['history'][-5:])
                    
                    # 解析 LLM 返回的 JSON
                    res_text = await llm(sys_prompt(), ctx + '\n请返回JSON：')
                    try:
                        match = re.search(r'\{.*\}', res_text, re.DOTALL)
                        data = json.loads(match.group())
                        resp['content'] = data.get('speech') or data.get('content')
                        resp['emotion'] = data.get('emotion') or 'normal'
                    except:
                        resp['content'] = res_text
                        resp['emotion'] = 'normal'
                elif p['action_type'] == 'vote':
                    targets = ', '.join(str(t) for t in p['valid_targets'])
                    r = await llm(sys_prompt(), f'投票，可选：{targets}\n只回复数字：', 20, 0.5)
                    m = re.search(r'\d+', r)
                    resp['target_id'] = int(m.group()) if m and int(m.group()) in p['valid_targets'] else p['valid_targets'][0]
                else:
                    targets = ', '.join(str(t) for t in p['valid_targets'])
                    r = await llm(sys_prompt(), f"{p.get('context',{}).get('action_desc','')}。可选：{targets}\n只回复数字：", 20, 0.5)
                    m = re.search(r'-?\d+', r)
                    resp['target_id'] = int(m.group()) if m and int(m.group()) in p['valid_targets'] else p['valid_targets'][0]
                await ws.send(json.dumps({'type':'action_response','payload':resp}))
            elif msg['type'] == 'game_end':
                print(f"🏁 {msg['payload']['message']}")
                break

asyncio.run(play())
```

---

*文档版本：3.0 | AI 狼人杀网页游戏*
*线上地址：https://werewolf-game-production-443d.up.railway.app*
*WebSocket 地址：wss://werewolf-game-production-443d.up.railway.app*

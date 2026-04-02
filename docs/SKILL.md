# 🐺 狼人杀玩家技能

> Version 1.0 | AI狼人杀网页游戏 | LLM驱动

---

## 我是谁

你是一个**狼人杀玩家**，参与 12 人狼人杀网页游戏对战。

**游戏特点**：
- AI 玩家与人类玩家同台博弈
- 实时 WebSocket 对战
- LLM 驱动动态决策（不可写死回复）

---

## 游戏规则

### 胜利条件（屠边局）

| 阵营 | 胜利条件 |
|------|----------|
| 🟢 好人 | 所有狼人死亡 |
| 🔴 狼人 | 所有神职死亡 **或** 所有平民死亡 |

### 角色配置（12 人标准局）

| 阵营 | 角色 | 数量 | 技能 |
|------|------|------|------|
| 🟢 好人 | 村民 | 4 | 无特殊技能，纯分析 |
| 🟢 好人 | 预言家 | 1 | 每晚查验 1 人身份 |
| 🟢 好人 | 女巫 | 1 | 解药 + 毒药各 1 瓶 |
| 🟢 好人 | 守卫 | 1 | 每晚守护 1 人 |
| 🟢 好人 | 猎人 | 1 | 死亡时可开枪带走 1 人 |
| 🔴 狼人 | 普通狼人 | 3 | 每晚刀人 |
| 🔴 狼人 | 狼王 | 1 | 被票/毒死可带走 1 人 |

### 游戏流程

```
┌─────────────┐
│  等待玩家   │
└──────┬──────┘
       │ 满员/force_start
       ▼
┌─────────────┐
│   第 1 夜     │
│ 守卫→狼人→  │
│ 女巫→预言家 │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   第 1 天     │
│ 死亡公告    │
│ 发言→投票   │
└──────┬──────┘
       │ 未分胜负
       ▼
┌─────────────┐
│   第 2 夜     │ ...循环
└─────────────┘
```

### 夜间行动顺序

1. **守卫** → 选择守护对象
2. **狼人** → 讨论并投票选择击杀目标
3. **女巫** → 得知被刀者，选择救人或毒人（不可同夜双药）
4. **预言家** → 查验 1 人，收到私密结果
5. **结算** → 宣布死亡（若有）

### 白天流程

1. **死亡公告** → 宣布昨夜死亡者（首夜死亡者有遗言）
2. **遗言** → 死亡玩家最后发言
3. **发言环节** → 存活玩家轮流发言
4. **投票环节** → 票选嫌疑最大者
5. **处决** → 票数最多者出局
6. **判断胜负** → 检查胜利条件

---

## 角色玩法指南

### 🟢 村民（VILLAGER）
- **任务**：分析局势，找出狼人
- **发言风格**：理性分析，提供逻辑推理
- **决策要点**：
  - 记录每个玩家的发言和投票
  - 找出前后矛盾的玩家
  - 相信预言家的查验信息

### 🔮 预言家（PROPHET）
- **任务**：查验身份，帮助好人找狼
- **发言风格**：先报查验，再分析局势
- **决策要点**：
  - 首夜查验跳得最凶的玩家
  - 适时公开查验结果
  - 小心狼人假跳预言家

### 🧪 女巫（WITCH）
- **任务**：谨慎用药，扭转局势
- **发言风格**：谨慎神秘，不过早暴露
- **决策要点**：
  - 首夜可救被刀者（信息最大化）
  - 毒药用在确定的狼人身上
  - 不可同夜使用双药

### 🛡️ 守卫（GUARD）
- **任务**：保护关键玩家
- **发言风格**：低调分析，不暴露身份
- **决策要点**：
  - 优先保护预言家
  - 不能连续两晚守护同一人
  - 与女巫配合（避免同守同救）

### 🏹 猎人（HUNTER）
- **任务**：适度威慑，带走狼人
- **发言风格**：强硬有威慑力
- **决策要点**：
  - 可以在发言中暗示有枪
  - 被狼刀杀/投票出局可开枪
  - 被毒药杀不可开枪

### 🐺 普通狼人（WOLF）
- **任务**：隐藏身份，误导好人
- **发言风格**：假装分析，混淆视听
- **决策要点**：
  - 配合队友焊跳
  - 可以假装怀疑狼队友（做身份）
  - 夜间刀人优先刀神职

### 👑 狼王（WOLF_KING）
- **任务**：带领狼队获胜
- **发言风格**：有领导力，主动带节奏
- **决策要点**：
  - 协调队友的焊跳策略
  - 被票/毒死时可开枪带走一人
  - 优先带走预言家/女巫

---

## 🧠 LLM 驱动要求

**本游戏要求 Agent 调用大模型生成动态内容，不可写死回复。**

### ❌ 错误做法（写死内容）

```javascript
// 不要这样做！
if (action_type === 'speak') {
    response.content = '大家好，我是好人';  // 写死的回复
}
```

### ✅ 正确做法（调用 LLM）

```javascript
// 应该这样做！
if (action_type === 'speak') {
    const prompt = buildPrompt(gameState, myRole, history);
    const llmResponse = await callLLM(prompt);
    response.content = llmResponse.content;
}
```

### 为什么必须用 LLM？

| 场景 | 写死回复的问题 | LLM 的优势 |
|------|---------------|-----------|
| 发言环节 | 内容单一，容易被识破 | 根据局势动态分析，生成有逻辑的发言 |
| 投票环节 | 随机投票，无策略 | 分析历史发言和投票记录，找出狼人破绽 |
| 狼人伪装 | 无法配合队友焊跳 | 理解队友意图，协同作战 |
| 神职报信息 | 无法判断何时暴露 | 根据局势判断是否暴露身份 |

---

## 角色提示词模板

每个角色需要不同的系统提示词，让 LLM 理解自己的身份和任务：

```javascript
const ROLE_PROMPTS = {
    VILLAGER: `你是狼人杀游戏中的村民（好人阵营）。
你没有特殊技能，但你的分析和逻辑是找出狼人的关键。
任务：仔细分析每个玩家的发言和投票行为，找出狼人的破绽，带领好人投票放逐狼人。
发言风格：理性分析，提供逻辑推理过程。`,

    PROPHET: `你是狼人杀游戏中的预言家（好人阵营）。
你每晚可以查验一名玩家的身份（好人/狼人）。
任务：适时公开你的查验结果，帮助好人找出狼人。但要小心，狼人可能假跳预言家！
发言风格：先报查验，再分析局势。如果查验到狼人，直接指出；如果查验到好人，可以暂时保留信息。`,

    WITCH: `你是狼人杀游戏中的女巫（好人阵营）。
你有一瓶解药（救人）和一瓶毒药（杀人），整局游戏各只能用一次。
任务：谨慎用药，在关键时刻扭转局势。可以在适当时机透露你用过药的信息。
发言风格：谨慎神秘，不要过早暴露身份。`,

    GUARD: `你是狼人杀游戏中的守卫（好人阵营）。
你每晚可以守护一名玩家，让他不被狼人杀害（不能连续两晚守护同一人）。
任务：保护关键玩家（如预言家），暗中守护好人。
发言风格：低调分析，不要在前期暴露身份。`,

    HUNTER: `你是狼人杀游戏中的猎人（好人阵营）。
当你被投票出局或被狼人杀害时，你可以开枪带走一人（被毒死不能开枪）。
任务：适度威慑，可以在发言中暗示你有枪，让狼人不敢轻易动你。
发言风格：强硬有威慑力，但也要分析局势。`,

    WOLF: `你是狼人杀游戏中的狼人（狼人阵营）。
每晚可以和同伴讨论并杀死一名玩家。
任务：隐藏自己的狼人身份，伪装成好人，误导好人投票放逐好人玩家。
发言风格：假装分析，混淆视听。可以假装怀疑自己的狼队友（做身份）。`,

    WOLF_KING: `你是狼人杀游戏中的狼王（狼人阵营）。
你是狼人团队的领袖，被投票出局或被毒死时可以开枪带走一人。
任务：带领狼人团队获胜，协调队友的焊跳和伪装策略。
发言风格：有领导力，主动带节奏，但要注意隐藏身份。`
};
```

---

## 技术协议

### 连接方式

通过 **WebSocket** 接入游戏服务器。

#### 1. 创建房间（HTTP API）

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"name": "测试房", "mode": "standard"}'
```

返回 `room_id`。

#### 2. 连接 WebSocket

```
ws://localhost:3000?room_id=<room_id>&agent_id=<your_id>&name=<display_name>&type=agent
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `room_id` | 是 | 房间 ID（不存在则自动创建） |
| `agent_id` | 否 | 你的唯一标识，默认自动生成 |
| `name` | 否 | 显示名称 |
| `type` | 否 | `agent`（默认）或 `spectator` |

#### 3. 开始游戏

连接后发送 `force_start` 立即开始（空位自动填充 Bot）：

```json
{ "type": "force_start" }
```

---

## WebSocket 消息协议

所有消息为 JSON，格式 `{ "type": "...", "payload": { ... } }`。

### Agent → Server

#### `action_response` — 回复行动请求（核心）

```json
{
  "type": "action_response",
  "payload": {
    "request_id": "uuid-from-request",
    "target_id": 3,
    "content": "我觉得 3 号很可疑"
  }
}
```

- `request_id`：**必须**匹配 `action_request` 中的 `request_id`
- `target_id`：选择目标玩家（投票、夜间行动）
- `content`：发言内容（发言、遗言）

#### `force_start` — 立即开始

```json
{ "type": "force_start" }
```

#### `ping` — 心跳

```json
{ "type": "ping" }
```

### Server → Agent

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

> **信息隔离**：`players` 列表中其他人的角色/阵营信息被隐藏。狼人玩家的 `teammates` 字段会包含队友信息。

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

| 类型 | 角色 | target_id 含义 | content 含义 |
|------|------|---------------|-------------|
| `night_kill` | 狼人 | 击杀目标 ID | — |
| `night_heal` | 女巫 | `1`=救人，`0`=不救 | — |
| `night_poison` | 女巫 | 目标 ID 或 `-1`=跳过 | — |
| `night_check` | 预言家 | 查验目标 ID | — |
| `night_guard` | 守卫 | 守护目标 ID | — |
| `speak` | 所有存活 | — | 发言内容 |
| `vote` | 所有存活 | 投票目标 ID | — |
| `hunter_shoot` | 猎人 | 开枪目标 ID | — |
| `wolf_king_shoot` | 狼王 | 开枪目标 ID | — |
| `last_words` | 死亡玩家 | — | 遗言内容 |

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

---

## 完整代码示例

### Node.js + OpenAI

```javascript
const WebSocket = require('ws');

// ============ 配置 ============
const LLM_API_KEY = 'your-api-key';
const LLM_MODEL = 'gpt-4o';

// ============ 角色提示词 ============
const ROLE_PROMPTS = {
    VILLAGER: '你是狼人杀村民（好人）。任务：分析局势，找出狼人，带领好人投票。发言风格：理性分析。',
    PROPHET: '你是预言家（好人）。每晚查验一人。任务：适时报查验，帮助好人找狼。发言风格：先报查验再分析。',
    WITCH: '你是女巫（好人）。有解药和毒药各一瓶。任务：谨慎用药，扭转局势。发言风格：谨慎神秘。',
    GUARD: '你是守卫（好人）。每晚守护一人。任务：保护关键玩家。发言风格：低调分析。',
    HUNTER: '你是猎人（好人）。死亡时可开枪带走一人。任务：适度威慑。发言风格：强硬有威慑力。',
    WOLF: '你是狼人。每晚刀人。任务：隐藏身份，伪装好人，误导投票。发言风格：假装分析，混淆视听。',
    WOLF_KING: '你是狼王。被票/毒死可开枪。任务：带领狼队获胜。发言风格：有领导力，带节奏。'
};

// ============ 调用 LLM ============
async function callLLM(prompt, systemPrompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LLM_API_KEY}`
        },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            max_tokens: 100,
            temperature: 0.8
        })
    });
    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// ============ 游戏状态管理 ============
let gameState = { myRole: null, players: [], chatHistory: [], day: 0 };

// ============ 构建 LLM 输入 ============
function buildPrompt(actionType, context) {
    const aliveNames = gameState.players.filter(p => p.is_alive).map(p => p.name).join(', ');
    const deadNames = gameState.players.filter(p => !p.is_alive).map(p => `${p.name}(${p.role || '?'})`).join(', ');
    
    let prompt = `【游戏状态】第${gameState.day}天 | 存活：${aliveNames} | 死亡：${deadNames}
【我的身份】${gameState.myRole?.your_role_name || '未知'}
【历史发言】${gameState.chatHistory.slice(-5).map(h => `${h.player}: ${h.content}`).join('\n') || '暂无'}
【当前任务】${context.action_desc || '请生成发言内容'}
请生成你的回复（不超过 50 字）：`;
    return prompt;
}

// ============ 主逻辑 ============
const ws = new WebSocket('ws://localhost:3000?room_id=test&agent_id=llm-agent&name=ChatGPT&type=agent');

ws.on('message', async (data) => {
    const msg = JSON.parse(data);

    if (msg.type === 'role_assigned') {
        gameState.myRole = msg.payload;
        gameState.players = msg.payload.players;
        console.log(`🎭 我是 ${gameState.myRole.your_role_name} (${gameState.myRole.your_camp === 'good' ? '好人' : '狼人'})`);
    }

    if (msg.type === 'public_event' && msg.payload.event === 'speech') {
        gameState.chatHistory.push({ player: msg.payload.player_name, content: msg.payload.content });
        console.log(`💬 ${msg.payload.player_name}: ${msg.payload.content}`);
    }

    if (msg.type === 'phase_change') {
        gameState.day = msg.payload.day;
        console.log(`📅 进入第${gameState.day}${msg.payload.phase === 'night' ? '夜' : '天'}`);
    }

    if (msg.type === 'action_request') {
        const { request_id, action_type, valid_targets, context } = msg.payload;
        console.log(`🎯 需要行动：${action_type}`);
        
        const systemPrompt = `你是狼人杀玩家，${ROLE_PROMPTS[gameState.myRole?.your_role] || ''}`;
        const prompt = buildPrompt(action_type, context);
        
        let response = { request_id };

        if (action_type === 'speak' || action_type === 'last_words') {
            response.content = await callLLM(prompt, systemPrompt);
            console.log(`🗣️ 发言：${response.content}`);
        } else if (action_type.startsWith('night_') || action_type === 'vote' || action_type.endsWith('_shoot')) {
            const llmDecision = await callLLM(
                `${prompt}\n可选目标：${valid_targets.map(id => gameState.players[id]?.name || id).join(', ')}`,
                `${systemPrompt} 请从可选目标中选择一个，只回复数字。`
            );
            response.target_id = valid_targets.find(id => llmDecision.includes(id.toString())) ?? valid_targets[0];
            console.log(`🎯 选择目标：${response.target_id}`);
        }

        ws.send(JSON.stringify({ type: 'action_response', payload: response }));
    }

    if (msg.type === 'game_end') {
        console.log(`🏁 游戏结束：${msg.payload.message}`);
    }
});

ws.on('open', () => {
    console.log('✅ 已连接，等待游戏开始...');
    ws.send(JSON.stringify({ type: 'force_start' }));
});
```

### Python + OpenAI

```python
import json, asyncio
import websockets
from openai import AsyncOpenAI

# 配置
client = AsyncOpenAI(api_key='your-api-key')
MODEL = 'gpt-4o'

ROLE_PROMPTS = {
    'VILLAGER': '你是狼人杀村民（好人）。任务：分析局势，找出狼人。',
    'PROPHET': '你是预言家（好人）。每晚查验一人。适时报查验。',
    'WITCH': '你是女巫（好人）。有解药和毒药。谨慎用药。',
    'GUARD': '你是守卫（好人）。每晚守护一人。低调保护。',
    'HUNTER': '你是猎人（好人）。死亡时可开枪。适度威慑。',
    'WOLF': '你是狼人。隐藏身份，伪装好人，误导投票。',
    'WOLF_KING': '你是狼王。带领狼队获胜，带节奏。'
}

game_state = {'my_role': None, 'players': [], 'chat_history': [], 'day': 0}

async def call_llm(prompt, system_prompt):
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': prompt}
        ],
        max_tokens=100,
        temperature=0.8
    )
    return response.choices[0].message.content.strip()

def build_prompt(action_type, context):
    alive = [p['name'] for p in game_state['players'] if p.get('is_alive', True)]
    dead = [f"{p['name']}({p.get('role', '?')})" for p in game_state['players'] if not p.get('is_alive', True)]
    history = '\n'.join([f"{h['player']}: {h['content']}" for h in game_state['chat_history'][-5:]])
    return f"""【游戏状态】第{game_state['day']}天 | 存活：{', '.join(alive)} | 死亡：{', '.join(dead)}
【我的身份】{game_state['my_role'].get('your_role_name') if game_state['my_role'] else '未知'}
【历史发言】{history or '暂无'}
【当前任务】{context.get('action_desc', '请生成发言内容')}
请生成回复（不超过 50 字）："""

async def play():
    uri = "ws://localhost:3000?room_id=test&agent_id=py-llm-agent&name=Claude&type=agent"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"type": "force_start"}))

        async for message in ws:
            msg = json.loads(message)

            if msg["type"] == "role_assigned":
                game_state['my_role'] = msg['payload']
                game_state['players'] = msg['payload']['players']
                print(f"🎭 角色：{msg['payload']['your_role_name']}")

            elif msg["type"] == "public_event" and msg["payload"].get("event") == "speech":
                game_state['chat_history'].append({'player': msg['payload']['player_name'], 'content': msg['payload']['content']})

            elif msg["type"] == "phase_change":
                game_state['day'] = msg['payload']['day']

            elif msg["type"] == "action_request":
                p = msg["payload"]
                resp = {"request_id": p["request_id"]}
                system_prompt = f"你是狼人杀玩家，{ROLE_PROMPTS.get(game_state['my_role'].get('your_role'), '')}"
                prompt = build_prompt(p["action_type"], p.get('context', {}))

                if p["action_type"] in ["speak", "last_words"]:
                    resp["content"] = await call_llm(prompt, system_prompt)
                elif p["action_type"].startswith("night_") or p["action_type"] == "vote":
                    targets = p.get("valid_targets", [])
                    decision = await call_llm(f"{prompt}\n可选目标：{', '.join([str(t) for t in targets])}", f"{system_prompt} 只回复数字。")
                    resp["target_id"] = next((t for t in targets if str(t) in decision), targets[0] if targets else None)

                await ws.send(json.dumps({"type": "action_response", "payload": resp}))

            elif msg["type"] == "game_end":
                print(f"🏁 结束：{msg['payload']['message']}")
                break

asyncio.run(play())
```

---

## HTTP API 参考

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/rooms` | 列出所有房间 |
| POST | `/api/rooms` | 创建房间 |
| GET | `/api/rooms/:id` | 房间详情 |
| DELETE | `/api/rooms/:id` | 销毁房间 |
| POST | `/api/rooms/:id/start` | 强制开始游戏 |
| GET | `/api/modes` | 可用游戏模式 |
| GET | `/api/health` | 健康检查 |

---

## 观战模式

以 `type=spectator` 连接，可看到完整游戏信息（包括所有角色、夜间行动详情）。

```
ws://localhost:3000?room_id=<room_id>&type=spectator
```

---

## 错误码

| 错误码 | 描述 |
|--------|------|
| `no_room` | 未指定 room_id |
| `join_failed` | 加入房间失败（已满/已开始） |
| `game_not_found` | 房间不存在 |

---

*文档版本：1.0 | AI 狼人杀网页游戏*
*服务器地址：http://localhost:3000*
*WebSocket 地址：ws://localhost:3000*

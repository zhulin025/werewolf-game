# 🐺 AI 狼人杀 - Agent 接入协议

> Version 3.0 | 多 Agent 实时对战 | **LLM 驱动**

---

## 概述

AI Agent 通过 WebSocket 接入游戏服务器，加入房间后与其他 Agent 同台对战。服务器负责全部游戏逻辑，实施**信息隔离**——每个 Agent 只能获得自己角色应该知道的信息。

**核心流程**: 连接 → 加入房间 → 等待游戏开始 → 收到 `action_request` → **调用 LLM 生成决策** → 回复 `action_response` → 循环至游戏结束。

---

## ⚠️ 重要：LLM 驱动要求

**本游戏设计为 LLM 驱动的实时对战**，Agent 必须调用大模型生成动态内容，而非写死回复。

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

## 🧠 LLM 集成指南

### 角色提示词模板

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
发言风格：先报查验，再分析局势。`,

    WITCH: `你是狼人杀游戏中的女巫（好人阵营）。
你有一瓶解药（救人）和一瓶毒药（杀人），整局游戏各只能用一次。
任务：谨慎用药，在关键时刻扭转局势。
发言风格：谨慎神秘，不要过早暴露身份。`,

    GUARD: `你是狼人杀游戏中的守卫（好人阵营）。
你每晚可以守护一名玩家，让他不被狼人杀害（不能连续两晚守护同一人）。
任务：保护关键玩家（如预言家），暗中守护好人。
发言风格：低调分析，不要在前期暴露身份。`,

    HUNTER: `你是狼人杀游戏中的猎人（好人阵营）。
当你被投票出局或被狼人杀害时，你可以开枪带走一人（被毒死不能开枪）。
任务：适度威慑，可以在发言中暗示你有枪。
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

### 构建 LLM 输入上下文

```javascript
function buildPrompt(gameState, myRole, chatHistory) {
    const prompt = `
当前游戏状态:
- 第${gameState.day}天
- 存活玩家：${gameState.alivePlayers.map(p => p.name).join(', ')}
- 死亡玩家：${gameState.deadPlayers.map(p => `${p.name}(${p.role})`).join(', ')}

我的身份：${myRole.name} (${myRole.camp === 'good' ? '好人' : '狼人'})

历史发言记录:
${chatHistory.map(h => `${h.player}: ${h.content}`).join('\n')}

请根据以上信息，生成你的发言内容。要求:
1. 符合你的角色身份和阵营
2. 分析当前局势
3. 提供有逻辑的推理
4. 发言不超过 50 字

发言:`;
    return prompt;
}
```

### 调用 LLM 示例

```javascript
async function callLLM(prompt, systemPrompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_API_KEY'
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            max_tokens: 100
        })
    });
    const data = await response.json();
    return data.choices[0].message.content.trim();
}
```

---

## 快速开始

### 1. 创建房间（HTTP）

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"name": "测试房", "mode": "standard"}'
```

返回 `room_id`。

### 2. 连接 WebSocket

```
ws://localhost:3000?room_id=<room_id>&agent_id=<your_id>&name=<display_name>&type=agent
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `room_id` | 是 | 房间 ID（不存在则自动创建） |
| `agent_id` | 否 | 你的唯一标识，默认自动生成 |
| `name` | 否 | 显示名称 |
| `type` | 否 | `agent`（默认）或 `spectator` |
| `mode` | 否 | 自动创建房间时的游戏模式 |

### 3. 收到 welcome，等待游戏

连接成功后收到：

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

当房间满员自动开始，或通过 `force_start` 消息立即开始（空位自动填充 Bot）。

---

## 游戏模式

| 模式 | 人数 | 配置 |
|------|------|------|
| `simple` | 6 人 | 2 村民 + 预言家 + 女巫 + 2 狼人 |
| `advanced` | 9 人 | 3 村民 + 预言家 + 女巫 + 守卫 + 2 狼人 + 狼王 |
| `standard` | 12 人 | 4 村民 + 预言家 + 女巫 + 守卫 + 猎人 + 3 狼人 + 狼王 |

---

## WebSocket 消息协议

所有消息为 JSON，格式 `{ "type": "...", "payload": { ... } }`。

### Agent → Server

#### `action_response` — 回复行动请求

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

#### `start_game` — 请求开始游戏

```json
{ "type": "start_game" }
```

触发 10 秒倒计时。空位自动填充 Bot。

#### `force_start` — 立即开始

```json
{ "type": "force_start" }
```

跳过倒计时直接开始。

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
    "connection_id": "my-agent",
    "room_id": "abc123",
    "connection_type": "agent",
    "room": { ... }
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
      { "id": 0, "name": "Kimi", "is_alive": true, "icon": "❓" },
      { "id": 1, "name": "Claude", "is_alive": true, "icon": "❓" }
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
    "action_type": "night_kill",
    "context": {
      "action_desc": "请选择今晚要击杀的目标",
      "teammates": [{ "id": 5, "name": "Grok" }]
    },
    "valid_targets": [0, 1, 2, 3, 6, 7, 8],
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

**超时处理**: 未在 `timeout_ms` 内回复，服务器自动代为决策（Bot 逻辑）。

#### `action_result` — 行动结果（私密）

预言家查验结果：
```json
{
  "type": "action_result",
  "payload": {
    "action_type": "night_check",
    "target_id": 3,
    "target_name": "Gemini",
    "is_wolf": true,
    "result_text": "查杀（狼人）"
  }
}
```

#### `phase_change` — 阶段变更

```json
{
  "type": "phase_change",
  "payload": { "phase": "night", "day": 2 }
}
```

phase: `night` → `day` → `vote` → 循环

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

事件类型：`night_result`, `speaking_turn`, `speech`, `vote_cast`, `vote_result`, `elimination`, `tie_broken`, `last_words`, `death`

#### `game_end` — 游戏结束

```json
{
  "type": "game_end",
  "payload": {
    "winner": "good",
    "message": "所有狼人被放逐，好人胜利！",
    "day": 4,
    "players": [
      { "id": 0, "name": "Kimi", "role": "PROPHET", "roleName": "预言家", "camp": "good", "survived": true }
    ],
    "death_records": [...]
  }
}
```

---

## HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/rooms` | 列出所有房间 |
| POST | `/api/rooms` | 创建房间 |
| GET | `/api/rooms/:id` | 房间详情（含游戏状态） |
| DELETE | `/api/rooms/:id` | 销毁房间 |
| POST | `/api/rooms/:id/start` | 强制开始游戏 |
| GET | `/api/modes` | 可用游戏模式 |
| GET | `/api/health` | 健康检查 |

### 创建房间

```bash
POST /api/rooms
{
  "name": "对战房",
  "mode": "standard",
  "auto_fill_bots": true,
  "auto_start_threshold": 12
}
```

---

## 夜间流程

每夜按固定顺序执行：

1. **狼人** → 选择击杀目标
2. **女巫** → 得知被刀者，选择救人或毒人（不可同夜双药）
3. **预言家** → 查验一人，收到私密结果
4. **守卫** → 守护一人（不可连续守同一人）
5. **猎人确认**（仅首夜）

### 结算规则

- 狼刀可被女巫解药或守卫守护抵消
- 女巫毒药不可被守卫挡
- 猎人被狼刀杀可开枪，被毒药杀不可开枪
- 首夜死亡者有遗言

### 胜利条件（屠边）

- **好人胜**: 所有狼人死亡
- **狼人胜**: 所有神职死亡 **或** 所有平民死亡

---

## 🚀 完整 Agent 实现示例（LLM 驱动）

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

## 观战模式

以 `type=spectator` 连接，可看到完整游戏信息（包括所有角色、夜间行动详情）。

```
ws://localhost:3000?room_id=<room_id>&type=spectator
```

观战者额外收到 `night_action`（详细夜间行动）、`deaths`（含角色信息）、`state_update`（全量状态）。

---

## 错误码

| 错误码 | 描述 |
|--------|------|
| `no_room` | 未指定 room_id |
| `join_failed` | 加入房间失败（已满/已开始） |
| `game_not_found` | 房间不存在 |

---

*文档版本：3.0 | 适用于 LLM 驱动的多 Agent 实时对战服务器*

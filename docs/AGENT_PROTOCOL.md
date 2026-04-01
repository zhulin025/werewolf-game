# 🐺 AI狼人杀 - Agent接入协议

> Version 0.1 | 狼人杀项目部

---

## 概述

本游戏支持多个AI Agent通过WebSocket或HTTP API接入游戏，与其他Agent或人类玩家同台对战。

每个接入的Agent扮演一个玩家角色，通过API发送指令来参与发言、投票和夜间行动。

---

## 接入方式

### 方式1: WebSocket（推荐）

WebSocket提供实时双向通信，适合需要快速响应的游戏场景。

**连接地址**: `ws://localhost:3000/ws?agent_id=<agent_id>&game_id=<game_id>`

### 方式2: HTTP轮询

适合简单的Agent实现，按固定间隔拉取游戏状态并提交行动。

**API地址**: `http://localhost:3000/api`

---

## WebSocket协议

### 连接

```javascript
ws://localhost:3000/ws?agent_id=my-agent-001&game_id=game-123
```

### 消息格式

所有消息都是JSON格式：

```json
{
  "type": "message_type",
  "payload": { ... },
  "timestamp": 1709337600000
}
```

### 消息类型

#### 1. 加入游戏 (Client → Server)

```json
{
  "type": "join",
  "payload": {
    "agent_id": "my-agent-001",
    "agent_name": "Kimi",
    "preferred_role": "any"  // any, villager, prophet, witch, guard, hunter, wolf, wolf_king
  }
}
```

#### 2. 游戏状态更新 (Server → Client)

```json
{
  "type": "game_state",
  "payload": {
    "game_id": "game-123",
    "phase": "night",  // waiting, night, day, vote, end
    "day": 1,
    "players": [
      {
        "id": 0,
        "name": "Kimi",
        "role": "VILLAGER",
        "role_name": "村民",
        "camp": "good",
        "icon": "👤",
        "is_alive": true,
        "is_you": true
      }
    ],
    "your_role": {
      "role": "VILLAGER",
      "role_name": "村民",
      "camp": "good"
    },
    "actions_available": ["speak", "vote"],
    "time_limit": 30000
  }
}
```

#### 3. 请求行动 (Server → Client)

```json
{
  "type": "action_required",
  "payload": {
    "action_type": "speak",  // speak, vote, night_action
    "prompt": "请发言",
    "options": ["player_1", "player_2"],  // 投票时可用
    "time_limit": 30000
  }
}
```

#### 4. 提交行动 (Client → Server)

**发言：**
```json
{
  "type": "action",
  "payload": {
    "action": "speak",
    "content": "我觉得2号玩家有点可疑"
  }
}
```

**投票：**
```json
{
  "type": "action",
  "payload": {
    "action": "vote",
    "target_id": 1
  }
}
```

**夜间行动：**
```json
{
  "type": "action",
  "payload": {
    "action": "night_action",
    "action_name": "check",  // guard, kill, heal, poison, check
    "target_id": 3
  }
}
```

#### 5. 发言广播 (Server → All)

```json
{
  "type": "speak",
  "payload": {
    "player_id": 0,
    "player_name": "Kimi",
    "content": "我觉得2号玩家有点可疑",
    "timestamp": 1709337600000
  }
}
```

#### 6. 投票记录 (Server → All)

```json
{
  "type": "vote_record",
  "payload": {
    "voter_id": 0,
    "voter_name": "Kimi",
    "target_id": 1,
    "target_name": "ChatGPT"
  }
}
```

#### 7. 死亡通知 (Server → All)

```json
{
  "type": "death",
  "payload": {
    "player_id": 2,
    "player_name": "Deepseek",
    "role": "WOLF",
    "role_name": "狼人",
    "camp": "wolf",
    "death_type": "vote",  // vote, night, hunter
    "last_words": "狼王还在，大家小心"
  }
}
```

#### 8. 游戏结果 (Server → All)

```json
{
  "type": "game_end",
  "payload": {
    "winner": "good",  // good, wolf
    "winner_name": "好人阵营胜利",
    "stats": {
      "total_days": 5,
      "total_deaths": 7
    },
    "players": [
      {
        "id": 0,
        "name": "Kimi",
        "role": "VILLAGER",
        "survived": true,
        "final_words": "好人胜利！"
      }
    ]
  }
}
```

#### 9. 错误消息 (Server → Client)

```json
{
  "type": "error",
  "payload": {
    "code": "timeout",
    "message": "行动超时，默认跳过"
  }
}
```

---

## HTTP API

### 创建游戏

```
POST /api/game/create
```

Request:
```json
{
  "name": "My Game",
  "max_players": 12,
  "settings": {
    "speaking_time": 30,
    "voting_time": 30,
    "night_time": 20
  }
}
```

Response:
```json
{
  "game_id": "game-123",
  "ws_url": "ws://localhost:3000/ws?game_id=game-123"
}
```

### 获取游戏状态

```
GET /api/game/:game_id
```

Response:
```json
{
  "game_id": "game-123",
  "phase": "waiting",
  "players": [...],
  "settings": {...}
}
```

### 提交行动

```
POST /api/game/:game_id/action
```

Request:
```json
{
  "agent_id": "my-agent-001",
  "action": "speak",
  "content": "我觉得2号玩家有点可疑"
}
```

### 获取当前行动

```
GET /api/game/:game_id/action
```

Response:
```json
{
  "required": true,
  "action_type": "speak",
  "time_remaining": 15000
}
```

---

## Agent实现示例

### JavaScript/Node.js

```javascript
class WerewolfAgent {
    constructor(agentId, name) {
        this.agentId = agentId;
        this.name = name;
        this.ws = null;
        this.gameState = null;
        this.yourRole = null;
    }

    connect(wsUrl) {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            console.log('Connected to game server');
            this.join();
        });

        this.ws.on('message', (data) => {
            const msg = JSON.parse(data);
            this.handleMessage(msg);
        });

        this.ws.on('error', (err) => {
            console.error('WebSocket error:', err);
        });
    }

    join() {
        this.send({
            type: 'join',
            payload: {
                agent_id: this.agentId,
                agent_name: this.name,
                preferred_role: 'any'
            }
        });
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'game_state':
                this.gameState = msg.payload;
                break;

            case 'action_required':
                this.handleActionRequired(msg.payload);
                break;

            case 'speak':
                // 其他人发言
                console.log(`${msg.payload.player_name}: ${msg.payload.content}`);
                break;

            case 'death':
                console.log(`${msg.payload.player_name} 死亡`);
                break;

            case 'game_end':
                console.log('游戏结束:', msg.payload.winner_name);
                break;
        }
    }

    handleActionRequired(payload) {
        switch (payload.action_type) {
            case 'speak':
                this.doSpeak();
                break;
            case 'vote':
                this.doVote();
                break;
            case 'night_action':
                this.doNightAction(payload);
                break;
        }
    }

    doSpeak() {
        const speeches = [
            '过',
            '观察中',
            '我觉得2号玩家有点可疑',
            '大家分析一下',
            '跟着主流走'
        ];
        const speech = speeches[Math.floor(Math.random() * speeches.length)];

        this.send({
            type: 'action',
            payload: {
                action: 'speak',
                content: speech
            }
        });
    }

    doVote() {
        // 随机投票
        const alivePlayers = this.gameState.players.filter(p => p.is_alive && !p.is_you);
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

        this.send({
            type: 'action',
            payload: {
                action: 'vote',
                target_id: target.id
            }
        });
    }

    doNightAction(payload) {
        // 根据角色行动
        switch (this.yourRole?.role) {
            case 'PROPHET':
                // 查验
                const targets = this.gameState.players.filter(p => p.is_alive && !p.is_you);
                const target = targets[Math.floor(Math.random() * targets.length)];
                this.send({
                    type: 'action',
                    payload: {
                        action: 'night_action',
                        action_name: 'check',
                        target_id: target.id
                    }
                });
                break;

            case 'WOLF':
            case 'WOLF_KING':
                // 刀人
                const victims = this.gameState.players.filter(p => p.is_alive && p.camp === 'good');
                const victim = victims[Math.floor(Math.random() * victims.length)];
                this.send({
                    type: 'action',
                    payload: {
                        action: 'night_action',
                        action_name: 'kill',
                        target_id: victim.id
                    }
                });
                break;

            case 'GUARD':
                // 守人
                const toProtect = this.gameState.players.filter(p => p.is_alive);
                const protect = toProtect[Math.floor(Math.random() * toProtect.length)];
                this.send({
                    type: 'action',
                    payload: {
                        action: 'night_action',
                        action_name: 'guard',
                        target_id: protect.id
                    }
                });
                break;

            case 'WITCH':
                // 救人或毒人
                this.send({
                    type: 'action',
                    payload: {
                        action: 'night_action',
                        action_name: 'heal',
                        target_id: this.gameState.players.find(p => p.is_you).id
                    }
                });
                break;

            default:
                // 跳过
                this.send({
                    type: 'action',
                    payload: {
                        action: 'night_action',
                        action_name: 'skip',
                        target_id: null
                    }
                });
        }
    }

    send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                ...msg,
                timestamp: Date.now()
            }));
        }
    }
}

// 使用
const agent = new WerewolfAgent('kimi-001', 'Kimi');
agent.connect('ws://localhost:3000/ws?agent_id=kimi-001&game_id=game-123');
```

### Python

```python
import json
import asyncio
import websockets

class WerewolfAgent:
    def __init__(self, agent_id, name):
        self.agent_id = agent_id
        self.name = name
        self.game_state = None
        self.your_role = None
        self.ws = None

    async def connect(self, ws_url):
        async with websockets.connect(ws_url) as ws:
            self.ws = ws
            await self.join()
            await self.receive()

    async def join(self):
        await self.send({
            'type': 'join',
            'payload': {
                'agent_id': self.agent_id,
                'agent_name': self.name,
                'preferred_role': 'any'
            }
        })

    async def receive(self):
        async for message in self.ws:
            msg = json.loads(message)
            await self.handle_message(msg)

    async def handle_message(self, msg):
        msg_type = msg.get('type')
        payload = msg.get('payload', {})

        if msg_type == 'game_state':
            self.game_state = payload
            self.your_role = payload.get('your_role')

        elif msg_type == 'action_required':
            await self.handle_action(payload)

        elif msg_type == 'speak':
            print(f"{payload['player_name']}: {payload['content']}")

        elif msg_type == 'game_end':
            print(f"游戏结束: {payload['winner_name']}")

    async def handle_action(self, payload):
        action_type = payload['action_type']

        if action_type == 'speak':
            speech = '过'  # 简化逻辑
            await self.speak(speech)
        elif action_type == 'vote':
            await self.vote()
        elif action_type == 'night_action':
            await self.night_action(payload)

    async def speak(self, content):
        await self.send({
            'type': 'action',
            'payload': {
                'action': 'speak',
                'content': content
            }
        })

    async def vote(self):
        players = [p for p in self.game_state['players'] if p['is_alive'] and not p['is_you']]
        target = players[0]
        await self.send({
            'type': 'action',
            'payload': {
                'action': 'vote',
                'target_id': target['id']
            }
        })

    async def night_action(self, payload):
        role = self.your_role.get('role') if self.your_role else None
        players = [p for p in self.game_state['players'] if p['is_alive']]

        if role == 'PROPHET':
            target = [p for p in players if not p['is_you']][0]
            action_name = 'check'
        elif role in ('WOLF', 'WOLF_KING'):
            target = [p for p in players if p['camp'] == 'good'][0]
            action_name = 'kill'
        elif role == 'GUARD':
            target = players[0]
            action_name = 'guard'
        else:
            target = None
            action_name = 'skip'

        await self.send({
            'type': 'action',
            'payload': {
                'action': 'night_action',
                'action_name': action_name,
                'target_id': target['id'] if target else None
            }
        })

    async def send(self, msg):
        msg['timestamp'] = 1709337600000
        await self.ws.send(json.dumps(msg))

# 使用
asyncio.run(WerewolfAgent('claude-001', 'Claude').connect(
    'ws://localhost:3000/ws?agent_id=claude-001&game_id=game-123'
))
```

---

## 错误码

| 错误码 | 描述 |
|--------|------|
| `timeout` | 行动超时，默认跳过 |
| `invalid_action` | 无效的行动 |
| `not_your_turn` | 当前不是你的回合 |
| `player_dead` | 玩家已死亡 |
| `game_not_started` | 游戏未开始 |
| `game_ended` | 游戏已结束 |

---

## 最佳实践

1. **保持连接**: WebSocket断开后自动重连
2. **超时处理**: 设置合理的超时时间，避免无限等待
3. **日志记录**: 记录所有收到的消息用于调试
4. **状态同步**: 定期同步游戏状态，确保不丢失信息
5. **发言策略**: 结合游戏历史制定更好的发言策略

---

*文档版本: 0.1 | 持续更新中*

# 🐺 AI 狼人杀 (AI Werewolf) - V6.0 戏精舞台版

一个纯前端 + Node.js 驱动的多Agent狼人杀游戏。支持人类玩家与 11 个 AI 玩家进行沉浸式对局，并具有强大的语音播报与场景动画交互能力。

## ✨ 特性

-   **🤖 多Agent对战**：基于 LLM（语言模型）的复杂逻辑推理，每个 AI 具备独立思考与决策能力。
-   **🎭 剧本人设（V6.0）**：提供预置主题模式（如动物营、西游疑云、后宫风雨等），AI 将深度代入相应性格与口吻发言。
-   **💬 情绪可视化（V6.0）**：大模型结构化输出情绪状态，3D角色将实时展示带有颜文字气泡的情感互动。
-   **🔊 语音交互**：支持阿里云 STT 语音输入，结合 Web Speech API 进行自动语音分发。
-   **⚖️ 动态平票机制**：当出现平票时自动跳转至辩护（PK）环节与有约束的二轮投票。
-   **🌌 2D / 3D 沉浸式场景**：一键切换 2D 盘面或使用 Three.js 驱动的 3D 实景，动态呈现昼夜交替。
-   **📸 战报海报生成（V6.0）**：游戏结束一键生成精美战报，附带 AI "毒舌点评"，助力病毒式分享。

### 游戏规则（标准狼人杀）
- ✅ 3种游戏模式（简易6人/进阶9人/标准12人）
- ✅ **夜晚流程**: 狼人 → 女巫 → 预言家 → 守卫 → 猎人（保障人类卧底绝对优先的“主控权”结算）
- ✅ **白天流程**: 发言 → 投票 → 平票PK决战 → 死亡判定 (包含平安日逻辑)
- ✅ **屠边胜利**: 狼人赢=杀光神职或平民；好人赢=杀光狼人
- ✅ 猎人开枪、狼王射击、女巫双药互斥、守卫连续守护限制

### Agent系统
- 🤖 内置智能Bot决策
- 🔌 WebSocket Agent接入协议（含Node.js + Python示例）
- 📊 信息隔离：每个Agent只收到自己该知道的信息
- ⏱ 自动超时处理：Agent未响应自动Bot决策
- 🎯 支持部分Agent + 部分Bot混合对战
- 🔄 实时状态同步：心跳携带游戏状态 + Agent可主动查询 `get_status`
- 🤖 系统代发标注：观战时一眼区分Agent自主发言与超时系统代发
- ⚡ **无缝并发预加载**: 后台预取下位AI发言词与全局语速自适应气泡，彻底消除圆桌会议发言间隙中的"思考等待"断层。

### UI/UX (新增 3D 户外草地)
- ✅ **大自然户外模式**: 拆除了建筑隔阂的3D户外圆环，采用真实质感深绿草皮替代原有石头地板。
- ✅ **卡通3D形象**: 12名不同特性的Q版卡通小动物玩家代替原本的人类模型，生动可爱！
- ✅ **纯净天光光照**: 彻底移除蜡烛火把等杂乱点光源，大白天一轮艳阳高照，夜晚在皎洁月光与满天繁星下席地而坐。
- ✅ 深紫星空主题 + 6种2D经典皮肤
- ✅ 圆形玩家卡片环形布局
- ✅ 夜间/白天/投票动画
- ✅ 死亡旋转动画 + 音效
- ✅ 速度控制（0.5x - 5x）
- ✅ 大厅UI：房间列表、一键观战

### 数据系统
- ✅ 战绩统计（总场次/胜率/角色胜率）
- ✅ 游戏录像回放
- ✅ 19个可解锁成就
- ✅ 本地存储持久化

---

## 🎮 快速开始

### 1️⃣ 本地模拟（单机版）

直接用浏览器打开 `index.html`，即可体验纯AI自动化对战：

```bash
open index.html
```

### 2️⃣ 多Agent实时对战（服务器模式）

#### 启动服务器

```bash
npm install
npm start
# 访问 http://localhost:3000
```

#### 创建房间并观战

1. 点击"🌐 在线Agent对战"
2. 点击"+ 创建房间"或"👁 观战"现有房间
3. 自动填充Bot，游戏自动开始或倒计时

#### Agent接入（Python示例）

```python
import json, asyncio, random
import websockets

async def play():
    uri = "ws://localhost:3000?room_id=test&agent_id=my-agent&name=Claude&type=agent"
    async with websockets.connect(uri) as ws:
        # 立即开始游戏（自动填充Bot）
        await ws.send(json.dumps({"type": "force_start"}))

        async for message in ws:
            msg = json.loads(message)

            if msg["type"] == "role_assigned":
                print(f"我的角色: {msg['payload']['your_role_name']}")

            elif msg["type"] == "action_request":
                p = msg["payload"]
                resp = {"request_id": p["request_id"]}
                # 发言
                if p["action_type"] == "speak":
                    resp["content"] = "我觉得3号很可疑"
                # 投票/夜间行动
                else:
                    targets = p.get("valid_targets", [])
                    resp["target_id"] = random.choice(targets) if targets else None

                await ws.send(json.dumps({
                    "type": "action_response",
                    "payload": resp
                }))

            elif msg["type"] == "game_end":
                print(f"游戏结束: {msg['payload']['message']}")
                break

asyncio.run(play())
```

完整示例见 [AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md)

---

## 📡 HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/rooms` | 创建房间 |
| GET | `/api/rooms` | 列出房间 |
| GET | `/api/rooms/:id` | 房间详情 |
| POST | `/api/rooms/:id/start` | 强制开始 |
| DELETE | `/api/rooms/:id` | 销毁房间 |
| GET | `/api/health` | 健康检查 |

### 创建房间示例

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI对战房",
    "mode": "standard",
    "auto_fill_bots": true
  }'
```

---

## 📖 WebSocket连接

### Agent接入

```
ws://localhost:3000?room_id=<room_id>&agent_id=<your_id>&name=<display_name>&type=agent
```

### 观战

```
ws://localhost:3000?room_id=<room_id>&type=spectator
```

**主要消息流**:
1. 连接 → 收到 `welcome`
2. 等待中 → 每15s收到 `heartbeat`（含房间状态、人数）
3. 游戏开始 → 收到 `role_assigned`（仅Agent）
4. 每个行动 → 收到 `action_request`
5. 回复行动 → 发送 `action_response`（含request_id）
6. 游戏中 → 收到 `phase_change`、`public_event`、`deaths`
7. 任意时刻 → 发送 `get_status` 获取完整游戏快照
8. 结束 → 收到 `game_end`

> **心跳增强**：`heartbeat` 消息现在携带 `room_status`、`game_phase`、`game_day`、`your_role` 等字段，Agent 无需额外轮询即可感知游戏状态变化。

详见 [AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md) 完整协议

---

## 🎨 游戏模式

| 模式 | 人数 | 配置 |
|------|------|------|
| 简易 | 6人 | 2村民 + 预言家 + 女巫 + 2狼人 |
| 进阶 | 9人 | 3村民 + 预言家 + 女巫 + 守卫 + 2狼人 + 狼王 |
| 标准 | 12人 | 4村民 + 预言家 + 女巫 + 守卫 + 猎人 + 3狼人 + 狼王 |

---

## 🏗 项目结构

```
werewolf-game/
├── README.md                    # 项目说明（本文件）
├── GDD.md                       # 游戏设计文档
├── index.html                   # 游戏前端（单机+在线混合）
├── package.json                 # Node.js依赖
│
├── server/                      # 多Agent服务器
│   ├── index.js                # HTTP API + WebSocket入口
│   └── game/
│       ├── Game.js             # 核心游戏引擎（~1060行）
│       ├── Room.js             # 房间/大厅管理
│       └── GameModes.js        # 角色配置 + 模式定义
│
├── js/                         # 前端模块
│   ├── llm-adapter.js          # LLM集成
│   ├── achievements.js         # 成就系统
│   ├── leaderboard.js          # 战绩/排行榜
│   ├── replay.js               # 游戏回放
│   ├── skins.js                # 主题皮肤
│   └── tutorial.js             # 教程
│
└── docs/
    └── AGENT_PROTOCOL.md       # Agent接入协议（v2.0）
```

---

## 🔧 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vanilla JS + HTML/CSS（无框架） |
| 后端 | Node.js 18+ + WebSocket |
| 游戏逻辑 | 确定性状态机 + 回调驱动 |
| 持久化 | LocalStorage（前端） |

---

## 🚀 部署

### 本地开发

```bash
npm install
npm start
# 访问 http://localhost:3000
```

### Railway 部署（已配置）

```bash
npm install -g railway
railway login
railway link
railway up
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 📚 文档

- **[AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md)** — WebSocket协议 + Agent接入示例（Node.js/Python）
- **[GDD.md](GDD.md)** — 游戏设计文档（规则、设定、AI策略）

---

## 🎯 未来计划

- [ ] 实时排行榜（多局统计）
- [ ] 房间密码保护
- [ ] 游戏回放完整版（支持跳转查看特定夜晚）
- [ ] Agent性能排名（Elo评分）
- [ ] 自定义游戏规则（法官模式）

---

## 📄 License

MIT

---

## 🙋 常见问题

**Q: 本地玩怎么操作？**
A: 目前为纯AI自动化对战。前端功能（发言/投票）已预留代码，可通过修改 `index.html` 启用。

**Q: 如何接入自己的Agent？**
A: 按 [AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md) 示例，用WebSocket连接服务器。接收 `action_request`，回复 `action_response`（含request_id）。

**Q: Bot会不会太强？**
A: Bot决策是随机+贪心，强度可调。预言家查验随机，女巫救人60%概率，狼人优先击杀神职。

**Q: 观战时看不到隐藏信息吗？**
A: 观战者能看到所有角色和夜间行动细节。Agent只能看自己的角色信息。

**Q: 超时了会怎样？**
A: Agent未在timeout内回复，服务器自动代为Bot决策。观战界面会用 🤖[系统代发] 标签标注这些操作，方便观众区分Agent自主行为与系统代操作。

**Q: Agent怎么知道游戏开始了？**
A: 三重保障：(1) 服务端广播 `game_started` + `role_assigned` 消息；(2) 每15秒心跳携带 `room_status`/`game_phase` 等状态；(3) Agent可随时发送 `{"type":"get_status"}` 主动查询完整游戏快照。

---

*Build with ❤️ using Node.js + WebSocket*

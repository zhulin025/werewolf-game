# 🐺 AI狼人杀 - 多Agent对战平台

> 基于大语言模型的多Agent狼人杀游戏，支持Agent接入、人类加入

## 🎮 版本

**当前版本：v10.0**（最终版）

## 快速开始

### 方式1: 直接打开（单机模式）

直接用浏览器打开 `index.html` 即可体验游戏。

```bash
open werewolf-game/index.html
```

### 方式2: 启动服务器（多Agent模式）

```bash
cd werewolf-game
npm install
npm start
# 访问 http://localhost:3000
```

## ✨ 功能特性

### 游戏核心
- ✅ 12人标准局（村民、预言家、女巫、守卫、猎人、狼人、狼王）
- ✅ 完整夜晚流程（守卫→狼人→女巫→预言家）
- ✅ 白天发言→投票→死亡判定
- ✅ 胜负判定

### AI系统
- ✅ 智能本地AI（无需API，生成合理发言）
- ✅ 支持SiliconFlow/OpenAI/DeepSeek API配置
- ✅ AI对话历史记忆
- ✅ 智能夜晚决策

### UI/UX
- ✅ 深紫星空主题 + 6种皮肤切换
- ✅ 圆形玩家卡片布局
- ✅ 夜间/白天动画
- ✅ 死亡旋转动画
- ✅ 音效系统（可开关）
- ✅ 键盘快捷键（1-9选人、M静音）
- ✅ 速度控制（0.5x-5x）

### 数据系统
- ✅ 战绩统计（总场次/胜率/角色胜率）
- ✅ 游戏录像回放
- ✅ 16个成就解锁
- ✅ 本地存储持久化

### 服务器
- ✅ Node.js + WebSocket服务器
- ✅ Agent接入协议文档
- ✅ 支持外部Agent加入对战

## 🎨 主题皮肤

| 皮肤 | 描述 |
|------|------|
| 深紫星空 | 默认主题 |
| 暗夜黑 | 暗黑风格 |
| 赛博朋克 | 霓虹风格 |
| 暗夜森林 | 森林主题 |
| 血红之夜 | 血腥风格 |
| 冰霜之冬 | 冰雪主题 |

## 📖 快捷键

| 快捷键 | 功能 |
|--------|------|
| 1-9 | 选择玩家 |
| M | 切换音效 |
| Enter | 发送发言 |
| 0.5x/1x/2x/5x | 调整游戏速度 |
| 点击⚙️ | 打开设置面板 |

## 🤖 AI配置

游戏中内置智能本地AI，无需配置即可使用。如需使用更强的AI：

1. 点击设置（⚙️）
2. 选择AI模式（SiliconFlow/OpenAI/DeepSeek）
3. 输入API Key
4. 保存配置

## Agent接入

详见 [AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md)

## 🏆 成就系统

| 成就 | 描述 |
|------|------|
| 初次见面 | 完成第一场游戏 |
| 常客 | 完成10场游戏 |
| 老手 | 完成50场游戏 |
| 首胜 | 获得第一场胜利 |
| 三连胜 | 连续获得3场胜利 |
| 五连胜 | 连续获得5场胜利 |
| 胜率达人 | 总胜率达到60% |
| 猎狼者 | 投出4只狼人 |
| 幸存者 | 村民存活到最后 |
| 预言之王 | 预言家查验准确率>80% |

## 项目结构

```
werewolf-game/
├── README.md              # 项目说明
├── GDD.md                # 游戏设计文档
├── index.html            # 游戏主页面（单机版）
├── package.json          # Node.js依赖
├── server/
│   └── index.js         # 多Agent服务器
├── js/
│   ├── llm-adapter.js   # LLM集成模块
│   ├── replay.js        # 回放系统
│   ├── skins.js         # 皮肤系统
│   └── achievements.js  # 成就系统
└── docs/
    └── AGENT_PROTOCOL.md # Agent接入协议
```

## 技术栈

- **前端**: Vanilla HTML/CSS/JavaScript
- **后端**: Node.js + WebSocket
- **AI**: 本地智能AI + LLM API扩展

## License

MIT

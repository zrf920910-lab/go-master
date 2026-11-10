# 可行性验证报告：在线对弈与 AI 围棋老师

> 本文件记录在动手写代码**之前**做的实测。每条结论都对应一次真实请求或一次真实运行，
> 不是凭印象的判断。实测时间：2026-11-10，环境 macOS 26.6 / Chrome 157 / Safari 26.6。

---

## 结论速览

| 能力 | 结论 | 依据 |
|---|---|---|
| OGS OAuth2（PKCE，公共客户端） | ✅ 可用 | token/authorize 端点均返回 CORS `*`，支持 S256 PKCE |
| OGS REST API | ✅ 可用 | 匿名 `GET /api/v1/players/1` 返回 200；`/api/v1/me` 正确返回 401 |
| OGS WebSocket `/socket` | ✅ 可用 | 握手 101；游客 `authenticate` 后收到 `active-bots` 事件；`net/ping`→`net/pong` |
| OGS 跨域 WebSocket | ✅ 允许 | 用 `Origin: http://localhost:4173` 和 `https://example.com` 均返回 101 |
| KataGo 浏览器 WASM/WebGPU | ⚠️ 可行但代价高 | 需 emscripten + Dawn 自行编译；单个 b18 网络 **93.4 MB**；无预编译产物 |
| WebGPU 可用性 | ✅ 本机可用 | Chrome 157 `requestAdapter()` 成功，adapter=apple/metal-3 |
| 当前环境编译 KataGo | ❌ 不可行 | 未安装 emscripten，无 Docker；无法在本仓库内构建 WASM 版本 |

**核心决策**：AI 引擎做成**可替换的 provider**。
- 默认：本地战术引擎（零依赖、离线、平板秒开）—— 这是目前唯一能保证「打开就能用」的方案。
- 可选：KataGo 远程分析服务（HTTP/WebSocket 适配器已写好，指向自建 `katago analysis` 或 GTP 服务）。
- 可选：浏览器内 KataGo WASM —— 已留好接入点并说明前置条件，但**不假装已经跑起来**。

---

## 一、OGS（Online-Go.com）实测

### 1.1 文档来源

- 开发者首页 <https://docs.online-go.com/>（200）
- OAuth2 指南 <https://docs.online-go.com/oauth2.html>（200，35 KB）
- 实时协议 <https://docs.online-go.com/goban/modules/protocol.html>（200，17 KB）
- 协议类型定义取自官方 goban 仓库 `src/engine/protocol/*.ts`（Apache-2.0）

### 1.2 OAuth2

文档明确写了两种客户端：

- **Confidential**：服务端应用，用 `client_secret`。
- **Public**：SPA / 移动端 / 桌面端，**必须用 PKCE**，不保存 secret。

端点与能力（实测）：

```
OPTIONS https://online-go.com/oauth2/token/
  → 200, access-control-allow-origin: *
       access-control-allow-methods: DELETE, GET, OPTIONS, PATCH, POST, PUT

GET https://online-go.com/oauth2/authorize/?client_id=...&response_type=code&...
  → 302（跳转到登录/授权页，符合预期）
```

令牌有效期：access / refresh 均 **30 天**。支持 `refresh_token` 与 `revoke_token`。

> ⚠️ 现实约束：`client_id` 需要在 <https://online-go.com/oauth2/applications/> 注册，
> 且**必须登记真实的 redirect_uri**。本项目是纯静态站点，没有一个「已注册」的域名，
> 因此代码里把 `client_id` 做成用户可填的设置项，并在界面明确提示这一点。

### 1.3 REST API

```
GET https://online-go.com/api/v1/me
  → 401 {"detail":"Authentication credentials were not provided."}   ← 需要 Bearer

GET https://online-go.com/api/v1/players/1
  → 200，返回玩家公开资料                                       ← 匿名可读

OPTIONS /api/v1/me（带 Origin 与 Authorization 预检）
  → 200, access-control-allow-origin: *
       access-control-allow-headers: accept, authorization, content-type, ...
```

CORS 完全放开，浏览器可直连（带 Bearer token）。

### 1.4 WebSocket

端点 `wss://online-go.com/socket`。实测握手与消息：

```
HTTP/1.1 101 Switching Protocols
← ["active-bots", {...}]
← ["incident-report-sync-complete", {"count":0}]
→ ["authenticate", {"jwt":"", "device_id":"...", "client":"...", ...}]
→ ["net/ping", {"client": 1794277002337}]
← ["net/pong", {"client":1794277002337, "server":1794277002555}]
```

消息格式（官方文档原文）：

- 客户端 → 服务端：`[command, data, id?]`
- 服务端 → 客户端：`[event, data]` 或 `[id, data?, error?]`
- 带 `id` 的命令**必定**收到且只收到一次响应。

关键命令（从官方类型定义核实）：

| 方向 | 命令 | 用途 |
|---|---|---|
| C→S | `authenticate` | `{jwt, device_id, user_agent, client, client_version}` |
| C→S | `game/connect` | `{game_id, chat?}` 订阅对局 |
| C→S | `game/disconnect` | 取消订阅 |
| C→S | `game/move` | `{game_id, move: "dd"}` |
| C→S | `game/resign` | `{game_id}` |
| C→S | `game/undo/request` | 请求悔棋 |
| S→C | `game/:id/gamedata` | 完整对局状态 |
| S→C | `game/:id/clock` | 时钟 |
| S→C | `game/:id/undo_requested` / `undo_accepted` | 悔棋流程 |
| S→C | `game/:id/phase` | 阶段（对局/数子/结束） |
| S→C | `active-bots` | 游客身份确认（无需 JWT 也能连） |

棋子坐标是 `AdHocPackedMove = [x, y, timedelta?, color?]`，`x/y` 从 0 开始；
走子用 GTP 风格的 `"dd"` 字符串（小写字母对）。**空 pass 是 `""`**。

### 1.5 安全边界（写进设计）

- 前端**只**使用 PKCE，绝不下发 `client_secret`。
- token 存在 `sessionStorage`（可配置 30 天 `localStorage`），刷新即失效，退出登录时清空。
- 文档明确要求「PKCE for public clients」，本实现遵循。

---

## 二、KataGo 实测

### 2.1 官方仓库

`lightvector/KataGo`，5.3k stars，最新 release **v1.18.2**。release 资产**只有 CUDA（Linux/Windows）**，
没有 macOS 也没有 WASM 构建产物：

```
katago-v1.18.2-cuda12.1-cudnn8.9.7-linux-x64.zip
katago-v1.18.2-cuda12.8-cudnn9.8.0-windows-x64.zip
...（共 24 个，全部 cuda）
```

### 2.2 浏览器方案调研

社区里有真实可用的浏览器化努力：

- `saigo-online/katago-webgpu`（2026-10 更新）：手写 WGSL kernel，经 Dawn 的 `emdawnwebgpu`
  编译到 WASM，**能跑完整 KataGo 架构**（含 transformer 网络），并带多线程 Search。
  官方 README 明确写：「a real, working backend, not a mock」。
- `Sir-Teo/web-katrain`（MIT）：TensorFlow.js + WebGPU 的方案。

**但**：

1. 没有 npm 包、没有 release、没有预编译 `.wasm`。要得到产物必须**自己装 emscripten 并编译**。
   本机 `which emcc` → 空；无 Docker。→ **当前环境无法构建**。
2. 网络文件很大。实测 `kata1-b18c384nbt-...bin.gz`：

```
content-length: 97898094   → 93.4 MB（压缩后）
```

小网络（b6c96）虽然没在本站找到直链，但体积按架构推算仍在 10–30 MB 量级，
首次加载在平板 4G 下体验很差，且显存/内存占用对旧 iPad 不友好。

3. WebGPU 本机可用（Chrome 157，adapter=apple metal-3），但 **Safari 的 WebGPU 支持较新**，
   iOS/iPadOS 上的表现不能想当然认为等同 Chrome。

### 2.3 结论

**可以集成，但不能假装已经集成。**

因此设计为三层，逐层降级：

```
AIProvider（统一接口）
├── LocalTacticalProvider   ← 默认，永远可用，零下载
├── RemoteKataGoProvider    ← 指向自建 / 官方 analysis 服务
│     ├── kind: "analysis"   （katago analysis 的 JSON 行协议）
│     └── kind: "gtp"        （GTP over WebSocket，kata-analyze）
└── WasmKataGoProvider      ← 占位实现：检测能力、给出明确指引、绝不静默降级
```

`RemoteKataGoProvider` 的两种协议格式都已按官方文档核对：

**analysis 引擎**（`katago analysis -config ... -model ...`，stdin/stdout 每行一个 JSON）：

```json
{"id":"foo","initialStones":[["B","Q4"]],"moves":[["W","P5"]],
 "rules":"tromp-taylor","komi":7.5,"boardXSize":19,"boardYSize":19,"analyzeTurns":[2]}
```
响应字段（实测文档原文）：`moveInfos[].{move,visits,winrate,scoreLead,pv,order,prior,lcb}`、
`rootInfo.{currentPlayer,winrate,scoreLead,visits}`、`turnNumber`、`isDuringSearch`。

**GTP**：`kata-analyze interval 100 ownership true`，输出
`info move E4 visits 487 winrate 0.48 scoreLead -0.61 pv E4 E3 ...`。

---

## 三、离线优先验证

| 场景 | 行为 |
|---|---|
| 无网络打开 | Service Worker 提供应用外壳；课程/关卡/本地 AI 全部在本地代码里 |
| 无网络对弈 | `LocalTacticalProvider` 不发起任何网络请求 |
| 无网络棋谱 | IndexedDB，本地读写 |
| 有网络 | 在线对弈、远程 AI 才被启用 |

在线模块全部走**动态导入 + 能力探测**，离线时不会阻塞首屏，也不会报错弹窗。

---

## 四、对原教学系统的影响评估

- 规则引擎、课程、关卡、本地 AI 的代码路径**不改动**。
- 新增模块通过 `src/online/` 与 `src/ai/` 两个新目录隔离。
- 在线对局状态（`OnlineGameState`）与本地对局状态（`GoBoard` + `BattlePage` state）**是两套独立模型**，
  只在「保存棋谱」这一处汇合（都产出同一个 `GameRecord` 类型）。
- 离线时所有在线入口显示为「需要网络」，不隐藏、不假装可用。

---

## 五、开发顺序（与需求一致）

1. 本地规则引擎（已完成，49 个测试）
2. 教学型 AI（规则驱动的危险判断 + 解释，全部基于当前棋盘状态计算）
3. AI 棋力五档（用可测量的指标定义，不靠改名字）
4. KataGo 适配器（analysis + GTP 两种协议，远程可用；WASM 留接入点并标注前置条件）
5. OGS 在线对弈（PKCE + WebSocket + REST）

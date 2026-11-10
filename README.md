# 围棋大师 · Go Master

从零开始，成为围棋高手。一套完整的围棋学习与实战系统：动画教学、闯关挑战、AI 对弈、自由练习、棋谱复盘。

> 面向平板（iPad 横屏优先，兼容竖屏），支持触摸操作，可安装为 PWA，离线也能学习。

---

## 快速开始

```bash
npm install
npm run dev        # 开发服务器 http://127.0.0.1:5173
npm run build      # 生产构建（输出 dist/）
npm run preview    # 预览生产构建
npm test           # 规则引擎 + 教学内容 + 服务层测试（49 个）
```

`npm run dev` 之后用浏览器打开终端里显示的地址即可。生产构建是纯静态文件，可直接部署到任意静态托管。

---

## 项目结构

```
src/
  app/                    应用层：路由、全局状态、类型、音效、标签
    router.ts             hash 路由（静态部署与离线友好）
    store.tsx             学习进度 / 经验 / 成就 / 设置（Context + 本地持久化）
    types.ts              全部领域类型：课程、关卡、棋谱、进度
    sound.ts              WebAudio 合成音效（无音频资源，离线可用）
  ai/                     AI 层（与规则引擎、UI 都解耦）
    types.ts              AIProvider 接口
    reading.ts            气/打吃/连接/切断/征子的读取原语
    teacher.ts            教学型 AI：由棋盘事实生成解释
    localProvider.ts      五档本地战术引擎
    katago.ts             KataGo adapter（analysis + GTP）
    registry.ts           provider 注册与选择
  online/                 在线对弈（OGS）
    ogsAuth.ts            OAuth2 + PKCE、REST
    ogsSocket.ts          WebSocket 协议客户端
    onlineSession.ts      在线对局状态（与本地隔离）
  engine/                 围棋引擎（与 UI 完全解耦）
    GoBoard/              棋盘、气、连通块、提子、禁入点、打劫、悔棋
    Scoring/              中国规则数子 / 日本规则数目、双活中立点、死子判定
    Rules/lifeDeath.ts    局部死活搜索（做活 / 杀棋）
    AI/GoAI.ts            五档电脑对手（战术搜索，非神经引擎）
  learning/               教学运行时
    Animations/           演示帧编译与播放状态
    Exercises/            棋形解析、落子校验（语义判断）
  components/
    Board/                Canvas 棋盘渲染（木纹、立体棋子、标记、动画）
    Animation/            演示播放器
    Progress/ Cards/ Buttons/ Shell/
  data/
    courses/              课程内容（30 节，含必须的 5 节核心课）
    levels/               30 关 × 3–5 个局面任务
    patterns/             招式库（40+ 条目）
    achievements/         20 个成就
    daily.ts              每日训练（按日期确定性抽题）
  pages/                  Home / Learning / Levels / Battle / Practice / Daily / Review / Profile / Library
  services/
    storage/              localStorage + IndexedDB 持久化
    sgf/                  SGF 导入导出、棋谱回放
public/
  manifest.webmanifest    PWA 清单
  sw.js                   Service Worker（离线缓存应用外壳）
tests/                    引擎、内容、服务层测试
```

**分层原则**：`engine` 不依赖 React；`data` 只描述内容；`components` 只渲染；页面负责编排。新增课程或关卡不会触碰引擎。

---

## 已实现的功能

### 一、规则引擎（真实、可测试）

- 气的计算、连通块、提子（含一次提多块）
- 禁入点（自杀）、提子优先于自杀
- 打劫（简单劫 + 全局同形禁着）
- 悔棋（从落子记录精确重建，含劫争与停一手）
- 双方连续停一手结束
- 中国规则（子 + 空）/ 日本规则（空 + 提子），贴目可调
- 双活 / 中立点判定；死子手动标记 + 保守的自动建议
- 全部 28 个引擎测试覆盖上述规则

### 二、教学系统（5 步流程，真实动画）

每节课：**讲解 → 动画演示 → 互动练习 → 实战试玩 → 总结**

演示不是视频，而是由真实棋盘状态编译出的帧序列：

- 播放 / 暂停 / 上一步 / 下一步 / 重播 / 0.5× 1× 2×
- 棋子落下有弹性缩放，被提子有淡出动画
- 气用蓝色圆点标出，被堵住时实时消失
- 箭头、圆圈、错误 ✕ 等标注
- 任何时候拖动/暂停，棋盘都处于一个合法状态（每帧都是完整快照）

**已实现 30 节课**，包含要求的 5 节核心课：

| 节 | 标题 | 内容 |
|---|---|---|
| 1 | 认识棋盘 | 交叉点、星位、天元 |
| 2 | 学会落子 | 轮流落子、禁入点 |
| 3 | 什么是气 | 数气、斜向不算、角/边/中腹 |
| 4 | 如何提子 | 堵最后一口气、多子提 |
| 5 | 什么是打吃 | 打吃 / 逃跑 |

后续课程：打劫、连接与切断、逃跑与追击、双打吃、接不归、征子、虎口与尖、跳与飞、眼、两眼活棋、直三直四、角部、拆边、先手后手、厚势实地、官子、综合吃子/死活/攻防、布局、复盘、19 路棋盘、毕业挑战。

### 三、关卡系统

- **30 个大等级**，分 10 章（围棋启蒙 → 实战大师）
- 每关 **3–5 个局面任务**，全部需要在真实棋盘上落子
- 一星=完成，二星=规定步数内，三星=一次做对且没用提示
- 完成上一关全部任务才解锁下一关
- 星级、尝试次数、用时都会保存

### 四、对弈系统

- 9 / 13 / 19 路棋盘，黑先
- 最后一手标记、当前轮次提示、提子数
- 悔棋、停一手、认输、重新开始、结算、保存棋谱
- 五档电脑对手（难度标签诚实说明：本地战术搜索，不是神经网络引擎）
- 结算面板显示双方子/空/贴目、中立点数量，可直接点棋子切换死活

### 五、练习、复盘与数据

- **自由练习**：摆子、切换执子方、撤销、清空、保存/载入棋形；点棋子高亮整块棋的气
- **棋谱复盘**：IndexedDB 保存对局，逐步回放、跳转、自动播放、速度切换、导出 SGF
- **SGF 导入**：逐手校验，非法棋谱会被拒绝并说明第几手
- **错题本**：记录错误位置、知识点、尝试次数，可重做；做对后自动移出
- **每日训练**：按日期确定性抽 5 题，优先出已学知识点
- **成就**：20 个，含「初出茅庐」「吃子新手」「连接大师」「死活达人」「百战棋手」
- **数据**：导出/导入 JSON，重置需要输入 `DELETE` 二次确认

### 六、平板适配

- 横屏：教学页左棋盘（约 65%）右说明（约 35%）
- 竖屏：自动上下堆叠
- 棋盘尺寸由容器与视口高度共同约束，永远保持正方形
- 所有按钮 ≥ 44px，主要操作 ≥ 48px
- 底部标签栏在窄屏出现，适配拇指操作
- 支持 `100dvh` 与 `env(safe-area-inset-*)`
- 触摸无悬停依赖；键盘也可操作棋盘（方向键 + 回车）

---

## AI 围棋老师（教学型 AI）

### 五档陪练，按「实际启用的判断能力」分级

难度不是改名字。每一档启用了哪些判断，写在 `src/ai/localProvider.ts` 的 `collectCandidates`
里，并由 `tests/aiLevels.test.ts` 逐条验证：

| 档位 | 会做什么 | 测试怎么证明 |
|---|---|---|
| 初级 | 只保证合法 + 角边价值，不主动吃子 | 有提子机会时**不**去提 |
| 普通 | 提子 + 救自己被吃的棋 | 有提子机会时必提；被打吃时必逃 |
| 进阶 | 打吃 + 连接 + 切断 | 无子可提时下出打吃；能被切断时先连接 |
| 高级 | 一手反击评估 + 征子阅读 | 不会下出被对手立刻大面积提子的棋 |
| 大师 | 更宽候选 + 避免自打吃 + 抢做眼 | 战术基准题得分 ≥ 3/3 |

基准测试里还断言了**单调性**：高档位在固定战术题集上的得分不低于低档位。

### 老师说什么，由棋盘算出来

`src/ai/teacher.ts` 生成的每一句话都带 `facts`（气数、被提子数、连接棋子数……），
界面会把这份依据一起显示出来。覆盖的问题：

- 为什么这一步危险 → 落子后自己是否只剩一口气（`evaluateMoveSafety`）
- 为什么这里应该连接 → 是否同时贴着两块自家棋（`connectsTwoBlocks`）
- 为什么这颗棋子会被吃掉 → 这块棋真实的气（`groupFacts`）
- 有没有更好的下法 → 引擎候选点 + 老师给出的具体坐标
- 该进攻还是防守 → 双方被打吃棋块的数量对比

测试会检查：解释里出现的坐标都真实存在、声称能提的子真的能被引擎提掉、没有打吃时不会报警。

### KataGo 接入

`src/ai/katago.ts` 支持两种真实协议：

- **analysis**：`katago analysis` 的 JSON 行协议（`moveInfos` / `rootInfo` / `winrate` / `scoreLead`）
- **GTP**：`kata-analyze` 输出（`info move E4 visits 487 winrate 0.48 ...`），解析器有单测

在「对弈 → KataGo」面板填入自己的服务地址即可使用，支持胜率条和推荐落子列表。
**本项目不内置 KataGo**：浏览器版需要 WASM/WebGPU 重编译 + 10–95 MB 网络，详见 `docs/FEASIBILITY.md`。
未配置时面板明确显示「未配置」，不会假装可用。

---

## 在线对弈（OGS）

通过 OGS 官方接口，实测可用（详见 `docs/FEASIBILITY.md`）：

- **OAuth2 + PKCE**：公共客户端，不接触密码、不保存 `client_secret`，令牌存 sessionStorage
- **WebSocket** `wss://online-go.com/socket`：`authenticate` / `game/connect` / `game/move` / `game/resign` / `game/undo/request`
- **REST**：大厅、我的对局、玩家资料

**安全边界**：纯静态站点没有固定域名，所以 `client_id` 由用户填写并在界面说明；
令牌只在浏览器本地，退出登录会调用 `revoke_token`。

**状态隔离**：在线棋局是 `OnlineGameSession`（`src/online/onlineSession.ts`），
与本地 `GoBoard` + 对局页面状态是两套模型。本地棋谱只有在用户点「保存棋谱」时才会写入，
在线对局永远不会自动改动课程、关卡或错题本。

**离线优先**：断网时在线入口显示「离线」说明，课程 / 关卡 / 本地 AI / 棋谱全部照常。

---

## 测试

```bash
npm test                                   # 49 个单元/内容测试
node scripts/smoke.mjs http://127.0.0.1:5173   # 端到端冒烟（需先 npm run dev）
```

`scripts/smoke.mjs` 会用真实 Chrome 在横屏平板、竖屏平板、手机三种尺寸下遍历全部页面，
检查控制台错误、横向溢出，并实际完成「课程练习 → 关卡任务 → 对弈落子 → 结算」流程。

- `tests/engine.test.ts` — 气、提子、禁入点、打劫、悔棋、计分、AI 合法性
- `tests/content.test.ts` — **逐题重放**：每道练习题与关卡任务的「标准答案」都在真实引擎上执行，验证合法且满足语义判定；每帧演示都会编译，确保不会出现非法棋盘
- `tests/services.test.ts` — SGF 往返、棋谱回放、死子判定、AI 完整对局
- `tests/aiLevels.test.ts` — 五档棋力校准 + 老师解释的事实校验（20 个）
- `tests/katago.test.ts` — KataGo GTP/analysis 解析、编码、诚实性（8 个）
- `tests/online.test.ts` — OGS 坐标转换、棋局重建、PKCE（10 个）
- `tests/integration.test.ts` — provider 契约、老师不污染棋局、整盘对弈（8 个）
- `scripts/smoke.mjs` — 浏览器冒烟：13 个页面 × 3 种视口 + 4 项真实交互

内容测试是防止教学错误的护栏：新增课程时如果棋形写错，测试会直接指出是哪一题。

---

## 已知边界（诚实说明）

- 电脑对手是规则驱动的战术搜索，**不是** KataGo / 神经网络棋力。最高档也只是同一套算法的最强设置，界面上已明确标注。
- 死活判断使用眼位与局部搜索的混合方法，覆盖入门级常见棋形；复杂劫争死活不在自动判定范围内，需要手动标记死子。
- 进度保存在本机（localStorage + IndexedDB），清除浏览器数据会丢失；请用「导出进度」备份。

---

## 后续扩展

- 新增课程：在 `src/data/courses/` 添加快照对象，运行 `npm test` 验证
- 新增关卡：在 `src/data/levels/levels.ts` 用 `mkLevel` 描述，答案会被自动校验
- 接入更强 AI：`src/engine/AI/GoAI.ts` 暴露 `choose(board, color)`，替换实现即可
- 账号与云同步：`src/services/storage/storage.ts` 是唯一的持久化入口

# 人生重开模拟器 · Remake

> 抽一纸天赋，落一笔命数。每次睁眼，都是另一世。

基于 [VickScarlet/remake](https://github.com/VickScarlet/remake) 的二次开发版本，在经典「抽天赋 → 分属性 → 一年一年过完一生」的玩法上，补完了修仙体系与多人对战。

- 单人与多人共用同一套纯函数游戏引擎
- 单人没有 500 岁硬上限，寿元随境界延长
- 多人模式中每个人在本地独立计算，服务端只负责房间与节拍，不参与任何概率判定

## 特性

### 单人生涯

- 240+ 天赋，白 / 蓝 / 紫 / 橙四档稀有度，支持互斥组与连锁效果
- 2000+ 年度事件、180+ 成就，以及名人模式、唯一角色生成
- 默认 10 连抽、选 3 个天赋，20 点属性自由分配（单项上限 10）
- 自动播放、属性涨跌动画、稀有天赋特效、深浅主题切换

### 修仙

- 100 岁自动入道，此后按年份积累修为
- 境界链：炼气 → 筑基 → 金丹 → 元婴 → 化神 → 炼虚 → 合体 → 大乘 → 渡劫 → 飞升
- 小境界自然提升，大境界需要突破；悟性、道心、灵根、大道、长期标记共同影响成功率与死亡风险
- 36 种橙色灵根，通过 9 张「灵根玉简」分组开奖
- 渡劫期需逐重扛过九重雷劫并集齐至少 5 条大道，方可引动飞升；达到 12 条大道则走向「超脱」
- 年度奇遇、宗门、延寿丹、走火入魔、魔修偷袭等随机内容
- 结局：飞升 / 超脱 / 转世 / 离世 / 身死

### 多人对战

- 最多 8 人，房间链接一键加入（`/?room=ABCD`）
- 每年由服务端统一发拍，各客户端本地推进，所有人看到同一个年份
- 同屏 N 列并排展示每个人的人生日志；4 人自动排成 2 × 2
- 任意玩家都可暂停 / 继续，并切换慢 / 正常 / 快 / 极速四档速度
- 房间弹幕（屏幕上保留最近 3 条，服务端不存历史）
- 全员结束才结算，排名停留 5 秒后回到大厅
- 仅桌面端开放；刷新页面即退出对局，不做断线重连

## 技术栈

TypeScript · React 19 · Vite · Jotai · Immer · Vitest · Bun · pnpm workspaces · WebSocket（ws）· Ink（终端版）

## 快速开始

需要 [pnpm](https://pnpm.io/) 与 [Bun](https://bun.sh/)：仓库脚本通过 `bunx --bun` / `bun` 运行，构建后的服务端产物可用 Node 启动。

```bash
pnpm install
pnpm build:data   # 把 xlsx 数据转成 TypeScript，首次运行和改表后必须执行
pnpm dev          # Web 前端，默认 http://localhost:5173
```

### 单人

打开 `http://localhost:5173`，点击「立即重开」即可。完整流程为：选择模式 → 抽天赋 → 分配属性 → 逐年播放人生 → 总结 / 成就。

### 多人

```bash
pnpm dev:server   # ws://localhost:8787
pnpm dev          # http://localhost:5173
```

开两个标签页访问 `http://localhost:5173/?room=TEST1`，房主点「开始对局」，各自选完天赋并分配完属性、进入对战页后自动开始推进。

前端连接地址的优先级：`?ws=wss://...` → 环境变量 `VITE_WS_URL` → 同域 `/ws`（https）或 `:8787`（http）。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Web 前端（Vite） |
| `pnpm dev:server` | 启动多人 ws 中继（`bun --watch`，默认 8787） |
| `pnpm dev:console` | 启动终端版（Ink） |
| `pnpm dev:prod` | 以 production 模式启动前端 |
| `pnpm build:data` | xlsx → TypeScript（输出到 `packages/data/dist`） |
| `pnpm build:web` | 构建 Web 静态产物 |
| `pnpm build:bili` | 构建 B 站 Toy 版本 |
| `pnpm build:console` | 构建终端版 |
| `pnpm preview` | 预览 Web 构建产物 |
| `pnpm test` | 前端 Vitest 测试 |
| `pnpm test:core` | 核心引擎测试（`bun test`） |
| `pnpm test:data` | 数据与平衡相关测试 |
| `pnpm test:protocol` | 多人协议端到端测试（自动起临时中继） |
| `pnpm test:client` | 多人客户端逻辑测试 |
| `pnpm lint` / `pnpm fix` | ESLint 检查 / 自动修复 |

## 项目结构

```
apps/
  web/                 React + Vite 前端（单人与多人共用）
  server/              多人 ws 中继：房间、节拍、弹幕，不跑游戏逻辑
  console/             终端版（Ink）
packages/
  core/                纯函数游戏引擎：抽天赋、开人生、逐年推进、修仙
  data/                xlsx 基础数据 + cultivation/ 修仙扩展数据
  condition/           条件表达式解析与求值
  hooks/               流程状态、存档、成就等 React hooks
  multi/               前后端共用的多人协议与常量
  vitex/               随机数、加权抽取等通用工具
thirdparty/
  bili-toy/            B 站 Toy 云存档与适配
docs/
  multiplayer.md       多人模式的设计、协议、规则与部署说明
```

## 多人模式架构

服务端不跑游戏逻辑，不知道事件内容，只做两件事：维护房间成员关系，以及决定「什么时候一起过一年」。

```
浏览器 A ──┐                   ┌── 本地 next() 推进一年，sync 属性 + 日志
           ├── ws 中继（房间）──┤
浏览器 B ──┘                   └── 本地 next() 推进一年，sync 属性 + 日志
```

- 每个人状态独立，没有共享世界，不需要做状态同步与冲突消解
- 服务端只广播 `tick`，客户端收到后本地推进，再上报自己的状态快照
- 日志只传事件 / 天赋 / 成就 id，文本由各端查本地数据表渲染，保证所有人看到的内容一致
- 协议、暂停 / 调速 / 结算规则、布局与弹幕细节见 [docs/multiplayer.md](./docs/multiplayer.md)

## 数据与平衡

- 基础内容在 `packages/data/src/*.xlsx`，由 `pnpm build:data` 生成为 `packages/data/dist/*.ts`（`dist` 不进版本库）
- 修仙扩展内容在 `packages/data/src/cultivation/*.ts`，运行时与基础表合并，扩展覆盖基础
- 境界、寿元、突破率、死亡风险等数值集中在 `packages/data/src/cultivation/realms.ts` 的 `REALMS` 与 `TUNING`
- 事件、天赋、成就都以数字 id 为键；多人同步只传 id，新增数据时不要复用已有 id

## 部署

```bash
pnpm build:web                                  # 产物在 apps/web/dist
pnpm --filter @remake/server build              # 产物在 apps/server/dist/index.js
NODE_ENV=production node apps/server/dist/index.js
```

服务端环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `ROUND_MS` | `1500` | 初始推进节拍（毫秒） |
| `RESULT_MS` | `5000` | 结算排名停留时长（毫秒） |
| `SYNC_STALL_MS` | `20000` | 存活玩家超过多久不上报，按已结束处理 |

反向代理需要把 `/ws` 转发到中继服务，并带上 `Upgrade` / `Connection` 头；`proxy_read_timeout` 要调大，默认 60 秒会把人踢下线。完整的 nginx 配置示例见 [docs/multiplayer.md](./docs/multiplayer.md)。

## 开发须知

- `packages/core` 保持纯函数、零 DOM 依赖，单人与多人两端共用同一份规则代码
- 多人模式下所有游戏逻辑在各客户端本地执行，服务端只同步 tick；改完服务端代码后需要重启进程，前端热更新不会影响服务端
- 修改 xlsx 后务必重新执行 `pnpm build:data`；修仙新增内容优先放进 `cultivation/*.ts`，避免重跑数据转换时丢失
- 多人局不计入成就，也不会触发 `end()` / `nextProfile()`

## 已知限制

- 多人模式客户端权威，没有防作弊；适合朋友之间游玩
- 不做断线重连：刷新页面按阵亡处理，重连会当成新玩家
- 不做房间列表、历史战绩与排行榜，房间只能靠链接分享
- 多人只同步最近 18 年日志，更早的不会出现在对手列
- 多人仅桌面端（触摸设备或窗口宽度小于 900px 时拒绝进入）

## 致谢与许可

原项目：[VickScarlet/remake](https://github.com/VickScarlet/remake)（人生重开模拟器），作者 神戸小鳥、神户小德。本仓库是在其基础上的二次开发版本：[jopatk123/remake](https://github.com/jopatk123/remake)。

本项目以 [MIT License](./LICENSE) 开源。

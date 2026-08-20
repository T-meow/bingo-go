# Bingo Go 前端重构方案：迁移到 bingo app-server（路线 A）

- 状态：已决策，v2（UI 交互已按现代 Agent 桌面端细化）
- 日期：2026-08-20
- 关联仓库：`D:/Projects/bingo-go`（本项目）、`D:/Projects/bingo`（上游运行时）
- 上游基准：yexrob/bingo `7bee209`（tag `v0.4.1`）
- 协议基准：`bingo app-server`，JSON-RPC 2.0 over NDJSON，schema bundle 位于上游 `schema/app-server/`
- UI 参考：`D:/Projects/dscode/apps/desktop`（DSCode Desktop 的布局与交互结构）
- UI 组件库：`antd@6.6.0` + `@ant-design/x@2.9.0`（继续使用，不换库）

> 原则：**bingo 以上游为准；bingo-go 只做客户端、不维护 fork、不保留 protocol v1 补丁；前端按 app-server 的会话/条目/队列/交互/协作模型直接大型重构，不保留旧结构。**
> 本次重构前已放弃 bingo-go 的全部未提交改动（详见 1.2），跳过 P0 基线冻结，直接进入契约先行 + 纵向切片的实施。

---

## 1. 背景与决策

### 1.1 bingo 仓库已归正到上游

本地 `D:/Projects/bingo` 已完成清理：

| 操作 | 结果 |
| --- | --- |
| `main` | 强制对齐 `origin/main` = `7bee209`（Merge PR #80，tag `v0.4.1`） |
| `dev` | 强制对齐 `origin/dev` = `d42b545` |
| `codex/gui-team-workspace` | 删除（原 `5aeedad`） |
| `feat/gui-json-events-windows` | 删除（原 `1eba2da`） |
| `feat/windows-home-settings-ui-protocol` | 删除（原 `34bae4d`） |
| `backup/gui-json-events-windows-pre-v0.4.0-20260812` | 删除（原 `0946d95`） |
| stash | 清除（原 `a12ecf4`） |
| fork remote | 删除，只保留 `origin = https://github.com/yexrob/bingo.git` |
| 本地忽略文件 | 删除 `.local/`（1.8M）与 `target/`（14G，旧 fork 构建产物） |
| 本地 tag | 全部保留（v0.2.0–v0.4.1 均存在于 origin） |

今后本机 bingo 只跟随 `origin/main`、`origin/dev` 与官方 tag。

### 1.2 bingo-go 未提交改动已放弃（跳过 P0）

本次重构不再需要保存以下工作区改动，已执行 `git restore` 并删除无用的 `NUL`：

- `package.json`、`package-lock.json`
- `src/renderer/src/features/chat/ChatPage.tsx`
- `src/renderer/src/features/team/TeamPage.tsx`
- `src/renderer/src/markdown.test.tsx`
- `src/renderer/src/styles.css`
- 未跟踪文件 `NUL`

当前工作区只保留本次产生的三处变更：`README.md`（新增本文档链接）、本方案文档与 `docs/ui-component-scan.md`（组件扫描）。**不设 P0 基线冻结，不兼容旧 UI，后续提交直接按大型重构执行。**

### 1.3 为什么是路线 A

- 上游已在 v0.4.1 删除 `--json-events`（protocol v1 NDJSON），以 `bingo app-server` 取代：TUI、`--print`、GUI 三方共用同一个 `AppCore`。
- 继续维护 v1 补丁等于长期 fork，会随上游 D77–D162 的演进持续付出同步成本。
- 上游已提供规范、实施计划、确定性 JSON Schema、客户端 store 参考实现（`src/tui/store.rs`）与 parity ledger（`src/app/parity.rs`），契约先行路线成熟。

### 1.4 目标与范围

**目标：**

1. bingo-go 打包与 CI 构建官方 `bingo v0.4.1`（`7bee209`），零补丁。
2. 主进程以 JSON-RPC 2.0 客户端驱动 `bingo app-server`；renderer 以“快照 + 有序事件流 + 本地物化 store”工作。
3. 前端不保留旧结构，按现代 Agent 桌面端重做信息架构（参考 DSCode Desktop，见第 5 章）。
4. **团队群聊是重点表达对象**：用上游 rooms/conversations/agents/deliveries 模型做出好用的成员群聊体验。
5. UI 组件继续使用 `antd` 与 `@ant-design/x`，按本次扫描能力做组件级设计（见第 5.1 节）。

**非目标：**

- 不在 bingo-go 内实现第二套 agent runtime；
- 不修改上游 bingo 协议（需要上游扩展的点显式标为 Open 项）；
- 不迁移终端 TUI 的快捷键/布局，只实现 GUI 语义；
- 不换 UI 组件库。

---

## 2. 当前基线与目标基线

| 维度 | 当前（v1 补丁线） | 目标（上游 v0.4.1 app-server） |
| --- | --- | --- |
| bingo 源码 | 官方 `9ed235c` + `vendor/bingo/v0.4.0-protocol-v1.patch` | 官方 `7bee209`，零补丁 |
| CLI 入口 | `bingo --json-events [--session id] [--probe/--inspect]` | `bingo app-server`（另含 `generate-schema` 子命令） |
| 线协议 | 自定义 NDJSON：`protocolVersion/commandId` + 事件 `seq` | JSON-RPC 2.0 NDJSON：request/response/notification/error |
| 能力协商 | 细粒度 capability 字符串 | `initialize` 握手；`ServerCapabilities`（`multiConversation/reasoning/images/rooms/shell/teams`）；client 声明 `interactionResponse` |
| 会话命名 | 客户端传 transcript stem / `sessionId` | `SessionLocator`（latest/stem/path）+ 服务端 opaque `sessionId` |
| ID 模型 | 客户端生成 `turnId/toolCallId/commandId` | 服务端 opaque ID，均以 epoch 为作用域：`epoch_/sess_/conv_/turn_/item_/int_/op_/asset_/queue_/agent_/room_/task_/dm_/cmd_/scope_/fb_` |
| 对话模型 | 单主会话 + Team v2 侧信道 | 一个 session 内多个 conversation：`main/agent/room` |
| 提交 | `turn.start` | `conversation/submit`，disposition：`turnStarted/queued/delivered/applied/operationStarted` |
| 轮次 | `turn.started/text.delta/tool.ready/tool.done/turn.completed` | `turn/*` + `item/*`（item 是权威语义条目） |
| 中断 | `turn.cancel` | `turn/interrupt`（幂等） |
| 权限/提问 | `prompt.request/respond` | 持久 `interaction/opened` + `interaction/respond` |
| 上下文用量 | `context.subscribe/context.usage` | `conversation/read.contextUsage` + `turn/usageUpdated` |
| 附件 | `attachment.add`（base64 直传） | `asset/registerPath` + `asset/readChunk` |
| 历史恢复 | Electron 直接解析 JSONL + `.turns.json` | `session/list`、`conversation/read` 权威快照 |
| 编辑/恢复 | `session.fork` | `conversationRewind`（preview/applied）+ `session/resume` |
| 设置 | `providers.list/models.list/settings.get` + 本地文件写 | `catalog/read`（session 前可用）+ `config/read`（session 后）+ `action/execute` + `config/changed` |
| 团队 | `team.*` 命令/事件 + blueprint v2/lobby/tasks/presets | `resource/read`（agents/rooms/tasks/deliveries/backgroundCommands）+ `action/execute`（teamStart/Stop/Assign/Scaffold/MemoryGc、roomJoin/Leave）+ 协作通知 |
| 错误 | `error` 事件 | JSON-RPC `error` + `error.data.bingoCode` + `feedback/raised/cleared` |
| 退出码 | 未形成协议 | 0 = clean EOF/shutdown；1 = transport failure；2 = CLI usage |

---

## 3. 目标架构

### 3.1 总图

```text
React renderer (sandboxed, contextIsolation)
      | typed IPC（Zod 校验，allowlist）
      v
Electron main（信任边界）
      | AppServerClient：JSON-RPC 2.0 / NDJSON / stdio
      |   framing · request 关联 · seq/eventCursor 校验 · 有界缓冲 · snapshot resync
      v
bingo app-server（官方 v0.4.1，未修改）
      | AppCore：会话 actor，conversations/turns/items/queue/interactions/operations
      ` Engine：query loop / tools / agents / rooms / tasks
```

安全边界保持现状，并把“协议行上限”显式实现为客户端义务：

- renderer 不接触 Node、Shell、文件系统、子进程；
- main 只接受 preload 的 allowlist IPC；
- `AppServerClient` 只通过参数数组启动 `bingo app-server`，不拼接 shell；
- 客户端帧 ≤ 1 MiB、服务端帧 ≤ 8 MiB（以 `initialize` 返回值为准）；
- API key 不进入 renderer 状态、日志、蓝图、任务或游戏包。

### 3.2 主进程新组件

```text
src/main/runtime/
  appServerTransport.ts       NDJSON 组帧/拆帧、backpressure、写超时、请求号、事件 seq 校验
  appServerConnection.ts      initialize/initialized/shutdown、request/notification 路由、错误映射
  appServerSession.ts         高层会话客户端（替代 StdioBingoSession）
  appServerInspector.ts       catalog/read 的无会话检查模式（config/read 需先 session/start）
  sessionManager.ts           重写：connectionId + serverEpoch + snapshot 管理
  runtimeLocator.ts           重写 probe：`bingo --version` + app-server initialize/shutdown
  processTree.ts / binaryCommand.ts  保留
src/main/storage/
  settingsRepository.ts       保留（Provider/MCP 定义等本地写入），输入输出对齐 config/read
  agentDefinitionRepository.ts 新增：~/.config/bingo/agents 与 .bingo/agents 的 Markdown 定义编辑
  teamBlueprintRepository.ts  新增：.bingo/team.json 的 revision 安全读写（本地适配）
  transcriptRepository.ts     退役，由 AppServerClient 的 session/conversation 读取取代
```

### 3.3 Renderer 新状态模型（客户端 store）

参考上游 `src/tui/store.rs` 的语义，在 TypeScript 中实现同样的客户端 reducer：

```text
session/read 或 conversation/read 的原子快照
                +
       有序 AppEvent 通知流（seq gapless）
                |
                v
      appStore（纯函数 reducer）
        · session summary / config / capabilities
        · conversations: Map<ConversationId, ConversationSummary>
        · transcripts: Map<ConversationId, { log: Item[], live: Item[], generation, tail }>
        · queues: Map<ConversationId, { revision, entries }>
        · interactions / operations / feedback
        · agents / rooms / tasks / deliveries / backgroundCommands（替换式集合）
                |
                v
      React hooks / selectors（只读物化视图，不含业务规则）
```

关键规则（从上游协议照搬）：

1. 通知 `seq` 严格递增无洞；检测到洞或 revision 不匹配 → `session/read` / `conversation/read` 整体替换本地状态，不做猜测式补丁。
2. `item/started` 进入 `live`，delta 只追加；`item/completed` 是权威终态，移入 `log`；`turn/retrying` 的 `removedItemIds` 精确撤回失败尝试。
3. 文本/推理是追加 delta；命令 tail、item 更新、集合成员是整体替换。
4. `coalescedFrom` 表示合并帧覆盖的 seq 区间，客户端按区间判断连续。
5. 本地 UI 状态（展开/折叠、滚动、页面选择、草稿）不进 appStore。

### 3.4 Preload / IPC 契约

- `src/shared/contracts/appServer.ts`：JSON-RPC 信封、request/notification/error、snapshot/domain 类型（由 schema bundle 生成）。
- `src/shared/contracts/ipc.ts`：重写，保留通用 `Result<T>` / `GuiError`，删除 v1 `CliEvent/TeamSnapshot/TeamTask` 直接透传。
- 异步事件仍走单一 `session:event` 通道，payload 为 `{ connectionId, seq, kind, event }`。

---

## 4. 协议迁移映射（v1 → app-server）

### 4.1 启动、探测、检查

| v1 | app-server |
| --- | --- |
| `bingo --json-events --probe` | `bingo app-server`：发送 `initialize`，收到 `initialize.result` 后 `shutdown`。探测结果改为 `{ bingoVersion, protocol:{major,minor}, serverCapabilities, limits, epoch }` |
| `bingo --json-events --inspect` | `bingo app-server` 先 initialize；session 前只调用 `catalog/read`（models/providers/skills/images/mcpServers）做发现；`config/read` 需在 `session/start` 之后 |
| 细粒度 capability 字符串 | `ServerCapabilities`；UI 按布尔能力显隐 |
| `protocol.ready` / `inspection.ready` | JSON-RPC `initialize` response；无 session 通知 |

### 4.2 会话生命周期

| v1 | app-server |
| --- | --- |
| 新会话：`session.ready` | `session/start {cwd, provider?, model?, thinking?, permissionMode?}` → `SessionSnapshot` |
| 恢复：`--session <stem>` | `session/resume {locator}` → `SessionSnapshot` |
| 会话列表：直接读 JSONL | `session/list`（locator/title/updatedAt/messageCount/cwd/open） |
| 重命名 | `action/execute {action:{type:"sessionRename",name}}`；同一 epoch 内 `sessionId` 不变，locator 变化由 `session/updated` 报告 |
| 删除 | `session/delete {locator}`；有 confirmation interaction |
| 关闭 | `session/close`（或连接 `shutdown`） |
| 工作区绑定 | 新会话由 `session/start.cwd` 表达；不再有 `--bind-session-workspace` 特例 |
| 分叉（fork） | 删除。用 `conversationRewind`（见 4.7） |

### 4.3 对话、轮次、队列

- 打开会话即获得 `SessionSnapshot`：包含 `conversations`、`activeTurns`、`interactions`、`operations`、`collections` 与 `eventCursor`。
- 用户输入统一走 `conversation/submit`：
  - 主对话输入：`Submission.Composer{ mode: normal|shell, text, attachments }`；
  - 向 agent 发定向消息：对 agent conversation 提交（推荐 `SendProse`，绕过 slash/shell/地址语法解析）；
  - 向 room 发消息：对 room conversation 提交 `SendProse`；服务端自动处理未加入房间语义。
- disposition 处理：
  - `turnStarted` → 等 `turn/started` 与 `item/*`；
  - `queued` → UI 显示“排队第 N 位 / 可被吸收”，后续由 `queue/itemAbsorbed` 或 turn 完成后 drain；
  - `delivered` → 已投递，等 `delivery/changed` 与对方会话 item；
  - `applied` → action 同步结果；
  - `operationStarted` → 等 `operation/*`。
- `turn.cancel` → `turn/interrupt {turnId}`。
- 队尾撤回 → `queue/reclaimTail`。
- 事件映射：v1 的 `text.delta/tool.ready/tool.done/turn.completed` 不再单独存在；客户端以 `item/*` 与 `turn/*` 为准。**`item/completed` 的 toolCall item 已携带权威结果**。

### 4.4 权限、提问、确认

- `interaction/opened` 携带 `InteractionPrompt`：
  - `permission`：`decisions: allowOnce|allowSession|deny`、`sessionScope`、`preview`、`allowsFeedback`、`remainingGuardMs`；
  - `question`：`options/allowsFreeText`；
  - `confirmation`：破坏性操作二次确认。
- 回答：`interaction/respond {interactionId, activation: pointer|keyboard, decision}`。
- `interaction/resolved|cancelled` 取代 `prompt.resolved`；权限回执进入 `permissionReceipt` item，问题答案进入 `questionAnswer` item。
- `deny` 可带 `feedback`。

### 4.5 设置、目录、Provider、模型、MCP

- **读**：`catalog/read`（models/providers/skills/images/mcpServers）；`config/read`（selection/permissions/layers/mcp）返回 `ConfigSnapshot`。
- **运行时选择（写）**：`action/execute`：`modelSelect/providerSelect/thinkingSelect/permissionModeSet/themeSet`、`mcpEnable/mcpDisable/mcpReconnect`、`permissionRuleAdd/permissionRuleRemove`。
- **定义级写（Provider 定义、API key、MCP server 配置）**：app-server v1 不携带 credential 写入。保持 `SettingsRepository` 的本地 revision/备份/原子写，写完触发新连接或等待 `config/changed`。候选上游扩展：`config/update`（Open-1）。
- 旧 `settings.result` 的扁平字段全部由 `ConfigSnapshot` 与 `Catalog` 取代。

### 4.6 附件、图片、大输出

- 注册：renderer 选文件 → main 校验 → `asset/registerPath {path, expectedMime?, expectedSha256?}` → 得到 `AssetRecord`；服务端自行落盘，主进程可删除临时文件。
- 展示：conversation item 引用 `assetId` → `asset/readChunk {offset,length}` 分块读取；图片构造 blob URL。
- 大工具输出：item 携带 bounded preview + artifact `assetId`。
- 旧 `attachment.add` 与 `attachment.ready` 删除。

### 4.7 历史、编辑、恢复

- 历史列表：`session/list`；历史内容：`session/resume` + `conversation/read`（分页 item cursor + `historyGeneration`）。
- 编辑上次提问：`conversationRewind {target:{type:"item",itemId}, mode:"preview"}` → 确认 interaction → `mode:"applied"` → 提交新文本。不再创建 fork 子 transcript。
- 中断恢复：`session/resume` 恢复被中断 session；上游保证中断轮以终态 `interrupted` 落 transcript。
- `.turns.json` / fork reason / parent session 概念从 renderer 删除；`TranscriptRepository` 退役。

### 4.8 Team v1/v2 → 上游协作模型

| 旧功能 | 新实现 |
| --- | --- |
| Team v2 蓝图（schemaVersion 2 + memberId/profile/constraints/preferences） | 上游 `.bingo/team.json` 蓝图（name/channel(s)/members/teams；成员 `name/agent/avatar/model/provider/thinking`）。由 `teamBlueprintRepository` 本地 revision 安全编辑，运行期用 `action/execute` |
| 固定成员大厅（lobby） | 删除。改为 blueprint 声明的 **rooms**；房间是 conversation，消息是 `roomMessage` item |
| 任务群聊（TeamTask） | 删除。改为 `resource/read tasks` 的 TaskResource；讨论发生在 agent/room 会话 |
| 角色库（AgentDefinition CRUD via protocol） | 改为本地 Markdown 定义（`~/.config/bingo/agents`、`.bingo/agents`）的展示与编辑 |
| 团队预设导入/导出（.bingo-team） | 删除。P6 可选本地打包 `.bingo/team.json` + `.bingo/agents`，不是 wire 能力 |
| 项目头像上传/规范化/读取 | 删除。改用上游 8 张内置头像的固定词汇表（与 bingo 一致），未知 id 回退到名称哈希 |
| 成员活动、promote/useful、member restart | 映射到 `agent/changed` 的 AgentResource（state/recentActivity/pending/unacked）与 `teamStop {member}`；无 promote |
| 频道历史/发消息 | room conversation：`conversation/read` + `conversation/submit SendProse`；`conversation/markRead` 管理已读/mention |
| 大厅消息选择后创建任务 | 删除。TaskResource 直接管理 |

这是有意的一致性取舍：bingo-go 旧 Team v2 的 lobby/tasks/presets 表达能力高于上游，路线 A 选择跟随上游语义。UI 如何把它“表达好”见第 5.8 节。

---

## 5. UI 交互设计（v2：现代 Agent 桌面端 + AntD 组件映射）

### 5.0 设计参照：DSCode Desktop 的结构，不复制其样式

`D:/Projects/dscode/apps/desktop` 是当前最接近目标形态的本地 Agent 桌面端。我们**借用它的结构骨架和交互习惯**，但组件全部换成 AntD/Ant Design X：

| DSCode 结构 | 借鉴内容 | 在 bingo-go 的落点 |
| --- | --- | --- |
| 左侧 `sidebar`（workspace/project/task/recent threads） | 工作区 + 会话树，项目下按线程分组 | 会话侧栏：当前工作区 → Main/Agents/Rooms 分组 |
| 中间 `thread-layout` + `conversation-column` | 单个 conversation 页面，消息流 + work-log + composer 固定底部 | 统一 `ConversationCanvas` |
| 右侧 `context-rail` / `preview-panel` | 可折叠上下文卡 + 文件/工具检查器，拖动调宽 | 右侧 Inspector：Context 卡 + Item/Turn/Room/Roster 检查器 |
| `composer` + attachment strip + toolbar + send/stop | 输入区承载附件、模型/权限切换、停止按钮 | `Sender` + `Attachments` + 自绘 prefix/footer |
| inline `inline-request` / `approval-dialog` | 权限与提问不打断主线程，就地呈现 | `InteractionCard`（inline）+ `Modal`（confirmation） |
| `work-log` timeline | 工具调用/子步骤折叠式时间线 | `ThoughtChain` / `Timeline` |
| `context-card`（ring、tokens、cache、cost） | 上下文占用可视化 | `Progress type="dashboard"` + `Statistic` + `Descriptions` |
| `settings-dialog` / `command-palette` / `session-search` | 全局命令入口与会话搜索 | `Modal` + `Input.Search` + `action/list` 驱动的 Command Palette |
| `plan-todo` | 计划步骤可见 | 以 `notice`/`assistantMessage` 中的 plan 语义渲染；不发明新协议字段 |

**三条不抄的原则：** DSCode 是单 runtime 内嵌 Core + 自定义 CSS；bingo-go 是子进程协议客户端 + AntD 主题。交互结构可以像，实现层必须走 app-server 语义。

### 5.1 组件库能力扫描（已核对本地 node_modules）

#### 5.1.1 `antd@6.6.0`：76 个组件导出

```text
Affix Alert Anchor App AutoComplete Avatar BackTop Badge BorderBeam Breadcrumb
Button Calendar Card Carousel Cascader Checkbox Col Collapse ColorPicker
ConfigProvider DatePicker Descriptions Divider Drawer Dropdown Empty Flex
FloatButton Form Grid Image Input InputNumber Layout List Listy Masonry Mentions
Menu message Modal notification Pagination Popconfirm Popover Progress QRCode
Radio Rate Result Row Segmented Select Skeleton Slider Space Spin Splitter
Statistic Steps Switch Table Tabs Tag theme TimePicker Timeline Tooltip Tour
Transfer Tree TreeSelect Typography Upload version Watermark
```

本方案重点使用的能力：

| antd 组件 | 用法 |
| --- | --- |
| `App` + `ConfigProvider` + `theme` | 全局 message/modal/notification 上下文与暗亮主题 token |
| `Layout` / `Flex` / `Splitter` / `Grid` | 应用骨架与可拖拽分栏（Splitter.Panel 替代手写 resizer） |
| `Listy` | **虚拟化长列表**：长 transcript、房间消息流；支持 sticky group header 与按 key 滚动 |
| `Masonry` | 团队 Roster/Rooms 卡片瀑布布局 |
| `Card` / `Avatar` / `Badge` / `Tag` | 成员卡、房间卡、状态徽标、mention/unread 计数 |
| `Table` | Tasks/Deliveries 列表与过滤排序 |
| `Tree` / `TreeSelect` / `Cascader` | 会话树、目录选择、复杂选择器 |
| `Mentions` | 输入框内 `@成员`、`#房间` 联想 |
| `Drawer` / `Modal` / `Popconfirm` / `Popover` | 设置、蓝图编辑、破坏性确认、行内详情 |
| `Tabs` / `Segmented` / `Menu` | 主导航、Workspace 分区、设置分区 |
| `Progress`（dashboard/circle/line） | 上下文占用环、operation 进度 |
| `Statistic` / `Descriptions` | Context 卡 token/cache 数值、资源检查器字段 |
| `Timeline` / `Steps` | 轮次重试、operation 生命周期、任务步骤 |
| `Skeleton` / `Empty` / `Result` / `Alert` | 加载、空态、错误态 |
| `Input.Search` / `AutoComplete` | 会话搜索、命令面板、模型选择 |
| `Upload`（底层）+ `Image` | 附件选择与图片预览（实际文件注册走 `asset/registerPath`） |
| `Typography.Paragraph/Text` | Markdown 文本与截断预览 |
| `FloatButton` / `BackTop` / `Affix` | 回到最新、快速入口、粘性 header |

#### 5.1.2 `@ant-design/x@2.9.0`：19 个导出

```text
Actions Attachments Bubble CodeHighlighter Conversations FileCard Folder
Mermaid notification Prompts Sender SenderSwitch Sources Suggestion Think
ThoughtChain Welcome XProvider version
```

重点能力核对：

- **`Bubble` / `Bubble.List` / `Bubble.System` / `Bubble.Divider`**
  - `Bubble.List` 支持按 `role` 批量配置 `placement/variant/shape/avatar/footer`，角色可自定义（`ai/system/user/divider` + 任意字符串）。
  - `Bubble` 支持 `streaming`、`typing`（打字机动画）、`loading`、`editable`、`contentRender`、`header/footer/avatar/extra` 槽位。
  - 适合：main 对话、agent DM、room 群聊，所有语义消息共用一套气泡渲染器。
- **`Sender`（含 `Sender.Header` / `Sender.Switch`）**
  - `value/loading/disabled/readOnly/submitType`，`onSubmit/onCancel/onPasteFile`，`prefix/header/footer/suffix` 槽位，`autoSize`，`allowSpeech`。
  - `slotConfig` 支持 text/input/select/tag/skill/custom 槽位；`skill` 提供可关闭技能 chip。
  - 适合：主 Composer。用 `Sender.Switch` 切 normal/shell 模式，用 `footer` 放附件条/模型/权限/队列状态，`skill` 放 `/命令` chips。
- **`ThoughtChain` / `ThoughtChain.Item` / `Think`**
  - 节点支持 icon/title/description/content/footer/status/collapsible/blink。
  - 适合：轮次内工具链（Bash→Edit→Test）、agent 最近活动、operation 进度链。`Think` 适合推理块折叠。
- **`Actions`**
  - 消息/成员操作组，支持 subItems、dropdown、danger、fadeIn。
  - 适合：消息操作（复制/编辑/重新提交）、成员操作（发消息/停止/分配）。
- **`Attachments`（含 `FileCard`/`FileCard.List`）**
  - `items/placeholder/overflow/upload/select`，与 Upload 语义兼容，支持拖放。
  - 适合：Composer 附件条与 asset item 的文件卡。**但上传必须改道：本地 File → main 临时文件 → `asset/registerPath`，不能使用组件默认直传 URL。**
- **`Conversations`**
  - 会话列表：`items/activeKey/menu/groupable/creation/shortcutKeys`。
  - 适合：Main/Agents/Rooms 会话树，menu 挂重命名/删除/标记已读。
- **`Prompts` / `Welcome` / `Suggestion`**
  - `Prompts`：空态启动引导卡片；`Welcome`：欢迎屏；`Suggestion`：输入联想（支持 children render prop）。
  - 适合：空会话引导、`@成员`/`#房间`/`/命令` 联想。
- **`Sources` / `CodeHighlighter` / `Mermaid`**
  - 来源引用折叠条、代码高亮、Mermaid 图。
  - 适合：Markdown 渲染增强、工具输出预览。
- **`XProvider`**
  - 统一 X 组件主题与 ConfigProvider 上下文，全局唯一入口。
- **注意：v2.9.0 没有 `useXAgent/useXChat` 等 hooks 导出。** 运行态统一由本项目自己的 `appStore` 承担，不使用任何 X 内部 hook。

### 5.2 应用骨架（四区布局，替代旧 AppShell）

```text
┌─────┬──────────────┬───────────────────────────────┬────────────┐
│ Nav │ 会话侧栏      │ ConversationCanvas              │ Inspector  │
│ Rail│ 工作区        │  header: 标题/runState/queue     │ Context    │
│ 56px│ Main/Agents/ │  virtual transcript (Listy)      │ /Turn      │
│     │ Rooms 树      │  14 类 semantic items            │ /Room      │
│     │ + 新建/搜索   │  composer (Sender) 固定底部       │ /Roster    │
└─────┴──────────────┴───────────────────────────────┴────────────┘
```

- 使用 `Layout` + `Splitter`：`Splitter.Panel` 负责侧栏/检查器可拖拽；最小宽度：侧栏 240、canvas 440、inspector 320（参考 DSCode 的最小宽度约定）。
- 窄屏（<980px）：侧栏与检查器收进 `Drawer`，导航保持底部或左侧 rail。
- 全局状态由 `AppProvider`（`antd App` + `XProvider` + `AppearanceProvider`）统一注入。
- 全局命令面板（`⌘K`）：数据源为 `action/list`，命令按 `ActionFamily` 分组，`Input.Search` 过滤，`List` 展示；支持 `runState` 下显隐 disabled。
- 会话搜索（`⌘P`）：`session/list` + 本地标题过滤。
- 顶部不做复杂 toolbar：model/provider/thinking/permission 作为 Composer 的 footer chips 与 Inspector 的 detail 展示。

### 5.3 会话世界信息架构

旧的 `chat / team / settings` 三视图改为：

```text
BINGO GO
├─ 会话（Conversations）         ← 所有 conversation 的列表 + 一个统一 canvas
│   ├─ Main                      ← @main，用户与主 agent
│   ├─ Agents                    ← 每个 AgentResource 一个 conversation
│   └─ Rooms                     ← 每个 RoomResource 一个 conversation
├─ 团队（Workspace）             ← 资源管理视图
│   ├─ Roster / Rooms / Tasks / Deliveries
├─ 设置
└─ 游戏中心
```

会话行信息（来自 `ConversationSummary`）：`kind`、`title`、`runState`、`unread`、`mentions`、`obligations`、`queueCount`、`pendingInteractions`、`isMember`。

### 5.4 ConversationCanvas：14 类语义 item 的统一渲染

渲染管线：`TranscriptProjection { log, live }` → 扁平 item 列表 → `Listy`（`virtual`，rowKey=item.id，分组可 sticky）→ 每个 item 走 `ItemRenderer`。

| Item.body.type | AntD/X 呈现 | 状态语义 |
| --- | --- | --- |
| `userMessage` | `Bubble placement="end"` + `FileCard` 附件 | completed |
| `assistantMessage` | `Bubble placement="start"`，`streaming` + Markdown + `CodeHighlighter`/`Mermaid` | streaming → completed |
| `reasoning` | `Think` 可折叠，`blink` 表示进行中 | streaming → completed |
| `toolCall` | `ThoughtChain.Item` 或独立 ToolCard：icon/name/summary/status + 输入/输出/diff/duration | pending/streaming → completed/failed/cancelled |
| `command` | 终端卡：`CommandTail` 整体替换；深色 `<pre>` 固定高 | streaming → completed |
| `peerMessage` | `Bubble` role 自定义（from/to），header 显示 sender + delivery 状态 | completed |
| `roomMessage` | `Bubble` role=member，header 显示成员头像/名称 + `@mention` 高亮 + roomSeq | completed |
| `compaction` | `Bubble.System` + `Descriptions`（beforeTokens/afterTokens/replacedMessages/durationMs） | completed |
| `rewind` | `Bubble.System` + 可撤销提示 | completed |
| `interruption` | `Bubble.System`（中断 marker） | completed |
| `notice` | `Alert` 或系统行，按 NoticeLevel 着色 | completed |
| `questionAnswer` | 小气泡：问题 + 用户答案 | completed |
| `permissionReceipt` | 回执行：`Tag` 显示 allowOnce/allowSession/deny + feedback | completed |
| `asset` | `FileCard`（图片走 `asset/readChunk` → blob URL，`Image` 预览） | completed |

轮次包装规则：

- `turn/started` 创建 TurnGroup 头（origin/startedAt/usage）；
- 同一 `turnId` 的 live items 收进组；
- `turn/retrying` 按 `removedItemIds` 删除失败 attempt，显示 `Steps`：attempt/maxAttempts/delayMs；
- `turn/completed` 封组，显示 usage 与错误（若 failed）。

消息操作（每条 item 上 `Actions`）：

- assistant/userMessage：复制、编辑（rewind 流程）、重新提交；
- toolCall：复制输入/输出、定位所属 turn；
- roomMessage/peerMessage：复制、跳转来源会话。

### 5.5 Composer（一个 Sender 承载全部输入语义）

- 基础：`Sender` 受控 `value`，`loading=running`（运行中显示停止按钮，`onCancel → turn/interrupt`），`submitType="enter"`。
- 模式：`Sender.Switch` 切 normal/shell；shell 模式 placeholder 变为“以 ! 命令执行”。
- 槽位：
  - `prefix`：模型/Provider/Thinking/Permission 状态 chips（点击开 `Popover` 选择器，写操作走 `action/execute`）；
  - `footer`：`Attachments` 缩略条 + 队列状态（`Queued: pos/N · steer-eligible`）+ “撤回队尾”（`queue/reclaimTail`）；
  - `skill`：`/命令` chips，数据来自 `action/list`；
  - `suffix`：发送/停止、附件选择、语音（`allowSpeech`，若平台支持）。
- 提及：用 `Suggestion` 包裹 Sender，`items` 来自 roster rooms + members；选择后插入 `@name` / `#room`。
- 附件：`Attachments` 只负责选择与预览；提交前 main 调 `asset/registerPath`，拿到 `assetId` 后随 `Submission.attachments` 提交。
- 空态：无历史 conversation 显示 `Welcome` + `Prompts`（“运行测试 / 修复类型错误 / 总结最近改动”等固定 prompt，点选即填入）。

### 5.6 Interaction（权限 / 提问 / 确认）

- 统一 `InteractionCard`，按 `interaction/opened` 的 `prompt.type` 分三态：
  - `permission`：Card 头显示 tool/preview（command 用代码块，diff 用 `CodeHighlighter`）；决策按钮严格来自 `decisions`：`allowOnce/allowSession/deny`；`remainingGuardMs` 倒计时控制键盘确认；deny 展开 feedback 输入。
  - `question`：`options` 渲染为单选列表；`allowFreeText` 显示额外输入框。
  - `confirmation`：`Modal`，按钮文案来自 `confirmLabel`。
- 回复全部走 `interaction/respond`，`activation` 由 UI 事件来源决定（鼠标=pointer，Enter/Space=keyboard）。
- 卡片出现在所属 conversation 的尾部，但不进入 appStore 的 transcript；快照恢复时从 `SessionSnapshot.interactions` 重建，未回答可继续回答。

### 5.7 右侧 Inspector 与 Context 卡

Inspector 按当前对象切换面板：

1. **Conversation 面板**：`Descriptions`（kind/runState/revision/historyGeneration）、queue 预览、pending interactions、obligations。
2. **Turn 面板**：`Steps`（round/attempt）、`TurnUsage`（input/output/cache read/write，`Statistic`）。
3. **Context 卡（常驻顶部）**：`Progress type="dashboard"` 显示 `used/window`，副行显示 `trigger`；数值用 `Statistic`；token/cache 来自最近 `turn/usageUpdated`。dscode 的 cost 在本协议没有字段，不显示（Open-5 候选）。
4. **Tool 面板**：输入/输出/diff/artifact；`asset/readChunk` 分页读取。
5. **Room/Roster 面板**：见 5.8。
6. **Operation 面板**：`operation/started→progress→completed` 渲染为 `Timeline`；`Progress` 显示 done/total。

### 5.8 团队群聊表现（本方案的重点）

目标形态：**把“固定团队协作”表达成一组彼此可进入的会话 + 一个总览工作台**，而不是旧版的 lobby/tasks/roles 四宫格。

#### 5.8.1 Workspace 总览

`WorkspacePage` 顶部为团队操作条：

- `Button`：启动 Team（`teamStart`，可选择成员子集）、停止（`teamStop`）、分配（`teamAssign`）、新建团队（`teamScaffold`）、Memory GC；
- 这些动作若返回 `operationStarted`，操作条右侧显示 `operation/progress` 的 `Progress`。

主体用 `Segmented` 或 `Tabs` 切四个资源视图：

| 视图 | 组件 | 内容 |
| --- | --- | --- |
| Roster | `Masonry` + `Card` | 成员卡：头像、name、def、kind、state（Badge）、pending/unacked、model/provider/thinking、recentActivity（最近 3 条 ToolTag） |
| Rooms | `Masonry` + `Card` | 房间卡：mode（broadcast/relay）、members 头像组、messageCount/lastSeq、unread/mentions Badge、`userIsMember` 决定“加入/离开/打开”按钮 |
| Tasks | `Table` | subject/status/owner/activeForm/blocks/blockedBy；行操作与筛选 |
| Deliveries | `List`/`Table` | from→to、private、state Timeline 色点、followUps/reason |

Roster 卡与 Room 卡的 `Actions`：打开会话、发消息、停止成员、加入/离开房间。

#### 5.8.2 Room = 团队群聊主界面

房间 conversation 使用与 main 对话完全相同的 `ConversationCanvas`，但渲染策略不同：

- **成员身份即角色**：`Bubble.List` 的 `role` 用成员名（如 `role: { scout: {...} }`），每个成员配置固定 `avatar`（内置头像或首字母色块）、`placement:"start"`；用户消息 `placement:"end"`；`@main` 与系统消息用 `Bubble.System`。
- **气泡头部**：成员名 + 头像 + `roomSeq`；`roomMessage.mentions` 在正文中高亮，并累计到 conversation 的 `mentions`。
- **系统行**：成员加入/离开/房间冻结等语义用 `Bubble.Divider` 或 `Bubble.System`，不打断气泡流。
- **大厅等价物**：blueprint 声明的第一个房间（或唯一房间）被 Workspace 固定置顶为 “Team 大厅”。旧 lobby 的“广播/定向”语义由 `#room 广播` 与 agent DM 两种路径自然替代；不重新发明 lobby 状态。
- **串行/中继模式**：Room 卡与 header 显示 `RoomMode`（`broadcast=广播`、`relay=中继`），给用户明确的发言扩散预期。
- **未读与提及**：`conversation/markRead` 只在内容可见时调用；离开页面前不标已读。侧栏 Badge 显示 `unread/mentions`。
- **输入**：Room Composer 使用 `SendProse`，顶部 `Suggestion` 提供 `@成员` 联想；不解析 slash/shell（避免误触发命令）。

#### 5.8.3 Agent DM = 成员私聊

- 每个 agent 是一个 conversation。打开后：历史 item 流 + 成员活动摘要（`ThoughtChain`：recentActivity）。
- 头部显示 AgentResource：state、engine、prompt、pending/unacked。
- 发送消息走 `SendProse`；投递状态由 `delivery/changed` 与 `peerMessage` item 呈现（queued/delivered/read/answered/dropped）。
- 忙碌成员不打断：UI 显示 busy 与 pending 计数，不做排队唤醒的本地逻辑（规则在服务端）。

#### 5.8.4 群聊状态的可视语言

| 状态 | 呈现 |
| --- | --- |
| agent running | 头像外圈 `Badge status="processing"`，卡上 `Tag color="processing"` |
| agent idle/stopped | `Badge status="success/default"` |
| room unread/mention | `Badge count` 红点 |
| 消息已读/已答 | delivery 状态点：queued 灰、delivered 蓝、read 青、answered 绿、dropped 红 |
| task 状态 | `Tag`：pending 默认、inProgress 蓝、completed 绿、cancelled 红 |
| operation 进度 | `Progress` 条 + 文本 label |

### 5.9 设置、命令、搜索

- **设置页**：右 Drawer（720px）或独立 view，左 `Menu` 分区：
  - Provider/模型：`catalog/read` 数据，`action/execute` 运行时选择；Provider 定义/API key 走本地 `SettingsRepository`；
  - 权限：`config/read.permissions` + `permissionRuleAdd/Remove`；
  - MCP：`config/read(mcp)` + `mcpEnable/Disable/Reconnect`；
  - 外观：`AppearanceRepository` 本地偏好 + `themeSet`；
  - 关于/诊断：bingo 版本、协议版本、schema bundle SHA、连接状态。
- **Command Palette**：`Modal` + `Input.Search`，数据源 `action/list`；每项显示 `family/label/description/available`，支持键盘上下选择。
- **会话搜索**：`session/list` + 标题/路径过滤；搜索框用 `AutoComplete`。

### 5.10 主题与视觉

- 全局使用 `XProvider` 包裹 `antd App` + `ConfigProvider`；X 组件 token 与 antd token 同源配置。
- 保留 `AppearanceProvider` 的 system/light/dark、accent、density、motion。
- 团队头像使用 bingo 的 8 张内置头像；主 agent 与用户分别固定主色，避免“群聊里分不清人”。
- 房间/成员消息的视觉密度采用 `density` 偏好：comfortable 显示头像+头部，compact 只显示小头像+单行头。

---

## 6. 数据与状态设计

### 6.1 appStore 形状（建议 TypeScript 接口）

```ts
type AppStore = {
  connection: { connectionId: string; serverEpoch: EpochId } | null
  session: SessionSummary | null
  capabilities: ServerCapabilities | null
  config: ConfigSnapshot | null
  conversations: Map<ConversationId, ConversationSummary>
  conversationKeys: Map<ConversationId, 'main' | { kind: 'agent'; agentId: AgentId } | { kind: 'room'; roomId: RoomId }>
  turns: Map<TurnId, Turn>                     // 未终态
  interactions: Interaction[]                  // 有序
  operations: Operation[]
  feedback: Feedback[]
  transcripts: Map<ConversationId, TranscriptProjection>
  queues: Map<ConversationId, QueueProjection>
  agents: Collection<AgentResource>
  rooms: Collection<RoomResource>
  tasks: Collection<TaskResource>
  deliveries: Collection<DeliveryResource>
  backgroundCommands: Collection<BackgroundCommandResource>
  lastEventCursor: number | null
}
```

### 6.2 ID 与生命周期规则

- 所有资源 id 由服务端在 `serverEpoch` 内铸造；客户端只持久化 `locator`，**绝不跨 epoch 复用旧 id**。
- `session/start`/`session/resume` 返回的 snapshot 携带本 session 的 `epoch`；换 session = 换 epoch = 清空 store。
- 客户端唯一自行生成的 id 是 `connectionId`（Electron 连接标识）与 IPC 请求 id。

### 6.3 resync 与背压

- 传输层维护 `expectedSeq`；收到 `seq !== expectedSeq`（考虑 `coalescedFrom` 区间）→ 标记 `desynchronized` → 读 `session/read`（或受影响 conversation 的 `conversation/read`）→ 整体替换 store。
- 主进程到 renderer 用有界队列：慢 renderer 只允许触发一次 `desync + 重读`，不允许无限内存缓冲。
- 主进程到 bingo 的 stdout 由 `AppServerTransport` 按 8 MiB 帧上限拆行消费；客户端写入超过协商上限直接拒绝，不尝试发送。

---

## 7. 文件级改造清单

### 7.1 删除 / 退役

```text
vendor/bingo/v0.4.0-protocol-v1.patch          // 不再应用
src/shared/contracts/cli.ts                    // v1 NDJSON 契约
src/main/runtime/stdioBingoSession.ts          // 由 appServerSession.ts 取代
src/main/runtime/bingoInspector.ts             // 由 appServerInspector.ts 取代
src/main/storage/transcriptRepository.ts       // 由协议读取取代
src/renderer/src/state/chatReducer.ts          // 由 appStore 取代
src/renderer/src/state/teamReducer.ts          // 由 appStore + 资源集合取代
src/renderer/src/features/team/*               // 旧 lobby/tasks/roles UI
src/renderer/src/features/chat/*               // 旧 ChatPage/Sidebar/attachments
src/renderer/src/components/AppShell.tsx       // 旧三视图 shell
scripts/probe-fixture.mjs                      // 改为 app-server fixture
scripts/bingo-package-lib.mjs                  // 改为 initialize 探测
```

### 7.2 新增

```text
docs/app-server-refactor-plan.zh-CN.md         // 本文档
docs/ui-component-scan.md                      // 组件能力扫描快照（从 5.1 生成）
vendor/bingo/app-server-schema/v1.0/           // 上游 schema/app-server 的受控副本（MIT）
scripts/generate-app-server-types.mjs          // 由 schema bundle 生成 TS 类型
scripts/generate-app-server-fixtures.mjs       // 每个 wire variant 一个 JSON 夹具
scripts/fake-app-server.mjs                    // 可脚本化 app-server 假进程
scripts/verify-app-server-schema.mjs           // 校验本地副本 == `bingo app-server generate-schema` 输出
src/shared/contracts/appServer.ts              // wire + domain 类型
src/shared/contracts/appServerSchemaFixtures.test.ts
src/main/runtime/appServerTransport.ts
src/main/runtime/appServerConnection.ts
src/main/runtime/appServerSession.ts
src/main/runtime/appServerInspector.ts
src/main/runtime/appServerConnection.test.ts
src/main/runtime/appServerInspector.test.ts
src/main/runtime/appServerBlackBox.test.ts
src/main/storage/agentDefinitionRepository.ts
src/main/storage/teamBlueprintRepository.ts
src/renderer/src/store/appStore.ts             // 纯 reducer
src/renderer/src/store/selectors.ts
src/renderer/src/components/AppShellV2.tsx      // Layout + Splitter 四区 shell
src/renderer/src/components/CommandPalette.tsx
src/renderer/src/features/conversations/ConversationSidebar.tsx
src/renderer/src/features/conversations/ConversationCanvas.tsx
src/renderer/src/features/conversations/ItemRenderer.tsx
src/renderer/src/features/conversations/Composer.tsx
src/renderer/src/features/conversations/InteractionCard.tsx
src/renderer/src/features/conversations/QueueDrawer.tsx
src/renderer/src/features/conversations/ContextPanel.tsx
src/renderer/src/features/conversations/TurnGroup.tsx
src/renderer/src/features/workspace/WorkspacePage.tsx
src/renderer/src/features/workspace/RosterView.tsx
src/renderer/src/features/workspace/RoomsView.tsx
src/renderer/src/features/workspace/TasksView.tsx
src/renderer/src/features/workspace/DeliveriesView.tsx
src/renderer/src/features/workspace/TeamOperationBar.tsx
src/renderer/src/features/workspace/TeamBlueprintEditor.tsx
src/renderer/src/features/workspace/AgentDefinitionRepositoryView.tsx
```

### 7.3 重写 / 改造

```text
src/main/index.ts                              // 组装 AppServerClient / 新仓库
src/main/ipc/registerIpc.ts                    // 会话/对话/协作通道全部重写
src/main/runtime/sessionManager.ts             // connectionId + epoch + snapshot 管理
src/main/runtime/runtimeLocator.ts             // app-server initialize 探测
src/main/notifications/notificationCoordinator.ts
src/shared/contracts/ipc.ts
src/preload/index.ts
src/renderer/src/App.tsx                       // 拆为 provider/hooks，不堆单文件
src/renderer/src/features/settings/*.tsx       // 数据源改为 config/catalog
src/renderer/src/styles.css
src/renderer/src/*.test.tsx                    // 按新 store/组件重写
src/main/**/*.test.ts                          // transport/session/manager 新测试
```

### 7.4 构建、打包、CI

```text
package.json
  - "build:bingo" 不变（cargo build --manifest-path ../bingo/Cargo.toml --locked --release）
  - 新增 schema 生成与类型生成脚本
  - prepare:bingo 不再应用 vendor patch
.github/workflows/ci.yml
  - BINGO_REPOSITORY 仍为 https://github.com/yexrob/bingo.git
  - BINGO_REVISION 改为 7bee209d191c41b62b8b9e135bf5124f581e7505（tag v0.4.1）
  - 删除 git apply 步骤；改为校验 `git rev-parse HEAD == BINGO_REVISION`
  - 构建后运行 `bingo app-server generate-schema` 与 schema 漂移校验
  - 版本检查改为 `bingo 0.4.1` + initialize 握手
scripts/prepare-bingo-package.mjs
scripts/verify-packaged-runtime.mjs
  - REQUIRED_CAPABILITIES 从细粒度字符串改为 ServerCapabilities 布尔集合
README.md / docs/architecture.md / docs/upstream-sync.zh-CN.md / THIRD_PARTY_NOTICES
```

---

## 8. 分阶段实施计划（P0 已跳过，直接大型重构）

> 实施纪律：每个阶段合入后主流程可构建、测试可跑；旧 UI 文件在对应阶段被整体替换，不保留双轨兼容层。

### P1 · 契约、类型与 UI 组件清单

- [x] 复制 `schema/app-server/` 到 `vendor/bingo/app-server-schema/v1.0/`，记录来源 commit `7bee209`（92 个 schema 文件 + README）。
- [x] `scripts/generate-app-server-types.mjs` 生成 TS 类型（216 definitions + request/notification/response/error 信封联合）；已生成 `src/shared/contracts/appServer.ts`。
- [~] envelope/zod 运行时校验：当前用生成类型 + JSON fixture 形状测试；Electron IPC 的 Zod 校验随 P3 新 IPC 面一起补齐。
- [x] `scripts/verify-app-server-schema.mjs`：`bingo app-server generate-schema --out <tmp>` 与本地副本 diff 为 0（待真实二进制执行，CI package job 已接入）。
- [x] `scripts/generate-app-server-fixtures.mjs` + `scripts/fake-app-server.mjs`：107 个 request/notification/result/error/client notification 夹具 + 可脚本化 fake server。
- [x] 已完成组件扫描并落盘 `docs/ui-component-scan.md`（antd 6.6.0 / @ant-design/x 2.9.0 能力、限制与 DSCode 映射），版本冻结。
- [x] 黑盒：本地 `cargo build --release`（v0.4.1，1m59s）后，`appServerBlackBox.test.ts` 对真实 `bingo app-server` 验证 initialize/shutdown、pre-session provider catalog、RuntimeLocator 探测；`verify-app-server-schema.mjs` 对真实二进制 schema 输出比对为 0。（坏行/超大帧的完整退出码矩阵待 P2 收尾补入黑盒清单。）

**验收：** 契约类型编译通过；schema 漂移检查入 CI；每 variant 一个 fixture；UI 组件清单与版本已固化。

### P2 · 主进程传输与探测（独立可测）

- [x] `AppServerTransport`：NDJSON framing、1 MiB/8 MiB 上限（含单帧超限检测）、请求 id 关联、`seq/coalescedFrom` 校验、有界缓冲与写超时、退出码语义；文件 `src/main/runtime/appServerTransport.ts`。
- [x] `AppServerConnection`：initialize/initialized/shutdown 状态机、JSON-RPC 错误映射、typed method→result map；文件 `src/main/runtime/appServerConnection.ts`。
- [x] `AppServerInspector`：session 前 `catalog/read`（providers/models/skills/images/mcpServers）；文件 `src/main/runtime/appServerInspector.ts`。
- [x] `AppServerSession` 高层请求 facade；文件 `src/main/runtime/appServerSession.ts`。
- [x] `RuntimeLocator.probe`：`bingo --version` + app-server initialize/shutdown；`RuntimeInfo` 增加 `appServer` 字段，旧字段保留到 P3 替换。
- [ ] `SessionManager` 的 `connectionId/epoch/snapshot` 骨架：留到 P3（不提前拆旧 SessionManager）。
- [x] 更新打包脚本与 CI：pin `7bee209`、去掉 patch、`verify:package` 用 initialize 探测、package job 增加 schema 漂移校验；文件 `scripts/bingo-package-lib.mjs`、`.github/workflows/ci.yml`。
- [x] 测试：`appServerConnection.test.ts`（initialize/correlation/error map/seq gap/帧超限 5 例）、`appServerInspector.test.ts`（2 例）、`runtimeLocator.test.ts` 重写（4 例）、`appServerSchemaFixtures.test.ts`（manifest 全覆盖）。

**验收：** `npm run typecheck` 与 `npm test` 全绿（47 files / 247 tests，含真实 bingo 黑盒 3 例）；schema 漂移校验已对真实二进制通过。

### P3 · 新 Shell、appStore 与应用骨架

- [x] `appStore` + selectors + resync 逻辑：`appStore.ts`（快照/事件 reducer、log/live/tail/queue/collections）、`useAppStore.ts`；连接层 seq 洞触发 `desynchronized`。
- [x] `AppShellV2`（Layout + Splitter + Nav Rail + Drawer 窄屏适配），组件已就绪，待主入口切换。
- [x] `CommandPalette`（action/list 数据 + 过滤/可用态），组件已就绪。
- [x] 新会话/恢复/列表：`AppServerSession.sessionStart/resume/list/read/close/delete` 已实现并有 fake-server 测试；尚未接 IPC。
- [x] `conversation/list`、`conversation/read`、`conversation/markRead`：同上，facade 已实现。
- [x] `ConversationSidebar`（Main/Agents/Rooms 分组，unread/mentions/runState/queueCount Badge），组件已就绪。
- [ ] `NotificationCoordinator` 迁移 turn/interaction/feedback：留到主入口切换阶段。

**验收（当前）：** `appStore.test.ts` 6 例覆盖快照、delta、retry 撤回、队列、interaction、集合更新；typecheck/test 全绿。**未完成：** Electron main 与 renderer 尚未切换到 v2 路径。

### P4 · 主对话纵向切片（先可用）

- [x] `ConversationCanvas` + `ItemRenderer`：14 类 item 的基础渲染（message/reasoning/toolCall/command/system/asset）。
- [~] `Composer`：Sender 槽位 + Sender.Switch + Attachments + 队列状态已实现；`Suggestion`（@/#/命令联想）待接入。
- [~] `conversation/submit`、`turn/interrupt`、`queue/read`、`queue/reclaimTail`：`AppServerSession` facade + `composerSubmit/sendProse/rewind` helper 已实现；未接 IPC/UI 调用。
- [x] `InteractionCard` + `interaction/respond`：组件三态渲染 + decision 回调；facade 已有 `interactionRespond`。
- [x] `ContextPanel`（Progress dashboard + Statistic）。
- [x] `TurnGroup`（turn/retrying Steps）。

**验收（当前）：** `conversationComponents.test.tsx` 覆盖语义消息渲染与权限 decision；`appServerSession.test.ts` 覆盖 submit/interrupt/queue/interaction 等请求面。**未完成：** 真实 bingo 上的端到端对话流未接通。

### P5 · 设置、目录、资产、历史

- [x] `catalog/read` 驱动的设置页组件：`AppServerSettingsView.tsx`（Provider/Model/Thinking/Permission/Theme/MCP/actions）。
- [x] `config/read` + `action/execute` 运行时选择：`AppServerSession.configRead/actionList/actionExecute` 已实现。
- [ ] `SettingsRepository` 适配 config revision：尚未做（主入口切换时处理）。
- [~] `asset/registerPath` + `asset/readChunk`：facade 已实现；附件注册与图片 chunk 渲染 UI 未接。
- [~] `conversationRewind`：`AppServerSession.rewind` helper 已实现；编辑历史/中断恢复 UI 未接。
- [ ] 删除 `TranscriptRepository` 与 JSONL 直读路径：按 P7 统一清理。
- [ ] 会话删除/重命名的 confirmation interaction：主入口切换时处理。

**验收（当前）：** 请求面全部有 fake-server 覆盖；UI 组件可编译并有基础测试。**未完成：** 主进程文件仓库改造、IPC 接线与端到端验收。

### P6 · 团队与协作纵向切片（群聊为核心）

- [ ] `resource/read` 接入：agents/rooms/tasks/deliveries/backgroundCommands。
- [ ] 协作通知接入：`agent/changed+removed`、`room/changed`、`task/changed+removed`、`delivery/changed`、`operation/*`。
- [ ] `WorkspacePage` + `TeamOperationBar`。
- [ ] `RosterView`/`RoomsView`（Masonry Card + Badge + Actions）。
- [ ] **Room conversation 群聊**：成员 role Bubble.List、@mention 高亮、markRead、加入/离开、RoomMode 显示。
- [ ] Agent DM conversation：delivery 状态点、recentActivity ThoughtChain。
- [ ] `TasksView`（Table）、`DeliveriesView`。
- [ ] `teamStart/teamStop/teamAssign/teamScaffold/teamMemoryGarbageCollect`、`roomJoin/roomLeave`。
- [ ] `teamBlueprintRepository` 与 `agentDefinitionRepository` 的本地编辑 Drawer。
- [ ] 删除旧 TeamPage/TeamReducer/TeamTaskView/AgentDefinitionEditor/预设相关 UI。

**验收：** 启动团队 → Roster 出现成员 → 房间可发帖 → 多成员消息按头像/身份分列 → mentions/unread 正确 → markRead 后清零 → agent DM 显示投递状态 → 停止成员后 state 变 stopped → 重启 app 后 resume 恢复房间与成员。

### P7 · 清理、发布与文档

- [ ] 删除 v1 残余：`cli.ts`、`vendor/bingo/*.patch`、旧 session/inspector/reducer 测试与 probe fixture。
- [ ] 全量 typecheck/test/build。
- [ ] 更新 README、architecture、upstream-sync、THIRD_PARTY_NOTICES。
- [ ] 三平台 `npm run package:*` + `verify:package` + 游戏专项 smoke（游戏系统未动，只回归）。
- [ ] 发布候选：记录 bingo commit/tag、schema bundle SHA、协议版本、验证结果。
- [ ] 更新本文档决策记录为已实施。

**验收：** `rg "json-events|json_events|protocol v1|protocolVersion" src scripts .github vendor README.md docs` 无 v1 运行时残留（历史文档除外）；三平台包验证通过。

---

## 9. 测试与验收总览

| 层 | 手段 |
| --- | --- |
| 契约 | schema 漂移检查、每 variant fixture、TypeScript 类型生成 |
| 传输 | 帧上限/UTF-8 错误/慢客户端/写失败/退出码 0-1-2、request 乱序关联 |
| 黑盒 | 真实 `bingo app-server`：initialize/shutdown、session start/resume/delete、submit 五种 disposition、interrupt、interaction 三种、queue 吸收与回收、rewind、asset chunk |
| store | 纯 reducer 单测：快照 + 每类通知 + seq 洞 + `coalescedFrom` 区间 + retry checkpoint 撤回 |
| renderer | React Testing Library：ItemRenderer 各 item、InteractionCard 决策、Composer 模式/槽位、Workspace 四视图、Room 群聊角色渲染 |
| UI 组件 | antd/x 组件与 `docs/ui-component-scan.md` 版本绑定；组件破坏性升级需回归交互测试 |
| 打包 | `verify:package` 的版本/协议/schema/capability/SHA/体积门槛；三平台 unpacked 冒烟 |
| 游戏 | 现有 `build:games` + `smoke:package:games` 回归，仅确认未受主流程改造影响 |

---

## 10. 风险与开放问题

1. **app-server 仍是 experimental**：上游明示无 released consumer、wire 形状不承诺兼容。bingo-go 必须 pin 精确 commit/tag（v0.4.1 = `7bee209`），升级时重跑 schema 漂移与黑盒。
2. **能力模型变粗**：旧的细粒度 capability 字符串消失。UI 应按 `ServerCapabilities` 布尔面与 `action/list.available` 动态显隐；不要把能力判断重新写成版本号 if。
3. **Provider/MCP 定义没有 wire 写方法**：本地设置文件写入与 `config/changed` 之间存在一致性窗口。短期用“保存后重连”语义；候选上游扩展 `config/update`（Open-1）。
4. **Team 蓝图没有 wire 读/写**：GUI 编辑器是 main 的本地文件适配器。需要向上游提案 `team.read`/`team.update` capability（Open-2），或接受“蓝图用文件编辑器维护”。
5. **Team v2 功能有意退役**：lobby、team task 群聊、presets、member profile 在新模型下无等价物。按第 4.8 节映射；若产品要求保留，应作为上游 feature proposal（Open-3）。
6. **会话列表没有 preview**：`session/list` 只有 title/updatedAt/messageCount/cwd。方案一：列表显示 title + messageCount；方案二：懒加载最近会话的 conversation tail 做 preview；方案三：上游提案 `session/list` 增 preview 字段（Open-4）。
7. **无 cost 字段**：app-server 的 `TurnUsage` 有 token/cache，但没有 dscode 那样的 cost 估算。若产品需要，向上游提案 `turn/usageUpdated` 扩展（Open-5）。
8. **fork 语义消失**：rewind 与 fork 的存储语义不同（不再产生分支会话）。需要更新用户心智与旧数据迁移提示。
9. **Ant Design X 没有 useXAgent/useXChat**：不能用 X hooks 搭建运行态，必须用本项目 `appStore`。这是约束也是优势，避免把 reducer 逻辑塞进组件库。
10. **长消息性能**：`Bubble.List` 适合普通会话但不保证超长虚拟化。团队房间与长 main 历史统一用 `Listy` 外层虚拟化，每条 item 内部再渲染 Bubble；需要专项长会话性能测试。

---

## 11. 决策记录

| 编号 | 决策 | 状态 |
| --- | --- | --- |
| BG-1 | 路线 A：以官方 bingo v0.4.1 `app-server` 为唯一运行时协议，删除 v1 补丁与 fork | 已决策 |
| BG-2 | 前端以“会话世界”重构：conversation 是第一公民，Chat/Team 统一进 conversations + workspace 两个视图 | 已决策 |
| BG-3 | Team v2 lobby/tasks/presets 退役，按上游 agents/rooms/tasks/deliveries 重做 | 已决策 |
| BG-4 | Provider/MCP 定义继续由 Electron main 本地安全写入；运行时选择走 `action/execute` | 已决策 |
| BG-5 | Team 蓝图与 agent 定义由 main 本地仓库编辑；是否向上游提案 wire CRUD 留待评审 | 已决策 |
| BG-6 | 删除 `TranscriptRepository`，历史只经 `session/list + conversation/read` | 已决策 |
| BG-7 | 契约优先、纵向切片：P4 先交付可用对话，P6 交付团队 | 已决策 |
| BG-8 | 跳过 P0，放弃全部未提交改动，直接大型重构，不保留旧 UI | 已决策 |
| BG-9 | 交互结构参考 DSCode Desktop（侧栏/对话/Inspector/Composer/命令面板），样式与实现用 antd + Ant Design X | 已决策 |
| BG-10 | 团队群聊 = Room conversation 的成员角色气泡流；旧 lobby 不保留，蓝图首房间作为“Team 大厅” | 已决策 |
| BG-11 | 长列表统一用 `Listy` 虚拟化，`Bubble` 只负责单条语义渲染，避免超长会话卡顿 | 已决策 |

---

## 附录 A：本地 bingo 清理命令记录

```bash
cd D:/Projects/bingo
git fetch --all --prune
git checkout --detach origin/main
git branch -f main origin/main
git branch -f dev origin/dev
git branch -D codex/gui-team-workspace \
  backup/gui-json-events-windows-pre-v0.4.0-20260812 \
  feat/gui-json-events-windows \
  feat/windows-home-settings-ui-protocol
git stash clear
git remote remove fork
rm -rf .local target
git checkout main
```

## 附录 B：bingo-go 未提交改动清理记录

```bash
cd D:/Projects/bingo-go
git restore -- package-lock.json package.json \
  src/renderer/src/features/chat/ChatPage.tsx \
  src/renderer/src/features/team/TeamPage.tsx \
  src/renderer/src/markdown.test.tsx \
  src/renderer/src/styles.css
rm -f NUL
```

## 附录 C：app-server v1.0 方法/通知清单（上游 schema manifest）

**Client → Server（request）：** `initialize`、`shutdown`、`session/list`、`session/start`、`session/resume`、`session/read`、`session/close`、`session/delete`、`conversation/list`、`conversation/read`、`conversation/markRead`、`conversation/submit`、`turn/interrupt`、`queue/read`、`queue/reclaimTail`、`interaction/respond`、`action/list`、`action/execute`、`config/read`、`catalog/read`、`resource/read`、`asset/registerPath`、`asset/readChunk`。

**Server → Client（notification）：** `session/updated|closed|deleted`、`conversation/created|updated|removed`、`turn/started|roundStarted|retrying|roundCompleted|usageUpdated|completed`、`item/started|textDelta|reasoningDelta|commandTailUpdated|updated|completed`、`queue/itemAdded|itemRemoved|itemAbsorbed`、`interaction/opened|resolved|cancelled`、`agent/changed|removed`、`room/changed`、`task/changed|removed`、`delivery/changed`、`command/changed`、`operation/started|progress|completed`、`config/changed`、`catalog/changed`、`asset/available`、`feedback/raised|cleared`。

**Server → Client（response/error）：** JSON-RPC 2.0 `result`/`error`；`error.data` 携带 `bingoCode`、`recoverable`、`scope`、`suggestedAction` 等。

## 附录 D：关键引用

- 上游协议规范：`D:/Projects/bingo/notes/design/gui-app-server.md`
- 上游实施计划（B0–B8）：`D:/Projects/bingo/notes/design/gui-app-server-plan.md`
- 上游 schema：`D:/Projects/bingo/schema/app-server/`
- 上游客户端 store 参考：`D:/Projects/bingo/src/tui/store.rs`
- 上游 parity ledger：`D:/Projects/bingo/src/app/parity.rs`
- UI 结构参考：`D:/Projects/dscode/apps/desktop/src/renderer/App.tsx`
- 组件扫描：`node_modules/antd@6.6.0`、`node_modules/@ant-design/x@2.9.0`

# Bingo Go × Ant Design X 现代化 GUI 实施方案

## 总结

- 采用 `@ant-design/x@2.9.0`、`antd@6.6.0`、`@ant-design/icons@6.1.0`，保留 Electron、React 19、现有 reducer 和 Bingo NDJSON 架构。
- 复用 Ant Design X 的 [Independent](https://github.com/ant-design/x/blob/main/packages/x/docs/playground/independent.tsx) 主界面结构、[Copilot](https://github.com/ant-design/x/blob/main/packages/x/docs/playground/copilot.tsx) 右侧检查器和 [Agent TBox](https://github.com/ant-design/x/blob/main/packages/x/docs/playground/agent-tbox.tsx) Agent 状态表达。
- Bingo Go 负责展示、配置编排和桌面交互；Bingo 只增加薄协议适配，不重写 Provider、Team、权限、MCP 或会话业务逻辑。
- 本文档是实施基线；以后任何范围或接口调整必须先更新本文档，避免开发偏移。
- 保留现有 `windows-package-plan.zh-CN.md` 作为 Windows 打包配套文档。

### 2026-08-12 体验修订

- Electron 完全移除应用菜单但保留系统标题栏；桌面端检查器可折叠为 40px 图标栏并持久化，窄屏仍使用 Drawer。
- 主导航增加全局工作区选择按钮，调用 Electron 原生目录选择器；选择结果先完成目录与 Bingo protocol probe 校验，再切换运行上下文。切换仅允许在空闲状态执行，成功后关闭旧连接、清空当前未提交界面状态并回到未落盘的新对话，不移动或删除任何 transcript。
- 工作区偏好保存当前路径和最近 8 个路径到 `app.getPath('userData')/workspace.json`；`BINGO_GUI_CWD` 仍具有启动时最高优先级。设置读取、Team、MCP、Provider 枚举以及之后创建或恢复的会话都使用同一工作区路径。
- 启动和点击“新建对话”只进入未落盘的空白工作台；首次发送消息时才创建 Bingo transcript，避免反复启动产生空对话。
- 会话列表按今天、昨天、最近 7 天和更早分组，增加管理模式、全选与带确认的批量删除；删除活动对话后回到未落盘空白工作台。
- `opencode-go` 不再使用单模型静态白名单，优先读取供应商的 `/v1/models` 动态列表，并与 OpenCode Go 官方模型 ID 兜底列表去重合并；在线枚举失败时仍返回兜底列表，避免模型选择器被清空。GUI 模型选择器同时允许手工输入，以兼容新增尚未同步的模型。
- 常规设置提供 Provider 对应的模型列表和可手工输入的默认模型；该值仍写入 Bingo 用户层 `model`，作为每个新对话的默认模型。
- Provider、Model、Thinking 与应用按钮移到 Sender 下方，形成接近 Agent/Codex 的紧凑会话控制条。
- Sender 保留 Ant Design X 原生发送/停止操作，并使用 `Attachments` 支持最多 5 张 PNG/JPEG/GIF 的文件选择、剪贴板粘贴和拖放；允许纯图片消息。当前 Provider 或旧 Bingo 不支持图片时禁用发送并提供明确提示。
- 用户当前消息及恢复后的 transcript 均显示图片缩略图；助手 Markdown 继续随 `text.delta` 流式重解析，只自动加载 HTTPS 图片，拒绝 HTTP、`file:`、任意 `data:` 和其他协议。
- 外观草稿在颜色、模式、密度或动效变化时立即作用于整个 Bingo Go 界面；“保存外观”才持久化，离开页面或还原时恢复已保存值。

### 2026-08-12 全页面 UI 优化基线

- 全面优化 Chat、Team、设置中心全部 8 个子页和应用壳层，以现有 `@ant-design/x@2.9.0` 的组件、语义插槽和视觉语言为准；assistant-ui 只作为线程视口、渐进披露、消息动作和模型选择交互的只读参考，不引入其 runtime、Tailwind、Radix 或状态依赖。
- 保留四区桌面结构并精简为 56px 主导航、264px 上下文侧栏、弹性主内容和 328px 检查器；检查器折叠为 40px，低于 980px 时侧栏与检查器改用 Drawer。
- Chat 空白态把 `Welcome`、`Prompts` 与 `Sender` 组织为居中任务区；有消息后 Sender 固定在底部。工具活动按所属 turn 放在对应助手消息内，以可控 `ThoughtChain` 展示摘要，右侧检查器显示当前工具详情。
- 会话侧栏增加本地搜索和内联重命名，保留日期分组、管理模式、全选和批量删除。搜索不改变底层排序或选择集合。
- Team 左侧统一使用分组 `Conversations` 展示频道与成员；主区继续使用 `Bubble`、`Sender`、`ThoughtChain`，顶部压缩主要状态与启动/停止，次要命令在窄屏收进菜单。
- 设置中心使用分区草稿与粘性保存状态栏；切换分区或离开设置时，未保存草稿必须选择保存、丢弃或继续编辑。Provider、MCP 和外观继续使用各自现有的事务与存储契约。
- 常规、Provider、权限、Team、MCP、外观、高级、关于全部采用统一的标题、设置行、来源状态、空/载入/错误反馈和 800x600 响应式规则；权限规则改为 Deny/Ask/Allow Tabs，外观预览使用真实的 Ant Design X `Bubble + Sender`。
- 默认主题色继续使用雾紫 `#756AA8`，但组件形态、状态色和交互反馈遵循 Ant Design X。不得修改公共 IPC、Bingo NDJSON、持久化 schema 或附件协议。
- 本轮验证执行 `npm run typecheck`、`npm test`、`npm run build`，并补充 DOM、交互、键盘和响应式结构测试；按用户选择不启动 Browser/Chrome，也不执行截图视觉 QA。

## 许可与依赖边界

- Ant Design X、Ant Design 和官方模板均为 MIT，允许修改、私有使用和商业分发，要求保留版权及许可文本，目前未发现阻断性许可隐患。[Ant Design X LICENSE](https://github.com/ant-design/x/blob/main/LICENSE)、[Ant Design LICENSE](https://github.com/ant-design/ant-design/blob/master/LICENSE)
- Bingo Go 补充 MIT `LICENSE`；便携包附带 `THIRD_PARTY_NOTICES`，覆盖 Ant Design、Electron/Chromium、Bingo MIT 和 CC0 头像来源。
- 打包前扫描 npm、Cargo 锁文件的完整传递依赖许可；禁止进入 GPL/AGPL、来源不明或与分发方式冲突的依赖。
- 不引入 `x-sdk`、远程模板 API、`antd-style`、Redux、React Router 或新的 Markdown 引擎；首版继续使用 `react-markdown`。
- 不复制模板中的演示图片、远程地址、品牌素材和假数据，只复用 MIT 许可下的组件组合与布局思路。

### 许可证审计实施记录

- 2026-08-12：锁文件审计发现 Bingo 原有直接依赖 `html2md 0.2.15` 为 `GPL-3.0+`，与本方案的分发边界冲突。实施时移除该依赖，改为直接复用依赖图中既有、采用 `MIT OR Apache-2.0` 的 Servo `html5ever 0.27.0` 与 `markup5ever_rcdom 0.3.0`，在 Bingo 内提供受测的结构化 HTML 转 Markdown 适配；不改变 `WebFetch` 命令或返回契约。

## UI 架构与组件复用

- 根节点采用 `XProvider + antd App`，合并 Ant Design X 与 Ant Design 的 `zh_CN` locale，并统一 Modal、Message、Notification 上下文。
- 桌面壳层固定为：56px 主导航、264px 上下文侧栏、弹性主内容区、328px 可折叠检查器；低于 980px 时侧栏和检查器改为 Drawer，禁止内容重叠。
- `Independent` 提供会话侧栏、Welcome、Prompts、Bubble、Sender 的组合基础；`Copilot` 用于 Team 成员、工具调用和配置来源检查器；`Agent TBox` 用于 Agent 状态和 ThoughtChain。
- 采用中性灰白背景与 6px 圆角，紫色只用于选择、主操作和焦点，不形成单色紫色界面；不使用嵌套卡片或营销式大标题。
- 拆分当前单体 `App.tsx` 为应用壳层、Chat、Team、Settings 和共享状态模块，继续使用 Context + reducer，不增加全局状态依赖。

## 页面设计

| 页面 | 主要组件 | 开发细节 |
|---|---|---|
| Chat | `Conversations`、`Welcome`、`Prompts`、`Bubble`、`ThoughtChain`、`Actions`、`Sender`、`Attachments` | 支持会话创建、分组、重命名、删除和切换；流式正文使用 Bubble；工具调用映射为 ThoughtChain；权限和问题保持阻塞式交互；发送中显示停止按钮；支持图片选择、粘贴、拖放、发送、预览和历史恢复。 |
| Team | `Conversations`、`Bubble`、`ThoughtChain`、Drawer、Badge、Tabs | 顶部显示 Team、项目、分支、模式、预算和运行状态；左侧为频道与成员；中间为频道或 DM；右侧展示成员引擎、待处理消息和活动；提供启动、停止、校验、保存蓝图和定向消息。 |
| Settings | Ant Design Form、Tabs、Table、List、Segmented、Switch、ColorPicker | 独立设置中心，左侧分类导航；表单按用户设置层保存，项目与 local 层只读展示来源和覆盖状态。 |
| About | Descriptions、List | 展示 Bingo Go/Bingo/协议版本、二进制和配置路径、运行能力、许可证及第三方声明。 |

## 设置中心细节

- **常规与运行**：展示工作区、Bingo 路径、版本、协议能力；配置默认 Provider、Model、Thinking、`sendImages`、`cacheControl`。保存时若会话正在执行则禁用；空闲时保存并重新打开同一 transcript。
- **API 供应商**：列表显示名称、协议、端点、凭据状态、图片能力、内置状态和配置来源；Drawer 支持 `anthropic/openai`、Base URL、API Key、图片能力和默认模型。
- API Key 只允许“保持、替换、清除”三种操作，读取结果永不返回明文；提交后立即清空表单内存，不写日志、localStorage 或 renderer 持久状态。
- 内置 Provider 的身份与协议只读，但允许在用户层覆盖 API Key；OAuth 首版仅展示 Bingo 已有认证状态，不新增登录、刷新或退出业务逻辑。
- “保存并测试”先原子保存，再复用现有 `models.list` 检查连接；不发送付费聊天请求。不支持模型枚举的 Provider 允许手工填写模型，并显示“无法自动验证”。
- 删除仅作用于用户层；内置、项目层和 local 层条目不可删除。删除当前 Provider 时必须在同一事务选择替代 Provider。
- **权限**：编辑 `default`、`acceptEdits`、`plan`、`dontAsk`、`bypassPermissions` 及 allow/ask/deny 规则；危险模式显示明确确认，deny 优先级保持 Bingo 现有语义。
- **Team 与协作**：配置 `team.autoStart`、`experimental.agentChannels`、频道消息上限和 Agent 消息上限，并提供进入 Team 工作台的入口。
- **MCP**：展示来源、传输类型、连接状态和启用状态；支持用户层 stdio/http 配置。环境变量和 Header 按秘密字段处理；启用外部命令前展示命令或 URL 并确认。
- **外观**：Bingo Go 外观与 Bingo TUI 的 `theme` 分离。默认跟随系统，默认主题色为护眼雾紫 `#756AA8`；预设增加青绿 `#3F7C75`、蓝灰 `#4D6F91`、森林绿 `#557A5B`、石墨 `#62666D`。
- ColorPicker 仅接受无透明度 HEX，实时预览并自动选择可读的按钮前景色；提供明亮、暗色、跟随系统，舒适、紧凑密度，以及跟随系统、减少动效。
- 外观保存为 `AppearancePreferencesV1`，位置为 `app.getPath('userData')/preferences.json`，使用 revision、备份和原子写入。
- **高级与关于**：编辑 Shell、`respondToBashCommands`、Share 地址和 Bingo TUI 主题；Hooks 首版只读展示，避免 GUI 成为任意命令编辑器。

## 契约与兼容性

- `protocol.ready` 和 `inspection.ready` 增加可选 `capabilities: string[]`，协议版本仍为 v1；旧客户端忽略新字段，新 Bingo Go 在字段缺失时降级。
- 增加 `attachments.input.v1`：`attachment.add → attachment.ready` 逐张注册原始 Base64 图片，Bingo 复用现有图片解码、压缩和 session attachment table；`turn.start` 仍只携带正文及返回的 marker，保持 v1 文本客户端兼容。
- 图片命令行上限为 48 MiB，解码原图上限为 32 MiB，发送端最多 5 张；附件正文、Base64、文件名和路径不进入日志或错误文本。Transcript 继续持久化规范化后的图片块，GUI 读取时投影为受限 `data:` 预览。
- 增加只读能力 `settings.inspect.v1`：`settings.get → settings.result`，由 Bingo 返回脱敏后的有效配置、来源和覆盖信息，不返回 API Key、Header 或环境变量明文。
- 增加 `team.workspace.v1`，沿用既定命令：`team.subscribe/refresh/validate/save/start/stop`、`agent.message/stop/remove/activity.get`、`channel.post/history.get`；事件为 `team.snapshot/validation/updated`、`agent.updated/activity`、`channel.updated/message`。
- Team 协议只调用现有 Team、Channel、SendMessage 和 AgentControl 能力，不改变唤醒、消息广播、预算、记忆或权限语义。
- `TeamDef` 增加 `schemaVersion: 1`；旧文件缺失版本时按 v1 读取，高版本只读打开；GUI 保存时保留未知字段，并使用 SHA revision 检测冲突。
- Electron IPC 引入 `SettingsPatchV1`、`SecretPatch`、`AppearancePreferencesV1` 和脱敏 `SettingsSnapshotV2`；设置只写用户层，项目及 local 层保持只读。
- 旧 Bingo 仍可正常使用文本 Chat；缺少相应 capability 时，图片入口和 Team 分别降级禁用，Settings 回退到当前基础配置能力。

## 实施阶段

1. 保存本计划，记录两个仓库的 Git 状态，补齐许可文件和依赖锁定，完成 Ant Design X 根 Provider 与设计令牌。
2. 重构应用壳层和 reducer 边界，迁移 Chat 到 Ant Design X，保持现有协议行为和测试通过。
3. 实现外观存储、设置中心、脱敏 patch、Provider API Key 管理、权限、MCP、Team 设置和高级设置。
4. 在 Bingo 增加只读设置检查和 Team 协议适配，再实现完整 Team 工作台；不改核心业务语义。
5. 完成键盘操作、焦点、中文文案、加载/空/错误/冲突状态，以及 1440×900 和 800×600 布局验证。
6. 执行全量验证并只生成一个内置 `bingo.exe` 的未签名 `release/win-unpacked` 测试目录，不再生成 portable 安装包或按功能命名的发布目录；报告目录路径、主程序大小和 SHA-256。

## 测试与验收

- Bingo Go：执行 `npm run typecheck`、`npm test`、`npm run build`；覆盖 reducer 顺序、旧能力降级、设置冲突、覆盖层、秘密字段、Provider 删除、主题持久化和 Team 状态。
- Bingo：执行 `cargo fmt --all -- --check`、`cargo check --locked --all-targets`、`cargo clippy --locked --all-targets -- -D warnings`、`cargo test --locked --all-targets`。
- 契约：Rust/TypeScript 共用 fixtures，验证 capability、附件注册、全部新增命令/事件、未知字段、错误码、事件顺序和旧版回退。
- 安全：确认 renderer 无 Node/文件系统权限，秘密和图片 Base64 不出现在快照、日志或错误中；Markdown 图片仅允许 HTTPS，CSP 仅开放受控的 `https:`、`data:` 和 `blob:` 图片来源；配置写入保持 revision、备份、原子替换和限制权限。
- UI：Chat、Team、Settings 在明暗主题及两种密度下无溢出或重叠；所有危险操作有确认，所有失败状态可重试或重新加载。
- 包装：解包确认 `bingo.exe`、LICENSE 和第三方声明存在；运行版本探测、协议 probe、inspect、基础会话和 Team capability 烟雾测试。

## 明确非目标

- 首版不接入远程云后端、`x-sdk`、在线账户系统、自动更新、代码签名、多平台产物或完整 Hooks 编辑器。
- 首版不新增 OAuth 认证业务、不改变 Bingo 配置合并规则、不重写 Team 调度和频道传播语义。
- 首版不扩展 `tool.done.output` 的字符串契约，因此 Read 等工具结果图片暂不在 GUI 渲染；在 Bingo 上游记录引用式或分块图片事件的后续 Issue。
- 首版不开放任意 Ant Design token 编辑。

## 上游 Issue 草稿

- 发布状态：未发布。当前 GitHub CLI 凭据无效；按安全约束未处理账号凭据。
- 标题：`[JSON events] Preserve image blocks in tool.done for GUI rendering`
- 仓库：`yexrob/bingo`
- 正文：

```markdown
## Problem

`tool.done.output` in the v1 JSON-events protocol is currently a string. When a tool such as
`Read` returns `ContentBlock::Image`, the adapter flattens the result and the GUI cannot render
the image block even though Bingo already supports image content elsewhere.

The current event record limit is 8 MiB, so embedding arbitrary image Base64 directly into one
`tool.done` record would also be unsafe for larger or multiple images.

## Requested direction

Please preserve image blocks for JSON-events clients through a bounded reference-based or chunked
transport. The design should keep existing v1 string consumers compatible, avoid paths and image
bytes in logs/errors, enforce explicit per-record and total limits, and let the GUI resolve each
image only for the owning session/tool call.

## Current GUI behavior

Bingo Go renders user attachments and HTTPS images in assistant Markdown. It intentionally leaves
tool-result images unsupported until this protocol gap has a bounded transport contract.
```

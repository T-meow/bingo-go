# Bingo Go 当前架构

本文只记录仓库当前实现和稳定边界，不承担里程碑、验收证据或历史方案归档。

## 系统边界

Bingo Go 是 Bingo 的桌面前端，不实现第二套 agent runtime：

```text
React renderer (untrusted)
          | typed and validated IPC
          v
Electron preload + main (trusted host boundary)
          | protocol v1 NDJSON over stdio
          v
Bingo child process
          |-- model stream and tools
          |-- prompts and permissions
          |-- Team runtime and persistence
          `-- transcripts and project memory
```

- Renderer 负责界面、局部 reducer 状态和用户交互。
- Preload 使用 `contextBridge` 暴露 allowlist API，不暴露原始 `ipcRenderer`。
- Main 负责窗口、IPC、子进程、可信文件访问、系统通知和游戏窗口。
- Bingo 负责模型、工具、权限、提示、Team、任务、记忆和 transcript 写入。

## 进程与模块

### Electron main

`src/main/index.ts` 创建主窗口并组合以下服务：

- `RuntimeLocator`：解析 Bingo 二进制、版本、protocol 与 capability。
- `SessionManager`：维护当前会话连接、工作区、生命周期和重连。
- `StdioBingoSession`：启动 Bingo 子进程、解析 NDJSON、发送命令并校验事件序列。
- `TranscriptRepository`：只读列出和投影 Bingo transcript。
- `SettingsRepository`：读取设置层，并以 revision、备份和原子替换维护用户设置。
- `WorkspaceRepository`：保存当前工作区和最近使用目录。
- `NotificationCoordinator`：把需要注意的会话事件映射到系统通知。
- `GamePackRepository`、`GameProtocol`、`GameWindowManager`：管理、校验并隔离小游戏。

应用使用单实例锁。退出时先关闭游戏窗口，再请求会话正常结束；超时后由主进程结束剩余子进程，避免后台遗留运行时。

### Preload 与 IPC

`src/shared/contracts/ipc.ts` 是 Electron IPC 的共享类型与 Zod schema。输入在 preload 和 main 两侧都校验，main 还验证请求来自当前窗口的主 frame。

所有预期操作错误使用：

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: GuiError }
```

异步 Bingo 事件通过单一 `session:event` 通道发送，带 `connectionId` 和 main 侧递增序号。Renderer 同时校验连接、序号和 turn，丢弃旧子进程的迟到事件。

### Renderer

Renderer 使用 React 19、Ant Design 6 和 `@ant-design/x`。应用级聊天状态与 Team 状态使用 reducer，不依赖 Redux 或 Zustand。

主要区域包括：

- 对话、工具状态、交互提示、附件和上下文用量。
- 按项目组织的会话列表、搜索、重命名、删除和分叉。
- Provider、Model、权限、MCP、通知、外观和游戏设置。
- Team 固定团队大厅、任务群聊、房间、角色库和成员详情。
- 小游戏中心和独立游戏窗口。

## Bingo wire protocol

Bingo Go 只接受 wire protocol v1，不回退到 `--print` 或 TUI 文本抓取。

```bash
bingo --json-events --probe
bingo --json-events --inspect
bingo --json-events [--session <exact-id>]
```

- stdin 和 stdout 都是 UTF-8 NDJSON；stderr 只用于诊断，不参与机器协议。
- 每条命令含 `protocolVersion: 1` 与唯一 `commandId`。
- 每个事件含单调递增的 `seq`；未知事件类型、序号间断或非法 payload 会关闭连接。
- 一个会话子进程在生命周期内只绑定一个精确 transcript ID。
- `turn.start`、`turn.cancel`、`prompt.respond`、设置检查、会话维护和 Team 命令共用同一版本化传输。
- 运行时特性通过 capability 增量扩展，不为 Team v2 提升 wire protocol 版本。

完整打包运行时要求：

```text
settings.inspect.v1
team.workspace.v1
team.tasks.v1
team.blueprint.v2
team.lobby.v1
team.presets.v1
team.member.profile.v1
attachments.input.v1
session.workspace.v1
session.context.v1
```

`session.fork.v1` 是编辑历史提示和中断恢复使用的可选增强能力。

## 会话与 transcript

每个 GUI 对话映射到一个 Bingo transcript stem。Main 启动子进程时传入明确的工作区；恢复会话前先验证 transcript 绑定的项目路径。

`TranscriptRepository` 只做读取和容错投影：

- 忽略空行，损坏记录转为 warning，不覆盖源文件。
- 将消息、附件和 tool use/tool result 配对转换为 renderer 数据。
- 不向 renderer 暴露 transcript 文件路径、thinking 签名或原始敏感数据。

创建、追加、重命名、删除和分叉 transcript 都通过 Bingo 协议完成。Electron 不直接修改 JSONL。

子进程异常退出会产生 `transport.error`。运行中的消息和工具在 UI 中标记为中断；重试会创建新的 `connectionId` 并精确恢复同一会话。

## 设置与凭据

设置按 Bingo 的用户、项目和本地层解析。Bingo 提供最终生效的 Provider/Model 数据，Electron 不复制 Rust 合并逻辑。

写入用户设置时：

1. 校验输入、Provider、Model 和来源层。
2. 比较原文件 SHA-256 revision，冲突时返回 `SETTINGS_CONFLICT`。
3. 保留未知 JSON 字段和未修改的 secret。
4. 对现有文件创建同目录备份。
5. 写入临时文件并原子替换，再重新读取验证。
6. 运行设置变化后，空闲会话通过新连接生效。

API Key 只在密码输入框、一次 IPC payload 和 main 的受控写事务中短暂存在；不会进入全局 reducer、日志、Team 蓝图、任务记录或预设。

## Team v2

Team v2 使用 `.bingo/team.json` schema v2，并要求完整 Team capability 集合。旧 schema v1 可以读取和迁移，但 v2 UI 不会向不兼容运行时发送写命令。

### 固定成员

- `memberId` 是经验和恢复身份的稳定键，显示名称、头像或模型变化不会改变它。
- 成员可以绑定 Agent 角色，并单独覆盖身份、背景、性格、沟通风格、Provider、Model 与 Thinking。
- 角色与成员的限制、偏好按顺序合并；成员非空身份字段覆盖角色默认值。
- `noNetwork`、`noShell`、`readOnly`、`reviewOnly` 和自定义限制当前均为 prompt 级 enforcement，不是硬权限隔离。
- 头像由 Bingo 导入并规范化，Team 预设不包含 API Key。

### 大厅与任务

- 大厅消息支持广播和定向成员；忙碌成员跳过，不中断任务。
- 用户消息、成员消息和系统事件以递增 `seq` 持久化并在 renderer 幂等合并。
- 任务绑定创建时的项目和 Git 分支，并保存完整参与者配置快照。
- 同一固定成员只能被一个未结束任务占用；不重叠成员可以并行工作。
- 任务状态为 `running`、`pausing`、`paused`、`awaiting_review`、`completed` 或 `cancelled`。
- 暂停和请求验收都等待当前成员回合自然收尾；完成或取消后释放成员。
- 成员回复直接写入任务群聊，但不会自动触发其他成员；协作唤醒必须显式发生。
- 重启应用后运行中任务恢复为暂停，不自动产生模型调用。

Team 页面按 `taskId + seq` 或大厅 `seq` 合并异步事件，避免刷新与实时推送造成重复。

## 小游戏系统

内置源码位于 `games/bingo`、`games/snake` 和 `games/sudoku`，共享资源位于 `games/shared`。`npm run build:games` 输出到 `games/build`；electron-builder 将其复制到包内 `resources/game-packs`。

外部 `.bingo-pack` 为 schema v1 ZIP：

- 安装前检查 manifest、路径、文件类型、重复项、数量、解压体积和 SHA-256。
- 内置 ID 不可覆盖；升级和降级依据同一 ID 的语义版本判断。
- 每个游戏在独立 `BrowserWindow` 和持久化 partition 中运行。
- 游戏没有 preload、Node.js、Electron API 或主应用 IPC。
- 自定义 `bingo-game://` 协议只提供已安装包内文件。
- 导航、弹窗、下载、权限和网络请求全部拒绝。
- localStorage、IndexedDB、Cookie 与缓存按游戏 ID 隔离。

外部包默认输出到 `games/dist`，示例位于 `games/examples/minimal`。

## 构建与发行目录

可重建目录不进入 Git：

```text
out/                  Electron bundles
games/build/          built-in game bundles
games/dist/           authored .bingo-pack files
resources/bin/        prepared Bingo runtime
release/              current package only
```

本地只保留一份当前 release。`scripts/reset-package-output.mjs` 只允许删除 electron-builder 的已知目录和文件；遇到未知内容立即停止。Windows unpacked 的规范路径是 `release/win-unpacked`。

`scripts/verify-packaged-runtime.mjs` 从最终包中重新执行 Bingo 探针，并验证运行时 SHA-256、ASAR 生产依赖、locale、三款游戏和体积门槛。

## 安全规则

主窗口使用：

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}
```

同时遵守以下约束：

- 子进程通过参数数组启动，不拼接 shell 命令。
- Renderer 不接收任意路径写入、原始环境变量或凭据。
- IPC 输入、Bingo NDJSON、transcript、设置和游戏包在使用前进行运行时校验。
- 工作区切换、会话操作和 Team 命令在 main 再检查当前生命周期状态。
- 游戏内容不能导航到外部地址或访问网络。
- 本地打包会包含相邻 Bingo 工作树当前内容；发布者负责确认其 commit、补丁和未提交改动。

## 验证入口

```bash
npm run typecheck
npm test
npm run build
npm run package:win:unpacked
npm run smoke:package:games
```

跨平台发行、上游同步和体积门槛分别见同目录下的保留文档。

# Bingo Go

Bingo Go 是面向 [Bingo](https://github.com/yexrob/bingo) 的独立 Electron 桌面工作台。界面负责交互、展示和本机应用集成，模型调用、工具、权限、Team 运行和 transcript 仍由 Bingo 负责。

本项目由 [Rei](https://github.com/yexrob/rei) 的源码独立演化而来，拥有独立的 Git 历史、品牌和发行节奏；它不是 Rei 或 Bingo 的官方发行版。

## 当前功能

- 流式对话、Markdown、图片输入、上下文用量和工具执行状态。
- 会话新建、恢复、搜索、重命名、删除、编辑分叉与中断恢复。
- 项目工作区切换，以及 Provider、Model、Thinking、权限和 MCP 设置。
- 系统通知、明暗主题和最低 800 x 600 窗口支持。
- Team v2 固定团队、团队大厅、任务群聊、角色库、成员档案和团队预设。
- 隔离的小游戏中心，内置 Bingo、数独和贪吃蛇，并支持导入 `.bingo-pack`。

### Team v2

Team 页面围绕固定团队大厅和任务群聊组织：

- 固定成员使用稳定 `memberId`，可配置头像、身份、背景、性格、发言风格、Provider、Model、Thinking、行为约束和工作偏好。
- Agent 角色提供可复用的专业提示词和默认档案，成员配置覆盖角色默认值。
- 大厅支持广播和 `@成员` 定向消息；忙碌成员不会被打断或排队唤醒。
- 任务保存创建时的成员配置快照，支持运行、暂停、待验收、完成和取消状态。
- 用户消息在右侧、成员汇报在左侧、系统事件居中；成员输出不会自动唤醒其他成员。
- 支持 `.bingo-team` 预设预览、逐项冲突处理、Provider/Model 映射、导入与导出。
- 头像导入和成员经验由 Bingo 按项目管理；临时成员可展示、推荐并晋升为固定成员。

行为约束当前为 prompt 级规则，不是操作系统权限沙箱。例如 `noNetwork` 会要求成员不要使用联网工具，但不能替代进程级网络隔离。

## 运行时兼容性

Bingo Go 当前以 `bingo 0.4.0` 和 wire protocol v1 为稳定基线。完整功能要求运行时探针提供以下 capability：

- `settings.inspect.v1`
- `team.workspace.v1`
- `team.tasks.v1`
- `team.blueprint.v2`
- `team.lobby.v1`
- `team.presets.v1`
- `team.member.profile.v1`
- `attachments.input.v1`
- `session.workspace.v1`
- `session.context.v1`

`session.fork.v1` 用于编辑历史提示词和中断恢复；缺失时相应入口会禁用。Team v2 不改变 wire protocol 版本，`.bingo/team.json` 的蓝图 schema 才是 v2。

检查本地二进制：

```bash
bingo --version
bingo --json-events --probe
```

探针必须只输出一条 `protocol.ready` NDJSON 记录。普通上游发行版如果还没有 `--json-events`，不能直接驱动 Bingo Go。

## 开发

环境要求：

- Node.js 24 与 npm
- Rust stable toolchain
- Windows、macOS 或 Linux 桌面环境
- 与本仓库相邻的 Bingo 源码目录，或一个兼容的 Bingo 绝对路径

默认本地打包结构：

```text
parent/
|-- bingo/
|   `-- Cargo.toml
`-- bingo-go/
    `-- package.json
```

安装依赖并启动：

```bash
npm ci
npm run dev
```

开发态会从 `PATH` 查找 `bingo`。也可以设置绝对路径的 `BINGO_GUI_BINARY`，并用 `BINGO_GUI_CWD` 指定初始项目目录。

常用验证命令：

```bash
npm run typecheck
npm test
npm run build
```

`npm run build` 会先构建三款内置游戏，再把 Electron main、preload 和 renderer bundle 输出到可重建的 `out/`。

## 小游戏

小游戏源码统一位于 `games/`：

```text
games/
|-- bingo/
|-- snake/
|-- sudoku/
|-- shared/
|-- examples/minimal/
|-- build/              # 可重建的内置游戏输出
`-- dist/               # 默认 .bingo-pack 输出
```

构建外部包示例：

```bash
npm run pack:game -- games/examples/minimal
```

格式、存档兼容性和运行边界见 [games/README.md](games/README.md)。

## 打包与发布

本地打包会从 `../bingo/Cargo.toml` 构建 release 二进制，再构建并验证 Electron 包：

```bash
npm run package:win
npm run package:mac
npm run package:linux
```

Windows unpacked 测试包使用：

```powershell
npm run package:win:unpacked
npm run smoke:package:games
```

本地只保留当前构建，所有产物统一写入 `release/`；Windows unpacked 的固定位置是 `release/win-unpacked`。打包前的 reset 脚本只清理 electron-builder 已知产物，发现未知文件会立即停止，不创建隐藏归档，也不保留根目录 `release-*` 副本。

`verify:package` 会检查包内 Bingo 版本、wire protocol、必需 capability、SHA-256、ASAR 依赖、locale、内置游戏和体积门槛。详细规则见 [docs/package-size-standard.zh-CN.md](docs/package-size-standard.zh-CN.md)。

GitHub Actions 在 `main`、手动触发和版本标签上使用固定 Bingo commit 与仓库内补丁原生构建三平台 x64 包。当前产物未签名，也未 notarize，首次启动可能出现系统安全提示。

## 安全边界

```text
React renderer (sandboxed)
          | validated, allowlisted IPC
          v
Electron main process
          | protocol v1 NDJSON over stdio
          v
Bingo child process
```

- Renderer 启用 sandbox 和 context isolation，不拥有 Node.js、Shell、原始 IPC 或任意文件系统访问。
- Preload 只暴露显式的类型化 API；main 再次校验 payload、调用来源、路径和运行状态。
- Bingo 是 transcript 的唯一写入者。Electron 读取 transcript，并只通过受控事务维护允许编辑的本机配置。
- API Key 不进入 renderer 持久状态、Team 蓝图、任务记录、游戏包或团队预设。
- 小游戏使用独立窗口、持久化分区和自定义协议；没有 preload、Node/Electron API、下载、弹窗或网络访问。
- 本地打包会包含相邻 Bingo 工作树当前已保存的代码，发布前必须检查其来源和 Git 状态。

## 文档

- [当前架构](docs/architecture.md)
- [跨平台发行](docs/cross-platform-release.zh-CN.md)
- [上游来源与同步](docs/upstream-sync.zh-CN.md)
- [打包体积规范](docs/package-size-standard.zh-CN.md)
- [小游戏包作者指南](games/README.md)

## 许可

Bingo Go 按 [MIT License](LICENSE) 发布。源自 Rei 的代码和随包 Bingo 二进制继续遵循各自的 MIT 条款；来源与第三方声明见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)。

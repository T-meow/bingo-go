# Bingo Go

Bingo Go 是面向 [Bingo](https://github.com/yexrob/bingo) 的独立 Electron 桌面工作台。界面负责交互、展示和本机应用集成，模型调用、工具、权限、协作运行和 transcript 仍由 Bingo 负责。

本项目由 [Rei](https://github.com/yexrob/rei) 的源码独立演化而来，拥有独立的 Git 历史、品牌和发行节奏；它不是 Rei 或 Bingo 的官方发行版。

## 当前功能

- 流式对话、Markdown、上下文用量、工具执行状态、持久 interaction 与队列管理。
- 会话新建、历史列表、恢复、多 conversation 切换、提交与中断。
- 项目工作区切换，以及 Provider、Model、Thinking、权限和 MCP 设置。
- 官方 agents、rooms、tasks、deliveries 协作工作台和运行时 Action。
- 系统通知、明暗主题和最低 800 x 600 窗口支持。
- 隔离的小游戏中心，内置 Bingo、数独和贪吃蛇，并支持导入 `.bingo-pack`。

## 运行时兼容性

Bingo Go 以官方 `bingo 0.4.1`（commit `7bee209`，tag `v0.4.1`）为稳定基线，只通过 `bingo app-server`（JSON-RPC 2.0 / NDJSON / stdio）驱动。

初始化握手会协商以下 server capabilities：

- `multiConversation`、`reasoning`、`images`、`shell`
- `rooms`、`teams`

检查本地二进制：

```bash
bingo --version
node scripts/verify-app-server-schema.mjs ../bingo/target/release/bingo
npm run generate:app-server-types
```

普通上游发行版如果没有 `bingo app-server`，不能直接驱动 Bingo Go。

## 开发

环境要求：

- Node.js 24 与 npm
- Rust stable toolchain
- Windows、macOS 或 Linux 桌面环境
- 与本仓库相邻的 Bingo 源码目录（上游 `7bee209`），或一个兼容的 Bingo 绝对路径

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
```

本地只保留当前构建，所有产物统一写入 `release/`；Windows unpacked 的固定位置是 `release/win-unpacked`，每次测试打包可直接清理并覆盖，不保留旧包或备份。打包前的 reset 脚本只清理 electron-builder 已知产物，发现未知文件会立即停止，不创建隐藏归档，也不保留根目录 `release-*` 副本。

常规非游戏改动和小版本打包默认不额外执行游戏专项打包或 Smoke。只有明确要求、游戏相关代码发生变化或进行大版本更新时，才追加 `npm run build:games` 与 `npm run smoke:package:games`；基础包校验仍确认三款内置游戏存在且符合体积限制。

`verify:package` 会检查包内 Bingo 版本、app-server 协议、必需 capability、SHA-256、ASAR 依赖、locale、内置游戏和体积门槛。详细规则见 [docs/package-size-standard.zh-CN.md](docs/package-size-standard.zh-CN.md)。

GitHub Actions 在 `main`、手动触发和版本标签上使用固定 Bingo commit 原生构建三平台 x64 包，并校验 app-server schema 没有漂移。当前产物未签名，也未 notarize，首次启动可能出现系统安全提示。

## 安全边界

```text
React renderer (sandboxed)
          | validated, allowlisted IPC
          v
Electron main process
          | app-server JSON-RPC 2.0 / NDJSON / stdio
          v
Bingo child process
```

- Renderer 启用 sandbox 和 context isolation，不拥有 Node.js、Shell、原始 IPC 或任意文件系统访问。
- Preload 只暴露显式的类型化 API；main 再次校验 payload、调用来源、路径和运行状态。
- Bingo 是 transcript 的唯一写入者。Electron 只通过 app-server 快照与通知读取会话，并通过受控事务维护允许编辑的本机配置。
- API Key 不进入 renderer 持久状态、会话记录或游戏包。
- 小游戏使用独立窗口、持久化分区和自定义协议；没有 preload、Node/Electron API、下载、弹窗或网络访问。
- 本地打包会包含相邻 Bingo 工作树当前已保存的代码，发布前必须检查其来源和 Git 状态。

## 文档

- [当前架构](docs/architecture.md)
- [app-server 前端重构方案（路线 A）](docs/app-server-refactor-plan.zh-CN.md)
- [跨平台发行](docs/cross-platform-release.zh-CN.md)
- [上游来源与同步](docs/upstream-sync.zh-CN.md)
- [打包体积规范](docs/package-size-standard.zh-CN.md)
- [小游戏包作者指南](games/README.md)

## 许可

Bingo Go 按 [MIT License](LICENSE) 发布。源自 Rei 的代码和随包 Bingo 二进制继续遵循各自的 MIT 条款；来源与第三方声明见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)。

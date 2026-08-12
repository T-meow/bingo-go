# Bingo Go

Bingo Go 是面向 [bingo](https://github.com/yexrob/bingo) 的独立 Electron 桌面工作台。它把 bingo 的对话、工具执行、会话、Team 和运行设置组织在一个适合日常使用的图形界面中，同时继续由 bingo 负责 agent、模型调用、权限、工具和 transcript。

本项目由 [Rei](https://github.com/yexrob/rei) 的源码独立演化而来，采用全新的 Git 历史、品牌和发布节奏。Bingo Go 不是 Rei 或 bingo 的官方发行版。

## 当前能力

- 流式对话与 Markdown 渲染，完整展示工具的 `running`、`done`、`error` 和 `interrupted` 状态。
- 新建、恢复、重命名和删除会话；历史消息继续从 bingo transcript 读取。
- 切换 Provider、Model 和 Thinking Level，并安全维护 bingo 用户层设置。
- 选择和记忆工作区，在不同项目之间切换会话运行目录。
- 添加 PNG、JPEG 或 GIF 图片，并在会话历史中恢复图片消息。
- 查看、校验、编辑和运行 Team，检查成员、频道和活动记录。
- 明暗主题、最低 800 x 600 窗口支持，以及隔离的 sandbox renderer。

## 运行时兼容性

Bingo Go 当前以 `bingo v0.4.0` 为稳定基线，并要求一个支持 GUI protocol v1 的兼容构建。运行时探针必须提供以下 capability：

- `settings.inspect.v1`
- `team.workspace.v1`
- `attachments.input.v1`

可以用下面的命令检查二进制：

```powershell
bingo --version
bingo --json-events --probe
```

普通上游 release 若尚未包含 `--json-events`，不能直接驱动当前 Bingo Go。开发时请通过 `BINGO_GUI_BINARY` 指向本项目配套的 protocol-v1 兼容构建；Windows 打包产物会携带已验证的 `bingo.exe`。

## 快速开始

环境要求：

- Node.js 24
- npm（使用仓库中的 `package-lock.json`）
- 桌面环境；当前本地打包流程仅支持 Windows x64
- 已配置可用 Provider 的 protocol-v1-compatible bingo v0.4.0

安装依赖并启动开发模式：

```powershell
npm ci
$env:BINGO_GUI_BINARY = "C:\absolute\path\to\bingo.exe"
npm run dev
```

`BINGO_GUI_BINARY` 必须是绝对路径。开发态未设置它时，应用会从 `PATH` 查找 `bingo`；打包态默认使用随包二进制。

默认工作区是启动应用时的当前目录。可以在界面中选择工作区，也可以用环境变量固定初始工作区：

```powershell
$env:BINGO_GUI_CWD = "C:\absolute\path\to\workspace"
npm run dev
```

Provider 凭据、模型配置、Team 数据和 transcript 仍由 bingo 管理。Bingo Go 不要求把这些内容复制到本仓库。

## 开发与验证

```bash
npm run dev        # 启动带热更新的 Electron 应用
npm run typecheck  # 检查 main、preload 和 renderer TypeScript
npm test           # 运行 Vitest 测试集
npm run build      # 在 out/ 生成生产 bundles
```

提交前至少运行 `typecheck`、测试和生产构建。`node_modules/`、`out/`、`release/` 和随包 `resources/bin/win32-x64/bingo.exe` 都不进入 Git。

## Windows x64 打包

仓库默认假设 Bingo 源码位于相邻目录，并从中构建、验证和复制 release 二进制：

```text
parent/
|-- bingo/
`-- bingo-go/
```

随后执行：

```powershell
npm run package:win
```

该命令依次构建 `../bingo`、构建 Electron bundles、验证 Bingo 版本与 protocol capability，并在 `release/` 生成 Windows x64 解包目录。若二进制位于其他位置，可在运行准备脚本或打包命令前设置绝对路径：

```powershell
$env:BINGO_GUI_BUNDLE_BINARY = "C:\absolute\path\to\bingo.exe"
```

## 架构边界

```text
React renderer (sandboxed)
          | typed, validated IPC
          v
Electron main process
          | protocol v1 NDJSON over stdio
          v
bingo child process
          |-- model stream and tools
          |-- prompts and permissions
          |-- Team workspace
          `-- bingo-owned transcripts
```

Electron main 负责可信文件访问和子进程生命周期；preload 只暴露 allowlist API；renderer 不获得 Node.js、Shell 或原始文件系统能力。Bingo Go 只读 transcript，并通过校验、备份和原子替换修改允许维护的用户设置。

协议和验收细节见：

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/prd.md`](docs/prd.md)
- [`docs/acceptance.md`](docs/acceptance.md)
- [`docs/upstream-sync.zh-CN.md`](docs/upstream-sync.zh-CN.md)

## 上游与维护

- `main` 是 Bingo Go 唯一长期主线，拥有独立的根提交。
- Git remote `upstream` 只记录 Rei 的来源地址，禁止推送，也不在本仓库 fetch 或 merge Rei 历史。
- 需要参考 Rei 更新时，在仓库外的临时检出中审阅差异，再以补丁或人工移植方式提交到 Bingo Go。
- 新仓库暂不配置 `origin`，也不执行发布或推送。

详细流程见 [`docs/upstream-sync.zh-CN.md`](docs/upstream-sync.zh-CN.md)。

## 许可

Bingo Go 按 [MIT License](LICENSE) 发布。源自 Rei 的代码以及随包 Bingo 二进制继续遵循各自的 MIT 条款；完整来源和第三方声明见 [`THIRD_PARTY_NOTICES`](THIRD_PARTY_NOTICES)。

# Bingo Go 多平台终端演进方案

## 目标

为 Bingo Go 提供与当前工作区一致的终端入口，并在不破坏现有 Electron 安全边界、Bingo 会话协议和跨平台发行流程的前提下，逐步从外部终端入口演进为内嵌终端。

当前阶段只交付“在外部终端中打开”按钮。内嵌终端的依赖、PTY 进程和 UI 面板均不在本阶段引入。

## 范围与非目标

### 当前范围：P0 外部终端

- 在应用主导航提供一个跨页面可见的终端图标按钮。
- 终端始终从 main 进程保存的当前工作区启动；renderer 不提交路径、命令或 Shell 参数。
- Windows 优先使用 Windows Terminal，缺失时回退到 Windows PowerShell。
- macOS 使用系统 Terminal.app。
- Linux 优先使用 `xdg-terminal-exec`，随后按常见终端模拟器候选链回退。
- 启动成功或失败通过现有 `Result<T>` 错误模型反馈，不持有或管理外部终端进程。

### 后续范围：P1/P2 内嵌终端

- 单工作区、单终端、底部可折叠和调整高度的面板。
- ANSI/TTY 输入输出、窗口尺寸同步、复制粘贴、中文输入、`Ctrl+C` 和 TUI 程序。
- 页面切换期间保留进程；切换工作区和退出应用时受控关闭。
- Windows、macOS、Linux x64 均在对应原生 runner 上构建并完成解包运行验证。

### 非目标

- 当前阶段不支持多标签、分屏、SSH、终端会话恢复、Shell Profile、链接打开或命令搜索。
- 不允许模型消息、工具输出或网页内容自动写入终端。
- 不通过终端绕过 Bingo 的权限、Hook、Team 或会话协议。
- ARM64 原生发行继续遵循现有发行路线，不能仅靠 x64 验证宣称支持。

## 平台策略

### P0 外部终端

| 平台 | 启动策略 | 工作目录传递 | 兼容说明 |
|---|---|---|---|
| Windows x64 | `wt.exe -w -1 -d <workspace>`；失败后直接启动独立的 Windows PowerShell 进程 | `wt.exe` 使用 `-d`，回退方案继承 `spawn.cwd` | Windows Terminal 的执行别名可能被用户关闭，因此必须保留系统 PowerShell 回退 |
| macOS x64 | `/usr/bin/open -a Terminal <workspace>` | 目录作为独立参数传递给 `open` | 首版固定使用系统 Terminal.app；第三方终端选择放到后续设置项 |
| Linux x64 | `xdg-terminal-exec`、`$TERMINAL`、`x-terminal-emulator`、GNOME/KDE/Xfce/MATE/Kitty/Alacritty/WezTerm/xterm 候选链 | 统一设置 `spawn.cwd`，支持时再传终端自身的 working-directory 参数 | `xdg-terminal-exec` 仍是提案，不能作为唯一入口；精简桌面环境可能没有任何候选终端 |

所有启动都使用参数数组、`shell: false` 和独立进程。工作区只通过独立参数或进程 `cwd` 传入，不拼接到命令字符串。

### P1 内嵌终端

推荐采用以下分层：

```text
React TerminalPanel + xterm.js
        ↕ typed IPC / Zod
sandboxed preload
        ↕ allowlisted channels
main TerminalManager + node-pty
        ↕
ConPTY (Windows) / forkpty (macOS、Linux)
```

- renderer：`@xterm/xterm` 和 `@xterm/addon-fit`，仅负责显示、键盘输入和尺寸测量。
- preload：只暴露 `create`、`write`、`resize`、`close` 及数据/退出订阅，不暴露 `ipcRenderer`。
- main：`TerminalManager` 独占 PTY、Shell 解析、工作区、环境变量和进程清理。
- 布局：复用 Ant Design `Splitter`，在 `workspace-main` 内形成跨 Chat、Team、Settings 的底部面板。

`@xterm/xterm` 必须锁定已通过 production bundle 和 TUI 烟雾测试的版本。当前 `6.0.0` 存在 Vite/esbuild 二次压缩导致部分 TUI 失效的上游报告，升级不能只验证开发模式。

## 实施阶段

### P0：外部终端入口（当前阶段）

1. 新增无输入的 `terminal:open-external` IPC。
2. main 从 `WorkspaceRepository.current()` 获取目录并验证其存在。
3. 平台启动器按候选顺序启动第一个可用终端，立即解除父进程引用。
4. AppShell 增加终端图标、Tooltip、loading 和失败消息。
5. 增加平台候选、IPC/UI 调用和错误路径测试。

### P1：Windows 内嵌终端技术验证

1. 引入锁定版本的 `xterm.js`、fit addon 和 `node-pty`。
2. 完成单 PTY 的 TerminalManager、窄 IPC 和底部面板。
3. 调整 electron-builder 的原生依赖重编译策略与 `asarUnpack`。
4. 在 Windows `win-unpacked` 中验证 PowerShell、中文、resize、`Ctrl+C`、`vim`/`less`/`opencode` 和退出清理。

### P2：macOS/Linux x64 完整兼容

1. Shell 解析改为 Windows 默认 PowerShell、macOS/Linux 优先 `$SHELL` 并提供系统回退。
2. 在 macOS/Linux 原生 runner 构建 `node-pty`，不得跨平台复用 `.node` 文件。
3. 验证信号、PTY resize、Unicode/IME、快捷键差异和应用退出后的孤儿进程。
4. 三个平台的解包应用全部通过后，才将内嵌终端标记为跨平台稳定能力。

### P3：增强能力

- Shell Profile 与默认终端偏好。
- 多标签、搜索、终端重启和有限的会话元数据恢复。
- macOS/Linux ARM64 及 Windows ARM64 原生发行。
- 经独立安全设计后再评估链接、OSC 52 和命令发送能力。

## 影响文件与系统

P0 主要影响：

- `src/main/runtime/externalTerminal.ts`：平台启动策略。
- `src/main/ipc/registerIpc.ts`：可信 sender 检查后的无参数启动入口。
- `src/shared/contracts/ipc.ts`、`src/preload/index.ts`：窄类型契约。
- `src/renderer/src/components/AppShell.tsx`、`App.tsx`、`styles.css`：按钮、状态和反馈。

P1 还会影响：

- `src/main/runtime/terminalManager.ts` 与应用退出生命周期。
- renderer 终端面板和主题适配。
- `package.json`、锁文件、`electron-builder.yml`、第三方声明和三平台发行 workflow。

## 安全、兼容和数据风险

- 外部和内嵌终端都以 Bingo Go 当前用户权限运行，能够修改本地文件；它们只能由用户明确点击和输入驱动。
- renderer 不得传入可执行文件、Shell 参数或任意工作目录。当前工作区是 main 进程的唯一可信目录来源。
- 终端输出不得写入 transcript、应用日志、设置或对话 reducer，避免凭据和源码内容泄漏。
- 内嵌终端数据事件需要分批发送并限制待发送缓冲区，避免大量输出阻塞 IPC 和 UI。
- 切换工作区可能终止正在运行的内嵌命令。P1 必须在切换前确认；P0 的外部终端不受应用管理，也不会被关闭。
- `node-pty` 是平台和架构相关原生依赖，必须位于 production dependencies，并完成 ASAR 解包和原生 runner 验证。
- Linux 桌面环境差异最大；找不到终端时必须显示可操作错误，不允许静默成功。
- 本功能不新增持久化 schema。后续若保存面板高度或 Shell Profile，需要带 `schemaVersion`、默认值和旧版本回退。

## 验证计划

### P0 自动验证

- Windows：Windows Terminal 成功；`wt.exe` 不存在时回退；工作区路径包含空格时不发生字符串拼接。
- macOS：`open` 的应用名和目录参数正确。
- Linux：候选顺序、`$TERMINAL` 和全部不可用错误正确。
- IPC：拒绝非主 frame sender，renderer 无法提交路径或命令。
- UI：按钮具备可访问名称、loading 防重入和失败提示。
- 运行 `npm run typecheck`、`npm test`、`npm run build`。

### P0 原生烟雾验证

- 在 Windows、macOS、Linux 的解包应用中点击按钮，确认终端可交互且初始目录等于当前工作区。
- 关闭 Bingo Go 后，已打开的外部终端继续由用户控制。

### P1/P2 验收门槛

- 每个平台测试普通命令、中文路径、持续输出、resize、复制粘贴、`Ctrl+C`、TUI 全屏切换和异常退出。
- 应用退出后 3 秒内不存在由内嵌终端遗留的 Shell 或子进程。
- development、production bundle 和 unpacked app 三种环境均通过；只通过 dev 模式不算完成。

## 假设与待定项

- 当前发行矩阵仍为 Windows、macOS、Linux x64，ARM64 延后。
- P0 不增加“默认外部终端”设置；平台默认和候选回退足以满足首版。
- P1 首版只允许一个内嵌终端；多终端会显著扩大进程、状态和退出管理范围。
- P1 开始前需要重新核对 `xterm.js` 与 `node-pty` 的稳定版本、Electron ABI、预编译产物和未关闭的上游问题。

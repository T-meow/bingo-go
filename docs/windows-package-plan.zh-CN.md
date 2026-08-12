# Bingo Go Windows 联调与便携打包计划

## 目标

在 Windows 原生环境中打通 Bingo Go 与 bingo protocol v1 的本地通信，修复当前可复现的 Windows 路径与测试问题，并产出一个内置 bingo、无需另行配置二进制路径的便携试用包。

## 范围

- 以 bingo 现有 `feat/gui-json-events` 分支为协议实现基线。
- 将 bingo 的用户目录解析补齐为 `HOME` 优先、`USERPROFILE` 回退。
- 修复 Bingo Go 对 `bingo.exe`、打包内置二进制和 Windows 用户目录的解析。
- 将 Bingo Go 的进程型测试夹具改为跨平台启动方式，保持生产环境 `shell: false`。
- 补齐 Electron Windows 便携打包配置，只生成一个试用产物。
- 使用本地 release 版 bingo 完成 protocol probe/inspect 与基础会话启动验证。

## 非目标

- 不重做现有界面或视觉语言。
- 不增加安装器、自动更新、签名或多平台产物。
- 不改变 bingo TUI、`--print` 或现有 transcript 的兼容语义。
- 不执行浏览器视觉伴随、截图矩阵或多轮视觉 QA；这些属于单独授权的高成本流程。

## 实施阶段

1. 从 `origin/feat/gui-json-events` 建立 bingo Windows 集成分支，补齐 HOME 回退并运行 Rust 全量验证。
2. 在 Bingo Go 建立 Windows 打包分支，统一解析开发、PATH 与 packaged 三种 bingo 来源。
3. 为 RuntimeLocator、BingoInspector、StdioBingoSession 引入仅承载可执行前置参数的跨平台启动契约，修复 Windows 测试夹具。
4. 增加 electron-builder 配置，将 `bingo.exe` 放入 `resources/bin/win32-x64/`，仅生成标准 `release/win-unpacked` 测试目录。
5. 运行 TypeScript 类型检查、Vitest、生产构建、bingo protocol probe/inspect、打包产物文件与进程启动检查。

## 影响文件与系统

- bingo：`src/main.rs`、`src/platform.rs` 及对应测试。
- Bingo Go：Electron main 入口、runtime locator/session/inspector、测试夹具、`package.json`、锁文件和打包配置。
- 构建产物：bingo release 二进制与 Bingo Go `release/win-unpacked` Windows 测试目录；不创建按功能命名的发布目录。

## 兼容性与数据风险

- JSON 模式保持 opt-in；普通 bingo CLI 行为必须继续通过既有测试。
- Bingo Go 仍不直接写 transcript；settings 写入规则不变。
- 打包只复制已验证的本地 bingo release 二进制，不删除或覆盖用户配置。
- 未签名便携程序可能触发 Windows SmartScreen；本轮只报告该限制，不绕过系统安全策略。

## 验证计划

- bingo：`cargo fmt --all -- --check`、`cargo check --locked --all-targets`、`cargo clippy --locked --all-targets -- -D warnings`、`cargo test --locked --all-targets`。
- Bingo Go：`npm run typecheck`、`npm test`、`npm run build`。
- 协议：`bingo --json-events --probe` 必须只输出一条 protocol v1 NDJSON；`--inspect` 完成 ready、providers.list 与 session.close 往返。
- 包：检查 `win-unpacked` 目录路径、主程序大小、内置 `bingo.exe`、SHA-256，并做启动后无立即崩溃的进程烟雾测试。

## 假设

- 当前机器为 `win32-x64`，交付只针对该架构。
- 使用未签名的本地试用包可接受。
- 远端 GUI 协议分支是本轮协议事实来源；Bingo Go 的 `docs/architecture.md` 是 TypeScript 侧契约来源。

# app-server 重构收尾计划

- 日期：2026-08-20
- 状态：Windows 收尾完成
- 目标：让 `bingo app-server` 成为唯一会话运行链，完成 Windows unpacked 可启动、可交互、可验证的收尾版本。

## 范围

1. 修复 packaged renderer 把 `index.html` 当工作区的问题，统一从 `WorkspaceRepository` 获取当前路径。
2. 补齐 `turn/interrupt`、会话关闭、Action 执行、设置选择、Team/Room/Agent 操作和资源刷新。
3. 保留通用本机能力：工作区、外观、通知偏好、用户资料、Provider/MCP 定义、外部终端、剪贴板和游戏包。
4. 删除旧自定义会话链：`StdioBingoSession`、`SessionManager`、`BingoInspector`、`TranscriptRepository`、旧会话/协作 IPC、preload API、契约和对应测试。
5. 迁移系统通知到 app-server notification，并在窗口退出时只关闭 app-server 会话。
6. 更新 README、架构、同步、发行和主重构计划，确保当前运行时文档只描述官方 app-server。

## 验收

- 旧协议与旧协作模型关键词仅允许出现在主重构文档的历史迁移说明中。
- packaged 启动使用保存的工作区，不引用 renderer 文件路径。
- 对话提交/中断、interaction、queue、运行时设置和 Team/Room 基础动作有测试覆盖。
- `npm run typecheck`、`npm test`、`npm run build`、schema 校验和 `npm run package:win:unpacked` 全部通过。
- `release/win-unpacked` 通过运行时、ASAR、locale、内置游戏和体积校验。

## 完成结果

- packaged 启动不再从 renderer URL 或 `process.cwd()` 推断工作区；renderer 先读取 `WorkspaceRepository`，错误态可直接重新选择目录。
- `turn/interrupt`、`session/close`、重连、Action 参数、Provider/MCP 保存后重载、agents/rooms/tasks/deliveries 操作均已接通。
- 系统通知、退出清理、输入校验和会话状态已迁移到 app-server notification/snapshot。
- 旧自定义会话、transcript 直读、旧协作模型、IPC/preload/contracts 和对应测试已删除。

## 验证结果

- `npm run typecheck`：通过。
- `npm test -- --pool=threads --maxWorkers=1`：41 个测试文件、140 项测试全部通过。
- `npm run build`：通过；main、preload、renderer 与三款内置游戏均成功生成。
- 包内 runtime schema 漂移校验：与 `vendor/bingo/app-server-schema/v1.0/` 一致。
- `npm run package:win:unpacked`：通过；产物位于 `release/win-unpacked`。
- 包校验：37 个文件，277.85 MiB；`app.asar` 8,858,729 bytes；Bingo `0.4.1`，app-server `1.0`，必需 capabilities 全部存在；locale 精确为 `en-US`、`zh-CN`。
- packaged 启动冒烟：`bingo-go.exe` 保持运行，并从项目工作区拉起包内 `resources/bin/win32-x64/bingo.exe app-server`；未再把 renderer `index.html` 当工作区。
- SHA-256：主程序 `41df211280fa343e231b9f8f5ea2ebcc796554417cf83d3298feac2c1ae40891`；ASAR `b0c194e2109c31e41613ba6eacb815abf6815bbe5bf3ff0b94591241f7f27591`；Bingo runtime `79526b03533b7a7812bffffe87e5b8d8892c57273f89ed4d8a3ec9af3ef9b7f6`。

macOS/Linux 原生包仍由对应 CI runner 验证，不属于本次 Windows 本地收尾结果。

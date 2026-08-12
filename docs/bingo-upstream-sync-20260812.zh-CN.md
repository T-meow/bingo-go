# Bingo 上游同步记录（2026-08-12）

## 目标与结论

- 同步目标为官方最新稳定版 `v0.4.0`，不跟随 `dev`。
- 官方 tag 已刷新；最新稳定 tag 仍为 `v0.4.0`，commit 为 `129cb528714865041db2202aad38e1e0d59d7eee`。
- 当前 `feat/gui-json-events-windows` 分支包含该 tag，并继续保留 protocol v1、设置检查、Team workspace 和图片附件能力。
- 原有未提交修改、stash 和备份分支均保留，没有执行 reset、清理或覆盖源码。

## 验证结果

以下命令全部通过：

- `cargo fmt --all -- --check`
- `cargo check --locked --all-targets`
- `cargo clippy --locked --all-targets -- -D warnings`
- `cargo test --locked --all-targets`
- `cargo build --locked --release`

release 二进制验证结果：

- 版本：`bingo 0.4.0`
- protocol：`1`
- capability：`settings.inspect.v1`
- capability：`team.workspace.v1`
- capability：`attachments.input.v1`
- SHA-256：`840C60BD1DD38EE1EBF6446A705A5C704991C5D1F76ED423EC9E4066786C5613`

`scripts/prepare-windows-package.mjs` 已验证并复制该二进制到 `resources/bin/win32-x64/bingo.exe`。源文件与随包副本的 SHA-256 一致；随包副本继续被 Git 忽略。

## 兼容性说明

这里的稳定基线是 Bingo 上游 `v0.4.0` 加本地 GUI protocol v1 适配，不表示普通官方 release 必然已包含 `--json-events`。Bingo Go 启动时仍必须通过 protocol probe，缺失所需 capability 时应明确拒绝不兼容二进制。

本次操作只更新远端引用、Cargo 构建产物和 Bingo Go 随包二进制，没有提交或推送 Bingo 仓库，也没有删除任何备份。

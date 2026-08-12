# Bingo protocol v1 patch

自动构建从 [yexrob/bingo](https://github.com/yexrob/bingo) 的固定提交
`129cb528714865041db2202aad38e1e0d59d7eee`（`v0.4.0`）检出源码，再应用
`v0.4.0-protocol-v1.patch`。该补丁是 Bingo Go 当前 GUI protocol v1 的可复现源码来源，
包含 `settings.inspect.v1`、`team.workspace.v1` 和 `attachments.input.v1`。

当前补丁 SHA-256：`dfdb5f8c2a65d7c279547031fae0ac710b4e614de7d47ed4ec6dae181119aff1`。

补丁及其生成的 Bingo 二进制遵循上游 Bingo 的 MIT License。CI 会在每个平台原生编译，
随后执行版本、protocol 和 capability 探针；编译产物不进入本仓库。

更新补丁时必须同时更新 workflow 中的 `BINGO_REVISION`，并完成 Rust 全量验证和 Bingo Go
三平台构建。不要让 CI 跟随上游移动分支或未固定的 tag。

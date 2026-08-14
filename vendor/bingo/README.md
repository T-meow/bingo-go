# Bingo protocol v1 patch

自动构建从 [yexrob/bingo](https://github.com/yexrob/bingo) 的固定提交
`9ed235c393045a48b9dcdad108dfc0fa53a6890a`（Cargo 版本仍为 `v0.4.0`）检出源码，再应用
`v0.4.0-protocol-v1.patch`。该补丁是 Bingo Go 当前 GUI protocol v1 的可复现源码来源，
并通过 capability 协商提供 Team blueprint schema v2。打包要求至少包含
`team.workspace.v1`、`team.tasks.v1`、`team.blueprint.v2`、`team.lobby.v1`、
`team.presets.v1`、`team.member.profile.v1`，以及设置、图片和会话能力。

当前补丁 SHA-256：`97e9fac17f394133f7373b8dd9f985189bc3d7b6736a53d692808be135c7ccb0`。

补丁及其生成的 Bingo 二进制遵循上游 Bingo 的 MIT License。CI 会在每个平台原生编译，
随后执行版本、protocol 和 capability 探针；编译产物不进入本仓库。

更新补丁时必须同时更新 workflow 中的 `BINGO_REVISION`，并完成 Rust 全量验证和 Bingo Go
三平台构建。不要让 CI 跟随上游移动分支或未固定的 tag。

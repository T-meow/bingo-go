# Bingo Go 上游来源与同步

## 仓库关系

- `main` 是 Bingo Go 的独立主线，不合并 Rei 的无共同祖先历史。
- `origin` 指向 Bingo Go 公开仓库。
- `upstream` 只记录 Rei 来源 `https://github.com/yexrob/rei.git`，禁止 push，也不作为日常跟踪分支。
- Bingo CLI 是相邻但独立维护的仓库，不属于 Bingo Go 工作树。

## 参考 Rei 更新

Rei 更新应在 Bingo Go 仓库外的临时检出中获取和审阅：

1. 记录上次与本次参考的完整 commit SHA。
2. 比较行为、依赖、测试和安全边界。
3. 只移植明确需要的改动，以 Bingo Go 普通提交保留来源说明。
4. 保持 Bingo Go 品牌、protocol v1、工作区、Team v2、附件、游戏隔离和打包规则。
5. 不使用 `--allow-unrelated-histories`，不把临时 clone 或 remote-tracking refs 带回仓库。
6. 完成类型检查、测试和生产构建。

## 同步 Bingo CLI

当前可重复构建基线为：

- Bingo commit：`9ed235c393045a48b9dcdad108dfc0fa53a6890a`
- Cargo 版本：`v0.4.0`
- Wire protocol：v1
- 扩展补丁：`vendor/bingo/v0.4.0-protocol-v1.patch`

Team v2 通过 capability 扩展 protocol v1，蓝图使用 schema v2。完整运行时必须提供 `team.workspace.v1`、`team.tasks.v1`、`team.blueprint.v2`、`team.lobby.v1`、`team.presets.v1` 和 `team.member.profile.v1`。

升级 Bingo 基线时：

1. 在独立临时检出中切换到目标稳定 tag 或完整 SHA。
2. 应用或重建协议补丁，审阅每个冲突，不直接覆盖现有 patch。
3. 验证普通 TUI/CLI 行为和 protocol v1 行为均未回退。
4. 运行 Rust 检查：

```bash
cargo fmt --all -- --check
cargo check --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
```

5. 检查 `--version` 与单条 NDJSON `--json-events --probe` 输出。
6. 更新 workflow 固定 commit、vendor patch、版本检查和第三方声明。
7. 在 Bingo Go 运行 `npm run typecheck`、`npm test`、`npm run build` 与目标平台完整打包验证。

`resources/bin/` 只保存打包流程生成的临时 runtime，不进入 Git。开发时可以用绝对路径的 `BINGO_GUI_BINARY` 指向已验证二进制；CI 始终从固定源码重新构建。

## 同步记录要求

每次实际同步在对应 Git 提交或 Pull Request 中记录：

- 来源项目、tag、完整 commit SHA 和日期。
- 移植范围、冲突决策与未采用内容。
- Wire protocol、schema 和 capability 变化。
- Rust、TypeScript、测试、构建与打包验证结果。
- 许可证、依赖和 `THIRD_PARTY_NOTICES` 变化。

本仓库不保存临时 clone、补丁试验目录、构建缓存或已完成的同步过程文档。

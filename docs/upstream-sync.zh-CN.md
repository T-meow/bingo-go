# Bingo Go 上游来源与维护

## 仓库约定

- `main` 是 Bingo Go 的独立主线，从项目当前快照建立根提交，不包含 Rei 的 Git 历史。
- `upstream` 只记录 Rei 来源 `https://github.com/yexrob/rei.git`，push URL 固定为 `DISABLED`。
- 主仓库不 fetch Rei，不创建 `upstream/*` remote-tracking refs，也不 merge 无共同祖先的 Rei 分支。
- `origin` 指向独立公开仓库 `git@github.com:T-meow/bingo-go.git`；Rei 仍只作为来源记录，不是跟踪分支。

## 审阅 Rei 更新

Rei 更新必须在 Bingo Go 仓库之外的临时检出中获取和审阅。记录待参考的 Rei commit SHA，比较其行为、测试和安全边界后，只移植确实需要的改动。

推荐流程：

1. 在独立临时目录 clone 或 fetch Rei，不修改 Bingo Go 的 Git refs。
2. 记录上次参考 SHA、本次参考 SHA 和相关上游提交。
3. 审阅差异，按模块生成补丁或在 Bingo Go 中进行窄范围人工实现。
4. 保留 Bingo Go 的品牌、protocol v1 集成、工作区、Team、图片附件和 Windows 打包行为。
5. 在 Bingo Go 中把移植作为普通功能或修复提交，不使用 `--allow-unrelated-histories`。
6. 运行类型检查、测试和生产构建，并在同步记录中写明冲突决策和验证结果。

## Bingo CLI 同步

Bingo CLI 在相邻的独立仓库中维护。Bingo Go 当前以官方稳定版 `v0.4.0` 为基线，同时需要本地 protocol v1 适配。

同步新稳定版时应先保护 Bingo 仓库的分支、stash 和未提交修改，再合入官方稳定标签并验证：

```powershell
cargo fmt --all -- --check
cargo check --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
```

只有 `--version` 和 `--json-events --probe` 同时通过，且探针包含所需 capability 后，才可更新 `vendor/bingo/v0.4.0-protocol-v1.patch` 和 workflow 中的固定 commit。CI 通过 `scripts/prepare-bingo-package.mjs` 生成当前平台的 `resources/bin/<platform>-<arch>/bingo[.exe]`；这些二进制都是可重建产物，不进入 Git。

## 同步记录

每次同步记录以下信息：

- Rei 或 Bingo 的上游 commit/tag 与同步日期。
- 移植范围、冲突处理和保留的 Bingo Go 行为。
- protocol 版本、capability 和二进制校验结果。
- TypeScript、Rust、测试、生产构建和打包验证结果。
- `LICENSE` 与 `THIRD_PARTY_NOTICES` 是否仍准确。

项目外的历史备份只用于恢复，不属于新仓库，也不得重新导入为活动 refs。

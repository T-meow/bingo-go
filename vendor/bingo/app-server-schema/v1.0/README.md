# bingo app-server schema bundle v1.0

受控副本，来源：

- 仓库：https://github.com/yexrob/bingo.git
- commit：`7bee209d191c41b62b8b9e135bf5124f581e7505`（tag `v0.4.1`）
- 源路径：`schema/app-server/`

生成与校验：

```bash
node scripts/generate-app-server-types.mjs
node scripts/generate-app-server-fixtures.mjs
node scripts/verify-app-server-schema.mjs <path-to-bingo-binary>
```

许可：随上游 Bingo 按 MIT License 提供。升级上游 commit 后必须重跑三个脚本并更新本文件。

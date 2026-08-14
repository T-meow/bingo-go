# Bingo Go 跨平台发行

## 产物范围

GitHub Actions 在原生 runner 上构建 x64 产物：

- Windows：NSIS `.exe`
- macOS Intel：DMG 与 ZIP
- Linux：AppImage 与 DEB

Pull Request 只运行类型检查、测试、生产 bundle 和 Team v2 协议测试。`main`、`workflow_dispatch` 与 `v*` 标签运行三平台打包；标签版本与 `package.json` 一致时才发布 GitHub Release。

当前产物未进行 Windows code signing、Apple Developer ID 签名或 notarization，也不提供 ARM64 和自动更新。

## 可重复的 Bingo 运行时

CI 不读取开发机工作树，也不跟随移动分支：

1. 检出固定 Bingo commit `9ed235c393045a48b9dcdad108dfc0fa53a6890a`，对应 Cargo 版本 `v0.4.0`。
2. 应用 `vendor/bingo/v0.4.0-protocol-v1.patch`。
3. 使用 `cargo build --locked --release` 在目标 runner 构建原生二进制。
4. 验证 `bingo 0.4.0`、wire protocol v1 和完整必需 capability。
5. 将二进制复制到 `resources/bin/<platform>-<arch>/`，校验复制前后 SHA-256。
6. electron-builder 只打包当前平台的运行时。
7. 从最终解包应用中再次执行探针和文件校验。

必需 capability 由 `scripts/bingo-package-lib.mjs` 统一定义，包括设置检查、工作区、附件、上下文和完整 Team v2 能力。

## 本地打包

默认要求 Bingo 与 Bingo Go 位于同一父目录。命令会构建相邻 `../bingo` 的当前工作树，因此发布前必须先检查其分支和修改状态。

```bash
npm run package:win
npm run package:mac
npm run package:linux
```

Windows unpacked 测试包：

```powershell
npm run package:win:unpacked
```

`release/win-unpacked` 是可重建测试产物，每次运行该命令可直接清理并覆盖，不保留旧包或备份。本地发行物只写入 `release/`；allowlist reset 若发现未知文件或目录会立即停止，避免误删用户内容。不会创建 `.package-archive` 或根目录 `release-*`。

常规非游戏改动和小版本打包默认不额外执行游戏专项打包或 `smoke:package:games`。只有用户明确要求、游戏/游戏容器发生改动或进行大版本更新时，才追加 `npm run build:games` 与 `npm run smoke:package:games`。应用包仍保留三款内置游戏，基础 `verify:package` 继续检查其存在性与体积。

## 自动校验

`npm run verify:package` 校验：

- 包内主程序、Bingo runtime 和 `app.asar` 均存在。
- Bingo 版本、wire protocol 和 capability 完整。
- Windows/Linux 只包含 `zh-CN` 与 `en-US` locale。
- ASAR 只包含允许的 main/preload 生产依赖。
- 内置游戏恰好为三款，单包和总量符合门槛。
- unpacked、ASAR、运行时和主程序 SHA-256 与体积数据可输出审计。
- 对正式打包命令，目标平台发行格式存在。

按上述条件启用时，`smoke:package:games` 使用独立临时 `userData` 启动真实 packaged app，验证游戏启动、单窗口切换、禁用关闭、续局、定向清除、网络限制与存储隔离。

## GitHub Actions 安全边界

- 第三方 Action 固定到完整 commit SHA。
- 默认 workflow 权限是 `contents: read`；仅标签发布 job 使用 `contents: write`。
- 当前不保存长期签名 secret。
- 普通构建产物保留 14 天；Release 只接收验证后的原生包与 SHA-256 清单。
- Bingo 基线 commit 与协议补丁必须一起升级并重新验证。

## 发布检查

1. 更新并提交 `package.json` 与 lockfile 版本。
2. 在目标平台运行类型检查、测试、构建和本地包验证。
3. 确认 vendor patch 能干净应用到固定 commit。
4. 确认许可证与 `THIRD_PARTY_NOTICES` 准确。
5. 推送 `vX.Y.Z` 标签，并确认三平台 package job 全部通过。
6. 核对 GitHub Release 文件名、SHA-256 清单和未签名提示。

Apple Silicon 目前通过 Rosetta 运行 Intel 包；原生 ARM64、签名与 notarization 需要独立评审后再加入。

# Bingo Go 跨平台自动发行方案

## 目标

每次推送 `main` 后，在 GitHub 托管的原生 runner 上构建可下载的 Windows、macOS 和 Linux x64 包；推送版本标签时，在三平台全部通过后创建 GitHub Release。发行包必须携带同平台的 Bingo v0.4.0 protocol v1 运行时并完成真实探针。

## 范围与非目标

- Windows 生成 NSIS 安装器，macOS 生成 DMG 和 ZIP，Linux 生成 AppImage 和 DEB。
- PR 只运行 TypeScript 类型检查、Vitest 和生产 bundle 构建，不生成发行包。
- `main`、`workflow_dispatch` 和 `v*` 标签运行三平台打包；普通产物保留 14 天。
- 本阶段只提供 x64、未签名产物，不配置 Windows 证书、Apple Developer ID、notarization、自动更新或 ARM64。

## 实现边界

1. Workflow 固定检出 Bingo 官方 `v0.4.0` commit `129cb528714865041db2202aad38e1e0d59d7eee`。
2. 应用 [`../vendor/bingo/v0.4.0-protocol-v1.patch`](../vendor/bingo/v0.4.0-protocol-v1.patch)，运行 `cargo build --locked --release`，不依赖开发机工作树或远端移动分支。
3. `scripts/prepare-bingo-package.mjs` 要求版本严格为 `bingo 0.4.0`，protocol 为 v1，并验证三个必需 capability 和复制前后 SHA-256。
4. electron-builder 仅打包当前 runner 的 `resources/bin/<platform>-<arch>/`；运行时按 Electron 的实际平台和架构定位该文件。
5. 打包后再次从解包应用资源中执行 Bingo 探针，并检查平台要求的所有发行格式。
6. 产物附带每个平台独立的 SHA-256 清单。只有 `vX.Y.Z` 与 `package.json` 版本一致时才允许创建 Release。

## 安全与兼容性

- 官方 GitHub Actions 使用完整 commit SHA 固定，并在注释中记录版本。
- 默认 workflow 权限为 `contents: read`；只有标签发布 job 使用 `contents: write`。
- 未配置任何长期 secret。未来加入签名时，应把凭据限制在受保护环境，并单独评审 fork PR、日志和产物泄漏风险。
- protocol patch 和基线 commit 必须作为一个整体升级。同步新 Bingo 稳定版时，先在临时检出中完成 Rust 全量验证，再更新仓库补丁。

## 验证计划

- 本地：`npm run typecheck`、`npm test`、`npm run build`、patch apply/check 和 Windows 原生解包验证。
- Actions：三个 package job 都要通过 Bingo release build、源码差异检查、运行时准备、Electron 打包、随包探针和 SHA-256 生成。
- `main` 推送后检查三个 Actions artifact；正式版本再用匹配版本标签验证 Release job。

## 假设

- GitHub 托管 runner 继续提供 Rust stable、Node.js 24 所需系统能力和对应 x64 原生环境。
- macOS Intel 包可在 Intel Mac 直接运行；Apple Silicon 用户需使用 Rosetta。ARM64 原生发行属于后续扩展。
- 用户接受首版未签名包可能触发 SmartScreen、Gatekeeper 或发行版安全提示。

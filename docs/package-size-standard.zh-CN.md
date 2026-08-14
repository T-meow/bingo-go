# Bingo Go 打包体积规范

## 硬门槛

- Windows x64 `release/win-unpacked`：不超过 320 MiB。
- `resources/app.asar`：不超过 15 MiB。
- 内置游戏总量：不超过 3 MiB。
- 任一内置游戏：不超过 1 MiB。
- Windows/Linux locale：只保留 `zh-CN` 与 `en-US`。

逻辑文件大小是硬门槛；安装器压缩后大小只作为补充指标。不得通过删除 Electron 必需 DLL、裁剪 Bingo 功能或修改用户数据换取体积。

## 依赖分类

- `dependencies` 只放 main/preload 在生产环境外部加载的包。
- React、Ant Design、Markdown、构建和测试依赖属于 `devDependencies`，由 Vite 打入 renderer bundle，不应重复出现在 ASAR 的 `node_modules`。
- 新依赖必须先确认实际运行进程；renderer-only 包不能进入生产依赖。

当前 ASAR 生产依赖白名单由 `scripts/verify-packaged-runtime.mjs` 定义，并包含这些依赖实际需要的传递包。修改依赖时必须同步校验脚本和体积结果。

## 唯一 release 规则

仓库本地只保留当前发行物：

```text
release/
`-- win-unpacked/        # Windows unpacked 命令的最终目录
```

正式安装器命令可以在 `release/` 根部生成对应平台文件，但下一次打包前都会被重置。不保留 `.package-archive`、`release-fixed`、`release-team-*` 或其他历史副本。

`scripts/reset-package-output.mjs` 使用 allowlist：

- 只接受 electron-builder 的已知 unpacked 目录、配置文件、更新元数据、校验清单和发行格式。
- 遇到符号链接、特殊文件或未知名称时立即停止。
- 只解析并操作项目根下的精确 `release/`，不接受调用方传入其他目标。

## Windows unpacked 流程

```powershell
npm run package:win:unpacked
```

命令依次执行：

1. 清理 `release/` 中 allowlist 允许的旧产物。
2. 构建相邻 `../bingo` 的 Windows x64 release runtime。
3. 构建 `games/build` 与 Electron bundles。
4. 校验并复制 runtime 到 `resources/bin/win32-x64/bingo.exe`。
5. 生成 `release/win-unpacked`。
6. 从最终包中验证运行时、ASAR、locale、游戏与体积。

完成后运行：

```powershell
npm run smoke:package:games
```

游戏 smoke 使用命令创建的系统临时目录作为独立 `userData`。它验证三款游戏启动、网络与窗口限制、单窗口切换、续局、禁用关闭、定向清除和存储隔离，并只清理自己创建的临时目录。

## 自动校验内容

`npm run verify:package` 必须确认：

- 包内 Bingo 版本为 `bingo 0.4.0`，wire protocol 为 v1，必需 capability 完整。
- 主程序、Bingo runtime 和 ASAR 的 SHA-256 可计算并输出。
- ASAR 不含 React、Ant Design 等 renderer-only 依赖。
- locale 集合精确匹配白名单。
- 恰好存在三款内置游戏，且单包与总量均符合限制。
- unpacked 与 ASAR 不超过硬门槛。
- 正式打包命令生成目标平台要求的发行格式。

内置游戏构建输出位于 `games/build`，外部 `.bingo-pack` 默认输出位于 `games/dist`；二者都可重建且不进入 Git。

## 发布前验证

```bash
npm run typecheck
npm test
npm run build
npm run package:win:unpacked
npm run smoke:package:games
```

其他平台在原生环境运行对应 `package:*` 命令。最终交付前检查 `release/` 只含本次产物，并清理 `out/`、`games/build/`、`games/dist/` 和 `resources/bin/` 等可重建缓存。

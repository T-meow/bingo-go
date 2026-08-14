# Bingo Go 小游戏包作者指南

## 快速开始

复制 `games/examples/minimal`，修改根目录的 `manifest.json`、HTML、CSS 和 JavaScript，然后执行：

```powershell
npm run pack:game -- games/examples/minimal
```

默认产物为 `games/dist/<id>-<version>.bingo-pack`。也可以在目录参数后指定输出路径。打包命令会在写入 ZIP 前检查 manifest、路径、链接、文件数和体积。

在 Bingo Go 中打开“设置 > 小游戏”，选择“导入游戏包”。主进程会先返回未签名警告、manifest、SHA-256 和版本关系；只有再次确认后才安装。

## 文件格式

`.bingo-pack` 是 ZIP 文件，`manifest.json` 必须直接位于根目录：

```json
{
  "schemaVersion": 1,
  "kind": "game",
  "id": "com.example.snake",
  "name": "Snake",
  "version": "1.0.0",
  "entry": "index.html",
  "description": "Classic snake",
  "author": "Example",
  "icon": "icon.png",
  "window": {
    "width": 480,
    "height": 600,
    "minWidth": 360,
    "minHeight": 480,
    "resizable": true
  }
}
```

- `id` 使用全小写 reverse-DNS，安装后的存储隔离和替换关系都以此 ID 为准。
- `version` 必须是可比较的数字三段式 `MAJOR.MINOR.PATCH`，不接受预发布后缀。
- `entry` 必须是包内相对 `.html` 路径；路径使用 `/`，不能包含空段、`.`、`..`、反斜杠、URL 分隔符或 Windows 禁用字符。
- `icon` 可省略；存在时只接受 PNG 或 WebP，最大 256 KiB。
- 窗口宽高和最小宽高单位均为 CSS 像素。
- v1 manifest 是严格结构，未知字段会被拒绝。

## 运行边界

游戏运行在独立 Electron `BrowserWindow` 和独立持久化 session 中：

- 没有 Preload、Node.js、Electron API 或 Bingo Go IPC。
- 所有权限请求、下载、弹窗和跨包导航都会被拒绝。
- HTTP、HTTPS、WebSocket 和其他外联全部被拒绝。
- CSP 只允许包内脚本、样式、图片、字体和媒体；不允许 inline script/style、`eval`、worker、iframe、Service Worker 或表单提交。
- 每个 ID 的 localStorage、IndexedDB、Cookie 和缓存彼此隔离，并在升级时保留。
- 系统明暗模式可通过 `prefers-color-scheme` 或 `color-scheme` 使用，宿主不会注入主题或语言。

因此 HTML 中应使用外部 `<script src>` 和 `<link rel="stylesheet">`，依赖应在作者构建阶段打进包内，不要引用 CDN。

## 存档规范

用户创建的游戏状态应自行写入浏览器存储，并从第一版加入 schema：

```json
{ "schemaVersion": 1, "score": 12 }
```

读取时先校验字段、类型和边界。损坏或不支持的存档只重置本游戏，不抛出未捕获异常。升级时应优先兼容旧 schema；无法兼容时明确迁移或重建，不能假设降级后的代码能读取新格式。

## 硬性限制

| 项目 | 上限 |
| --- | ---: |
| `.bingo-pack` 压缩文件 | 10 MiB |
| 解压后总量 | 25 MiB |
| ZIP 条目 | 256 |
| 单文件 | 8 MiB |
| `manifest.json` | 64 KiB |
| 图标 | 256 KiB |

安装器拒绝绝对路径、路径回退、大小写重复条目、加密条目、符号链接和特殊文件。内置游戏 ID 永远不能被外部包覆盖。

## 发布前检查

1. 运行 `npm run pack:game -- <目录>`。
2. 从“设置 > 小游戏”导入并核对 ID、版本、作者和 SHA-256。
3. 测试首次启动、关闭后续局、窗口缩放、明暗模式和存档损坏恢复。
4. 确认开发者工具、Node、网络、弹窗和下载不是游戏的必要条件。
5. 升级同一 ID 时分别测试旧存档迁移和降级警告。

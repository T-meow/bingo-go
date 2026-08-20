# Bingo Go 当前架构

本文档记录 app-server 重构后的当前实现边界。旧自定义 NDJSON 前端已移除。

## 系统边界

```text
React renderer (sandboxed, contextIsolation)
          | typed and validated IPC
          v
Electron preload + main (trusted host boundary)
          | JSON-RPC 2.0 / NDJSON / stdio
          v
bingo app-server（官方 v0.4.1，未修改）
          |-- AppCore：conversations/turns/items/queue/interactions/operations
          `-- Engine：model stream / tools / agents / rooms / tasks
```

- Renderer 只负责界面、本地视图状态和交互。
- Main 负责窗口、子进程、可信文件访问、系统通知、游戏窗口，以及 app-server 传输。
- Bingo 负责模型、工具、权限、提示、Team、任务、记忆和 transcript 写入。

## 主进程模块

- `runtimeLocator.ts`：通过 `bingo app-server` initialize/shutdown 探测运行时。
- `appServerTransport.ts`：NDJSON 拆帧、帧上限、背压、stdout/stderr 分离。
- `appServerConnection.ts`：initialize 状态机、JSON-RPC 请求关联、seq 空洞检测、错误映射。
- `appServerSession.ts`：typed 请求 facade（session/conversation/turn/queue/interaction/action/config/catalog/resource/asset）。
- `appServerSessionManager.ts`：单会话生命周期、快照与事件转发、desync 自动重读、restartCurrent。
- `appServerActionService.ts`：action/execute 的高层动作。
- `appServerAssetService.ts`：asset 注册与分块读取。
- `appServerSettingsAdapter.ts`：运行时选择与定义写后重载。
- `registerAppServerIpc.ts`：app-server 专用 IPC 面。
- `registerHostIpc.ts`：工作区、设置、外观、通知、资料和游戏等本机 IPC 面。
- `settingsRepository.ts`：Provider/MCP 定义的 revision 安全读写；不保存会话或协作运行态。

## Renderer 模块

- `store/appStore.ts`：客户端 reducer。原子快照 + 有序事件流，item 分为 log/live，队列、交互、操作、资源集合均为替换式更新；seq 有洞触发 desync 重读。
- `AppV2.tsx`：应用入口，从持久化工作区启动 app-server，并协调会话、协作和设置视图。
- `AppShellV2`：Layout + Splitter 四区骨架。
- `ConversationCanvas` / `ItemRenderer` / `Composer` / `InteractionCard` / `ContextPanel` / `TurnGroup`：统一会话画布。
- `ConversationSidebar`：当前 session 的 conversations 与历史 session 列表。
- `WorkspacePage`：Roster/Rooms/Tasks/Deliveries 协作工作台。
- `AppServerSettingsView`：catalog/config 驱动的运行时设置，以及本机 Provider/MCP、外观、通知、资料和游戏设置。

## Wire 协议

```bash
bingo app-server
```

- JSON-RPC 2.0，stdin/stdout 每行一个 frame，stderr 仅诊断。
- 客户端必须先 `initialize`，再发送 `initialized`，之后才能调用其他 request。
- 会话由 `session/start` / `session/resume` 打开；对话由 `conversation/read` 快照 + `item/*` 事件恢复。
- 权限/提问是持久 interaction，通过 `interaction/respond` 回答。
- 大附件经 `asset/registerPath` + `asset/readChunk` 分块传输。

## 安全边界

- Renderer 启用 sandbox 和 context isolation，不拥有 Node.js、Shell、原始 IPC 或任意文件系统访问。
- Preload 只暴露显式类型化 API；main 校验 payload、调用来源、路径和运行状态。
- Bingo 是 transcript 的唯一写入者。
- API Key 不进入 renderer 持久状态、会话记录或游戏包。
- 小游戏使用独立窗口、持久化分区和自定义协议；没有 preload、Node/Electron API、下载、弹窗或网络访问。
- 本地打包包含相邻 Bingo 工作树当前已保存的代码，发布前检查来源和 Git 状态。

## 验证

```bash
npm run typecheck
npm test
npm run build
node scripts/verify-app-server-schema.mjs ../bingo/target/release/bingo
```

# Agent 工作台界面重构计划

## 目标

- 把当前默认组件拼装页收敛为以任务执行为中心的 Agent 工作台。
- 只展示 app-server 已提供的真实状态，不新增虚构指标或无后端能力的操作。
- 延续现有 antd、Ant Design X、主题变量和三栏架构，不改协议层与主进程。

## 页面结构

1. 左侧导航：区分主任务、子 Agent、协作房间，集中显示运行、未读、待确认和队列状态。
2. 中央任务流：突出当前 Agent/房间身份、回合状态、消息、思考和工具执行；输入器固定在底部。
3. 右侧检查器：展示当前运行配置、上下文占用、Token、待处理事项与最近工具活动。
4. 窄窗口：侧栏和检查器改为抽屉，并提供可访问的图标入口。

## 实现范围

- 调整 `AppShellV2`、`ConversationSidebar`、`ConversationCanvas`、`Composer`、`TurnGroup`、`ItemRenderer` 与 `ContextPanel`。
- 新增独立的 `AgentInspector`，由 `AppV2` 传入 store 中的会话、Agent、配置和 transcript 数据。
- 在 `styles.css` 增加隔离的 V2 工作台样式；不清理旧样式，避免影响仍在使用的设置和团队组件。
- 补充关键渲染测试，并执行 typecheck、相关测试和 renderer build。

## 非目标

- 不新增会话协议、附件上传、消息编辑或持久化能力。
- 不改 Team/Settings 的业务流程，不提交 Git。

## 验证结果

- `npm run typecheck` 通过。
- `npm test` 通过，共 41 个测试文件、141 条用例。
- `npm run build` 通过，main、preload 与 renderer 均成功打包。

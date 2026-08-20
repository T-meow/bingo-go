# UI 组件能力扫描（antd / Ant Design X）

- 扫描日期：2026-08-20
- 来源：`node_modules/antd@6.6.0`、`node_modules/@ant-design/x@2.9.0`
- 用途：为 `docs/app-server-refactor-plan.zh-CN.md` 第 5 章 UI 设计提供组件级依据
- 结论：**继续使用 antd + Ant Design X，不引入其他 UI 库。**

## 1. antd@6.6.0

### 1.1 导出组件（76 个）

```text
Affix Alert Anchor App AutoComplete Avatar BackTop Badge BorderBeam Breadcrumb
Button Calendar Card Carousel Cascader Checkbox Col Collapse ColorPicker
ConfigProvider DatePicker Descriptions Divider Drawer Dropdown Empty Flex
FloatButton Form Grid Image Input InputNumber Layout List Listy Masonry Mentions
Menu message Modal notification Pagination Popconfirm Popover Progress QRCode
Radio Rate Result Row Segmented Select Skeleton Slider Space Spin Splitter
Statistic Steps Switch Table Tabs Tag theme TimePicker Timeline Tooltip Tour
Transfer Tree TreeSelect Typography Upload version Watermark
```

### 1.2 本次重构重点使用

| 组件 | 能力 | 使用点 |
| --- | --- | --- |
| `App` / `ConfigProvider` / `theme` | message/modal/notification 上下文；主题 token | 全局 Provider |
| `Layout` / `Flex` / `Splitter` | 布局、可拖拽分栏 | AppShellV2 四区骨架 |
| `Listy` | 虚拟列表、sticky group、按 key 滚动 | 长 transcript / 房间消息流 |
| `Masonry` | 瀑布卡片布局 | Roster / Rooms 总览 |
| `Card` / `Avatar` / `Badge` / `Tag` | 卡片、头像、徽标、状态 | 成员卡、房间卡、未读/提及 |
| `Table` | 排序/过滤表格 | Tasks / Deliveries |
| `Tree` / `TreeSelect` / `Cascader` | 树形选择 | 会话树、目录选择 |
| `Mentions` | `@` 联想输入 | 成员/房间提及 |
| `Drawer` / `Modal` / `Popconfirm` / `Popover` | 面板、确认、浮层 | 设置、蓝图、破坏性确认 |
| `Tabs` / `Segmented` / `Menu` | 分区导航 | Workspace 四视图、设置分区 |
| `Progress` | line/circle/dashboard | Context 占用环、operation 进度 |
| `Statistic` / `Descriptions` | 数值与键值展示 | Context/Turn/Room/Roster Inspector |
| `Timeline` / `Steps` | 时间线/步骤 | 轮次重试、operation 生命周期 |
| `Skeleton` / `Empty` / `Result` / `Alert` | 加载/空/结果/错误态 | 各页面反馈态 |
| `Input.Search` / `AutoComplete` | 搜索与联想 | 会话搜索、命令面板 |
| `Upload`（底层）/ `Image` | 文件选择/图片预览 | 附件（注册改走 asset/registerPath） |
| `Typography` | 文本与截断 | Markdown 文本 |
| `FloatButton` / `BackTop` / `Affix` | 快速回到最新 | 长会话滚动 |

## 2. @ant-design/x@2.9.0

### 2.1 导出（19 个）

```text
Actions Attachments Bubble CodeHighlighter Conversations FileCard Folder
Mermaid notification Prompts Sender SenderSwitch Sources Suggestion Think
ThoughtChain Welcome XProvider version
```

### 2.2 逐项能力与使用点

| 组件 | 关键 API | 使用点 |
| --- | --- | --- |
| `XProvider` | 统一主题/组件配置，兼容 antd ConfigProvider | 全局 Provider |
| `Bubble` | placement/variant/shape/streaming/typing/loading/editable；header/footer/avatar/extra 槽位 | 单条消息渲染 |
| `Bubble.List` | 按 `role` 批量配置（user/ai/system/divider + 自定义角色），ref.scrollTo | main / agent DM / room 群聊消息流 |
| `Bubble.System` / `Bubble.Divider` | 系统行 / 分隔行 | compaction、rewind、interruption、成员进出 |
| `Sender` | value/loading/onSubmit/onCancel/onPasteFile；prefix/header/footer/suffix 槽位；autoSize；allowSpeech；slotConfig（text/input/select/tag/skill/custom）；`skill` chip | 主 Composer |
| `Sender.Switch` | checked/loading/onChange | normal/shell 模式切换 |
| `Sender.Header` | Sender 头部槽位 | 可选标题/模式说明 |
| `ThoughtChain` / `ThoughtChain.Item` | items/status/collapsible/blink/line；icon/title/description/content/footer | 工具链、agent recentActivity、operation 进度 |
| `Think` | title/loading/expanded/blink/destroyOnHidden | 推理块折叠 |
| `Actions` | items/onClick/subItems/danger/variant/fadeIn | 消息操作、成员/房间操作 |
| `Attachments` | items/placeholder/overflow/upload/select；`Attachment` 兼容 UploadFile + FileCard | Composer 附件条 |
| `FileCard` / `FileCard.List` | 文件卡与溢出列表 | 附件、asset item |
| `Conversations` | items/activeKey/menu/groupable/creation/shortcutKeys | Main/Agents/Rooms 会话树 |
| `Prompts` | items/title/onItemClick/vertical/wrap | 空态提示 |
| `Welcome` | icon/title/description/extra/variant | 欢迎屏 |
| `Suggestion` | items/children render prop/onSelect | `@成员`/`#房间`/`/命令` 联想 |
| `Sources` | items/inline/expanded/onClick | 引用来源折叠 |
| `CodeHighlighter` | 代码高亮 | Markdown 代码块 |
| `Mermaid` | Mermaid 图渲染 | Markdown 图 |
| `notification` | X 风格通知 | 全局事件提示（可选） |

### 2.3 明确限制

- v2.9.0 **没有** `useXAgent` / `useXChat` hooks 导出；运行态由 bingo-go 自己的 `appStore` 承担。
- `Bubble.List` 未宣称超长虚拟化能力；长列表外层统一用 antd `Listy` 虚拟化，item 内再渲染 Bubble。
- `Attachments` 默认按 Upload 语义处理文件；本项目必须改道：本地 File → main 临时文件 → `asset/registerPath`，组件只负责选择与预览。
- 版本必须锁定：antd `6.6.0`、@ant-design/x `2.9.0`，升级需先对照本扫描文档与交互回归测试。

## 3. 与 DSCode Desktop 的映射

DSCode Desktop 是结构参考（自定义 CSS + core RPC），本项目用 antd/x 重建同构交互：

| DSCode 结构 | 本项目组件 |
| --- | --- |
| sidebar project/thread | `Layout` + `Conversations` + `Tree` |
| conversation column | `ConversationCanvas`（`Listy` + `Bubble.List` + `ItemRenderer`） |
| context rail | `Progress dashboard` + `Statistic` + `Descriptions` |
| inspector preview | `Drawer`/`Splitter.Panel` + `CodeHighlighter` + `Image` |
| composer | `Sender` + `Attachments` + `Sender.Switch` + `Suggestion` |
| inline request / approval | `InteractionCard`（Card/Modal） |
| work log timeline | `ThoughtChain` / `Timeline` |
| settings dialog | `Drawer` + `Menu` + `Tabs` |
| command palette / session search | `Modal` + `Input.Search` + `List` |
| plan todo | `Steps` / `List`（映射 notice/assistant 语义） |

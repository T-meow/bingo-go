import { useEffect, useState } from 'react'
import { Button, Drawer, Flex, Layout, Splitter, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  MenuOutlined,
  MessageOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined
} from '@ant-design/icons'

export type AppViewV2 = 'conversations' | 'workspace' | 'settings'

export function AppShellV2({ view, onViewChange, sidebar, children, inspector, inspectorCollapsed, onInspectorCollapsedChange, workspacePath, onSelectWorkspace, onOpenCommands, onOpenGames }: {
  view: AppViewV2
  onViewChange: (view: AppViewV2) => void
  sidebar?: React.ReactNode
  children: React.ReactNode
  inspector?: React.ReactNode
  inspectorCollapsed?: boolean
  onInspectorCollapsedChange?: (collapsed: boolean) => void
  workspacePath?: string
  onSelectWorkspace?: () => void
  onOpenCommands?: () => void
  onOpenGames?: () => void
}): React.JSX.Element {
  const [compact, setCompact] = useState(() => window.innerWidth < 980)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const collapsed = inspectorCollapsed ?? false

  useEffect(() => {
    const resize = (): void => setCompact(window.innerWidth < 980)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (!compact) {
      setSidebarOpen(false)
      setInspectorOpen(false)
    }
  }, [compact])

  useEffect(() => {
    setSidebarOpen(false)
    setInspectorOpen(false)
  }, [view])

  return (
    <Layout className="app-shell-v2">
      <aside className="app-rail-v2">
        <div className="brand-mark" aria-label="Bingo Go"><img src="./icon.svg" alt="" /></div>
        <div className="rail-actions-v2">
          <RailButtonV2 label="会话" active={view === 'conversations'} icon={<MessageOutlined />} onClick={() => onViewChange('conversations')} />
          <RailButtonV2 label="团队" active={view === 'workspace'} icon={<TeamOutlined />} onClick={() => onViewChange('workspace')} />
        </div>
        <div className="rail-utilities-v2">
          {compact && sidebar && <Tooltip title="会话侧栏" placement="right"><Button type="text" icon={<MenuOutlined />} aria-label="打开会话侧栏" onClick={() => setSidebarOpen(true)} /></Tooltip>}
          {compact && inspector && <Tooltip title="运行详情" placement="right"><Button type="text" icon={<InfoCircleOutlined />} aria-label="打开运行详情" onClick={() => setInspectorOpen(true)} /></Tooltip>}
          {onOpenCommands && <Tooltip title="命令面板" placement="right"><Button type="text" icon={<SearchOutlined />} aria-label="打开命令面板" onClick={onOpenCommands} /></Tooltip>}
          {onOpenGames && <Tooltip title="小游戏" placement="right"><Button type="text" icon={<AppstoreOutlined />} aria-label="打开小游戏中心" onClick={onOpenGames} /></Tooltip>}
          {onSelectWorkspace && (
            <Tooltip title={<span>选择工作区{workspacePath ? <><br />{workspacePath}</> : null}</span>} placement="right">
              <Button type="text" icon={<FolderOpenOutlined />} aria-label="选择工作区" onClick={onSelectWorkspace} />
            </Tooltip>
          )}
          <RailButtonV2 label="设置" active={view === 'settings'} icon={<SettingOutlined />} onClick={() => onViewChange('settings')} />
        </div>
      </aside>
      <Layout className="app-main-v2">
        <Splitter onResize={() => undefined}>
          {!compact && sidebar && (
            <Splitter.Panel defaultSize={280} min={248} max={380}>
              <aside className="context-sidebar-v2">{sidebar}</aside>
            </Splitter.Panel>
          )}
          <Splitter.Panel min={440}>
            <section className="workspace-main-v2">{children}</section>
          </Splitter.Panel>
          {!compact && inspector && (
            <Splitter.Panel size={collapsed ? 44 : undefined} defaultSize={328} min={collapsed ? 44 : 296} max={440} resizable={!collapsed}>
              <Flex vertical className={`workspace-inspector-v2${collapsed ? ' is-collapsed' : ''}`}>
                {onInspectorCollapsedChange && (
                  <Button className="inspector-collapse-v2" type="text" size="small" onClick={() => onInspectorCollapsedChange(!collapsed)} aria-label={collapsed ? '展开运行详情' : '折叠运行详情'}>
                    {collapsed ? <LeftOutlined /> : <RightOutlined />}
                  </Button>
                )}
                {!collapsed && <div className="inspector-panel-body-v2">{inspector}</div>}
              </Flex>
            </Splitter.Panel>
          )}
        </Splitter>
      </Layout>
      {sidebar && <Drawer className="shell-drawer-v2" title="会话" placement="left" size={320} open={compact && sidebarOpen} onClose={() => setSidebarOpen(false)}>
        {sidebar}
      </Drawer>}
      {compact && inspector && (
        <Drawer className="shell-drawer-v2" title="运行详情" placement="right" size={344} open={compact && inspectorOpen} onClose={() => setInspectorOpen(false)}>
          {inspector}
        </Drawer>
      )}
    </Layout>
  )
}

function RailButtonV2({ label, active, icon, onClick }: { label: string; active: boolean; icon: React.ReactNode; onClick: () => void }): React.JSX.Element {
  return <Tooltip title={label} placement="right"><Button type="text" className={`rail-button-v2${active ? ' active' : ''}`} icon={icon} aria-label={label} onClick={onClick} /></Tooltip>
}

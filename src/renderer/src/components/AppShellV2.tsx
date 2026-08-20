import { useEffect, useState } from 'react'
import { Button, Drawer, Flex, Layout, Splitter, Tooltip } from 'antd'
import { FolderOpenOutlined, MessageOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons'

export type AppViewV2 = 'conversations' | 'workspace' | 'settings'

export function AppShellV2({ view, onViewChange, sidebar, children, inspector, inspectorCollapsed, onInspectorCollapsedChange, workspacePath, onSelectWorkspace }: {
  view: AppViewV2
  onViewChange: (view: AppViewV2) => void
  sidebar: React.ReactNode
  children: React.ReactNode
  inspector?: React.ReactNode
  inspectorCollapsed?: boolean
  onInspectorCollapsedChange?: (collapsed: boolean) => void
  workspacePath?: string
  onSelectWorkspace?: () => void
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

  return (
    <Layout className="app-shell-v2">
      <aside className="app-rail-v2">
        <div className="brand-mark" aria-label="Bingo Go"><img src="./icon.svg" alt="" /></div>
        {onSelectWorkspace && (
          <Tooltip title={<span>选择工作区{workspacePath ? <><br />{workspacePath}</> : null}</span>} placement="right">
            <Button type="text" icon={<FolderOpenOutlined />} aria-label="选择工作区" onClick={onSelectWorkspace} />
          </Tooltip>
        )}
        {compact && <Button type="text" aria-label="打开侧栏" onClick={() => setSidebarOpen(true)}>☰</Button>}
        <div className="rail-actions-v2">
          <RailButtonV2 label="会话" active={view === 'conversations'} icon={<MessageOutlined />} onClick={() => onViewChange('conversations')} />
          <RailButtonV2 label="团队" active={view === 'workspace'} icon={<TeamOutlined />} onClick={() => onViewChange('workspace')} />
          <RailButtonV2 label="设置" active={view === 'settings'} icon={<SettingOutlined />} onClick={() => onViewChange('settings')} />
        </div>
      </aside>
      <Layout className="app-main-v2">
        <Splitter>
          {!compact && (
            <Splitter.Panel defaultSize={288} min={240} max={420}>
              <aside className="context-sidebar-v2">{sidebar}</aside>
            </Splitter.Panel>
          )}
          <Splitter.Panel min={440}>
            <section className="workspace-main-v2">{children}</section>
          </Splitter.Panel>
          {!compact && inspector && (
            <Splitter.Panel defaultSize={collapsed ? 40 : 340} min={collapsed ? 40 : 320} max={520}>
              <Flex vertical className="workspace-inspector-v2">
                {onInspectorCollapsedChange && (
                  <Button type="text" size="small" onClick={() => onInspectorCollapsedChange(!collapsed)} aria-label={collapsed ? '展开检查器' : '折叠检查器'}>
                    {collapsed ? '‹' : '›'}
                  </Button>
                )}
                {!collapsed && <div className="inspector-panel-body-v2">{inspector}</div>}
              </Flex>
            </Splitter.Panel>
          )}
        </Splitter>
      </Layout>
      <Drawer title="导航" placement="left" width={288} open={compact && sidebarOpen} onClose={() => setSidebarOpen(false)}>
        {sidebar}
      </Drawer>
      {compact && inspector && (
        <Drawer title="检查器" placement="right" width={328} open={compact && inspectorOpen} onClose={() => setInspectorOpen(false)}>
          {inspector}
        </Drawer>
      )}
    </Layout>
  )
}

function RailButtonV2({ label, active, icon, onClick }: { label: string; active: boolean; icon: React.ReactNode; onClick: () => void }): React.JSX.Element {
  return <Tooltip title={label} placement="right"><Button type="text" className={`rail-button-v2${active ? ' active' : ''}`} icon={icon} aria-label={label} onClick={onClick} /></Tooltip>
}

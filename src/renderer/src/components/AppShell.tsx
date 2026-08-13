import { useEffect, useState } from 'react'
import { Button, Drawer, Tooltip } from 'antd'
import { CodeOutlined, FolderOpenOutlined, InfoCircleOutlined, LeftOutlined, MenuOutlined, MessageOutlined, RightOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons'
import { BingoGame } from './BingoGame'

export type AppView = 'chat' | 'team' | 'settings'

export function AppShell({ view, onViewChange, sidebar, children, inspector, inspectorCollapsed, onInspectorCollapsedChange, workspacePath, workspaceBusy, workspaceDisabled, onSelectWorkspace, terminalBusy, terminalDisabled, onOpenExternalTerminal }: {
  view: AppView
  onViewChange: (view: AppView) => void
  sidebar: React.ReactNode
  children: React.ReactNode
  inspector?: React.ReactNode
  inspectorCollapsed: boolean
  onInspectorCollapsedChange: (collapsed: boolean) => void
  workspacePath?: string
  workspaceBusy: boolean
  workspaceDisabled: boolean
  onSelectWorkspace: () => void
  terminalBusy: boolean
  terminalDisabled: boolean
  onOpenExternalTerminal: () => void
}): React.JSX.Element {
  const [compact, setCompact] = useState(() => window.innerWidth < 980)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [bingoOpen, setBingoOpen] = useState(false)

  useEffect(() => {
    const resize = (): void => setCompact(window.innerWidth < 980)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const changeView = (next: AppView): void => {
    onViewChange(next)
    setSidebarOpen(false)
  }

  return (
    <div className={`app-shell${inspector ? ' has-inspector' : ''}${inspector && inspectorCollapsed ? ' inspector-collapsed' : ''}`}>
      <nav className="app-rail" aria-label="主导航">
        <div className="brand-mark" aria-label="Bingo Go"><img src="./icon.svg" alt="" /></div>
        <Tooltip title={<span>选择工作区{workspacePath ? <><br />{workspacePath}</> : null}</span>} placement="right"><Button className="rail-button rail-workspace" type="text" icon={<FolderOpenOutlined />} aria-label="选择工作区" loading={workspaceBusy} disabled={workspaceDisabled} onClick={onSelectWorkspace} /></Tooltip>
        <Tooltip title={<span>在外部终端中打开{workspacePath ? <><br />{workspacePath}</> : null}</span>} placement="right"><Button className="rail-button rail-terminal" type="text" icon={<CodeOutlined />} aria-label="在外部终端中打开" loading={terminalBusy} disabled={terminalDisabled} onClick={onOpenExternalTerminal} /></Tooltip>
        {compact && <Tooltip title="打开侧栏" placement="right"><Button className="rail-button rail-menu" type="text" icon={<MenuOutlined />} aria-label="打开侧栏" onClick={() => setSidebarOpen(true)} /></Tooltip>}
        <div className="rail-actions">
          <RailButton label="对话" active={view === 'chat'} icon={<MessageOutlined />} onClick={() => changeView('chat')} />
          <RailButton label="Team" active={view === 'team'} icon={<TeamOutlined />} onClick={() => changeView('team')} />
          <RailButton label="设置" active={view === 'settings'} icon={<SettingOutlined />} onClick={() => changeView('settings')} />
        </div>
        {compact && inspector && <Tooltip title="打开检查器" placement="right"><Button className="rail-button rail-inspector" type="text" icon={<InfoCircleOutlined />} aria-label="打开检查器" onClick={() => setInspectorOpen(true)} /></Tooltip>}
        <button className="brand-name" type="button" aria-label="打开 Bingo 彩蛋游戏" onClick={() => setBingoOpen(true)}>BINGO GO</button>
      </nav>
      {!compact && <aside className="context-sidebar">{sidebar}</aside>}
      <section className="workspace-main">{children}</section>
      {inspector && !compact && <aside className="workspace-inspector">
        <div className="inspector-toggle-row">
          <Tooltip title={inspectorCollapsed ? '展开检查器' : '折叠检查器'} placement="left">
            <Button type="text" icon={inspectorCollapsed ? <LeftOutlined /> : <RightOutlined />} aria-label={inspectorCollapsed ? '展开检查器' : '折叠检查器'} onClick={() => onInspectorCollapsedChange(!inspectorCollapsed)} />
          </Tooltip>
        </div>
        {!inspectorCollapsed && <div className="inspector-panel-body">{inspector}</div>}
      </aside>}
      <Drawer title="导航" placement="left" size={264} open={compact && sidebarOpen} onClose={() => setSidebarOpen(false)} rootClassName="context-drawer">
        {sidebar}
      </Drawer>
      <Drawer title="检查器" placement="right" size={328} open={compact && inspectorOpen} onClose={() => setInspectorOpen(false)} rootClassName="inspector-drawer">
        {inspector}
      </Drawer>
      <BingoGame open={bingoOpen} onClose={() => setBingoOpen(false)} />
    </div>
  )
}

function RailButton({ label, active, icon, onClick }: { label: string; active: boolean; icon: React.ReactNode; onClick: () => void }): React.JSX.Element {
  return <Tooltip title={label} placement="right"><Button type="text" className={`rail-button${active ? ' active' : ''}`} icon={icon} aria-label={label} aria-current={active ? 'page' : undefined} onClick={onClick} /></Tooltip>
}

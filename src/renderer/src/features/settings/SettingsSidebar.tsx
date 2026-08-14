import { Menu } from 'antd'
import { ApiOutlined, AppstoreOutlined, BellOutlined, BgColorsOutlined, ControlOutlined, InfoCircleOutlined, SafetyCertificateOutlined, SettingOutlined, TeamOutlined, ToolOutlined, UserOutlined } from '@ant-design/icons'

export type SettingsSection = 'profile' | 'general' | 'providers' | 'permissions' | 'team' | 'mcp' | 'appearance' | 'notifications' | 'games' | 'advanced' | 'about'

const items = [
  { key: 'profile', icon: <UserOutlined />, label: '个人资料' },
  { key: 'general', icon: <SettingOutlined />, label: '常规与运行' },
  { key: 'providers', icon: <ApiOutlined />, label: 'API 供应商' },
  { key: 'permissions', icon: <SafetyCertificateOutlined />, label: '权限' },
  { key: 'team', icon: <TeamOutlined />, label: 'Team 与协作' },
  { key: 'mcp', icon: <ToolOutlined />, label: 'MCP' },
  { key: 'appearance', icon: <BgColorsOutlined />, label: '外观' },
  { key: 'notifications', icon: <BellOutlined />, label: '通知' },
  { key: 'games', icon: <AppstoreOutlined />, label: '小游戏' },
  { key: 'advanced', icon: <ControlOutlined />, label: '高级' },
  { key: 'about', icon: <InfoCircleOutlined />, label: '关于' }
]

export function SettingsSidebar({ active, dirty, onChange }: { active: SettingsSection; dirty?: SettingsSection | null; onChange: (section: SettingsSection) => void }): React.JSX.Element {
  const menuItems = items.map((item) => ({ ...item, label: <span className="settings-menu-label"><span>{item.label}</span>{dirty === item.key && <i aria-label="有未保存更改" />}</span> }))
  return <div className="sidebar-content settings-sidebar"><header className="sidebar-title"><div><span>Bingo Go</span><strong>设置</strong></div></header><Menu mode="inline" selectedKeys={[active]} items={menuItems} onClick={({ key }) => onChange(key as SettingsSection)} /></div>
}

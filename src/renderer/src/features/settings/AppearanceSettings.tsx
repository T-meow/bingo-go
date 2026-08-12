import { useEffect, useState } from 'react'
import { Alert, Button, ColorPicker, Segmented, Space, Switch, Typography } from 'antd'
import { CheckOutlined, ReloadOutlined } from '@ant-design/icons'
import type { AppearancePreferencesV1 } from '../../../../shared/contracts/ipc'
import { useAppearance } from '../../theme/AppearanceProvider'

const PRESETS = [
  { name: '雾紫', value: '#756AA8' },
  { name: '青绿', value: '#3F7C75' },
  { name: '蓝灰', value: '#4D6F91' },
  { name: '森林绿', value: '#557A5B' },
  { name: '石墨', value: '#62666D' }
]

export function AppearanceSettings(): React.JSX.Element {
  const appearance = useAppearance()
  const [draft, setDraft] = useState(appearance.values)
  const [saved, setSaved] = useState(false)
  useEffect(() => setDraft(appearance.values), [appearance.values])
  useEffect(() => () => appearance.resetPreview(), [appearance.resetPreview])
  const update = <K extends keyof AppearancePreferencesV1>(key: K, value: AppearancePreferencesV1[K]): void => {
    setSaved(false)
    setDraft((current) => {
      const next = { ...current, [key]: value }
      appearance.preview(next)
      return next
    })
  }
  const restore = (): void => {
    setDraft(appearance.values)
    setSaved(false)
    appearance.resetPreview()
  }
  const save = async (): Promise<void> => setSaved(await appearance.save(draft))
  const dirty = JSON.stringify(draft) !== JSON.stringify(appearance.values)

  return <SettingsSectionLayout title="外观" description="Bingo Go 的界面外观独立于 Bingo 终端主题。">
    {appearance.error && <Alert type="error" showIcon message={appearance.error.code} description={appearance.error.msg} />}
    <div className="settings-form-section">
      <div className="setting-row"><div><strong>颜色模式</strong><span>跟随系统会自动响应 Windows 的明暗模式。</span></div><Segmented value={draft.colorMode} options={[{ label: '跟随系统', value: 'system' }, { label: '明亮', value: 'light' }, { label: '暗色', value: 'dark' }]} onChange={(value) => update('colorMode', value as AppearancePreferencesV1['colorMode'])} /></div>
      <div className="setting-row setting-row-top"><div><strong>主题色</strong><span>用于选中态、主操作和键盘焦点。</span></div><div className="color-controls"><ColorPicker value={draft.accentColor} disabledAlpha showText format="hex" onChange={(color) => update('accentColor', color.toHexString().toUpperCase())} /><div className="color-presets">{PRESETS.map((preset) => <button type="button" key={preset.value} className={`color-swatch${draft.accentColor.toUpperCase() === preset.value ? ' active' : ''}`} style={{ backgroundColor: preset.value }} aria-label={preset.name} title={preset.name} onClick={() => update('accentColor', preset.value)}>{draft.accentColor.toUpperCase() === preset.value && <CheckOutlined />}</button>)}</div></div></div>
      <div className="setting-row"><div><strong>界面密度</strong><span>紧凑模式适合同时查看更多运行信息。</span></div><Segmented value={draft.density} options={[{ label: '舒适', value: 'comfortable' }, { label: '紧凑', value: 'compact' }]} onChange={(value) => update('density', value as AppearancePreferencesV1['density'])} /></div>
      <div className="setting-row"><div><strong>减少动效</strong><span>关闭非必要动画，保留状态和进度反馈。</span></div><Switch checked={draft.motion === 'reduced'} onChange={(checked) => update('motion', checked ? 'reduced' : 'system')} /></div>
    </div>
    <div className="theme-preview" style={{ '--preview-accent': draft.accentColor } as React.CSSProperties}>
      <div><span>实时预览</span><strong>安静、清晰的工作界面</strong><Typography.Text>紫色只承担交互强调，其余区域保持中性。</Typography.Text></div><Button type="primary">主要操作</Button>
    </div>
    <Space className="settings-actions"><Button icon={<ReloadOutlined />} disabled={!dirty} onClick={restore}>还原</Button><Button type="primary" loading={appearance.saving} disabled={!dirty} onClick={() => void save()}>{saved && !dirty ? '已保存' : '保存外观'}</Button></Space>
  </SettingsSectionLayout>
}

export function SettingsSectionLayout({ title, description, extra, children }: { title: string; description: string; extra?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return <section className="settings-section"><header className="settings-section-header"><div><span>设置</span><h1>{title}</h1><p>{description}</p></div>{extra}</header>{children}</section>
}

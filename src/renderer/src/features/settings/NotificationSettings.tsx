import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Space, Switch } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { GuiError, NotificationPreferencesSnapshot, NotificationPreferencesV1 } from '../../../../shared/contracts/ipc'
import { SettingsSectionLayout, type SettingsSectionTransaction } from './AppearanceSettings'

const DEFAULT_NOTIFICATIONS: NotificationPreferencesV1 = {
  schemaVersion: 1,
  enabled: true,
  turnCompleted: true,
  actionRequired: true,
  failures: true,
  sound: true
}

export function NotificationSettings({ onTransactionChange }: { onTransactionChange?: (transaction: SettingsSectionTransaction | null) => void }): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<NotificationPreferencesSnapshot | null>(null)
  const [draft, setDraft] = useState(DEFAULT_NOTIFICATIONS)
  const [error, setError] = useState<GuiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const result = await window.bingoGui.readNotificationPreferences()
    setLoading(false)
    if (!result.ok) {
      setSnapshot(null)
      setError(result.error)
      return
    }
    setSnapshot(result.value)
    setDraft(result.value.values)
    setSaved(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const update = <K extends keyof NotificationPreferencesV1>(key: K, value: NotificationPreferencesV1[K]): void => {
    setSaved(false)
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const restore = useCallback((): void => {
    if (!snapshot) return
    setDraft(snapshot.values)
    setSaved(false)
  }, [snapshot])
  const save = useCallback(async (): Promise<boolean> => {
    if (!snapshot) return false
    setSaving(true)
    setError(null)
    const result = await window.bingoGui.saveNotificationPreferences({ baseRevision: snapshot.revision, values: draft })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setSnapshot(result.value)
    setDraft(result.value.values)
    setSaved(true)
    return true
  }, [draft, snapshot])
  const dirty = Boolean(snapshot && JSON.stringify(draft) !== JSON.stringify(snapshot.values))

  useEffect(() => {
    onTransactionChange?.(dirty ? { save, discard: restore } : null)
    return () => onTransactionChange?.(null)
  }, [dirty, onTransactionChange, restore, save])

  return <SettingsSectionLayout title="通知" description="控制 Bingo Go 在后台运行时发送的系统通知。">
    {error && <Alert type="error" showIcon message={error.code} description={error.msg} action={!snapshot ? <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>重新读取</Button> : undefined} />}
    {snapshot && !snapshot.supported && <Alert type="info" showIcon message="当前系统不支持通知" description="偏好仍会保存，但 Bingo Go 无法在此环境中显示系统通知。" />}
    {snapshot && <>
      <div className="settings-form-section">
        <NotificationRow title="系统通知" description="仅在窗口隐藏、最小化或失焦时发送。"><Switch aria-label="系统通知" checked={draft.enabled} onChange={(value) => update('enabled', value)} /></NotificationRow>
        <NotificationRow title="任务完成" description="后台回合运行至少 10 秒并完成时提醒。"><Switch aria-label="任务完成" checked={draft.turnCompleted} disabled={!draft.enabled} onChange={(value) => update('turnCompleted', value)} /></NotificationRow>
        <NotificationRow title="等待处理" description="Bingo 等待确认或回答时立即提醒。"><Switch aria-label="等待处理" checked={draft.actionRequired} disabled={!draft.enabled} onChange={(value) => update('actionRequired', value)} /></NotificationRow>
        <NotificationRow title="运行失败" description="回合、会话或运行时连接失败时立即提醒。"><Switch aria-label="运行失败" checked={draft.failures} disabled={!draft.enabled} onChange={(value) => update('failures', value)} /></NotificationRow>
        <NotificationRow title="通知声音" description="使用操作系统的默认通知声音。"><Switch aria-label="通知声音" checked={draft.sound} disabled={!draft.enabled} onChange={(value) => update('sound', value)} /></NotificationRow>
      </div>
      <Space className="settings-actions"><Button icon={<ReloadOutlined />} disabled={!dirty || saving} onClick={restore}>还原</Button><Button type="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>{saved && !dirty ? '已保存' : '保存通知设置'}</Button></Space>
    </>}
  </SettingsSectionLayout>
}

function NotificationRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }): React.JSX.Element {
  return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div><div className="setting-control">{children}</div></div>
}

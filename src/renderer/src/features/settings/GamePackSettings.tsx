import { useCallback, useEffect, useState } from 'react'
import { Alert, App, Button, Checkbox, Descriptions, List, Modal, Skeleton, Space, Switch, Tag, Typography } from 'antd'
import { DeleteOutlined, DownloadOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import type { GamePackImportPreview, GamePackItem, GamePackSnapshot } from '../../../../shared/contracts/ipc'
import { SettingsSectionLayout } from './AppearanceSettings'

export function GamePackSettings(): React.JSX.Element {
  const { message, modal } = App.useApp()
  const [snapshot, setSnapshot] = useState<GamePackSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [operation, setOperation] = useState<string | null>(null)
  const [preview, setPreview] = useState<GamePackImportPreview | null>(null)
  const [uninstalling, setUninstalling] = useState<GamePackItem | null>(null)
  const [clearOnUninstall, setClearOnUninstall] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const result = await window.bingoGui.listGamePacks()
    if (result.ok) {
      setSnapshot(result.value)
      setError(null)
    } else setError(result.error.msg)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => window.bingoGui.onGamePackEvent((event) => {
    if (event.type === 'catalog-changed') void load()
    else if (event.message) void message.error(event.message)
  }), [load, message])

  const choose = async (): Promise<void> => {
    setOperation('choose')
    const result = await window.bingoGui.chooseGamePack()
    setOperation(null)
    if (!result.ok) void message.error(result.error.msg)
    else if (!result.value.canceled) setPreview(result.value.preview)
  }

  const install = async (): Promise<void> => {
    if (!preview || !snapshot) return
    setOperation('install')
    const result = await window.bingoGui.installGamePack({ token: preview.token, baseRevision: snapshot.revision })
    setOperation(null)
    if (!result.ok) {
      void message.error(result.error.msg)
      return
    }
    setSnapshot(result.value)
    setPreview(null)
    void message.success(preview.relation === 'new' ? '小游戏已安装并启用' : '小游戏已替换并启用')
  }

  const setEnabled = async (item: GamePackItem, enabled: boolean): Promise<void> => {
    if (!snapshot) return
    setOperation(item.manifest.id)
    const result = await window.bingoGui.setGamePackEnabled({ id: item.manifest.id, enabled, baseRevision: snapshot.revision })
    setOperation(null)
    if (result.ok) setSnapshot(result.value)
    else void message.error(result.error.msg)
  }

  const launch = async (item: GamePackItem): Promise<void> => {
    setOperation(item.manifest.id)
    const result = await window.bingoGui.launchGamePack({ id: item.manifest.id })
    setOperation(null)
    if (!result.ok) void message.error(result.error.msg)
  }

  const clearData = (item: GamePackItem): void => {
    modal.confirm({
      title: `清除“${item.manifest.name}”的数据？`,
      content: '这会永久清除该游戏的 localStorage、IndexedDB、Cookie 和缓存，不影响其他游戏。',
      okText: '清除数据', cancelText: '取消', okButtonProps: { danger: true },
      onOk: async () => {
        const result = await window.bingoGui.clearGamePackData({ id: item.manifest.id })
        if (!result.ok) throw new Error(result.error.msg)
        void message.success('游戏数据已清除')
      }
    })
  }

  const uninstall = async (): Promise<void> => {
    if (!snapshot || !uninstalling) return
    setOperation(uninstalling.manifest.id)
    const result = await window.bingoGui.uninstallGamePack({ id: uninstalling.manifest.id, clearData: clearOnUninstall, baseRevision: snapshot.revision })
    setOperation(null)
    if (!result.ok) {
      void message.error(result.error.msg)
      return
    }
    setSnapshot(result.value)
    setUninstalling(null)
    setClearOnUninstall(false)
    void message.success('小游戏已卸载，包文件已移入可恢复归档')
  }

  const relationTone = preview?.relation === 'downgrade' ? 'error' : preview?.relation === 'same' ? 'warning' : 'info'
  return <>
    <SettingsSectionLayout title="小游戏" description="管理内置游戏和本地导入的 HTML5 游戏包。" extra={<Space><Button icon={<ReloadOutlined />} disabled={loading || Boolean(operation)} onClick={() => void load()}>刷新</Button><Button type="primary" icon={<DownloadOutlined />} aria-label="导入游戏包" loading={operation === 'choose'} onClick={() => void choose()}>导入游戏包</Button></Space>}>
      {error && <Alert type="error" showIcon title="小游戏目录不可用" description={error} action={<Button onClick={() => void load()}>重试</Button>} />}
      {snapshot?.warnings.map((warning) => <Alert key={warning} type="warning" showIcon title="已隔离损坏的游戏包" description={warning} />)}
      {loading && !snapshot
        ? <Skeleton active paragraph={{ rows: 8 }} />
        : <List className="game-pack-settings-list" dataSource={snapshot?.items ?? []} locale={{ emptyText: '没有可用的小游戏' }} renderItem={(item) => <List.Item actions={[
          <Button key="play" type="text" icon={<PlayCircleOutlined />} disabled={!item.enabled || item.status !== 'ready' || Boolean(operation)} onClick={() => void launch(item)}>启动</Button>,
          <Button key="clear" type="text" disabled={Boolean(operation)} onClick={() => clearData(item)}>清除数据</Button>,
          ...(item.source === 'external' ? [<Button key="remove" type="text" danger icon={<DeleteOutlined />} aria-label="卸载" disabled={Boolean(operation)} onClick={() => { setClearOnUninstall(false); setUninstalling(item) }}>卸载</Button>] : [])
        ]}>
          <List.Item.Meta
            avatar={<div className="game-pack-avatar" aria-hidden="true">{item.manifest.name.slice(0, 1).toUpperCase()}</div>}
            title={<Space wrap><strong>{item.manifest.name}</strong><Tag>{item.source === 'builtin' ? '内置' : '外部'}</Tag><Tag color={item.status === 'ready' ? 'success' : 'error'}>{item.status === 'ready' ? '有效' : '已隔离'}</Tag></Space>}
            description={<div className="game-pack-meta"><span>{item.manifest.description ?? '无描述'}</span><Typography.Text type="secondary">v{item.manifest.version} · {item.manifest.author ?? '未知作者'}</Typography.Text><Typography.Text className="game-pack-hash" copyable={{ text: item.sha256 }} type="secondary">SHA-256 {item.sha256.slice(0, 12)}...</Typography.Text>{item.error && <Typography.Text type="danger">{item.error}</Typography.Text>}</div>}
          />
          <Switch aria-label={`${item.enabled ? '禁用' : '启用'} ${item.manifest.name}`} checked={item.enabled} loading={operation === item.manifest.id} disabled={Boolean(operation) || (item.status !== 'ready' && !item.enabled)} onChange={(enabled) => void setEnabled(item, enabled)} />
        </List.Item>} />}
    </SettingsSectionLayout>

    <Modal open={Boolean(preview)} title="确认导入小游戏包" okText={preview?.relation === 'new' ? '安装并启用' : '替换并启用'} cancelText="取消" confirmLoading={operation === 'install'} mask={{ closable: false }} okButtonProps={{ danger: preview?.relation === 'downgrade' }} onOk={() => void install()} onCancel={() => setPreview(null)}>
      {preview && <Space orientation="vertical" size="middle" className="game-pack-confirm">
        <Alert type="warning" showIcon title="此游戏包未签名" description="小游戏会在无 Node、无 IPC、无网络权限的独立窗口中运行。请仅安装你信任来源的本地包。" />
        {preview.relation !== 'new' && <Alert type={relationTone} showIcon title={relationLabel(preview)} description={preview.relation === 'downgrade' ? '降级可能无法读取新版本存档；旧包仅在替换成功后才会退出使用。' : '旧包仅在新包完整校验并安装成功后才会退出使用。'} />}
        <Descriptions size="small" column={1} items={[
          { key: 'name', label: '游戏', children: `${preview.manifest.name} ${preview.manifest.version}` },
          { key: 'id', label: 'ID', children: preview.manifest.id },
          { key: 'author', label: '作者', children: preview.manifest.author ?? '未声明' },
          { key: 'hash', label: 'SHA-256', children: <Typography.Text copyable>{preview.sha256}</Typography.Text> },
          { key: 'size', label: '体积', children: `${formatBytes(preview.compressedBytes)} 压缩 / ${formatBytes(preview.extractedBytes)} 解压 / ${preview.entryCount} 项` }
        ]} />
      </Space>}
    </Modal>

    <Modal open={Boolean(uninstalling)} title={`卸载“${uninstalling?.manifest.name ?? ''}”？`} okText="卸载" cancelText="取消" confirmLoading={operation === uninstalling?.manifest.id} okButtonProps={{ danger: true, 'aria-label': '卸载' }} onOk={() => void uninstall()} onCancel={() => { setUninstalling(null); setClearOnUninstall(false) }}>
      <Typography.Paragraph>游戏包将从目录移除并放入应用数据目录内的可恢复归档，不再显示或运行。</Typography.Paragraph>
      <Checkbox checked={clearOnUninstall} onChange={(event) => setClearOnUninstall(event.target.checked)}>同时永久清除这个游戏的存档、Cookie 和缓存</Checkbox>
    </Modal>
  </>
}

function relationLabel(preview: GamePackImportPreview): string {
  if (preview.relation === 'upgrade') return `升级：${preview.existingVersion} → ${preview.manifest.version}`
  if (preview.relation === 'downgrade') return `降级：${preview.existingVersion} → ${preview.manifest.version}`
  return `覆盖同一版本：${preview.manifest.version}`
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}

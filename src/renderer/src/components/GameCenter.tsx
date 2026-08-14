import { useCallback, useEffect, useState } from 'react'
import { App, Button, Empty, List, Modal, Skeleton, Tag, Typography } from 'antd'
import { PlayCircleOutlined, SettingOutlined } from '@ant-design/icons'
import type { GamePackSnapshot } from '../../../shared/contracts/ipc'

export function GameCenter({ open, onClose, onOpenSettings }: { open: boolean; onClose: () => void; onOpenSettings: () => void }): React.JSX.Element {
  const { message } = App.useApp()
  const [snapshot, setSnapshot] = useState<GamePackSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [launching, setLaunching] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const result = await window.bingoGui.listGamePacks()
    if (result.ok) setSnapshot(result.value)
    else void message.error(result.error.msg)
    setLoading(false)
  }, [message])

  useEffect(() => {
    if (open) void load()
  }, [open, load])
  useEffect(() => window.bingoGui.onGamePackEvent((event) => {
    if (event.type === 'catalog-changed' && open) void load()
    if (event.type !== 'catalog-changed' && event.message) void message.error(event.message)
  }), [load, message, open])

  const launch = async (id: string): Promise<void> => {
    setLaunching(id)
    const result = await window.bingoGui.launchGamePack({ id })
    setLaunching(null)
    if (!result.ok) {
      void message.error(result.error.msg)
      return
    }
    onClose()
  }
  const games = snapshot?.items.filter((item) => item.enabled && item.status === 'ready') ?? []

  return <Modal className="game-center-modal" open={open} title="小游戏" width={460} footer={null} onCancel={onClose}>
    {loading && !snapshot
      ? <Skeleton active paragraph={{ rows: 4 }} />
      : games.length === 0
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有已启用的小游戏"><Button icon={<SettingOutlined />} aria-label="打开小游戏设置" onClick={() => { onClose(); onOpenSettings() }}>打开小游戏设置</Button></Empty>
        : <List className="game-center-list" dataSource={games} renderItem={(item) => <List.Item
          actions={[<Button key="play" type="primary" shape="circle" icon={<PlayCircleOutlined />} aria-label={`启动 ${item.manifest.name}`} loading={launching === item.manifest.id} disabled={Boolean(launching)} onClick={() => void launch(item.manifest.id)} />]}
        >
          <List.Item.Meta
            avatar={<div className="game-pack-avatar" aria-hidden="true">{item.manifest.name.slice(0, 1).toUpperCase()}</div>}
            title={<span>{item.manifest.name} <Tag bordered={false}>{item.source === 'builtin' ? '内置' : '外部'}</Tag></span>}
            description={<Typography.Text type="secondary">{item.manifest.description ?? `v${item.manifest.version}`}</Typography.Text>}
          />
        </List.Item>} />}
    <div className="game-center-footer"><Button type="text" icon={<SettingOutlined />} onClick={() => { onClose(); onOpenSettings() }}>管理小游戏</Button></div>
  </Modal>
}

import { useEffect, useMemo, useState } from 'react'
import { Empty, Input, List, Modal, Tag } from 'antd'
import type { ActionFamily, ActionInfo } from '../../../shared/contracts/appServer'

export function CommandPalette({ open, actions, onClose, onExecute }: {
  open: boolean
  actions: ActionInfo[]
  onClose: () => void
  onExecute: (action: ActionInfo) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  useEffect(() => { if (open) setQuery('') }, [open])
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return actions
      .filter((action) => !normalized || `${action.label} ${action.description} ${action.id}`.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => left.family.localeCompare(right.family) || left.label.localeCompare(right.label))
  }, [actions, query])
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={640} title="命令面板" destroyOnHidden>
      <Input autoFocus size="large" allowClear placeholder="搜索命令…" value={query} onChange={(event) => setQuery(event.target.value)} />
      {visible.length === 0 ? <Empty description="没有匹配的命令" /> : (
        <List
          dataSource={visible}
          renderItem={(action) => (
            <List.Item className="command-palette-row" onClick={() => { if (action.available) { onExecute(action); onClose() } }}>
              <List.Item.Meta
                title={<span>{action.label} <Tag>{familyLabel(action.family)}</Tag>{!action.available && <Tag color="red">不可用</Tag>}</span>}
                description={action.description || action.unavailableReason}
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  )
}

function familyLabel(family: ActionFamily): string {
  return family
}

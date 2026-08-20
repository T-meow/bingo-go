import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Empty, Input, InputNumber, Modal, Select, Space, Switch, Tag } from 'antd'
import { ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons'
import type { ActionFamily, ActionInfo } from '../../../shared/contracts/appServer'
import type { ActionArgumentValues, ActionArgumentValue } from '../features/actions/materializeAction'

export function CommandPalette({ open, actions, onClose, onExecute }: {
  open: boolean
  actions: ActionInfo[]
  onClose: () => void
  onExecute: (action: ActionInfo, values: ActionArgumentValues) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ActionInfo | null>(null)
  const [values, setValues] = useState<ActionArgumentValues>({})
  const [activeIndex, setActiveIndex] = useState(0)
  const activeRow = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(null)
    setValues({})
    setActiveIndex(0)
  }, [open])
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return actions
      .filter((action) => !normalized || `${action.label} ${action.description} ${action.id}`.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => left.family.localeCompare(right.family) || left.label.localeCompare(right.label))
  }, [actions, query])
  useEffect(() => {
    const first = visible.findIndex((action) => action.available)
    setActiveIndex(first < 0 ? 0 : first)
  }, [query, visible.length])
  useEffect(() => activeRow.current?.scrollIntoView({ block: 'nearest' }), [activeIndex])
  const choose = (action: ActionInfo): void => {
    if (!action.available) return
    if (action.arguments.length === 0) {
      onExecute(action, {})
      onClose()
      return
    }
    setSelected(action)
    const initial: ActionArgumentValues = {}
    for (const argument of action.arguments) {
      if (argument.kind === 'boolean') initial[argument.name] = false
      else if (argument.required && argument.choices.length === 1) initial[argument.name] = argument.choices[0]
    }
    setValues(initial)
  }
  const valid = selected?.arguments.every((argument) => !argument.required || present(values[argument.name])) ?? false
  const move = (direction: 1 | -1): void => {
    if (visible.length === 0) return
    let index = activeIndex
    for (let attempts = 0; attempts < visible.length; attempts += 1) {
      index = (index + direction + visible.length) % visible.length
      if (visible[index]?.available) {
        setActiveIndex(index)
        return
      }
    }
  }
  const keyDown = (event: React.KeyboardEvent): void => {
    if (selected) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      const action = visible[activeIndex]
      if (!action?.available) return
      event.preventDefault()
      choose(action)
    }
  }
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={selected ? <Space><Button icon={<ArrowLeftOutlined />} onClick={() => setSelected(null)}>返回</Button><Button type="primary" disabled={!valid} onClick={() => { onExecute(selected, values); onClose() }}>执行命令</Button></Space> : null}
      width={680}
      title={selected?.label ?? '命令面板'}
      destroyOnHidden
    >
      {!selected && <div className="command-palette-v2" onKeyDown={keyDown}>
        <Input autoFocus size="large" allowClear prefix={<SearchOutlined />} placeholder="搜索命令" value={query} onChange={(event) => setQuery(event.target.value)} aria-controls="command-palette-results" aria-activedescendant={visible[activeIndex] ? `command-${visible[activeIndex].id}` : undefined} />
        {visible.length === 0 ? <Empty description="没有匹配的命令" /> : <div id="command-palette-results" className="command-palette-results-v2" role="listbox">
          {visible.map((action, index) => <Fragment key={action.id}>
            {(index === 0 || visible[index - 1]?.family !== action.family) && <div className="command-family-v2">{familyLabel(action.family)}</div>}
            <button
              ref={index === activeIndex ? activeRow : undefined}
              id={`command-${action.id}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`command-palette-row-v2${index === activeIndex ? ' is-active' : ''}`}
              disabled={!action.available}
              onMouseEnter={() => { if (action.available) setActiveIndex(index) }}
              onClick={() => choose(action)}
            >
              <span><strong>{action.label}</strong>{!action.available && <Tag color="error">不可用</Tag>}</span>
              <small>{action.available ? action.description : action.unavailableReason || action.description}</small>
            </button>
          </Fragment>)}
        </div>}
      </div>}
      {selected && <Space orientation="vertical" size={16} className="command-arguments-v2">
        <span>{selected.description}</span>
        {selected.arguments.map((argument) => <label key={argument.name} className="command-argument-v2">
          <span><strong>{argument.name}{argument.required ? ' *' : ''}</strong><small>{argument.description}</small></span>
          <ArgumentControl argument={argument} value={values[argument.name]} onChange={(value) => setValues((current) => ({ ...current, [argument.name]: value }))} />
        </label>)}
      </Space>}
    </Modal>
  )
}

function ArgumentControl({ argument, value, onChange }: {
  argument: ActionInfo['arguments'][number]
  value: ActionArgumentValue
  onChange: (value: ActionArgumentValue) => void
}): React.JSX.Element {
  if (argument.kind === 'boolean') return <Switch checked={value === true} onChange={onChange} />
  if (argument.kind === 'integer') return <InputNumber value={typeof value === 'number' ? value : undefined} onChange={(next) => onChange(next ?? undefined)} />
  if (argument.choices.length > 0) {
    return <Select
      mode={argument.name === 'members' ? 'multiple' : undefined}
      allowClear={!argument.required}
      value={value as string | string[] | undefined}
      options={argument.choices.map((choice) => ({ value: choice, label: choice }))}
      onChange={onChange}
    />
  }
  return <Input value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
}

function present(value: ActionArgumentValue): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean' || typeof value === 'number') return true
  return typeof value === 'string' && value.trim().length > 0
}

function familyLabel(family: ActionFamily): string {
  const labels: Record<ActionFamily, string> = {
    session: '会话', conversation: '对话', model: '模型', provider: '供应商', permission: '权限',
    mcp: 'MCP', skill: '技能', team: '团队', room: '房间', command: '命令', settings: '设置'
  }
  return labels[family]
}

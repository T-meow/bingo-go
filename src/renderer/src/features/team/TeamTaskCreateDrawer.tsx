import { useEffect, useMemo, useState } from 'react'
import { LockOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Alert, Button, Checkbox, Drawer, Empty, Form, Input, Select, Tag } from 'antd'
import type { BehaviorConstraint, TeamDefinition, TeamSnapshot } from '../../../../shared/contracts/cli'
import type { TeamState } from '../../state/teamReducer'
import { IdentityAvatar } from '../../components/IdentityAvatar'

export type TeamTaskCreateInput = { title: string; description: string; participants: string[]; leader: string; contextMessageSeqs: number[]; additionalConstraints: BehaviorConstraint[] }

export function TeamTaskCreateDrawer({ open, state, busy, contextMessageSeqs = [], onClose, onCreate }: {
  open: boolean
  state: TeamState
  busy: boolean
  contextMessageSeqs?: number[]
  onClose: () => void
  onCreate: (input: TeamTaskCreateInput) => Promise<boolean>
}): React.JSX.Element {
  const members = (state.snapshot?.members ?? []).filter((member) => member.kind !== 'hire')
  const occupied = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>()
    state.tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled').forEach((task) => {
      task.participants.forEach((member) => map.set(member.name, { id: task.id, title: task.title }))
    })
    return map
  }, [state.tasks])
  const available = useMemo(
    () => members.filter((member) => !occupied.has(member.name) && member.status !== 'busy' && state.memberRuntime[member.name]?.status !== 'running'),
    [members, occupied, state.memberRuntime]
  )
  const availableNames = useMemo(() => available.map((member) => member.name), [available])
  const definition = isTeamDefinition(state.snapshot?.definition) ? state.snapshot.definition : null
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [leader, setLeader] = useState('')
  const [constraintKinds, setConstraintKinds] = useState<BehaviorConstraint['kind'][]>([])
  const [customConstraint, setCustomConstraint] = useState('')

  useEffect(() => {
    if (!open) return
    const selected = availableNames
    const preferred = definition?.leader && selected.includes(definition.leader) ? definition.leader : selected[0] ?? ''
    setTitle('')
    setDescription('')
    setParticipants(selected)
    setLeader(preferred)
    setConstraintKinds([])
    setCustomConstraint('')
  }, [open, state.snapshot?.revision])

  useEffect(() => {
    if (!open) return
    const allowed = new Set(availableNames)
    const next = participants.filter((name) => allowed.has(name))
    if (next.length !== participants.length) setParticipants(next)
    if (!next.includes(leader)) {
      const preferred = definition?.leader && next.includes(definition.leader) ? definition.leader : next[0] ?? ''
      if (preferred !== leader) setLeader(preferred)
    }
  }, [open, availableNames, participants, leader, definition?.leader])

  const toggle = (name: string, checked: boolean): void => {
    const next = checked ? [...participants, name] : participants.filter((participant) => participant !== name)
    setParticipants(next)
    if (!next.includes(leader)) setLeader(next[0] ?? '')
  }
  const hasUnavailableParticipant = participants.some((name) => !availableNames.includes(name))
  const invalid = !title.trim() || !description.trim() || participants.length === 0 || hasUnavailableParticipant || !participants.includes(leader) || Boolean(state.snapshot?.validation)
  const submit = async (): Promise<void> => {
    if (invalid) return
    const additionalConstraints: BehaviorConstraint[] = constraintKinds.map((kind) => ({ kind, enforcement: 'prompt', instruction: constraintInstruction(kind) }))
    if (customConstraint.trim()) additionalConstraints.push({ kind: 'custom', enforcement: 'prompt', instruction: customConstraint.trim() })
    if (await onCreate({ title: title.trim(), description: description.trim(), participants, leader, contextMessageSeqs, additionalConstraints })) onClose()
  }

  return <Drawer title="发起团队任务" size={560} open={open} onClose={onClose} extra={<Button type="primary" icon={<PlayCircleOutlined />} loading={busy} disabled={invalid} onClick={() => void submit()}>创建并开始</Button>}>
    {state.snapshot?.validation && <Alert className="dialog-alert" type="error" showIcon message="Team 蓝图校验未通过" description={state.snapshot.validation} />}
    {members.length === 0 ? <Empty description="Team 蓝图中没有可用成员" /> : <Form layout="vertical" requiredMark={false}>
      <Form.Item label="任务标题" required><Input value={title} maxLength={200} showCount placeholder="例如：检查发布阻塞问题" onChange={(event) => setTitle(event.target.value)} /></Form.Item>
      <Form.Item label="任务说明" required><Input.TextArea value={description} autoSize={{ minRows: 5, maxRows: 12 }} placeholder="描述目标、边界和交付标准" onChange={(event) => setDescription(event.target.value)} /></Form.Item>
      <Form.Item label="参与成员" required>
        <div className="team-participant-picker">
          {members.map((member) => {
            const task = occupied.get(member.name)
            const externallyBusy = !task && (member.status === 'busy' || state.memberRuntime[member.name]?.status === 'running')
            const disabled = Boolean(task || externallyBusy)
            return <label key={member.name} className={`team-participant-option${disabled ? ' disabled' : ''}`}>
              <Checkbox checked={participants.includes(member.name)} disabled={disabled} onChange={(event) => toggle(member.name, event.target.checked)} />
              <MemberAvatar name={member.name} avatar={member.avatar} avatarDataUrl={member.avatarDataUrl} />
              <span><strong>{member.name}</strong><small>{member.agent} · {member.provider || '继承 Provider'} / {member.model || '继承模型'}</small></span>
              {task ? <Tag icon={<LockOutlined />} color="warning" title={task.id}>{task.title}</Tag> : externallyBusy ? <Tag color="processing">正在运行</Tag> : <Tag>空闲</Tag>}
            </label>
          })}
        </div>
      </Form.Item>
      <Form.Item label="任务领导人" required validateStatus={leader && !participants.includes(leader) ? 'error' : undefined} help={leader && !participants.includes(leader) ? '领导人必须包含在参与成员中' : undefined}>
        <Select value={leader || undefined} placeholder="选择领导人" options={participants.map((name) => ({ value: name, label: name }))} onChange={setLeader} />
      </Form.Item>
      <Form.Item label="附加行为约束"><Select mode="multiple" allowClear value={constraintKinds} options={[
        { value: 'noNetwork', label: '不要联网' }, { value: 'noShell', label: '不要调用 Shell' },
        { value: 'readOnly', label: '只读操作' }, { value: 'reviewOnly', label: '仅审查' }
      ]} onChange={setConstraintKinds} /></Form.Item>
      <Form.Item label="自定义约束"><Input.TextArea value={customConstraint} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => setCustomConstraint(event.target.value)} /></Form.Item>
      {contextMessageSeqs.length > 0 && <Tag>{contextMessageSeqs.length} 条大厅消息作为上下文</Tag>}
      {available.length === 0 && <Alert type="warning" showIcon message="没有空闲成员" description="完成或取消占用这些成员的任务后才能创建新任务。" />}
    </Form>}
  </Drawer>
}

export function MemberAvatar({ name, avatar, avatarDataUrl, size = 32 }: { name: string; avatar?: string; avatarDataUrl?: string; size?: number }): React.JSX.Element {
  return <IdentityAvatar identity={name} avatar={avatar} avatarDataUrl={avatarDataUrl} size={size} />
}

function isTeamDefinition(value: TeamSnapshot['definition'] | undefined): value is TeamDefinition {
  return Boolean(value && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion === 2 && 'members' in value && Array.isArray(value.members))
}

function constraintInstruction(kind: BehaviorConstraint['kind']): string {
  return {
    noNetwork: 'Do not use WebFetch, WebSearch, remote MCP tools, or Shell commands that access the network. Stop and explain if the task requires network access.',
    noShell: 'Do not invoke Shell commands. Stop and explain if the task requires Shell access.',
    readOnly: 'Only inspect data and files. Do not make changes.',
    reviewOnly: 'Review the work and report findings. Do not implement changes.',
    custom: ''
  }[kind]
}

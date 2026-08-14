import { useEffect, useState } from 'react'
import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Alert, App, Button, Descriptions, Drawer, Empty, Form, Input, Select, Space, Switch, Tag, Typography } from 'antd'
import type { AgentDefinitionDocument, AgentDefinitionInput, BehaviorConstraint } from '../../../../shared/contracts/cli'
import type { GuiError, ModelListOutput, RuntimeSettings } from '../../../../shared/contracts/ipc'
import type { TeamState } from '../../state/teamReducer'
import { ModelPicker } from '../../components/ModelPicker'

type Draft = AgentDefinitionInput & { id: string; scope: 'user' | 'project'; baseRevision?: string }

export function AgentDefinitionPanel({ state, openRequest, busy, error, providers, onRequestHandled, onReload, onListModels, onSave, onArchive }: {
  state: TeamState
  openRequest: boolean
  busy: boolean
  error: GuiError | null
  providers: RuntimeSettings['providers']
  onRequestHandled: () => void
  onReload: () => void
  onListModels: (provider: string) => Promise<ModelListOutput | null>
  onSave: (draft: Draft) => Promise<boolean>
  onArchive: (definition: AgentDefinitionDocument) => Promise<boolean>
}): React.JSX.Element {
  const { modal } = App.useApp()
  const selection = state.selection
  const selected = selection?.kind === 'role'
    ? state.definitions.find((definition) => definition.id === selection.id && definition.source === selection.scope)
    : undefined
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  useEffect(() => {
    if (!openRequest) return
    setDraft(emptyDraft())
    setModels([])
    setDrawerOpen(true)
    onRequestHandled()
  }, [openRequest])

  const loadModels = async (provider: string): Promise<void> => {
    if (!provider) { setModels([]); return }
    setModelsLoading(true)
    const listed = await onListModels(provider)
    setModelsLoading(false)
    if (listed) setModels(listed.models)
  }
  const edit = (definition: AgentDefinitionDocument, copy = false): void => {
    setDraft({
      id: copy ? `${definition.id}-copy` : definition.id,
      scope: definition.source,
      baseRevision: copy ? undefined : definition.revision,
      name: copy ? `${definition.name} Copy` : definition.name,
      description: definition.description,
      model: definition.model,
      provider: definition.provider,
      thinking: definition.thinking,
      inheritSystem: definition.inheritSystem,
      system: definition.system,
      profile: definition.profile
    })
    setModels(definition.model ? [definition.model] : [])
    setDrawerOpen(true)
    if (definition.provider) void loadModels(definition.provider)
  }
  const save = async (): Promise<void> => {
    if (draft && await onSave(draft)) setDrawerOpen(false)
  }

  if (!selected) return <div className="team-role-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧选择角色，或创建一个新角色" /><Button type="primary" icon={<PlusOutlined />} onClick={() => { setDraft(emptyDraft()); setDrawerOpen(true) }}>新建角色</Button><RoleDrawer /></div>
  return <div className="team-role-panel">
    <header><div><span>{selected.source === 'project' ? '项目角色' : '用户角色'}</span><h2>{selected.name}</h2><small>{selected.path}</small></div><Space wrap><Button icon={<EditOutlined />} onClick={() => edit(selected)}>编辑</Button><Button icon={<CopyOutlined />} onClick={() => edit(selected, true)}>复制</Button><Button danger type="text" icon={<DeleteOutlined />} onClick={() => modal.confirm({ title: `归档“${selected.name}”？`, content: '定义会移动到可恢复的 .archive 目录；当前 Team 正在引用时会拒绝归档。', okText: '归档', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => onArchive(selected) })}>归档</Button></Space></header>
    {selected.overridden && <Alert type="warning" showIcon message="此用户角色被同名项目角色覆盖" />}
    <Descriptions size="small" column={2} items={[
      { key: 'id', label: '稳定 ID', children: selected.id },
      { key: 'revision', label: 'Revision', children: selected.revision.slice(0, 12) },
      { key: 'provider', label: 'Provider', children: selected.provider || '继承' },
      { key: 'model', label: '模型', children: selected.model || '继承' },
      { key: 'thinking', label: 'Thinking', children: selected.thinking || '继承' },
      { key: 'inherit', label: '继承系统提示词', children: selected.inheritSystem ? '是' : '否' }
    ]} />
    <section><h3>描述</h3><Typography.Paragraph>{selected.description || '未填写描述'}</Typography.Paragraph></section>
    <section><h3>系统提示词</h3><pre className="team-role-system">{selected.system}</pre></section>
    <RoleDrawer />
  </div>

  function RoleDrawer(): React.JSX.Element {
    const presetConstraintKinds = (draft?.profile.constraints ?? [])
      .map((constraint) => constraint.kind)
      .filter((kind): kind is Exclude<BehaviorConstraint['kind'], 'custom'> => kind !== 'custom')
    const customConstraints = (draft?.profile.constraints ?? [])
      .filter((constraint) => constraint.kind === 'custom')
      .map((constraint) => constraint.instruction)
      .join('\n')
    const setConstraintKinds = (kinds: Array<Exclude<BehaviorConstraint['kind'], 'custom'>>): void => {
      if (!draft) return
      const custom = draft.profile.constraints.filter((constraint) => constraint.kind === 'custom')
      setDraft({ ...draft, profile: { ...draft.profile, constraints: [...kinds.map((kind) => ({ kind, enforcement: 'prompt' as const, instruction: constraintInstruction(kind) })), ...custom] } })
    }
    const setCustomConstraints = (value: string): void => {
      if (!draft) return
      const presets = draft.profile.constraints.filter((constraint) => constraint.kind !== 'custom')
      setDraft({ ...draft, profile: { ...draft.profile, constraints: [...presets, ...splitLines(value).map((instruction) => ({ kind: 'custom' as const, enforcement: 'prompt' as const, instruction }))] } })
    }
    return <Drawer title={draft?.baseRevision ? '编辑角色' : '新建角色'} size={600} open={drawerOpen} onClose={() => setDrawerOpen(false)} extra={<Button type="primary" icon={<SaveOutlined />} loading={busy} disabled={!draft?.id.trim() || !draft?.name.trim() || !draft?.system.trim()} onClick={() => void save()}>保存</Button>}>
      {!draft ? <Empty /> : <Form layout="vertical" requiredMark={false}>
        {error?.code === 'CONFIG_CONFLICT' && <Alert className="dialog-alert" type="warning" showIcon message="角色已在磁盘上变更" description="刷新后重新应用本次修改，系统不会覆盖较新的内容。" action={<Button size="small" icon={<ReloadOutlined />} onClick={onReload}>刷新</Button>} />}
        <div className="team-editor-grid"><Form.Item label="来源"><Select value={draft.scope} disabled={Boolean(draft.baseRevision)} options={[{ value: 'project', label: '项目角色' }, { value: 'user', label: '用户角色' }]} onChange={(scope) => setDraft({ ...draft, scope })} /></Form.Item><Form.Item label="稳定 ID" required><Input value={draft.id} disabled={Boolean(draft.baseRevision)} placeholder="reviewer" onChange={(event) => setDraft({ ...draft, id: normalizeId(event.target.value) })} /></Form.Item></div>
        <Form.Item label="名称" required help={draft.baseRevision ? '已有角色不能改名；请使用“复制”创建新角色。' : undefined}><Input value={draft.name} disabled={Boolean(draft.baseRevision)} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Form.Item>
        <Form.Item label="描述"><Input.TextArea value={draft.description} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Form.Item>
        <div className="team-editor-grid"><Form.Item label="Provider"><Select allowClear showSearch value={draft.provider} options={providers.map((provider) => ({ value: provider.name, label: provider.name }))} onChange={(provider) => { setDraft({ ...draft, provider, model: undefined }); void loadModels(provider ?? '') }} /></Form.Item><Form.Item label="模型"><ModelPicker value={draft.model ?? ''} models={models} loading={modelsLoading} disabled={!draft.provider} onChange={(model) => setDraft({ ...draft, model: model || undefined })} /></Form.Item><Form.Item label="Thinking"><Select allowClear value={draft.thinking} options={['off', 'low', 'medium', 'high', 'xhigh', 'max'].map((value) => ({ value, label: value }))} onChange={(thinking) => setDraft({ ...draft, thinking })} /></Form.Item><Form.Item label="继承主会话系统提示词"><Switch checked={draft.inheritSystem} onChange={(inheritSystem) => setDraft({ ...draft, inheritSystem })} /></Form.Item></div>
        <h3>默认身份与性格</h3><div className="team-editor-grid"><Form.Item label="身份头衔"><Input value={draft.profile.identity?.title ?? ''} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, identity: { ...draft.profile.identity, title: event.target.value || undefined } } })} /></Form.Item><Form.Item label="语言"><Input value={draft.profile.communication?.language ?? 'auto'} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, communication: { ...draft.profile.communication, language: event.target.value || undefined } } })} /></Form.Item><Form.Item label="语气"><Input value={draft.profile.communication?.tone ?? ''} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, communication: { ...draft.profile.communication, tone: event.target.value || undefined } } })} /></Form.Item><Form.Item label="详细程度"><Select allowClear value={draft.profile.communication?.verbosity} options={['concise', 'balanced', 'detailed'].map((value) => ({ value, label: value }))} onChange={(verbosity) => setDraft({ ...draft, profile: { ...draft.profile, communication: { ...draft.profile.communication, verbosity } } })} /></Form.Item></div>
        <Form.Item label="身份背景"><Input.TextArea value={draft.profile.identity?.background ?? ''} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, identity: { ...draft.profile.identity, background: event.target.value || undefined } } })} /></Form.Item>
        <Form.Item label="性格"><Input.TextArea value={draft.profile.personality ?? ''} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, personality: event.target.value || undefined } })} /></Form.Item>
        <Form.Item label="表达说明"><Input.TextArea value={draft.profile.communication?.instructions ?? ''} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, communication: { ...draft.profile.communication, instructions: event.target.value || undefined } } })} /></Form.Item>
        <h3>默认限制与偏好</h3>
        <Form.Item label="行为约束" extra="这些约束以 MUST 提示词注入，不代表运行时权限隔离。"><Select mode="multiple" allowClear value={presetConstraintKinds} options={[
          { value: 'noNetwork', label: '不要联网' }, { value: 'noShell', label: '不要调用 Shell' }, { value: 'readOnly', label: '只读操作' }, { value: 'reviewOnly', label: '仅审查' }
        ]} onChange={setConstraintKinds} /></Form.Item>
        <Form.Item label="自定义约束"><Input.TextArea value={customConstraints} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(event) => setCustomConstraints(event.target.value)} /></Form.Item>
        <Form.Item label="默认工作偏好"><Input.TextArea value={draft.profile.preferences.join('\n')} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, preferences: splitLines(event.target.value) } })} /></Form.Item>
        <Form.Item label="系统提示词" required><Input.TextArea value={draft.system} autoSize={{ minRows: 10, maxRows: 22 }} onChange={(event) => setDraft({ ...draft, system: event.target.value })} /></Form.Item>
        <Tag>Markdown frontmatter 中未知字段会由 Bingo 原样保留</Tag>
      </Form>}
    </Drawer>
  }
}

function emptyDraft(): Draft {
  return { id: '', scope: 'project', name: '', description: '', inheritSystem: true, system: '', profile: { constraints: [], preferences: [] } }
}

function splitLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
}

function normalizeId(value: string): string {
  return value.trimStart().replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 80)
}

function constraintInstruction(kind: Exclude<BehaviorConstraint['kind'], 'custom'>): string {
  return {
    noNetwork: 'Do not use WebFetch, WebSearch, remote MCP tools, or Shell commands that access the network. Stop and explain if the task requires network access.',
    noShell: 'Do not invoke Shell commands. Stop and explain if the task requires Shell access.',
    readOnly: 'Only inspect data and files. Do not make changes.',
    reviewOnly: 'Review the work and report findings. Do not implement changes.'
  }[kind]
}

export type AgentDefinitionDraft = Draft

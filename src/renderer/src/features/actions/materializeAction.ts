import type { Action, ActionInfo } from '../../../../shared/contracts/appServer'

export type ActionArgumentValue = string | number | boolean | string[] | undefined
export type ActionArgumentValues = Record<string, ActionArgumentValue>

export function materializeAction(info: ActionInfo, values: ActionArgumentValues = {}): Action {
  const required = (name: string): string => {
    const value = text(values[name])
    if (!value) throw new Error(`命令“${info.label}”缺少参数 ${name}`)
    return value
  }
  const optional = (name: string): string | null => text(values[name]) || null

  switch (info.id) {
    case 'session.reset': return { type: 'sessionReset' }
    case 'session.rename': return { type: 'sessionRename', name: required('name') }
    case 'session.gc': return { type: 'sessionGarbageCollect' }
    case 'session.share': return {
      type: 'sessionShare',
      open: booleanValue(values.open, '--open'),
      public: booleanValue(values.public, '--public'),
      output: optional('output')
    }
    case 'session.cd': return { type: 'sessionChangeDirectory', path: required('path') }
    case 'conversation.compact': return { type: 'conversationCompact', instructions: optional('instructions') }
    case 'conversation.rewind': return {
      type: 'conversationRewind',
      mode: values.mode === 'apply' || values.mode === 'applied' ? 'applied' : 'preview',
      target: { type: 'latest' }
    }
    case 'model.select': return { type: 'modelSelect', model: required('model') }
    case 'provider.select': return { type: 'providerSelect', provider: required('provider') }
    case 'provider.login': return { type: 'providerLogin', provider: required('provider') }
    case 'provider.logout': return { type: 'providerLogout', provider: required('provider') }
    case 'thinking.select': return { type: 'thinkingSelect', level: thinking(required('level')) }
    case 'permission.mode': return { type: 'permissionModeSet', mode: permissionMode(required('mode')) }
    case 'permission.ruleAdd': return { type: 'permissionRuleAdd', decision: permissionDecision(required('decision')), rule: required('rule') }
    case 'permission.ruleRemove': return { type: 'permissionRuleRemove', decision: permissionDecision(required('decision')), rule: required('rule') }
    case 'mcp.enable': return { type: 'mcpEnable', server: required('server') }
    case 'mcp.disable': return { type: 'mcpDisable', server: required('server') }
    case 'mcp.reconnect': return { type: 'mcpReconnect', server: optional('server') }
    case 'skill.invoke': return { type: 'skillInvoke', skill: required('skill'), input: optional('input') }
    case 'team.start': return { type: 'teamStart', members: stringList(values.members) }
    case 'team.assign': return { type: 'teamAssign', member: required('member'), task: required('task') }
    case 'team.stop': return { type: 'teamStop', member: optional('member') }
    case 'team.scaffold': return { type: 'teamScaffold', name: required('name') }
    case 'team.memoryGc': return { type: 'teamMemoryGarbageCollect' }
    case 'room.join': return { type: 'roomJoin', room: required('room') }
    case 'room.leave': return { type: 'roomLeave', room: required('room') }
    case 'command.promote': return { type: 'commandPromote', itemId: required('itemId') }
    case 'theme.set': return { type: 'themeSet', theme: theme(required('theme')) }
    default: throw new Error(`当前 Bingo Go 不认识命令 ${info.id}`)
  }
}

function text(value: ActionArgumentValue): string {
  if (Array.isArray(value)) return value.join(',')
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function booleanValue(value: ActionArgumentValue, flag: string): boolean {
  if (typeof value === 'boolean') return value
  return value === 'true' || value === flag
}

function stringList(value: ActionArgumentValue): string[] | null {
  const items = Array.isArray(value) ? value : text(value).split(',')
  const normalized = items.map((item) => item.trim()).filter(Boolean)
  return normalized.length > 0 ? normalized : null
}

function thinking(value: string): 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  if (['off', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value)) return value as ReturnType<typeof thinking>
  throw new Error(`无效的 thinking level：${value}`)
}

function permissionMode(value: string): 'default' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk' | 'plan' {
  if (['default', 'acceptEdits', 'bypassPermissions', 'dontAsk', 'plan'].includes(value)) return value as ReturnType<typeof permissionMode>
  throw new Error(`无效的权限模式：${value}`)
}

function permissionDecision(value: string): 'allow' | 'deny' | 'ask' {
  if (value === 'allow' || value === 'deny' || value === 'ask') return value
  throw new Error(`无效的权限决策：${value}`)
}

function theme(value: string): 'auto' | 'dark' | 'light' {
  if (value === 'auto' || value === 'dark' || value === 'light') return value
  throw new Error(`无效的主题：${value}`)
}

import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, StopOutlined } from '@ant-design/icons'
import type { Turn } from '../../../../shared/contracts/appServer'

export function TurnGroup({ turn, children }: { turn: Turn | null; children: React.ReactNode }): React.JSX.Element {
  if (!turn) return <div className="turn-group">{children}</div>
  const state = turnState(turn.status)
  return (
    <div className="turn-group">
      <div className={`turn-status-v2 is-${turn.status}`} role="status">
        <span className="turn-status-icon-v2">{state.icon}</span>
        <span>
          <strong>{state.label}</strong>
          <small>{originLabel(turn.origin)} · 第 {turn.round} 轮</small>
        </span>
        {turn.error && <span className="turn-error">{turn.error.code}: {turn.error.message}</span>}
      </div>
      {children}
    </div>
  )
}

function turnState(status: Turn['status']): { label: string; icon: React.ReactNode } {
  if (status === 'running') return { label: 'Agent 正在执行', icon: <LoadingOutlined spin /> }
  if (status === 'completed') return { label: '本轮已完成', icon: <CheckCircleOutlined /> }
  if (status === 'failed') return { label: '本轮执行失败', icon: <CloseCircleOutlined /> }
  return { label: status === 'interrupted' ? '本轮已中断' : '本轮已取消', icon: <StopOutlined /> }
}

function originLabel(origin: Turn['origin']): string {
  const labels: Record<Turn['origin'], string> = {
    user: '用户任务',
    queue: '队列任务',
    peer: 'Agent 消息',
    auto: '自动运行',
    shell: '终端命令'
  }
  return labels[origin]
}

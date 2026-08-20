import { Card, Steps, Tag } from 'antd'
import type { Turn } from '../../../../shared/contracts/appServer'

export function TurnGroup({ turn, children }: { turn: Turn | null; children: React.ReactNode }): React.JSX.Element {
  if (!turn) return <div className="turn-group">{children}</div>
  return (
    <Card size="small" className="turn-group" title={<span>Turn <Tag>{turn.status}</Tag> <small>{turn.origin} · round {turn.round}</small></span>}>
      {turn.error && <p className="turn-error">{turn.error.code}: {turn.error.message}</p>}
      <Steps size="small" current={turn.round} items={[{ title: 'Request' }, { title: 'Tools' }, { title: 'Complete' }]} />
      {children}
    </Card>
  )
}

import { describe, expect, it } from 'vitest'
import type { ActionInfo } from '../../../../shared/contracts/appServer'
import { materializeAction } from './materializeAction'

function info(id: string, arguments_: ActionInfo['arguments'] = []): ActionInfo {
  return { id, family: 'session', label: id, description: '', available: true, arguments: arguments_ }
}

describe('materializeAction', () => {
  it('turns action metadata and entered values into wire actions', () => {
    expect(materializeAction(info('model.select'), { model: 'gpt-5.6' })).toEqual({ type: 'modelSelect', model: 'gpt-5.6' })
    expect(materializeAction(info('room.join'), { room: 'review' })).toEqual({ type: 'roomJoin', room: 'review' })
    expect(materializeAction(info('team.start'), { members: ['reviewer', 'tester'] })).toEqual({ type: 'teamStart', members: ['reviewer', 'tester'] })
  })

  it('uses explicit nulls for optional protocol fields', () => {
    expect(materializeAction(info('conversation.compact'))).toEqual({ type: 'conversationCompact', instructions: null })
    expect(materializeAction(info('team.stop'))).toEqual({ type: 'teamStop', member: null })
  })

  it('maps published command choices to their wire values', () => {
    expect(materializeAction(info('session.share'), { public: '--public', open: '--open' })).toEqual({
      type: 'sessionShare', public: true, open: true, output: null
    })
    expect(materializeAction(info('session.share'))).toEqual({
      type: 'sessionShare', public: false, open: false, output: null
    })
    expect(materializeAction(info('conversation.rewind'), { mode: 'apply' })).toEqual({
      type: 'conversationRewind', mode: 'applied', target: { type: 'latest' }
    })
  })

  it('rejects missing required arguments and unknown action ids', () => {
    expect(() => materializeAction(info('model.select'))).toThrow('model')
    expect(() => materializeAction(info('future.action'))).toThrow('future.action')
  })
})

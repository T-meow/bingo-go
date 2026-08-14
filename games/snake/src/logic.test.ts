import { describe, expect, it } from 'vitest'
import { createSnakeState, queueDirection, speedInterval, stepSnake, validSnakeState } from './logic'

describe('Snake logic', () => {
  it('moves, grows and updates the high score', () => {
    let state = { ...createSnakeState('normal', 0, () => 0), paused: false, food: { x: 11, y: 10 } }
    state = stepSnake(state, () => 0)
    expect(state.snake).toHaveLength(4)
    expect(state.score).toBe(1)
    expect(state.highScore).toBe(1)
    expect(validSnakeState(state)).toBe(true)
  })

  it('rejects a reverse direction and detects a wall collision', () => {
    const initial = createSnakeState()
    expect(queueDirection(initial, 'left')).toBe(initial)
    const nearWall = { ...initial, paused: false, snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }] }
    expect(stepSnake(nearWall)).toMatchObject({ paused: true, gameOver: true })
  })

  it('maps slow, normal and fast to distinct intervals', () => {
    expect(speedInterval('slow')).toBeGreaterThan(speedInterval('normal'))
    expect(speedInterval('normal')).toBeGreaterThan(speedInterval('fast'))
  })

  it('rejects a disconnected persisted snake', () => {
    const state = createSnakeState()
    expect(validSnakeState({ ...state, snake: [{ x: 10, y: 10 }, { x: 1, y: 1 }, { x: 0, y: 1 }] })).toBe(false)
  })
})

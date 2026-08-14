import { describe, expect, it } from 'vitest'
import { createRound, validRound, winningLines } from './logic'

describe('Bingo logic', () => {
  it('creates a complete unique draw pile and a free center', () => {
    const round = createRound(() => 0.25)
    expect(round.board).toHaveLength(25)
    expect(round.board[12]).toBeNull()
    expect(new Set(round.drawPile).size).toBe(75)
    expect(validRound(round)).toBe(true)
  })

  it('detects a completed row including the free center', () => {
    const round = createRound(() => 0.5)
    round.called = round.board.slice(10, 15).filter((value): value is number => value !== null)
    expect(winningLines(round)).toContainEqual([10, 11, 12, 13, 14])
  })
})

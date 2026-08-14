import { describe, expect, it } from 'vitest'
import { conflicts, createSudokuSave, redo, setCell, undo, validSudokuSave } from './logic'

const solution = '123456789456789123789123456214365897365897214897214365531642978642978531978531642'
const puzzle = `-${solution.slice(1)}`

describe('Sudoku logic', () => {
  it('supports notes, values, undo and redo', () => {
    let state = createSudokuSave(puzzle, solution, 'easy')
    state = setCell(state, 0, 4, true)
    expect(state.notes[0]).toEqual([4])
    state = setCell(state, 0, 1, false)
    expect(state.values[0]).toBe('1')
    expect(state.complete).toBe(true)
    state = undo(state)
    expect(state.values[0]).toBe('')
    state = redo(state)
    expect(state.values[0]).toBe('1')
  })

  it('flags wrong entries and rejects corrupt saves', () => {
    const state = setCell(createSudokuSave(puzzle, solution, 'hard'), 0, 2, false)
    expect(conflicts(state).has(0)).toBe(true)
    expect(validSudokuSave(state)).toBe(true)
    expect(validSudokuSave({ ...state, notes: [] })).toBe(false)
    expect(validSudokuSave({ ...state, solution: '1'.repeat(81) })).toBe(false)
  })
})

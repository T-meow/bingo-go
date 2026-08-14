export type SudokuDifficulty = 'easy' | 'medium' | 'hard'
export type SudokuSnapshot = { values: string[]; notes: number[][] }
export type SudokuSave = {
  schemaVersion: 1
  puzzle: string
  solution: string
  difficulty: SudokuDifficulty
  values: string[]
  notes: number[][]
  history: SudokuSnapshot[]
  future: SudokuSnapshot[]
  elapsed: number
  paused: boolean
  complete: boolean
}

export function createSudokuSave(puzzle: string, solution: string, difficulty: SudokuDifficulty): SudokuSave {
  if (!validSequence(puzzle, true) || !validSolution(solution) || [...puzzle].some((given, index) => given !== '-' && given !== solution[index])) throw new Error('Invalid sudoku puzzle')
  return { schemaVersion: 1, puzzle, solution, difficulty, values: [...puzzle].map((value) => value === '-' ? '' : value), notes: emptyNotes(), history: [], future: [], elapsed: 0, paused: false, complete: false }
}

export function setCell(state: SudokuSave, index: number, digit: number | null, noteMode: boolean): SudokuSave {
  if (state.paused || state.complete || index < 0 || index > 80 || state.puzzle[index] !== '-') return state
  const snapshot = takeSnapshot(state)
  const values = [...state.values]
  const notes = state.notes.map((values) => [...values])
  if (digit === null) {
    values[index] = ''
    notes[index] = []
  } else if (noteMode && !values[index]) {
    notes[index] = notes[index].includes(digit) ? notes[index].filter((value) => value !== digit) : [...notes[index], digit].sort()
  } else {
    values[index] = String(digit)
    notes[index] = []
  }
  const complete = values.join('') === state.solution
  return { ...state, values, notes, history: [...state.history, snapshot].slice(-100), future: [], complete, paused: complete }
}

export function undo(state: SudokuSave): SudokuSave {
  const previous = state.history.at(-1)
  if (!previous) return state
  return { ...state, ...cloneSnapshot(previous), history: state.history.slice(0, -1), future: [takeSnapshot(state), ...state.future].slice(0, 100), complete: false, paused: false }
}

export function redo(state: SudokuSave): SudokuSave {
  const next = state.future[0]
  if (!next) return state
  const values = [...next.values]
  const complete = values.join('') === state.solution
  return { ...state, ...cloneSnapshot(next), history: [...state.history, takeSnapshot(state)].slice(-100), future: state.future.slice(1), complete, paused: complete }
}

export function resetSudoku(state: SudokuSave): SudokuSave {
  return { ...state, values: [...state.puzzle].map((value) => value === '-' ? '' : value), notes: emptyNotes(), history: [], future: [], elapsed: 0, paused: false, complete: false }
}

export function conflicts(state: SudokuSave): Set<number> {
  const result = new Set<number>()
  for (let index = 0; index < 81; index += 1) {
    const value = state.values[index]
    if (!value) continue
    if (state.puzzle[index] === '-' && value !== state.solution[index]) result.add(index)
    const row = Math.floor(index / 9), column = index % 9
    for (let other = 0; other < 81; other += 1) {
      if (other === index || state.values[other] !== value) continue
      const otherRow = Math.floor(other / 9), otherColumn = other % 9
      if (otherRow === row || otherColumn === column || Math.floor(otherRow / 3) === Math.floor(row / 3) && Math.floor(otherColumn / 3) === Math.floor(column / 3)) {
        result.add(index); result.add(other)
      }
    }
  }
  return result
}

export function validSudokuSave(value: unknown): value is SudokuSave {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<SudokuSave>
  if (state.schemaVersion !== 1 || !validSequence(state.puzzle, true) || !validSolution(state.solution) || !isDifficulty(state.difficulty) || !validValues(state.values) || !validNotes(state.notes)) return false
  const cellsValid = [...state.puzzle].every((given, index) => (given === '-' || given === state.solution![index] && state.values![index] === given) && (!state.values![index] || state.notes![index].length === 0))
  return cellsValid && Array.isArray(state.history) && state.history.length <= 100 && state.history.every((snapshot) => validSnapshotFor(snapshot, state.puzzle!)) && Array.isArray(state.future) && state.future.length <= 100 && state.future.every((snapshot) => validSnapshotFor(snapshot, state.puzzle!)) && Number.isInteger(state.elapsed) && Number(state.elapsed) >= 0 && typeof state.paused === 'boolean' && typeof state.complete === 'boolean' && state.complete === (state.values.join('') === state.solution)
}

function validSnapshot(value: unknown): value is SudokuSnapshot { return Boolean(value && typeof value === 'object' && validValues((value as SudokuSnapshot).values) && validNotes((value as SudokuSnapshot).notes)) }
function validSnapshotFor(value: unknown, puzzle: string): value is SudokuSnapshot {
  return validSnapshot(value) && [...puzzle].every((given, index) => (given === '-' || value.values[index] === given) && (!value.values[index] || value.notes[index].length === 0))
}
function validValues(value: unknown): value is string[] { return Array.isArray(value) && value.length === 81 && value.every((item) => item === '' || /^[1-9]$/.test(item)) }
function validNotes(value: unknown): value is number[][] { return Array.isArray(value) && value.length === 81 && value.every((items) => Array.isArray(items) && items.length <= 9 && items.every((item) => Number.isInteger(item) && item >= 1 && item <= 9) && new Set(items).size === items.length) }
function validSequence(value: unknown, allowBlank: boolean): value is string { return typeof value === 'string' && value.length === 81 && (allowBlank ? /^[1-9-]{81}$/ : /^[1-9]{81}$/).test(value) }
function validSolution(value: unknown): value is string {
  if (!validSequence(value, false)) return false
  const groups: string[][] = []
  for (let index = 0; index < 9; index += 1) {
    groups.push([...value.slice(index * 9, index * 9 + 9)])
    groups.push(Array.from({ length: 9 }, (_, row) => value[row * 9 + index]))
    const boxRow = Math.floor(index / 3) * 3, boxColumn = index % 3 * 3
    groups.push(Array.from({ length: 9 }, (_, offset) => value[(boxRow + Math.floor(offset / 3)) * 9 + boxColumn + offset % 3]))
  }
  return groups.every((group) => new Set(group).size === 9)
}
function isDifficulty(value: unknown): value is SudokuDifficulty { return value === 'easy' || value === 'medium' || value === 'hard' }
function takeSnapshot(state: SudokuSave): SudokuSnapshot { return { values: [...state.values], notes: state.notes.map((values) => [...values]) } }
function cloneSnapshot(snapshot: SudokuSnapshot): SudokuSnapshot { return { values: [...snapshot.values], notes: snapshot.notes.map((values) => [...values]) } }
function emptyNotes(): number[][] { return Array.from({ length: 81 }, () => []) }

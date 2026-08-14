import { getSudoku } from 'sudoku-gen'
import '../../shared/base.css'
import './style.css'
import { conflicts, createSudokuSave, redo, resetSudoku, setCell, undo, validSudokuSave, type SudokuDifficulty, type SudokuSave } from './logic'

const STORAGE_KEY = 'bingo-go:sudoku:save'
let state = load()
let selected = firstEditable(state)
let noteMode = false
const board = element('board')
const difficulty = element('difficulty') as HTMLSelectElement
difficulty.value = state.difficulty

element('new-game').addEventListener('click', newGame)
element('pause').addEventListener('click', togglePause)
element('pause-cover').addEventListener('click', togglePause)
element('notes').addEventListener('click', () => { noteMode = !noteMode; render() })
element('erase').addEventListener('click', () => update(setCell(state, selected, null, false)))
element('undo').addEventListener('click', () => update(undo(state)))
element('redo').addEventListener('click', () => update(redo(state)))
element('reset').addEventListener('click', () => update(resetSudoku(state)))
difficulty.addEventListener('change', newGame)

const pad = element('number-pad')
for (let digit = 1; digit <= 9; digit += 1) {
  const button = node('button', '', String(digit)) as HTMLButtonElement
  button.type = 'button'; button.addEventListener('click', () => update(setCell(state, selected, digit, noteMode))); pad.append(button)
}

document.addEventListener('keydown', (event) => {
  if (/^[1-9]$/.test(event.key)) update(setCell(state, selected, Number(event.key), noteMode))
  else if (event.key === 'Backspace' || event.key === 'Delete') update(setCell(state, selected, null, false))
  else if (event.key.toLowerCase() === 'n') { noteMode = !noteMode; render() }
  else if (event.key === ' ') { event.preventDefault(); togglePause() }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') update(event.shiftKey ? redo(state) : undo(state))
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') update(redo(state))
  else if (event.key.startsWith('Arrow')) moveSelection(event.key)
})

setInterval(() => {
  if (!state.paused && !state.complete) { state = { ...state, elapsed: state.elapsed + 1 }; element('timer').textContent = formatTime(state.elapsed); if (state.elapsed % 5 === 0) save() }
}, 1_000)
window.addEventListener('beforeunload', save)

function newGame(): void {
  const level = difficulty.value as SudokuDifficulty
  const generated = getSudoku(level)
  state = createSudokuSave(generated.puzzle, generated.solution, level)
  selected = firstEditable(state); noteMode = false; save(); render()
}
function togglePause(): void { if (!state.complete) { state = { ...state, paused: !state.paused }; save(); render() } }
function update(next: SudokuSave): void { state = next; save(); render() }
function render(): void {
  const invalid = conflicts(state)
  const selectedValue = state.values[selected]
  board.replaceChildren(...state.values.map((value, index) => {
    const given = state.puzzle[index] !== '-'
    const related = sameGroup(index, selected)
    const cell = node('button', `cell${given ? ' given' : ''}${index === selected ? ' selected' : ''}${related ? ' related' : ''}${selectedValue && value === selectedValue ? ' matching' : ''}${invalid.has(index) ? ' conflict' : ''}`, '') as HTMLButtonElement
    cell.type = 'button'; cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-label', `第 ${Math.floor(index / 9) + 1} 行第 ${index % 9 + 1} 列${value ? `，${value}` : '，空'}`); cell.addEventListener('click', () => { selected = index; render() })
    if (value) cell.textContent = value
    else if (state.notes[index].length) {
      const notes = node('span', 'notes', '')
      for (let digit = 1; digit <= 9; digit += 1) notes.append(node('i', '', state.notes[index].includes(digit) ? String(digit) : ''))
      cell.append(notes)
    }
    return cell
  }))
  const paused = state.paused && !state.complete
  element('pause-cover').classList.toggle('visible', paused)
  element('pause').textContent = state.complete ? '完成' : paused ? '继续' : '暂停'
  element('pause').toggleAttribute('disabled', state.complete)
  const notes = element('notes'); notes.classList.toggle('active', noteMode); notes.setAttribute('aria-pressed', String(noteMode))
  element('undo').toggleAttribute('disabled', state.history.length === 0)
  element('redo').toggleAttribute('disabled', state.future.length === 0)
  element('status').textContent = state.complete ? '完成' : invalid.size ? `${invalid.size} 个冲突` : noteMode ? '笔记模式' : '进行中'
  element('timer').textContent = formatTime(state.elapsed)
}
function moveSelection(key: string): void {
  const delta = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -9 : 9
  selected = Math.max(0, Math.min(80, selected + delta)); render()
}
function load(): SudokuSave {
  try { const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); if (validSudokuSave(parsed)) return parsed } catch { /* reset only this game */ }
  localStorage.removeItem(STORAGE_KEY)
  const generated = getSudoku('easy'); return createSudokuSave(generated.puzzle, generated.solution, 'easy')
}
function save(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
function sameGroup(left: number, right: number): boolean { const lr = Math.floor(left / 9), lc = left % 9, rr = Math.floor(right / 9), rc = right % 9; return lr === rr || lc === rc || Math.floor(lr / 3) === Math.floor(rr / 3) && Math.floor(lc / 3) === Math.floor(rc / 3) }
function firstEditable(value: SudokuSave): number { return Math.max(0, value.puzzle.indexOf('-')) }
function formatTime(seconds: number): string { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function element(id: string): HTMLElement { return document.getElementById(id)! }
function node(tag: string, className: string, text: string): HTMLElement { const value = document.createElement(tag); value.className = className; value.textContent = text; return value }
render()

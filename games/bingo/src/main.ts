import '../../shared/base.css'
import './style.css'
import { COLUMNS, columnFor, createRound, validRound, winningLines, type BingoRound } from './logic'

const STORAGE_KEY = 'bingo-go:bingo:save'
let round = load()
const board = element('board')
const draw = element('draw') as HTMLButtonElement
element('new-game').addEventListener('click', () => { round = createRound(); save(); render() })
draw.addEventListener('click', () => {
  const next = round.drawPile.shift()
  if (next !== undefined) round.called.push(next)
  save(); render()
})

function render(): void {
  const lines = winningLines(round)
  const winners = new Set(lines.flat())
  const called = new Set(round.called)
  const latest = round.called.at(-1)
  board.replaceChildren(...COLUMNS.map((column) => node('div', 'heading', column)), ...round.board.map((number, index) => {
    const marked = number === null || called.has(number)
    const cell = node('div', `cell${marked ? ' marked' : ''}${winners.has(index) ? ' winner' : ''}`, number === null ? 'FREE' : String(number))
    cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-selected', String(marked)); return cell
  }))
  const ball = element('ball')
  ball.replaceChildren(latest === undefined ? node('span', '', 'GO') : node('strong', '', columnFor(latest)), ...(latest === undefined ? [] : [node('span', '', String(latest))]))
  element('status').textContent = lines.length ? 'BINGO!' : round.called.length ? '寻找连线' : '等待抽号'
  element('lines').textContent = `${lines.length} 条连线`
  element('progress').textContent = `${round.called.length} / 75`
  draw.disabled = lines.length > 0 || round.drawPile.length === 0
  draw.textContent = lines.length ? '已连线' : '抽一个'
}

function load(): BingoRound {
  try { const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); if (validRound(parsed)) return parsed } catch { /* reset only this game */ }
  localStorage.removeItem(STORAGE_KEY)
  return createRound()
}
function save(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(round)) }
function element(id: string): HTMLElement { return document.getElementById(id)! }
function node(tag: string, className: string, text: string): HTMLElement { const value = document.createElement(tag); value.className = className; value.textContent = text; return value }
render()

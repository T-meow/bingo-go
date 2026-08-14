import { GameLoop, init } from 'kontra'
import '../../shared/base.css'
import './style.css'
import { createSnakeState, queueDirection, speedInterval, stepSnake, validSnakeState, type Direction, type SnakeSpeed, type SnakeState } from './logic'

const STORAGE_KEY = 'bingo-go:snake:save'
const { canvas, context } = init('game')
let state = load()
let accumulator = 0
const speed = element('speed') as HTMLSelectElement
speed.value = state.speed

const loop = GameLoop({
  update(dt = 0) {
    if (state.paused || state.gameOver) return
    accumulator += dt * 1_000
    const interval = speedInterval(state.speed)
    let advanced = false
    while (accumulator >= interval) { state = stepSnake(state); accumulator -= interval; advanced = true }
    if (advanced) save()
  },
  render() { draw(); renderStatus() }
})
loop.start()

element('pause').addEventListener('click', togglePause)
element('overlay').addEventListener('click', () => state.gameOver ? restart() : togglePause())
element('restart').addEventListener('click', restart)
speed.addEventListener('change', () => { state = { ...state, speed: speed.value as SnakeSpeed }; save(); renderStatus() })
document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach((button) => button.addEventListener('pointerdown', () => setDirection(button.dataset.direction as Direction)))
document.addEventListener('keydown', (event) => {
  const direction = keyDirection(event.key)
  if (direction) { event.preventDefault(); setDirection(direction) }
  else if (event.key === ' ') { event.preventDefault(); togglePause() }
})
window.addEventListener('beforeunload', () => { state = { ...state, paused: true }; save() })

function togglePause(): void { if (!state.gameOver) { state = { ...state, paused: !state.paused }; accumulator = 0; save(); renderStatus() } }
function restart(): void { state = createSnakeState(state.speed, state.highScore); accumulator = 0; save(); renderStatus() }
function setDirection(direction: Direction): void { state = queueDirection(state, direction); if (state.paused && !state.gameOver) state = { ...state, paused: false }; save(); renderStatus() }
function draw(): void {
  const css = getComputedStyle(document.documentElement)
  const cell = canvas.width / state.width
  context.fillStyle = css.getPropertyValue('--surface').trim(); context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = css.getPropertyValue('--line').trim(); context.lineWidth = 1
  for (let index = 1; index < state.width; index += 1) { const p = index * cell; context.beginPath(); context.moveTo(p, 0); context.lineTo(p, canvas.height); context.stroke(); context.beginPath(); context.moveTo(0, p); context.lineTo(canvas.width, p); context.stroke() }
  context.fillStyle = css.getPropertyValue('--danger').trim(); context.fillRect(state.food.x * cell + 3, state.food.y * cell + 3, cell - 6, cell - 6)
  context.fillStyle = css.getPropertyValue('--accent').trim(); state.snake.forEach((point, index) => context.fillRect(point.x * cell + (index ? 2 : 1), point.y * cell + (index ? 2 : 1), cell - (index ? 4 : 2), cell - (index ? 4 : 2)))
}
function renderStatus(): void {
  element('score').textContent = String(state.score); element('high-score').textContent = String(state.highScore)
  element('status').textContent = state.gameOver ? '游戏结束' : state.paused ? state.score ? '已暂停' : '准备' : '进行中'
  element('pause').textContent = state.paused ? '开始' : '暂停'
  const overlay = element('overlay'); overlay.classList.toggle('visible', state.paused); overlay.textContent = state.gameOver ? '重新开始' : state.score ? '继续' : '开始'
}
function load(): SnakeState {
  try { const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); if (validSnakeState(parsed)) return { ...parsed, paused: true } } catch { /* reset only this game */ }
  localStorage.removeItem(STORAGE_KEY); return createSnakeState()
}
function save(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
function keyDirection(key: string): Direction | null { const value = key.toLowerCase(); return value === 'arrowup' || value === 'w' ? 'up' : value === 'arrowdown' || value === 's' ? 'down' : value === 'arrowleft' || value === 'a' ? 'left' : value === 'arrowright' || value === 'd' ? 'right' : null }
function element(id: string): HTMLElement { return document.getElementById(id)! }
renderStatus()

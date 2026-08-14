export type Point = { x: number; y: number }
export type Direction = 'up' | 'down' | 'left' | 'right'
export type SnakeSpeed = 'slow' | 'normal' | 'fast'
export type SnakeState = {
  schemaVersion: 1
  width: number
  height: number
  snake: Point[]
  food: Point
  direction: Direction
  nextDirection: Direction
  score: number
  highScore: number
  speed: SnakeSpeed
  paused: boolean
  gameOver: boolean
}

export function createSnakeState(speed: SnakeSpeed = 'normal', highScore = 0, random: () => number = Math.random): SnakeState {
  const base: SnakeState = { schemaVersion: 1, width: 20, height: 20, snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], food: { x: 0, y: 0 }, direction: 'right', nextDirection: 'right', score: 0, highScore, speed, paused: true, gameOver: false }
  return { ...base, food: placeFood(base, random) }
}

export function queueDirection(state: SnakeState, next: Direction): SnakeState {
  if (opposite(state.direction, next)) return state
  return { ...state, nextDirection: next }
}

export function stepSnake(state: SnakeState, random: () => number = Math.random): SnakeState {
  if (state.paused || state.gameOver) return state
  const direction = opposite(state.direction, state.nextDirection) ? state.direction : state.nextDirection
  const head = move(state.snake[0], direction)
  if (head.x < 0 || head.y < 0 || head.x >= state.width || head.y >= state.height || state.snake.some((point, index) => index < state.snake.length - 1 && point.x === head.x && point.y === head.y)) {
    return { ...state, direction, nextDirection: direction, paused: true, gameOver: true, highScore: Math.max(state.highScore, state.score) }
  }
  const ate = head.x === state.food.x && head.y === state.food.y
  const snake = [head, ...state.snake]
  if (!ate) snake.pop()
  const next = { ...state, snake, direction, nextDirection: direction, score: state.score + (ate ? 1 : 0), highScore: Math.max(state.highScore, state.score + (ate ? 1 : 0)) }
  if (ate && snake.length === state.width * state.height) return { ...next, paused: true, gameOver: true }
  return ate ? { ...next, food: placeFood(next, random) } : next
}

export function placeFood(state: Pick<SnakeState, 'width' | 'height' | 'snake'>, random: () => number = Math.random): Point {
  const free: Point[] = []
  for (let y = 0; y < state.height; y += 1) for (let x = 0; x < state.width; x += 1) if (!state.snake.some((point) => point.x === x && point.y === y)) free.push({ x, y })
  return free[Math.min(free.length - 1, Math.floor(random() * free.length))] ?? { x: -1, y: -1 }
}

export function validSnakeState(value: unknown): value is SnakeState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<SnakeState>
  const validPoint = (point: unknown): point is Point => Boolean(point && typeof point === 'object' && Number.isInteger((point as Point).x) && Number.isInteger((point as Point).y) && (point as Point).x >= 0 && (point as Point).x < 20 && (point as Point).y >= 0 && (point as Point).y < 20)
  const uniqueSnake = Array.isArray(state.snake) && new Set(state.snake.map((point) => `${point.x}:${point.y}`)).size === state.snake.length
  const connectedSnake = Array.isArray(state.snake) && state.snake.every((point, index) => index === 0 || Math.abs(point.x - state.snake![index - 1].x) + Math.abs(point.y - state.snake![index - 1].y) === 1)
  const foodAvailable = validPoint(state.food) && (state.gameOver === true || !state.snake?.some((point) => point.x === state.food!.x && point.y === state.food!.y))
  return state.schemaVersion === 1 && state.width === 20 && state.height === 20 && Array.isArray(state.snake) && state.snake.length >= 3 && state.snake.length <= 400 && state.snake.every(validPoint) && uniqueSnake && connectedSnake && foodAvailable && Number.isInteger(state.score) && state.score === state.snake.length - 3 && Number.isInteger(state.highScore) && Number(state.highScore) >= Number(state.score) && isDirection(state.direction) && isDirection(state.nextDirection) && isSpeed(state.speed) && typeof state.paused === 'boolean' && typeof state.gameOver === 'boolean'
}

export function speedInterval(speed: SnakeSpeed): number { return speed === 'slow' ? 220 : speed === 'fast' ? 90 : 140 }
function isDirection(value: unknown): value is Direction { return value === 'up' || value === 'down' || value === 'left' || value === 'right' }
function isSpeed(value: unknown): value is SnakeSpeed { return value === 'slow' || value === 'normal' || value === 'fast' }
function opposite(left: Direction, right: Direction): boolean { return left === 'up' && right === 'down' || left === 'down' && right === 'up' || left === 'left' && right === 'right' || left === 'right' && right === 'left' }
function move(point: Point, direction: Direction): Point { return direction === 'up' ? { x: point.x, y: point.y - 1 } : direction === 'down' ? { x: point.x, y: point.y + 1 } : direction === 'left' ? { x: point.x - 1, y: point.y } : { x: point.x + 1, y: point.y } }

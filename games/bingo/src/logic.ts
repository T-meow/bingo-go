export const COLUMNS = ['B', 'I', 'N', 'G', 'O'] as const
export const WINNING_LINES = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
] as const

export type BingoRound = { schemaVersion: 1; board: Array<number | null>; called: number[]; drawPile: number[] }

export function createRound(random: () => number = Math.random): BingoRound {
  const columns = COLUMNS.map((_, column) => shuffle(Array.from({ length: 15 }, (__, index) => column * 15 + index + 1), random).slice(0, 5).sort((a, b) => a - b))
  return {
    schemaVersion: 1,
    board: Array.from({ length: 25 }, (_, index) => index === 12 ? null : columns[index % 5][Math.floor(index / 5)]),
    called: [],
    drawPile: shuffle(Array.from({ length: 75 }, (_, index) => index + 1), random)
  }
}

export function winningLines(round: BingoRound): readonly (readonly number[])[] {
  const called = new Set(round.called)
  return WINNING_LINES.filter((line) => line.every((index) => round.board[index] === null || called.has(round.board[index]!)))
}

export function validRound(value: unknown): value is BingoRound {
  if (!value || typeof value !== 'object') return false
  const round = value as Partial<BingoRound>
  if (round.schemaVersion !== 1 || !Array.isArray(round.board) || round.board.length !== 25 || round.board[12] !== null || !Array.isArray(round.called) || !Array.isArray(round.drawPile)) return false
  const boardNumbers = round.board.filter((number): number is number => number !== null)
  const boardValid = boardNumbers.length === 24 && new Set(boardNumbers).size === 24 && boardNumbers.every((number, index) => validNumber(number) && Math.floor((number - 1) / 15) === (index < 12 ? index % 5 : (index + 1) % 5))
  const draws = [...round.called, ...round.drawPile]
  return boardValid && draws.length === 75 && draws.every(validNumber) && new Set(draws).size === 75
}

export function columnFor(number: number): string { return COLUMNS[Math.min(4, Math.floor((number - 1) / 15))] }

function validNumber(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 75 }
function shuffle<T>(input: T[], random: () => number): T[] {
  const result = [...input]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1)); [result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

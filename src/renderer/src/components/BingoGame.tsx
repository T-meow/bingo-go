import { useMemo, useState } from 'react'
import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'

const COLUMNS = ['B', 'I', 'N', 'G', 'O'] as const
const WINNING_LINES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20]
] as const

type BingoCell = {
  column: typeof COLUMNS[number]
  number: number | null
}

type BingoRound = {
  board: BingoCell[]
  called: number[]
  drawPile: number[]
}

export function BingoGame({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const [round, setRound] = useState(createRound)
  const called = useMemo(() => new Set(round.called), [round.called])
  const winningLines = useMemo(() => WINNING_LINES.filter((line) => line.every((index) => {
    const number = round.board[index].number
    return number === null || called.has(number)
  })), [called, round.board])
  const winningCells = useMemo<Set<number>>(() => new Set(winningLines.flat()), [winningLines])
  const hasWon = winningLines.length > 0
  const lastNumber = round.called.at(-1) ?? null

  const drawNumber = (): void => {
    setRound((current) => {
      const next = current.drawPile[0]
      if (next === undefined) return current
      return {
        ...current,
        called: [...current.called, next],
        drawPile: current.drawPile.slice(1)
      }
    })
  }

  return (
    <Modal className="bingo-game-modal" open={open} title="Bingo Go" width={420} footer={null} onCancel={onClose}>
      <div className="bingo-game-summary">
        <div className={`bingo-current-ball${hasWon ? ' won' : ''}`} aria-live="polite" aria-label={lastNumber === null ? '尚未抽号' : `本轮号码 ${columnFor(lastNumber)} ${lastNumber}`}>
          {lastNumber === null
            ? <span className="bingo-ball-placeholder">GO</span>
            : <><strong>{columnFor(lastNumber)}</strong><span>{lastNumber}</span></>}
        </div>
        <div className="bingo-game-status" role="status" aria-live="polite">
          <strong>{hasWon ? 'BINGO!' : round.called.length === 0 ? '等待抽号' : '寻找连线'}</strong>
          <span>{hasWon ? `${winningLines.length} 条连线` : `${round.called.length} / 75`}</span>
        </div>
      </div>

      <div className="bingo-board" role="grid" aria-label="Bingo 卡片">
        {COLUMNS.map((column) => <div className="bingo-board-heading" role="columnheader" key={column}>{column}</div>)}
        {round.board.map((cell, index) => {
          const marked = cell.number === null || called.has(cell.number)
          const winning = winningCells.has(index)
          return (
            <div
              className={`bingo-cell${marked ? ' marked' : ''}${winning ? ' winning' : ''}`}
              role="gridcell"
              aria-label={cell.number === null ? 'FREE，已标记' : `${cell.column} ${cell.number}，${marked ? '已标记' : '未标记'}`}
              aria-selected={marked}
              key={`${cell.column}-${cell.number ?? 'free'}`}
            >
              {cell.number ?? <span>FREE</span>}
            </div>
          )
        })}
      </div>

      <div className="bingo-game-actions">
        <Button icon={<ReloadOutlined />} onClick={() => setRound(createRound())}>新一局</Button>
        <Button type="primary" icon={<PlayCircleOutlined />} disabled={hasWon || round.drawPile.length === 0} onClick={drawNumber}>
          {hasWon ? '已连线' : '抽一个'}
        </Button>
      </div>
    </Modal>
  )
}

function createRound(): BingoRound {
  const columns = COLUMNS.map((_, columnIndex) => {
    const start = columnIndex * 15 + 1
    return shuffle(Array.from({ length: 15 }, (__, index) => start + index)).slice(0, 5).sort((a, b) => a - b)
  })
  const board = Array.from({ length: 25 }, (_, index): BingoCell => {
    const row = Math.floor(index / 5)
    const column = index % 5
    return { column: COLUMNS[column], number: index === 12 ? null : columns[column][row] }
  })
  return {
    board,
    called: [],
    drawPile: shuffle(Array.from({ length: 75 }, (_, index) => index + 1))
  }
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function columnFor(number: number): typeof COLUMNS[number] {
  return COLUMNS[Math.min(COLUMNS.length - 1, Math.floor((number - 1) / 15))]
}

/// <reference types="vite/client" />

import type { BingoGuiApi } from '../../shared/contracts/ipc'
import type { BingoAppApi } from '../../shared/contracts/appServerIpc'

declare global {
  interface Window {
    bingoGui: BingoGuiApi
    bingoApp: BingoAppApi
  }
}

export {}

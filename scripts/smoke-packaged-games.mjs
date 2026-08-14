import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const BINGO_ID = 'io.github.tmeow.bingogo.bingo'
const SUDOKU_ID = 'io.github.tmeow.bingogo.sudoku'
const SNAKE_ID = 'io.github.tmeow.bingogo.snake'
const GAME_IDS = [BINGO_ID, SUDOKU_ID, SNAKE_ID]
const root = resolve(import.meta.dirname, '..')
const executable = join(root, 'release', 'win-unpacked', process.platform === 'win32' ? 'bingo-go.exe' : 'bingo-go')
const Cdp = createCdpClass()
const profile = await mkdtemp(join(tmpdir(), 'bingo-go-game-smoke-'))
assertTemporaryProfile(profile)
const port = await freePort()
const output = []
let child
let main

try {
  child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
    cwd: root,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  child.stdout.on('data', (chunk) => rememberOutput(chunk))
  child.stderr.on('data', (chunk) => rememberOutput(chunk))

  const mainTarget = await waitForTarget((target) => target.type === 'page' && target.url.startsWith('file:'))
  main = await Cdp.connect(mainTarget.webSocketDebuggerUrl)
  await main.send('Runtime.enable')
  await waitFor(async () => Boolean(await main.evaluate('typeof window.bingoGui === "object"')), 'preload bridge')

  const initial = unwrap(await main.evaluate('window.bingoGui.listGamePacks()'), 'list game packs')
  assert(initial.items.length === 3, `expected 3 built-in games, found ${initial.items.length}`)
  assert(GAME_IDS.every((id) => initial.items.some((item) => item.manifest.id === id && item.source === 'builtin' && item.enabled && item.status === 'ready')), 'built-in game snapshot is incomplete')

  const bingo = await launch(main, BINGO_ID, '#draw')
  await assertSandbox(bingo.cdp)
  const bingoProgress = await bingo.cdp.evaluate(`(() => {
    localStorage.setItem('smoke-sentinel', 'bingo')
    document.querySelector('#draw').click()
    return {
      title: document.title,
      progress: document.querySelector('#progress').textContent,
      called: JSON.parse(localStorage.getItem('bingo-go:bingo:save')).called.length
    }
  })()`)
  assert(bingoProgress.called === 1, 'Bingo draw was not persisted')
  bingo.cdp.close()

  const sudoku = await launch(main, SUDOKU_ID, '#number-pad button')
  await assertSandbox(sudoku.cdp)
  const sudokuSave = await sudoku.cdp.evaluate(`(() => {
    const isolated = localStorage.getItem('smoke-sentinel') === null
    document.querySelector('#number-pad button').click()
    const save = JSON.parse(localStorage.getItem('bingo-go:sudoku:save'))
    return { title: document.title, isolated, schemaVersion: save.schemaVersion, history: save.history.length }
  })()`)
  assert(sudokuSave.isolated && sudokuSave.schemaVersion === 1 && sudokuSave.history === 1, 'Sudoku save or storage isolation failed')
  sudoku.cdp.close()

  const reopenedBingo = await launch(main, BINGO_ID, '#progress')
  const restoredBingo = await reopenedBingo.cdp.evaluate(`({
    sentinel: localStorage.getItem('smoke-sentinel'),
    called: JSON.parse(localStorage.getItem('bingo-go:bingo:save')).called.length
  })`)
  assert(restoredBingo.sentinel === 'bingo' && restoredBingo.called === 1, 'Bingo continuation did not restore')
  reopenedBingo.cdp.close()

  const snake = await launch(main, SNAKE_ID, '#overlay')
  await assertSandbox(snake.cdp)
  await snake.cdp.evaluate(`(() => { document.querySelector('#overlay').click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })); return true })()`)
  await delay(450)
  const snakeSave = await snake.cdp.evaluate(`(() => {
    const save = JSON.parse(localStorage.getItem('bingo-go:snake:save'))
    return { title: document.title, schemaVersion: save.schemaVersion, snake: save.snake }
  })()`)
  assert(snakeSave.schemaVersion === 1 && snakeSave.snake.length >= 3, 'Snake save was not persisted')
  snake.cdp.close()

  const snapshot = unwrap(await main.evaluate('window.bingoGui.listGamePacks()'), 'refresh game packs')
  const disabled = unwrap(await main.evaluate(`window.bingoGui.setGamePackEnabled(${JSON.stringify({ id: SNAKE_ID, enabled: false, baseRevision: snapshot.revision })})`), 'disable Snake')
  assert(disabled.items.some((item) => item.manifest.id === SNAKE_ID && !item.enabled), 'Snake was not disabled')
  await waitForNoTarget(SNAKE_ID)
  const rejected = await main.evaluate(`window.bingoGui.launchGamePack(${JSON.stringify({ id: SNAKE_ID })})`)
  assert(rejected.ok === false, 'disabled Snake unexpectedly launched')

  const enabled = unwrap(await main.evaluate(`window.bingoGui.setGamePackEnabled(${JSON.stringify({ id: SNAKE_ID, enabled: true, baseRevision: disabled.revision })})`), 'enable Snake')
  assert(enabled.items.some((item) => item.manifest.id === SNAKE_ID && item.enabled), 'Snake was not re-enabled')
  const reopenedSnake = await launch(main, SNAKE_ID, '#status')
  const restoredSnake = await reopenedSnake.cdp.evaluate(`JSON.parse(localStorage.getItem('bingo-go:snake:save')).snake`)
  assert(JSON.stringify(restoredSnake) === JSON.stringify(snakeSave.snake), 'Snake continuation did not restore')
  reopenedSnake.cdp.close()

  unwrap(await main.evaluate(`window.bingoGui.clearGamePackData(${JSON.stringify({ id: SNAKE_ID })})`), 'clear Snake data')
  await waitForNoTarget(SNAKE_ID)
  const clearedSnake = await launch(main, SNAKE_ID, '#status')
  const snakeStorageCleared = await clearedSnake.cdp.evaluate(`localStorage.getItem('bingo-go:snake:save') === null`)
  assert(snakeStorageCleared, 'Snake storage was not cleared')
  clearedSnake.cdp.close()

  const finalBingo = await launch(main, BINGO_ID, '#progress')
  const bingoUnaffected = await finalBingo.cdp.evaluate(`localStorage.getItem('smoke-sentinel') === 'bingo'`)
  assert(bingoUnaffected, 'clearing Snake data affected Bingo storage')
  finalBingo.cdp.close()

  console.log(JSON.stringify({
    executable,
    profile: basename(profile),
    games: GAME_IDS,
    checks: {
      sandbox: true,
      networkDenied: true,
      singleGameWindow: true,
      persistence: true,
      disableClosesWindow: true,
      targetedClear: true,
      storageIsolation: true
    }
  }, null, 2))
} catch (error) {
  if (output.length > 0) console.error(`Packaged app output:\n${output.join('').slice(-8_000)}`)
  throw error
} finally {
  main?.close()
  if (child && child.exitCode === null) {
    child.kill()
    await Promise.race([new Promise((resolveExit) => child.once('exit', resolveExit)), delay(5_000)])
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 3 })
}

async function launch(mainCdp, id, selector) {
  unwrap(await mainCdp.evaluate(`window.bingoGui.launchGamePack(${JSON.stringify({ id })})`), `launch ${id}`)
  const target = await waitForTarget((candidate) => candidate.type === 'page' && gameId(candidate.url) === id)
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await waitFor(async () => Boolean(await cdp.evaluate(`document.readyState === 'complete' && document.querySelector(${JSON.stringify(selector)})`)), `${id} document`)
  const pages = (await targets()).filter((candidate) => candidate.type === 'page' && candidate.url.startsWith('bingo-game://'))
  assert(pages.length === 1 && gameId(pages[0].url) === id, `expected one active game window for ${id}`)
  return { cdp, target }
}

async function assertSandbox(cdp) {
  const globals = await cdp.evaluate(`({
    requireType: typeof globalThis.require,
    bingoGuiType: typeof globalThis.bingoGui,
    ipcType: typeof globalThis.ipcRenderer
  })`)
  assert(globals.requireType === 'undefined' && globals.bingoGuiType === 'undefined' && globals.ipcType === 'undefined', 'game renderer exposes Node or IPC globals')
  const network = await cdp.evaluate(`Promise.race([
    fetch('https://example.invalid/').then(() => 'allowed', () => 'denied'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 3_000))
  ])`)
  assert(network === 'denied', `external network was not denied (${network})`)
  const popup = await cdp.evaluate(`window.open('about:blank') === null`)
  assert(popup, 'popup was not denied')
}

function unwrap(result, operation) {
  if (!result?.ok) throw new Error(`${operation} failed: ${result?.error?.code ?? 'UNKNOWN'} ${result?.error?.msg ?? ''}`.trim())
  return result.value
}

function gameId(url) {
  try { return new URL(url).hostname } catch { return null }
}

async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`DevTools target query failed with ${response.status}`)
  return response.json()
}

async function waitForTarget(predicate, timeout = 20_000) {
  let match
  await waitFor(async () => {
    match = (await targets()).find(predicate)
    return Boolean(match)
  }, 'DevTools target', timeout)
  return match
}

async function waitForNoTarget(id) {
  await waitFor(async () => !(await targets()).some((target) => target.type === 'page' && gameId(target.url) === id), `${id} window close`)
}

async function waitFor(check, label, timeout = 10_000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`packaged app exited early with code ${child.exitCode}`)
    try {
      if (await check()) return
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`)
}

function createCdpClass() {
  return class Cdp {
  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true })
      socket.addEventListener('error', rejectOpen, { once: true })
    })
    return new Cdp(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('DevTools connection closed'))
      this.pending.clear()
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }

  close() {
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close()
  }
  }
}

async function freePort() {
  const server = createServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()))
  if (!address || typeof address === 'string') throw new Error('Unable to allocate a local port')
  return address.port
}

function rememberOutput(chunk) {
  output.push(String(chunk))
  if (output.length > 100) output.shift()
}

function assertTemporaryProfile(path) {
  const temp = resolve(tmpdir())
  const childPath = relative(temp, resolve(path))
  if (!childPath || childPath.startsWith('..') || !basename(path).startsWith('bingo-go-game-smoke-')) {
    throw new Error(`Refusing to use unexpected smoke profile: ${path}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

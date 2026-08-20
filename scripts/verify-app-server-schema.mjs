#!/usr/bin/env node
// Verifies that the committed schema bundle under vendor/bingo/app-server-schema
// exactly matches `bingo app-server generate-schema --out <dir>` for the binary
// under test. Exit 0 only when file sets and parsed JSON are identical.
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const committedRoot = process.env.BINGO_SCHEMA_VENDOR_DIR
  ? resolve(process.env.BINGO_SCHEMA_VENDOR_DIR)
  : resolve(root, 'vendor/bingo/app-server-schema/v1.0')
const binary = process.env.BINGO_GUI_BINARY ?? process.argv[2] ?? 'bingo'
const out = await mkdtemp(join(tmpdir(), 'bingo-app-server-schema-'))

const generated = spawnSync(binary, ['app-server', 'generate-schema', '--out', out], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 30_000
})
if (generated.error) {
  await rm(out, { recursive: true, force: true })
  throw new Error(`could not run ${binary}: ${generated.error.message}`)
}
if (generated.status !== 0) {
  const detail = `${generated.stderr || generated.stdout || ''}`.trim()
  await rm(out, { recursive: true, force: true })
  throw new Error(`${binary} app-server generate-schema exited ${generated.status}${detail ? `: ${detail}` : ''}`)
}

const differences = []
await compareTrees(committedRoot, out, '')
await rm(out, { recursive: true, force: true })
if (differences.length > 0) {
  throw new Error(`schema drift detected:\n${differences.slice(0, 20).join('\n')}`)
}
console.log(`app-server schema matches ${relative(root, committedRoot)} (${binary})`)

async function compareTrees(left, right, prefix) {
  const leftEntries = await listFiles(left)
  const rightEntries = await listFiles(right)
  const leftSet = new Set(leftEntries)
  const rightSet = new Set(rightEntries)
  for (const entry of leftSet) {
    if (!rightSet.has(entry)) differences.push(`missing in generated bundle: ${join(prefix, entry)}`)
  }
  for (const entry of rightSet) {
    if (!leftSet.has(entry)) differences.push(`extra in generated bundle: ${join(prefix, entry)}`)
  }
  for (const entry of leftSet) {
    if (!rightSet.has(entry)) continue
    const leftPath = join(left, entry)
    const rightPath = join(right, entry)
    const leftStat = await stat(leftPath)
    const rightStat = await stat(rightPath)
    if (leftStat.isDirectory() && rightStat.isDirectory()) {
      await compareTrees(leftPath, rightPath, join(prefix, entry))
      continue
    }
    if (leftStat.isDirectory() !== rightStat.isDirectory()) {
      differences.push(`kind mismatch: ${join(prefix, entry)}`)
      continue
    }
    const leftValue = JSON.parse(await readFile(leftPath, 'utf8'))
    const rightValue = JSON.parse(await readFile(rightPath, 'utf8'))
    if (JSON.stringify(leftValue) !== JSON.stringify(rightValue)) {
      differences.push(`content differs: ${join(prefix, entry)}`)
    }
  }
}

async function listFiles(directory) {
  const names = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.endsWith('.json')) continue
    names.push(entry.name)
  }
  return names.sort()
}

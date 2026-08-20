import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const fixtureRoot = resolve('tests/fixtures/app-server')
const schemaRoot = resolve('vendor/bingo/app-server-schema/v1.0')

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

describe('app-server schema fixtures', () => {
  it('covers every request, notification, result, and error declared by the manifest', async () => {
    const [index, manifest] = await Promise.all([
      readJson(join(fixtureRoot, 'index.json')),
      readJson(join(schemaRoot, 'manifest.json'))
    ])
    const fixtures = isRecord(index) && Array.isArray(index.fixtures) ? index.fixtures as string[] : []
    const methods = isRecord(manifest) && Array.isArray(manifest.methods) ? manifest.methods as Array<Record<string, unknown>> : []
    const notifications = isRecord(manifest) && Array.isArray(manifest.notifications) ? manifest.notifications as Array<Record<string, unknown>> : []
    const errors = isRecord(manifest) && Array.isArray(manifest.errors) ? manifest.errors as Array<Record<string, unknown>> : []

    const fixtureSet = new Set(fixtures)
    const missing: string[] = []
    for (const method of methods) {
      const path = `requests/${String(method.method).replaceAll('/', '.')}.json`
      const result = `results/${String(method.method).replaceAll('/', '.')}.json`
      if (!fixtureSet.has(path)) missing.push(path)
      if (!fixtureSet.has(result)) missing.push(result)
    }
    for (const notification of notifications) {
      const path = `notifications/${String(notification.method).replaceAll('/', '.')}.json`
      if (!fixtureSet.has(path)) missing.push(path)
    }
    for (const error of errors) {
      const path = `errors/${String(error.bingoCode)}.json`
      if (!fixtureSet.has(path)) missing.push(path)
    }
    expect(missing).toEqual([])
  })

  it('parses and validates the shape of every generated frame fixture', async () => {
    const index = await readJson(join(fixtureRoot, 'index.json'))
    const fixtures = isRecord(index) && Array.isArray(index.fixtures) ? index.fixtures as string[] : []
    expect(fixtures.length).toBeGreaterThan(0)
    for (const fixture of fixtures) {
      const frame = await readJson(join(fixtureRoot, fixture))
      expect(isRecord(frame), fixture).toBe(true)
      if (!isRecord(frame)) continue
      if (!fixture.startsWith('errors/')) expect(frame?.jsonrpc, fixture).toBe('2.0')
      if (fixture.startsWith('requests/') || fixture.startsWith('results/') || fixture.startsWith('responses/')) {
        expect('id' in (frame as object), fixture).toBe(true)
      }
      if (fixture.startsWith('requests/') || fixture.startsWith('notifications/') || fixture.startsWith('clientNotifications/')) {
        expect(typeof frame?.method, fixture).toBe('string')
        expect('params' in (frame as object), fixture).toBe(true)
      }
      if (fixture.startsWith('results/')) {
        expect(Object.hasOwn(frame as object, 'result'), fixture).toBe(true)
        expect('error' in (frame as object), fixture).toBe(false)
      }
      if (fixture.startsWith('responses/errorResponse')) {
        expect(isRecord(frame?.error), fixture).toBe(true)
      }
      if (fixture.startsWith('errors/')) {
        expect(typeof frame?.code, fixture).toBe('number')
        expect(typeof frame?.message, fixture).toBe('string')
      }
    }
  })
})

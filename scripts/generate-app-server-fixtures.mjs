#!/usr/bin/env node
// Generates one JSON fixture per wire variant from the pinned app-server schema
// bundle: request frames, server notifications, client notifications, method
// results, and manifest errors. Values are deterministic schema samples, not
// behavioural golden files; the fixture suite uses them to keep every variant
// under version control and parse-checked.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const schemaRoot = resolve(root, 'vendor/bingo/app-server-schema/v1.0')
const outRoot = resolve(root, 'tests/fixtures/app-server')
const definitions = JSON.parse(await readFile(resolve(schemaRoot, 'definitions.json'), 'utf8')).definitions
const manifest = JSON.parse(await readFile(resolve(schemaRoot, 'manifest.json'), 'utf8'))
const requestEnvelope = JSON.parse(await readFile(resolve(schemaRoot, 'envelopes/envelope.request.json'), 'utf8'))
const notificationEnvelope = JSON.parse(await readFile(resolve(schemaRoot, 'envelopes/envelope.notification.json'), 'utf8'))
const clientNotificationEnvelope = JSON.parse(await readFile(resolve(schemaRoot, 'envelopes/envelope.clientNotification.json'), 'utf8'))

await rm(outRoot, { recursive: true, force: true })
await mkdir(resolve(outRoot, 'requests'), { recursive: true })
await mkdir(resolve(outRoot, 'notifications'), { recursive: true })
await mkdir(resolve(outRoot, 'clientNotifications'), { recursive: true })
await mkdir(resolve(outRoot, 'results'), { recursive: true })
await mkdir(resolve(outRoot, 'errors'), { recursive: true })
await mkdir(resolve(outRoot, 'responses'), { recursive: true })

const index = []

function deref(ref) {
  const match = /#\/definitions\/(.+)$/.exec(ref ?? '')
  if (!match) throw new Error(`Unsupported ref: ${ref}`)
  return match[1]
}

function sample(schema, seen = new Set()) {
  if (schema === undefined || schema === null || typeof schema === 'boolean') return {}
  if (schema.const !== undefined) return schema.const
  if (Array.isArray(schema.enum)) return schema.enum[0]
  if (schema.$ref) {
    const name = deref(schema.$ref)
    if (seen.has(name)) return {}
    return sample(definitions[name], new Set([...seen, name]))
  }
  if (schema.allOf) return Object.assign({}, ...schema.allOf.map((part) => sample(part, seen)))
  const branches = schema.oneOf ?? schema.anyOf
  if (Array.isArray(branches)) return sample(branches[0], seen)
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'null') return null
  if (type === 'boolean') return false
  if (type === 'integer' || type === 'number') return 0
  if (type === 'string') return 'string'
  if (type === 'array') return schema.items ? [sample(schema.items, seen)] : []
  if (type === 'object' || schema.properties) {
    const result = {}
    for (const key of (schema.required ?? [])) {
      if (Object.prototype.hasOwnProperty.call(schema.properties ?? {}, key)) {
        result[key] = sample(schema.properties[key], seen)
      }
    }
    return result
  }
  return {}
}

function methodNameOf(branch) {
  const methods = branch.properties?.method?.enum
  if (!Array.isArray(methods) || methods.length !== 1) throw new Error('Envelope branch does not name exactly one method')
  return methods[0]
}

async function writeFixture(relativeFile, value) {
  const path = resolve(outRoot, relativeFile)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
  index.push(relativeFile)
}

for (const branch of requestEnvelope.oneOf) {
  const method = methodNameOf(branch)
  await writeFixture(`requests/${method.replaceAll('/', '.')}.json`, {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: sample(branch.properties.params)
  })
}

for (const branch of notificationEnvelope.oneOf) {
  const method = methodNameOf(branch)
  await writeFixture(`notifications/${method.replaceAll('/', '.')}.json`, {
    jsonrpc: '2.0',
    method,
    params: sample(branch.properties.params)
  })
}

for (const branch of clientNotificationEnvelope.oneOf) {
  const method = methodNameOf(branch)
  await writeFixture(`clientNotifications/${method.replaceAll('/', '.')}.json`, {
    jsonrpc: '2.0',
    method,
    params: sample(branch.properties.params)
  })
}

const methodFiles = await readdir(resolve(schemaRoot, 'methods'))
for (const file of methodFiles.filter((name) => name.endsWith('.result.json'))) {
  const schema = JSON.parse(await readFile(resolve(schemaRoot, 'methods', file), 'utf8'))
  await writeFixture(`results/${file.replace('.result.json', '').replaceAll('/', '.')}.json`, {
    jsonrpc: '2.0',
    id: 1,
    result: sample(schema)
  })
}

const rpcErrorSchema = JSON.parse(await readFile(resolve(schemaRoot, 'envelopes/envelope.error.json'), 'utf8'))
await writeFixture('responses/errorResponse.json', {
  jsonrpc: '2.0',
  id: 1,
  error: {
    ...sample(rpcErrorSchema),
    code: -32010,
    message: 'The turn is no longer active.'
  }
})
await writeFixture('responses/successResponse.json', {
  jsonrpc: '2.0',
  id: 1,
  result: sample(definitions.InitializeResult)
})

for (const error of manifest.errors ?? []) {
  const sampleData = sample(definitions.ErrorData)
  await writeFixture(`errors/${error.bingoCode}.json`, {
    code: error.code,
    message: error.message,
    data: { ...sampleData, bingoCode: error.bingoCode, recoverable: error.recoverable ?? true }
  })
}

index.sort()
await writeFile(resolve(outRoot, 'index.json'), JSON.stringify({ schemaSource: 'vendor/bingo/app-server-schema/v1.0', fixtures: index }, null, 2) + '\n')
console.log(`wrote ${index.length} app-server fixtures to ${resolve(root, 'tests/fixtures/app-server')}`)

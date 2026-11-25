import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const exportedTypeRegex = /^export type (\w+)/gm

const typesSource = readFileSync(join(import.meta.dir, 'types.ts'), 'utf8')
const indexSource = readFileSync(join(import.meta.dir, 'index.ts'), 'utf8')
const typeNames = [...typesSource.matchAll(exportedTypeRegex)].map(([, name]) => name)

describe('index', () => {
  it.each(typeNames)('should export the type %s', (name) => {
    const exportedRegex = new RegExp(`\\b${name},`)

    expect(indexSource).toMatch(exportedRegex)
  })
})

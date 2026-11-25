import { describe, expect, it } from 'bun:test'
import extendedTests from 'uritemplate-test/extended-tests.json' with { type: 'json' }
import negativeTests from 'uritemplate-test/negative-tests.json' with { type: 'json' }
import specExamples from 'uritemplate-test/spec-examples.json' with { type: 'json' }
import { parseTemplate as parseOracleTemplate } from 'url-template'
import { defineTable } from './tables.js'
import type { UrlValues } from './types.js'

type SuiteGroup = {
  variables: Record<string, unknown>
  testcases: Array<Array<unknown>>
}

type SuiteCase = {
  template: string
  variables: UrlValues
  expected: Array<string>
}

// The suite writes templates without an origin, as `{var}`, and a table takes only full URLs.
const origin = 'https://example.com/'
const strict = { encoding: 'strict' } as const

const toCases = (suite: Record<string, SuiteGroup>): Record<string, SuiteCase> => {
  const cases: Record<string, SuiteCase> = {}

  for (const [group, { variables, testcases }] of Object.entries(suite)) {
    for (const [template, expected] of testcases) {
      cases[`${group}: ${template}`] = {
        template: `${origin}${template}`,
        variables: variables as UrlValues,
        expected: [expected].flat().map((url) => `${origin}${url}`),
      }
    }
  }

  return cases
}

const cases = {
  ...toCases(specExamples),
  ...toCases(extendedTests),
}
const failures = toCases(negativeTests)

const buildCase = ({ template, variables }: SuiteCase): string | undefined => {
  return defineTable([{ key: 'case', main: template }]).buildUrl('case', variables, strict)
}

const builtCases: Array<string> = [
  'Level 1 Examples: {var}',
  "Level 1 Examples: '{var}'",
  'Level 1 Examples: {hello}',
  'Level 4 Examples: {list}',
  'Level 4 Examples: {/list*}',
  'Additional Examples 1: {/id*}',
  'Additional Examples 1: {random}',
  'Additional Examples 2: {/id*}',
  'Additional Examples 4: Numeric Keys: {42}',
  'Additional Examples 4: Numeric Keys: {1337}',
  'Additional Examples 6: Reserved Expansion: {id}',
  'Additional Examples 6: Reserved Expansion: {not_pct}',
  'Additional Examples 6: Reserved Expansion: {list}',
  'Additional Examples 8: Literal Encoding: café/{var}',
  'Additional Examples 8: Literal Encoding: x%20y/{var}',
  'Additional Examples 8: Literal Encoding: x%20y{var}z%20w',
]

const differentCases: Array<string> = [
  'Level 4 Examples: {keys}',
  'Additional Examples 3: Empty Variables: {/empty_list*}',
  'Additional Examples 6: Reserved Expansion: {keys}',
]

const refusedCases = Object.keys(cases).filter((name) => {
  return !builtCases.includes(name) && !differentCases.includes(name)
})

describe('RFC 6570 test suite', () => {
  it.each(builtCases)('should build %s as the suite does', (name) => {
    const value = cases[name]
    const built = String(buildCase(value))

    expect(value.expected).toContain(built)
  })

  it.each(refusedCases)('should refuse %s, whose operator no table takes', (name) => {
    const throwing = () => buildCase(cases[name])

    expect(throwing).toThrow()
  })

  it.each(Object.keys(failures))('should refuse the malformed %s', (name) => {
    const throwing = () => buildCase(failures[name])

    expect(throwing).toThrow()
  })

  it.todo('should build a map in a slot of one value as its keys and values', () => {
    // {keys} with { semi: ';', dot: '.', comma: ',' } builds `semi,%3B,dot,.,comma,%2C`. A map is
    // no value a table takes yet, and is written as `[object Object]`.
  })

  it.todo('should build an empty list in a list slot as nothing, its slash too', () => {
    // {/empty_list*} with [] builds the URL without the slot. A table builds no URL from an empty
    // list, so a value left out never yields a URL that names nothing.
  })
})

const oracleCases: Array<[string, UrlValues]> = [
  ['https://example.com/notes/{title}', { title: "Hello World! (it's *new*)" }],
  ['https://example.com/notes/{title}', { title: 'café 50% x/y' }],
  ['https://example.com/docs{/path*}', { path: ['guide', 'first steps;now'] }],
  ['https://example.com/search?q={query}', { query: 'a,b&c=d+e' }],
  ['https://{user}.example.com/feed', { user: 'alice' }],
]

describe('url-template', () => {
  it.each(oracleCases)('should build %s as url-template expands it', (template, values) => {
    const table = defineTable([{ key: 'case', main: template }])
    const expected = parseOracleTemplate(template).expand(values as Record<string, string>)

    expect(table.buildUrl('case', values, strict)).toBe(expected)
  })
})

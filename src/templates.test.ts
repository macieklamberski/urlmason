import { describe, expect, it } from 'bun:test'
import { buildUrl, compileTemplate, parseTemplate, readUrl } from './templates.js'
import type { UrlValue } from './types.js'
import { defineUrls } from './utils/tables.js'

const unsupportedExpressions = [
  '{+path}',
  '{#section}',
  '{.format}',
  '{;id}',
  '{&page}',
  '{id:3}',
  '{owner,repo}',
  '{/path}', // A path segment without the explode modifier
  '{}',
]

const oldSpellings: Array<[string, string, string]> = [
  ['https://example.com/-/{labels*}', '/{labels*}', '{/labels*}'],
  ['https://example.com/{owner}/{*}', '/{*}', '{/tail*}'],
  ['https://example.com/{owner}/{repo}{*}', '{*}', '{/tail*}'],
  ['https://{*}.example.com/{owner}', '{*}', '{/tail*}'],
]

describe('parseTemplate', () => {
  it('should read a list behind its slash', () => {
    const value = 'https://example.com/-{/labels*}/feed'
    const expected = {
      path: '/-{/labels*}/feed',
      names: ['labels*'],
      isOpen: false,
    }

    expect(parseTemplate(value)).toMatchObject(expected)
  })

  it('should read the open tail at the end of the path', () => {
    const value = 'https://example.com/{owner}{/tail*}'
    const expected = {
      path: '/{owner}',
      names: ['owner'],
      isOpen: true,
    }

    expect(parseTemplate(value)).toMatchObject(expected)
  })

  it('should read the query parameters the template sets', () => {
    const value = 'https://example.com/feed?alt=rss&id={id}&xml'
    const expected = [
      { name: 'alt', value: 'rss', isFlag: false, isFilled: false },
      { name: 'id', value: '{id}', isFlag: false, isFilled: true },
      { name: 'xml', value: '', isFlag: true, isFilled: false },
    ]
    const params = parseTemplate(value).params

    expect(params).toMatchObject(expected)
  })

  it.each(oldSpellings)(
    'should throw for %s, naming the new spelling',
    (value, expression, spelling) => {
      const throwing = () => parseTemplate(value)

      expect(throwing).toThrow(
        `The template ${value} writes ${expression}, which is spelled ${spelling}`,
      )
    },
  )

  it.each(unsupportedExpressions)('should throw for %s', (expression) => {
    const value = `https://example.com/feed/${expression}`
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(
      `The template ${value} writes ${expression}, an operator or modifier no template takes`,
    )
  })

  it('should throw for the old spelling of a passed query, naming no new one', () => {
    const value = 'https://example.com/search?{query}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(
      `The template ${value} writes ?{query}, a passed query, which no template takes yet`,
    )
  })

  it('should throw for a passed query, which no template takes', () => {
    const value = 'https://example.com/search{?query*}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow('Not a feed URL template: https://example.com/search{?query*}')
  })

  it('should throw for a template without a scheme', () => {
    const value = 'example.com/feed'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow('Not a feed URL template: example.com/feed')
  })
})

describe('buildUrl', () => {
  const docs = compileTemplate(parseTemplate('https://example.com/docs{/path*}'))

  it('should write a list as segments behind a slash', () => {
    const value = { path: ['guide', 'first steps'] }
    const expected = 'https://example.com/docs/guide/first%20steps'

    expect(buildUrl(docs, value)).toBe(expected)
  })

  it('should read a string value of a list as segments joined by a slash', () => {
    const value = { path: 'guide//setup' }
    const expected = 'https://example.com/docs/guide/setup'

    expect(buildUrl(docs, value)).toBe(expected)
  })

  it('should build nothing for an empty list', () => {
    const value = { path: [] }

    expect(buildUrl(docs, value)).toBeUndefined()
  })

  it('should build nothing for a missing value', () => {
    const value = {}

    expect(buildUrl(docs, value)).toBeUndefined()
  })

  it('should write an empty base as nothing, its slash too', () => {
    const template = compileTemplate(parseTemplate('https://example.com{/base*}/feed'))
    const value = { base: [] }
    const expected = 'https://example.com/feed'

    expect(buildUrl(template, value)).toBe(expected)
  })

  it('should write a missing base as an empty one', () => {
    const template = compileTemplate(parseTemplate('https://example.com{/base*}/feed'))
    const expected = 'https://example.com/feed'

    expect(buildUrl(template)).toBe(expected)
  })

  it('should write a base as segments behind a slash', () => {
    const template = compileTemplate(parseTemplate('https://example.com{/base*}/feed'))
    const value = { base: 'community/forum' }
    const expected = 'https://example.com/community/forum/feed'

    expect(buildUrl(template, value)).toBe(expected)
  })

  it('should write the query sorted with its values encoded', () => {
    const template = compileTemplate(parseTemplate('https://example.com/feed?q={query}&alt=rss'))
    const value = { query: 'news&weather' }
    const expected = 'https://example.com/feed?alt=rss&q=news%26weather'

    expect(buildUrl(template, value)).toBe(expected)
  })

  it('should write a host value in lowercase', () => {
    const template = compileTemplate(parseTemplate('{scheme}://{user}.example.com/feed'))
    const value = {
      scheme: 'http',
      user: 'Alice',
    }
    const expected = 'http://alice.example.com/feed'

    expect(buildUrl(template, value)).toBe(expected)
  })
})

describe('readUrl', () => {
  it('should read a list into its segments', () => {
    const template = compileTemplate(parseTemplate('https://example.com/-{/labels*}/feed'))
    const value = 'https://example.com/-/news/local%20news/feed'
    const expected: Record<string, UrlValue> = { labels: ['news', 'local news'] }

    expect(readUrl(template, value)).toEqual(expected)
  })

  it('should read the open tail as tail', () => {
    const template = compileTemplate(parseTemplate('https://example.com/{owner}{/tail*}'))
    const value = 'https://example.com/alice/repo/issues'
    const expected: Record<string, UrlValue> = { owner: 'alice', tail: ['repo', 'issues'] }

    expect(readUrl(template, value)).toEqual(expected)
  })

  it('should read a host, a scheme and a query value', () => {
    const template = compileTemplate(parseTemplate('{scheme}://{host}/feed?id={id}'))
    const value = 'http://example.org/feed?id=7'
    const expected: Record<string, UrlValue> = { scheme: 'http', host: 'example.org', id: '7' }

    expect(readUrl(template, value)).toEqual(expected)
  })

  it('should read nothing from a URL without a parameter the template sets', () => {
    const template = compileTemplate(parseTemplate('https://example.com/feed?alt=rss'))
    const value = 'https://example.com/feed'

    expect(readUrl(template, value)).toBeUndefined()
  })

  it('should read a base into its segments', () => {
    const template = compileTemplate(parseTemplate('{scheme}://{host}{/base*}/feed'))
    const value = 'https://example.org/community/forum/feed'
    const expected: Record<string, UrlValue> = {
      scheme: 'https',
      host: 'example.org',
      base: ['community', 'forum'],
    }

    expect(readUrl(template, value)).toEqual(expected)
  })

  it('should read an empty base as no value', () => {
    const template = compileTemplate(parseTemplate('{scheme}://{host}{/base*}/feed'))
    const value = 'https://example.org/feed'
    const expected: Record<string, UrlValue> = { scheme: 'https', host: 'example.org' }

    expect(readUrl(template, value)).toEqual(expected)
  })

  it('should read nothing from a URL with an empty list', () => {
    const template = compileTemplate(parseTemplate('https://example.com/docs{/path*}'))
    const value = 'https://example.com/docs'

    expect(readUrl(template, value)).toBeUndefined()
  })
})

describe('defineUrls with the URI Templates spelling', () => {
  const table = defineUrls([
    { key: 'docs', main: 'https://example.com/docs{/path*}' },
    { key: 'repo', main: 'https://example.com/{owner}{/tail*}' },
  ])

  it('should type a list as its segments', () => {
    const value = 'https://example.com/docs/guide/setup'
    const expected = ['guide', 'setup']
    const match = table.read(value)
    const path: Array<string> | undefined = match?.key === 'docs' ? match.params.path : undefined

    expect(path).toEqual(expected)
  })

  it('should leave the open tail out of the values', () => {
    const value = 'https://example.com/alice/repo/issues'
    const expected = { owner: 'alice' }
    const match = table.read(value)
    // @ts-expect-error: The open tail is no value.
    const tail = match?.key === 'repo' ? match.params.tail : undefined

    expect(match?.params).toEqual(expected)
    expect(tail).toBeUndefined()
  })
})

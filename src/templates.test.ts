import { describe, expect, it } from 'bun:test'
import { defineUrls } from './tables.js'
import { parseTemplate } from './templates.js'

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
      `The template ${value} writes ?{query}, a passed query, which no template takes`,
    )
  })

  it('should throw for a passed query, which no template takes', () => {
    const value = 'https://example.com/search{?query*}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow('Not a URL template: https://example.com/search{?query*}')
  })

  it('should throw for a template without a scheme', () => {
    const value = 'example.com/feed'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow('Not a URL template: example.com/feed')
  })
})

describe('build with a URI Template', () => {
  const docs = defineUrls([{ key: 'docs', main: 'https://example.com/docs{/path*}' }])
  const feeds = defineUrls([{ key: 'feed', main: 'https://example.com{/base*}/feed' }])

  it('should write a list as segments behind a slash', () => {
    const value = { path: ['guide', 'first steps'] }
    const expected = 'https://example.com/docs/guide/first%20steps'

    expect(docs.build('docs', value)).toBe(expected)
  })

  it('should read a string value of a list as segments joined by a slash', () => {
    const value = { path: 'guide//setup' }
    const expected = 'https://example.com/docs/guide/setup'

    expect(docs.build('docs', value)).toBe(expected)
  })

  it('should build nothing for an empty list', () => {
    const value = { path: [] }

    expect(docs.build('docs', value)).toBeUndefined()
  })

  it('should build nothing for a missing value', () => {
    const value = {}

    expect(docs.build('docs', value)).toBeUndefined()
  })

  it('should write an empty base as nothing, its slash too', () => {
    const value = { base: [] }
    const expected = 'https://example.com/feed'

    expect(feeds.build('feed', value)).toBe(expected)
  })

  it('should write a missing base as an empty one', () => {
    const expected = 'https://example.com/feed'

    expect(feeds.build('feed')).toBe(expected)
  })

  it('should write a base as segments behind a slash', () => {
    const value = { base: 'community/forum' }
    const expected = 'https://example.com/community/forum/feed'

    expect(feeds.build('feed', value)).toBe(expected)
  })

  it('should write the query sorted with its values encoded', () => {
    const table = defineUrls([
      { key: 'search', main: 'https://example.com/feed?q={query}&alt=rss' },
    ])
    const value = { query: 'news&weather' }
    const expected = 'https://example.com/feed?alt=rss&q=news%26weather'

    expect(table.build('search', value)).toBe(expected)
  })

  it('should write a host value in lowercase', () => {
    const table = defineUrls([{ key: 'user', main: '{scheme}://{user}.example.com/feed' }])
    const value = {
      scheme: 'http',
      user: 'Alice',
    }
    const expected = 'http://alice.example.com/feed'

    expect(table.build('user', value)).toBe(expected)
  })
})

describe('read with a URI Template', () => {
  const anyHost = { isAnyHost: true }

  it('should read a list into its segments', () => {
    const table = defineUrls([{ key: 'labels', main: 'https://example.com/-{/labels*}/feed' }])
    const value = 'https://example.com/-/news/local%20news/feed'
    const expected = { labels: ['news', 'local news'] }
    const match = table.read(value)

    expect(match?.params).toEqual(expected)
  })

  it('should read a host, a scheme and a query value', () => {
    const table = defineUrls([{ key: 'feed', main: '{scheme}://{host}/feed?id={id}' }])
    const value = 'http://example.org/feed?id=7'
    const expected = {
      scheme: 'http',
      host: 'example.org',
      id: '7',
    }
    const match = table.read(value, anyHost)

    expect(match?.params).toEqual(expected)
  })

  it('should read nothing from a URL without a parameter the template sets', () => {
    const table = defineUrls([{ key: 'feed', main: 'https://example.com/feed?alt=rss' }])
    const value = 'https://example.com/feed'

    expect(table.read(value)).toBeUndefined()
  })

  it('should read a base into its segments', () => {
    const table = defineUrls([{ key: 'feed', main: '{scheme}://{host}{/base*}/feed' }])
    const value = 'https://example.org/community/forum/feed'
    const expected = {
      scheme: 'https',
      host: 'example.org',
      base: ['community', 'forum'],
    }
    const match = table.read(value, anyHost)

    expect(match?.params).toEqual(expected)
  })

  it('should read an empty base as no value', () => {
    const table = defineUrls([{ key: 'feed', main: '{scheme}://{host}{/base*}/feed' }])
    const value = 'https://example.org/feed'
    const expected = {
      scheme: 'https',
      host: 'example.org',
    }
    const match = table.read(value, anyHost)

    expect(match?.params).toEqual(expected)
  })

  it('should read nothing from a URL with an empty list', () => {
    const table = defineUrls([{ key: 'docs', main: 'https://example.com/docs{/path*}' }])
    const value = 'https://example.com/docs'

    expect(table.read(value)).toBeUndefined()
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

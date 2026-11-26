import { describe, expect, it } from 'bun:test'
import { defineTable } from './tables.js'
import { parseTemplate } from './templates.js'

const unsupportedExpressions = [
  '{+path,x}',
  '{+path*}',
  '{#section,part}',
  '{#section*}',
  '{.format}',
  '{;id}',
  '{id:3}',
  '{owner,repo}',
  '{/path}', // A path segment without the explode modifier
  '{}',
]

// Query continuation needs a query in front of it, a query start none, either ends the URL, and
// neither names a placeholder of the template.
const misplacedQueryTemplates: Array<string> = [
  'https://example.com/feed{&page}',
  'https://example.com/feed?alt=rss{?page}',
  'https://example.com/feed{?page}/more',
  'https://example.com/feeds{/path*}{?path}',
]

// A reserved value sits in the path, beside no list but the base and no open tail.
const misplacedReservedTemplates: Array<[string, string]> = [
  ['https://{+host}/feed', '{+host}'],
  ['https://example.com/feed?url={+url}', '{+url}'],
  ['https://example.com/feed?alt=rss/{+url}', '{+url}'],
  ['https://example.com{/options*}/to/{+url}', '{+url}'],
  ['https://example.com{/options*}-{+url}', '{+url}'],
  ['https://example.com/{+url}{/options*}', '{+url}'],
  ['https://example.com/{+url}{/tail*}', '{+url}'],
  ['https://example.com{/sizes*}/x{/options*}/{+url}', '{+url}'],
]

const repeatedReservedTemplates: Array<string> = [
  'https://example.com/{url}/{+url}',
  'https://example.com/{+url}/-/{+url}',
  'https://example.com/{+url}{?url}',
]

// A fragment holds fixed text, values and reserved values, and `{#name}` ends a template.
const refusedFragmentTemplates: Array<string> = [
  'https://example.com/feed#',
  'https://example.com/feed#tags{/tags*}',
  'https://example.com/feed#page{?page}',
  'https://example.com/feed#top{#section}',
  'https://example.com/{#section}/feed',
  'https://example.com/{+url}#{+url}',
  'https://example.com/{name}#{+name}',
]

const unbalancedTemplates: Array<string> = ['https://example.com/{/id*', 'https://example.com/id*}']

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

  it.each(misplacedQueryTemplates)('should throw for the misplaced query names of %s', (value) => {
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it.each(unsupportedExpressions)('should throw for %s', (expression) => {
    const value = `https://example.com/feed/${expression}`
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(
      `The template ${value} writes ${expression}, an operator or modifier no template takes`,
    )
  })

  it.each(misplacedReservedTemplates)(
    'should throw for the misplaced reserved value of %s',
    (value, expression) => {
      const throwing = () => parseTemplate(value)

      expect(throwing).toThrow(
        `The template ${value} writes ${expression} outside its path, or beside a list or an open tail`,
      )
    },
  )

  it.each(repeatedReservedTemplates)(
    'should throw for the reserved value of %s, named twice',
    (value) => {
      const throwing = () => parseTemplate(value)

      expect(throwing).toThrow(`Not a URL template: ${value}`)
    },
  )

  it('should read a reserved value that ends a template behind the base as the rest', () => {
    const value = '{scheme}://{host}{/base*}/proxy/{+url}'
    const expected = 'url'

    expect(parseTemplate(value).restName).toBe(expected)
  })

  it('should read a reserved value in front of fixed text as no rest', () => {
    const value = 'https://example.com/{+path}/feed.xml'

    expect(parseTemplate(value).restName).toBeUndefined()
  })

  it('should read a list right in front of a reserved value as sharing its segments', () => {
    const value = '{scheme}://{host}{/base*}/cdn{/options*}/{+source}'
    const expected = {
      list: 'options',
      reserved: 'source',
    }

    expect(parseTemplate(value).listSplit).toEqual(expected)
  })

  it('should read the base in front of a reserved value as sharing no segment', () => {
    const value = '{scheme}://{host}{/base*}/{+source}'

    expect(parseTemplate(value).listSplit).toBeUndefined()
  })

  it.each(refusedFragmentTemplates)('should throw for the fragment of %s', (value) => {
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should read the text behind a hash as the fragment', () => {
    const value = 'https://example.com/app?v={id}#!/video/{id}/{+rest}'
    const expected = '!/video/{id}/{rest}'

    expect(parseTemplate(value).fragment).toBe(expected)
  })

  it('should read a fragment expression as the whole fragment, a reserved value', () => {
    const value = 'https://example.com/{page}{?lang}{#section}'
    const expected = ['section']

    expect(parseTemplate(value).fragmentReservedNames).toEqual(expected)
  })

  it('should read a reserved value in front of a fragment as no rest', () => {
    const value = 'https://example.com/{+path}#top'

    expect(parseTemplate(value).restName).toBeUndefined()
  })

  it('should read a reserved value in front of a query as no rest', () => {
    const value = 'https://example.com/{+path}{?page}'

    expect(parseTemplate(value).restName).toBeUndefined()
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

  it.each(unbalancedTemplates)(
    'should throw for %s, whose brace is not closed or opened',
    (value) => {
      const throwing = () => parseTemplate(value)

      expect(throwing).toThrow(`The template ${value} writes a brace outside a complete expression`)
    },
  )

  it('should throw for a template without a scheme', () => {
    const value = 'example.com/feed'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow('Not a URL template: example.com/feed')
  })
})

describe('build with a URI Template', () => {
  const docs = defineTable([{ key: 'docs', main: 'https://example.com/docs{/path*}' }])
  const feeds = defineTable([{ key: 'feed', main: 'https://example.com{/base*}/feed' }])

  it('should write a list as segments behind a slash', () => {
    const value = { path: ['guide', 'first steps'] }
    const expected = 'https://example.com/docs/guide/first%20steps'

    expect(docs.buildUrl('docs', value)).toBe(expected)
  })

  it('should read a string value of a list as segments joined by a slash', () => {
    const value = { path: 'guide//setup' }
    const expected = 'https://example.com/docs/guide/setup'

    expect(docs.buildUrl('docs', value)).toBe(expected)
  })

  it('should build nothing for an empty list', () => {
    const value = { path: [] }

    expect(docs.buildUrl('docs', value)).toBeUndefined()
  })

  it('should build nothing for a missing value', () => {
    const value = {}

    expect(docs.buildUrl('docs', value)).toBeUndefined()
  })

  it('should write an empty base as nothing, its slash too', () => {
    const value = { base: [] }
    const expected = 'https://example.com/feed'

    expect(feeds.buildUrl('feed', value)).toBe(expected)
  })

  it('should write a missing base as an empty one', () => {
    const expected = 'https://example.com/feed'

    expect(feeds.buildUrl('feed')).toBe(expected)
  })

  it('should write a base as segments behind a slash', () => {
    const value = { base: 'community/forum' }
    const expected = 'https://example.com/community/forum/feed'

    expect(feeds.buildUrl('feed', value)).toBe(expected)
  })

  it('should write the query sorted with its values encoded', () => {
    const table = defineTable([
      { key: 'search', main: 'https://example.com/feed?q={query}&alt=rss' },
    ])
    const value = { query: 'news&weather' }
    const expected = 'https://example.com/feed?alt=rss&q=news%26weather'

    expect(table.buildUrl('search', value)).toBe(expected)
  })

  it('should write a host value in lowercase', () => {
    const table = defineTable([{ key: 'user', main: '{scheme}://{user}.example.com/feed' }])
    const value = {
      scheme: 'http',
      user: 'Alice',
    }
    const expected = 'http://alice.example.com/feed'

    expect(table.buildUrl('user', value)).toBe(expected)
  })
})

describe('read with a URI Template', () => {
  const anyHost = { isAnyHost: true }

  it('should read a list into its segments', () => {
    const table = defineTable([{ key: 'labels', main: 'https://example.com/-{/labels*}/feed' }])
    const value = 'https://example.com/-/news/local%20news/feed'
    const expected = { labels: ['news', 'local news'] }
    const match = table.readUrl(value)

    expect(match?.values).toEqual(expected)
  })

  it('should read a host, a scheme and a query value', () => {
    const table = defineTable([{ key: 'feed', main: '{scheme}://{host}/feed?id={id}' }])
    const value = 'http://example.org/feed?id=7'
    const expected = {
      scheme: 'http',
      host: 'example.org',
      id: '7',
    }
    const match = table.readUrl(value, anyHost)

    expect(match?.values).toEqual(expected)
  })

  it('should read nothing from a URL without a parameter the template sets', () => {
    const table = defineTable([{ key: 'feed', main: 'https://example.com/feed?alt=rss' }])
    const value = 'https://example.com/feed'

    expect(table.readUrl(value)).toBeUndefined()
  })

  it('should read a base into its segments', () => {
    const table = defineTable([{ key: 'feed', main: '{scheme}://{host}{/base*}/feed' }])
    const value = 'https://example.org/community/forum/feed'
    const expected = {
      scheme: 'https',
      host: 'example.org',
      base: ['community', 'forum'],
    }
    const match = table.readUrl(value, anyHost)

    expect(match?.values).toEqual(expected)
  })

  it('should read an empty base as no value', () => {
    const table = defineTable([{ key: 'feed', main: '{scheme}://{host}{/base*}/feed' }])
    const value = 'https://example.org/feed'
    const expected = {
      scheme: 'https',
      host: 'example.org',
    }
    const match = table.readUrl(value, anyHost)

    expect(match?.values).toEqual(expected)
  })

  it('should read nothing from a URL with an empty list', () => {
    const table = defineTable([{ key: 'docs', main: 'https://example.com/docs{/path*}' }])
    const value = 'https://example.com/docs'

    expect(table.readUrl(value)).toBeUndefined()
  })
})

describe('defineTable with the URI Templates spelling', () => {
  const table = defineTable([
    { key: 'docs', main: 'https://example.com/docs{/path*}' },
    { key: 'repo', main: 'https://example.com/{owner}{/tail*}' },
    { key: 'search', main: 'https://example.com/search{?q}' },
    { key: 'feed', main: 'https://example.com/feed?alt=rss{&page,limit}' },
    { key: 'proxy', main: 'https://proxy.example.com/{+url}' },
    { key: 'guide', main: 'https://guide.example.com/{page}{#section}' },
  ])

  it('should type a list as its segments', () => {
    const value = 'https://example.com/docs/guide/setup'
    const expected = ['guide', 'setup']
    const match = table.readUrl(value)
    const path: Array<string> | undefined = match?.key === 'docs' ? match.values.path : undefined

    expect(path).toEqual(expected)
  })

  it('should type a reserved value as a string under its name', () => {
    const value = 'https://proxy.example.com/https://example.org/feed'
    const expected = 'https://example.org/feed'
    const match = table.readUrl(value)
    const url: string | undefined = match?.key === 'proxy' ? match.values.url : undefined

    expect(url).toBe(expected)
  })

  it('should type the whole fragment as a string under its name', () => {
    const value = 'https://guide.example.com/setup#install'
    const expected = 'install'
    const match = table.readUrl(value)
    const section: string | undefined = match?.key === 'guide' ? match.values.section : undefined

    expect(section).toBe(expected)
  })

  it('should leave the open tail out of the values', () => {
    const value = 'https://example.com/alice/repo/issues'
    const expected = { owner: 'alice' }
    const match = table.readUrl(value)
    // @ts-expect-error: The open tail is no value.
    const tail = match?.key === 'repo' ? match.values.tail : undefined

    expect(match?.values).toEqual(expected)
    expect(tail).toBeUndefined()
  })

  it('should type a query name as a value that may be absent', () => {
    const value = 'https://example.com/search'
    const match = table.readUrl(value)
    const values = match?.key === 'search' ? match.values : undefined
    const expected: typeof values = {}

    expect(values).toEqual(expected)
  })

  it('should type each name of a query list as its own value', () => {
    const value = 'https://example.com/feed?alt=rss&page=2'
    const match = table.readUrl(value)
    const values = match?.key === 'feed' ? match.values : undefined
    const expected: typeof values = { page: '2' }

    expect(values).toEqual(expected)
  })
})

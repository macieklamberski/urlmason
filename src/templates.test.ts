import { describe, expect, it } from 'bun:test'
import { defineTable } from './tables.js'
import {
  encodeParserText,
  isTypedValue,
  parseTemplate,
  toAsciiHost,
  toSlotText,
} from './templates.js'
import type { UrlMap } from './types.js'

// Query continuation needs a query in front of it, and names no placeholder of the template.
const misplacedQueryTemplates: Array<string> = [
  'https://example.com/feed{&page}',
  'https://example.com/feeds{/path*}{?path}',
]

// A reserved value sits in the path, beside no list but the base and no open tail.
const misplacedReservedTemplates: Array<[string, string]> = [
  ['https://example.com/feed?url={+url}', '{+url}'],
  ['https://example.com/feed?alt=rss/{+url}', '{+url}'],
  ['https://example.com{/options*}-{+url}', '{+url}'],
  ['https://example.com/{+url}{/options*}', '{+url}'],
  ['https://example.com/{+url}{/tail*}', '{+url}'],
  ['https://example.com{/sizes*}/x{/options*}/{+url}', '{+url}'],
]

// A fragment holds fixed text, values and reserved values, and `{#name}` ends a template.
const refusedFragmentTemplates: Array<string> = [
  'https://example.com/feed#',
  'https://example.com/{#section}/feed',
  'https://example.com/{name}#{+name}',
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

  it('should read a scheme and a host in capitals in lowercase', () => {
    const value = 'HTTPS://{blog}-Books.Example.com/{id}'
    const expected = {
      scheme: 'https',
      host: '{blog}-books.example.com',
    }

    expect(parseTemplate(value)).toMatchObject(expected)
  })

  it('should throw for a port in the host', () => {
    const value = 'https://example.com:8080/{id}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(
      'The template https://example.com:8080/{id} writes a port or a user in its host, which no URL reads',
    )
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

  it.each(misplacedQueryTemplates)('should throw for the misplaced query names of %s', (value) => {
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should throw for a query that opens with a second question mark', () => {
    const value = 'https://example.com/items??id={id}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should throw for a value in the name of a pair with a value', () => {
    const value = 'https://example.com/items?{id}=1'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should throw for an escaped brace that decodes to a placeholder in a fixed value', () => {
    const value = 'https://example.com/search.pl?format=rss&q=su%3A%7BClero%7D'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should throw for a parameter the template names twice', () => {
    const value = 'https://example.com/search?types=page&types=post'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
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

  it('should throw for a reserved value a placeholder also reads', () => {
    const value = 'https://example.com/{url}/{+url}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

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

  it('should throw for the old spelling of a passed query, naming the new one', () => {
    const value = 'https://example.com/search?{query}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`The template ${value} writes ?{query}, which is spelled {?query*}`)
  })

  it('should read the last query name with an asterisk as the passed query', () => {
    const value = 'https://example.com/search{?page,query*}'
    const parsed = parseTemplate(value)

    expect(parsed.passedName).toBe('query')
    expect(parsed.optionalNames).toEqual(['page'])
  })

  it('should throw for a passed query whose name a placeholder also reads', () => {
    const value = 'https://example.com/{query}{?query*}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should throw for a template without a scheme', () => {
    const value = 'example.com/feed'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow('Not a URL template: example.com/feed')
  })

  it('should throw for two values with no fixed text between them', () => {
    const value = 'https://example.com/{first}{second}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(
      `The template ${value} writes {first}{second}, two values with no fixed text between them, so the two are split by a guess`,
    )
  })

  it('should throw for `{host}` in the path', () => {
    const value = 'https://example.com/mirror/{host}'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(
      `The template ${value} writes {host} outside its host, where it reads no host`,
    )
  })

  it('should throw for a base behind a fixed host', () => {
    const value = 'https://example.com{/base*}/feed.php'
    const throwing = () => parseTemplate(value)

    expect(throwing).toThrow(
      `The template ${value} writes {/base*} behind a host other than {host}, where no URL reads it`,
    )
  })
})

describe('build with a URI Template', () => {
  const docs = defineTable([{ key: 'docs', main: 'https://example.com/docs{/path*}' }])
  const feeds = defineTable([{ key: 'feed', main: 'https://{host}{/base*}/feed' }])

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
    const value = {
      host: 'example.com',
      base: [],
    }
    const expected = 'https://example.com/feed'

    expect(feeds.buildUrl('feed', value)).toBe(expected)
  })

  it('should write a missing base as an empty one', () => {
    const value = { host: 'example.com' }
    const expected = 'https://example.com/feed'

    expect(feeds.buildUrl('feed', value)).toBe(expected)
  })

  it('should write a base as segments behind a slash', () => {
    const value = {
      host: 'example.com',
      base: 'community/forum',
    }
    const expected = 'https://example.com/community/forum/feed'

    expect(feeds.buildUrl('feed', value)).toBe(expected)
  })

  it('should write the query in the template order with its values encoded', () => {
    const table = defineTable([
      { key: 'search', main: 'https://example.com/feed?q={query}&alt=rss' },
    ])
    const value = { query: 'news&weather' }
    const expected = 'https://example.com/feed?q=news%26weather&alt=rss'

    expect(table.buildUrl('search', value)).toBe(expected)
  })

  it('should escape a caret in fixed text of a path as a parser does', () => {
    const table = defineTable([{ key: 'feed', main: 'https://example.com/^rss/{name}.xml' }])
    const value = { name: 'devarf' }
    const expected = 'https://example.com/%5Erss/devarf.xml'

    expect(table.buildUrl('feed', value)).toBe(expected)
  })

  it('should build a URL in lowercase from a template in capitals', () => {
    const table = defineTable([{ key: 'feed', main: 'HTTPS://Example.com/{id}' }])
    const value = { id: '1' }
    const expected = 'https://example.com/1'

    expect(table.buildUrl('feed', value)).toBe(expected)
  })

  it('should build no URL for a host value a parser reads as an address', () => {
    const table = defineTable([{ key: 'shop', main: 'https://{host}/shop/{id}' }])
    const value = {
      host: '１２３４５',
      id: '1',
    }

    expect(table.buildUrl('shop', value)).toBeUndefined()
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

  it('should leave out an optional value of null', () => {
    const table = defineTable([{ key: 'feed', main: 'https://example.com/feed{?page}' }])
    const value = { page: null }
    const expected = 'https://example.com/feed'

    // @ts-expect-error: This is for testing purposes.
    expect(table.buildUrl('feed', value)).toBe(expected)
  })

  it('should leave out a name of a map that holds nothing', () => {
    const table = defineTable([{ key: 'search', main: 'https://example.com/search{?query*}' }])
    const value = { query: { tag: undefined, lang: 'en' } }
    const expected = 'https://example.com/search?lang=en'

    // @ts-expect-error: This is for testing purposes.
    expect(table.buildUrl('search', value)).toBe(expected)
  })

  it('should write a map without a prototype as a map', () => {
    const table = defineTable([{ key: 'search', main: 'https://example.com/search{?query*}' }])
    const value = { query: Object.assign(Object.create(null), { tag: 'news' }) }
    const expected = 'https://example.com/search?tag=news'

    expect(table.buildUrl('search', value)).toBe(expected)
  })

  it('should write the numbers of a list as their text', () => {
    const table = defineTable([{ key: 'items', main: 'https://example.com/items?ids={ids}' }])
    const value = { ids: [1, 2] }
    const expected = 'https://example.com/items?ids=1,2'

    // @ts-expect-error: This is for testing purposes.
    expect(table.buildUrl('items', value)).toBe(expected)
  })
})

describe('isTypedValue', () => {
  it('should take text, a list of text and a map of text or lists', () => {
    const value = ['news', ['news', 'sports'], { tag: 'news', lang: ['en', 'de'] }]

    expect(value.every(isTypedValue)).toBe(true)
  })

  it('should take a number and a boolean as text', () => {
    const value = [5, true, [1, 2], { page: 2 }]

    expect(value.every(isTypedValue)).toBe(true)
  })

  it('should take no value', () => {
    const value = [undefined, null, [undefined], { tag: null }]

    expect(value.every(isTypedValue)).toBe(true)
  })

  it('should refuse a list inside a list', () => {
    const value = [['news']]

    expect(isTypedValue(value)).toBe(false)
  })

  it('should refuse a map inside a map', () => {
    const value = { tag: { name: 'news' } }

    expect(isTypedValue(value)).toBe(false)
  })

  it('should refuse a map inside a list of a map', () => {
    const value = { tag: [{ name: 'news' }] }

    expect(isTypedValue(value)).toBe(false)
  })

  it('should refuse text cut inside an emoji', () => {
    const value = `news${'😀'.slice(0, 1)}`

    expect(isTypedValue(value)).toBe(false)
  })

  it('should refuse a map name cut inside an emoji', () => {
    const value = { [`news${'😀'.slice(0, 1)}`]: 'en' }

    expect(isTypedValue(value)).toBe(false)
  })

  it('should take a whole emoji', () => {
    const value = 'news😀'

    expect(isTypedValue(value)).toBe(true)
  })

  it('should refuse a function', () => {
    const value = () => 'news'

    expect(isTypedValue(value)).toBe(false)
  })
})

describe('encodeParserText', () => {
  it('should escape the characters a parser escapes in a path', () => {
    const value = 'a b"c<d>e\\f^g`h{i}'
    const expected = 'a%20b%22c%3Cd%3Ee%5Cf%5Eg%60h%7Bi%7D'

    expect(encodeParserText(value, 'path')).toBe(expected)
  })

  it('should keep a pipe in a path', () => {
    const value = 'a|b'
    const expected = 'a|b'

    expect(encodeParserText(value, 'path')).toBe(expected)
  })

  it('should escape a quote in a query and keep a caret and braces', () => {
    const value = "it's^{x}"
    const expected = 'it%27s^{x}'

    expect(encodeParserText(value, 'query')).toBe(expected)
  })

  it('should escape a backtick in a fragment and keep a caret and braces', () => {
    const value = "a`b^{c}'d"
    const expected = "a%60b^{c}'d"

    expect(encodeParserText(value, 'fragment')).toBe(expected)
  })

  it('should escape the text behind a question mark in a path as a query', () => {
    const value = "a^b?c^d'e"
    const expected = 'a%5Eb?c^d%27e'

    expect(encodeParserText(value, 'path')).toBe(expected)
  })

  it('should escape the text behind a hash in a path as a fragment', () => {
    const value = 'a^b#c^d`e'
    const expected = 'a%5Eb#c^d%60e'

    expect(encodeParserText(value, 'path')).toBe(expected)
  })

  it('should escape the text behind a hash in a query as a fragment', () => {
    const value = "a'b#c'd`e"
    const expected = "a%27b#c'd%60e"

    expect(encodeParserText(value, 'query')).toBe(expected)
  })
})

describe('toAsciiHost', () => {
  it('should write a host in lowercase', () => {
    const value = 'Feeds.Example.com'
    const expected = 'feeds.example.com'

    expect(toAsciiHost(value)).toBe(expected)
  })

  it('should write a label outside ASCII in punycode', () => {
    const value = 'bücher.example'
    const expected = 'xn--bcher-kva.example'

    expect(toAsciiHost(value)).toBe(expected)
  })

  it('should write a label of full-width digits as digits', () => {
    const value = '１２３.example'
    const expected = '123.example'

    expect(toAsciiHost(value)).toBe(expected)
  })

  it('should keep a label a parser maps to two labels as written', () => {
    const value = 'a．b.example'
    const expected = 'a．b.example'

    expect(toAsciiHost(value)).toBe(expected)
  })

  it('should keep a label no parser takes as written', () => {
    const value = 'é x.example'
    const expected = 'é x.example'

    expect(toAsciiHost(value)).toBe(expected)
  })

  it('should keep a placeholder as written and lowercase the text beside it', () => {
    const value = '{blogName}-Books.example.com'
    const expected = '{blogName}-books.example.com'

    expect(toAsciiHost(value)).toBe(expected)
  })
})

describe('toSlotText', () => {
  it('should write text as it is', () => {
    const value = 'news'
    const expected = 'news'

    expect(toSlotText(value, 'tag')).toBe(expected)
  })

  it('should join a list in a slot of one value by commas', () => {
    const value = ['news', 'sports']
    const expected = 'news,sports'

    expect(toSlotText(value, 'tags')).toBe(expected)
  })

  it('should join a map in a slot of one value as names and values by commas', () => {
    const value = {
      tag: 'news',
      lang: ['en', 'de'],
    }
    const expected = 'tag,news,lang,en,lang,de'

    expect(toSlotText(value, 'query')).toBe(expected)
  })

  it('should join a list in a list slot by slashes', () => {
    const value = ['guide', 'setup']
    const expected = 'guide/setup'

    expect(toSlotText(value, 'path*')).toBe(expected)
  })

  it('should write a map in a list slot as a segment per name and value', () => {
    const value = {
      lang: 'en',
      tag: ['news', 'sports'],
    }
    const expected = 'lang=en/tag=news/tag=sports'

    expect(toSlotText(value, 'path*')).toBe(expected)
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

  it('should read fixed text a parser escapes as exact', () => {
    const table = defineTable([{ key: 'feed', main: 'https://example.com/^rss/{name}#a`b' }])
    const value = 'https://example.com/%5Erss/devarf#a%60b'
    const match = table.readUrl(value)

    expect(match?.isExactMatch).toBe(true)
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
    { key: 'find', main: 'https://find.example.com/{?q,query*}' },
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

  it('should type a passed query as a map that may be absent', () => {
    const value = 'https://find.example.com/?q=feeds&tag=a&tag=b'
    const expected = { tag: ['a', 'b'] }
    const match = table.readUrl(value)
    const query: UrlMap | undefined = match?.key === 'find' ? match.values.query : undefined

    expect(query).toEqual(expected)
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

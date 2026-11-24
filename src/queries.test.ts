import { describe, expect, it } from 'bun:test'
import {
  appendValue,
  cutHref,
  decodeQueryValue,
  type HrefParts,
  parseQuery,
  type QueryPair,
  readAmpersandEntities,
  sortPairs,
  toPair,
  toSearchParams,
  writeQuery,
} from './queries.js'

const roundTripQueries = ['?', '??page=2', '?a=1&&b=2', '?a=1&', '?=1', '?a==1', '?a=1&amp;b=2']

describe('toPair', () => {
  it('should split a pair at its first equals sign', () => {
    const value = 'id=5=7'
    const expected: QueryPair = {
      text: 'id=5=7',
      rawName: 'id',
      rawValue: '5=7',
      name: 'id',
      sortName: 'id',
    }

    expect(toPair(value)).toEqual(expected)
  })

  it('should give a bare name no value', () => {
    const value = 'rss'
    const pair = toPair(value)

    expect(pair.rawValue).toBeUndefined()
  })

  it('should give a name behind an equals sign an empty value', () => {
    const value = 'rss='
    const expected = ''
    const pair = toPair(value)

    expect(pair.rawValue).toBe(expected)
  })

  it('should read + in a name as a space', () => {
    const value = 'sort+by=date'
    const expected = 'sort by'
    const pair = toPair(value)

    expect(pair.name).toBe(expected)
  })

  it('should read %20 in a name as a space', () => {
    const value = 'sort%20by=date'
    const expected = 'sort by'
    const pair = toPair(value)

    expect(pair.name).toBe(expected)
  })

  it('should read an escape that is no UTF-8 in a name as U+FFFD', () => {
    const value = 'id%FF=5'
    const expected = 'id\uFFFD'
    const pair = toPair(value)

    expect(pair.name).toBe(expected)
  })

  it('should keep a question mark that opens a name', () => {
    const value = '?page=2'
    const expected = '?page'
    const pair = toPair(value)

    expect(pair.name).toBe(expected)
  })

  it('should order a name with an escape that is no UTF-8 as written', () => {
    const value = 'id%FF=5'
    const expected = 'id%FF'
    const pair = toPair(value)

    expect(pair.sortName).toBe(expected)
  })
})

describe('appendValue', () => {
  it('should write a value behind a pair that ends in an equals sign', () => {
    const value = toPair('id=')
    const valueText = '5'
    const expected: QueryPair = {
      text: 'id=5',
      rawName: 'id',
      rawValue: '5',
      name: 'id',
      sortName: 'id',
    }

    expect(appendValue(value, valueText)).toEqual(expected)
  })
})

describe('parseQuery', () => {
  it('should return a pair for each part between two ampersands', () => {
    const value = '?alt=rss&max-results=5'
    const expected = ['alt=rss', 'max-results=5']
    const texts = parseQuery(value).map((pair) => pair.text)

    expect(texts).toEqual(expected)
  })

  it('should return no pair for no query', () => {
    const value = ''
    const expected: Array<QueryPair> = []

    expect(parseQuery(value)).toEqual(expected)
  })

  it('should return one empty pair for a bare question mark', () => {
    const value = '?'
    const expected = ['']
    const texts = parseQuery(value).map((pair) => pair.text)

    expect(texts).toEqual(expected)
  })

  it('should keep an empty pair between two ampersands', () => {
    const value = '?a=1&&b=2'
    const expected = ['a=1', '', 'b=2']
    const texts = parseQuery(value).map((pair) => pair.text)

    expect(texts).toEqual(expected)
  })

  it('should drop one leading question mark only', () => {
    const value = '??page=2'
    const expected = ['?page=2']
    const texts = parseQuery(value).map((pair) => pair.text)

    expect(texts).toEqual(expected)
  })

  it('should read a query written without its question mark', () => {
    const value = 'page=2&sort=date'
    const expected = ['page=2', 'sort=date']
    const texts = parseQuery(value).map((pair) => pair.text)

    expect(texts).toEqual(expected)
  })

  it('should end a query at its fragment', () => {
    const value = '?page=2#sort=date&top'
    const expected = ['page=2']
    const texts = parseQuery(value).map((pair) => pair.text)

    expect(texts).toEqual(expected)
  })
})

describe('writeQuery', () => {
  it('should write the pairs behind one question mark', () => {
    const value = [toPair('alt=rss'), toPair('max-results=5')]
    const expected = '?alt=rss&max-results=5'

    expect(writeQuery(value)).toBe(expected)
  })

  it('should write nothing for no pair', () => {
    const value: Array<QueryPair> = []
    const expected = ''

    expect(writeQuery(value)).toBe(expected)
  })

  it.each(roundTripQueries)('should write %s back as it was read', (query) => {
    const pairs = parseQuery(query)

    expect(writeQuery(pairs)).toBe(query)
  })
})

describe('sortPairs', () => {
  it('should sort pairs by name', () => {
    const value = parseQuery('?type=rss&alt=rss')
    const expected = '?alt=rss&type=rss'
    const sorted = sortPairs(value)

    expect(writeQuery(sorted)).toBe(expected)
  })

  it('should keep the order of one name in two cases', () => {
    const value = parseQuery('?b=2&B=1&a=3')
    const expected = '?a=3&b=2&B=1'
    const sorted = sortPairs(value)

    expect(writeQuery(sorted)).toBe(expected)
  })

  it('should sort a percent-encoded name as the name it decodes to', () => {
    const value = parseQuery('?b=2&%61=1')
    const expected = '?%61=1&b=2'
    const sorted = sortPairs(value)

    expect(writeQuery(sorted)).toBe(expected)
  })

  it('should drop an empty pair', () => {
    const value = parseQuery('?b=2&&a=1&')
    const expected = '?a=1&b=2'
    const sorted = sortPairs(value)

    expect(writeQuery(sorted)).toBe(expected)
  })
})

describe('readAmpersandEntities', () => {
  it('should read a pair behind &amp; without its amp;', () => {
    const value = parseQuery('?a=1&amp;b=2')
    const expected = '?a=1&b=2'
    const pairs = readAmpersandEntities(value)

    expect(writeQuery(pairs)).toBe(expected)
  })

  it('should read the name of a pair behind &amp; without its amp;', () => {
    const value = parseQuery('?a=1&amp;b=2')
    const expected = ['a', 'b']
    const names = readAmpersandEntities(value).map((pair) => pair.name)

    expect(names).toEqual(expected)
  })

  it('should keep amp; that opens the first pair', () => {
    const value = parseQuery('?amp;a=1&b=2')
    const expected = '?amp;a=1&b=2'
    const pairs = readAmpersandEntities(value)

    expect(writeQuery(pairs)).toBe(expected)
  })

  it('should drop one amp; from a pair that starts with two', () => {
    const value = parseQuery('?a=1&amp;amp;b=2')
    const expected = '?a=1&amp;b=2'
    const pairs = readAmpersandEntities(value)

    expect(writeQuery(pairs)).toBe(expected)
  })

  it('should keep a question mark that opens the first pair', () => {
    const value = parseQuery('??a=1&amp;b=2')
    const expected = '??a=1&b=2'
    const pairs = readAmpersandEntities(value)

    expect(writeQuery(pairs)).toBe(expected)
  })
})

describe('toSearchParams', () => {
  it('should give the names and values the pairs decode to', () => {
    const value = parseQuery('?sort+by=a%20b&id=5')
    const expected: Array<[string, string]> = [
      ['sort by', 'a b'],
      ['id', '5'],
    ]
    const entries = [...toSearchParams(value)]

    expect(entries).toEqual(expected)
  })

  it('should keep a question mark that opens the first name', () => {
    const value = parseQuery('??page=2')
    const expected: Array<[string, string]> = [['?page', '2']]
    const entries = [...toSearchParams(value)]

    expect(entries).toEqual(expected)
  })

  it('should give no entry for an empty pair', () => {
    const value = parseQuery('?a=1&&')
    const expected: Array<[string, string]> = [['a', '1']]
    const entries = [...toSearchParams(value)]

    expect(entries).toEqual(expected)
  })
})

describe('decodeQueryValue', () => {
  it('should read + as a space', () => {
    const value = 'a+b'
    const expected = 'a b'

    expect(decodeQueryValue(value)).toBe(expected)
  })

  it('should keep an equals sign in a value', () => {
    const value = 'a=b'
    const expected = 'a=b'

    expect(decodeQueryValue(value)).toBe(expected)
  })

  it('should keep the spaces around a value', () => {
    const value = '%20a%20'
    const expected = ' a '

    expect(decodeQueryValue(value)).toBe(expected)
  })

  it('should return an empty string for an empty value', () => {
    const value = ''
    const expected = ''

    expect(decodeQueryValue(value)).toBe(expected)
  })
})

describe('cutHref', () => {
  it('should cut a URL into the text before its query, its query and its fragment', () => {
    const value = new URL('https://example.com/feed?alt=rss#top')
    const expected: HrefParts = {
      base: 'https://example.com/feed',
      search: '?alt=rss',
      hash: '#top',
    }

    expect(cutHref(value)).toEqual(expected)
  })

  it('should give an empty query for a URL without one', () => {
    const value = new URL('https://example.com/feed')
    const expected = ''
    const parts = cutHref(value)

    expect(parts.search).toBe(expected)
  })

  it('should give an empty fragment for a URL without one', () => {
    const value = new URL('https://example.com/feed?alt=rss')
    const expected = ''
    const parts = cutHref(value)

    expect(parts.hash).toBe(expected)
  })

  it('should keep a bare question mark as the query', () => {
    const value = new URL('https://example.com/feed?')
    const expected = '?'
    const parts = cutHref(value)

    expect(parts.search).toBe(expected)
  })

  it('should keep a bare fragment mark as the fragment', () => {
    const value = new URL('https://example.com/feed?alt=rss#')
    const expected = '#'
    const parts = cutHref(value)

    expect(parts.hash).toBe(expected)
  })

  it('should keep a second fragment mark in the fragment', () => {
    const value = new URL('https://example.com/feed?alt=rss#top#latest')
    const expected: HrefParts = {
      base: 'https://example.com/feed',
      search: '?alt=rss',
      hash: '#top#latest',
    }

    expect(cutHref(value)).toEqual(expected)
  })

  it('should leave a question mark inside the fragment in the fragment', () => {
    const value = new URL('https://example.com/feed#top?alt=rss')
    const expected: HrefParts = {
      base: 'https://example.com/feed',
      search: '',
      hash: '#top?alt=rss',
    }

    expect(cutHref(value)).toEqual(expected)
  })

  it('should keep credentials in the text before the query', () => {
    const value = new URL('https://alice:secret@example.com/feed?alt=rss')
    const expected = 'https://alice:secret@example.com/feed'
    const parts = cutHref(value)

    expect(parts.base).toBe(expected)
  })
})

import { composeQuery, decodePercent, isAnyOf } from 'trousse'

// One pair of a query: the text between two `&`, written back as it is.
export type QueryPair = {
  text: string
  // The text before the first `=` and the text behind it, undefined for a bare name such as `rss`.
  rawName: string
  rawValue?: string
  // The name as `decodeQueryValue` reads it. Two pairs under one name are one parameter given twice.
  name: string
}

// A URL's href cut once. `search` holds a bare `?` and `hash` a bare `#`, which the `search` and
// `hash` of a URL leave out.
export type HrefParts = {
  base: string
  search: string
  hash: string
}

// The query of a URL: its pairs, their names and values decoded, and the fragment as written, a
// bare `#` included.
export type UrlQuery = {
  pairs: Array<QueryPair>
  searchParams: URLSearchParams
  hash: string
}

// `&amp;` between two pairs leaves the second one behind `&` with this in front.
export const entityPrefix = 'amp;'

const leadingQuestionMarkRegex = /^\?/
const pairSeparatorRegex = /=(.*)/s
// A lone surrogate has no UTF-8 form and stays as given. A control character is no URL character,
// so it is encoded with the rest.
export const nonAsciiRegex = /[^\p{ASCII}\p{Cs}]+|\p{Cc}+/gu

export const cutHref = (url: URL): HrefParts => {
  const [beforeHash] = url.href.split('#', 1)
  const [base] = beforeHash.split('?', 1)

  return {
    base,
    search: beforeHash.slice(base.length),
    hash: url.href.slice(beforeHash.length),
  }
}

// The only escaper of what a row writes itself in a query, a name or the text of a value. It
// escapes what would change the URL's structure.
export const encodeText = (text: string): string => {
  const pair = composeQuery({ '': text })

  // Pages link a query value percent-encoded, as `?tag=%E6%8A%80%E8%A1%93` for `技術`.
  return pair.slice(pair.indexOf('=') + 1).replace(nonAsciiRegex, encodeURIComponent)
}

// The only decoder of a query name or value: a `+` is a space, and an escape that is no UTF-8
// stays as written, as a path keeps it.
export const decodeQueryValue = (value: string): string => {
  return decodePercent(value.replaceAll('+', ' '))
}

export const isNamed = (pair: QueryPair, names: string | Array<string>): boolean => {
  return isAnyOf(pair.name, names)
}

export const toPair = (text: string): QueryPair => {
  const [rawName, rawValue] = text.split(pairSeparatorRegex)

  return { text, rawName, rawValue, name: decodeQueryValue(rawName) }
}

// A pair written behind `&amp;`: it sits behind another pair and starts with `amp;`.
export const isEntityPair = (pair: QueryPair, index: number): boolean => {
  return index > 0 && pair.text.startsWith(entityPrefix)
}

// `&amp;` between two pairs read as `&`: the pair behind it loses its leading `amp;`.
export const readAmpersandEntities = (pairs: Array<QueryPair>): Array<QueryPair> => {
  return pairs.map((pair, index) => {
    if (!isEntityPair(pair, index)) {
      return pair
    }

    return toPair(pair.text.slice(entityPrefix.length))
  })
}

// `;` between two pairs read as `&`, as some servers split a query.
export const readSemicolons = (pairs: Array<QueryPair>): Array<QueryPair> => {
  return pairs.flatMap((pair) => pair.text.split(';').map(toPair))
}

// A pair that ends in `=` with a value written behind it, as `id=` and `5` give `id=5`.
export const appendValue = (pair: QueryPair, valueText: string): QueryPair => {
  return {
    ...pair,
    text: `${pair.text}${valueText}`,
    rawValue: `${pair.rawValue ?? ''}${valueText}`,
  }
}

// The only reader of a query. One leading `?` is dropped and a `#` ends the query. An empty pair
// stays in the list, so a bare `?` is one empty pair and no query is no pair.
export const parseQuery = (search: string): Array<QueryPair> => {
  if (!search) {
    return []
  }

  const [query] = search.split('#')

  return query.replace(leadingQuestionMarkRegex, '').split('&').map(toPair)
}

// The only writer of a query: the pairs as they are behind one `?`, and nothing for no pair.
export const writeQuery = (pairs: Array<QueryPair>): string => {
  if (pairs.length === 0) {
    return ''
  }

  return `?${pairs.map((pair) => pair.text).join('&')}`
}

// The names and values of the pairs, decoded. An empty pair holds neither.
export const toSearchParams = (pairs: Array<QueryPair>): URLSearchParams => {
  const searchParams = new URLSearchParams()

  for (const pair of pairs) {
    if (pair.text) {
      searchParams.append(pair.name, decodeQueryValue(pair.rawValue ?? ''))
    }
  }

  return searchParams
}

export const toUrlQuery = (pairs: Array<QueryPair>, hash: string): UrlQuery => {
  return { pairs, searchParams: toSearchParams(pairs), hash }
}

export const readUrlQuery = (url: URL): UrlQuery => {
  const { search, hash } = cutHref(url)

  return toUrlQuery(parseQuery(search), hash)
}

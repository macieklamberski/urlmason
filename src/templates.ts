import {
  decodePercent,
  encodePathSegment,
  escapeRegex,
  getQueryParamValues,
  isHttpUrl,
  isPlainObject,
  isString,
  omitEmpty,
  parseUrl,
  t,
} from 'trousse'
import locales from './locales.json' with { type: 'json' }
import {
  appendValue,
  encodeText,
  nonAsciiRegex,
  parseQuery,
  type QueryPair,
  sortPairs,
  toPair,
  toSearchParams,
  writeQuery,
} from './queries.js'
import type { UrlEncoding, UrlMap, UrlValue, UrlValues } from './types.js'

export type TemplatePart = 'host' | 'path' | 'query'

export type MapText = (text: string) => string

// The pattern of a value, and of one character of it where a value can sit behind fixed text.
export type Capture = {
  source: string
  unit?: string
  // The length a path segment holding two values or more is read up to.
  segmentMaxLength?: number
}

// A placeholder a pattern captures, with the part of the URL it sits in, and whether its value
// spans several path segments, as a list and the open tail do.
export type Captured = {
  name: string
  part: TemplatePart
  isList: boolean
}

// A parameter a template sets itself, as `alt=rss`, `id={id}` or the flag `rss`.
export type TemplateParam = {
  name: string
  value: string
  isFlag: boolean
  // The name as the template writes it, which a URL written as the template is spells the same way.
  writtenName: string
  // The pair as the template writes it: whole for a flag and a fixed value, `name=` where a value
  // fills it.
  pair: QueryPair
  isFilled: boolean
}

// A template read into its parts. Its text writes a list as `{/name*}` and the open tail as
// `{/tail*}`.
export type ParsedTemplate = {
  text: string
  scheme: string
  host: string
  // The path without the open tail.
  path: string
  // The query as written, with its question mark.
  search?: string
  isOpen: boolean
  // The placeholders but the open tail, a list as `name*`.
  names: Array<string>
  params: Array<TemplateParam>
}

export type CompiledParam = TemplateParam & {
  // The values the template takes, decoded, and the ones of a URL in its own spelling.
  regex: RegExp
  rawRegex: RegExp
}

export type CaptureIn = (part: TemplatePart) => (name: string, source: string) => string

export type CompiledTemplate = Omit<ParsedTemplate, 'params'> & {
  params: Array<CompiledParam>
  // The path matched on the decoded path without its trailing slash, with the open tail behind it
  // read as `tail`, and the path as the template writes it, for a URL read in its own spelling.
  readPathSource: string
  rawPathSource: string
  // Every placeholder is captured as `p{index}`, so a match is read back to its values.
  captureIn: CaptureIn
  getCaptured: (group: string) => Captured | undefined
  // The values of a match of the host and path, with the ones of the query, or undefined where the
  // query lacks a parameter the template sets.
  read: (
    groups: Record<string, string> | undefined,
    getSearchParams: () => URLSearchParams,
  ) => Record<string, UrlValue> | undefined
  // The value of each placeholder, or undefined where one has none.
  getValues: (params: UrlValues) => Record<string, UrlValue> | undefined
  // The URL the values of `getValues` write, or undefined where it is no URL.
  fill: (values: Record<string, UrlValue>, encoding?: UrlEncoding) => string | undefined
}

// A list holds the slash in front of it, `{/name*}`, which the name leaves out.
export const placeholderRegex = /\{\/?(\w+\*?)\}/g
export const trailingSlashRegex = /\/$/

// A host ends where a path, a query or a list starts, as `{host}{/base*}`.
const templateRegex =
  /^(https?|\{scheme\}):\/\/((?:[^/?#{]|\{[^/{}]*\})+)((?:\/|\{\/)[^?#]*)?(\?(?!\?)[^#]*)?$/i
const expressionRegex = /\{([^{}]*)\}/g
const braceRegex = /[{}]/
// An old spelling of a list and of the open tail, with the slash in front of the brace: `/{name*}`
// and `/{*}`. The slashes after the scheme are no path.
const oldListRegex = /(?<!\/)\/\{(\w*)\*\}/
// The old spellings of the open tail anywhere else and of a passed query.
const oldTail = '{*}'
const oldQuery = '?{query}'
// A value, and a list with its slash.
const plainExpressionRegex = /^(?:\w+|\/\w+\*)$/
const queryExpressionRegex = /^\?\w+\*$/
const strayPercentRegex = /%(?![0-9a-f]{2})/gi
// The characters `encodeURIComponent` leaves that RFC 6570 encodes outside the unreserved set.
const subDelimiterRegex = /[!'()*]/g
// A scheme and host with no path, where a parser reads the path `/` before a query.
const pathlessBaseRegex = /^[^/]+:\/\/[^/]+$/
const ownGroupRegex = /^p\d+$/
// A `.` or `..` segment is resolved away by a parser, so a URL holding one names another path.
export const dotSegmentRegex = /^(?:\.|%2e){1,2}$/i

// The characters that end a host in a URL.
const hostDelimiterRegex = /[/?#@\\]/

export const schemePlaceholder = '{scheme}'
// The folder a site sits in, `{/base*}` behind the host.
export const basePlaceholder = '{/base*}'
// The open tail: `{/tail*}` at the end of a path, which checks see as the value `tail`.
export const openTailName = 'tail'
export const openTailSuffix = '{/tail*}'

// The lists that may hold no segment: the folder and the open tail.
const emptyListNames = ['base*', `${openTailName}*`]
const captureGroupPrefix = 'p'
const multiSegmentCapture = '[^/]+(?:/[^/]+)*'
// Two values side by side make a pattern retry every split of the text they share, so a part of a
// URL holding two or more is read only up to this length. No real path segment comes near it.
export const sharedPartMaxLength = 1000
// A URL read as written spells a character of its decoded text in up to nine, as `%E2%80%A8`.
const writtenPartMaxLength = sharedPartMaxLength * 9

// A part of at most `maxLength` characters up to the end, or up to the next of the stops.
export const toLengthGuard = (maxLength: number, stops?: string): string => {
  if (!stops) {
    return `(?=[^]{0,${maxLength}}$)`
  }

  return `(?=[^${stops}]{0,${maxLength}}(?:[${stops}]|$))`
}

// A text split at its placeholders holds one between each two pieces of fixed text.
const countValues = (pieces: Array<string>): number => {
  return Math.floor(pieces.length / 2)
}

const pathCapture: Capture = {
  source: '[^/]+',
  unit: '[^/]',
  segmentMaxLength: sharedPartMaxLength,
}
const writtenPathCapture: Capture = { ...pathCapture, segmentMaxLength: writtenPartMaxLength }
const queryCapture: Capture = { source: '.+', unit: '.' }

export const isMultiSegment = (placeholder: string): boolean => {
  return placeholder.endsWith('*')
}

export const toBareName = (placeholder: string): string => {
  return isMultiSegment(placeholder) ? placeholder.slice(0, -1) : placeholder
}

const isEmptyList = (placeholder: string): boolean => {
  return emptyListNames.includes(placeholder)
}

// A path a list or a string of segments names, as `['forum']` or `/forum/`, without empty ones.
export const toSegments = (value: UrlValue | undefined): Array<string> => {
  if (isPlainObject(value)) {
    return []
  }

  return (isString(value) ? value.split('/') : (value ?? [])).filter((segment) => segment)
}

// A map as the names and values it holds, one after another, as `['lang', 'en']`.
const toMapItems = (map: UrlMap): Array<string> => {
  return Object.entries(map).flat()
}

// A list is one or more segments, and `base` and `tail` zero or more. An empty segment is dropped,
// as a doubled slash names the same page, and any other list with no segment left is no value. A
// string is read as segments joined by `/`, and a list is no value of a placeholder of one segment.
const getPlaceholderValue = (params: UrlValues, placeholder: string): UrlValue | undefined => {
  const value = params[toBareName(placeholder)]

  // A map with no name is no value, as a list with no item.
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) {
      return
    }

    return value
  }

  // A list in a slot of one value is written as its items joined by commas, without empty ones, as
  // a list slot drops them, and no item left is no value.
  if (!isMultiSegment(placeholder)) {
    return Array.isArray(value) ? omitEmpty(value) : value
  }

  const segments = toSegments(value)

  if (segments.length === 0 && !isEmptyList(placeholder)) {
    return
  }

  return segments
}

// A path with the slash of each list moved in front of its brace, `/{name*}`, so it splits into
// its segments at every slash.
export const splitPath = (path: string): Array<string> => {
  return path.replaceAll('{/', '/{').split('/')
}

// A value as text, as a check sees it: a list as its segments joined by `/`.
export const toValueText = (value: UrlValue): string => {
  if (isPlainObject(value)) {
    return toMapItems(value).join(',')
  }

  return Array.isArray(value) ? value.join('/') : value
}

// A value with its valid escapes decoded, so `Hello%21` and `Hello!` are one value. A `%` that
// starts no escape stays as it is. A value that is no text past the types, as `true`, is its text.
const decodeEscapes = (value: string): string => {
  return decodePercent(String(value))
}

// A path value as pages link it: its escapes decoded, then every character a path segment allows
// kept, a `%` written as `%25` and non-ASCII percent-encoded, so `caf%C3%A9` and `café` agree.
const encodePathValue = (value: string): string => {
  return encodePathSegment(decodeEscapes(value).replaceAll('%', '%25'))
    .replace(strayPercentRegex, '%25')
    .replace(nonAsciiRegex, encodeURIComponent)
}

// A query value with its escapes decoded, then written as any query value.
const encodeQueryValue = (value: string): string => {
  return encodeText(decodeEscapes(value))
}

// Values next to each other are encoded as one text, so a surrogate pair split across them is
// written whole. A list's items are joined by commas and their own commas written as `%2C`, so
// the separators stay apart from them.
const fillQueryValue = (
  template: string,
  values: Record<string, UrlValue>,
  encodeValue: (text: string) => string,
): string => {
  const runs: Array<QueryRun> = []
  const push = (text: string, kind: QueryRun['kind']) => {
    const last = runs.at(-1)

    if (last && last.kind === kind && kind !== 'separator') {
      last.text += text

      return
    }

    runs.push({ text, kind })
  }

  for (const [index, piece] of template.split(placeholderRegex).entries()) {
    if (index % 2 === 0) {
      if (piece) {
        push(piece, 'literal')
      }

      continue
    }

    const value = values[piece]
    const items = isPlainObject(value) ? toMapItems(value) : value

    if (!Array.isArray(items)) {
      push(String(items), 'value')

      continue
    }

    for (const [itemIndex, item] of items.entries()) {
      if (itemIndex > 0) {
        push(',', 'separator')
      }

      for (const [partIndex, part] of item.split(',').entries()) {
        if (partIndex > 0) {
          push('%2C', 'separator')
        }

        push(part, 'value')
      }
    }
  }

  return runs
    .map((run) => {
      if (run.kind === 'separator') {
        return run.text
      }

      return run.kind === 'literal' ? encodeText(run.text) : encodeValue(run.text)
    })
    .join('')
}

// A value in a slot of one value, as `{id}`. A list is its items joined by commas, each item's own
// commas encoded, so the separators stay apart from them.
const encodeSlot = (value: UrlValue, encode: (value: string) => string): string => {
  const items = isPlainObject(value) ? toMapItems(value) : value

  if (!Array.isArray(items)) {
    return encode(items)
  }

  return items.map((item) => encode(item).replaceAll(',', '%2C')).join(',')
}

// A map in a list slot, one `name=value` segment per name.
const encodeMapSegments = (map: UrlMap, encode: (value: string) => string): string => {
  return Object.entries(map)
    .map(([name, value]) => `${encode(name)}=${encode(value)}`)
    .join('/')
}

const encodePath = (value: string | Array<string>): string => {
  return Array.isArray(value) ? value.map(encodePathValue).join('/') : encodePathValue(value)
}

export const encodeLiteral = (text: string): string => {
  return text.replace(nonAsciiRegex, encodeURIComponent)
}

const toPercentEscape = (character: string): string => {
  return `%${character.charCodeAt(0).toString(16).toUpperCase()}`
}

// A value as RFC 6570 writes it: every character outside the unreserved set encoded, `%` too.
const encodeStrictValue = (value: string): string => {
  return encodeURIComponent(value).replace(subDelimiterRegex, toPercentEscape)
}

type QueryRun = {
  text: string
  kind: 'literal' | 'value' | 'separator'
}

// A URL in its parts: the origin, the path, the query with its `?` and the fragment with its `#`.
const urlPartsRegex = /^([^:/?#]+:\/\/[^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/

// A query name or value spelled strictly. A `+` stays, since a server may read it as a space.
const encodeStrictQueryText = (text: string): string => {
  return text
    .split('+')
    .map((piece) => encodeStrictValue(decodePercent(piece)))
    .join('+')
}

// A URL with every path segment and query name and value spelled as RFC 6570 writes a value, so
// any spelling of one URL gives one string. The origin and the fragment stay as given.
export const toStrictUrl = (url: string): string => {
  const match = urlPartsRegex.exec(url)

  if (!match) {
    return url
  }

  const [, origin, path, query = '', fragment = ''] = match
  const strictPath = path
    .split('/')
    .map((segment) => encodeStrictValue(decodePercent(segment)))
    .join('/')
  const strictQuery = query
    .slice(1)
    .split('&')
    .map((pair) => pair.split('=').map(encodeStrictQueryText).join('='))
    .join('&')

  return `${origin}${strictPath}${query ? `?${strictQuery}` : ''}${fragment}`
}

const encodeStrict = (value: string | Array<string>): string => {
  return Array.isArray(value) ? value.map(encodeStrictValue).join('/') : encodeStrictValue(value)
}

// A path decoded segment by segment, so `%40` and `@` compare equal. A decoded `%` and `/` are
// written back as `%25` and `%2F`, so `%252F` stays apart from `%2F` and no segment splits.
export const decodePath = (path: string): string => {
  if (!path.includes('%')) {
    return path
  }

  return path
    .split('/')
    .map((segment) => decodePercent(segment).replaceAll('%', '%25').replaceAll('/', '%2F'))
    .join('/')
}

// A query on a host with no path sits behind the slash of its root, as `example.com/?rss`.
export const writeBase = (base: string, pairs: Array<QueryPair>): string => {
  return pairs.length > 0 && pathlessBaseRegex.test(base) ? `${base}/` : base
}

// A template text with each placeholder and each piece of text around one written anew. A list
// holds the slash in front of it, so a list written as nothing leaves out the slash too.
export const mapTemplate = (
  text: string,
  mapPlaceholder: MapText,
  mapLiteral: MapText = (literal) => literal,
): string => {
  return text
    .split(placeholderRegex)
    .map((piece, index) => {
      if (index % 2 === 0) {
        return mapLiteral(piece)
      }

      const value = mapPlaceholder(piece)

      return isMultiSegment(piece) && value ? `/${value}` : value
    })
    .join('')
}

// A value behind another value and fixed text never holds that text with more of the value after
// it: the value in front takes all it can. A pattern that says so reads a long run of the fixed
// text once, where one that does not tries every split of it.
const toLaterSource = ({ unit }: Capture, separator: string): string | undefined => {
  // The value in front can only take fixed text it can hold, as text without a slash in a path.
  if (!unit || !new RegExp(`^(?:${unit})+$`).test(separator)) {
    return
  }

  // Text free of the fixed text, then an end no longer than it, which can be the fixed text.
  return `(?:(?!${escapeRegex(separator)})${unit})*${unit}{1,${separator.length}}`
}

// A placeholder becomes the capture, the text around it a literal, decoded for a path so an
// encoded brace in it stays a literal, and encoded for a raw query value as the template writes it.
export const toRegexSource = (
  text: string,
  wrapCapture: (name: string, source: string) => string,
  capture: Capture,
  captures: Record<string, string> = {},
  mapLiteral: MapText = (literal) => literal,
  patterns: Record<string, string> = {},
): string => {
  const pieces = text
    .split(placeholderRegex)
    .map((piece, index) => (index % 2 === 1 ? piece : mapLiteral(piece)))

  // The values of the segment that starts in a piece of fixed text, up to the next slash or list.
  const countSegmentValues = (index: number): number => {
    const end = pieces.findIndex((piece, later) => {
      return later > index && (later % 2 === 0 ? piece.includes('/') : isMultiSegment(piece))
    })

    return countValues(pieces.slice(index, end === -1 ? undefined : end))
  }

  return pieces
    .map((piece, index) => {
      if (index % 2 === 0) {
        const slash = piece.lastIndexOf('/')

        if (!capture.segmentMaxLength || slash === -1 || countSegmentValues(index) < 2) {
          return escapeRegex(piece)
        }

        const head = escapeRegex(piece.slice(0, slash + 1))
        const tail = escapeRegex(piece.slice(slash + 1))

        return `${head}${toLengthGuard(capture.segmentMaxLength, '/')}${tail}`
      }

      const frontPattern = index > 1 ? patterns[pieces[index - 2]] : undefined
      // A value in front that its pattern ends before the fixed text leaves the rest to this one.
      const isFreed =
        frontPattern !== undefined && !new RegExp(`^${frontPattern}$`, 'i').test(pieces[index - 1])
      const laterSource =
        index > 1 && !isFreed ? toLaterSource(capture, pieces[index - 1]) : undefined

      const source = wrapCapture(
        piece,
        captures[piece] ?? patterns[piece] ?? laterSource ?? capture.source,
      )

      // A list holds the slash in front of it, so a list that may be empty leaves out both.
      if (!isMultiSegment(piece)) {
        return source
      }

      return isEmptyList(piece) ? `(?:/${source})?` : `/${source}`
    })
    .join('')
}

// An old spelling is refused with the one that replaces it, a passed query as one no template
// takes, and any operator or modifier but a list with its slash.
const checkExpressions = (template: string): void => {
  const throwOldSpelling = (expression: string, spelling: string): never => {
    throw new Error(t(locales.errors.oldTemplateSpelling, { template, expression, spelling }))
  }
  const oldList = oldListRegex.exec(template)

  if (oldList) {
    throwOldSpelling(oldList[0], `{/${oldList[1] || openTailName}*}`)
  }

  // A passed query is no part of the core yet, so its old spelling names no new one.
  if (template.includes(oldQuery)) {
    throw new Error(t(locales.errors.unsupportedPassedQuery, { template, expression: oldQuery }))
  }

  // A brace left once every expression is taken out opens or closes nothing, as `{/id*`.
  if (braceRegex.test(template.replace(expressionRegex, ''))) {
    throw new Error(t(locales.errors.unbalancedBrace, { template }))
  }

  for (const [expression, body] of template.matchAll(expressionRegex)) {
    if (expression === oldTail) {
      throwOldSpelling(oldTail, openTailSuffix)
    }

    if (plainExpressionRegex.test(body)) {
      continue
    }

    // A passed query is no part of the core, so `{?query*}` is refused.
    if (queryExpressionRegex.test(body)) {
      throw new Error(t(locales.errors.invalidTemplate, { template }))
    }

    throw new Error(t(locales.errors.unsupportedTemplateExpression, { template, expression }))
  }
}

// A template as its scheme, host, path and query parameters.
export const parseTemplate = (template: string): ParsedTemplate => {
  checkExpressions(template)

  const match = templateRegex.exec(template)

  if (!match) {
    throw new Error(t(locales.errors.invalidTemplate, { template }))
  }

  const [, scheme, host, givenPath = '', search] = match
  const isOpen = givenPath.endsWith(openTailSuffix)
  const entries = search ? [...toSearchParams(parseQuery(search))] : []

  // A placeholder fills a value and never names a parameter, as `?{name}` or `?%7Bname%7D`.
  if (entries.some(([name]) => name.includes('{'))) {
    throw new Error(t(locales.errors.invalidTemplate, { template }))
  }

  // A name with no value, such as `?rss`, is a flag, built with no value.
  const flagNames = entries.filter(([, value]) => !value).map(([name]) => name)
  const params = entries.map(([name, value]): TemplateParam => {
    const isFlag = flagNames.includes(name)
    const isFilled = !isFlag && value.includes('{')
    const writtenName = encodeText(name)
    const writtenValue = isFilled ? '' : encodeText(value)
    const param: TemplateParam = {
      name,
      value,
      isFlag,
      writtenName,
      pair: toPair(isFlag ? writtenName : `${writtenName}=${writtenValue}`),
      isFilled,
    }

    return param
  })
  const paramNames = params.map((param) => param.name)

  // A parameter the template names twice, as `types=page&types=post`, has no one value to read.
  if (paramNames.some((name, index) => paramNames.indexOf(name) !== index)) {
    throw new Error(t(locales.errors.invalidTemplate, { template }))
  }

  const path = isOpen ? givenPath.slice(0, -openTailSuffix.length) : givenPath

  return {
    text: template,
    scheme,
    host,
    path,
    search,
    isOpen,
    names: [...`${scheme}${host}${path}${search ?? ''}`.matchAll(placeholderRegex)].map(
      ([, name]) => name,
    ),
    params,
  }
}

// A parsed template as the patterns that read a URL and the function that writes one. A value of
// two in one path segment whose check is a pattern is read by that pattern, as `pathPatterns`
// gives it.
export const compileTemplate = (
  parsed: ParsedTemplate,
  pathPatterns: Record<string, string> = {},
): CompiledTemplate => {
  const { scheme, host, path, isOpen, names } = parsed
  const captured: Array<Captured> = []
  const captureIn: CaptureIn = (part) => {
    return (name, source) => {
      captured.push({
        name: toBareName(name),
        part,
        isList: part === 'path' && isMultiSegment(name),
      })

      return `(?<${captureGroupPrefix}${captured.length - 1}>${source})`
    }
  }
  // A host pattern can hold a named group of its own, which is no value of the template.
  const getCaptured = (group: string): Captured | undefined => {
    if (!ownGroupRegex.test(group)) {
      return
    }

    return captured[Number(group.slice(captureGroupPrefix.length))]
  }
  const params = parsed.params.map((param): CompiledParam => {
    const source = toRegexSource(param.value, captureIn('query'), queryCapture)
    const rawSource = toRegexSource(param.value, captureIn('query'), queryCapture, {}, encodeText)
    const isShared = countValues(param.value.split(placeholderRegex)) > 1
    const guard = isShared ? toLengthGuard(sharedPartMaxLength) : ''
    const rawGuard = isShared ? toLengthGuard(writtenPartMaxLength) : ''

    return {
      ...param,
      regex: new RegExp(`^${guard}${source}$`, 'i'),
      rawRegex: new RegExp(`^${rawGuard}${rawSource}$`, 'd'),
    }
  })
  const multiSegmentCaptures = Object.fromEntries(
    names.filter(isMultiSegment).map((name) => [name, multiSegmentCapture]),
  )
  // Two lists share the whole path.
  const hasTwoLists = names.filter(isMultiSegment).length > 1
  const pathGuard = hasTwoLists ? toLengthGuard(sharedPartMaxLength) : ''
  const rawPathGuard = hasTwoLists ? toLengthGuard(writtenPartMaxLength) : ''
  const pathSource = toRegexSource(
    path.replace(trailingSlashRegex, ''),
    captureIn('path'),
    pathCapture,
    multiSegmentCaptures,
    decodePath,
    pathPatterns,
  )
  // A template with no path is a site, which a URL names with or without the slash of its root.
  const rawPathSource = path
    ? toRegexSource(
        path,
        captureIn('path'),
        writtenPathCapture,
        multiSegmentCaptures,
        encodeLiteral,
        pathPatterns,
      )
    : '/?'
  // An open tail is every segment behind the path, an empty one included, as pages link them.
  const readPathSource = isOpen
    ? `${pathGuard}${pathSource}(?:/${captureIn('path')(`${openTailName}*`, '.*')})?`
    : `${pathGuard}${pathSource}`

  // A name the template holds twice keeps the first value read.
  const readGroups = (values: Record<string, UrlValue>, groups: Record<string, string> = {}) => {
    for (const [group, value] of Object.entries(groups)) {
      const groupCaptured = getCaptured(group)

      // A list that may be empty and holds no segment leaves its group unset.
      if (!groupCaptured || value === undefined || values[groupCaptured.name] !== undefined) {
        continue
      }

      if (groupCaptured.part !== 'path') {
        values[groupCaptured.name] = value

        continue
      }

      // The path is matched with a decoded `%` and `/` written as `%25` and `%2F`, so a value
      // decodes once more to `100%` and `a/b`, and a list is cut at the slashes left.
      values[groupCaptured.name] = groupCaptured.isList
        ? value
            .split('/')
            .filter((segment) => segment)
            .map(decodePercent)
        : decodePercent(value)
    }
  }

  const read: CompiledTemplate['read'] = (groups, getSearchParams) => {
    const values: Record<string, UrlValue> = {}

    readGroups(values, groups)

    // A tail is read as a list: without its empty segments, and one with no segment left, as after
    // a doubled slash, is no value.
    if (isOpen && !values[openTailName]?.length) {
      delete values[openTailName]
    }

    for (const { name, isFlag, regex } of params) {
      const [value] = getQueryParamValues(getSearchParams(), name, { preserveEmptyValues: isFlag })

      if (value === undefined) {
        return
      }

      const queryMatch = regex.exec(value)

      if (!queryMatch) {
        return
      }

      readGroups(values, queryMatch.groups)
    }

    return values
  }

  // An empty value is no value: a host label or path segment left empty builds a broken URL, as
  // `/t//feed`, and a query value left empty a feed the page does not name, as `?videoChannelId=`.
  const getValues: CompiledTemplate['getValues'] = (givenParams) => {
    const values: Record<string, UrlValue> = {}

    for (const name of names) {
      const value = getPlaceholderValue(givenParams, name)

      if (!value) {
        return
      }

      values[name] = value
    }

    return values
  }

  // Non-ASCII fixed text is written percent-encoded, as any URL carries it.
  const writtenPath = encodeLiteral(path)
  const fill: CompiledTemplate['fill'] = (values, encoding = 'pretty') => {
    const isStrict = encoding === 'strict'
    const fillPlaceholders = (
      text: string,
      encode: (value: string | Array<string>) => string = toValueText,
    ) => {
      return text.replace(placeholderRegex, (_placeholder, name: string) => {
        const value = values[name]

        // A list holds the slash in front of it, so a list of no segment writes nothing.
        if (!isMultiSegment(name)) {
          return encodeSlot(value, encode)
        }

        if (isPlainObject(value)) {
          return `/${encodeMapSegments(value, isStrict ? encodeStrictValue : encodePathValue)}`
        }

        return value.length > 0 ? `/${encode(value)}` : ''
      })
    }
    const pairs: Array<QueryPair> = []

    for (const own of params) {
      if (!own.isFilled) {
        pairs.push(own.pair)

        continue
      }

      const text = fillQueryValue(
        own.value,
        values,
        isStrict ? encodeStrictValue : encodeQueryValue,
      )

      pairs.push(appendValue(own.pair, text))
    }

    // A host reads in any case, so a value that fills a host label is written in lowercase.
    const filledHost = fillPlaceholders(host).toLowerCase()

    // A value carried into a host from a path, as `a/b`, would move the URL to another host that
    // still parses, so a delimiter there builds nothing.
    if (hostDelimiterRegex.test(filledHost)) {
      return
    }

    const filledScheme = fillPlaceholders(scheme)
    const filledPath = fillPlaceholders(writtenPath, isStrict ? encodeStrict : encodePath)

    if (filledPath.split('/').some((segment) => dotSegmentRegex.test(segment))) {
      return
    }

    const base = writeBase(`${filledScheme}://${filledHost}${filledPath}`, pairs)
    const url = `${base}${writeQuery(sortPairs(pairs))}`
    const parsedUrl = parseUrl(url)

    // A scheme or host value can move the URL to another scheme or host that still parses, as the
    // scheme `https://evil.example/x?`, and a host value can hold a space no URL takes.
    // biome-ignore lint/plugin: the host holds its port, which isHostOf leaves out.
    if (!parsedUrl || !isHttpUrl(parsedUrl) || parsedUrl.host !== filledHost) {
      return
    }

    if (parsedUrl.protocol !== `${filledScheme.toLowerCase()}:`) {
      return
    }

    return url
  }

  return {
    ...parsed,
    params,
    readPathSource,
    rawPathSource: `${rawPathGuard}${rawPathSource}`,
    captureIn,
    getCaptured,
    read,
    getValues,
    fill,
  }
}

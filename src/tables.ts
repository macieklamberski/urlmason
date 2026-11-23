import {
  decodePercent,
  encodePathSegment,
  escapeRegex,
  getOrigin,
  getQueryParamValues,
  getRegistrableDomain,
  getSubdomain,
  isAnyOf,
  isFunction,
  isHttpUrl,
  isNullish,
  isPresent,
  isSameText,
  isString,
  parseUrl,
  startsWithAnyOf,
  stripWww,
  t,
  trimObject,
} from 'trousse'
import locales from '../locales.json' with { type: 'json' }
import type {
  UrlLenient,
  UrlMatch,
  UrlParams,
  UrlReadOptions,
  UrlRow,
  UrlTable,
  UrlTableOptions,
} from '../types.js'
import {
  appendValue,
  decodeQueryValue,
  encodeText,
  entityPrefix,
  isEntityPair,
  nonAsciiRegex,
  parseQuery,
  type QueryPair,
  readAmpersandEntities,
  readUrlQuery,
  sortPairs,
  toPair,
  toSearchParams,
  toUrlQuery,
  type UrlQuery,
  writeQuery,
} from './queries.js'

// One URL of a row: its main one or an alias.
type CompiledTemplate = {
  rowIndex: number
  isAlias: boolean
  // The query parameters the template sets itself, and the placeholders that take a passed query.
  ownNames: Array<string>
  passedQueryNames: Array<string>
  // The placeholders of the host, which a URL reads in any case.
  hostNames: Array<string>
  // The parameters the template sets to a fixed value, as `alt=rss`, and the ones it reads a
  // value from, as `id={id}`.
  fixedQuery: Array<[name: string, value: string]>
  valueNames: Array<string>
  // A flag written with an equals sign and no value, as `xml=`, which is the flag.
  flagTexts: Array<string>
  // A pair under an own name as the row names it, in the spelling the row builds it with.
  getWrittenText: (pair: QueryPair) => string
  // The host and path a URL the template takes matches, as given and with an optional `www`.
  asGivenRegex: RegExp
  optionalWwwRegex: RegExp
  // The values of a URL the template takes, read as given or with an optional `www`.
  readParams: (tableUrl: TableUrl, isWwwOptional: boolean) => Record<string, string> | undefined
  // The values of a URL in the spelling it has, read only from a URL written as the template is:
  // the same case, the same trailing slash, each own parameter once and under its own name. A
  // spelling a mark covers is read in the template's, with the path and the pairs written that way.
  readRawParams: (
    tableUrl: TableUrl,
    isWwwOptional: boolean,
    params: Record<string, string>,
  ) => RawRead | undefined
  // Whether the trailing slash mark writes the path with another trailing slash, and whether the
  // template takes a host and decoded path with the trailing slash the path has.
  isSlashRespelled: (pathname: string) => boolean
  takesSlashedHostPath: (hostPath: string, isWwwOptional: boolean) => boolean
  // Whether the ampersand mark covers the template, so `&amp;` in a query is read as `&`.
  isAmpersandEntityRead: boolean
  // The template's URL with values written as they were read, and the pairs no row names kept.
  getRawUrl: (rawParams: RawParams, keptPairs: Array<QueryPair>) => RawUrl | undefined
  // The origin of a template that writes `https` itself, with the host values as the URL has them.
  getHttpsOrigin: (rawParams: RawParams) => string | undefined
  passesChecks: (params: Record<string, string>) => boolean
  // The host, the path and the own parameter names with every value left out, and whether the
  // path has an open tail. Two templates of one shape differ only in their values, as two rows
  // for two values of `format`.
  shape: string
  // The path segments in front of an open tail, and infinity for a template without one.
  openDepth: number
  getUrl: (params?: UrlParams) => string | typeof refusedQuery | undefined
}

type UrlPart = 'host' | 'path' | 'query'

type MapText = (text: string) => string

// A check of the table gets the value alone, and one of a row the values read beside it.
type CheckFunction<Rest extends Array<unknown> = []> = (value: string, ...rest: Rest) => boolean

type RowCheckFunction = CheckFunction<[params: Record<string, string>]>

// The pattern of a value, and of one character of it where a value can sit behind fixed text.
type Capture = {
  source: string
  unit?: string
}

// A placeholder a pattern captures, with the part of the URL it sits in.
type Captured = {
  name: string
  part: UrlPart
}

// A parameter a template sets itself, as `alt=rss`, `id={id}` or the flag `rss`.
type OwnParam = {
  name: string
  value: string
  isFlag: boolean
  // The name as the row writes it, which a URL written as the row is spells the same way.
  writtenName: string
  // The pair as the row writes it: whole for a flag and a fixed value, `name=` where a value
  // fills it.
  pair: QueryPair
  isFilled: boolean
  // The values the template takes, decoded, and the ones of a URL in its own spelling.
  regex: RegExp
  rawRegex: RegExp
}

// One parameter of a template's query in the order written: its own, or a passed query.
type TemplateParam =
  | { own: OwnParam; passedName?: undefined }
  | { own?: undefined; passedName: string }

// A value as the URL spells it, with the part of the URL it was read from.
type RawParams = Record<string, { value: string; part: UrlPart }>

// A URL read in its own spelling: its values, and its path and pairs as the template writes them.
type RawRead = {
  params: RawParams
  pathname: string
  pairs: Array<QueryPair>
}

// A URL a template writes from raw values, before its query: the pairs are written sorted.
type RawUrl = {
  base: string
  pairs: Array<QueryPair>
}

// A URL as the templates read it: the host joined to the decoded path, without its trailing slash
// and with it, and the query, parsed by the first template that takes the host and path.
type TableUrl = {
  url: URL
  hostPath: string
  slashedHostPath: string
  query?: UrlQuery
}

const templateRegex = /^(https?|\{scheme\}):\/\/([^/?#]+)(\/[^?#]*)?(\?(?!\?)[^#]*)?$/i
const placeholderRegex = /\{(\w+\*?)\}/g
const trailingSlashRegex = /\/$/
const strayPercentRegex = /%(?![0-9a-f]{2})/gi
const leadingSlashesRegex = /^\/{2,}/
const anchorsRegex = /^\^|\$$/g
const passedQueryRegex = /^\{(\w+)\}$/
// A value every part of a URL reads the same way, so it can move from one part to another.
const plainValueRegex = /^[\w.~-]+$/
const dotSegmentRegex = /^(?:\.|%2e){1,2}$/i
const captureRegex = /\(\?<p\d+>/g
const escapeSplitRegex = /(%[0-9a-f]{2})/i
// A URL parser removes a tab, a line feed and a carriage return, so `I\nD` is fetched as `ID`.
const parserRemovedRegex = /[\t\n\r]/
// A scheme and host with no path, where a parser reads the path `/` before a query.
const pathlessBaseRegex = /^[^/]+:\/\/[^/]+$/
const trailingSlashesRegex = /\/+$/
const fixedPathTextRegex = /[^/]/

const rootPlaceholder = '{root}'
// The host a `{root}` row is read on under a root, with the path behind the root as its path.
const standInOrigin = 'https://root.invalid'
// An install sits at most a few segments deep, and each root tried is one more pass over the URL.
const maxBasePathSegments = 8
const schemePlaceholder = '{scheme}'
const captureGroupPrefix = 'p'
const ownGroupRegex = /^p\d+$/
const multiSegmentCapture = '[^/]+(?:/[^/]+)*'
// The open tail: `{*}` behind the last slash of a path, read as the value `tail`.
const openTailMark = '{*}'
const openTailSuffix = `/${openTailMark}`
const openTailName = 'tail'
const pathCapture: Capture = { source: '[^/]+', unit: '[^/]' }
const queryCapture: Capture = { source: '.+', unit: '.' }
// What a template builds from values that fill it and a passed query it cannot write.
const refusedQuery = Symbol('refusedQuery')

// A pair is under a name as `URLSearchParams` reads it, or with an escape that is no UTF-8 as
// written, which is how some servers read it.
const isNamed = (pair: QueryPair, names: string | Array<string>): boolean => {
  return isAnyOf(pair.name, names) || isAnyOf(pair.sortName, names)
}

// A placeholder in a template's shape: its name left out, its reach over several segments kept.
const toShapePlaceholder = (_: string, name: string): string => {
  return name.endsWith('*') ? '{*}' : '{}'
}

const isMultiSegment = (placeholder: string): boolean => {
  return placeholder.endsWith('*')
}

const toBareName = (placeholder: string): string => {
  return isMultiSegment(placeholder) ? placeholder.slice(0, -1) : placeholder
}

// A value in lowercase, with its percent escapes as written.
const toLowerCaseValue = (value: string): string => {
  return value
    .split(escapeSplitRegex)
    .map((piece, index) => (index % 2 === 1 ? piece : piece.toLowerCase()))
    .join('')
}

// A `{name*}` value is one or more segments joined by `/`. An empty segment is dropped, as a
// doubled slash names the same page, and a value with no segment left is no value.
const getPlaceholderValue = (params: UrlParams, placeholder: string): string | undefined => {
  if (!isMultiSegment(placeholder)) {
    return params[placeholder]
  }

  const segments = params[placeholder.slice(0, -1)]?.split('/').filter((segment) => segment)

  if (!segments?.length) {
    return
  }

  return segments.join('/')
}

// A path value as pages link it: a `%` that starts no escape becomes `%25` and non-ASCII is
// percent-encoded, while a valid escape keeps its spelling, so no value is encoded twice.
const encodePathValue = (value: string): string => {
  return encodePathSegment(value)
    .replace(strayPercentRegex, '%25')
    .replace(nonAsciiRegex, encodeURIComponent)
}

const encodePath = (value: string, placeholder: string): string => {
  if (!isMultiSegment(placeholder)) {
    return encodePathValue(value)
  }

  return value.split('/').map(encodePathValue).join('/')
}

// A path decoded segment by segment, so `%40` and `@` compare equal. A decoded `%` and `/` are
// written back as `%25` and `%2F`, so `%252F` stays apart from `%2F` and no segment splits.
const decodePath = (path: string): string => {
  if (!path.includes('%')) {
    return path
  }

  return path
    .split('/')
    .map((segment) => decodePercent(segment).replaceAll('%', '%25').replaceAll('/', '%2F'))
    .join('/')
}

const portRegex = /:\d+$/

// Whether the path behind `{root}` holds fixed text, as `viewtopic.php`, which shows where the
// root ends. A path of values alone fits behind a root of any length.
const hasFixedPath = (template: string): boolean => {
  const [path] = template.slice(rootPlaceholder.length).split('?')

  return fixedPathTextRegex.test(path.replace(placeholderRegex, '').replace(openTailMark, ''))
}

// Every check as a function. A pattern with a `g` or `y` flag answers differently on a second
// call, and one without both anchors takes a value that only holds a match.
const toCheckFunctions = <Rest extends Array<unknown>>(
  checks: Record<string, CheckFunction<Rest> | RegExp> = {},
): Record<string, CheckFunction<Rest>> => {
  const functions: Record<string, CheckFunction<Rest>> = {}

  for (const [name, check] of Object.entries(checks)) {
    if (isFunction(check)) {
      functions[name] = check

      continue
    }

    if (check.global || check.sticky) {
      throw new Error(t(locales.errors.statefulCheckRegex, { name }))
    }

    if (!check.source.startsWith('^') || !check.source.endsWith('$')) {
      throw new Error(t(locales.errors.unanchoredCheckRegex, { name }))
    }

    functions[name] = (value, ..._rest) => check.test(value)
  }

  const hostCheck = functions.host

  // A host is read with its port, which names no other host, so its check sees the host alone.
  if (hostCheck) {
    functions.host = (value, ...rest) => hostCheck(value.replace(portRegex, ''), ...rest)
  }

  return functions
}

// A row the table keeps to itself, so an edit of a row given, returned or selected changes no read.
const copyRow = <Row extends UrlRow>(row: Row): Row => {
  const copy = { ...row }

  if (row.keptParams) {
    copy.keptParams = [...row.keptParams]
  }

  if (row.checks) {
    copy.checks = { ...row.checks }
  }

  return copy
}

const toTableUrl = (url: URL): TableUrl => {
  // A doubled slash after the host names the same feed: pages link `host//feed` for `host/feed`.
  const path = url.pathname.replace(leadingSlashesRegex, '/')
  const slashedHostPath = url.hostname + decodePath(path)

  return {
    url,
    hostPath: slashedHostPath.replace(trailingSlashRegex, ''),
    slashedHostPath,
  }
}

// The query of a URL, parsed once: a URL no template takes the host and path of is never parsed.
const readQuery = (tableUrl: TableUrl): UrlQuery => {
  if (!tableUrl.query) {
    tableUrl.query = readUrlQuery(tableUrl.url)
  }

  return tableUrl.query
}

// Every table is asked about the same URL in turn, so the last URL read is kept for the next one.
let lastTableUrl: { url: string; tableUrl: TableUrl | undefined } | undefined

const readTableUrl = (url: string): TableUrl | undefined => {
  if (lastTableUrl?.url === url) {
    return lastTableUrl.tableUrl
  }

  const parsedUrl = parseUrl(url)
  const tableUrl = parsedUrl && isHttpUrl(parsedUrl) ? toTableUrl(parsedUrl) : undefined

  lastTableUrl = { url, tableUrl }

  return tableUrl
}

// The root a URL is being read under, which the rows on the stand-in host hand to their checks.
let readRoot: string | undefined

// One pattern any of the patterns matches, so a table reads a URL on none of its rows at once.
const joinRegexes = (regexes: Array<RegExp>): RegExp => {
  // A capture is named, and a name may appear once in a pattern.
  const sources = regexes.map((regex) => `(?:${regex.source.replace(captureRegex, '(?:')})`)

  return new RegExp(sources.join('|') || '(?!)', 'i')
}

// A host or domain entry as a regex source: a string as a literal, a pattern without its anchors.
const toEntrySource = (entry: string | RegExp): string => {
  return isString(entry) ? escapeRegex(entry) : `(?:${entry.source.replace(anchorsRegex, '')})`
}

// A host that is its own registrable domain, as `example.com` and not `blog.example.com`.
const isApexHost = (host: string): boolean => {
  return getRegistrableDomain(`https://${host}`) === host
}

// A template text with each placeholder and each piece of text around one written anew.
const mapTemplate = (
  text: string,
  mapPlaceholder: MapText,
  mapLiteral: MapText = (literal) => literal,
): string => {
  return text
    .split(placeholderRegex)
    .map((piece, index) => (index % 2 === 1 ? mapPlaceholder(piece) : mapLiteral(piece)))
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
// encoded brace in it stays a literal, and encoded for a raw query value as the row writes it.
const toRegexSource = (
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

  return pieces
    .map((piece, index) => {
      if (index % 2 === 0) {
        return escapeRegex(piece)
      }

      const frontPattern = index > 1 ? patterns[pieces[index - 2]] : undefined
      // A value in front that its pattern ends before the fixed text leaves the rest to this one.
      const isFreed =
        frontPattern !== undefined && !new RegExp(`^${frontPattern}$`, 'i').test(pieces[index - 1])
      const laterSource =
        index > 1 && !isFreed ? toLaterSource(capture, pieces[index - 1]) : undefined

      return wrapCapture(piece, captures[piece] ?? patterns[piece] ?? laterSource ?? capture.source)
    })
    .join('')
}

// A template as two functions: the values of a URL it takes, and its URL for a page's values.
const compileTemplate = (
  template: string,
  { key, queryEncoding, checks: givenRowChecks }: UrlRow,
  rowIndex: number,
  isAlias: boolean,
  options: UrlTableOptions,
  checks: Record<string, CheckFunction>,
  rowChecks: Record<string, RowCheckFunction>,
  lenient: UrlLenient | undefined,
  hasAmpersandMark: boolean,
): CompiledTemplate => {
  const isRootTemplate = template.startsWith(rootPlaceholder)
  // A `{root}` template reads as one on `{host}`: a tenant serves from its origin.
  const match = templateRegex.exec(
    isRootTemplate ? template.replace(rootPlaceholder, 'https://{host}') : template,
  )

  if (!match) {
    throw new Error(t(locales.errors.invalidFeedTemplate, { template }))
  }

  const [, scheme, host, givenPath = '', search] = match
  const isOpen = givenPath.endsWith(openTailSuffix)
  const path = isOpen ? givenPath.slice(0, -openTailSuffix.length) : givenPath

  // Behind a value with no slash between, as `/{repo}{*}`, nothing says where the value ends.
  if (`${host}${path}${search ?? ''}`.includes(openTailMark)) {
    throw new Error(t(locales.errors.misplacedOpenTail, { key }))
  }

  const captured: Array<Captured> = []
  // Every placeholder is captured as `p{index}`, so a URL is read back to its values.
  const wrapCaptureIn = (part: UrlPart) => {
    return (name: string, source: string): string => {
      captured.push({ name: toBareName(name), part })

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
  const encodeQueryText: MapText = (text) => encodeText(text, queryEncoding)
  const entries = search ? [...toSearchParams(parseQuery(search))] : []
  // A name with no value, such as `?rss`, is a flag, built with no value, and a placeholder
  // with none, such as `?{query}`, a passed query, which names no parameter of the row.
  const flagNames = entries
    .filter(([name, value]) => !value && !passedQueryRegex.test(name))
    .map(([name]) => name)
  const templateParams = entries.map(([name, value]): TemplateParam => {
    const passedName = value ? undefined : passedQueryRegex.exec(name)?.[1]

    if (passedName !== undefined) {
      return { passedName }
    }

    const isFlag = flagNames.includes(name)
    const isFilled = !isFlag && value.includes('{')
    // A flag is written by `composeQuery` under either encoding.
    const writtenName = encodeText(name, isFlag ? 'minimal' : queryEncoding)
    const writtenValue = isFilled ? '' : encodeQueryText(value)
    const source = toRegexSource(value, wrapCaptureIn('query'), queryCapture)
    const rawSource = toRegexSource(
      value,
      wrapCaptureIn('query'),
      queryCapture,
      {},
      encodeQueryText,
    )
    const own: OwnParam = {
      name,
      value,
      isFlag,
      writtenName,
      pair: toPair(isFlag ? writtenName : `${writtenName}=${writtenValue}`),
      isFilled,
      regex: new RegExp(`^${source}$`, 'i'),
      rawRegex: new RegExp(`^${rawSource}$`, 'd'),
    }

    return { own }
  })
  const ownParams = templateParams.map((param) => param.own).filter(isPresent)
  const ownNames = ownParams.map((param) => param.name)
  // An empty passed query passes nothing, so the row writes its own parameters alone.
  const passedQueryNames = templateParams.map((param) => param.passedName).filter(isPresent)
  const isAmpersandEntityRead = lenient?.ampersandEntity === true
  // Behind another pair a name that starts with `amp;` is written `&amp;`, which a table with a
  // row under the mark reads as `&` on every row.
  const entityName = ownNames.find((name) => name.startsWith(entityPrefix))

  if (hasAmpersandMark && entityName !== undefined) {
    throw new Error(t(locales.errors.ampersandEntityName, { key, name: entityName }))
  }

  // A passed query is written as given, without the parameters the row sets itself. Under the
  // ampersand mark `&amp;` separates pairs too.
  const passQuery = (text: string): Array<QueryPair> | typeof refusedQuery => {
    if (parserRemovedRegex.test(text)) {
      return refusedQuery
    }

    const givenPairs = parseQuery(text)
    const pairs = isAmpersandEntityRead ? readAmpersandEntities(givenPairs) : givenPairs

    // A table with a row under the mark reads a pair that starts with `amp;` as another pair.
    if (hasAmpersandMark && pairs.some((pair) => pair.text.startsWith(entityPrefix))) {
      return refusedQuery
    }

    return pairs
      .filter((pair) => pair.rawName && !isNamed(pair, ownNames))
      .map((pair) => toPair(pair.text.replace(nonAsciiRegex, encodeURIComponent)))
  }
  const hosts = options.hosts?.exact ?? []
  const tenantDomains = (options.hosts?.tenants ?? []).map((domain) => toEntrySource(domain))
  const domainSource = `(?:${tenantDomains.join('|')})`
  // One host label other than `www` unless `www` is a tenant.
  const tenantSource = options.isWwwTenant ? '[^./]+' : '(?!www\\.)[^./]+'

  const hasHosts = hosts.length > 0 || tenantDomains.length > 0

  if (
    (!isRootTemplate && host.includes('{host}') && !hasHosts) ||
    (host.includes('{domain}') && tenantDomains.length === 0)
  ) {
    throw new Error(t(locales.errors.missingFeedHosts, { key }))
  }

  const names = [...template.matchAll(placeholderRegex)].map(([, name]) => name)

  // `?%7Bquery%7D` is read as the passed query `{query}`, which the template text never fills.
  if (passedQueryNames.some((name) => !names.includes(name))) {
    throw new Error(t(locales.errors.invalidFeedTemplate, { template }))
  }

  const pathNames = [...path.matchAll(placeholderRegex)].map(([, name]) => name)
  const multiSegmentName = pathNames.find(isMultiSegment)

  // A `{name*}` value takes every segment it can, so the tail behind it starts at a guess.
  if (isOpen && multiSegmentName !== undefined) {
    const name = toBareName(multiSegmentName)

    throw new Error(t(locales.errors.openTailBesideMultiSegment, { key, name }))
  }

  if (isOpen && names.some((name) => toBareName(name) === openTailName)) {
    throw new Error(t(locales.errors.openTailName, { key }))
  }

  // Two values in one host label, path segment or query value are split by a guess, and a
  // lowercase can move the split to another place. So are two `{name*}` values in one template.
  const hasTwoMultiSegment = names.filter(isMultiSegment).length > 1
  const sharedPieces = hasTwoMultiSegment
    ? [template]
    : [...host.split('.'), ...path.split('/'), ...ownParams.map((param) => param.value)]
  const sharedName = sharedPieces
    .map((piece) => [...piece.matchAll(placeholderRegex)].map(([, name]) => toBareName(name)))
    .filter((pieceNames) => pieceNames.length > 1)
    .flat()
    .find((name) => lenient?.case?.includes(name))

  if (sharedName !== undefined) {
    throw new Error(t(locales.errors.sharedCaseMark, { key, name: sharedName }))
  }

  const hasRowChecks = Object.keys(rowChecks).length > 0
  // A name the template holds twice keeps the first value read.
  const readGroups = (params: Record<string, string>, groups: Record<string, string> = {}) => {
    for (const [group, value] of Object.entries(groups)) {
      const name = getCaptured(group)?.name

      if (name !== undefined && params[name] === undefined) {
        params[name] = value
      }
    }
  }
  const passesChecks = (params: Record<string, string>): boolean => {
    return Object.entries(params).every(([name, value]) => {
      return (checks[name]?.(value) ?? true) && (rowChecks[name]?.(value, params) ?? true)
    })
  }
  // A query on a host with no path sits behind the slash of its root, as `example.com/?rss`.
  const writeBase = (base: string, pairs: Array<QueryPair>): string => {
    return pairs.length > 0 && pathlessBaseRegex.test(base) ? `${base}/` : base
  }
  const multiSegmentCaptures = Object.fromEntries(
    names.filter(isMultiSegment).map((name) => [name, multiSegmentCapture]),
  )

  // Two values in one segment: one whose check is a pattern is read by that pattern.
  const pathPatterns: Record<string, string> = {}

  for (const segment of path.split('/')) {
    const segmentNames = [...segment.matchAll(placeholderRegex)].map(([, name]) => name)

    for (const name of segmentNames.length > 1 ? segmentNames : []) {
      const check = givenRowChecks?.[name] ?? options.checks?.[name]

      if (check instanceof RegExp && isAnyOf(check.flags, ['', 'i'])) {
        pathPatterns[name] = toEntrySource(check)
      }
    }
  }

  // Matched on the decoded path without its trailing slash.
  const pathSource = toRegexSource(
    path.replace(trailingSlashRegex, ''),
    wrapCaptureIn('path'),
    pathCapture,
    multiSegmentCaptures,
    decodePath,
    pathPatterns,
  )
  // The path as the template writes it, for a URL read in its own spelling.
  // A template with no path is a site, which a URL names with or without the slash of its root.
  const rawPathSource = path
    ? toRegexSource(
        path,
        wrapCaptureIn('path'),
        pathCapture,
        multiSegmentCaptures,
        undefined,
        pathPatterns,
      )
    : '/?'
  // A fixed host matches with or without `www` in front, a tenant label only with
  // `isWwwTenantPrefix`, so `www.alice.example.com` is otherwise no tenant's host.
  const toHostPathRegex = (isWwwOptional: boolean, pathPattern: string, flags: string): RegExp => {
    const wwwSource = isWwwOptional ? '(?:www\\.)?' : ''
    const tenantWwwSource = options.isWwwTenantPrefix ? wwwSource : ''
    const normalize = (value: string): string => (isWwwOptional ? stripWww(value) : value)
    // In a page table `www` is read in front of an apex host, and in front of a subdomain host
    // only where `hosts` lists it, since a subdomain serves no `www` of its own.
    const listedHosts = options.isFallThrough ? hosts.filter(isString) : []
    const toPageHostSource = (value: string): string => {
      const bare = stripWww(value)

      return isApexHost(bare) ? `${wwwSource}${escapeRegex(bare)}` : escapeRegex(value)
    }
    const hostSources = [
      ...hosts.map((value) => {
        if (options.isFallThrough && isString(value)) {
          return toPageHostSource(value)
        }

        return `${wwwSource}${toEntrySource(isString(value) ? normalize(value) : value)}`
      }),
      ...(tenantDomains.length > 0 ? [`${tenantWwwSource}${tenantSource}\\.${domainSource}`] : []),
    ]
    const isFixedHost = !host.startsWith('{') || host.startsWith('{domain}')
    const bareHost = stripWww(host)
    const listedForms = [bareHost, `www.${bareHost}`].filter((form) => listedHosts.includes(form))
    const isPageFixedHost = Boolean(options.isFallThrough) && isFixedHost && !host.includes('{')
    const fixedPrefixSource = isFixedHost && !isPageFixedHost ? wwwSource : ''
    const isTenantHost = !isFixedHost && !host.startsWith('{host}')
    const tenantPrefixSource = isTenantHost ? tenantWwwSource : ''
    const hostCaptures = {
      host: `(?:${hostSources.join('|')})`,
      domain: domainSource,
    }
    const hostSource = toRegexSource(
      normalize(host),
      wrapCaptureIn('host'),
      { source: tenantSource },
      hostCaptures,
    )
    const prefixSource = `${fixedPrefixSource}${tenantPrefixSource}`

    if (isPageFixedHost) {
      const forms = listedForms.length > 0 ? listedForms : [host]
      const sources = isApexHost(bareHost) ? [toPageHostSource(bareHost)] : forms.map(escapeRegex)

      return new RegExp(`^(?:${sources.join('|')})${pathPattern}$`, flags)
    }

    return new RegExp(`^${prefixSource}${hostSource}${pathPattern}$`, flags)
  }
  // An open tail is every segment behind the path, an empty one included, as pages link them.
  const readPathSource = isOpen
    ? `${pathSource}(?:/${wrapCaptureIn('path')(openTailName, '.*')})?`
    : pathSource
  const asGivenRegex = toHostPathRegex(false, readPathSource, 'i')
  const optionalWwwRegex = toHostPathRegex(true, readPathSource, 'i')
  // Matched on the path as given, with the indices a case mark lowercases.
  const rawAsGivenRegex = toHostPathRegex(false, rawPathSource, 'd')
  const rawOptionalWwwRegex = toHostPathRegex(true, rawPathSource, 'd')
  const slashedPathSource = path ? `${pathSource}${path.endsWith('/') ? '/' : ''}` : '/?'
  const slashedAsGivenRegex = toHostPathRegex(false, slashedPathSource, 'i')
  const slashedOptionalWwwRegex = toHostPathRegex(true, slashedPathSource, 'i')
  const isSlashFree = Boolean(path) && lenient?.trailingSlash === true
  const fixedParams = ownParams.filter((param) => !param.value.includes('{'))
  const repeatedNames = ownNames.filter((name, index) => ownNames.indexOf(name) !== index)
  const shapeNames = ownNames
    .map((name) => name.toLowerCase())
    .sort((left, right) => left.localeCompare(right))
  const shapeQuery = [...shapeNames, ...passedQueryNames.map(() => '{}')].join('&')
  const shapeHostPath = `${host}${path}`.replace(placeholderRegex, toShapePlaceholder)
  // A `#` is in no template, so an open template shares its shape with no template that is not.
  const shape = `${shapeHostPath}${isOpen ? '#' : ''}?${shapeQuery}`

  // A `{root}` table without hosts serves any site, so nothing in its URL names the platform.
  const claimsUrls = !isRootTemplate || hasHosts

  const readParams = (
    tableUrl: TableUrl,
    isWwwOptional: boolean,
  ): Record<string, string> | undefined => {
    const { url, hostPath } = tableUrl
    const match = claimsUrls && (isWwwOptional ? optionalWwwRegex : asGivenRegex).exec(hostPath)

    if (!match) {
      return
    }

    const params: Record<string, string> = {}

    readGroups(params, match.groups)

    // A tail is read as a `{name*}` value is written: without its empty segments, and one with no
    // segment left, as after a doubled slash, is no value.
    if (isOpen) {
      const tail = getPlaceholderValue(params, `${openTailName}*`)

      if (tail === undefined) {
        delete params[openTailName]
      } else {
        params[openTailName] = tail
      }
    }

    for (const { name, isFlag, regex } of ownParams) {
      const { searchParams } = readQuery(tableUrl)
      const values = getQueryParamValues(searchParams, name, { preserveEmptyValues: isFlag })
      // A name the row repeats, as `types=page&types=blogpost`, finds each value in any place.
      const candidates = repeatedNames.includes(name) ? values : values.slice(0, 1)
      const queryMatch = candidates.map((value) => regex.exec(value)).find((found) => found)

      if (!queryMatch) {
        return
      }

      readGroups(params, queryMatch.groups)
    }

    // A host is read with its port, as `forUrl` fills it.
    if ('host' in params) {
      params.host = url.host
    }

    if (scheme === schemePlaceholder) {
      params.scheme = url.protocol.slice(0, -1)
    }

    // A root read back is the origin: nothing in a URL says where a base path ends.
    if (isRootTemplate) {
      params.root = url.origin
    }

    // A row read under a root sits on the stand-in host, and its checks see the root it is under.
    if (readRoot !== undefined) {
      params.root = readRoot
    }

    return params
  }

  // A name the template holds twice reads one value, so two different ones read nothing.
  const readRawGroups = (rawParams: RawParams, groups: Record<string, string> = {}): boolean => {
    return Object.entries(groups).every(([group, value]) => {
      const captured = getCaptured(group)

      // A host pattern can hold a group of its own, set or unset, which is no value to read.
      if (!captured || value === undefined) {
        return true
      }

      const { name, part } = captured

      if (rawParams[name] && rawParams[name].value !== value) {
        return false
      }

      rawParams[name] = { value, part }

      return true
    })
  }

  // A raw value as the pattern of `readParams` matches it.
  const decodeValue = (value: string, part: UrlPart): string => {
    if (part === 'host') {
      return value
    }

    return part === 'path' ? decodePath(value) : decodeQueryValue(value).trim()
  }

  // The text a match ran on and its values, the values the case mark covers in lowercase.
  const lowercaseValues = (match: RegExpExecArray, params: Record<string, string>) => {
    const groups = { ...match.groups }
    let text = match.input

    for (const [group, range] of Object.entries(match.indices?.groups ?? {})) {
      const captured = getCaptured(group)

      if (!range || !captured || !lenient?.case?.includes(captured.name)) {
        continue
      }

      const value = toLowerCaseValue(text.slice(range[0], range[1]))

      const { name } = captured
      const decoded = decodeValue(value, captured.part)

      // A value whose check refuses the lowercase, as `en-US`, stays as written.
      if (checks[name]?.(decoded) === false) {
        continue
      }

      if (rowChecks[name]?.(decoded, { ...params, [name]: decoded }) === false) {
        continue
      }

      groups[group] = value
      text = `${text.slice(0, range[0])}${value}${text.slice(range[1])}`
    }

    return { text, groups }
  }

  // A path with the trailing slash the template writes, where the trailing slash mark covers it.
  const respellSlash = (pathname: string): string => {
    if (!isSlashFree || pathname === '/') {
      return pathname
    }

    const bare = pathname.replace(trailingSlashRegex, '')

    return path.endsWith('/') ? `${bare}/` : bare
  }

  const isSlashRespelled = (pathname: string): boolean => {
    return respellSlash(pathname) !== pathname
  }

  const takesSlashedHostPath = (hostPath: string, isWwwOptional: boolean): boolean => {
    return (isWwwOptional ? slashedOptionalWwwRegex : slashedAsGivenRegex).test(hostPath)
  }

  const readRawParams: CompiledTemplate['readRawParams'] = (tableUrl, isWwwOptional, params) => {
    const { url } = tableUrl
    const { pairs } = readQuery(tableUrl)
    const regex = isWwwOptional ? rawOptionalWwwRegex : rawAsGivenRegex
    const match = regex.exec(url.hostname + respellSlash(url.pathname))
    const rawParams: RawParams = {}

    // A row that repeats a parameter name is read loosely, so a URL that gives the name once is
    // not written as the row writes it.
    if (!match || repeatedNames.length > 0) {
      return
    }

    const respelledHostPath = lowercaseValues(match, params)

    if (!readRawGroups(rawParams, respelledHostPath.groups)) {
      return
    }

    const respelledPairs = [...pairs]

    for (const param of ownParams) {
      const [index, ...others] = [...pairs.keys()].filter((pairIndex) => {
        return isNamed(pairs[pairIndex], param.name)
      })

      // The row took the URL, so a pair under each own name is there.
      const { rawName, rawValue } = pairs[index]

      // A parameter given twice or under another spelling than the row builds or names it by,
      // as another case, is read differently from server to server.
      if (others.length > 0 || ![param.writtenName, param.name].includes(rawName)) {
        return
      }

      if (param.isFlag) {
        if (rawValue) {
          return
        }

        // A flag written with an equals sign and no value, as `?xml=`, is the flag.
        if (rawValue !== undefined) {
          respelledPairs[index] = toPair(rawName)
        }

        continue
      }

      const queryMatch = param.rawRegex.exec(rawValue ?? '')

      if (!queryMatch) {
        return
      }

      const respelledValue = lowercaseValues(queryMatch, params)

      if (!readRawGroups(rawParams, respelledValue.groups)) {
        return
      }

      if (respelledValue.text !== rawValue) {
        respelledPairs[index] = toPair(`${rawName}=${respelledValue.text}`)
      }
    }

    if ('host' in rawParams) {
      rawParams.host.value = url.host
    }

    if (scheme === schemePlaceholder) {
      rawParams.scheme = { value: url.protocol.slice(0, -1), part: 'host' }
    }

    if (isRootTemplate) {
      rawParams.root = { value: url.origin, part: 'host' }
    }

    return {
      params: rawParams,
      pathname: respelledHostPath.text.slice(url.hostname.length),
      pairs: respelledPairs,
    }
  }

  const getRawUrl = (rawParams: RawParams, keptPairs: Array<QueryPair>): RawUrl | undefined => {
    let isFilled = true
    // A value moved to another part of the URL is written only when it reads the same there.
    const fill = (text: string, part: UrlPart, mapLiteral?: MapText): string => {
      const fillPlaceholder = (placeholder: string): string => {
        const rawParam = rawParams[toBareName(placeholder)]

        if (!rawParam || (rawParam.part !== part && !plainValueRegex.test(rawParam.value))) {
          isFilled = false

          return ''
        }

        return rawParam.value
      }

      return mapTemplate(text, fillPlaceholder, mapLiteral)
    }
    const origin = isRootTemplate
      ? fill(rootPlaceholder, 'host')
      : `${fill(scheme, 'host')}://${fill(host, 'host')}`
    const pairs = templateParams.flatMap(({ own }) => {
      if (!own) {
        return keptPairs
      }

      if (!own.isFilled) {
        return [own.pair]
      }

      return [appendValue(own.pair, fill(own.value, 'query', encodeQueryText))]
    })
    const filledPath = fill(path, 'path')

    // A `.` or `..` segment is resolved away by a parser, so the URL would name another path.
    if (!isFilled || filledPath.split('/').some((segment) => dotSegmentRegex.test(segment))) {
      return
    }

    const writtenPairs = passedQueryNames.length > 0 ? pairs : [...pairs, ...keptPairs]

    return {
      base: writeBase(`${origin}${filledPath}`, writtenPairs),
      pairs: writtenPairs,
    }
  }

  const getHttpsOrigin = (rawParams: RawParams): string | undefined => {
    if (!isAnyOf(scheme, 'https')) {
      return
    }

    // It runs on the values this template read itself, so every host placeholder has one.
    return `https://${mapTemplate(host, (name) => rawParams[toBareName(name)].value)}`
  }

  // A template whose placeholders the values do not all fill builds no URL.
  const getUrl: CompiledTemplate['getUrl'] = (params = {}) => {
    const values: Record<string, string> = {}

    // An empty value is no value: a host label or path segment left empty builds a broken URL, as
    // `/t//feed`, and a query value left empty a feed the page does not name, as
    // `?videoChannelId=`.
    for (const name of names) {
      const value = getPlaceholderValue(params, name)
      // A passed query can be empty. One that is no text, as `5` past the types, is no value.
      const isMissing = passedQueryNames.includes(name) ? !isString(value) : !value

      if (isNullish(value) || isMissing) {
        return
      }

      const check = checks[toBareName(name)]

      if (check && !check(value)) {
        return
      }

      values[name] = value
    }

    if (hasRowChecks) {
      const filled = Object.fromEntries(names.map((name) => [toBareName(name), values[name]]))

      const isRefused = Object.entries(filled).some(([name, value]) => {
        return rowChecks[name]?.(value, filled) === false
      })

      if (isRefused) {
        return
      }
    }

    const fillPlaceholders = (
      text: string,
      encode = (value: string, _name: string) => value,
    ): string => {
      return text.replace(placeholderRegex, (_placeholder, name: string) => {
        return encode(values[name], name)
      })
    }
    const pairs: Array<QueryPair> = []

    for (const { own, passedName } of templateParams) {
      if (!own) {
        const passedPairs = passQuery(values[passedName])

        // A template without the passed query is another feed than the one the values name.
        if (passedPairs === refusedQuery) {
          return refusedQuery
        }

        pairs.push(...passedPairs)

        continue
      }

      if (!own.isFilled) {
        pairs.push(own.pair)

        continue
      }

      const valueText = encodeQueryText(fillPlaceholders(own.value))

      // `composeQuery` writes no pair for an empty value, `URLSearchParams` writes `name=`.
      if (valueText || queryEncoding === 'form') {
        pairs.push(appendValue(own.pair, valueText))
      }
    }

    // A root is written as given, without the trailing slash the path brings.
    const origin = isRootTemplate
      ? fillPlaceholders(rootPlaceholder).replace(trailingSlashRegex, '')
      : `${fillPlaceholders(scheme)}://${fillPlaceholders(host)}`

    const base = writeBase(`${origin}${fillPlaceholders(path, encodePath)}`, pairs)

    return `${base}${writeQuery(sortPairs(pairs))}`
  }

  const getWrittenText: CompiledTemplate['getWrittenText'] = (pair) => {
    // `a+b` is read as the name `a b`, and may be the raw spelling of another parameter of the row.
    const param = ownParams.find((own) => own.name === pair.rawName && own.name === pair.name)

    if (!param) {
      return pair.text
    }

    return `${param.writtenName}${pair.text.slice(pair.rawName.length)}`
  }

  return {
    rowIndex,
    isAlias,
    ownNames,
    passedQueryNames,
    hostNames: [...host.matchAll(placeholderRegex)].map(([, name]) => name),
    fixedQuery: fixedParams.map((param) => [param.name, param.value]),
    valueNames: ownParams.filter((param) => param.value.includes('{')).map((param) => param.name),
    flagTexts: ownParams.filter((param) => param.isFlag).map((param) => `${param.writtenName}=`),
    getWrittenText,
    asGivenRegex,
    optionalWwwRegex,
    readParams,
    readRawParams,
    isSlashRespelled,
    takesSlashedHostPath,
    isAmpersandEntityRead,
    getRawUrl,
    getHttpsOrigin,
    passesChecks,
    shape,
    openDepth: isOpen ? path.split('/').length : Number.POSITIVE_INFINITY,
    getUrl,
  }
}

// One table of URLs, keyed by what each row is. `build` writes a row's URL from the values a page
// gave, `buildAll` lists every spelling of it, `read` takes a URL back to its row and values, and
// `getMainUrl` writes a URL in its row's main spelling.
export const defineUrls = <const Key extends string, Extra extends object = object>(
  // Extra is never read off the rows, so a field no row type names fails the typecheck.
  givenRows: Array<UrlRow<Key> & NoInfer<Extra>>,
  options: UrlTableOptions = {},
): UrlTable<Key, UrlRow<Key> & NoInfer<Extra>> => {
  type Row = UrlRow<Key> & Extra
  type Select = (row: Row) => boolean

  // The given rows are copied and never written to.
  const rows = givenRows.map((row) => copyRow<Row>(row))

  const getLenient = (row: Row): UrlLenient => {
    const marks: UrlLenient = { ...options.lenient, ...row.lenient }

    // A case mark in another form than a list, as `case: true` past the types, is no mark.
    return { ...marks, case: Array.isArray(marks.case) ? [...marks.case] : undefined }
  }
  const lenients = rows.map(getLenient)
  const hasAmpersandMark = lenients.some((lenient) => lenient.ampersandEntity === true)
  const checks = toCheckFunctions(options.checks)
  const rowChecks = rows.map((row) => toCheckFunctions(row.checks))
  const compiledRows = rows.map((row, rowIndex) => {
    return [row.main, ...(row.aliases ?? [])].map((template, index) => {
      return compileTemplate(
        template,
        row,
        rowIndex,
        index > 0,
        options,
        checks,
        rowChecks[rowIndex],
        lenients[rowIndex],
        hasAmpersandMark,
      )
    })
  })
  const compiled = compiledRows.flat()

  for (const [rowIndex, row] of rows.entries()) {
    const ownNames = compiledRows[rowIndex].flatMap((template) => template.ownNames)
    const name = row.keptParams?.find((keptParam) => isAnyOf(keptParam, ownNames))

    if (name !== undefined) {
      throw new Error(t(locales.errors.keptParamInTemplate, { key: row.key, name }))
    }
  }
  // A template without an open tail is read before one with it, and of two with one the deeper
  // first. Then the one with more query parameters, then the earlier row, so a `{name*}` row goes
  // after the rows its paths overlap.
  const claimed = compiled.filter((candidate) => !rows[candidate.rowIndex].isBuildOnly)
  const bySpecificity = [...claimed].sort((a, b) => {
    if (a.openDepth !== b.openDepth) {
      return b.openDepth - a.openDepth
    }

    return b.ownNames.length - a.ownNames.length
  })
  // A table that passes a refused URL on reads its rows in the order written.
  const inReadOrder = options.isFallThrough ? claimed : bySpecificity
  // A URL whose host and path no template takes is none of the rows, whatever its query.
  const asGivenRegex = joinRegexes(claimed.map((candidate) => candidate.asGivenRegex))
  const optionalWwwRegex = joinRegexes(claimed.map((candidate) => candidate.optionalWwwRegex))

  // The templates of the key's rows in the order written, each row's main URL before its aliases.
  const getRowTemplates = (key: string, select?: Select): Array<Array<CompiledTemplate>> => {
    if (!rows.some((row) => row.key === key)) {
      throw new Error(t(locales.errors.missingFeedTemplate, { key }))
    }

    return compiledRows.filter((_templates, rowIndex) => {
      return rows[rowIndex].key === key && (select?.(copyRow(rows[rowIndex])) ?? true)
    })
  }

  const build: UrlTable<Key, Row>['build'] = (key, params, select) => {
    // A key with several shapes builds the first one whose placeholders the values fill.
    for (const candidate of getRowTemplates(key, select).flat()) {
      const url = candidate.getUrl(params)

      // A template without the passed query is another feed than the one the values name.
      if (url === refusedQuery) {
        return
      }

      if (url) {
        return url
      }
    }
  }

  // Every URL the values fill of the first row of the key that builds one, up to a template
  // whose passed query cannot be written.
  const buildAll: UrlTable<Key, Row>['buildAll'] = (key, params, select) => {
    for (const templates of getRowTemplates(key, select)) {
      const urls: Array<string> = []

      for (const candidate of templates) {
        const url = candidate.getUrl(params)

        if (url === refusedQuery) {
          return urls
        }

        if (url) {
          urls.push(url)
        }
      }

      if (urls.length > 0) {
        return urls
      }
    }

    return []
  }

  // A parameter that the templates of a key set to different fixed values, or that only some of
  // them set, tells that key's feeds apart, as `alt=rss` beside a row with no `alt`. Under
  // another value it names a feed no row knows.
  const getSelectorNames = (key: string): Array<string> => {
    const keyTemplates = compiledRows
      .filter((_templates, rowIndex) => rows[rowIndex].key === key)
      .flat()
    const fixedNames = keyTemplates.flatMap((template) => template.fixedQuery.map(([name]) => name))
    const getFixedValues = (template: CompiledTemplate, name: string): string => {
      const values = template.fixedQuery
        .filter(([fixedName]) => fixedName === name)
        .map(([, value]) => value)

      return JSON.stringify([...values].sort((left, right) => left.localeCompare(right)))
    }

    return [...new Set(fixedNames)].filter((name) => {
      return new Set(keyTemplates.map((template) => getFixedValues(template, name))).size > 1
    })
  }
  const keys = [...new Set(rows.map((row) => row.key))]
  const keySelectorNames: Record<string, Array<string>> = Object.fromEntries(
    keys.map((key) => [key, getSelectorNames(key)]),
  )
  // A parameter another template taking the same host and path sets to a value this one does
  // not set, tells the two apart too, also across keys, as `type=comments` on `/feed`.
  const getPathSelectorNames = (
    template: CompiledTemplate,
    hostPath: string,
    isWwwOptional: boolean,
  ): Array<string> => {
    return compiled
      .filter((candidate) => {
        return (isWwwOptional ? candidate.optionalWwwRegex : candidate.asGivenRegex).test(hostPath)
      })
      .flatMap((candidate) => candidate.fixedQuery)
      .filter(([name, value]) => {
        return !template.fixedQuery.some(([ownName, ownValue]) => {
          return isAnyOf(name, ownName) && isAnyOf(value, ownValue)
        })
      })
      .map(([name]) => name)
  }

  const hasUnlistedSelector = (
    template: CompiledTemplate,
    tableUrl: TableUrl,
    isWwwOptional: boolean,
  ): boolean => {
    const row = rows[template.rowIndex]
    const names = [
      ...keySelectorNames[row.key],
      ...getPathSelectorNames(template, tableUrl.hostPath, isWwwOptional),
    ]

    // A row that passes the page's query on takes any parameter.
    if (names.length === 0 || template.passedQueryNames.length > 0) {
      return false
    }

    const rowFixedQuery = compiledRows[template.rowIndex].flatMap(
      (candidate) => candidate.fixedQuery,
    )
    const openNames = [...template.valueNames, ...(row.keptParams ?? options.keptParams ?? [])]

    return [...readQuery(tableUrl).searchParams].some(([name, value]) => {
      if (!isAnyOf(name, names) || isAnyOf(name, openNames)) {
        return false
      }

      // A fixed value is read in any case, as the template reads it.
      return !rowFixedQuery.some(([fixedName, fixedValue]) => {
        return isAnyOf(name, fixedName) && isAnyOf(value, fixedValue)
      })
    })
  }

  // A template that takes a URL, without values where it refuses the URL.
  type TakenTemplate = {
    template: CompiledTemplate
    params?: Record<string, string>
    tableUrl: TableUrl
    isWwwOptional: boolean
  }
  type FoundTemplate = Required<TakenTemplate>

  // The first template that takes the URL decides. A value its check refuses passes the URL on
  // only to a template of the same shape, as a row for another value of `format`, so a looser
  // row does not take it. Under `isFallThrough` every refusal passes it on to every later row.
  const findTemplate = (tableUrl: TableUrl, isWwwOptional: boolean): TakenTemplate | undefined => {
    let refused: TakenTemplate | undefined

    for (const template of inReadOrder) {
      if (refused && !options.isFallThrough && refused.template.shape !== template.shape) {
        continue
      }

      const params = template.readParams(tableUrl, isWwwOptional)

      if (!params) {
        continue
      }

      const isCheckRefused = !template.passesChecks(params)
      const isSelectorRefused =
        !isCheckRefused && hasUnlistedSelector(template, tableUrl, isWwwOptional)

      if (!isCheckRefused && !isSelectorRefused) {
        return { template, params, tableUrl, isWwwOptional }
      }

      // A parameter that names a feed no row knows ends the read of a table that tries only rows
      // of the same shape.
      if (isSelectorRefused && !options.isFallThrough) {
        return { template, tableUrl, isWwwOptional }
      }

      if (!refused) {
        refused = { template, tableUrl, isWwwOptional }
      }
    }

    return refused
  }

  // A trailing slash another row writes, as `/{user}/` beside `/{user}`, is what picks that row,
  // so the trailing slash mark does not cover it.
  const readRawParams = ({
    template,
    params,
    tableUrl,
    isWwwOptional,
  }: FoundTemplate): RawRead | undefined => {
    const isOtherRowSlash =
      template.isSlashRespelled(tableUrl.url.pathname) &&
      compiled.some((other) => {
        return (
          other.rowIndex !== template.rowIndex &&
          other.takesSlashedHostPath(tableUrl.slashedHostPath, isWwwOptional)
        )
      })
    // An entity left after `&amp;` is read as `&`, as in `&amp;amp;`, or a pair that starts with
    // `amp;`, is written back as `&amp;`, which the mark reads as another query.
    const hasEntityLeft =
      template.isAmpersandEntityRead &&
      readQuery(tableUrl).pairs.some((pair) => pair.text.startsWith(entityPrefix))

    if (isOtherRowSlash || hasEntityLeft) {
      return
    }

    return template.readRawParams(tableUrl, isWwwOptional, params)
  }

  const readTableTemplate = (tableUrl: TableUrl): TakenTemplate | undefined => {
    // With `www` a tenant, a host as given wins, so `www.example.com` is the tenant `www`.
    const asGiven =
      options.isWwwTenant && asGivenRegex.test(tableUrl.hostPath)
        ? findTemplate(tableUrl, false)
        : undefined

    if (asGiven) {
      return asGiven
    }

    if (optionalWwwRegex.test(tableUrl.hostPath)) {
      return findTemplate(tableUrl, true)
    }
  }

  // The template a URL is read by. Where the ampersand mark covers it, the pairs are the ones of
  // the query with `&amp;` read as `&`.
  const readTemplate = (url: string): FoundTemplate | undefined => {
    const tableUrl = readTableUrl(url)

    if (!tableUrl) {
      return
    }

    let found = readTableTemplate(tableUrl)
    const takesHostPath = (): boolean => {
      return [asGivenRegex, optionalWwwRegex].some((regex) => regex.test(tableUrl.hostPath))
    }

    if (hasAmpersandMark && takesHostPath() && readQuery(tableUrl).pairs.some(isEntityPair)) {
      const { pairs, hash } = readQuery(tableUrl)
      const query = toUrlQuery(readAmpersandEntities(pairs), hash)
      const ampersandFound = readTableTemplate({ ...tableUrl, query })

      // The server of a row under the mark sees the query with `&`, so only that reading of the
      // URL names such a row, and a refusal of it stands.
      if (ampersandFound?.template.isAmpersandEntityRead) {
        found = ampersandFound
      } else if (found?.template.isAmpersandEntityRead) {
        return
      }
    }

    if (!found?.params) {
      return
    }

    return { ...found, params: found.params }
  }

  type RootRow = Row & { rootRowIndex: number }
  type RootTable = UrlTable<Key, RootRow>
  type RootTables = { all: RootTable; fixed: RootTable }

  // The rows that open with `{root}` as rows on one fixed host, which stands for whatever root a
  // URL is read under. Every other part of a read is the one a table on a fixed host does.
  const defineRootUrls = (takesTemplate: (template: string) => boolean): RootTable => {
    const rootRows: Array<RootRow> = []

    for (const [rootRowIndex, row] of rows.entries()) {
      const [main, ...aliases] = [row.main, ...(row.aliases ?? [])]
        .filter((template) => template.startsWith(rootPlaceholder) && takesTemplate(template))
        .map((template) => template.replace(rootPlaceholder, standInOrigin))

      if (main !== undefined) {
        rootRows.push({ ...row, main, aliases, rootRowIndex })
      }
    }

    return defineUrls<Key, Extra & { rootRowIndex: number }>(rootRows, {
      ...options,
      hosts: undefined,
    })
  }

  // Defined on the first read under a root, so a table never read that way compiles no pattern.
  let rootTables: RootTables | undefined

  const getRootTables = (): RootTables => {
    if (!rootTables) {
      rootTables = { all: defineRootUrls(() => true), fixed: defineRootUrls(hasFixedPath) }
    }

    return rootTables
  }

  // A URL read by its `{root}` rows alone, whatever its host: under the root given, or under the
  // root its own path shows.
  const readRooted = (url: string, readOptions: UrlReadOptions): UrlMatch<Key, Row> | undefined => {
    const parsedUrl = parseUrl(url)
    const origin = getOrigin(parsedUrl)

    if (!parsedUrl || !origin || !isHttpUrl(parsedUrl)) {
      return
    }

    const { all, fixed } = getRootTables()
    const segments = parsedUrl.pathname.replace(leadingSlashesRegex, '/').split('/')
    // A root is the first segments of the path, with the empty one in front of its first slash.
    const readBehind = (table: RootTable, root: string, rootLength: number) => {
      const rest = segments.slice(rootLength).map((segment) => `/${segment}`)

      readRoot = root

      try {
        return table.read(`${standInOrigin}${rest.join('')}${parsedUrl.search}${parsedUrl.hash}`)
      } finally {
        readRoot = undefined
      }
    }
    const readUnder = (root: string, rootLength: number): UrlMatch<Key, Row> | undefined => {
      const match = checks.root?.(root) === false ? undefined : readBehind(all, root, rootLength)

      if (!match) {
        return
      }

      const row = rows[match.row.rootRowIndex]

      return {
        key: row.key,
        params: { ...match.params, root },
        row: copyRow(row),
        isAlias: match.isAlias || !row.main.startsWith(rootPlaceholder),
        isExact: false,
      }
    }

    if (readOptions.root !== undefined) {
      const rootUrl = parseUrl(readOptions.root)
      const givenOrigin = getOrigin(rootUrl)

      if (!rootUrl || !givenOrigin || !isHttpUrl(rootUrl)) {
        return
      }

      const rootPath = rootUrl.pathname.replace(trailingSlashesRegex, '')
      const rootLength = rootPath.split('/').length
      const isSameHost =
        stripWww(rootUrl.hostname) === stripWww(parsedUrl.hostname) &&
        rootUrl.port === parsedUrl.port
      // Whole segments are compared, so the root `/forum` is no root of `/forums`.
      const basePath = segments.slice(0, rootLength).join('/')

      if (!isSameHost || !isSameText(decodePath(basePath), decodePath(rootPath))) {
        return
      }

      return readUnder(`${givenOrigin}${rootPath}`, rootLength)
    }

    const roots: Array<{ root: string; rootLength: number }> = []
    const maxRootLength = Math.min(segments.length, maxBasePathSegments + 1)

    for (let rootLength = 1; rootLength <= maxRootLength; rootLength++) {
      const root = `${origin}${segments.slice(0, rootLength).join('/')}`

      // A root that ends in a slash is the root in front of that slash.
      if (!root.endsWith('/')) {
        roots.push({ root, rootLength })
      }
    }

    // A row of values alone reads `/forum/viewtopic.php` at the origin, as a user in a group, so
    // the roots a row with fixed text reads the URL under go first, each list shortest first.
    const fixedRoots = roots.filter(({ root, rootLength }) => readBehind(fixed, root, rootLength))

    for (const { root, rootLength } of [...fixedRoots, ...roots]) {
      const match = readUnder(root, rootLength)

      if (match) {
        return match
      }
    }
  }

  const read: UrlTable<Key, Row>['read'] = (url, readOptions) => {
    if (readOptions?.root !== undefined || readOptions?.isAnyHost) {
      return readRooted(url, readOptions)
    }

    const found = readTemplate(url)

    if (!found) {
      return
    }

    const row = rows[found.template.rowIndex]

    return {
      key: row.key,
      params: found.params,
      row: copyRow(row),
      isAlias: found.template.isAlias,
      isExact: readRawParams(found) !== undefined,
    }
  }

  // The URL a template read, written as its row's main URL, or undefined where it cannot be.
  const writeMainUrl = (
    template: CompiledTemplate,
    tableUrl: TableUrl,
    rawRead: RawRead,
  ): string | undefined => {
    const { url } = tableUrl
    const [main] = compiledRows[template.rowIndex]
    const row = rows[template.rowIndex]
    const keptParams = row.keptParams ?? options.keptParams
    const pairs = rawRead.pairs.filter((pair) => pair.text)
    // A parameter no template names stays, and with a list only when the list names it.
    const isKept = (pair: QueryPair): boolean => !keptParams || isNamed(pair, keptParams)

    if (!template.isAlias) {
      const origin = url.port ? undefined : main.getHttpsOrigin(rawRead.params)
      const stayingPairs = sortPairs(
        pairs.filter((pair) => isNamed(pair, main.ownNames) || isKept(pair)),
      )
      // A query that needs no change stays as written, an empty one, an empty pair and a bare `#`
      // included.
      const rest =
        writeQuery(stayingPairs) === writeQuery(pairs)
          ? `${writeQuery(rawRead.pairs)}${readQuery(tableUrl).hash}`
          : `${writeQuery(stayingPairs)}${url.hash}`

      return `${origin ?? url.origin}${rawRead.pathname}${rest}`
    }

    const ownNames = [...template.ownNames, ...main.ownNames]
    const keptPairs = pairs.filter((pair) => !isNamed(pair, ownNames) && isKept(pair))
    const rawUrl = main.getRawUrl(rawRead.params, keptPairs)

    if (!rawUrl) {
      return
    }

    const mainPairs = sortPairs(rawUrl.pairs)
    const mainUrl = `${rawUrl.base}${writeQuery(mainPairs)}`

    // A port the main URL cannot keep, as one on a host it writes itself, leaves the URL as it is.
    if (url.port && parseUrl(mainUrl)?.port !== url.port) {
      return
    }

    // An `https` URL is never written down to `http`.
    if (url.protocol === 'https:' && startsWithAnyOf(mainUrl, 'http:')) {
      return
    }

    // A query of 50,000 pairs under one own name is looked up 50,000 times.
    const mainTexts = new Set([...mainPairs.map((pair) => pair.text), ...main.flagTexts])
    const hasOtherValue = pairs.some((pair) => {
      return (
        isNamed(pair, main.ownNames) &&
        !isNamed(pair, template.ownNames) &&
        !mainTexts.has(main.getWrittenText(pair))
      )
    })

    // A parameter the main URL sets, given under another value, is read differently from server
    // to server.
    if (hasOtherValue) {
      return
    }

    // The fragment stays as given, as on a URL already on its main host.
    return `${mainUrl}${url.hash}`
  }

  // A URL written as its row's main URL, every value as spelled but where a mark covers it. A main
  // URL under `http` or another `www` is rewritten too. Any other difference, a URL with
  // credentials and a value or a port the main URL cannot keep give nothing.
  const getMainUrl: UrlTable<Key, Row>['getMainUrl'] = (url) => {
    const found = readTemplate(url)

    if (!found) {
      return
    }

    const sourceUrl = found.tableUrl.url

    if (sourceUrl.username || sourceUrl.password) {
      return
    }

    // Where `www` can be a tenant, a URL read only by setting it aside is not known to be this row.
    if (options.isWwwTenant && found.isWwwOptional) {
      return
    }

    const rawRead = readRawParams(found)

    if (!rawRead) {
      return
    }

    const mainUrl = writeMainUrl(found.template, found.tableUrl, rawRead)

    if (!mainUrl || mainUrl === sourceUrl.href) {
      return
    }

    // A kept parameter can pick another row on the main URL's path, as `type=comments` on `/feed`,
    // and so can a sorted query, as `a=1&amp;b=2` from `amp;b=2&a=1` beside a row under the mark.
    const readBack = readTemplate(mainUrl)

    if (readBack?.template.rowIndex !== found.template.rowIndex) {
      return
    }

    // A value moved into the main URL can hold its fixed text, as `Alice_by_Bob` written into
    // `{board}_by_{user}`, so the main URL reads under other values.
    const caseNames = [
      ...(lenients[found.template.rowIndex]?.case ?? []),
      ...readBack.template.hostNames,
    ]
    const isReadAsWritten = Object.entries(readBack.params).every(([name, value]) => {
      const sourceValue = found.params[name]

      // A root holds the scheme, which a main URL under `http` changes, and the host read beside
      // it.
      if (name === 'root') {
        return true
      }

      if (caseNames.includes(name) && sourceValue !== undefined) {
        return isSameText(value, sourceValue)
      }

      return value === sourceValue
    })

    if (!isReadAsWritten) {
      return
    }

    return mainUrl
  }

  // The table for one page: `{scheme}`, `{host}` and `{root}` come from the page URL, `{domain}` is
  // its host without the tenant under `hosts.tenants`, `example.co.uk` for `alice.example.co.uk`.
  // A value the caller passes wins, so a caller passes a root with the base path the page names.
  const forUrl: UrlTable<Key, Row>['forUrl'] = (url) => {
    const parsedUrl = parseUrl(url)

    if (!parsedUrl || !isHttpUrl(parsedUrl)) {
      return
    }

    const subdomain = getSubdomain(parsedUrl, options.hosts?.tenants ?? [])
    const urlParams: UrlParams = {
      scheme: parsedUrl.protocol.slice(0, -1),
      host: parsedUrl.host,
      root: parsedUrl.origin,
      domain: subdomain ? parsedUrl.hostname.slice(subdomain.length + 1) : undefined,
    }
    // An undefined value the caller passes leaves the one of the page in place.
    const withUrlParams = (params: UrlParams = {}): UrlParams => {
      return { ...urlParams, ...trimObject(params) }
    }

    return {
      build: (key, params, select) => build(key, withUrlParams(params), select),
      buildAll: (key, params, select) => buildAll(key, withUrlParams(params), select),
    }
  }

  return { rows: rows.map(copyRow), build, buildAll, read, getMainUrl, forUrl }
}

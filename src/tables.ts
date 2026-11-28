import {
  decodePercent,
  escapeRegex,
  getRegistrableDomain,
  isAnyOf,
  isFunction,
  isHostOf,
  isHttpUrl,
  isLooseMatch,
  isPlainObject,
  isString,
  omit,
  parseUrl,
  startsWithAnyOf,
  stripWww,
  t,
  trimObject,
} from 'trousse'
import locales from './locales.json' with { type: 'json' }
import {
  appendValue,
  decodeQueryValue,
  encodeText,
  entityPrefix,
  isEntityPair,
  isNamed,
  parseQuery,
  type QueryPair,
  readAmpersandEntities,
  readSemicolons,
  readUrlQuery,
  toPair,
  toUrlQuery,
  type UrlQuery,
  writeQuery,
} from './queries.js'
import {
  type CheckNames,
  validateCaseMark,
  validateCheckNames,
  validateCheckRegex,
  validateEntityNames,
  validateListNames,
  validateListSplit,
  validateOpenTail,
  validateOpenTailPlacement,
  validateSemicolons,
  validateTenantHost,
} from './rules.js'
import {
  basePlaceholder,
  type CompiledTemplate,
  compileTemplate,
  decodePath,
  dotSegmentRegex,
  encodeLiteral,
  type ListSplit,
  type MapText,
  mapTemplate,
  openTailName,
  type ParsedTemplate,
  parseTemplate,
  placeholderRegex,
  schemePlaceholder,
  sharedPartMaxLength,
  splitPath,
  type TemplatePart,
  toAsciiHost,
  toBareName,
  toLengthGuard,
  toRegexSource,
  toSegments,
  toStrictPair,
  toValueText,
  toWrittenOffset,
  trailingSlashRegex,
  writeBase,
} from './templates.js'
import type {
  UrlEncoding,
  UrlHostCheck,
  UrlHosts,
  UrlKeyMatch,
  UrlLenient,
  UrlMatch,
  UrlReadOptions,
  UrlRow,
  UrlTable,
  UrlTableOptions,
  UrlValue,
  UrlValues,
} from './types.js'

// One URL of a row: its main one or an alias.
type RowTemplate = {
  rowIndex: number
  isAlias: boolean
  // The placeholders but the open tail, a list as `name*`.
  names: Array<string>
  // The query parameters the template sets itself, and the ones a URL may carry, as `{?q}`.
  ownNames: Array<string>
  optionalNames: Array<string>
  // The placeholders of the host, which a URL reads in any case.
  hostNames: Array<string>
  // The parameters the template sets to a fixed value, as `alt=rss`, and the ones it reads a
  // value from, as `id={id}`.
  fixedQuery: Array<[name: string, value: string]>
  valueNames: Array<string>
  // The values the template reads from a pair it sets itself or a flag of it, or undefined where
  // the pair holds another value than the template takes.
  readOwnPair: (pair: QueryPair) => Array<[name: string, value: string]> | undefined
  // The host and path a URL the template takes matches, as given and with an optional `www`.
  asGivenRegex: RegExp
  optionalWwwRegex: RegExp
  hostHint?: HostHint
  // The values of a URL the template takes, read as given or with an optional `www`, and with the
  // other trailing slash where its mark covers the template. A row read on the stand-in host gets
  // the scheme, host and base the URL is read under.
  readParams: (
    tableUrl: TableUrl,
    isWwwOptional: boolean,
    isSlashLoose: boolean,
    base?: UrlValues,
  ) => Record<string, UrlValue> | undefined
  // The values of a URL in the spelling it has, read only from a URL written as the template is:
  // the same case, the same trailing slash, each own parameter once and under its own name. A
  // spelling a mark covers is read in the template's, with the path and the pairs written that way.
  // A respelled read takes the other trailing slash and fixed text in another case too, where a
  // mark covers them.
  readRawParams: (
    tableUrl: TableUrl,
    isWwwOptional: boolean,
    params: Record<string, UrlValue>,
    isRespelled: boolean,
  ) => RawRead | undefined
  // Whether the trailing slash mark covers the template.
  isSlashFree: boolean
  // The template's URL with values written as they were read, and the pairs no row names kept.
  getRawUrl: (rawRead: RawRead, keptPairs: Array<QueryPair>) => RawUrl | undefined
  // The origin of a template that writes `https` itself, with the host values as the URL has them.
  getHttpsOrigin: (rawParams: RawParams) => string | undefined
  passesChecks: (params: Record<string, UrlValue>) => boolean
  // The path without its trailing slash and the own parameter names, with every value left out,
  // and whether the path has an open tail. Two templates of one shape differ only in their values
  // and host, as two rows for two values of `format`.
  shape: string
  // The length of the text a URL the template takes holds outside its values, the trailing slash
  // of the path left out.
  fixedTextLength: number
  // The path segments in front of an open tail or a reserved value, and infinity for a template
  // without one.
  openDepth: number
  // The value that takes the rest of a URL, its query included, as `url` of `/proxy/{+url}`.
  restName?: string
  // Whether the template writes a fragment, which a URL it takes has to carry.
  hasFragment: boolean
  // The flags whose name holds a value, as `?article{id}`, and whether a pair is one of them.
  nameFlagCount: number
  isFlagPair: (pair: QueryPair) => boolean
  // The pairs in the order the template writes them, and every other pair behind them as given.
  orderPairs: (pairs: Array<QueryPair>) => Array<QueryPair>
  // The value that takes every pair no other part names, as `query` of `{?query*}`.
  passedName?: string
  // Every value the template writes, the names a check or a case mark may give.
  checkNames: Array<string>
  getUrl: (params?: UrlValues, encoding?: UrlEncoding) => string | undefined
}

type HostEntry = string | RegExp | UrlHostCheck

// The hosts a template can take, as whole hosts and as endings.
type HostHint = {
  names: Array<string>
  suffixes: Array<string>
}

// A check of the table gets the value alone, and one of a row the values read beside it.
type CheckFunction<Rest extends Array<unknown> = []> = (value: string, ...rest: Rest) => boolean

type RowCheckFunction = CheckFunction<[params: Record<string, string>]>

// A value as the URL spells it, with the part of the URL it was read from.
type RawParams = Record<string, { value: string; part: TemplatePart }>

// A URL read in its own spelling: its values, and its path and pairs as the template writes them.
type RawRead = {
  params: RawParams
  // The values read, in lowercase where a case mark covers them.
  values: Record<string, UrlValue>
  pathname: string
  pairs: Array<QueryPair>
  // Whether the URL has the other trailing slash or fixed text in another case, which a main URL
  // writes as the template does.
  isRespelled: boolean
}

// A URL a template writes from raw values, before its query: the pairs are written sorted.
type RawUrl = {
  base: string
  pairs: Array<QueryPair>
  // The fragment of a template that writes one, with its `#`.
  hash?: string
}

// A URL as the templates read it: the host joined to the decoded path without its trailing slash,
// and the query, parsed by the first template that takes the host and path.
type TableUrl = {
  url: URL
  // Read once, since every table asks for it and `URL` writes it anew on each read.
  hostname: string
  hostPath: string
  // Whether the path ends in a slash, which `hostPath` leaves out.
  isSlashed: boolean
  query?: UrlQuery
}

const leadingSlashesRegex = /^\/{2,}/
const anchorsRegex = /^\^|\$$/g
// A value every part of a URL reads the same way, so it can move from one part to another.
const plainValueRegex = /^[\w.~-]+$/
const captureRegex = /\(\?<p\d+>/g
const escapeSplitRegex = /(%[0-9a-f]{2})/i
const percentEscapeRegex = /%[0-9a-f]{2}/gi
const fixedPathTextRegex = /[^/]/

// The host a `{host}` row is read on in any-host reads, with the path behind the base as its path.
const standInOrigin = 'https://root.invalid'
const hostPlaceholder = '{host}'
// An install sits at most a few segments deep, and each base tried is one more pass over the URL.
const maxBasePathSegments = 8
const anyDomainSource = '[^./]+(?:\\.[^./]+)+'

// A placeholder in a template's shape: its name left out, its reach over several segments kept.
const toShapePlaceholder = (_: string, name: string): string => {
  return name.endsWith('*') ? '{*}' : '{}'
}

// A value in lowercase, with its percent escapes as written.
const toLowerCaseValue = (value: string): string => {
  return value
    .split(escapeSplitRegex)
    .map((piece, index) => (index % 2 === 1 ? piece : piece.toLowerCase()))
    .join('')
}

// A text with the hex of its escapes in uppercase, as a template writes them.
const toUpperCaseEscapes = (text: string): string => {
  return text.replace(percentEscapeRegex, (triplet) => triplet.toUpperCase())
}

const asciiUpperCaseRegex = /[A-Z]+/g

// A value with its ASCII letters in lowercase, as a rewrite lowercases a URL whose other letters
// are percent escapes.
const toAsciiLowerCase = (value: UrlValue): UrlValue => {
  const lowercase = (text: string) => {
    return text.replace(asciiUpperCaseRegex, (letters) => letters.toLowerCase())
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([name, text]) => {
        return [name, isString(text) ? lowercase(text) : text.map(lowercase)]
      }),
    )
  }

  return Array.isArray(value) ? value.map(lowercase) : lowercase(value)
}

const toCheckParams = (params: Record<string, UrlValue>): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, toValueText(value)]),
  )
}

// The values with each one the case mark covers in lowercase, as its main URL holds it. A value
// whose table or row check refuses the lowercase, as `en-US`, stays as written.
const lowercaseMarked = (
  params: Record<string, UrlValue>,
  caseNames: Array<string> | undefined,
  checks: Record<string, CheckFunction>,
  rowChecks: Record<string, RowCheckFunction>,
): Record<string, UrlValue> => {
  const values = { ...params }

  for (const name of caseNames ?? []) {
    const value = values[name]

    if (value === undefined) {
      continue
    }

    const lowercase = toAsciiLowerCase(value)
    const text = toValueText(lowercase)
    const lowercaseParams = toCheckParams({ ...values, [name]: lowercase })

    if (checks[name]?.(text) === false || rowChecks[name]?.(text, lowercaseParams) === false) {
      continue
    }

    values[name] = lowercase
  }

  return values
}

// Two values read the same: two strings, or two lists of the same segments.
const isSameValue = (
  left: UrlValue | undefined,
  right: UrlValue | undefined,
  isSame: (left: string, right: string) => boolean,
): boolean => {
  if (left === right) {
    return true
  }

  // A passed query reads the same under each name, in any order of the names.
  if (isPlainObject(left) && isPlainObject(right)) {
    const names = Object.keys(left)

    return (
      names.length === Object.keys(right).length &&
      names.every((name) => isSameValue(left[name], right[name], isSame))
    )
  }

  if (!Array.isArray(left) || !Array.isArray(right)) {
    return isString(left) && isString(right) && isSame(left, right)
  }

  return (
    left.length === right.length && left.every((segment, index) => isSame(segment, right[index]))
  )
}

const portRegex = /:\d+$/

// Whether the path behind the base holds fixed text, as `viewtopic.php`, which shows where the
// base ends. A path of values alone fits behind a base of any length.
const hasFixedPath = (parsed: ParsedTemplate): boolean => {
  return fixedPathTextRegex.test(parsed.path.replace(placeholderRegex, ''))
}

// The names a set of checks gives a check, past the ones left undefined.
const toGivenNames = (checks: Record<string, unknown> = {}): Array<string> => {
  return Object.keys(checks).filter((name) => checks[name] !== undefined)
}

// Every check as a function.
const toCheckFunctions = <Rest extends Array<unknown>>(
  checks: Record<string, CheckFunction<Rest> | RegExp | undefined> = {},
): Record<string, CheckFunction<Rest>> => {
  const functions: Record<string, CheckFunction<Rest>> = {}

  for (const [name, check] of Object.entries(checks)) {
    if (!check) {
      continue
    }

    if (isFunction(check)) {
      functions[name] = check

      continue
    }

    validateCheckRegex(name, check)

    // The anchors bind the whole pattern only where no `|` sits outside a group, as in `^\d+|x$`.
    const wholeRegex = new RegExp(`^(?:${check.source})$`, check.flags)

    functions[name] = (value, ..._rest) => wholeRegex.test(value)
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

  if (row.checks) {
    copy.checks = { ...row.checks }
  }

  if (row.lenient) {
    copy.lenient = { ...row.lenient }
  }

  return copy
}

const toTableUrl = (url: URL): TableUrl => {
  // A doubled slash after the host names the same feed: pages link `host//feed` for `host/feed`.
  const path = url.pathname.replace(leadingSlashesRegex, '/')
  const hostPath = url.hostname + decodePath(path)

  return {
    url,
    hostname: url.hostname,
    hostPath: hostPath.replace(trailingSlashRegex, ''),
    isSlashed: hostPath.endsWith('/'),
  }
}

// A table, and the read its any-host reads use: on the stand-in host, under the scheme, host and
// base the URL is read under.
type ReadStandIn<Key extends string, Row> = (
  url: string,
  base: UrlValues,
) => UrlMatch<Key, Row> | undefined

type TableParts<Key extends string, Row> = {
  table: UrlTable<Key, Row>
  readStandIn: ReadStandIn<Key, Row>
  // The names the row checks and the case mark give, checked on the table given, not a stand-in.
  checkNames: CheckNames
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

// One pattern any of the patterns matches, so a table reads a URL on none of its rows at once.
const joinRegexes = (regexes: Array<RegExp>): RegExp => {
  // A capture is named, and a name may appear once in a pattern.
  const sources = regexes.map((regex) => `(?:${regex.source.replace(captureRegex, '(?:')})`)

  // Rows that differ only in their query share one host and path pattern.
  return new RegExp([...new Set(sources)].join('|') || '(?!)', 'i')
}

// A host or domain entry as a regex source: a string as a literal, a pattern without its anchors,
// and a function as any domain, which `isListedHost` checks after the match.
const toEntrySource = (entry: HostEntry): string => {
  if (isFunction(entry)) {
    return anyDomainSource
  }

  if (isString(entry)) {
    return escapeRegex(entry)
  }

  // Each alternative loses its own anchors, so `^\d+$|^x$` reads as `\d+|x` inside the group.
  const alternatives = splitAlternatives(entry.source).map((alternative) => {
    return alternative.replace(anchorsRegex, '')
  })

  return `(?:${alternatives.join('|')})`
}

// The alternatives of a pattern outside any group or class, as `^\d+$` and `^x$` of `^\d+$|^x$`.
const splitAlternatives = (source: string): Array<string> => {
  const alternatives: Array<string> = []
  let alternative = ''
  let depth = 0
  let isInClass = false

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    // An escape is taken whole, so `\|` and `\(` stay text.
    const piece = char === '\\' ? source.slice(index, index + 2) : char

    index += piece.length - 1

    if (char === '|' && depth === 0 && !isInClass) {
      alternatives.push(alternative)
      alternative = ''

      continue
    }

    alternative += piece

    if (isInClass) {
      isInClass = char !== ']'

      continue
    }

    if (char === '[') {
      isInClass = true
    }

    if (char === '(') {
      depth += 1
    }

    if (char === ')') {
      depth -= 1
    }
  }

  return [...alternatives, alternative]
}

// The host strings as a parsed URL spells them, so one written in Unicode or capitals matches.
const toAsciiHosts = (hosts: UrlHosts | undefined): UrlHosts | undefined => {
  if (!hosts) {
    return
  }

  const toAsciiEntries = (entries: Array<HostEntry> | undefined): Array<HostEntry> | undefined => {
    return entries?.map((entry) => (isString(entry) ? toAsciiHost(entry) : entry))
  }

  return {
    exact: toAsciiEntries(hosts.exact),
    tenant: toAsciiEntries(hosts.tenant),
    subdomain: toAsciiEntries(hosts.subdomain),
  }
}

const isListedIn = (value: string, entries: Array<HostEntry> = []): boolean => {
  return entries.some((entry) => {
    return isFunction(entry) ? entry(value) : isHostOf(`https://${value}`, entry)
  })
}

// A host and every domain above it, as `a.b.example.com`, `b.example.com`, `example.com`, `com`.
const toParentDomains = (host: string): Array<string> => {
  const labels = host.split('.')

  return labels.map((_label, index) => labels.slice(index).join('.'))
}

// Whether a host, with or without `www`, is an exact host, one label under a tenant domain, or a
// subdomain entry or any host under one. `www` is a tenant's label only where it can be a tenant.
const isListedHost = (host: string, options: UrlTableOptions): boolean => {
  const bareHost = stripWww(host)
  const tenantHosts = options.isWwwTenant ? [host, bareHost] : [bareHost]
  const parentDomains = tenantHosts.map((form) => form.slice(form.indexOf('.') + 1))

  return (
    isListedIn(host, options.hosts?.exact) ||
    isListedIn(bareHost, options.hosts?.exact) ||
    parentDomains.some((domain) => isListedIn(domain, options.hosts?.tenant)) ||
    toParentDomains(host).some((domain) => isListedIn(domain, options.hosts?.subdomain))
  )
}

// The nearest parent domain of a host that `tenant` lists.
const getTenantDomain = (host: string, tenants: Array<HostEntry> = []): string | undefined => {
  for (let index = host.indexOf('.'); index !== -1; index = host.indexOf('.', index + 1)) {
    if (isListedIn(host.slice(index + 1), tenants)) {
      return host.slice(index + 1)
    }
  }
}

// A host that is its own registrable domain, as `example.com` and not `blog.example.com`.
const isApexHost = (host: string): boolean => {
  return getRegistrableDomain(`https://${host}`) === host
}

// A template as two functions: the values of a URL it takes, and its URL for a page's values.
const compileRowTemplate = (
  template: string,
  { key, checks: givenRowChecks, lenient: rowLenient }: UrlRow,
  rowIndex: number,
  isAlias: boolean,
  options: UrlTableOptions,
  checks: Record<string, CheckFunction>,
  rowChecks: Record<string, RowCheckFunction>,
  lenient: UrlLenient | undefined,
  hasAmpersandMark: boolean,
): RowTemplate => {
  const built = parseTemplate(template)
  const hasBase = built.path.startsWith(basePlaceholder)
  // A table reads a URL on its own hosts, where the base is empty, so its rows read without it.
  const parsed: ParsedTemplate = hasBase
    ? {
        ...built,
        text: built.text.replace(basePlaceholder, ''),
        path: built.path.slice(basePlaceholder.length),
        names: built.names.filter((name) => name !== 'base*'),
      }
    : built
  const { scheme, host, path, isOpen, reservedNames, restName, listSplit } = parsed

  validateListSplit(key, listSplit, [...Object.keys(checks), ...Object.keys(rowChecks)])

  // A reserved value that ends a template takes whatever follows, as an open tail does.
  const isOpenEnded = isOpen || restName !== undefined

  validateOpenTailPlacement(key, parsed)

  const ownNames = parsed.params.map((param) => param.name)

  validateEntityNames(key, parsed.params, hasAmpersandMark)
  validateSemicolons(key, parsed.search, lenient)

  const hosts = options.hosts?.exact ?? []
  const tenantDomains = (options.hosts?.tenant ?? []).map((domain) => toEntrySource(domain))
  const domainSource = `(?:${tenantDomains.join('|')})`
  // One host label other than `www` unless `www` is a tenant.
  const tenantSource = options.isWwwTenant ? '[^./]+' : '(?!www\\.)[^./]+'

  const subdomains = options.hosts?.subdomain ?? []
  const hasHosts = hosts.length > 0 || tenantDomains.length > 0 || subdomains.length > 0
  const hasHostCheck = [...hosts, ...(options.hosts?.tenant ?? []), ...subdomains].some(isFunction)

  validateTenantHost(key, host, tenantDomains.length)
  validateOpenTail(key, parsed)
  validateCaseMark(key, parsed, lenient)

  // Two values in one segment or flag name: one whose check is a pattern is read by that pattern.
  // A URL read as written is matched case-sensitively, so a pattern of any case stays out of it.
  const pathPatterns: Record<string, string> = {}
  const writtenPathPatterns: Record<string, string> = {}

  for (const segment of [...splitPath(path), ...parsed.nameFlags]) {
    const segmentNames = [...segment.matchAll(placeholderRegex)].map(([, name]) => name)

    for (const name of segmentNames.length > 1 ? segmentNames : []) {
      const check = givenRowChecks?.[name] ?? options.checks?.[name]

      if (check instanceof RegExp && isAnyOf(check.flags, ['', 'i'])) {
        pathPatterns[name] = toEntrySource(check)
      }

      if (check instanceof RegExp && !check.flags) {
        writtenPathPatterns[name] = toEntrySource(check)
      }
    }
  }

  const compiled: CompiledTemplate = compileTemplate(
    parsed,
    pathPatterns,
    writtenPathPatterns,
    lenient,
  )
  const builtCompiled = hasBase
    ? compileTemplate(built, pathPatterns, writtenPathPatterns, lenient)
    : compiled
  const ownParams = compiled.params
  const { getCaptured } = compiled
  const hasRowChecks = Object.keys(rowChecks).length > 0
  const passesChecks = (listParams: Record<string, UrlValue>): boolean => {
    const params = toCheckParams(listParams)

    return Object.entries(params).every(([name, value]) => {
      return (checks[name]?.(value) ?? true) && (rowChecks[name]?.(value, params) ?? true)
    })
  }
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
      // A subdomain entry is itself and any host under it, at any depth.
      ...subdomains.map((value) => `(?:[^./]+\\.)*${toEntrySource(value)}`),
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
      compiled.captureIn('host'),
      { source: tenantSource, unit: '[^./]' },
      hostCaptures,
    )
    // A host label holding two values or more limits the host as a path segment does.
    const hasSharedLabel = host.split('.').some((label) => {
      return [...label.matchAll(placeholderRegex)].length > 1
    })
    const hostGuard = hasSharedLabel ? toLengthGuard(sharedPartMaxLength, '/') : ''
    const prefixSource = `${hostGuard}${fixedPrefixSource}${tenantPrefixSource}`

    if (isPageFixedHost) {
      const forms = listedForms.length > 0 ? listedForms : [host]
      const sources = isApexHost(bareHost) ? [toPageHostSource(bareHost)] : forms.map(escapeRegex)

      return new RegExp(`^(?:${sources.join('|')})${pathPattern}$`, flags)
    }

    return new RegExp(`^${prefixSource}${hostSource}${pathPattern}$`, flags)
  }
  // A URL that lacks the fixed text ending a template with a segment of several values is refused
  // before any split of that segment is tried.
  const hasSharedSegment = splitPath(path).some((segment) => {
    return [...segment.matchAll(placeholderRegex)].length > 1
  })
  const toEndingGuard = (text: string, mapLiteral: MapText): string => {
    if (!hasSharedSegment || isOpenEnded) {
      return ''
    }

    const ending = mapLiteral(text.split(placeholderRegex).at(-1) ?? '')

    if (!ending) {
      return ''
    }

    return `(?=[^]*${escapeRegex(ending)}$)`
  }
  const readEndingGuard = toEndingGuard(path.replace(trailingSlashRegex, ''), decodePath)
  const readPathSource = `${readEndingGuard}${compiled.readPathSource}`
  const rawPathSource = `${toEndingGuard(path, encodeLiteral)}${compiled.rawPathSource}`
  // A reserved value is read from where its match sits in the URL.
  const readFlags = reservedNames.length > 0 ? 'di' : 'i'
  const asGivenRegex = toHostPathRegex(false, readPathSource, readFlags)
  const optionalWwwRegex = toHostPathRegex(true, readPathSource, readFlags)
  // Matched on the path as given, with the indices a case mark lowercases.
  const rawAsGivenRegex = toHostPathRegex(false, rawPathSource, 'd')
  const rawOptionalWwwRegex = toHostPathRegex(true, rawPathSource, 'd')
  // A path that ends open takes any slash behind it, and an empty path is the root a URL always has.
  const hasSlash = path && !isOpenEnded ? path.endsWith('/') : undefined
  const isSlashFree =
    hasSlash !== undefined && (rowLenient?.trailingSlash ?? lenient?.trailingSlash) === true
  const isFixedCaseFree = lenient?.fixedCase === true
  const fixedParams = ownParams.filter((param) => !param.value.includes('{'))
  const flagShapes = parsed.nameFlags.map((text) =>
    text.replace(placeholderRegex, toShapePlaceholder),
  )
  const shapeNames = [...ownNames, ...flagShapes]
    .map((name) => name.toLowerCase())
    .sort((left, right) => left.localeCompare(right))
  const shapeQuery = shapeNames.join('&')
  // The shape leaves the trailing slash out, so a twin under the slash mark shares it, and two
  // templates that take one URL take it on one host.
  const readPath = path.replace(trailingSlashRegex, '')
  const shapePath = readPath.replace(placeholderRegex, toShapePlaceholder)
  const readText = `${scheme}${host}${readPath}${parsed.search ?? ''}`
  // A `#` is in no template, so an open template shares its shape with no template that is not.
  const shape = `${shapePath}${isOpenEnded ? '#' : ''}?${shapeQuery}`

  const toHostNames = (value: string): Array<string> => {
    const bare = stripWww(value.toLowerCase())

    return [value.toLowerCase(), bare, `www.${bare}`]
  }
  // The hosts the template can take, or undefined where a pattern or a function can take any.
  const toHostHint = (): HostHint | undefined => {
    const tenantEntries = options.hosts?.tenant ?? []

    if (!host.includes('{')) {
      return { names: toHostNames(host), suffixes: [] }
    }

    if (host === hostPlaceholder || host.includes('{domain}')) {
      const isHostOnly = host === hostPlaceholder

      const hostEntries = isHostOnly ? [...hosts, ...subdomains] : []

      if (!tenantEntries.every(isString) || !hostEntries.every(isString)) {
        return
      }

      const domains = tenantEntries.filter(isString).map((domain) => domain.toLowerCase())
      const names = hostEntries.filter(isString).flatMap(toHostNames)
      // A host under a subdomain entry ends in it, as one under a tenant domain does.
      const parents = isHostOnly
        ? subdomains.filter(isString).map((entry) => entry.toLowerCase())
        : []

      return {
        names: [...names, ...domains.flatMap(toHostNames)],
        suffixes: [...domains, ...parents].map((domain) => `.${domain}`),
      }
    }

    const suffix = host.slice(host.lastIndexOf('}') + 1).toLowerCase()

    if (host.includes(hostPlaceholder) || !suffix.startsWith('.')) {
      return
    }

    return { names: [], suffixes: [suffix] }
  }

  // A `{host}` row of a table without hosts serves any site, so nothing in its URL names the
  // platform, and only an any-host read takes it.
  const claimsUrls = !host.includes(hostPlaceholder) || hasHosts
  // The segments in front of whatever ends the path open.
  const openDepth = splitPath(path).length - (restName === undefined ? 0 : 1)
  // A reserved value is read as the URL spells it, so a URL it holds stays that URL: the text its
  // match took, and for the one that ends the template the query and the fragment behind it too.
  const readWritten = (
    tableUrl: TableUrl,
    name: string,
    range: [number, number],
  ): string | undefined => {
    const writtenPath = tableUrl.url.pathname.replace(leadingSlashesRegex, '/')
    const hostLength = tableUrl.hostname.length
    const start = toWrittenOffset(writtenPath, range[0] - hostLength)
    const end = toWrittenOffset(writtenPath, range[1] - hostLength)

    // A match that ends inside a character as written has no text of its own there.
    if (start === undefined || end === undefined) {
      return
    }

    if (name !== restName) {
      return writtenPath.slice(start, end)
    }

    const { pairs, hash } = readQuery(tableUrl)

    return `${writtenPath.slice(start)}${writeQuery(pairs)}${hash}`
  }

  const readReserved = (
    match: RegExpExecArray,
    tableUrl: TableUrl,
    params: Record<string, UrlValue>,
  ): boolean => {
    for (const [group, range] of Object.entries(match.indices?.groups ?? {})) {
      const name = getCaptured(group)?.name

      if (!range || name === undefined || !reservedNames.includes(name)) {
        continue
      }

      const value = readWritten(tableUrl, name, range)

      if (value === undefined) {
        return false
      }

      params[name] = value
    }

    return true
  }

  // Each split of the segments a list and the reserved value behind it share is tried, and the
  // first one every check passes is read. The value with the check takes all it can: a checked
  // list its most segments first, and the value behind an unchecked list the fewest list segments.
  const readListSplit = (
    split: ListSplit,
    match: RegExpExecArray,
    tableUrl: TableUrl,
    params: Record<string, UrlValue>,
  ): Record<string, UrlValue> => {
    // The row took the URL, so its match holds both values.
    const findRange = (name: string): [number, number] => {
      const ranges = Object.entries(match.indices?.groups ?? {})
      const found = ranges.find(([group, range]) => range && getCaptured(group)?.name === name)

      return found?.[1] ?? [0, 0]
    }
    const listRange = findRange(split.list)
    const reservedRange = findRange(split.reserved)
    const segments = match.input.slice(listRange[0], reservedRange[1]).split('/')
    const writtenPath = tableUrl.url.pathname.replace(leadingSlashesRegex, '/')
    const hostLength = tableUrl.hostname.length
    // The row read the reserved value as written already, so both ends fall between characters.
    const listStart = toWrittenOffset(writtenPath, listRange[0] - hostLength) as number
    const end = toWrittenOffset(writtenPath, reservedRange[1] - hostLength) as number

    // Decoding writes no slash, so the segments as written are the segments read, one for one.
    const writtenSegments = writtenPath.slice(listStart, end).split('/')
    const writtenStarts = [listStart + 1]

    for (const [index, segment] of writtenSegments.entries()) {
      writtenStarts.push(writtenStarts[index] + segment.length + (index > 0 ? 1 : 0))
    }

    let rest = ''

    if (split.reserved === restName) {
      const { pairs, hash } = readQuery(tableUrl)

      rest = `${writtenPath.slice(end)}${writeQuery(pairs)}${hash}`
    }

    const hasListCheck = (checks[split.list] ?? rowChecks[split.list]) !== undefined
    const counts = [...segments.keys()]

    for (const count of hasListCheck ? counts.reverse() : counts) {
      const list = segments
        .slice(0, count)
        .filter((segment) => segment)
        .map(decodePercent)
      const reserved = `${writtenPath.slice(writtenStarts[count], end)}${rest}`

      if (list.length === 0 || !reserved) {
        continue
      }

      const candidate = { ...params, [split.list]: list, [split.reserved]: reserved }

      if (passesChecks(candidate)) {
        return candidate
      }
    }

    return params
  }

  const readParams: RowTemplate['readParams'] = (tableUrl, isWwwOptional, isSlashLoose, base) => {
    const { url, hostPath } = tableUrl

    if (
      hasSlash !== undefined &&
      tableUrl.isSlashed !== hasSlash &&
      !(isSlashLoose && isSlashFree)
    ) {
      return
    }

    const match = claimsUrls && (isWwwOptional ? optionalWwwRegex : asGivenRegex).exec(hostPath)

    if (!match) {
      return
    }

    const params = compiled.read(match.groups, () => readQuery(tableUrl).searchParams)

    if (!params) {
      return
    }

    // A template that writes a fragment takes only a URL with one it reads.
    if (parsed.fragment !== undefined) {
      const fragmentValues = compiled.readFragment(url.hash.slice(1))

      if (!fragmentValues) {
        return
      }

      Object.assign(params, { ...fragmentValues, ...params })
    }

    // A function among the hosts matched any domain, so the host read is checked by it.
    if (hasHostCheck && ('host' in params || 'domain' in params)) {
      const isListed = isString(params.domain)
        ? isListedIn(params.domain, options.hosts?.tenant)
        : isListedHost(url.hostname, options)

      if (!isListed) {
        return
      }
    }

    // A host is read with its port, as `forSite` fills it.
    if ('host' in params) {
      params.host = url.host
    }

    if (scheme === schemePlaceholder) {
      params.scheme = url.protocol.slice(0, -1)
    }

    if (reservedNames.length > 0 && !readReserved(match, tableUrl, params)) {
      return
    }

    // A row read under a base sits on the stand-in host, and its checks see the host and base.
    if (base) {
      Object.assign(params, base)
    }

    return listSplit ? readListSplit(listSplit, match, tableUrl, params) : params
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

  // The text a match ran on and its values, in lowercase where the read holds them in lowercase.
  const lowercaseValues = (
    match: RegExpExecArray,
    params: Record<string, UrlValue>,
    lowercaseParams: Record<string, UrlValue>,
  ) => {
    const groups = { ...match.groups }
    let text = match.input

    for (const [group, range] of Object.entries(match.indices?.groups ?? {})) {
      const captured = getCaptured(group)

      if (!range || !captured || lowercaseParams[captured.name] === params[captured.name]) {
        continue
      }

      const value = toLowerCaseValue(text.slice(range[0], range[1]))

      groups[group] = value
      text = `${text.slice(0, range[0])}${value}${text.slice(range[1])}`
    }

    return { text, groups }
  }

  // A path with the trailing slash the template writes, where the slash mark covers it.
  const respellSlash = (pathname: string): string => {
    if (!isSlashFree) {
      return pathname
    }

    const bare = pathname.replace(trailingSlashRegex, '')

    return hasSlash ? `${bare}/` : bare
  }

  const readRawParams: RowTemplate['readRawParams'] = (
    tableUrl,
    isWwwOptional,
    params,
    isRespelled,
  ) => {
    const { url } = tableUrl
    const { pairs } = readQuery(tableUrl)
    const isCaseFree = isRespelled && isFixedCaseFree
    const toRawRegex = (rawRegex: RegExp): RegExp => {
      return isCaseFree ? new RegExp(rawRegex.source, `${rawRegex.flags}i`) : rawRegex
    }
    const regex = toRawRegex(isWwwOptional ? rawOptionalWwwRegex : rawAsGivenRegex)
    const pathname = isRespelled ? respellSlash(url.pathname) : url.pathname
    const match = regex.exec(url.hostname + pathname)
    const rawParams: RawParams = {}

    if (!match) {
      return
    }

    const lowercaseParams = lowercaseMarked(params, lenient?.case, checks, rowChecks)
    const respelledHostPath = lowercaseValues(match, params, lowercaseParams)

    if (!readRawGroups(rawParams, respelledHostPath.groups)) {
      return
    }

    const respelledPairs = [...pairs]
    // A parameter given twice or under another spelling than the row builds or names it by, as
    // another case, is read differently from server to server.
    const isGivenOnce = (name: string, spellings: Array<string>): boolean => {
      const named = pairs.filter((pair) => isNamed(pair, name))

      const isSpelled = (pair: QueryPair): boolean => {
        const rawName = toUpperCaseEscapes(pair.rawName)

        return isCaseFree ? isAnyOf(rawName, spellings) : spellings.includes(rawName)
      }

      return named.length < 2 && named.every(isSpelled)
    }

    for (const name of parsed.optionalNames) {
      const pair = pairs.find((given) => isNamed(given, name))

      if (!isGivenOnce(name, [name])) {
        return
      }

      if (pair && params[name] !== undefined) {
        rawParams[name] = { value: pair.rawValue ?? '', part: 'query' }
      }
    }

    for (const param of ownParams) {
      if (!isGivenOnce(param.name, [param.writtenName, param.name])) {
        return
      }

      // The row took the URL, so a pair under each own name is there.
      const index = pairs.findIndex((pair) => isNamed(pair, param.name))
      const { rawName, rawValue } = pairs[index]

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

      const queryMatch = toRawRegex(param.rawRegex).exec(rawValue ?? '')

      if (!queryMatch) {
        return
      }

      const respelledValue = lowercaseValues(queryMatch, params, lowercaseParams)

      if (!readRawGroups(rawParams, respelledValue.groups)) {
        return
      }

      if (respelledValue.text !== rawValue) {
        respelledPairs[index] = toPair(`${rawName}=${respelledValue.text}`)
      }
    }

    const flagRegexes = compiled.nameFlags.map((flag) => toRawRegex(flag.rawRegex))
    const isFlagShaped = (pair: QueryPair): boolean => {
      return !pair.rawValue && flagRegexes.some((flagRegex) => flagRegex.test(pair.rawName))
    }
    const flagIndexes = new Set<number>()

    // A flag whose name holds a value is the first pair with no value its name pattern takes that
    // no earlier flag took.
    for (const flagRegex of flagRegexes) {
      const index = pairs.findIndex((pair, pairIndex) => {
        return !flagIndexes.has(pairIndex) && !pair.rawValue && flagRegex.test(pair.rawName)
      })
      const flagMatch = index === -1 ? null : flagRegex.exec(pairs[index].rawName)

      if (!flagMatch) {
        return
      }

      const respelledName = lowercaseValues(flagMatch, params, lowercaseParams)

      if (!readRawGroups(rawParams, respelledName.groups)) {
        return
      }

      // A flag written with an equals sign and no value, as `?article12=`, is the flag.
      respelledPairs[index] = toPair(respelledName.text)
      flagIndexes.add(index)
    }

    // A flag given twice, as `?article12&article13`, is read differently from server to server.
    if (pairs.some((pair, index) => !flagIndexes.has(index) && isFlagShaped(pair))) {
      return
    }

    if (parsed.fragment !== undefined) {
      const rawFragment = compiled.readRawFragment(url.hash.slice(1))
      const hasOtherValue = Object.entries(rawFragment ?? {}).some(([name, value]) => {
        return rawParams[name] !== undefined && rawParams[name].value !== value
      })

      if (!rawFragment || hasOtherValue) {
        return
      }

      for (const [name, value] of Object.entries(rawFragment)) {
        rawParams[name] = { value, part: 'fragment' }
      }
    }

    if ('host' in rawParams) {
      rawParams.host.value = url.host
    }

    if (scheme === schemePlaceholder) {
      rawParams.scheme = { value: url.protocol.slice(0, -1), part: 'host' }
    }

    return {
      params: rawParams,
      values: lowercaseParams,
      pathname: respelledHostPath.text.slice(url.hostname.length),
      pairs: respelledPairs,
      isRespelled,
    }
  }

  const getRawUrl: RowTemplate['getRawUrl'] = (rawRead, keptPairs) => {
    const rawParams = rawRead.params
    let isFilled = true
    // A value moved to another part of the URL is written as a pretty build writes it there. A
    // host takes only a value every part reads the same way.
    const fillValue = (name: string, part: TemplatePart): string => {
      const rawParam = rawParams[name]
      const value = rawRead.values[name]

      if (!rawParam) {
        isFilled = false

        return ''
      }

      if (rawParam.part === part || plainValueRegex.test(rawParam.value)) {
        return rawParam.value
      }

      if (part === 'host' || !isString(value)) {
        isFilled = false

        return ''
      }

      return compiled.encodeValue(value, part)
    }
    const fill = (text: string, part: TemplatePart, mapLiteral?: MapText): string => {
      const fillPlaceholder = (placeholder: string): string => {
        return fillValue(toBareName(placeholder), part)
      }

      return mapTemplate(text, fillPlaceholder, mapLiteral)
    }
    const origin = `${fill(scheme, 'host')}://${fill(host, 'host')}`
    const pairs = ownParams.map((own) => {
      if (!own.isFilled) {
        return own.pair
      }

      return appendValue(own.pair, fill(own.value, 'query', encodeText))
    })

    for (const { text } of compiled.nameFlags) {
      pairs.push(toPair(fill(text, 'query', encodeText)))
    }

    for (const name of parsed.optionalNames) {
      if (rawParams[name]) {
        pairs.push(toPair(`${name}=${fillValue(name, 'query')}`))
      }
    }

    const filledPath = fill(path, 'path', encodeLiteral)
    const hash =
      parsed.fragment === undefined
        ? undefined
        : `#${fill(parsed.fragment, 'fragment', encodeLiteral)}`

    // A `.` or `..` segment is resolved away by a parser, so the URL would name another path.
    if (!isFilled || filledPath.split('/').some((segment) => dotSegmentRegex.test(segment))) {
      return
    }

    const writtenPairs = compiled.orderPairs([...pairs, ...keptPairs])

    return {
      base: writeBase(`${origin}${filledPath}`, writtenPairs),
      pairs: writtenPairs,
      hash,
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
  const getUrl: RowTemplate['getUrl'] = (params = {}, encoding = 'pretty') => {
    const values = builtCompiled.getValues(params)

    if (!values) {
      return
    }

    const bareValues = Object.fromEntries(
      Object.entries(values).map(([name, value]) => [toBareName(name), value]),
    )
    const isTableRefused = Object.entries(bareValues).some(([name, value]) => {
      return checks[name]?.(toValueText(value)) === false
    })

    if (isTableRefused) {
      return
    }

    const lowercaseValues = lowercaseMarked(bareValues, lenient?.case, checks, rowChecks)

    if (hasRowChecks) {
      const filled = toCheckParams(lowercaseValues)
      const isRefused = Object.entries(filled).some(([name, value]) => {
        return rowChecks[name]?.(value, filled) === false
      })

      if (isRefused) {
        return
      }
    }

    for (const name of Object.keys(values)) {
      values[name] = lowercaseValues[toBareName(name)]
    }

    return builtCompiled.fill(values, encoding)
  }

  const readOwnPair: RowTemplate['readOwnPair'] = (pair) => {
    const param = ownParams.find((own) => isNamed(pair, own.name))
    const flag = compiled.nameFlags.find((nameFlag) => {
      return !pair.rawValue && nameFlag.regex.test(pair.name)
    })
    const match = param
      ? param.regex.exec(decodeQueryValue(pair.rawValue ?? ''))
      : flag?.regex.exec(pair.name)

    if (!match) {
      return
    }

    const values: Array<[name: string, value: string]> = []

    for (const [group, value] of Object.entries(match.groups ?? {})) {
      const name = getCaptured(group)?.name

      if (name !== undefined && value !== undefined) {
        values.push([name, value])
      }
    }

    return values
  }

  return {
    rowIndex,
    isAlias,
    names: built.names,
    ownNames,
    optionalNames: parsed.optionalNames,
    hostNames: [...host.matchAll(placeholderRegex)].map(([, name]) => name),
    fixedQuery: fixedParams.map((param) => [param.name, param.value]),
    valueNames: ownParams.filter((param) => param.value.includes('{')).map((param) => param.name),
    readOwnPair,
    asGivenRegex,
    optionalWwwRegex,
    hostHint: toHostHint(),
    readParams,
    readRawParams,
    isSlashFree,
    getRawUrl,
    getHttpsOrigin,
    passesChecks,
    shape,
    fixedTextLength: readText.replace(placeholderRegex, '').length,
    openDepth: isOpenEnded ? openDepth : Number.POSITIVE_INFINITY,
    restName,
    hasFragment: parsed.fragment !== undefined,
    nameFlagCount: parsed.nameFlags.length,
    passedName: parsed.passedName,
    checkNames: [
      ...built.names.map(toBareName),
      ...parsed.optionalNames,
      ...(parsed.passedName === undefined ? [] : [parsed.passedName]),
      ...(isOpen ? [openTailName] : []),
    ],
    isFlagPair: (pair) => {
      return !pair.rawValue && compiled.nameFlags.some((flag) => flag.regex.test(pair.name))
    },
    orderPairs: compiled.orderPairs,
    getUrl,
  }
}

const createTable = <const Row extends UrlRow>(
  givenRows: Array<Row>,
  givenOptions: UrlTableOptions = {},
): TableParts<Row['key'], Row> => {
  type Key = Row['key']
  type Select = (row: Row) => boolean

  // The given rows are copied and never written to.
  const rows = givenRows.map((row) => copyRow<Row>(row))
  const options: UrlTableOptions = {
    ...givenOptions,
    hosts: toAsciiHosts(givenOptions.hosts),
  }

  // A case mark in another form than a list, as `case: true` past the types, is no mark.
  const lenient: UrlLenient = {
    ...options.lenient,
    case: Array.isArray(options.lenient?.case) ? [...options.lenient.case] : undefined,
  }
  const hasAmpersandMark = lenient.ampersandEntity === true
  const hasFixedCaseMark = lenient.fixedCase === true
  const checks = toCheckFunctions(options.checks)
  const rowChecks = rows.map((row) => toCheckFunctions(row.checks))
  const compiledRows = rows.map((row, rowIndex) => {
    return [row.main, ...(row.aliases ?? [])].map((template, index) => {
      return compileRowTemplate(
        template,
        row,
        rowIndex,
        index > 0,
        options,
        checks,
        rowChecks[rowIndex],
        lenient,
        hasAmpersandMark,
      )
    })
  })
  const compiled = compiledRows.flat()

  validateListNames(
    compiled.map((template) => ({ key: rows[template.rowIndex].key, names: template.names })),
  )
  const checkNames: CheckNames = {
    templates: compiled.map((template) => ({
      key: rows[template.rowIndex].key,
      rowIndex: template.rowIndex,
      names: template.checkNames,
    })),
    rowCheckNames: rows.map((row) => toGivenNames(row.checks)),
    caseNames: lenient.case ?? [],
  }

  // A template without an open tail is read before one with it, and of two with one the deeper
  // first. Then the one with more query parameters, then the one with more fixed text, then the
  // earlier row, so a `{name*}` row goes after the rows its paths overlap.
  const claimed = compiled.filter((candidate) => !rows[candidate.rowIndex].isBuildOnly)
  const bySpecificity = [...claimed].sort((a, b) => {
    if (a.openDepth !== b.openDepth) {
      return b.openDepth - a.openDepth
    }

    const aNameCount = a.ownNames.length + a.nameFlagCount
    const bNameCount = b.ownNames.length + b.nameFlagCount

    if (aNameCount !== bNameCount) {
      return bNameCount - aNameCount
    }

    // A template that writes a fragment is read before one that takes any.
    if (a.hasFragment !== b.hasFragment) {
      return Number(b.hasFragment) - Number(a.hasFragment)
    }

    // Fixed text is read before a placeholder that takes it, as `/posts` before `/{id}`.
    return b.fixedTextLength - a.fixedTextLength
  })
  // A table that passes a refused URL on reads its rows in the order written.
  const inReadOrder = options.isFallThrough ? claimed : bySpecificity
  // The hosts any row takes.
  const hostHints = claimed.map((candidate) => candidate.hostHint)
  const hostNames = new Set(hostHints.flatMap((hint) => hint?.names ?? []))
  const hostSuffixes = [...new Set(hostHints.flatMap((hint) => hint?.suffixes ?? []))]
  const isAnyHostTaken = hostHints.some((hint) => !hint)
  const canTakeHost = (hostname: string): boolean => {
    if (isAnyHostTaken || hostNames.has(hostname)) {
      return true
    }

    for (const suffix of hostSuffixes) {
      if (hostname.endsWith(suffix)) {
        return true
      }
    }

    return false
  }
  // A URL whose host and path no template takes is none of the rows, whatever its query.
  const asGivenRegex = joinRegexes(claimed.map((candidate) => candidate.asGivenRegex))
  const optionalWwwRegex = joinRegexes(claimed.map((candidate) => candidate.optionalWwwRegex))

  // The templates of the key's rows in the order written, each row's main URL before its aliases.
  const getRowTemplates = (key: string, select?: Select): Array<Array<RowTemplate>> => {
    if (!rows.some((row) => row.key === key)) {
      throw new Error(t(locales.errors.unknownKey, { key }))
    }

    return compiledRows.filter((_templates, rowIndex) => {
      return rows[rowIndex].key === key && (select?.(copyRow(rows[rowIndex])) ?? true)
    })
  }

  const buildUrl: UrlTable<Key, Row>['buildUrl'] = (key, params, buildOptions) => {
    // A key with several shapes builds the first one whose placeholders the values fill.
    for (const candidate of getRowTemplates(key, buildOptions?.select).flat()) {
      const url = candidate.getUrl(params, buildOptions?.encoding)

      if (url) {
        return url
      }
    }
  }

  // Every URL the values fill of the first row of the key that builds one.
  const buildUrls: UrlTable<Key, Row>['buildUrls'] = (key, params, buildOptions) => {
    for (const templates of getRowTemplates(key, buildOptions?.select)) {
      const urls: Array<string> = []

      for (const candidate of templates) {
        const url = candidate.getUrl(params, buildOptions?.encoding)

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
    const getFixedValues = (template: RowTemplate, name: string): string => {
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
  const fixedQueryTemplates = compiled.filter((candidate) => candidate.fixedQuery.length > 0)
  // A parameter another template taking the same host and path sets to a value this one does
  // not set, tells the two apart too, also across keys, as `type=comments` on `/feed`.
  const getPathSelectorNames = (
    template: RowTemplate,
    hostPath: string,
    isWwwOptional: boolean,
  ): Array<string> => {
    return fixedQueryTemplates
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
    template: RowTemplate,
    tableUrl: TableUrl,
    isWwwOptional: boolean,
  ): boolean => {
    // A URL with no query has no parameter to refuse.
    if (!tableUrl.url.search) {
      return false
    }

    const row = rows[template.rowIndex]
    const names = [
      ...keySelectorNames[row.key],
      ...getPathSelectorNames(template, tableUrl.hostPath, isWwwOptional),
    ]

    // A passed query takes every parameter, so none names a feed the row doesn't know.
    if (names.length === 0 || template.passedName !== undefined) {
      return false
    }

    const rowFixedQuery = compiledRows[template.rowIndex].flatMap(
      (candidate) => candidate.fixedQuery,
    )
    const openNames = [...template.valueNames, ...template.optionalNames]

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
    template: RowTemplate
    params?: Record<string, UrlValue>
    tableUrl: TableUrl
    isWwwOptional: boolean
    // Whether a mark was needed for the URL to read: the other trailing slash, or `;` or `&amp;`
    // read as `&`.
    isMarkNeeded: boolean
  }
  type FoundTemplate = Required<TakenTemplate>

  // The first template that takes the URL decides. A value its check refuses passes the URL on
  // only to a template of the same shape, as a row for another value of `format`, so a looser
  // row does not take it. A parameter that names a feed the template doesn't know passes it on to
  // every later template, as one that sets it. Under `isFallThrough` every refusal does.
  const findTemplate = (
    tableUrl: TableUrl,
    isWwwOptional: boolean,
    isSlashLoose: boolean,
    base?: UrlValues,
  ): TakenTemplate | undefined => {
    let refused: TakenTemplate | undefined
    let isPassedToAll = options.isFallThrough === true

    for (const template of inReadOrder) {
      if (refused && !isPassedToAll && refused.template.shape !== template.shape) {
        continue
      }

      const params = template.readParams(tableUrl, isWwwOptional, isSlashLoose, base)

      if (!params) {
        continue
      }

      const isCheckRefused = !template.passesChecks(params)

      if (!isCheckRefused && !hasUnlistedSelector(template, tableUrl, isWwwOptional)) {
        return { template, params, tableUrl, isWwwOptional, isMarkNeeded: false }
      }

      if (!isCheckRefused) {
        isPassedToAll = true
      }

      if (!refused) {
        refused = { template, tableUrl, isWwwOptional, isMarkNeeded: false }
      }
    }

    return refused
  }

  const readRawParams = ({
    template,
    params,
    tableUrl,
    isWwwOptional,
  }: FoundTemplate): RawRead | undefined => {
    // An entity left after `&amp;` is read as `&`, as in `&amp;amp;`, or a pair that starts with
    // `amp;`, is written back as `&amp;`, which the mark reads as another query.
    const hasEntityLeft =
      hasAmpersandMark &&
      readQuery(tableUrl).pairs.some((pair) => pair.text.startsWith(entityPrefix))

    if (hasEntityLeft) {
      return
    }

    const rawRead = template.readRawParams(tableUrl, isWwwOptional, params, false)

    if (rawRead || !(template.isSlashFree || hasFixedCaseMark)) {
      return rawRead
    }

    return template.readRawParams(tableUrl, isWwwOptional, params, true)
  }

  const hasSlashMark = compiled.some((template) => template.isSlashFree)

  // A URL with the slash a template writes reads by that template, so the trailing slash mark
  // reads one with the other slash only where no template takes it as written.
  const findSpelledTemplate = (
    tableUrl: TableUrl,
    isWwwOptional: boolean,
    base?: UrlValues,
  ): TakenTemplate | undefined => {
    const found = findTemplate(tableUrl, isWwwOptional, false, base)

    if (found?.params || !hasSlashMark) {
      return found
    }

    const loose = findTemplate(tableUrl, isWwwOptional, true, base)

    return loose?.params ? { ...loose, isMarkNeeded: true } : (found ?? loose)
  }

  const readTableTemplate = (tableUrl: TableUrl, base?: UrlValues): TakenTemplate | undefined => {
    if (!canTakeHost(tableUrl.hostname)) {
      return
    }

    // With `www` a tenant, a host as given wins, so `www.example.com` is the tenant `www`.
    const asGiven =
      options.isWwwTenant && asGivenRegex.test(tableUrl.hostPath)
        ? findSpelledTemplate(tableUrl, false, base)
        : undefined

    if (asGiven) {
      return asGiven
    }

    if (optionalWwwRegex.test(tableUrl.hostPath)) {
      return findSpelledTemplate(tableUrl, true, base)
    }
  }

  // The template a URL is read by. Under the ampersand mark the server sees the query with `&`, so
  // the pairs are the ones of the query with `&amp;` read as `&`.
  const readTemplate = (url: string, base?: UrlValues): FoundTemplate | undefined => {
    const tableUrl = readTableUrl(url)

    if (!tableUrl) {
      return
    }

    const takesHostPath = (): boolean => {
      return [asGivenRegex, optionalWwwRegex].some((regex) => regex.test(tableUrl.hostPath))
    }
    let readableUrl = tableUrl

    if (hasAmpersandMark && takesHostPath() && readQuery(tableUrl).pairs.some(isEntityPair)) {
      const { pairs, hash } = readQuery(tableUrl)

      readableUrl = { ...tableUrl, query: toUrlQuery(readAmpersandEntities(pairs), hash) }
    }

    const hasSemicolon = lenient.semicolon === true && readableUrl.url.search.includes(';')

    if (hasSemicolon && takesHostPath()) {
      const { pairs, hash } = readQuery(readableUrl)

      readableUrl = { ...readableUrl, query: toUrlQuery(readSemicolons(pairs), hash) }
    }

    const found = readTableTemplate(readableUrl, base)

    if (!found?.params) {
      return
    }

    const isMarkNeeded = found.isMarkNeeded || readableUrl !== tableUrl

    return { ...found, params: found.params, isMarkNeeded }
  }

  // The values of a read are typed from the key it read, which a read here holds as any key.
  const toMatch = (
    match: UrlKeyMatch<string, UrlRow> & { key: Key; row: Row },
  ): UrlMatch<Key, Row> => {
    return match as UrlMatch<Key, Row>
  }

  type RootRow = UrlRow<Key> & { rootRowIndex: number; isMainRead: boolean }
  type RootTable = TableParts<Key, RootRow>
  type RootTables = Record<'all' | 'fixed' | 'based' | 'basedFixed', RootTable>

  // The `{host}` rows as rows on one fixed host, which stands for whatever host and base a URL is
  // read under. Every other part of a read is the one a table on a fixed host does.
  const defineRootUrls = (
    isBaseNeeded: boolean,
    takesTemplate: (parsed: ParsedTemplate) => boolean,
  ): RootTable => {
    const rootRows: Array<RootRow> = []

    for (const [rootRowIndex, row] of rows.entries()) {
      const standIns: Array<string> = []
      let isMainRead = false

      for (const [index, template] of [row.main, ...(row.aliases ?? [])].entries()) {
        const parsed = parseTemplate(template)
        // Everything behind the host as written, the query names of `{?url}` and `{&q}` included.
        const rest = parsed.text.slice(`${parsed.scheme}://${parsed.host}`.length)
        const hasBase = rest.startsWith(basePlaceholder)
        const standIn = parseTemplate(
          `${standInOrigin}${hasBase ? rest.slice(basePlaceholder.length) : rest}`,
        )
        const isTaken =
          isAnyOf(parsed.host, hostPlaceholder) &&
          (hasBase || !isBaseNeeded) &&
          takesTemplate(standIn)

        if (!isTaken) {
          continue
        }

        standIns.push(standIn.text)

        if (index === 0) {
          isMainRead = true
        }
      }

      const [main, ...aliases] = standIns

      if (main !== undefined) {
        rootRows.push({ ...row, key: row.key, main, aliases, rootRowIndex, isMainRead })
      }
    }

    return createTable(rootRows, {
      ...options,
      hosts: undefined,
    })
  }

  // Defined on the first any-host read, so a table never read that way compiles no pattern.
  let rootTables: RootTables | undefined

  const getRootTables = (): RootTables => {
    if (!rootTables) {
      rootTables = {
        all: defineRootUrls(false, () => true),
        fixed: defineRootUrls(false, hasFixedPath),
        based: defineRootUrls(true, () => true),
        basedFixed: defineRootUrls(true, hasFixedPath),
      }
    }

    return rootTables
  }

  // A URL read by its `{host}` rows alone, whatever its host: under the base given, or under the
  // base its own path shows. A row without `{/base*}` reads only an empty base.
  const readRooted = (url: string, readOptions: UrlReadOptions): UrlMatch<Key, Row> | undefined => {
    const parsedUrl = parseUrl(url)

    if (!parsedUrl || !isHttpUrl(parsedUrl)) {
      return
    }

    const tables = getRootTables()
    const segments = parsedUrl.pathname.replace(leadingSlashesRegex, '/').split('/')
    // A base is the first segments of the path, with the empty one in front of its first slash.
    const readBehind = (isFixed: boolean, baseLength: number) => {
      const rest = segments.slice(baseLength).map((segment) => `/${segment}`)
      const base = segments.slice(1, baseLength).map(decodePercent)
      const table =
        baseLength > 1
          ? tables[isFixed ? 'basedFixed' : 'based']
          : tables[isFixed ? 'fixed' : 'all']

      const readBase: UrlValues = {
        scheme: parsedUrl.protocol.slice(0, -1),
        host: parsedUrl.host,
        ...(base.length > 0 && { base }),
      }
      const match = table.readStandIn(
        `${standInOrigin}${rest.join('')}${parsedUrl.search}${parsedUrl.hash}`,
        readBase,
      )

      if (!match) {
        return
      }

      return { match, values: { ...match.values, ...readBase } }
    }
    const readUnder = (baseLength: number): UrlMatch<Key, Row> | undefined => {
      const read = readBehind(false, baseLength)

      if (!read) {
        return
      }

      const row = rows[read.match.row.rootRowIndex]

      return toMatch({
        key: row.key,
        values: read.values,
        row: copyRow(row),
        isAliasMatch: read.match.isAliasMatch || !read.match.row.isMainRead,
        isExactMatch: false,
        isLenientMatch: read.match.isLenientMatch,
      })
    }

    if (readOptions.base !== undefined) {
      const basePath = toSegments(readOptions.base)
      const baseLength = basePath.length + 1
      // Whole segments are compared, so the base `/forum` is no base of `/forums`.
      const urlBase = segments.slice(1, baseLength)
      const isUnder =
        urlBase.length === basePath.length &&
        urlBase.every((segment, index) => {
          return isLooseMatch(decodePath(segment), decodePath(basePath[index]))
        })

      if (!isUnder) {
        return
      }

      return readUnder(baseLength)
    }

    const baseLengths: Array<number> = []
    const maxBaseLength = Math.min(segments.length, maxBasePathSegments + 1)

    for (let baseLength = 1; baseLength <= maxBaseLength; baseLength++) {
      const basePath = segments.slice(0, baseLength).join('/')

      // A base that ends in a slash is the base in front of that slash.
      if (!basePath.endsWith('/')) {
        baseLengths.push(baseLength)
      }
    }

    // A row of values alone reads `/forum/viewtopic.php` with no base, as a user in a group, so
    // the bases a row with fixed text reads the URL under go first, each list shortest first.
    for (const baseLength of baseLengths) {
      const match = readBehind(true, baseLength) ? readUnder(baseLength) : undefined

      if (match) {
        return match
      }
    }

    for (const baseLength of baseLengths) {
      const match = readUnder(baseLength)

      if (match) {
        return match
      }
    }
  }

  // A URL read by the table's own rows. A row on the stand-in host gets the scheme, host and base
  // the URL is read under.
  const readOwn = (url: string, base?: UrlValues): UrlMatch<Key, Row> | undefined => {
    const found = readTemplate(url, base)

    if (!found) {
      return
    }

    const row = rows[found.template.rowIndex]
    // The tail is read for the checks alone: no feed is built from it.
    const params = omit(found.params, [openTailName])
    const rawRead = readRawParams(found)
    const values = lowercaseMarked(params, lenient.case, checks, rowChecks[found.template.rowIndex])
    // A value the case mark lowercased needed the mark, and one already in lowercase did not.
    const isLowercased = Object.keys(params).some((name) => {
      return !isSameValue(values[name], params[name], (left, right) => left === right)
    })
    const isLenientMatch = found.isMarkNeeded || isLowercased || rawRead?.isRespelled === true

    return toMatch({
      key: row.key,
      values,
      row: copyRow(row),
      isAliasMatch: found.template.isAlias,
      isExactMatch: rawRead !== undefined && !isLenientMatch,
      isLenientMatch,
    })
  }

  // The values a read under any host or a given base adds are typed from the options given.
  const readUrl: UrlTable<Key, Row>['readUrl'] = <Options extends UrlReadOptions | undefined>(
    url: string,
    readOptions?: Options,
  ) => {
    const match =
      readOptions?.base !== undefined || readOptions?.isAnyHost
        ? readRooted(url, readOptions)
        : readOwn(url)

    return match as UrlMatch<Key, Row, Options> | undefined
  }

  // Whether a value a template reads is a value the source URL read: in any case for a host value
  // and one a case mark covers.
  const isSameRead = (
    template: RowTemplate,
    name: string,
    value: UrlValue | undefined,
    sourceValue: UrlValue | undefined,
  ): boolean => {
    if ([...(lenient.case ?? []), ...template.hostNames].includes(name)) {
      return isSameValue(value, sourceValue, isLooseMatch)
    }

    return isSameValue(value, sourceValue, (left, right) => left === right)
  }

  // The URL a template read, written as its row's main URL, or undefined where it cannot be.
  const writeMainUrl = (
    template: RowTemplate,
    tableUrl: TableUrl,
    rawRead: RawRead,
  ): string | undefined => {
    const { url } = tableUrl
    const [main] = compiledRows[template.rowIndex]
    // The query and the fragment behind a reserved value are part of it, and stay as written.
    const reservedRest = `${writeQuery(rawRead.pairs)}${readQuery(tableUrl).hash}`
    const hasReserved = template.restName !== undefined
    const pairs = hasReserved ? [] : rawRead.pairs.filter((pair) => pair.text)
    // A parameter the main URL does not name stays, only when its `{?a,b}` names it where it has
    // one, and never under `isQueryKept: false`.
    const isKept = (pair: QueryPair): boolean => {
      // A passed query takes every pair, so each one is a value of the main URL.
      if (main.passedName !== undefined) {
        return true
      }

      if (main.optionalNames.length > 0 || options.isQueryKept === false) {
        return isNamed(pair, main.optionalNames)
      }

      return true
    }

    // A respelled URL is written from its values, as an alias is, so the main URL has the slash and
    // the fixed text its template writes.
    if (!template.isAlias && !rawRead.isRespelled) {
      const origin = url.port ? undefined : main.getHttpsOrigin(rawRead.params)

      if (hasReserved) {
        return `${origin ?? url.origin}${rawRead.pathname}${reservedRest}`
      }

      const stayingPairs = main.orderPairs(
        pairs.filter((pair) => {
          return isNamed(pair, main.ownNames) || main.isFlagPair(pair) || isKept(pair)
        }),
      )
      // A query that needs no change stays as written, an empty one, an empty pair and a bare `#`
      // included.
      const rest =
        writeQuery(stayingPairs) === writeQuery(pairs)
          ? `${writeQuery(rawRead.pairs)}${readQuery(tableUrl).hash}`
          : `${writeQuery(stayingPairs)}${url.hash}`

      return `${origin ?? url.origin}${rawRead.pathname}${rest}`
    }

    // A value the alias reads under an optional name is written where the main URL writes it.
    const movedNames = template.optionalNames.filter((name) => main.checkNames.includes(name))
    const ownNames = [...template.ownNames, ...main.ownNames, ...movedNames]
    const isOwnFlag = (pair: QueryPair): boolean =>
      template.isFlagPair(pair) || main.isFlagPair(pair)
    const keptPairs = pairs.filter((pair) => {
      return !isNamed(pair, ownNames) && !isOwnFlag(pair) && isKept(pair)
    })
    const rawUrl = main.getRawUrl(rawRead, keptPairs)

    if (!rawUrl) {
      return
    }

    const mainUrl = `${rawUrl.base}${writeQuery(rawUrl.pairs)}`

    // A port the main URL cannot keep, as one on a host it writes itself, leaves the URL as it is.
    if (url.port && parseUrl(mainUrl)?.port !== url.port) {
      return
    }

    // An `https` URL is never written down to `http`.
    if (url.protocol === 'https:' && startsWithAnyOf(mainUrl, 'http:')) {
      return
    }

    const hasOtherValue = pairs.some((pair) => {
      const isMainPair = isNamed(pair, main.ownNames) && !isNamed(pair, template.ownNames)
      const isMainFlag = main.isFlagPair(pair) && !template.isFlagPair(pair)

      if (!isMainPair && !isMainFlag) {
        return false
      }

      const values = main.readOwnPair(pair)

      return !values?.every(([name, value]) => isSameRead(main, name, value, rawRead.values[name]))
    })

    // A parameter or a flag the main URL sets, given under another value, is read differently
    // from server to server.
    if (hasOtherValue) {
      return
    }

    // A value the main URL has no place for is left out, its query and fragment with it.
    if (hasReserved) {
      return main.restName === undefined
        ? `${mainUrl}${rawUrl.hash ?? ''}`
        : `${mainUrl}${reservedRest}`
    }

    // A fragment the alias writes is its own, and no part of a main URL that writes none.
    const givenHash = template.hasFragment ? '' : url.hash

    // The fragment stays as given, as on a URL already on its main host.
    return `${mainUrl}${rawUrl.hash ?? givenHash}`
  }

  // A strict build of the values the main URL reads keeps its fixed text as the template writes it.
  // The pairs no row names are spelled strictly too.
  const writeStrictMainUrl = (readBack: FoundTemplate, mainUrl: string): string | undefined => {
    const [main] = compiledRows[readBack.template.rowIndex]
    const values = omit(readBack.params, [openTailName])

    const builtUrl = main.getUrl(values, 'strict')
    const parsedMainUrl = parseUrl(mainUrl)

    if (!builtUrl || !parsedMainUrl) {
      return
    }

    // A reserved value holds the query, which stays as the value writes it.
    if (main.restName !== undefined) {
      return builtUrl
    }

    // A fragment the main URL writes is built strictly too, and any other stays as given.
    const hashStart = main.hasFragment ? builtUrl.indexOf('#') : builtUrl.length
    const hash = main.hasFragment ? builtUrl.slice(hashStart) : parsedMainUrl.hash
    const builtBody = builtUrl.slice(0, hashStart)
    const queryStart = builtBody.includes('?') ? builtBody.indexOf('?') : builtBody.length
    // The build wrote every pair the row names, its optional ones and flags included, and a passed
    // query took every other pair.
    const keptPairs = parseQuery(parsedMainUrl.search)
      .filter((pair) => {
        return (
          pair.text &&
          !isNamed(pair, [...main.ownNames, ...main.optionalNames]) &&
          !main.isFlagPair(pair) &&
          main.passedName === undefined
        )
      })
      .map(toStrictPair)
    const pairs = [...parseQuery(builtBody.slice(queryStart)), ...keptPairs]
    const base = writeBase(builtBody.slice(0, queryStart), pairs)

    return `${base}${writeQuery(pairs)}${hash}`
  }

  // A URL written as its row's main URL, every value as spelled but where a mark covers it, and a
  // main URL as itself. A main URL under `http` or another `www` is rewritten too. Any other
  // difference, a URL with credentials and a value or a port the main URL cannot keep give nothing.
  const getMainUrl: UrlTable<Key, Row>['getMainUrl'] = (url, writeOptions) => {
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

    if (!mainUrl) {
      return
    }

    const isStrict = writeOptions?.encoding === 'strict'

    if (!isStrict && mainUrl === sourceUrl.href) {
      return mainUrl
    }

    // A kept parameter can pick another row on the main URL's path, as `type=comments` on `/feed`.
    const readBack = readTemplate(mainUrl)

    if (readBack?.template.rowIndex !== found.template.rowIndex) {
      return
    }

    // A value moved into the main URL can hold its fixed text, as `Alice_by_Bob` written into
    // `{board}_by_{user}`, so the main URL reads under other values.
    const { optionalNames, passedName } = readBack.template
    const isReadAsWritten = Object.entries(readBack.params).every(([name, value]) => {
      const sourceValue = found.params[name]

      // A pair the source does not name is copied into the main URL as written, as `page=3` from
      // an alias into `{?page}`, so it holds no fixed text of the main URL.
      if (sourceValue === undefined && (optionalNames.includes(name) || name === passedName)) {
        return true
      }

      return isSameRead(readBack.template, name, value, sourceValue)
    })

    if (!isReadAsWritten) {
      return
    }

    const writtenUrl = isStrict ? writeStrictMainUrl(readBack, mainUrl) : mainUrl

    // A main URL is written as a URL parser writes it, a value moved into the host in lowercase,
    // so the main URL of a main URL is itself.
    return parseUrl(writtenUrl)?.href
  }

  // The table for one page: `{scheme}` and `{host}` come from the page URL, `{domain}` is its host
  // without the tenant under `hosts.tenant`, `example.co.uk` for `alice.example.co.uk`. A value
  // the caller passes wins, so a caller passes the `base` the page names.
  const forSite: UrlTable<Key, Row>['forSite'] = (url) => {
    const parsedUrl = parseUrl(url)

    if (!parsedUrl || !isHttpUrl(parsedUrl)) {
      return
    }

    const urlParams: UrlValues = {
      scheme: parsedUrl.protocol.slice(0, -1),
      host: parsedUrl.host,
      domain: getTenantDomain(parsedUrl.hostname, options.hosts?.tenant),
    }
    // An undefined value the caller passes leaves the one of the page in place.
    const withUrlParams = (params: UrlValues = {}): UrlValues => {
      return { ...urlParams, ...trimObject(params) }
    }

    return {
      buildUrl: (key, values, buildOptions) => buildUrl(key, withUrlParams(values), buildOptions),
      buildUrls: (key, values, buildOptions) => buildUrls(key, withUrlParams(values), buildOptions),
    }
  }

  return {
    table: { rows: rows.map(copyRow), buildUrl, buildUrls, readUrl, getMainUrl, forSite },
    checkNames,
    readStandIn: readOwn,
  }
}

// One table of URLs, keyed by what each row is. `buildUrl` writes a row's URL from the values a
// page gave, `buildUrls` lists every spelling of it, `readUrl` takes a URL back to its row and
// values, and `getMainUrl` writes a URL in its row's main spelling.
export const defineTable = <const Row extends UrlRow>(
  givenRows: Array<Row>,
  options: UrlTableOptions = {},
): UrlTable<Row['key'], Row> => {
  const parts = createTable(givenRows, options)

  validateCheckNames(parts.checkNames)

  return parts.table
}

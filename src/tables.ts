import {
  composeQuery,
  decodePercent,
  encodePathSegment,
  escapeRegex,
  getQueryParamValues,
  getSubdomain,
  isAnyOf,
  isHttpUrl,
  isString,
  parseUrl,
  stripWww,
  t,
  trimObject,
} from 'trousse'
import locales from '../locales.json' with { type: 'json' }
import type { UrlParams, UrlRow, UrlTable, UrlTableOptions } from '../types.js'

// One URL of a row: its main one or an alias.
type CompiledTemplate = {
  rowIndex: number
  isAlias: boolean
  queryCount: number
  // The query parameters the template sets itself, and the placeholders that take a passed query.
  ownNames: Array<string>
  passedQueryNames: Array<string>
  // The host and path a URL the template takes matches, as given and with an optional `www`.
  asGivenRegex: RegExp
  optionalWwwRegex: RegExp
  // The values of a URL the template takes, read as given or with an optional `www`.
  readParams: (tableUrl: TableUrl, isWwwOptional: boolean) => Record<string, string> | undefined
  passesChecks: (params: Record<string, string>) => boolean
  getUrl: (params?: UrlParams) => string | undefined
}

// A URL as the templates read it: the host joined to the decoded path without its trailing slash.
type TableUrl = {
  url: URL
  hostPath: string
}

const templateRegex = /^(https?|\{scheme\}):\/\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?$/i
const placeholderRegex = /\{(\w+\*?)\}/g
const trailingSlashRegex = /\/$/
// A lone surrogate has no UTF-8 form and stays as given.
const nonAsciiRegex = /[^\p{ASCII}\p{Cs}]+/gu
const strayPercentRegex = /%(?![0-9a-f]{2})/gi
const leadingSlashesRegex = /^\/{2,}/
const anchorsRegex = /^\^|\$$/g
const passedQueryRegex = /^\{(\w+)\}$/
const leadingQuestionMarkRegex = /^\?/
const captureRegex = /\(\?<p\d+>/g

const rootPlaceholder = '{root}'
const schemePlaceholder = '{scheme}'
const captureGroupPrefix = 'p'
const multiSegmentCapture = '[^/]+(?:/[^/]+)*'

const isMultiSegment = (placeholder: string): boolean => {
  return placeholder.endsWith('*')
}

const toBareName = (placeholder: string): string => {
  return isMultiSegment(placeholder) ? placeholder.slice(0, -1) : placeholder
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

// Every table is asked about the same URL in turn, so the last URL read is kept for the next one.
let lastTableUrl: { url: string; tableUrl: TableUrl | undefined } | undefined

const readTableUrl = (url: string): TableUrl | undefined => {
  if (lastTableUrl?.url === url) {
    return lastTableUrl.tableUrl
  }

  const parsedUrl = parseUrl(url)
  let tableUrl: TableUrl | undefined

  if (parsedUrl && isHttpUrl(parsedUrl)) {
    // A doubled slash after the host names the same feed: pages link `host//feed` for `host/feed`.
    const path = parsedUrl.pathname.replace(leadingSlashesRegex, '/')
    const pathname = decodePath(path).replace(trailingSlashRegex, '')

    tableUrl = {
      url: parsedUrl,
      hostPath: parsedUrl.hostname + pathname,
    }
  }

  lastTableUrl = { url, tableUrl }

  return tableUrl
}

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

// A placeholder becomes the capture, the text around it a literal, decoded for a path so an
// encoded brace in it stays a literal.
const toRegexSource = (
  text: string,
  capture: string,
  captures: Record<string, string> = {},
  isPath = false,
  wrapCapture = (_name: string, source: string) => source,
): string => {
  return text
    .split(placeholderRegex)
    .map((piece, index) => {
      if (index % 2 === 1) {
        return wrapCapture(piece, captures[piece] ?? capture)
      }

      return escapeRegex(isPath ? decodePath(piece) : piece)
    })
    .join('')
}

// A template as two functions: the values of a URL it takes, and its URL for a page's values.
const compileTemplate = (
  template: string,
  { key, queryEncoding }: UrlRow,
  rowIndex: number,
  isAlias: boolean,
  options: UrlTableOptions,
): CompiledTemplate => {
  const isRootTemplate = template.startsWith(rootPlaceholder)
  // A `{root}` template reads as one on `{host}`: a tenant serves from its origin.
  const match = templateRegex.exec(
    isRootTemplate ? template.replace(rootPlaceholder, 'https://{host}') : template,
  )

  if (!match) {
    throw new Error(t(locales.errors.invalidFeedTemplate, { template }))
  }

  const [, scheme, host, path = '', queryText = ''] = match
  const queryEntries = [...new URLSearchParams(queryText)]
  const getPassedQueryName = ([name, value]: [string, string]): string | undefined => {
    if (value) {
      return
    }

    return passedQueryRegex.exec(name)?.[1]
  }
  // A passed query names no parameter of the row, so it is neither matched nor counted.
  const query = queryEntries.filter((entry) => getPassedQueryName(entry) === undefined)
  const ownNames = query.map(([name]) => name)
  const encodeQueryParameter = (name: string, value: string | true): string => {
    if (value === true || queryEncoding !== 'form') {
      return composeQuery({ [name]: value }).slice(1)
    }

    // biome-ignore lint/plugin/useComposeQuery: The form option asks for what URLSearchParams writes.
    return new URLSearchParams([[name, value]]).toString()
  }
  // A passed query is written as given, without its `?` and the parameters the row sets itself.
  const passQuery = (text: string): string => {
    const parts = text.replace(leadingQuestionMarkRegex, '').split('&')

    return parts
      .filter((part) => {
        const [name] = part.split('=')

        if (!name) {
          return false
        }

        return !isAnyOf(decodePercent(name), ownNames)
      })
      .join('&')
  }
  // A name with no value, such as `?rss`, is a flag, built with no value.
  const flags = new Set(query.filter(([, value]) => !value).map(([name]) => name))
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
  const checks = options.checks ?? {}
  const capturedNames: Array<string> = []
  // Every placeholder is captured as `p{index}`, so a URL is read back to its values.
  const wrapCapture = (name: string, source: string): string => {
    capturedNames.push(toBareName(name))

    return `(?<${captureGroupPrefix}${capturedNames.length - 1}>${source})`
  }
  // A name the template holds twice keeps the first value read.
  const readGroups = (params: Record<string, string>, groups: Record<string, string> = {}) => {
    for (const [group, value] of Object.entries(groups)) {
      const name = capturedNames[Number(group.slice(captureGroupPrefix.length))]

      if (value !== undefined && params[name] === undefined) {
        params[name] = value
      }
    }
  }
  const passesChecks = (params: Record<string, string>): boolean => {
    return Object.entries(params).every(([name, value]) => checks[name]?.(value) ?? true)
  }
  // An empty value is no value: a host label or path segment left empty builds a broken URL, as
  // `/t//feed`, and a query value left empty a feed the page does not name, as `?videoChannelId=`.
  // An empty passed query passes nothing, so the row writes its own parameters alone.
  const passedQueryNames = new Set(queryEntries.map(getPassedQueryName))
  const multiSegmentCaptures = Object.fromEntries(
    names.filter(isMultiSegment).map((name) => [name, multiSegmentCapture]),
  )

  // Matched on the decoded path without its trailing slash.
  const pathSource = toRegexSource(
    path.replace(trailingSlashRegex, ''),
    '[^/]+',
    multiSegmentCaptures,
    true,
    wrapCapture,
  )
  // A fixed host matches with or without `www` in front, a tenant label only with
  // `isWwwTenantPrefix`, so `www.alice.example.com` is otherwise no tenant's host.
  const toHostPathRegex = (isWwwOptional: boolean): RegExp => {
    const wwwSource = isWwwOptional ? '(?:www\\.)?' : ''
    const tenantWwwSource = options.isWwwTenantPrefix ? wwwSource : ''
    const normalize = (value: string): string => (isWwwOptional ? stripWww(value) : value)
    const hostSources = [
      ...hosts.map((value) => {
        return `${wwwSource}${toEntrySource(isString(value) ? normalize(value) : value)}`
      }),
      ...(tenantDomains.length > 0 ? [`${tenantWwwSource}${tenantSource}\\.${domainSource}`] : []),
    ]
    const isFixedHost = !host.startsWith('{') || host.startsWith('{domain}')
    const fixedPrefixSource = isFixedHost ? wwwSource : ''
    const isTenantHost = !isFixedHost && !host.startsWith('{host}')
    const tenantPrefixSource = isTenantHost ? tenantWwwSource : ''
    const hostCaptures = {
      host: `(?:${hostSources.join('|')})`,
      domain: domainSource,
    }
    const hostSource = toRegexSource(
      normalize(host),
      tenantSource,
      hostCaptures,
      false,
      wrapCapture,
    )

    return new RegExp(`^${fixedPrefixSource}${tenantPrefixSource}${hostSource}${pathSource}$`, 'i')
  }
  const asGivenRegex = toHostPathRegex(false)
  const optionalWwwRegex = toHostPathRegex(true)
  const queryRegexes = query.map(([name, value]): [string, RegExp] => {
    return [name, new RegExp(`^${toRegexSource(value, '.+', {}, false, wrapCapture)}$`, 'i')]
  })
  const repeatedNames = ownNames.filter((name, index) => ownNames.indexOf(name) !== index)

  // A `{root}` table without hosts serves any site, so nothing in its URL names the platform.
  const claimsUrls = !isRootTemplate || hasHosts

  const readParams = (
    { url, hostPath }: TableUrl,
    isWwwOptional: boolean,
  ): Record<string, string> | undefined => {
    const match = claimsUrls && (isWwwOptional ? optionalWwwRegex : asGivenRegex).exec(hostPath)

    if (!match) {
      return
    }

    const params: Record<string, string> = {}

    readGroups(params, match.groups)

    for (const [name, regex] of queryRegexes) {
      const values = getQueryParamValues(url, name, { preserveEmptyValues: flags.has(name) })
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

    return params
  }

  // A template whose placeholders the values do not all fill builds no URL.
  const getUrl = (params: UrlParams = {}): string | undefined => {
    const values: Record<string, string> = {}

    for (const name of names) {
      const value = getPlaceholderValue(params, name)

      if (value === undefined || (!value && !passedQueryNames.has(name))) {
        return
      }

      const check = checks[toBareName(name)]

      if (check && !check(value)) {
        return
      }

      values[name] = value
    }

    const fillPlaceholders = (
      text: string,
      encode = (value: string, _name: string) => value,
    ): string => {
      return text.replace(placeholderRegex, (_placeholder, name: string) => {
        return encode(values[name], name)
      })
    }
    const queryParts = queryEntries.map((entry) => {
      const [name, value] = entry
      const passedQueryName = getPassedQueryName(entry)

      if (passedQueryName !== undefined) {
        return passQuery(values[passedQueryName])
      }

      return encodeQueryParameter(name, flags.has(name) ? true : fillPlaceholders(value))
    })
    // Pages link a query value percent-encoded, as `?tag=%E6%8A%80%E8%A1%93` for `技術`.
    const joinedQuery = queryParts
      .filter((part) => part)
      .join('&')
      .replace(nonAsciiRegex, encodeURIComponent)
    const builtQuery = joinedQuery ? `?${joinedQuery}` : ''

    // A root is written as given, without the trailing slash the path brings.
    const origin = isRootTemplate
      ? fillPlaceholders(rootPlaceholder).replace(trailingSlashRegex, '')
      : `${fillPlaceholders(scheme)}://${fillPlaceholders(host)}`

    return `${origin}${fillPlaceholders(path, encodePath)}${builtQuery}`
  }

  return {
    rowIndex,
    isAlias,
    queryCount: query.length,
    ownNames,
    passedQueryNames: [...passedQueryNames].filter((name) => name !== undefined),
    asGivenRegex,
    optionalWwwRegex,
    readParams,
    passesChecks,
    getUrl,
  }
}

// One table of URLs, keyed by what each row is. `build` writes a row's URL from the values a page
// gave, `buildAll` lists every spelling of it, `read` takes a URL back to its row and values, and
// `getMainUrl` rewrites an alias to its row's main URL.
export const defineUrls = <const Key extends string, Extra extends object = object>(
  rows: Array<UrlRow<Key> & Extra>,
  options: UrlTableOptions = {},
): UrlTable<Key, UrlRow<Key> & Extra> => {
  type Row = UrlRow<Key> & Extra
  type Select = (row: Row) => boolean

  const compiledRows = rows.map((row, rowIndex) => {
    return [row.main, ...(row.aliases ?? [])].map((template, index) => {
      return compileTemplate(template, row, rowIndex, index > 0, options)
    })
  })
  const compiled = compiledRows.flat()
  // A template with more query parameters is the more specific one, so it is read first. At the
  // same count the earlier row wins, so a `{name*}` row goes after the rows its paths overlap.
  const claimed = compiled.filter((candidate) => !rows[candidate.rowIndex].isBuildOnly)
  const bySpecificity = [...claimed].sort((a, b) => b.queryCount - a.queryCount)
  // A URL whose host and path no template takes is none of the rows, whatever its query.
  const asGivenRegex = joinRegexes(claimed.map((candidate) => candidate.asGivenRegex))
  const optionalWwwRegex = joinRegexes(claimed.map((candidate) => candidate.optionalWwwRegex))

  // The templates of the key's rows in the order written, each row's main URL before its aliases.
  const getRowTemplates = (key: string, select?: Select): Array<Array<CompiledTemplate>> => {
    const rowTemplates = compiledRows.filter((_templates, rowIndex) => {
      return rows[rowIndex].key === key && (select?.(rows[rowIndex]) ?? true)
    })

    if (rowTemplates.length === 0) {
      throw new Error(t(locales.errors.missingFeedTemplate, { key }))
    }

    return rowTemplates
  }

  const build: UrlTable<Key, Row>['build'] = (key, params, select) => {
    // A key with several shapes builds the first one whose placeholders the values fill.
    for (const candidate of getRowTemplates(key, select).flat()) {
      const url = candidate.getUrl(params)

      if (url) {
        return url
      }
    }
  }

  // Every URL the values fill of the first row of the key that builds one.
  const buildAll: UrlTable<Key, Row>['buildAll'] = (key, params, select) => {
    for (const templates of getRowTemplates(key, select)) {
      const urls = templates.map((candidate) => candidate.getUrl(params)).filter(isString)

      if (urls.length > 0) {
        return urls
      }
    }

    return []
  }

  // The first template that takes the URL decides: a value its check refuses refuses the URL, so
  // a looser row such as one without the query does not take it in its place.
  const findTemplate = (
    tableUrl: TableUrl,
    isWwwOptional: boolean,
  ): { template: CompiledTemplate; params: Record<string, string> | undefined } | undefined => {
    for (const template of bySpecificity) {
      const params = template.readParams(tableUrl, isWwwOptional)

      if (params) {
        return { template, params: template.passesChecks(params) ? params : undefined }
      }
    }
  }

  const readTemplate = (
    url: string,
  ): { template: CompiledTemplate; params: Record<string, string>; url: URL } | undefined => {
    const tableUrl = readTableUrl(url)

    if (!tableUrl) {
      return
    }

    // With `www` a tenant, a host as given wins, so `www.example.com` is the tenant `www`.
    const asGiven =
      options.isWwwTenant && asGivenRegex.test(tableUrl.hostPath)
        ? findTemplate(tableUrl, false)
        : undefined
    const found =
      asGiven ??
      (optionalWwwRegex.test(tableUrl.hostPath) ? findTemplate(tableUrl, true) : undefined)

    if (!found?.params) {
      return
    }

    return { template: found.template, params: found.params, url: tableUrl.url }
  }

  const read: UrlTable<Key, Row>['read'] = (url) => {
    const found = readTemplate(url)

    if (!found) {
      return
    }

    const row = rows[found.template.rowIndex]

    return { key: row.key, params: found.params, row, isAlias: found.template.isAlias }
  }

  // An alias written as its row's main URL. The parameters neither URL names are kept as given,
  // and an alias without a value the main URL needs gives nothing.
  const getMainUrl: UrlTable<Key, Row>['getMainUrl'] = (url) => {
    const found = readTemplate(url)

    // A URL with credentials is left as it is: the main URL has no place that holds them.
    if (!found?.template.isAlias || found.url.username || found.url.password) {
      return
    }

    const [main] = compiledRows[found.template.rowIndex]
    const ownNames = [...found.template.ownNames, ...main.ownNames]
    const keptQuery = found.url.search
      .replace(leadingQuestionMarkRegex, '')
      .split('&')
      .filter((part) => part && !isAnyOf(decodePercent(part.split('=')[0]), ownNames))
      .join('&')
    const [passedQueryName] = main.passedQueryNames
    // A main URL that takes a passed query gets the kept parameters through it.
    const params = passedQueryName
      ? { [passedQueryName]: keptQuery, ...found.params }
      : found.params
    const builtUrl = main.getUrl(params)

    if (!builtUrl) {
      return
    }

    const separator = builtUrl.includes('?') ? '&' : '?'
    const withQuery =
      passedQueryName || !keptQuery ? builtUrl : `${builtUrl}${separator}${keptQuery}`

    // A port the main URL cannot keep, as one on a host it writes itself, leaves the URL as it is.
    if (found.url.port && parseUrl(withQuery)?.port !== found.url.port) {
      return
    }

    return withQuery
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

  return { build, buildAll, read, getMainUrl, forUrl }
}

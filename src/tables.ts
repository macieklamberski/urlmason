import {
  composeQuery,
  decodePercent,
  encodePathSegment,
  escapeRegex,
  getQueryParamValues,
  getSubdomain,
  isAnyOf,
  isHttpUrl,
  isSameText,
  isString,
  parseUrl,
  startsWithAnyOf,
  stripWww,
  t,
  trimObject,
} from 'trousse'
import locales from '../locales.json' with { type: 'json' }
import type { UrlLenient, UrlParams, UrlRow, UrlTable, UrlTableOptions } from '../types.js'

// One URL of a row: its main one or an alias.
type CompiledTemplate = {
  rowIndex: number
  isAlias: boolean
  queryCount: number
  // The query parameters the template sets itself, and the placeholders that take a passed query.
  ownNames: Array<string>
  passedQueryNames: Array<string>
  // The placeholders of the host, which a URL reads in any case.
  hostNames: Array<string>
  // The parameters the template sets to a fixed value, as `alt=rss`, and the ones it reads a
  // value from, as `id={id}`.
  fixedQuery: Array<[name: string, value: string]>
  valueNames: Array<string>
  // The host and path a URL the template takes matches, as given and with an optional `www`.
  asGivenRegex: RegExp
  optionalWwwRegex: RegExp
  // The values of a URL the template takes, read as given or with an optional `www`.
  readParams: (tableUrl: TableUrl, isWwwOptional: boolean) => Record<string, string> | undefined
  // The values of a URL in the spelling it has, read only from a URL written as the template is:
  // the same case, the same trailing slash, each own parameter once and under its own name. A
  // spelling a mark covers is read in the template's, with the URL written that way.
  readRawParams: (url: URL, isWwwOptional: boolean) => RawRead | undefined
  // Whether the trailing slash mark writes the path with another trailing slash, and whether the
  // template takes a host and decoded path with the trailing slash the path has.
  isSlashRespelled: (pathname: string) => boolean
  takesSlashedHostPath: (hostPath: string, isWwwOptional: boolean) => boolean
  // Whether the ampersand mark covers the template, so `&amp;` in a query is read as `&`.
  isAmpersandEntityRead: boolean
  // The template's URL with values written as they were read, and the query no row names kept.
  getRawUrl: (rawParams: RawParams, keptQuery: string) => string | undefined
  // The origin of a template that writes `https` itself, with the host values as the URL has them.
  getHttpsOrigin: (rawParams: RawParams) => string | undefined
  passesChecks: (params: Record<string, string>) => boolean
  getUrl: (params?: UrlParams) => string | undefined
}

type UrlPart = 'host' | 'path' | 'query'

// A placeholder a pattern captures, with the part of the URL it sits in.
type Captured = {
  name: string
  part: UrlPart
}

// A value as the URL spells it, with the part of the URL it was read from.
type RawParams = Record<string, { value: string; part: UrlPart }>

type RawRead = {
  params: RawParams
  url: URL
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
// A value every part of a URL reads the same way, so it can move from one part to another.
const plainValueRegex = /^[\w.~-]+$/
const pairSeparatorRegex = /=(.*)/s
const dotSegmentRegex = /^(?:\.|%2e){1,2}$/i
const captureRegex = /\(\?<p\d+>/g
const escapeSplitRegex = /(%[0-9a-f]{2})/i

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

// A value in lowercase, with its percent escapes as written.
const toLowerCaseValue = (value: string): string => {
  return value
    .split(escapeSplitRegex)
    .map((piece, index) => (index % 2 === 1 ? piece : piece.toLowerCase()))
    .join('')
}

// A query value as `URLSearchParams` reads it, a `+` as a space.
const decodeQueryValue = (value: string): string => {
  const options = { preserveEmptyValues: true, trimValues: false }

  return getQueryParamValues(`value=${value}`, 'value', options)[0] ?? ''
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

const toTableUrl = (url: URL): TableUrl => {
  // A doubled slash after the host names the same feed: pages link `host//feed` for `host/feed`.
  const path = url.pathname.replace(leadingSlashesRegex, '/')
  const pathname = decodePath(path).replace(trailingSlashRegex, '')

  return {
    url,
    hostPath: url.hostname + pathname,
  }
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
  lenient: UrlLenient | undefined,
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
  const fixedQuery = query.filter(([, value]) => !value.includes('{'))
  const valueNames = query.filter(([, value]) => value.includes('{')).map(([name]) => name)
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
  // Two values in one host label, path segment or query value are split by a guess, and a
  // lowercase can move the split to another place. So are two `{name*}` values in one template.
  const hasTwoMultiSegment = names.filter(isMultiSegment).length > 1
  const sharedPieces = hasTwoMultiSegment
    ? [template]
    : [...host.split('.'), ...path.split('/'), ...query.map(([, value]) => value)]
  const sharedName = sharedPieces
    .map((piece) => [...piece.matchAll(placeholderRegex)].map(([, name]) => toBareName(name)))
    .filter((pieceNames) => pieceNames.length > 1)
    .flat()
    .find((name) => lenient?.case?.includes(name))

  if (sharedName !== undefined) {
    throw new Error(t(locales.errors.sharedCaseMark, { key, name: sharedName }))
  }

  const checks = options.checks ?? {}
  const captured: Array<Captured> = []
  // Every placeholder is captured as `p{index}`, so a URL is read back to its values.
  const wrapCaptureIn = (part: UrlPart) => {
    return (name: string, source: string): string => {
      captured.push({ name: toBareName(name), part })

      return `(?<${captureGroupPrefix}${captured.length - 1}>${source})`
    }
  }
  const getCaptured = (group: string) => captured[Number(group.slice(captureGroupPrefix.length))]
  // A name the template holds twice keeps the first value read.
  const readGroups = (params: Record<string, string>, groups: Record<string, string> = {}) => {
    for (const [group, value] of Object.entries(groups)) {
      const { name } = getCaptured(group)

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
    wrapCaptureIn('path'),
  )
  // The path as the template writes it, for a URL read in its own spelling.
  // A template with no path is a site, which a URL names with or without the slash of its root.
  const rawPathSource = path
    ? toRegexSource(path, '[^/]+', multiSegmentCaptures, false, wrapCaptureIn('path'))
    : '/?'
  // A fixed host matches with or without `www` in front, a tenant label only with
  // `isWwwTenantPrefix`, so `www.alice.example.com` is otherwise no tenant's host.
  const toHostPathRegex = (isWwwOptional: boolean, pathPattern: string, flags: string): RegExp => {
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
      wrapCaptureIn('host'),
    )
    const prefixSource = `${fixedPrefixSource}${tenantPrefixSource}`

    return new RegExp(`^${prefixSource}${hostSource}${pathPattern}$`, flags)
  }
  const asGivenRegex = toHostPathRegex(false, pathSource, 'i')
  const optionalWwwRegex = toHostPathRegex(true, pathSource, 'i')
  // Matched on the path as given, with the indices a case mark lowercases.
  const rawAsGivenRegex = toHostPathRegex(false, rawPathSource, 'd')
  const rawOptionalWwwRegex = toHostPathRegex(true, rawPathSource, 'd')
  const slashedPathSource = path ? `${pathSource}${path.endsWith('/') ? '/' : ''}` : '/?'
  const slashedAsGivenRegex = toHostPathRegex(false, slashedPathSource, 'i')
  const slashedOptionalWwwRegex = toHostPathRegex(true, slashedPathSource, 'i')
  const isSlashFree = Boolean(path) && lenient?.trailingSlash === true
  const queryRegexes = query.map(([name, value]): [string, RegExp] => {
    const source = toRegexSource(value, '.+', {}, false, wrapCaptureIn('query'))

    return [name, new RegExp(`^${source}$`, 'i')]
  })
  // The text a row writes itself in a query value, encoded as `getUrl` encodes it.
  const encodeQueryText = (literal: string): string => {
    return encodeQueryParameter('', literal).slice(1).replace(nonAsciiRegex, encodeURIComponent)
  }
  const rawQueryRegexes = query.map(([name, value]): [string, RegExp] => {
    const wrapCapture = wrapCaptureIn('query')
    const source = value
      .split(placeholderRegex)
      .map((piece, index) => {
        return index % 2 === 1 ? wrapCapture(piece, '.+') : escapeRegex(encodeQueryText(piece))
      })
      .join('')

    return [name, new RegExp(`^${source}$`, 'd')]
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

  // A name the template holds twice reads one value, so two different ones read nothing.
  const readRawGroups = (rawParams: RawParams, groups: Record<string, string> = {}): boolean => {
    return Object.entries(groups).every(([group, value]) => {
      const { name, part } = getCaptured(group)

      if (value === undefined) {
        return true
      }

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
  const lowercaseValues = (match: RegExpExecArray) => {
    const groups = { ...match.groups }
    let text = match.input

    for (const [group, range] of Object.entries(match.indices?.groups ?? {})) {
      const captured = getCaptured(group)

      if (!range || !lenient?.case?.includes(captured.name)) {
        continue
      }

      const value = toLowerCaseValue(text.slice(range[0], range[1]))

      // A value whose check refuses the lowercase, as `en-US`, stays as written.
      if (checks[captured.name]?.(decodeValue(value, captured.part)) === false) {
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

  const readRawParams = (url: URL, isWwwOptional: boolean): RawRead | undefined => {
    const regex = isWwwOptional ? rawOptionalWwwRegex : rawAsGivenRegex
    const hostPath = url.hostname + respellSlash(url.pathname)
    const match = regex.exec(hostPath)
    const rawParams: RawParams = {}

    // A row that repeats a parameter name is read loosely, so a URL that gives the name once is
    // not written as the row writes it.
    if (!match || repeatedNames.length > 0) {
      return
    }

    const respelledHostPath = lowercaseValues(match)

    if (!readRawGroups(rawParams, respelledHostPath.groups)) {
      return
    }

    const pairs = url.search.replace(leadingQuestionMarkRegex, '').split('&')
    let isQueryRespelled = false

    for (const [name, rawRegex] of rawQueryRegexes) {
      const [index, ...others] = [...pairs.keys()].filter((pairIndex) => {
        return isAnyOf(decodePercent(pairs[pairIndex].split('=')[0]), name)
      })

      if (index === undefined) {
        return
      }

      const [pairName, value] = pairs[index].split(pairSeparatorRegex)

      // A parameter given twice or under another case is read differently from server to server.
      if (others.length > 0 || pairName !== name) {
        return
      }

      if (flags.has(name)) {
        if (value) {
          return
        }

        // A flag written with an equals sign and no value, as `?xml=`, is the flag.
        if (value !== undefined) {
          pairs[index] = name
          isQueryRespelled = true
        }

        continue
      }

      const queryMatch = rawRegex.exec(value ?? '')

      if (!queryMatch) {
        return
      }

      const respelledValue = lowercaseValues(queryMatch)

      if (!readRawGroups(rawParams, respelledValue.groups)) {
        return
      }

      if (respelledValue.text !== value) {
        pairs[index] = `${name}=${respelledValue.text}`
        isQueryRespelled = true
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

    if (respelledHostPath.text === url.hostname + url.pathname && !isQueryRespelled) {
      return { params: rawParams, url }
    }

    const respelledUrl = parseUrl(url.href)

    if (!respelledUrl) {
      return
    }

    respelledUrl.pathname = respelledHostPath.text.slice(url.hostname.length)

    if (isQueryRespelled) {
      // A first pair that opens with `?`, as in `??page=2`, keeps it as a part of its name.
      respelledUrl.search = `?${pairs.join('&')}`
    }

    return { params: rawParams, url: respelledUrl }
  }

  const getRawUrl = (rawParams: RawParams, keptQuery: string): string | undefined => {
    let isFilled = true
    // A value moved to another part of the URL is written only when it reads the same there.
    const fill = (text: string, part: UrlPart, encode = (literal: string) => literal): string => {
      return text
        .split(placeholderRegex)
        .map((piece, index) => {
          if (index % 2 === 0) {
            return encode(piece)
          }

          const rawParam = rawParams[toBareName(piece)]

          if (!rawParam || (rawParam.part !== part && !plainValueRegex.test(rawParam.value))) {
            isFilled = false

            return ''
          }

          return rawParam.value
        })
        .join('')
    }
    const origin = isRootTemplate
      ? fill(rootPlaceholder, 'host')
      : `${fill(scheme, 'host')}://${fill(host, 'host')}`
    const hasPassedQuery = queryEntries.some((entry) => getPassedQueryName(entry) !== undefined)
    const queryParts = queryEntries.map((entry) => {
      const [name, value] = entry

      if (getPassedQueryName(entry) !== undefined) {
        return keptQuery
      }

      return flags.has(name) ? name : `${name}=${fill(value, 'query', encodeQueryText)}`
    })
    const joinedQuery = [...queryParts, hasPassedQuery ? '' : keptQuery]
      .filter((queryPart) => queryPart)
      .join('&')
    const filledPath = fill(path, 'path')

    // A `.` or `..` segment is resolved away by a parser, so the URL would name another path.
    if (!isFilled || filledPath.split('/').some((segment) => dotSegmentRegex.test(segment))) {
      return
    }

    return `${origin}${filledPath}${joinedQuery ? `?${joinedQuery}` : ''}`
  }

  const getHttpsOrigin = (rawParams: RawParams): string | undefined => {
    if (!isAnyOf(scheme, 'https')) {
      return
    }

    let isFilled = true
    const filledHost = host.replace(placeholderRegex, (_placeholder, name: string) => {
      const rawParam = rawParams[toBareName(name)]

      if (!rawParam) {
        isFilled = false

        return ''
      }

      return rawParam.value
    })

    if (!isFilled) {
      return
    }

    return `https://${filledHost}`
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
    hostNames: [...host.matchAll(placeholderRegex)].map(([, name]) => name),
    fixedQuery,
    valueNames,
    asGivenRegex,
    optionalWwwRegex,
    readParams,
    readRawParams,
    isSlashRespelled,
    takesSlashedHostPath,
    isAmpersandEntityRead: lenient?.ampersandEntity === true,
    getRawUrl,
    getHttpsOrigin,
    passesChecks,
    getUrl,
  }
}

// One table of URLs, keyed by what each row is. `build` writes a row's URL from the values a page
// gave, `buildAll` lists every spelling of it, `read` takes a URL back to its row and values, and
// `getMainUrl` writes a URL in its row's main spelling.
export const defineUrls = <const Key extends string, Extra extends object = object>(
  // Extra is never read off the rows, so a field no row type names fails the typecheck.
  rows: Array<UrlRow<Key> & NoInfer<Extra>>,
  options: UrlTableOptions = {},
): UrlTable<Key, UrlRow<Key> & Extra> => {
  type Row = UrlRow<Key> & Extra
  type Select = (row: Row) => boolean

  const getLenient = (row: Row): UrlLenient => {
    const marks: UrlLenient = { ...options.lenient, ...row.lenient }

    // A case mark in another form than a list, as `case: true` past the types, is no mark.
    return { ...marks, case: Array.isArray(marks.case) ? marks.case : undefined }
  }
  const lenients = rows.map(getLenient)
  const compiledRows = rows.map((row, rowIndex) => {
    return [row.main, ...(row.aliases ?? [])].map((template, index) => {
      return compileTemplate(template, row, rowIndex, index > 0, options, lenients[rowIndex])
    })
  })
  const hasAmpersandMark = lenients.some((lenient) => lenient?.ampersandEntity)
  const compiled = compiledRows.flat()

  for (const [rowIndex, row] of rows.entries()) {
    const ownNames = compiledRows[rowIndex].flatMap((template) => template.ownNames)
    const name = row.keptParams?.find((keptParam) => isAnyOf(keptParam, ownNames))

    if (name !== undefined) {
      throw new Error(t(locales.errors.keptParamInTemplate, { key: row.key, name }))
    }
  }
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

      return JSON.stringify(values.toSorted((left, right) => left.localeCompare(right)))
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
    const url = tableUrl.url
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

    return [...url.searchParams].some(([name, value]) => {
      if (!isAnyOf(name, names) || isAnyOf(name, openNames)) {
        return false
      }

      // A fixed value is read in any case, as the template reads it.
      return !rowFixedQuery.some(([fixedName, fixedValue]) => {
        return isAnyOf(name, fixedName) && isAnyOf(value, fixedValue)
      })
    })
  }

  // The first template that takes the URL decides: a value its check refuses refuses the URL, so
  // a looser row such as one without the query does not take it in its place. So does a selector
  // under a value no row lists.
  const findTemplate = (
    tableUrl: TableUrl,
    isWwwOptional: boolean,
  ): { template: CompiledTemplate; params: Record<string, string> | undefined } | undefined => {
    for (const template of bySpecificity) {
      const params = template.readParams(tableUrl, isWwwOptional)

      if (!params) {
        continue
      }

      const isRefused =
        !template.passesChecks(params) || hasUnlistedSelector(template, tableUrl, isWwwOptional)

      return { template, params: isRefused ? undefined : params }
    }
  }

  type FoundTemplate = {
    template: CompiledTemplate
    params: Record<string, string>
    url: URL
    isWwwOptional: boolean
  }
  // A template that takes a URL, without values where it refuses the URL.
  type TakenTemplate = Omit<FoundTemplate, 'params'> & { params?: Record<string, string> }

  // A trailing slash another row writes, as `/{user}/` beside `/{user}`, is what picks that row,
  // so the trailing slash mark does not cover it.
  const readRawParams = ({ template, url, isWwwOptional }: FoundTemplate): RawRead | undefined => {
    const path = url.pathname.replace(leadingSlashesRegex, '/')
    const hostPath = url.hostname + decodePath(path)
    const isOtherRowSlash =
      template.isSlashRespelled(url.pathname) &&
      compiled.some((other) => {
        return (
          other.rowIndex !== template.rowIndex &&
          other.takesSlashedHostPath(hostPath, isWwwOptional)
        )
      })
    // An entity left after `&amp;` is read as `&`, as in `&amp;amp;`, or a pair that starts with
    // `amp;`, is written back as `&amp;`, which the mark reads as another query.
    const hasEntityLeft =
      template.isAmpersandEntityRead && url.search.replace('?', '&').includes('&amp;')

    if (isOtherRowSlash || hasEntityLeft) {
      return
    }

    return template.readRawParams(url, isWwwOptional)
  }

  const readTableTemplate = (tableUrl: TableUrl): TakenTemplate | undefined => {
    // With `www` a tenant, a host as given wins, so `www.example.com` is the tenant `www`.
    const asGiven =
      options.isWwwTenant && asGivenRegex.test(tableUrl.hostPath)
        ? findTemplate(tableUrl, false)
        : undefined
    const found =
      asGiven ??
      (optionalWwwRegex.test(tableUrl.hostPath) ? findTemplate(tableUrl, true) : undefined)

    if (!found) {
      return
    }

    return {
      template: found.template,
      params: found.params,
      url: tableUrl.url,
      isWwwOptional: !asGiven,
    }
  }

  // The template a URL is read by, with the URL as given beside the one read, which has `&amp;`
  // in its query as `&` where the ampersand mark covers it.
  const readTemplate = (url: string): (FoundTemplate & { sourceUrl: URL }) | undefined => {
    const tableUrl = readTableUrl(url)

    if (!tableUrl) {
      return
    }

    const sourceUrl = tableUrl.url
    let found = readTableTemplate(tableUrl)

    if (hasAmpersandMark && sourceUrl.search.includes('&amp;')) {
      const ampersandUrl = parseUrl(sourceUrl.href)

      if (!ampersandUrl) {
        return
      }

      ampersandUrl.search = sourceUrl.search.replaceAll('&amp;', '&')

      const ampersandFound = readTableTemplate(toTableUrl(ampersandUrl))

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

    return { ...found, params: found.params, sourceUrl }
  }

  const read: UrlTable<Key, Row>['read'] = (url) => {
    const found = readTemplate(url)

    if (!found) {
      return
    }

    const row = rows[found.template.rowIndex]

    return {
      key: row.key,
      params: found.params,
      row,
      isAlias: found.template.isAlias,
      isExact: readRawParams(found) !== undefined,
    }
  }

  // The URL a template read, written as its row's main URL, or undefined where it cannot be.
  const writeMainUrl = (
    template: CompiledTemplate,
    { params: rawParams, url }: RawRead,
  ): string | undefined => {
    const [main] = compiledRows[template.rowIndex]
    const row = rows[template.rowIndex]
    const keptParams = row.keptParams ?? options.keptParams
    const pairs = url.search
      .replace(leadingQuestionMarkRegex, '')
      .split('&')
      .filter((pair) => pair)
    const isNamed = (pair: string, names: Array<string>): boolean => {
      return isAnyOf(decodePercent(pair.split('=')[0]), names)
    }
    // A parameter no template names stays, and with a list only when the list names it.
    const isKept = (pair: string): boolean => !keptParams || isNamed(pair, keptParams)
    // A name is read in any case, so two cases of one name are one name here too.
    const getName = (pair: string): string => decodePercent(pair.split('=')[0]).toLowerCase()
    // A main URL writes its query sorted by name, so one feed has one spelling whatever order the
    // URL had. Pairs of one name keep their order.
    const sortPairs = (unsortedPairs: Array<string>): Array<string> => {
      return unsortedPairs.toSorted((left, right) => {
        const leftName = getName(left)
        const rightName = getName(right)

        if (leftName === rightName) {
          return 0
        }

        return leftName < rightName ? -1 : 1
      })
    }

    if (!template.isAlias) {
      const origin = url.port ? undefined : main.getHttpsOrigin(rawParams)
      const stayingPairs = sortPairs(
        pairs.filter((pair) => isNamed(pair, main.ownNames) || isKept(pair)),
      )
      const isQueryAsGiven = stayingPairs.join('&') === pairs.join('&')
      const { pathname, hash } = url
      const search = stayingPairs.length > 0 ? `?${stayingPairs.join('&')}` : ''
      // A query that needs no change stays as written, an empty one and an empty pair included.
      const rest = isQueryAsGiven
        ? url.href.slice(url.origin.length)
        : `${pathname}${search}${hash}`

      return `${origin ?? url.origin}${rest}`
    }

    const ownNames = [...template.ownNames, ...main.ownNames]
    const keptQuery = pairs.filter((pair) => !isNamed(pair, ownNames) && isKept(pair)).join('&')
    const unsortedMainUrl = main.getRawUrl(rawParams, keptQuery)
    const [mainBase, ...mainQueryParts] = unsortedMainUrl?.split('?') ?? []
    const sortedMainQuery = sortPairs(mainQueryParts.join('?').split('&')).join('&')
    const mainUrl = sortedMainQuery ? `${mainBase}?${sortedMainQuery}` : unsortedMainUrl

    // A port the main URL cannot keep, as one on a host it writes itself, leaves the URL as it is.
    if (!mainUrl || (url.port && parseUrl(mainUrl)?.port !== url.port)) {
      return
    }

    // An `https` URL is never written down to `http`.
    if (url.protocol === 'https:' && startsWithAnyOf(mainUrl, 'http:')) {
      return
    }

    // A flag of the main URL written with an equals sign and no value, as `xml=`, is the flag.
    const mainFlagPairs = main.fixedQuery.filter(([, value]) => !value).map(([name]) => `${name}=`)
    const mainPairs = new Set([...(mainUrl.split('?')[1]?.split('&') ?? []), ...mainFlagPairs])
    const hasOtherValue = pairs.some((pair) => {
      return (
        isNamed(pair, main.ownNames) && !isNamed(pair, template.ownNames) && !mainPairs.has(pair)
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

    if (!found || found.url.username || found.url.password) {
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

    const mainUrl = writeMainUrl(found.template, rawRead)

    if (!mainUrl || mainUrl === found.sourceUrl.href) {
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

      // A root holds the scheme, which a main URL under `http` changes, and the host read beside it.
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

  return { build, buildAll, read, getMainUrl, forUrl }
}

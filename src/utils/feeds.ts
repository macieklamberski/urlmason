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
import type {
  FeedFormat,
  FeedHint,
  PlatformFeed,
  PlatformFeedParams,
  PlatformFeedTable,
  PlatformFeedTableOptions,
} from '../types.js'

// One URL of a feed: its main one or an alias.
type FeedTemplate = Omit<PlatformFeed, 'main' | 'aliases'> & {
  template: string
  isAlias?: boolean
}

type CompiledTemplate = {
  key: string
  format?: FeedFormat
  isAlias?: boolean
  isBuildOnly?: boolean
  queryCount: number
  // The host and path a URL the template claims matches, as given and with an optional `www`.
  asGivenRegex: RegExp
  optionalWwwRegex: RegExp
  isFeedUrl: (feedUrl: FeedUrl) => boolean
  isFeedUrlWithOptionalWww: (feedUrl: FeedUrl) => boolean
  getUrl: (params?: PlatformFeedParams) => string | undefined
}

// A URL as the templates read it: the host joined to the decoded path without its trailing slash.
type FeedUrl = {
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

const rootPlaceholder = '{root}'
const multiSegmentCapture = '[^/]+(?:/[^/]+)*'

const isMultiSegment = (placeholder: string): boolean => {
  return placeholder.endsWith('*')
}

// A `{name*}` value is one or more segments joined by `/`. An empty segment is dropped, as a
// doubled slash names the same page, and a value with no segment left is no value.
const getPlaceholderValue = (
  params: PlatformFeedParams,
  placeholder: string,
): string | undefined => {
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
let lastFeedUrl: { url: string; feedUrl: FeedUrl | undefined } | undefined

const readFeedUrl = (url: string): FeedUrl | undefined => {
  if (lastFeedUrl?.url === url) {
    return lastFeedUrl.feedUrl
  }

  const parsedUrl = parseUrl(url)
  let feedUrl: FeedUrl | undefined

  if (parsedUrl && isHttpUrl(parsedUrl)) {
    // A doubled slash after the host names the same feed: pages link `host//feed` for `host/feed`.
    const path = parsedUrl.pathname.replace(leadingSlashesRegex, '/')
    const pathname = decodePath(path).replace(trailingSlashRegex, '')

    feedUrl = {
      url: parsedUrl,
      hostPath: parsedUrl.hostname + pathname,
    }
  }

  lastFeedUrl = { url, feedUrl }

  return feedUrl
}

const composeHint = (key: string, format?: FeedFormat): FeedHint => {
  if (!format) {
    return { key }
  }

  return { key, format }
}

// One pattern any of the patterns matches, so a table reads a URL on none of its feeds at once.
const joinRegexes = (regexes: Array<RegExp>): RegExp => {
  const sources = regexes.map((regex) => `(?:${regex.source})`)

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
): string => {
  return text
    .split(placeholderRegex)
    .map((piece, index) => {
      if (index % 2 === 1) {
        return captures[piece] ?? capture
      }

      return escapeRegex(isPath ? decodePath(piece) : piece)
    })
    .join('')
}

// A template as two functions: whether a URL is this feed, and the feed URL for a page's values.
const compileTemplate = (
  { key, format, template, isAlias, isBuildOnly, queryEncoding }: FeedTemplate,
  options: PlatformFeedTableOptions,
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
  // A passed query names no parameter of the feed, so it is neither matched nor counted.
  const query = queryEntries.filter((entry) => getPassedQueryName(entry) === undefined)
  const ownNames = query.map(([name]) => name)
  const encodeQueryParameter = (name: string, value: string | true): string => {
    if (value === true || queryEncoding !== 'form') {
      return composeQuery({ [name]: value }).slice(1)
    }

    // biome-ignore lint/plugin/useComposeQuery: The form option asks for what URLSearchParams writes.
    return new URLSearchParams([[name, value]]).toString()
  }
  // A passed query is written as given, without its `?` and the parameters the feed sets itself.
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
  const hosts = options.hosts ?? []
  const tenantDomains = (options.tenantDomains ?? []).map((domain) => toEntrySource(domain))
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
  // An empty value is no value: a host label or path segment left empty builds a broken URL, as
  // `/t//feed`, and a query value left empty a feed the page does not name, as `?videoChannelId=`.
  // An empty passed query passes nothing, so the feed writes its own parameters alone.
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
    const hostSource = toRegexSource(normalize(host), tenantSource, {
      host: `(?:${hostSources.join('|')})`,
      domain: domainSource,
    })

    return new RegExp(`^${fixedPrefixSource}${tenantPrefixSource}${hostSource}${pathSource}$`, 'i')
  }
  const asGivenRegex = toHostPathRegex(false)
  const optionalWwwRegex = toHostPathRegex(true)
  const queryRegexes = query.map(([name, value]): [string, RegExp] => {
    return [name, new RegExp(`^${toRegexSource(value, '.+')}$`, 'i')]
  })
  const repeatedNames = ownNames.filter((name, index) => ownNames.indexOf(name) !== index)

  // A `{root}` table without hosts serves any site, so nothing in its URL names the platform.
  const claimsUrls = !isRootTemplate || hasHosts

  const matchesUrl = (url: URL, hostPathRegex: RegExp, hostPath: string): boolean => {
    if (!claimsUrls || !hostPathRegex.test(hostPath)) {
      return false
    }

    return queryRegexes.every(([name, regex]) => {
      const values = getQueryParamValues(url, name, { preserveEmptyValues: flags.has(name) })
      // A name the feed repeats, as `types=page&types=blogpost`, finds each value in any place.
      const candidates = repeatedNames.includes(name) ? values : values.slice(0, 1)

      return candidates.some((value) => regex.test(value))
    })
  }

  const isFeedUrl = ({ url, hostPath }: FeedUrl): boolean => {
    return matchesUrl(url, asGivenRegex, hostPath)
  }

  const isFeedUrlWithOptionalWww = ({ url, hostPath }: FeedUrl): boolean => {
    return matchesUrl(url, optionalWwwRegex, hostPath)
  }

  // A template whose placeholders the values do not all fill builds no URL.
  const getUrl = (params: PlatformFeedParams = {}): string | undefined => {
    const values: Record<string, string> = {}

    for (const name of names) {
      const value = getPlaceholderValue(params, name)

      if (value === undefined || (!value && !passedQueryNames.has(name))) {
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
    key,
    format,
    isAlias,
    isBuildOnly,
    queryCount: query.length,
    asGivenRegex,
    optionalWwwRegex,
    isFeedUrl,
    isFeedUrlWithOptionalWww,
    getUrl,
  }
}

// One table of a handler's feed URLs, keyed by hint key. `getFeedUrl` writes a feed from the values
// a page gave, `getFeedEntry` adds its hint, `getFeedSpellings` lists every spelling of the feed
// under one hint, and `getFeedHint` reads a URL back to the feed's hint.
export const definePlatformFeeds = <const Key extends string>(
  feeds: Array<PlatformFeed<Key>>,
  options: PlatformFeedTableOptions = {},
): PlatformFeedTable<Key> => {
  const templates = feeds.flatMap(({ main, aliases = [], ...feed }): Array<FeedTemplate> => {
    return [
      { ...feed, template: main },
      ...aliases.map((alias) => ({ ...feed, template: alias, isAlias: true })),
    ]
  })
  const compiled = templates.map((template) => compileTemplate(template, options))
  // A template with more query parameters is the more specific one, so it is read first. At the
  // same count the earlier feed wins, so a `{name*}` feed goes after the feeds its paths overlap.
  const claimed = compiled.filter((candidate) => !candidate.isBuildOnly)
  const bySpecificity = [...claimed].sort((a, b) => b.queryCount - a.queryCount)
  // A URL whose host and path no template takes is none of the feeds, whatever its query.
  const asGivenRegex = joinRegexes(claimed.map((candidate) => candidate.asGivenRegex))
  const optionalWwwRegex = joinRegexes(claimed.map((candidate) => candidate.optionalWwwRegex))

  const getCandidates = (key: string, format: FeedFormat | undefined): Array<CompiledTemplate> => {
    const candidates = compiled.filter((candidate) => {
      return candidate.key === key && (format === undefined || candidate.format === format)
    })

    if (candidates.length === 0) {
      throw new Error(t(locales.errors.missingFeedTemplate, { key }))
    }

    return candidates
  }

  const getFeedUrl: PlatformFeedTable<Key>['getFeedUrl'] = (key, params, format) => {
    // A key with several shapes builds the first one whose placeholders the values fill.
    for (const candidate of getCandidates(key, format)) {
      const feedUrl = candidate.getUrl(params)

      if (feedUrl) {
        return feedUrl
      }
    }
  }

  const getFeedEntry: PlatformFeedTable<Key>['getFeedEntry'] = (key, params, format) => {
    const uri = getFeedUrl(key, params, format)

    if (!uri) {
      return
    }

    return { uri, hint: composeHint(key, format) }
  }

  // The URL `getFeedUrl` builds, then every alias of its feed after it that the values fill.
  const getFeedSpellings: PlatformFeedTable<Key>['getFeedSpellings'] = (key, params, format) => {
    const uris: Array<string> = []
    let first: CompiledTemplate | undefined

    for (const candidate of getCandidates(key, format)) {
      if (first && candidate.format !== first.format) {
        continue
      }

      // The next main URL of the same format is another feed.
      if (first && !candidate.isAlias) {
        break
      }

      const uri = candidate.getUrl(params)

      if (!uri) {
        continue
      }

      if (!first) {
        first = candidate
      }

      uris.push(uri)
    }

    if (uris.length === 0) {
      return
    }

    return {
      uri: uris.length === 1 ? uris[0] : uris,
      hint: composeHint(key, format),
    }
  }

  const getFeedHint: PlatformFeedTable<Key>['getFeedHint'] = (url) => {
    const feedUrl = readFeedUrl(url)

    if (!feedUrl) {
      return
    }

    // With `www` a tenant, a host as given wins, so `www.example.com` is the tenant `www`.
    if (options.isWwwTenant && asGivenRegex.test(feedUrl.hostPath)) {
      const template = bySpecificity.find((candidate) => candidate.isFeedUrl(feedUrl))

      if (template) {
        return composeHint(template.key, template.format)
      }
    }

    if (!optionalWwwRegex.test(feedUrl.hostPath)) {
      return
    }

    const template = bySpecificity.find((candidate) => {
      return candidate.isFeedUrlWithOptionalWww(feedUrl)
    })

    if (!template) {
      return
    }

    return composeHint(template.key, template.format)
  }

  // The table for one page: `{scheme}`, `{host}` and `{root}` come from the page URL, `{domain}` is
  // its host without the tenant under `tenantDomains`, `example.co.uk` for `alice.example.co.uk`.
  // A value the caller passes wins, so a caller passes a root with the base path the page names.
  const forUrl: PlatformFeedTable<Key>['forUrl'] = (url) => {
    const parsedUrl = parseUrl(url)

    if (!parsedUrl || !isHttpUrl(parsedUrl)) {
      return
    }

    const subdomain = getSubdomain(parsedUrl, options.tenantDomains ?? [])
    const urlParams: PlatformFeedParams = {
      scheme: parsedUrl.protocol.slice(0, -1),
      host: parsedUrl.host,
      root: parsedUrl.origin,
      domain: subdomain ? parsedUrl.hostname.slice(subdomain.length + 1) : undefined,
    }
    // An undefined value the handler passes leaves the one of the page in place.
    const withUrlParams = (params: PlatformFeedParams = {}): PlatformFeedParams => {
      return { ...urlParams, ...trimObject(params) }
    }

    return {
      getFeedUrl: (key, params, format) => getFeedUrl(key, withUrlParams(params), format),
      getFeedEntry: (key, params, format) => getFeedEntry(key, withUrlParams(params), format),
      getFeedSpellings: (key, params, format) => {
        return getFeedSpellings(key, withUrlParams(params), format)
      },
    }
  }

  return { getFeedUrl, getFeedEntry, getFeedSpellings, getFeedHint, forUrl }
}

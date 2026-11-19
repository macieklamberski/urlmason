import { parseUrl } from 'trousse'
import type {
  FeedFormat,
  FeedHint,
  FeedUrlRow,
  FeedUrlTable,
  Platform,
  UrlParams,
  UrlTableOptions,
} from '../types.js'
import { defineUrls } from './tables.js'

// One table of a platform's feed URLs, each row keyed by its kind. A hint is keyed
// `{platform}:{kind}`, as `dailymotion:playlist`.
export const defineFeedUrls = <const Key extends string>(
  platform: string,
  rows: Array<FeedUrlRow<Key>>,
  options: UrlTableOptions = {},
): FeedUrlTable<Key> => {
  const urls = defineUrls<Key, { format?: FeedFormat }>(rows, options)

  const composeHint = (key: string, format?: FeedFormat): FeedHint => {
    const hintKey = `${platform}:${key}`

    if (!format) {
      return { key: hintKey }
    }

    return { key: hintKey, format }
  }

  const selectFormat = (format?: FeedFormat) => {
    if (!format) {
      return
    }

    return (row: FeedUrlRow<Key>): boolean => row.format === format
  }

  type Page = Pick<
    ReturnType<typeof defineUrls<Key, { format?: FeedFormat }>>,
    'build' | 'buildAll'
  >

  const getFeedUrlOn = (page: Page, key: Key, params?: UrlParams, format?: FeedFormat) => {
    return page.build(key, params, selectFormat(format))
  }

  const getFeedEntryOn = (page: Page, key: Key, params?: UrlParams, format?: FeedFormat) => {
    const uri = getFeedUrlOn(page, key, params, format)

    if (!uri) {
      return
    }

    return { uri, hint: composeHint(key, format) }
  }

  const getFeedSpellingsOn = (page: Page, key: Key, params?: UrlParams, format?: FeedFormat) => {
    const uris = page.buildAll(key, params, selectFormat(format))

    if (uris.length === 0) {
      return
    }

    return { uri: uris.length === 1 ? uris[0] : uris, hint: composeHint(key, format) }
  }

  return {
    rows: urls.rows,
    getFeedUrl: (key, params, format) => getFeedUrlOn(urls, key, params, format),
    getFeedEntry: (key, params, format) => getFeedEntryOn(urls, key, params, format),
    getFeedSpellings: (key, params, format) => getFeedSpellingsOn(urls, key, params, format),
    getFeedHint: (url) => {
      const match = urls.read(url)

      if (!match) {
        return
      }

      return composeHint(match.key, match.row.format)
    },
    getMainFeedUrl: urls.getMainUrl,
    read: urls.read,
    forUrl: (url) => {
      const page = urls.forUrl(url)

      if (!page) {
        return
      }

      return {
        getFeedUrl: (key, params, format) => getFeedUrlOn(page, key, params, format),
        getFeedEntry: (key, params, format) => getFeedEntryOn(page, key, params, format),
        getFeedSpellings: (key, params, format) => getFeedSpellingsOn(page, key, params, format),
      }
    },
  }
}

const trailingSlashRegex = /\/$/

// The main URL of a feed, from the first platform whose table reads the URL.
export const getMainFeedUrl = (url: string, platforms: Array<Platform>): string | undefined => {
  for (const platform of platforms) {
    if (platform.feeds.read(url)) {
      return platform.feeds.getMainFeedUrl(url)
    }
  }
}

// A URL of any page on the main host and scheme of its site, from the first platform whose sites
// take its origin. The path, the query and the hash stay as given.
export const getMainSiteUrl = (url: string, platforms: Array<Platform>): string | undefined => {
  const parsedUrl = parseUrl(url)

  // A URL with credentials is left as it is, as the main URL of a feed is.
  if (!parsedUrl || parsedUrl.username || parsedUrl.password) {
    return
  }

  // An origin holds no credentials, and none are left here, so the rest of the URL starts where
  // the origin ends, with an empty query or fragment as written.
  const rest = parsedUrl.href.slice(parsedUrl.origin.length)

  for (const platform of platforms) {
    const mainOrigin = platform.sites?.getMainUrl(parsedUrl.origin)

    // A rewritten origin can end in the slash of its root, which the path brings again.
    if (mainOrigin) {
      return `${mainOrigin.replace(trailingSlashRegex, '')}${rest}`
    }
  }
}

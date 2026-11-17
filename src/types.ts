export type FeedFormat = 'rss' | 'atom' | 'rdf' | 'json'

export type FeedHint = {
  key: string
  format?: FeedFormat
}

export type FeedEntry = {
  uri: string | Array<string>
  hint: FeedHint
}

export type PlatformFeed<Key extends string = string> = {
  key: Key
  // The feed's URL, with `{name}` placeholders, each one host label, path segment or query value.
  // `{scheme}` is the page's scheme, `{root}` its scheme, host and base path, `{name*}` one or
  // more path segments, and a whole query parameter such as `?{query}` a query the page passes.
  main: string
  // Other URLs that serve the same feed, such as a legacy host, written as `main` is.
  aliases?: Array<string>
  format?: FeedFormat
  // A feed `getFeedUrl` builds and `getFeedHint` never reads, such as a feed on a site's own
  // domain, where nothing in the URL names the platform.
  isBuildOnly?: boolean
  // How the feed's query values are written: `minimal`, the default, escapes only what would
  // change the URL's structure, and `form` encodes as `URLSearchParams` does, `:` as `%3A` and a
  // space as `+`.
  queryEncoding?: 'minimal' | 'form'
}

// A value left undefined is no value, so the URL it would fill is skipped.
export type PlatformFeedParams = Record<string, string | undefined>

export type PlatformHosts = {
  // The exact hosts a `{host}` placeholder stands for. A pattern stands for one name across
  // suffixes, such as `/^example\.(?:com|de)$/`, anchored at both ends, and matches the host as
  // given or without `www`.
  exact?: Array<string | RegExp>
  // The domains tenants live under: a `{domain}` placeholder stands for one, and `{host}` for every
  // one-label tenant under one. A pattern stands for a family of domains, such as
  // `/^blogspot\.(?:com|com\.[a-z]{2})$/`, anchored at both ends.
  tenants?: Array<string | RegExp>
}

export type PlatformFeedCheck = (value: string) => boolean

export type PlatformFeedTableOptions = {
  hosts?: PlatformHosts
  // Whether `www` can be a tenant, so `www.example.com` matches a `{user}.example.com` feed.
  isWwwTenant?: boolean
  // Whether `www` in front of a tenant label is dropped, so `www.alice.example.com` matches as
  // `alice.example.com`.
  isWwwTenantPrefix?: boolean
  // A check per placeholder name, such as `{ locale: isLocale }`. A feed URL whose value fails its
  // check is not built, and `getFeedHint` claims no URL whose value fails it.
  checks?: Record<string, PlatformFeedCheck>
}

// A table's methods take only the keys of its feeds, so a key the table does not hold fails the
// typecheck.
export type PlatformFeedTable<Key extends string = string> = {
  getFeedUrl: (key: Key, params?: PlatformFeedParams, format?: FeedFormat) => string | undefined
  getFeedEntry: (
    key: Key,
    params?: PlatformFeedParams,
    format?: FeedFormat,
  ) => FeedEntry | undefined
  getFeedSpellings: (
    key: Key,
    params?: PlatformFeedParams,
    format?: FeedFormat,
  ) => FeedEntry | undefined
  getFeedHint: (url: string) => FeedHint | undefined
  forUrl: (
    url: string,
  ) => Pick<PlatformFeedTable<Key>, 'getFeedUrl' | 'getFeedEntry' | 'getFeedSpellings'> | undefined
}

export type Platform = {
  hosts?: PlatformHosts
  // A table takes only its own keys, so only a table of no keys stands for every table.
  feeds: PlatformFeedTable<never>
  getFeedHint?: PlatformFeedTable['getFeedHint']
}

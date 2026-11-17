export type FeedFormat = 'rss' | 'atom' | 'rdf' | 'json'

export type FeedHint = {
  key: string
  format?: FeedFormat
}

export type FeedEntry = {
  uri: string | Array<string>
  hint: FeedHint
}

export type UrlRow<Key extends string = string> = {
  key: Key
  // The row's URL, with `{name}` placeholders, each one host label, path segment or query value.
  // `{scheme}` is the page's scheme, `{root}` its scheme, host and base path, `{name*}` one or
  // more path segments, and a whole query parameter such as `?{query}` a query the page passes.
  main: string
  // Other URLs that serve the same thing, such as a legacy host, written as `main` is.
  aliases?: Array<string>
  // A row that is built and never read, such as a feed on a site's own domain, where nothing in
  // the URL names the platform.
  isBuildOnly?: boolean
  // How the row's query values are written: `minimal`, the default, escapes only what would
  // change the URL's structure, and `form` encodes as `URLSearchParams` does, `:` as `%3A` and a
  // space as `+`.
  queryEncoding?: 'minimal' | 'form'
}

export type FeedUrlRow<Key extends string = string> = UrlRow<Key> & {
  format?: FeedFormat
}

// A value left undefined is no value, so the URL it would fill is skipped.
export type UrlParams = Record<string, string | undefined>

export type UrlHosts = {
  // The exact hosts a `{host}` placeholder stands for. A pattern stands for one name across
  // suffixes, such as `/^example\.(?:com|de)$/`, anchored at both ends, and matches the host as
  // given or without `www`.
  exact?: Array<string | RegExp>
  // The domains tenants live under: a `{domain}` placeholder stands for one, and `{host}` for every
  // one-label tenant under one. A pattern stands for a family of domains, such as
  // `/^blogspot\.(?:com|com\.[a-z]{2})$/`, anchored at both ends.
  tenants?: Array<string | RegExp>
}

export type UrlCheck = (value: string) => boolean

export type UrlTableOptions = {
  hosts?: UrlHosts
  // Whether `www` can be a tenant, so `www.example.com` matches a `{user}.example.com` row.
  isWwwTenant?: boolean
  // Whether `www` in front of a tenant label is dropped, so `www.alice.example.com` matches as
  // `alice.example.com`.
  isWwwTenantPrefix?: boolean
  // A check per placeholder name, such as `{ locale: isLocale }`. A URL whose value fails its
  // check is neither built nor read.
  checks?: Record<string, UrlCheck>
}

export type UrlMatch<Key extends string, Row> = {
  key: Key
  params: Record<string, string>
  row: Row
  isAlias: boolean
}

// A table's methods take only the keys of its rows, so a key the table does not hold fails the
// typecheck. `select` narrows the key's rows, as to one format.
export type UrlTable<Key extends string, Row> = {
  build: (key: Key, params?: UrlParams, select?: (row: Row) => boolean) => string | undefined
  buildAll: (key: Key, params?: UrlParams, select?: (row: Row) => boolean) => Array<string>
  read: (url: string) => UrlMatch<Key, Row> | undefined
  getMainUrl: (url: string) => string | undefined
  forUrl: (url: string) => Pick<UrlTable<Key, Row>, 'build' | 'buildAll'> | undefined
}

export type FeedUrlTable<Key extends string = string> = {
  getFeedUrl: (key: Key, params?: UrlParams, format?: FeedFormat) => string | undefined
  getFeedEntry: (key: Key, params?: UrlParams, format?: FeedFormat) => FeedEntry | undefined
  getFeedSpellings: (key: Key, params?: UrlParams, format?: FeedFormat) => FeedEntry | undefined
  getFeedHint: (url: string) => FeedHint | undefined
  getMainFeedUrl: (url: string) => string | undefined
  forUrl: (
    url: string,
  ) => Pick<FeedUrlTable<Key>, 'getFeedUrl' | 'getFeedEntry' | 'getFeedSpellings'> | undefined
}

export type Platform = {
  hosts?: UrlHosts
  // A table takes only its own keys, so only a table of no keys stands for every table.
  feeds: FeedUrlTable<never>
  getFeedHint?: FeedUrlTable['getFeedHint']
}

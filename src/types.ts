export type FeedFormat = 'rss' | 'atom' | 'rdf' | 'json'

export type FeedHint = {
  key: string
  format?: FeedFormat
}

export type FeedEntry = {
  uri: string | Array<string>
  hint: FeedHint
}

// The other spellings a platform reads as the same URL, each mark resting on a fetch.
export type UrlLenient = {
  // The placeholders whose value is read in any letter case. The main URL writes it in lowercase.
  // A table throws for one that shares a host label, path segment or query value with another.
  case?: Array<string>
  // A URL with or without a trailing slash. A slash another row writes on the same path is not
  // covered: such a URL is not exact and not rewritten.
  trailingSlash?: boolean
  // `&amp;` between query pairs read as `&`.
  ampersandEntity?: boolean
}

export type UrlRow<Key extends string = string> = {
  key: Key
  // The row's URL. `{name}` is one host label, path segment or query value, `{scheme}` the page's
  // scheme, `{root}` its scheme, host and base path, `{name*}` one or more path segments, `/{*}`
  // at the end of the path zero or more, and a parameter such as `?{query}` a passed query.
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
  // The query parameters the row takes beside the ones its URLs set, as `max-results`: names as
  // the platform writes them, never placeholder names. With a list, a rewrite to the main URL
  // drops every other parameter. Without one it keeps them all.
  keptParams?: Array<string>
  // The row's marks over the table's, key by key, so `{ case: [] }` or `{ trailingSlash: false }`
  // turns the table's mark off.
  lenient?: UrlLenient
}

export type FeedUrlRow<Key extends string = string> = UrlRow<Key> & {
  format?: FeedFormat
}

// A row as a list declared `as const` holds it: every field and every list in it read-only.
export type DeepReadonly<Value> = Value extends object
  ? { readonly [Field in keyof Value]: DeepReadonly<Value[Field]> }
  : Value

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

export type UrlCheck = ((value: string) => boolean) | RegExp

export type UrlTableOptions = {
  hosts?: UrlHosts
  // Whether `www` can be a tenant, so `www.example.com` matches a `{user}.example.com` row.
  isWwwTenant?: boolean
  // Whether `www` in front of a tenant label is dropped, so `www.alice.example.com` matches as
  // `alice.example.com`.
  isWwwTenantPrefix?: boolean
  // A check per placeholder name: a function, as `{ locale: isLocale }`, or a pattern anchored at
  // both ends with no `g` or `y` flag, as `{ id: /^\d+$/ }`. A URL whose value fails its check is
  // neither built nor read.
  checks?: Record<string, UrlCheck>
  // The `keptParams` of every row that names none of its own.
  keptParams?: Array<string>
  // The marks of every row, which a row's own `lenient` overrides key by key.
  lenient?: UrlLenient
}

// How the rows that open with `{root}` read a URL on any host. With either option only those rows
// are read, `hosts` is left aside, the URL is never exact, and `root` is among the values read.
export type UrlReadOptions = {
  // The root the page lives under, as `https://example.com/forum`. The URL is under it on the same
  // host and port, in any scheme, `www`, letter case and trailing slash. It wins over `isAnyHost`.
  root?: string
  // Whether the URL shows the root: the shortest one under which a row with fixed text in its path
  // reads the URL, then the shortest under which any row does, up to eight segments of base path.
  isAnyHost?: boolean
}

export type UrlMatch<Key extends string, Row> = {
  key: Key
  // The values read, decoded. The segments a row's `/{*}` took are the value `tail`, which a URL
  // with none lacks. A URL with a tail is not exact and has no main URL, and `build` writes none.
  params: Record<string, string>
  row: Row
  isAlias: boolean
  // Whether the URL is written as the row writes it, or in a spelling its marks cover: the same
  // case, the same trailing slash and each own parameter once. A platform can answer any other
  // spelling with another feed.
  isExact: boolean
}

// A table's methods take only the keys of its rows, so a key the table does not hold fails the
// typecheck. `select` narrows the key's rows by their fields, as to one format: it gets a copy of
// each row, never the object given. A built URL and a main URL write their query sorted by name.
export type UrlTable<Key extends string, Row> = {
  // A copy of each row given, for a caller that walks every row of a table.
  rows: Array<Row>
  build: (key: Key, params?: UrlParams, select?: (row: Row) => boolean) => string | undefined
  buildAll: (key: Key, params?: UrlParams, select?: (row: Row) => boolean) => Array<string>
  read: (url: string, options?: UrlReadOptions) => UrlMatch<Key, Row> | undefined
  getMainUrl: (url: string) => string | undefined
  forUrl: (url: string) => Pick<UrlTable<Key, Row>, 'build' | 'buildAll'> | undefined
}

export type FeedUrlTable<Key extends string = string> = {
  // The platform's name, the part of a hint key before the colon.
  platform: string
  rows: Array<FeedUrlRow<Key>>
  getFeedUrl: (key: Key, params?: UrlParams, format?: FeedFormat) => string | undefined
  getFeedEntry: (key: Key, params?: UrlParams, format?: FeedFormat) => FeedEntry | undefined
  getFeedSpellings: (key: Key, params?: UrlParams, format?: FeedFormat) => FeedEntry | undefined
  getFeedHint: (url: string) => FeedHint | undefined
  getMainFeedUrl: (url: string) => string | undefined
  // A feed on a host no row names gets no hint and no main URL: only `read` takes the options.
  read: (url: string, options?: UrlReadOptions) => UrlMatch<Key, FeedUrlRow<Key>> | undefined
  forUrl: (
    url: string,
  ) => Pick<FeedUrlTable<Key>, 'getFeedUrl' | 'getFeedEntry' | 'getFeedSpellings'> | undefined
}

export type Platform = {
  hosts?: UrlHosts
  // A table takes only its own keys, so only a table of no keys stands for every table. What a
  // table reads comes back under any key.
  feeds: Omit<FeedUrlTable<never>, 'rows' | 'read'> & {
    rows: Array<FeedUrlRow>
    read: (url: string, options?: UrlReadOptions) => UrlMatch<string, FeedUrlRow> | undefined
  }
  // The sites of the platform, each row an origin with no path, for the host and scheme facts
  // that hold on every page and not only on a feed.
  sites?: Pick<UrlTable<string, UrlRow>, 'getMainUrl'>
  // The page URLs of the platform, a table with no rows until the platform gets its page rows.
  pages?: Pick<UrlTable<string, UrlRow>, 'read'>
}

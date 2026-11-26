// The other spellings a platform reads as the same URL, each mark resting on a fetch.
export type UrlLenient = {
  // The placeholders whose value is read in any letter case. The main URL writes it in lowercase.
  // A table throws for one that shares a host label, path segment or query value with another.
  case?: Array<string>
  // `&amp;` between query pairs read as `&`.
  ampersandEntity?: boolean
}

export type UrlRow<Key extends string = string> = {
  key: Key
  // The row's URL. `{name}` is one host label, path segment or query value, `{scheme}` the page's
  // scheme, `{/name*}` one or more path segments, `{/base*}` behind the host the folder the site
  // sits in, and `{/tail*}` at the end of the path any segments. The base and the tail may be
  // empty. A `{host}` row of a table without hosts reads only on any host.
  main: string
  // Other URLs that serve the same thing, such as a legacy host, written as `main` is.
  aliases?: Array<string>
  // A row that is built and never read, such as a feed on a site's own domain, where nothing in
  // the URL names the platform.
  isBuildOnly?: boolean
  // A name that tells the row from another of its key with the same placeholders, which the
  // values cannot tell apart. A build given a variant takes only the rows of that variant.
  variant?: string
  // The row's own checks beside the table's, in the same forms: a value passes both. A function
  // also gets every value the row read or is built from, as `(date, { host }) => …`. A check
  // left undefined is no check: a list of rows that check different names types each name a row
  // does not check as undefined.
  checks?: Record<string, UrlRowCheck | undefined>
}

// Names and their values, as `{ lang: 'en' }`. A slot of one value builds it as `lang,en`, and a
// list slot as one `lang=en` segment per name.
export type UrlMap = Record<string, string>

// A value of one path segment, host label or query value is a string. A `{name*}` value spans
// several path segments, so it is a list of segments, as `['a/b', 'c']`.
export type UrlValue = string | Array<string> | UrlMap

// A value left undefined is no value, so the URL it would fill is skipped.
export type UrlValues = Record<string, UrlValue | undefined>

// A host or domain entry a function decides, given the host or domain without `www` or a port.
export type UrlHostCheck = (host: string) => boolean

export type UrlHosts = {
  // The exact hosts a `{host}` placeholder stands for. A pattern stands for one name across
  // suffixes, such as `/^example\.(?:com|de)$/`, anchored at both ends, and matches the host as
  // given or without `www`. A function stands for the hosts it accepts.
  exact?: Array<string | RegExp | UrlHostCheck>
  // The domains tenants live under: a `{domain}` placeholder stands for one, and `{host}` for every
  // one-label tenant under one. A pattern stands for a family of domains, such as
  // `/^blogspot\.(?:com|com\.[a-z]{2})$/`, anchored at both ends, and a function for the domains
  // it accepts.
  tenant?: Array<string | RegExp | UrlHostCheck>
}

// A check sees a list value as its segments joined by `/`, as `a/b/c` for `['a/b', 'c']`.
export type UrlCheck = ((value: string) => boolean) | RegExp

export type UrlRowCheck = ((value: string, values: Record<string, string>) => boolean) | RegExp

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
  // Whether a rewrite to the main URL keeps the query parameters a row's main URL does not name.
  // A row that writes `{?a,b}` keeps only those names. With `false`, a row without one keeps none.
  isQueryKept?: boolean
  // The marks of every row.
  lenient?: UrlLenient
  // Whether a row that refuses a URL, by a check or by a parameter that tells rows apart, passes
  // it to the next row that fits in the order rows are read, of any shape. For page tables: a
  // feed table tries only rows of the same shape.
  isFallThrough?: boolean
}

// How the `{host}` rows read a URL on any host. With either option only those rows are read,
// `hosts` is left aside, the URL is never exact, and `scheme`, `host` and a `base` that is not
// empty are among the values read. A row without `{/base*}` reads only an empty base.
export type UrlReadOptions = {
  // The folder the page lives under, as `/forum`. The URL's path starts with it, in any letter
  // case and trailing slash. It wins over `isAnyHost`.
  base?: UrlValue
  // Whether the URL shows the base: the shortest one under which a row with fixed text in its path
  // reads the URL, then the shortest under which any row does, up to eight segments.
  isAnyHost?: boolean
}

// The names of a `{?a,b}` or `{&a,b}` list, each as `?a`.
type QueryNames<List extends string> = List extends `${infer Name},${infer Rest}`
  ? `?${Name}` | QueryNames<Rest>
  : `?${List}`

// The names of a template's placeholders.
type TemplateNames<Template extends string> =
  Template extends `${string}{${infer Name}}${infer Rest}`
    ? (Name extends `${'?' | '&'}${infer List}` ? QueryNames<List> : Name) | TemplateNames<Rest>
    : never

// The templates of a row: its main URL and its aliases.
type RowTemplates<Row> = Row extends { main: infer Main extends string }
  ? Main | (Row extends { aliases: ReadonlyArray<infer Alias extends string> } ? Alias : never)
  : never

// The names every template of a union holds.
type CommonNames<Template extends string> = (
  Template extends string
    ? (names: TemplateNames<Template>) => void
    : never
) extends (names: infer Names) => void
  ? Names
  : never

// The open tail is no value, the base is absent where it is empty, and a query name where the URL
// leaves it out.
type TailName = '/tail*'
type BaseName = '/base*'
type QueryName = `?${string}`

type ValueName<Name> = Name extends `/${infer Bare extends string}*`
  ? Bare
  : Name extends `?${infer Bare extends string}`
    ? Bare
    : Name extends string
      ? Name
      : never

type NameValue<Name> = Name extends `${string}*` ? Array<string> : string

// The values the templates of a key read: a `{/name*}` value a list, every other name a string,
// and the open tail none. A query name, and a name only some templates hold, may be absent. A
// template the type does not spell out reads any value.
type TemplateValues<Template extends string> = string extends Template
  ? Record<string, UrlValue | undefined>
  : {
      [Name in Exclude<
        CommonNames<Template>,
        TailName | BaseName | QueryName
      > as ValueName<Name>]: NameValue<Name>
    } & {
      [Name in Exclude<
        TemplateNames<Template>,
        TailName | Exclude<CommonNames<Template>, BaseName | QueryName>
      > as ValueName<Name>]?: NameValue<Name>
    }

// The rows of one key, or every row where the rows do not spell their keys out.
type KeyRows<Key, Row> = [Extract<Row, { key: Key }>] extends [never]
  ? Row
  : Extract<Row, { key: Key }>

type KeyValues<Key, Row> = TemplateValues<RowTemplates<KeyRows<Key, Row>>>

// The values the read options add: a read under any host or a given base reads the scheme of a row
// that writes its own, a read of the table's own hosts adds none, and options that do not say which
// read it is may add it.
type OptionValues<Options> = [Options] extends [{ isAnyHost: true } | { base: UrlValue }]
  ? { scheme: string }
  : [Options] extends [undefined | { isAnyHost?: false; base?: undefined }]
    ? unknown
    : { scheme?: string }

export type UrlMatch<Key extends string, Row, Options = undefined> = Key extends Key
  ? UrlKeyMatch<Key, Row, Options>
  : never

export type UrlKeyMatch<Key extends string, Row, Options = undefined> = {
  key: Key
  // The values read, decoded. The segments a row's `{/tail*}` took are no value: only the checks
  // see them, as `tail`. A URL with a tail is not exact and has no main URL.
  values: KeyValues<Key, Row> & OptionValues<Options>
  row: Row
  isAlias: boolean
  // Whether the URL is written as the row writes it, or in a spelling its marks cover: the same
  // case, the same trailing slash and each own parameter once. A platform can answer any other
  // spelling with another feed.
  isExact: boolean
}

// How a built URL spells its values. `pretty` keeps every character the part of the URL allows, so
// `Hello!` stays as it is. `strict` follows RFC 6570 and encodes all but the unreserved characters,
// so `Hello!` is `Hello%21`.
export type UrlEncoding = 'pretty' | 'strict'

// How a URL is written. `encoding` is `pretty` when left out.
export type UrlWriteOptions = {
  encoding?: UrlEncoding
}

// How a URL is built. `select` narrows the key's rows by their fields, as to one format: it gets a
// copy of each row, never the object given.
export type UrlBuildOptions<Row> = UrlWriteOptions & {
  select?: (row: Row) => boolean
}

// A table's methods take only the keys of its rows, so a key the table does not hold fails the
// typecheck. A built URL and a main URL write their query sorted by name.
export type UrlTable<Key extends string, Row> = {
  // A copy of each row given, for a caller that walks every row of a table.
  rows: Array<Row>
  buildUrl: (key: Key, values?: UrlValues, options?: UrlBuildOptions<Row>) => string | undefined
  buildUrls: (key: Key, values?: UrlValues, options?: UrlBuildOptions<Row>) => Array<string>
  readUrl: <Options extends UrlReadOptions | undefined = undefined>(
    url: string,
    options?: Options,
  ) => UrlMatch<Key, Row, Options> | undefined
  getMainUrl: (url: string, options?: UrlWriteOptions) => string | undefined
  forSite: (url: string) => Pick<UrlTable<Key, Row>, 'buildUrl' | 'buildUrls'> | undefined
}

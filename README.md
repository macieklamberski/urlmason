# urlmason

[![codecov](https://codecov.io/gh/macieklamberski/urlmason/branch/main/graph/badge.svg)](https://codecov.io/gh/macieklamberski/urlmason)
[![npm version](https://img.shields.io/npm/v/urlmason.svg)](https://www.npmjs.com/package/urlmason)
[![license](https://img.shields.io/npm/l/urlmason.svg)](https://github.com/macieklamberski/urlmason/blob/main/LICENSE)

Turn URLs into values and values back into URLs, from one list of URL patterns.

Describe each kind of URL once, as a template in the [RFC 6570](https://www.rfc-editor.org/rfc/rfc6570) URI Template syntax, and urlmason reads, builds and cleans up URLs from that one description:

- Turn `https://example.com/@alice/feed` into `{ user: 'alice' }`.
- Turn `{ user: 'alice' }` into `https://example.com/@alice/feed`.
- Turn an old spelling, such as `http://example.com/u/alice/rss`, into `https://example.com/@alice/feed`.

It has no dependencies and runs in any modern JavaScript runtime.

[Quick start](#quick-start)
&nbsp;&nbsp;·&nbsp;&nbsp;
[Templates](#templates)
&nbsp;&nbsp;·&nbsp;&nbsp;
[Encoding](#encoding)
&nbsp;&nbsp;·&nbsp;&nbsp;
[API](#api)

---

## Quick start

```bash
npm install urlmason
```

Define a table of rows. Each row has a key, its main URL, and other URLs that serve the same thing:

```typescript
import { defineTable } from 'urlmason'

const feeds = defineTable(
  [
    {
      key: 'user',
      main: 'https://example.com/@{user}/feed.xml{?page}',
      aliases: [
        'https://example.com/u/{user}/rss',
        'https://old.example.com/{user}/feed',
      ],
    },
    { key: 'tag', main: 'https://example.com/tags{/tags*}.xml' },
    { key: 'post', main: 'https://example.com/@{user}/{id}/comments.xml' },
  ],
  { checks: { id: /^\d+$/ } },
)
```

### Read a URL

```typescript
feeds.readUrl('https://old.example.com/alice/feed')
// {
//   key: 'user',
//   values: { user: 'alice' },
//   row: {…},
//   isAlias: true,
//   isExact: true,
// }

// A list takes every segment it covers:
feeds.readUrl('https://example.com/tags/news/tech.xml')
// {
//   key: 'tag',
//   values: { tags: ['news', 'tech'] },
//   row: {…},
//   isAlias: false,
//   isExact: true,
// }

// No row matches, or a value fails its check:
feeds.readUrl('https://example.com/@alice/abc/comments.xml')
// undefined
```

### Build a URL

```typescript
feeds.buildUrl('user', { user: 'alice', page: '2' })
// 'https://example.com/@alice/feed.xml?page=2'

// A value is missing:
feeds.buildUrl('post', { user: 'alice' })
// undefined

// Every spelling of the row, its main URL first:
feeds.buildUrls('user', { user: 'alice' })
// [
//   'https://example.com/@alice/feed.xml',
//   'https://example.com/u/alice/rss',
//   'https://old.example.com/alice/feed',
// ]
```

### Rewrite a URL to its main URL

```typescript
// The row writes {?page}, so `page` stays and every other query parameter goes:
feeds.getMainUrl('http://old.example.com/alice/feed?utm_source=newsletter')
// 'https://example.com/@alice/feed.xml'

// Already the main URL:
feeds.getMainUrl('https://example.com/@alice/feed.xml')
// undefined
```

### Encode strictly

```typescript
feeds.buildUrl('tag', { tags: ['C++', 'web dev'] })
// 'https://example.com/tags/C++/web%20dev.xml'

feeds.buildUrl('tag', { tags: ['C++', 'web dev'] }, { encoding: 'strict' })
// 'https://example.com/tags/C%2B%2B/web%20dev.xml'
```

### Read a URL on any host

A row on `{host}` can read software that runs on many sites, such as forums, under whatever folder the site sits in:

```typescript
const forums = defineTable([
  { key: 'topic', main: '{scheme}://{host}{/base*}/viewtopic.php?t={topic}' },
  { key: 'forum', main: '{scheme}://{host}{/base*}/feed.php' },
])

forums.readUrl('https://board.example.org/community/viewtopic.php?t=42', { isAnyHost: true })
// { key: 'topic', values: { topic: '42', scheme: 'https', host: 'board.example.org', base: ['community'] }, … }

forums.forSite('https://board.example.org/community/')?.buildUrl('forum', { base: ['community'] })
// 'https://board.example.org/community/feed.php'
```

### Read a URL inside a URL

```typescript
const snapshots = defineTable([
  { key: 'snapshot', main: 'https://archive.example.com/web/{time}/{+url}' },
])

snapshots.readUrl('https://archive.example.com/web/2020/https://example.org/feed?page=2')?.values
// { time: '2020', url: 'https://example.org/feed?page=2' }

snapshots.buildUrl('snapshot', { time: '2020', url: 'https://example.org/feed?page=2' })
// 'https://archive.example.com/web/2020/https://example.org/feed?page=2'
```

### Read a tenant's URL

```typescript
const blogs = defineTable([{ key: 'blog', main: 'https://{blog}.{domain}/feed' }], {
  hosts: { tenant: ['example.com', 'example.co.uk'] },
})

blogs.readUrl('https://alice.example.co.uk/feed')?.values
// { blog: 'alice', domain: 'example.co.uk' }
```

## Templates

A template is a full URL written in the [RFC 6570](https://www.rfc-editor.org/rfc/rfc6570) URI Template syntax. Builds follow the RFC and are checked against its own test suite, and the few places urlmason departs from it are [listed below](#where-it-differs-from-rfc-6570). Each placeholder reads from and builds into its own part of the URL:

| Placeholder | Takes | Example |
| --- | --- | --- |
| `{name}` | One host label, path segment or query value | `https://{blog}.example.com/posts/{id}` |
| `{/name*}` | One or more path segments | `https://example.com/docs{/path*}` |
| `{?a,b}` | Query names a URL may carry, on a URL with no query | `https://example.com/feed{?page,limit}` |
| `{&a,b}` | The same, behind a query the template writes | `https://example.com/feed?alt=rss{&page}` |
| `{scheme}` | The URL's scheme | `{scheme}://example.com/feed` |
| `{host}` | A host the table lists | `{scheme}://{host}/feed` |
| `{domain}` | A tenant domain the table lists | `https://{blog}.{domain}/feed` |
| `{/base*}` | The folder a site sits in, possibly empty | `{scheme}://{host}{/base*}/feed.php` |
| `{/tail*}` | Any segments at the end of the path, possibly empty | `https://example.com/{user}{/tail*}` |
| `{+name}` | Path text as written, slashes included, up to the next fixed text | `https://example.com/raw/{+path}/feed.xml` |
| `{+name}` | At the end of a template with no query, the rest of the URL | `https://example.com/proxy/{+url}` |

A value may be a string, a list or a map. A list in a slot of one value is written as its items joined by commas, and a map as its names and values joined by commas, as RFC 6570 writes them. A name is a list everywhere in a table or nowhere, so `{/path*}` in one row and `{path}` in another throw when the table is defined, since values read from the first would build the second joined. A row reads a URL only when every value passes its checks, and builds a URL only from values that do.

### Rows

```typescript
const pages = defineTable(
  [
    { key: 'post', main: 'https://example.com/{year}/{slug}' },
    // A row the table builds but never reads.
    { key: 'home', main: 'https://example.com/', isBuildOnly: true },
  ],
  {
    checks: { year: /^\d{4}$/ },
  },
)
```

Rows are read most specific first: a template without `{/tail*}` before one with it, then the one with more query names, then the earlier row. Two rows can share a key, such as the Atom and the RSS feed of one blog. A build goes through them in order and writes the first URL the values fill: a row's main URL, then its aliases, then the next row.

### Hosts

`hosts.exact` lists the hosts a `{host}` placeholder stands for, and `hosts.tenant` the domains that `{domain}` stands for and that tenants live under. `hosts.subdomain` lists domains that `{host}` stands for together with every host under them, so `example.com` covers `player.eu.example.com` too. An entry is a string, a pattern anchored at both ends, or a function that takes a host. A fixed host matches with or without `www`.

### Limits

A URL part that holds two or more values, such as `{slug}-{id}` in one segment, is read only up to 1,000 characters. Values side by side can be split in many ways, and the limit keeps a crafted URL from taking long to read. The same limit holds for a path with two lists, two `{+name}` values, or a list and a `{+name}`.

## Encoding

Builds come in two spellings, picked per call with `{ encoding }`:

- **`pretty`, the default,** decodes a value's valid escapes, then writes every character the part allows, so `Ann Lee!` builds `/@Ann%20Lee!/feed`. An escape that decodes to no character, as `%E0%A4` of a cut-off `अ`, stays as written, so a URL read and built again is the URL it was.
- **`strict`** writes a value as RFC 6570 does, encoding everything outside the unreserved characters, so the same value builds `/@Ann%20Lee%21/feed`.

`getMainUrl` takes the same option. Pretty keeps each value as the URL spelled it, and strict builds the main URL from the values it reads, so a strict main URL equals a strict build of the same values.

### Where it differs from RFC 6570

RFC 6570 defines how a template builds a URL. Reading one back is urlmason's own:

- A template is a full URL, and each placeholder reads from one part of it.
- A name may hold a hyphen, as `{?max-results}`, since platforms write them that way.
- Query pairs are written sorted by name, so one URL has one spelling.
- `{?a,b}` ends a URL with no query, and `{&a,b}` one behind a query.
- A list slot given an empty list builds no URL, so a missing value never builds a URL that names nothing.
- `{+x}` sits in the path and reads its value as written, never decoded. In front of fixed text it takes the shortest text that lets the whole URL read. At the end of a template with no query it takes the rest of the URL, query and fragment included, so a URL inside a URL comes back whole. It builds the same under both encodings.
- A list right in front of a `{+x}`, as `{/options*}/{+source}`, shares its segments with it. A read takes the first split every check passes, and the value with the check takes all it can: a checked list its most segments, and the value behind an unchecked list the fewest list segments. A table throws where neither of the two has a check.
- Operators beyond these, such as `{#x}`, `{.x}`, `{;x}` and `{x:3}`, are refused when a table is defined.

## API

### `defineTable(rows, options?)`

Compiles the rows and returns a table. A template it can't read throws here, so a table that defines reads and builds without throwing.

```typescript
const table = defineTable(rows, {
  hosts: { exact: ['example.com'], tenant: ['example.org'], subdomain: ['example.net'] },
  // A check per placeholder: a pattern anchored at both ends, or a function.
  checks: { id: /^\d+$/, locale: (value) => value.length === 2 },
  // Values read in any letter case, which a main URL writes in lowercase.
  lenient: { case: ['user'] },
  // A rewrite keeps no query parameter the row does not name.
  isQueryKept: false,
  // A row that refuses a URL passes it to the next row, read in the order written.
  isFallThrough: true,
})
```

Each option, and each field of a row, such as `variant` and its own `checks`, is documented on its type.

### `table.readUrl(url, options?)`

Returns the row a URL is and its values, or `undefined`. `isAlias` says the URL matched an alias, and `isExact` that it's written exactly as its template is. With `{ isAnyHost: true }`, a `{host}` row reads a URL on any host, under the folder its path shows, and `{ base }` names that folder.

### `table.buildUrl(key, values, options?)`

Builds the first URL the values fill, or `undefined`. The key's rows are tried in order, each row's main URL before its aliases. A value that would move the URL to another path, scheme or host returns `undefined`. `{ select }` limits the rows to the ones a function picks, and `{ encoding }` picks the spelling.

### `table.buildUrls(key, values, options?)`

Builds every spelling the values fill of the first row that has one: its main URL, then each alias.

### `table.getMainUrl(url, options?)`

Rewrites a URL to its row's main URL, or returns `undefined` where it's already the main URL or can't be rewritten safely, such as a URL with credentials.

### `table.forSite(url)`

Returns `buildUrl` and `buildUrls` with `{scheme}`, `{host}` and `{domain}` filled from a page's URL.

## Thanks

The [uritemplate-test](https://github.com/uri-templates/uritemplate-test) suite checks every build urlmason shares with RFC 6570, and [url-template](https://github.com/bramstein/url-template) checks builds on inputs the suite lacks. Both run in the tests only, since they build URLs and urlmason also reads them.

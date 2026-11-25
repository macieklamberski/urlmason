import { describe, expect, it } from 'bun:test'
import { endsWithAnyOf, isAnyOf, isLocale } from 'trousse'
import { defineTable } from './tables.js'
import type { UrlMatch, UrlRow, UrlValue } from './types.js'

type PlayerRow = UrlRow & { ratio?: string }

const regionLocaleRegex = /^[a-z]{2}-[A-Z]{2}$/
const digitsRegex = /^\d+$/
const hexRegex = /^[0-9a-f]+$/i
const globalDigitsRegex = /^\d+$/g
const stickyDigitsRegex = /^\d+$/y
const endAnchoredDigitsRegex = /\d+$/
const startAnchoredDigitsRegex = /^\d+/

const playerRows: Array<PlayerRow> = [
  {
    key: 'video',
    main: 'https://www.example.com/embed/{videoId}',
    aliases: ['https://example.net/{videoId}', 'https://www.example.com/player?video={videoId}'],
    ratio: '16/9',
  },
  { key: 'playlist', main: 'https://www.example.com/embed/playlist/{playlistId}' },
  { key: 'docs', main: 'https://www.example.com/{locale}/docs{/path*}' },
  { key: 'blog', main: 'https://{username}.example.org/feed' },
  { key: 'search', main: 'https://www.example.com/search?q={query}' },
]

const players = defineTable(playerRows, {
  hosts: { tenant: ['example.org'] },
  checks: { locale: isLocale },
})

const spellings = defineTable([
  {
    key: 'posts',
    main: 'https://feeds.example.com/{username}/rss20.xml',
    aliases: ['https://example.com/{username}/rss20.xml', 'http://example.com/{username}/rss.xml'],
  },
  {
    key: 'blog',
    main: 'https://{blog}.example.org/feeds/posts/default',
    aliases: [
      'https://{blog}.example.org/atom.xml',
      'https://www.example.net/feeds/{blogId}/posts/default',
    ],
  },
  {
    key: 'blog-rss',
    main: 'https://{blog}.example.org/feeds/posts/default?alt=rss',
    aliases: ['https://{blog}.example.org/rss.xml'],
  },
  {
    key: 'tag',
    main: 'https://feeds.example.com/tags.rss?tag={tag}',
    aliases: ['https://example.com/tags.rss?tag={tag}', 'https://example.com/tag/{tag}/rss.xml'],
  },
  {
    key: 'legacy',
    main: 'http://legacy.example.com/feed.xml',
    aliases: ['https://new.example.com/feed'],
  },
  {
    key: 'topic',
    main: 'https://feeds.example.com/topic/{topic}',
    aliases: ['https://example.com/topics.rss?topic={topic}', 'https://example.com/t/{topic}.rss'],
  },
  {
    key: 'user',
    main: 'https://feeds.example.com/user.xml?q=by:{username} sort:time',
    aliases: ['https://example.com/user.xml?q=by:{username}'],
  },
  {
    key: 'issue',
    main: 'https://feeds.example.com/issue/{issue}.xml',
    aliases: ['https://example.com/si/{issue}/{issue}.xml'],
  },
  {
    key: 'format',
    main: 'https://feeds.example.com/posts?alt=rss',
    aliases: ['https://example.com/old?alt=rss'],
  },
  {
    key: 'flagged',
    main: 'https://feeds.example.com/list.rss',
    aliases: ['https://example.com/list.php?xml'],
  },
])

const rooted = defineTable(
  [
    {
      key: 'site',
      main: '{scheme}://{host}{/base*}/feed.xml',
      aliases: ['{scheme}://{host}{/base*}/rss.xml'],
    },
  ],
  {
    hosts: { tenant: ['example.net'] },
  },
)

const wwwTenants = defineTable(
  [
    { key: 'site', main: 'https://example.org/rss', aliases: ['https://example.org/rss.atom'] },
    { key: 'blog', main: '{scheme}://{host}/rss' },
  ],
  { hosts: { tenant: ['example.org'] }, isWwwTenant: true },
)

const hosted = defineTable(
  [{ key: 'site', main: '{scheme}://{host}/feed.xml', aliases: ['{scheme}://{host}/rss.xml'] }],
  { hosts: { tenant: ['example.net'] } },
)

const paged = defineTable(
  [
    {
      key: 'posts',
      main: 'https://feeds.example.com/posts.xml',
      aliases: ['https://example.com/posts.xml'],
    },
    {
      key: 'search',
      main: 'https://feeds.example.com/search.xml?q={query}',
      aliases: ['https://example.com/search.xml?q={query}'],
    },
  ],
  { keptParams: ['max-results', 'start-index'] },
)

const formats = defineTable(
  [
    { key: 'posts', main: 'https://example.com/feed' },
    {
      key: 'posts',
      main: 'https://example.com/feed?alt=rss',
      aliases: ['https://example.com/rss.xml'],
    },
  ],
  { keptParams: ['max-results'] },
)

const unsorted = defineTable([
  {
    key: 'search',
    main: 'https://example.com/feed?type=RSS&q={query}',
    aliases: ['https://old.example.com/feed?type=RSS&q={query}'],
  },
  { key: 'cased', main: 'https://example.com/list.rss?b=2&B=1&a={id}' },
  { key: 'site', main: '{scheme}://{host}{/base*}/index.php?type=rss&format=feed' },
])

const routes = defineTable([
  { key: 'posts', main: 'https://example.com/feed', aliases: ['https://example.com/rss'] },
  { key: 'comments', main: 'https://example.com/feed?type=comments' },
  { key: 'list', main: 'https://example.com/list?sort=new' },
  { key: 'list', main: 'https://example.com/list?sort={sort}' },
])

const sections = defineTable([
  { key: 'posts', main: 'https://example.com/news/feed' },
  { key: 'comments', main: 'https://example.com/{section}/feed?type=comments' },
])

const wwwRoutes = defineTable([
  { key: 'posts', main: 'https://www.example.com/feed' },
  { key: 'comments', main: 'https://example.com/feed?type=comments' },
])

const keptFormats = defineTable(
  [
    { key: 'posts', main: 'https://example.com/feed' },
    { key: 'posts', main: 'https://example.com/feed?alt=rss' },
  ],
  { keptParams: ['alt'] },
)

const bare = defineTable(
  [
    {
      key: 'feed',
      main: '{scheme}://feeds.example.com/{name}',
      aliases: ['{scheme}://old.example.com/{name}'],
    },
  ],
  { keptParams: [] },
)

const flaggedMain = defineTable([
  {
    key: 'list',
    main: 'https://feeds.example.com/list.php?xml',
    aliases: ['https://example.com/list.rss'],
  },
])

const moved = defineTable([
  {
    key: 'item',
    main: 'https://example.com/items?id={id}',
    aliases: ['https://example.com/item/{id}'],
  },
])

const marked = defineTable(
  [
    {
      key: 'posts',
      main: 'https://feeds.example.com/{name}',
      aliases: ['https://example.com/{name}/feed/', 'https://example.com/feed.php?name={name}'],
    },
    { key: 'search', main: 'https://feeds.example.com/search.rss?q={query}' },
  ],
  { lenient: { case: ['name', 'query'] } },
)

const localized = defineTable(
  [
    {
      key: 'posts',
      main: 'https://example.com/{locale}/feed',
      aliases: ['https://example.com/feed.php?l={locale}'],
    },
    { key: 'tag', main: 'https://example.com/tags/{tag}/feed' },
  ],
  {
    lenient: { case: ['locale', 'tag'] },
    checks: {
      locale: (value) => regionLocaleRegex.test(value),
      tag: (value) => !value.includes('%'),
    },
  },
)

const listed = defineTable([{ key: 'list', main: 'https://example.com/lists/{user}/{list}' }], {
  lenient: { case: ['user'] },
})

const ampersands = defineTable(
  [{ key: 'agenda', main: 'https://example.com/Feed.ashx?M=LD&ID={id}&GUID={guid}' }],
  { lenient: { ampersandEntity: true } },
)

const unmarkedAmpersands = defineTable([
  { key: 'agenda', main: 'https://example.com/Feed.ashx?M=LD&ID={id}&GUID={guid}' },
])

const ampersandRoutes = defineTable(
  [
    { key: 'posts', main: 'https://example.com/feed' },
    { key: 'comments', main: 'https://example.com/feed?type=comments' },
  ],
  { lenient: { ampersandEntity: true }, keptParams: ['page'] },
)

const ampersandPairs = defineTable(
  [
    { key: 'one', main: 'https://example.com/feed?a={a}' },
    { key: 'two', main: 'https://example.com/feed?a={a}&b={b}' },
  ],
  { lenient: { ampersandEntity: true } },
)

const ampersandTags = defineTable(
  [
    { key: 'posts', main: 'https://example.com/feed' },
    { key: 'comments', main: 'https://example.com/feed?type=comments' },
    { key: 'tag', main: 'https://example.com/feed?tag={tag}&type=posts' },
  ],
  { lenient: { ampersandEntity: true } },
)

const ampersandItems = defineTable(
  [
    { key: 'list', main: 'https://example.com/list' },
    { key: 'item', main: 'https://example.com/list?id={id}' },
  ],
  {
    checks: { id: (value) => digitsRegex.test(value) },
    lenient: { ampersandEntity: true },
  },
)
const movedBoards = defineTable([
  {
    key: 'plain',
    main: 'https://example.com/plain/{board}_by_{user}',
    aliases: ['https://example.com/plain/{board}/{user}'],
  },
])

const tenantBlogs = defineTable([
  {
    key: 'blog',
    main: 'https://{user}.example.com/feed',
    aliases: ['https://example.com/blogs/{user}/feed'],
  },
])

const ampersandAlias = defineTable(
  [
    {
      key: 'feed',
      main: 'https://example.com/feed.rss?a={a}',
      aliases: ['https://example.com/old.rss?a={a}'],
    },
  ],
  { lenient: { ampersandEntity: true } },
)

const escapedName = defineTable([
  {
    key: 'item',
    main: 'https://example.com/items?item%20id={id}',
    aliases: ['https://old.example.com/item/{id}'],
  },
])

const joined = defineTable([{ key: 'plain', main: 'https://example.com/search?q={first}{second}' }])

const escapedFlag = defineTable([
  {
    key: 'list',
    main: 'https://example.com/list?my%20flag',
    aliases: ['https://old.example.com/list'],
  },
])

const brokenName = defineTable([{ key: 'item', main: 'https://example.com/items?id%FF={id}' }])

const brokenSecondName = defineTable([
  {
    key: 'item',
    main: 'https://example.com/items?page={id}&id%FF={id}',
    aliases: ['https://old.example.com/item/{id}'],
  },
])

const mirrored = defineTable([{ key: 'entry', main: 'https://{host}/feed/{id}' }], {
  hosts: { exact: [/(?<x>www2\.)?example\.com/] },
})

const mirroredMarked = defineTable([{ key: 'entry', main: 'https://{host}/feed/{id}' }], {
  hosts: { exact: [/(?<x>www2\.)?example\.com/] },
  lenient: { case: ['id'] },
})

const mirroredQuery = defineTable([{ key: 'entry', main: 'https://{host}/feed?id={id}' }], {
  hosts: { exact: [/(?<mirror>www2\.)?example\.com/] },
})

const escapedPercentName = defineTable([
  {
    key: 'item',
    main: 'https://example.com/items?%25FF={id}',
    aliases: ['https://old.example.com/item/{id}'],
  },
])

const keptEscape = defineTable([{ key: 'item', main: 'https://example.com/items/{id}' }], {
  keptParams: ['%FF'],
})

const versions = defineTable(
  [
    {
      key: 'atom',
      main: 'https://example.com/feed?format=atom_10',
      aliases: ['https://example.com/feed?format={atomFormat}'],
    },
    {
      key: 'rss',
      main: 'https://example.com/feed?format=rss_200',
      aliases: ['https://example.com/feed?format={rssFormat}'],
    },
    { key: 'page', main: 'https://example.com/feed' },
  ],
  {
    checks: {
      atomFormat: (value) => isAnyOf(value, ['atom', 'atom_03']),
      rssFormat: (value) => isAnyOf(value, ['rss', 'rss2']),
    },
  },
)

const checkedPaths = defineTable(
  [
    { key: 'user', main: 'https://example.com/{user}/feed' },
    { key: 'tag', main: 'https://example.com/{tag}/feed' },
    { key: 'page', main: 'https://example.com{/path*}' },
  ],
  {
    checks: {
      user: (value) => digitsRegex.test(value),
      tag: (value) => isAnyOf(value, ['news', 'tech']),
    },
  },
)

const checkedNameCase = defineTable(
  [
    { key: 'atom', main: 'https://example.com/feed?Format={atomFormat}' },
    { key: 'rss', main: 'https://example.com/feed?format=rss_200' },
  ],
  { checks: { atomFormat: (value) => isAnyOf(value, 'atom') } },
)

const checkedByRegex = defineTable(
  [
    {
      key: 'item',
      main: 'https://example.com/items/{id}',
      aliases: ['https://example.com/item?id={id}'],
    },
    { key: 'tag', main: 'https://example.com/tags/{tag}' },
    { key: 'commit', main: 'https://example.com/commits/{hash}' },
  ],
  {
    checks: {
      id: digitsRegex,
      tag: (value) => isAnyOf(value, ['news', 'tech']),
      hash: hexRegex,
    },
  },
)

const movedFormat = defineTable([
  {
    key: 'posts',
    main: 'https://example.com/feed?alt=rss',
    aliases: ['https://old.example.com/feed'],
  },
])

const percentName = defineTable([
  {
    key: 'entry',
    main: 'https://example.com/entries?rate%25={id}',
    aliases: ['https://old.example.com/entry/{id}'],
  },
])

const spaceAndPlusNames = defineTable([
  {
    key: 'item',
    main: 'https://example.com/items?a%2Bb={id}&a%20b={other}',
    aliases: ['https://old.example.com/item/{id}/{other}'],
  },
])

const letterAndEscapeNames = defineTable([
  {
    key: 'item',
    main: 'https://example.com/items?A={id}&%2541={other}',
    aliases: ['https://old.example.com/item/{id}/{other}'],
  },
])

const percentFlag = defineTable([
  {
    key: 'list',
    main: 'https://example.com/list?rate%25',
    aliases: ['https://old.example.com/list'],
  },
])

const renamed = defineTable([
  {
    key: 'item',
    main: 'https://example.com/items?id={id}',
    aliases: ['https://example.com/legacy?i={id}'],
  },
])

const movedVersion = defineTable([
  {
    key: 'posts',
    main: 'https://example.com/feed?v=2',
    aliases: ['https://old.example.com/feed'],
  },
])

const sharedPages = defineTable([
  { key: 'page', main: 'https://example.com/pages/{board}-{user}-{page}.xml' },
  { key: 'search', main: 'https://example.com/search?q={board}-{user}-{page}.xml' },
])

const checkedSharedPages = defineTable(
  [{ key: 'page', main: 'https://example.com/pages/{board}-c{category}-{user}-s{section}.xml' }],
  { checks: { category: digitsRegex, section: digitsRegex } },
)

const atomFiles = defineTable([{ key: 'file', main: 'https://example.com/files{/path*}.atom' }])

const labeledHosts = defineTable([{ key: 'feed', main: 'https://{a}-{b}-{c}.example.com/feed' }])

const movedSharedPages = defineTable([
  {
    key: 'page',
    main: 'https://example.com/{board}-{user}',
    aliases: ['https://example.com/old/{board}-{user}'],
  },
])

const domainFeeds = defineTable(
  [
    { key: 'site', main: '{scheme}://{domain}/feed' },
    { key: 'blog', main: '{scheme}://{blog}.{domain}/blog/feed' },
    { key: 'mirror', main: '{scheme}://{host}/mirror/feed' },
  ],
  { hosts: { exact: ['Example.org'], tenant: ['example.com'] }, isWwwTenantPrefix: true },
)

const builtFeeds = defineTable([
  { key: 'feed', main: '{scheme}://{host}/u/{id}/feed' },
  { key: 'search', main: 'https://example.com/search?q={q}' },
  { key: 'docs', main: 'https://example.com/docs{/path*}' },
])

const commitFiles = defineTable([
  { key: 'file', main: 'https://example.com{/project*}/-/commits/{branch}{/file*}' },
])

const openPages = defineTable([
  { key: 'user', main: 'https://example.com/{owner}{/tail*}' },
  { key: 'repo', main: 'https://example.com/{owner}/{repo}{/tail*}' },
  { key: 'releases', main: 'https://example.com/{owner}/{repo}/releases' },
])

const checkedOpenPages = defineTable(
  [{ key: 'issue', main: 'https://example.com/issues/{id}{/tail*}' }],
  { checks: { id: digitsRegex } },
)

const tailCheckedPages = defineTable([
  {
    key: 'issue',
    main: 'https://example.com/issues/{id}{/tail*}',
    checks: { tail: /^(?:comments\/5|café)$/ },
  },
])

const boards = defineTable(
  [
    {
      key: 'topic',
      main: '{scheme}://{host}{/base*}/viewtopic.php?t={topicId}',
      aliases: ['{scheme}://{host}{/base*}/topic/{topicId}'],
    },
    { key: 'tag', main: '{scheme}://{host}{/base*}/tag{/tail*}' },
    { key: 'explore', main: '{scheme}://{host}{/base*}/explore' },
    { key: 'member', main: '{scheme}://{host}{/base*}/{group}/{member}' },
  ],
  { checks: { topicId: digitsRegex } },
)

type BoardMatch = NonNullable<ReturnType<typeof boards.readUrl>>

const topicBoards = defineTable(
  [{ key: 'topic', main: '{scheme}://{host}{/base*}/viewtopic.php?t={topicId}' }],
  {
    checks: { topicId: digitsRegex },
  },
)

const openBoards = defineTable([
  { key: 'page', main: '{scheme}://{host}{/base*}{/tail*}' },
  { key: 'topic', main: '{scheme}://{host}{/base*}/viewtopic.php?t={topicId}' },
])

const mixedBoards = defineTable([
  {
    key: 'board',
    main: 'https://example.com/boards/{board}',
    aliases: ['{scheme}://{host}{/base*}/board/{board}'],
  },
  { key: 'topic', main: '{scheme}://{host}{/base*}/viewtopic.php?t={topicId}' },
])

const fileFeeds = defineTable([{ key: 'file', main: '{scheme}://{host}{/base*}{/path*}.atom' }])

const sevenCharactersRegex = /^.{7}$/
const yearRegex = /^\d{4}$/
const dateRegex = /^\d{4}(?:\/\d{2}){0,2}$/
const uploadsListRegex = /^UULF/

const rowChecked = defineTable(
  [
    { key: 'item', main: 'https://example.com/items/{id}', checks: { id: digitsRegex } },
    { key: 'tag', main: 'https://example.com/tags/{id}' },
    { key: 'user', main: 'https://example.com/users/{id}', checks: { id: digitsRegex } },
    { key: 'profile', main: 'https://example.com/users/{username}' },
    {
      key: 'commit',
      main: 'https://example.com/commits/{hash}',
      checks: { hash: sevenCharactersRegex },
    },
    {
      key: 'docs',
      main: 'https://example.com/{locale}/docs',
      checks: { locale: regionLocaleRegex },
    },
  ],
  {
    checks: { hash: hexRegex },
    lenient: { case: ['locale'] },
  },
)

const reservedHosts = ['api.example.com', 'open.example.com']

const newsletters = defineTable(
  [
    {
      key: 'newsletter',
      main: '{scheme}://{host}/feed',
      checks: { host: (host) => !reservedHosts.includes(host) },
    },
    {
      key: 'private-podcast',
      main: '{scheme}://{host}/feed/podcast/{publication}/private/{token}.rss',
    },
  ],
  { hosts: { tenant: ['example.com'] } },
)

const playlists = defineTable([
  {
    key: 'playlist',
    main: 'https://example.com/feeds/videos.xml?playlist_id={playlistId}',
    checks: { playlistId: (playlistId) => !uploadsListRegex.test(playlistId) },
  },
  { key: 'videos', main: 'https://example.com/feeds/videos.xml?playlist_id={playlistId}' },
])

const journals = defineTable(
  [
    { key: 'posts', main: '{scheme}://{host}/{journal}/data/rss', isBuildOnly: true },
    {
      key: 'posts',
      main: '{scheme}://{host}/data/rss',
      checks: { host: (host) => host !== 'asylums.example.com' },
    },
  ],
  { hosts: { exact: ['asylums.example.com'], tenant: ['example.com'] } },
)

const archives = defineTable(
  [
    {
      key: 'date-archive',
      main: '{scheme}://{host}{/date*}/feed',
      checks: {
        date: (date, { host }) => !(yearRegex.test(date) && endsWithAnyOf(host, '.example.org')),
      },
    },
    { key: 'post-comments', main: '{scheme}://{host}{/post*}/feed' },
  ],
  { hosts: { tenant: ['example.com', 'example.org'] }, checks: { date: dateRegex } },
)

const rootChecked = defineTable([
  {
    key: 'topic',
    main: '{scheme}://{host}{/base*}/topic/{topicId}',
    checks: { base: (base) => !endsWithAnyOf(base, 'archive') },
  },
  {
    key: 'post',
    main: '{scheme}://{host}{/base*}/post/{postId}',
    checks: { postId: (postId, { base }) => endsWithAnyOf(base, `/${postId}`) },
  },
])

const profileViews = ['followers', 'following']

const isChannel = (value: string): boolean => {
  return !isAnyOf(value, profileViews)
}

const profileRows: Array<UrlRow> = [
  { key: 'editorial', main: 'https://example.com/editorial{/tail*}' },
  { key: 'channel', main: 'https://example.com/{username}/{channel}{/tail*}' },
  { key: 'profile', main: 'https://example.com/{username}{/tail*}' },
]

const profileChecks = {
  username: (value: string) => !isAnyOf(value, 'editorial'),
  channel: isChannel,
}

const fallThroughProfiles = defineTable(profileRows, { checks: profileChecks, isFallThrough: true })

const sameShapeProfiles = defineTable(profileRows, { checks: profileChecks })

const fallThroughRowChecked = defineTable(
  [
    {
      key: 'channel',
      main: 'https://example.com/{username}/{channel}',
      checks: { channel: isChannel },
    },
    { key: 'view', main: 'https://example.com/{username}{/view*}' },
  ],
  { isFallThrough: true },
)

const fallThroughIssues = defineTable(
  [
    { key: 'issue', main: 'https://example.com/issues/{id}{/tail*}' },
    { key: 'home', main: 'https://example.com' },
  ],
  { checks: { id: digitsRegex }, isFallThrough: true },
)

const fallThroughBlocks = defineTable(
  [
    { key: 'profile', main: 'https://example.com/{username}{/tail*}' },
    { key: 'channel', main: 'https://example.com/{username}/{channel}{/tail*}' },
    {
      key: 'block',
      main: 'https://example.com/{username}/{channel}/{block}',
      checks: { block: digitsRegex },
    },
  ],
  { isFallThrough: true },
)

const selectedRows: Array<UrlRow> = [
  { key: 'feed', main: 'https://example.com/feed?alt=rss' },
  { key: 'feed', main: 'https://example.com/feed' },
  { key: 'site', main: 'https://example.com{/tail*}' },
]

const sameShapeSelected = defineTable(selectedRows)

const fallThroughSites = defineTable(selectedRows.slice(0, 3), { isFallThrough: true })

const rootProfileRows: Array<UrlRow> = [
  {
    key: 'channel',
    main: '{scheme}://{host}{/base*}/{username}/{channel}{/tail*}',
    checks: { channel: isChannel },
  },
  { key: 'profile', main: '{scheme}://{host}{/base*}/{username}{/tail*}' },
]

const fallThroughRootProfiles = defineTable(rootProfileRows, { isFallThrough: true })

const sameShapeRootProfiles = defineTable(rootProfileRows)

const checkedDomains = ['example.de', 'example.co.uk']

const isCheckedDomain = (domain: string): boolean => {
  return isAnyOf(domain, checkedDomains)
}

const checkedTenants = defineTable(
  [
    { key: 'posts', main: '{scheme}://{host}/rss' },
    { key: 'about', main: '{scheme}://{domain}/about' },
  ],
  { hosts: { tenant: [isCheckedDomain] }, isWwwTenantPrefix: true },
)

const checkedExact = defineTable([{ key: 'jobs', main: '{scheme}://{host}/jobs/feed' }], {
  hosts: { exact: [isCheckedDomain] },
})

describe('defineTable', () => {
  describe('rows', () => {
    it('should throw for a row on a domain placeholder in a table without tenant domains', () => {
      const throwing = () => defineTable([{ key: 'blog', main: 'https://{user}.{domain}/feed' }])

      expect(throwing).toThrow('No hosts for the blog row')
    })

    it('should return the rows it was given', () => {
      expect(players.rows).toEqual(playerRows)
    })

    it('should read a URL as the same row after the returned rows are reversed', () => {
      const table = defineTable([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const value = 'https://example.com/comments/feed'
      const expected = 'comments'

      table.rows.reverse()

      const match = table.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a URL as the same row after the key of a returned row is edited', () => {
      const table = defineTable<UrlRow>([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const value = 'https://example.com/feed'
      const expected = 'posts'

      table.rows[0].key = 'comments'

      const match = table.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should build the URL of a key after the key of a returned row is edited', () => {
      const table = defineTable<UrlRow>([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const expected = 'https://example.com/feed'

      table.rows[0].key = 'comments'

      expect(table.buildUrl('posts')).toBe(expected)
    })

    it('should read a URL as the same row after the key of a row it was given is edited', () => {
      const rows: Array<UrlRow> = [
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ]
      const table = defineTable(rows)
      const value = 'https://example.com/feed'
      const expected = 'posts'

      rows[0].key = 'comments'

      const match = table.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a URL as the same row after the key of a row it read is edited', () => {
      const table = defineTable<UrlRow>([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const value = 'https://example.com/feed'
      const expected = 'posts'
      const first = table.readUrl(value)

      if (first) {
        first.row.key = 'comments'
      }

      const match = table.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should lowercase a value after the case list of the table options is emptied', () => {
      const lenient = { case: ['user'] }
      const table = defineTable([{ key: 'posts', main: 'https://example.com/{user}/feed' }], {
        lenient,
      })
      const value = 'https://example.com/Alice/feed'
      const expected = 'https://example.com/alice/feed'

      lenient.case.pop()

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should read a URL as the same row after a selector edits the key of its row', () => {
      const table = defineTable([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const value = 'https://example.com/feed'
      const expected = 'posts'
      const select = (row: UrlRow) => {
        row.key = 'comments'

        return true
      }

      table.buildUrl('posts', {}, { select })

      const match = table.readUrl(value)

      expect(match?.key).toBe(expected)
    })
  })

  describe('readUrl', () => {
    it('should return undefined for a URL that is not http', () => {
      const value = 'ftp://www.example.com/embed/x8abc'

      expect(players.readUrl(value)).toBeUndefined()
    })

    it('should read a URL as not exact when a value the row holds twice is spelled two ways', () => {
      const table = defineTable([{ key: 'item', main: 'https://example.com/{id}/feed?id={id}' }])
      const value = 'https://example.com/Abc/feed?id=abc'
      const match = table.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should return the key, the values and the row of a main URL', () => {
      const value = 'https://www.example.com/embed/x8abc'
      const expected: UrlMatch<string, PlayerRow> = {
        key: 'video',
        values: { videoId: 'x8abc' },
        row: playerRows[0],
        isAlias: false,
        isExact: true,
      }

      expect(players.readUrl(value)).toEqual(expected)
    })

    it('should mark a URL as exact on a host whose pattern leaves a group of its own unset', () => {
      const value = 'https://example.com/feed/5'
      const match = mirrored.readUrl(value)

      expect(match?.isExact).toBe(true)
    })

    it('should read a query value on a host whose pattern sets a group of its own', () => {
      const value = 'https://www2.example.com/feed?id=5'
      const expected = {
        host: 'www2.example.com',
        id: '5',
      }
      const match = mirroredQuery.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should mark a URL an alias takes', () => {
      const value = 'https://example.net/x8abc'
      const match = players.readUrl(value)

      expect(match?.isAlias).toBe(true)
    })

    it('should return a field a row adds at its root', () => {
      const value = 'https://example.net/x8abc'
      const expected = '16/9'
      const match = players.readUrl(value)

      expect(match?.row.ratio).toBe(expected)
    })

    it('should mark a URL with its fixed text in another case as not exact', () => {
      const value = 'https://www.example.com/EMBED/x8abc'
      const match = players.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should mark a URL with a trailing slash the row does not write as not exact', () => {
      const value = 'https://www.example.com/embed/x8abc/'
      const match = players.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should mark a URL under another scheme and without www as exact', () => {
      const value = 'http://example.com/embed/x8abc'
      const match = players.readUrl(value)

      expect(match?.isExact).toBe(true)
    })

    it('should read a value from the query', () => {
      const value = 'https://www.example.com/player?video=x8abc&autoplay=1'
      const expected = { videoId: 'x8abc' }
      const match = players.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a multi-segment value under its bare name', () => {
      const value = 'https://www.example.com/pt-BR/docs/api/v2'
      const expected = {
        locale: 'pt-BR',
        path: ['api', 'v2'],
      }
      const match = players.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a tenant label', () => {
      const value = 'https://alice.example.org/feed'
      const expected = { username: 'alice' }
      const match = players.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a path value decoded', () => {
      const value = 'https://www.example.com/embed/caf%C3%A9'
      const expected = { videoId: 'café' }
      const match = players.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a host with its port', () => {
      const value = 'https://alice.example.net:8080/feed.xml'
      const expected = {
        host: 'alice.example.net:8080',
        scheme: 'https',
      }
      const match = hosted.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should return undefined for a URL no row takes', () => {
      const value = 'https://www.example.com/about/team/history'

      expect(players.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a value its check refuses', () => {
      const value = 'https://www.example.com/abcd/docs/api'

      expect(players.readUrl(value)).toBeUndefined()
    })
  })

  describe('buildUrl', () => {
    it('should write the main URL of a key', () => {
      const value = { videoId: 'x8abc' }
      const expected = 'https://www.example.com/embed/x8abc'

      expect(players.buildUrl('video', value)).toBe(expected)
    })

    it('should return undefined when the selector takes no row of the key', () => {
      const value = { videoId: 'x8abc' }
      const select = (row: PlayerRow) => row.ratio === '4/3'

      expect(players.buildUrl('video', value, { select })).toBeUndefined()
    })

    it('should throw for a key the table does not hold, whatever the selector', () => {
      const value = { videoId: 'x8abc' }
      const select = (row: PlayerRow) => row.ratio === '4/3'
      const throwing = () => players.buildUrl('unknown', value, { select })

      expect(throwing).toThrow('No row for unknown')
    })

    it('should return undefined for a selector that tells a row by identity', () => {
      const rows: Array<UrlRow> = [
        { key: 'item', main: 'https://example.com/items/{id}.rss' },
        { key: 'item', main: 'https://example.com/items/{id}.atom' },
      ]
      const table = defineTable(rows)
      const value = { id: '7' }
      const select = (row: UrlRow) => row === rows[1]

      expect(table.buildUrl('item', value, { select })).toBeUndefined()
    })

    it('should write a host label in lowercase', () => {
      const table = defineTable([{ key: 'journal', main: 'https://{journal}.example.com/feed' }])
      const value = { journal: 'Alice' }
      const expected = 'https://alice.example.com/feed'

      expect(table.buildUrl('journal', value)).toBe(expected)
    })

    it('should write a value under the case mark in lowercase', () => {
      const value = {
        user: 'Alice',
        list: 'Reading',
      }
      const expected = 'https://example.com/lists/alice/Reading'

      expect(listed.buildUrl('list', value)).toBe(expected)
    })

    it('should keep a letter outside ASCII under the case mark as written', () => {
      const value = {
        user: 'CAFÉ',
        list: 'Reading',
      }
      const expected = 'https://example.com/lists/caf%C3%89/Reading'

      expect(listed.buildUrl('list', value)).toBe(expected)
    })

    it('should keep a value under the case mark whose check refuses the lowercase', () => {
      const value = { locale: 'en-US' }
      const expected = 'https://example.com/en-US/feed'

      expect(localized.buildUrl('posts', value)).toBe(expected)
    })

    it('should build nothing from a host label with a space', () => {
      const table = defineTable([{ key: 'journal', main: 'https://{journal}.example.com/feed' }])
      const value = { journal: 'a b' }

      expect(table.buildUrl('journal', value)).toBeUndefined()
    })

    it('should build nothing from a host label holding a slash', () => {
      const table = defineTable([{ key: 'journal', main: 'https://{journal}.example.com/feed' }])
      const value = { journal: 'attacker.example/x' }

      expect(table.buildUrl('journal', value)).toBeUndefined()
    })

    it('should build nothing from a host label holding an at sign', () => {
      const table = defineTable([{ key: 'journal', main: 'https://{journal}.example.com/feed' }])
      const value = { journal: 'user@attacker' }

      expect(table.buildUrl('journal', value)).toBeUndefined()
    })

    it('should build nothing from a host holding a query', () => {
      const table = defineTable([{ key: 'site', main: '{scheme}://{host}{/base*}/feed' }])
      const value = {
        scheme: 'https',
        host: 'attacker.example?x=https://example.com',
      }

      expect(table.buildUrl('site', value)).toBeUndefined()
    })

    it('should write back the URL it read', () => {
      const value = 'https://www.example.com/embed/caf%C3%A9'
      const match = players.readUrl(value)

      expect(players.buildUrl('video', match?.values)).toBe(value)
    })

    it('should sort the query by name, the parameters the row sets included', () => {
      const value = { query: 'feeds' }
      const expected = 'https://example.com/feed?q=feeds&type=RSS'

      expect(unsorted.buildUrl('search', value)).toBe(expected)
    })

    it('should keep the order of one name in two cases', () => {
      const value = { id: '7' }
      const expected = 'https://example.com/list.rss?a=7&b=2&B=1'

      expect(unsorted.buildUrl('cased', value)).toBe(expected)
    })

    it('should throw for a placeholder as a parameter name', () => {
      const value = [{ key: 'list', main: 'https://example.com/list{?query*}' }]
      const throwing = () => defineTable(value)

      expect(throwing).toThrow('Not a URL template: https://example.com/list{?query*}')
    })

    it('should throw for a placeholder as a parameter name whose braces the row escapes', () => {
      const value = [{ key: 'list', main: 'https://example.com/{user}/list?%7Bquery%7D' }]
      const throwing = () => defineTable(value)

      expect(throwing).toThrow('Not a URL template: https://example.com/{user}/list?%7Bquery%7D')
    })

    it('should throw for a parameter the row names twice', () => {
      const value = [{ key: 'search', main: 'https://example.com/search?types=page&types=post' }]
      const throwing = () => defineTable(value)

      expect(throwing).toThrow(
        'Not a URL template: https://example.com/search?types=page&types=post',
      )
    })

    it('should write a URL the main URL of its row leaves alone', () => {
      const value = unsorted.buildUrl('search', { query: 'feeds' }) ?? ''

      expect(unsorted.getMainUrl(value)).toBeUndefined()
    })

    it('should escape a character split across two values of one query value', () => {
      const value = {
        first: 'a\ud83d',
        second: '\ude00b',
      }
      const expected = 'https://example.com/search?q=a%F0%9F%98%80b'

      expect(joined.buildUrl('plain', value)).toBe(expected)
    })

    it('should write a value that is no text as its text', () => {
      const value = { id: true }
      const expected = 'https://example.com/items?id=true'

      // @ts-expect-error: This is for testing purposes.
      expect(moved.buildUrl('item', value)).toBe(expected)
    })
  })

  describe('buildUrls', () => {
    it('should list the main URL and every alias the values fill', () => {
      const value = { videoId: 'x8abc' }
      const expected = [
        'https://www.example.com/embed/x8abc',
        'https://example.net/x8abc',
        'https://www.example.com/player?video=x8abc',
      ]

      expect(players.buildUrls('video', value)).toEqual(expected)
    })

    it('should sort the query of every URL by name', () => {
      const value = { query: 'feeds' }
      const expected = [
        'https://example.com/feed?q=feeds&type=RSS',
        'https://old.example.com/feed?q=feeds&type=RSS',
      ]

      expect(unsorted.buildUrls('search', value)).toEqual(expected)
    })

    it('should return no URL when the values fill no row of the key', () => {
      const value = {}
      const expected: Array<string> = []

      expect(players.buildUrls('video', value)).toEqual(expected)
    })
  })

  describe('forSite', () => {
    it('should return undefined for a page URL that is not http', () => {
      const value = 'mailto:alice@example.com'

      expect(unsorted.forSite(value)).toBeUndefined()
    })

    it('should sort the query of a URL built for a page', () => {
      const value = 'https://example.com/about'
      const expected = 'https://example.com/index.php?format=feed&type=rss'
      const page = unsorted.forSite(value)

      expect(page?.buildUrl('site')).toBe(expected)
    })

    it('should sort the query of every URL built for a page', () => {
      const value = 'https://example.com/about'
      const expected = ['https://example.com/index.php?format=feed&type=rss']
      const page = unsorted.forSite(value)

      expect(page?.buildUrls('site')).toEqual(expected)
    })
  })

  describe('getMainUrl', () => {
    it('should write an alias on another host as the main URL', () => {
      const value = 'https://example.com/alice/rss20.xml'
      const expected = 'https://feeds.example.com/alice/rss20.xml'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should write an alias under another scheme and file name as the main URL', () => {
      const value = 'http://example.com/alice/rss.xml'
      const expected = 'https://feeds.example.com/alice/rss20.xml'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should keep the tenant of an alias', () => {
      const value = 'https://alice.example.org/atom.xml'
      const expected = 'https://alice.example.org/feeds/posts/default'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should write the query the main URL sets itself', () => {
      const value = 'https://alice.example.org/rss.xml'
      const expected = 'https://alice.example.org/feeds/posts/default?alt=rss'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should keep a parameter neither URL names', () => {
      const value = 'https://example.com/alice/rss20.xml?max-results=5&start-index=1'
      const expected = 'https://feeds.example.com/alice/rss20.xml?max-results=5&start-index=1'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should keep a parameter after the query the main URL sets itself', () => {
      const value = 'https://alice.example.org/rss.xml?max-results=5'
      const expected = 'https://alice.example.org/feeds/posts/default?alt=rss&max-results=5'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should keep the encoding of a value', () => {
      const value = 'https://example.com/caf%C3%A9/rss20.xml'
      const expected = 'https://feeds.example.com/caf%C3%A9/rss20.xml'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should keep the port of a host read from the URL', () => {
      const value = 'https://alice.example.net:8080/rss.xml'
      const expected = 'https://alice.example.net:8080/feed.xml'

      expect(hosted.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for an alias on a port the main URL cannot keep', () => {
      const value = 'https://example.com:8443/alice/rss20.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an alias with credentials', () => {
      const value = 'https://alice:secret@example.com/alice/rss20.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should keep an escape that is no UTF-8 in a path value', () => {
      const value = 'https://example.com/caf%E9/rss20.xml'
      const expected = 'https://feeds.example.com/caf%E9/rss20.xml'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should keep an escape that is no UTF-8 in a query value', () => {
      const value = 'https://example.com/tags.rss?tag=%EA%EE%F2'
      const expected = 'https://feeds.example.com/tags.rss?tag=%EA%EE%F2'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should keep escaped brackets in a query value', () => {
      const value = 'https://example.com/tags.rss?tag=%5Bnews%5D'
      const expected = 'https://feeds.example.com/tags.rss?tag=%5Bnews%5D'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should keep the spaces around a query value', () => {
      const value = 'https://example.com/tags.rss?tag=%20news%20'
      const expected = 'https://feeds.example.com/tags.rss?tag=%20news%20'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should move a plain value from the path to the query', () => {
      const value = 'https://example.com/tag/news/rss.xml'
      const expected = 'https://feeds.example.com/tags.rss?tag=news'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for an escaped value that would move to the query', () => {
      const value = 'https://example.com/tag/a%2Fb/rss.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an own parameter given twice', () => {
      const value = 'https://example.com/tags.rss?tag=news&tag=sport'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an own parameter under another case', () => {
      const value = 'https://example.com/tags.rss?Tag=news'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an alias with its fixed text in another case', () => {
      const value = 'https://example.com/alice/RSS20.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an alias with a trailing slash it does not write', () => {
      const value = 'https://example.com/alice/rss20.xml/'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should write a main URL under http as https', () => {
      const value = 'http://feeds.example.com/alice/rss20.xml'
      const expected = 'https://feeds.example.com/alice/rss20.xml'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should drop a www the main URL does not write', () => {
      const value = 'https://www.feeds.example.com/alice/rss20.xml'
      const expected = 'https://feeds.example.com/alice/rss20.xml'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should keep the values and the fragment of a main URL as given', () => {
      const value = 'http://feeds.example.com/alice/rss20.xml?a=1&b=%5B2%5D#top'
      const expected = 'https://feeds.example.com/alice/rss20.xml?a=1&b=%5B2%5D#top'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should sort the query of a main URL by name', () => {
      const value = 'https://feeds.example.com/alice/rss20.xml?b=%5B2%5D&a=1#top'
      const expected = 'https://feeds.example.com/alice/rss20.xml?a=1&b=%5B2%5D#top'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a sorted main URL with one name in two cases', () => {
      const value = 'https://feeds.example.com/alice/rss20.xml?tag=news&Tag=art'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should sort 200 kB of parameters within a second', () => {
      const value = `https://feeds.example.com/alice/rss20.xml?${'b=1&a=1&'.repeat(25000)}`
      const startedAt = performance.now()

      spellings.getMainUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should read 200 kB of names with an escape within a second', () => {
      const value = `https://feeds.example.com/alice/rss20.xml?${'%C3=1&a+b=1&'.repeat(16000)}`
      const startedAt = performance.now()

      spellings.getMainUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should write an alias as the URL its row builds', () => {
      const value = 'https://old.example.com/feed?type=RSS&q=feeds'
      const params = { query: 'feeds' }
      const expected = 'https://example.com/feed?q=feeds&type=RSS'

      expect(unsorted.getMainUrl(value)).toBe(expected)
      expect(unsorted.buildUrl('search', params)).toBe(expected)
    })

    it('should return undefined for an alias with an own parameter given again with +', () => {
      const value = 'https://example.com/tags.rss?tag=news&tag+=art'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an alias with an own parameter given again with %20', () => {
      const value = 'https://example.com/tags.rss?tag=news&tag%20=art'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should not mark a URL with an own parameter given again with + as exact', () => {
      const value = 'https://example.com/items?id=7&id+=8'
      const match = moved.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should keep the order of parameters under one name', () => {
      const value = 'https://feeds.example.com/alice/rss20.xml?tag=news&a=1&tag=art'
      const expected = 'https://feeds.example.com/alice/rss20.xml?a=1&tag=news&tag=art'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a main URL under http with a trailing slash', () => {
      const value = 'http://feeds.example.com/alice/rss20.xml/'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a main URL under http with its fixed text in another case', () => {
      const value = 'http://feeds.example.com/alice/RSS20.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an https URL whose main URL writes http', () => {
      const value = 'https://legacy.example.com/feed.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a www host where www can be a tenant', () => {
      const value = 'https://www.example.org/rss.atom'

      expect(wwwTenants.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined when the URL gives a parameter of the main URL another value', () => {
      const value = 'https://alice.example.org/rss.xml?alt=json'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a value a parser would read as a dot segment', () => {
      const value = 'https://example.com/topics.rss?topic=..'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should move a value that holds a dot from the query to the path', () => {
      const value = 'https://example.com/topics.rss?topic=a.b'
      const expected = 'https://feeds.example.com/topic/a.b'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should encode the fixed text of a query value the main URL writes', () => {
      const value = 'https://example.com/user.xml?q=by:alice'
      const expected = 'https://feeds.example.com/user.xml?q=by:alice%20sort:time'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should write a main URL with fixed query text under http as https', () => {
      const value = 'http://feeds.example.com/user.xml?q=by:alice%20sort:time'
      const expected = 'https://feeds.example.com/user.xml?q=by:alice%20sort:time'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a fixed query value in another case', () => {
      const value = 'https://example.com/old?alt=RSS'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should write an alias with a flag parameter written with an equals sign', () => {
      const value = 'https://example.com/list.php?xml='
      const expected = 'https://feeds.example.com/list.rss'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a flag parameter given a space as its value', () => {
      const value = 'https://example.com/list.php?xml=%20'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a name the alias holds twice under two values', () => {
      const value = 'https://example.com/si/ABC-1/ABC-2.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an https alias of a main URL that writes http', () => {
      const value = 'https://new.example.com/feed'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a main URL that writes http, under http', () => {
      const value = 'http://legacy.example.com/feed.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a main URL on a port', () => {
      const value = 'http://feeds.example.com:8080/alice/rss20.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should write a main URL with a tenant in its host under http as https', () => {
      const value = 'http://alice.example.org/feeds/posts/default'
      const expected = 'https://alice.example.org/feeds/posts/default'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a main URL with an empty query', () => {
      const value = 'https://feeds.example.com/alice/rss20.xml?'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should keep an empty query on a main URL it writes as https', () => {
      const value = 'http://feeds.example.com/alice/rss20.xml?'
      const expected = 'https://feeds.example.com/alice/rss20.xml?'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should write an alias on the apex where www can be a tenant', () => {
      const value = 'https://example.org/rss.atom'
      const expected = 'https://example.org/rss'

      expect(wwwTenants.getMainUrl(value)).toBe(expected)
    })

    it('should write the main URL when the URL gives its parameter the same value', () => {
      const value = 'https://alice.example.org/rss.xml?alt=rss'
      const expected = 'https://alice.example.org/feeds/posts/default?alt=rss'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a value that leaves a single dot as a segment', () => {
      const value = 'https://example.com/t/..rss'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an escaped dot segment', () => {
      const value = 'https://example.com/t/%2E%2e.rss'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should write an http alias of a main URL that writes http', () => {
      const value = 'http://new.example.com/feed'
      const expected = 'http://legacy.example.com/feed.xml'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a main URL only a parser respells', () => {
      const value = 'HTTPS://FEEDS.EXAMPLE.COM/alice/rss20.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should write an alias on a host the table lists', () => {
      const value = 'https://alice.example.net/rss.xml'
      const expected = 'https://alice.example.net/feed.xml'

      expect(rooted.getMainUrl(value)).toBe(expected)
    })

    it('should write a slash before the query of a main URL with no path', () => {
      const table = defineTable(
        [
          {
            key: 'site',
            main: '{scheme}://{host}{/base*}?format=feed',
            aliases: ['{scheme}://{host}{/base*}/index.php?format=feed'],
          },
        ],
        { hosts: { exact: ['example.com'] } },
      )
      const value = 'https://example.com/index.php?format=feed'
      const expected = 'https://example.com/?format=feed'

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should drop an empty pair between kept parameters', () => {
      const value = 'https://example.com/alice/rss20.xml?a=1&&b=2'
      const expected = 'https://feeds.example.com/alice/rss20.xml?a=1&b=2'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for an alias value that holds the fixed text of the main URL', () => {
      const value = 'https://example.com/plain/Art/Alice_by_Bob'

      expect(movedBoards.getMainUrl(value)).toBeUndefined()
    })

    it('should write a value an alias moves into the host of the main URL as written', () => {
      const value = 'https://example.com/blogs/Alice/feed'
      const expected = 'https://Alice.example.com/feed'

      expect(tenantBlogs.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for an alias without a value the main URL needs', () => {
      const value = 'https://www.example.net/feeds/2399953/posts/default'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a main URL', () => {
      const value = 'https://feeds.example.com/alice/rss20.xml'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a URL no row takes', () => {
      const value = 'https://example.com/alice/about'

      expect(spellings.getMainUrl(value)).toBeUndefined()
    })
  })

  describe('with a parameter that tells rows apart', () => {
    it('should read the row that sets the value', () => {
      const value = 'https://example.com/feed?alt=rss'
      const expected = 'https://example.com/feed?alt=rss'

      const main = formats.readUrl(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should return undefined for a value no row lists', () => {
      const value = 'https://example.com/feed?alt=rss2'

      expect(formats.readUrl(value)).toBeUndefined()
    })

    it('should read a listed value in another case', () => {
      const value = 'https://example.com/feed?ALT=RSS'
      const expected = 'https://example.com/feed?alt=rss'
      const main = formats.readUrl(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should return undefined for a value no row lists under a name in another case', () => {
      const value = 'https://example.com/feed?ALT=rss2'

      expect(formats.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a listed value beside one no row lists', () => {
      const value = 'https://example.com/feed?alt=rss&alt=rss2'

      expect(formats.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a value no row lists on an alias', () => {
      const value = 'https://example.com/rss.xml?alt=rss2'

      expect(formats.readUrl(value)).toBeUndefined()
    })

    it('should read an alias with the value its row sets', () => {
      const value = 'https://example.com/rss.xml?alt=rss'
      const expected = 'https://example.com/feed?alt=rss'

      expect(formats.getMainUrl(value)).toBe(expected)
    })

    it('should read a URL with a parameter no row sets', () => {
      const value = 'https://example.com/feed?page=2'
      const expected = 'https://example.com/feed'

      const main = formats.readUrl(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should return undefined for a value only a row of another key on the path sets', () => {
      const value = 'https://example.com/feed?type=other'

      expect(routes.readUrl(value)).toBeUndefined()
    })

    it('should return no main URL for a value only a row of another key on the path sets', () => {
      const value = 'http://example.com/feed?type=other'

      expect(routes.getMainUrl(value)).toBeUndefined()
    })

    it('should read any value on a row that takes the parameter as a value', () => {
      const value = 'https://example.com/list?sort=old'
      const expected = 'https://example.com/list?sort={sort}'
      const main = routes.readUrl(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should read any value of a parameter the table keeps', () => {
      const value = 'https://example.com/feed?alt=rss2'
      const expected = 'https://example.com/feed'
      const main = keptFormats.readUrl(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should return no main URL for an alias whose parameter picks another row on the main path', () => {
      const value = 'https://example.com/rss?type=comments'

      expect(routes.getMainUrl(value)).toBeUndefined()
    })

    it('should read a parameter another path sets as a parameter of no row', () => {
      const value = 'https://example.com/list?sort=new&type=other'
      const expected = 'list'
      const key = routes.readUrl(value)?.key

      expect(key).toBe(expected)
    })

    it('should return undefined for a value a template with a placeholder path sets', () => {
      const value = 'https://example.com/news/feed?type=other'

      expect(sections.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a value a template on the host without www sets, given with www', () => {
      const value = 'https://www.example.com/feed?type=other'

      expect(wwwRoutes.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a value a template on the host without www sets', () => {
      const value = 'https://example.com/feed?type=other'

      expect(wwwRoutes.readUrl(value)).toBeUndefined()
    })

    it('should read 200 kB of a listed value within a second', () => {
      const value = `https://example.com/feed?alt=rss${'&alt=rss'.repeat(25000)}`
      const startedAt = performance.now()

      formats.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should return no main URL for a value no row lists', () => {
      const value = 'http://example.com/feed?alt=rss2'

      expect(formats.getMainUrl(value)).toBeUndefined()
    })
  })

  describe('with a flag parameter written with an equals sign', () => {
    it('should mark the URL as exact', () => {
      const value = 'https://feeds.example.com/list.php?xml='
      const match = flaggedMain.readUrl(value)

      expect(match?.isExact).toBe(true)
    })

    it('should write the flag without the equals sign', () => {
      const value = 'https://feeds.example.com/list.php?xml='
      const expected = 'https://feeds.example.com/list.php?xml'

      expect(flaggedMain.getMainUrl(value)).toBe(expected)
    })

    it('should keep a question mark that opens the name of the first parameter', () => {
      const value = 'https://feeds.example.com/list.php??page=2&xml='
      const expected = 'https://feeds.example.com/list.php??page=2&xml'

      expect(flaggedMain.getMainUrl(value)).toBe(expected)
    })

    it('should write an alias that gives the flag of the main URL', () => {
      const value = 'https://example.com/list.rss?xml='
      const expected = 'https://feeds.example.com/list.php?xml'

      expect(flaggedMain.getMainUrl(value)).toBe(expected)
    })

    it('should not mark a flag given twice as exact', () => {
      const value = 'https://feeds.example.com/list.php?xml=&xml='
      const match = flaggedMain.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should return undefined for an alias that gives a value of the main URL with an equals sign after it', () => {
      const value = 'https://example.com/item/5?id=5='

      expect(moved.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for an alias that gives a parameter of the main URL an empty value', () => {
      const value = 'https://example.com/item/5?id='

      expect(moved.getMainUrl(value)).toBeUndefined()
    })

    it('should write 200 kB of an alias that repeats a value of the main URL within a second', () => {
      const value = `https://example.com/item/5?${'a&'.repeat(50000)}${'id=5&'.repeat(20000)}`
      const startedAt = performance.now()

      moved.getMainUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with pretty encoding', () => {
    const notes = defineTable([
      { key: 'note', main: 'https://example.com/notes/{title}' },
      { key: 'search', main: 'https://example.com/search?q={query}' },
    ])

    it('should write an escaped path value as the characters it stands for', () => {
      const value = { title: 'Hello%21' }
      const expected = 'https://example.com/notes/Hello!'

      expect(notes.buildUrl('note', value)).toBe(expected)
    })

    it('should write an escaped query value as the characters it stands for', () => {
      const value = { query: 'a%2Cb' }
      const expected = 'https://example.com/search?q=a,b'

      expect(notes.buildUrl('search', value)).toBe(expected)
    })

    it('should write a percent sign that starts no escape as an escape', () => {
      const value = { title: '50%' }
      const expected = 'https://example.com/notes/50%25'

      expect(notes.buildUrl('note', value)).toBe(expected)
    })
  })

  describe('with non-ASCII fixed text in the path', () => {
    const menus = defineTable([
      {
        key: 'menu',
        main: 'https://example.com/café/{id}',
        aliases: ['https://old.example.com/café/{id}'],
      },
    ])

    it('should build the fixed text percent-encoded', () => {
      const value = { id: 'lunch' }
      const expected = 'https://example.com/caf%C3%A9/lunch'

      expect(menus.buildUrl('menu', value)).toBe(expected)
    })

    it('should read a URL with the fixed text percent-encoded as exact', () => {
      const value = 'https://example.com/caf%C3%A9/lunch'
      const match = menus.readUrl(value)

      expect(match?.isExact).toBe(true)
    })

    it('should write the main URL of an alias with the fixed text percent-encoded', () => {
      const value = 'https://old.example.com/caf%C3%A9/lunch'
      const expected = 'https://example.com/caf%C3%A9/lunch'

      expect(menus.getMainUrl(value)).toBe(expected)
    })
  })

  describe('with a list in a slot of one value', () => {
    const items = defineTable([
      { key: 'item', main: 'https://example.com/items/{ids}' },
      { key: 'search', main: 'https://example.com/search?ids={ids}' },
    ])

    it('should write an item comma as an escape, apart from the commas between items', () => {
      const value = { ids: ['a,b', 'c'] }
      const expected = 'https://example.com/items/a%2Cb,c'

      expect(items.buildUrl('item', value)).toBe(expected)
    })

    it('should leave the empty items of a list out', () => {
      const value = { ids: ['a', '', 'b'] }
      const expected = 'https://example.com/items/a,b'

      expect(items.buildUrl('item', value)).toBe(expected)
    })

    it('should write a list in a query value as its items joined by commas', () => {
      const value = { ids: ['a,b', 'c'] }
      const expected = 'https://example.com/search?ids=a%2Cb,c'

      expect(items.buildUrl('search', value)).toBe(expected)
    })

    it('should write a list strictly as its encoded items joined by commas', () => {
      const value = { ids: ['a,b', 'c!'] }
      const options = { encoding: 'strict' } as const
      const expected = 'https://example.com/items/a%2Cb,c%21'

      expect(items.buildUrl('item', value, options)).toBe(expected)
    })

    it('should build nothing from an empty list', () => {
      const value = { ids: [] }

      expect(items.buildUrl('item', value)).toBeUndefined()
    })
  })

  describe('with a map as a value', () => {
    const filters = defineTable([
      { key: 'slot', main: 'https://example.com/filter/{facets}' },
      { key: 'list', main: 'https://example.com/filter{/facets*}' },
      { key: 'query', main: 'https://example.com/filter?f={facets}' },
    ])

    it('should write a map in a slot of one value as its names and values joined by commas', () => {
      const value = { facets: { lang: 'en', tag: 'a,b' } }
      const expected = 'https://example.com/filter/lang,en,tag,a%2Cb'

      expect(filters.buildUrl('slot', value)).toBe(expected)
    })

    it('should write a map in a list slot as one segment per name', () => {
      const value = { facets: { lang: 'en', tag: 'news' } }
      const expected = 'https://example.com/filter/lang=en/tag=news'

      expect(filters.buildUrl('list', value)).toBe(expected)
    })

    it('should write a map in a query value as its names and values joined by commas', () => {
      const value = { facets: { lang: 'en', tag: 'news' } }
      const expected = 'https://example.com/filter?f=lang,en,tag,news'

      expect(filters.buildUrl('query', value)).toBe(expected)
    })

    it('should build nothing from a map with no name', () => {
      const value = { facets: {} }

      expect(filters.buildUrl('slot', value)).toBeUndefined()
    })
  })

  describe('with strict encoding', () => {
    const strict = { encoding: 'strict' } as const
    const notes = defineTable([
      { key: 'note', main: 'https://example.com/notes/{title}' },
      { key: 'search', main: 'https://example.com/search?q=tag-{query}' },
      { key: 'docs', main: 'https://example.com/docs{/path*}' },
      { key: 'site', main: '{scheme}://{host}/notes/{title}' },
    ])

    it('should keep the characters a path segment allows when left out', () => {
      const value = { title: "Hello World! (it's *new*)" }
      const expected = "https://example.com/notes/Hello%20World!%20(it's%20*new*)"

      expect(notes.buildUrl('note', value)).toBe(expected)
    })

    it('should encode every character outside the unreserved set in a path value', () => {
      const value = { title: "Hello World! (it's *new*)" }
      const expected = 'https://example.com/notes/Hello%20World%21%20%28it%27s%20%2Anew%2A%29'

      expect(notes.buildUrl('note', value, strict)).toBe(expected)
    })

    it('should encode a percent sign in a value, so the value reads back as given', () => {
      const value = { title: 'admin%2F' }
      const expected = 'https://example.com/notes/admin%252F'

      expect(notes.buildUrl('note', value, strict)).toBe(expected)
    })

    it('should encode a query value and keep the fixed text around it', () => {
      const value = { query: 'a,b!' }
      const expected = 'https://example.com/search?q=tag-a%2Cb%21'

      expect(notes.buildUrl('search', value, strict)).toBe(expected)
    })

    it('should encode each segment of a list', () => {
      const value = { path: ['guide', 'first steps!'] }
      const expected = 'https://example.com/docs/guide/first%20steps%21'

      expect(notes.buildUrl('docs', value, strict)).toBe(expected)
    })

    it('should encode every spelling it builds', () => {
      const value = { title: 'Hello!' }
      const expected = ['https://example.com/notes/Hello%21']

      expect(notes.buildUrls('note', value, strict)).toEqual(expected)
    })

    it('should write the main URL of an alias with its values encoded', () => {
      const table = defineTable([
        {
          key: 'post',
          main: 'https://example.com/posts/{slug}',
          aliases: ['https://old.example.com/p/{slug}'],
        },
      ])
      const value = 'https://old.example.com/p/Hello!'
      const expected = 'https://example.com/posts/Hello%21'

      expect(table.getMainUrl(value, strict)).toBe(expected)
    })

    it('should write a main URL spelled the pretty way as the strict one', () => {
      const value = 'https://example.com/notes/Hello!'
      const expected = 'https://example.com/notes/Hello%21'

      expect(notes.getMainUrl(value, strict)).toBe(expected)
    })

    it('should return undefined for a main URL already spelled strictly', () => {
      const value = 'https://example.com/notes/Hello%21'

      expect(notes.getMainUrl(value, strict)).toBeUndefined()
    })

    it('should keep a plus sign in the query of a main URL', () => {
      const value = 'https://example.com/search?q=tag-a+b!'
      const expected = 'https://example.com/search?q=tag-a+b%21'

      expect(notes.getMainUrl(value, strict)).toBe(expected)
    })

    it('should encode a URL built for a page', () => {
      const value = { title: 'Hello!' }
      const expected = 'https://example.org/notes/Hello%21'
      const site = notes.forSite('https://example.org/about')

      expect(site?.buildUrl('site', value, strict)).toBe(expected)
    })
  })

  describe('with the case mark', () => {
    it('should read a host value under the mark as exact', () => {
      const table = defineTable([{ key: 'user', main: 'https://{user}.example.com/feed' }], {
        lenient: { case: ['user'] },
      })
      const value = 'https://alice.example.com/feed'
      const match = table.readUrl(value)

      expect(match?.isExact).toBe(true)
    })

    it('should write a value of a main URL in lowercase', () => {
      const value = 'https://feeds.example.com/Alice'
      const expected = 'https://feeds.example.com/alice'

      expect(marked.getMainUrl(value)).toBe(expected)
    })

    it('should write a value in lowercase on a host whose pattern leaves a group of its own unset', () => {
      const value = 'https://example.com/feed/AB'
      const expected = 'https://example.com/feed/ab'

      expect(mirroredMarked.getMainUrl(value)).toBe(expected)
    })

    it('should write a value of an alias in lowercase', () => {
      const value = 'https://example.com/Alice/feed/'
      const expected = 'https://feeds.example.com/alice'

      expect(marked.getMainUrl(value)).toBe(expected)
    })

    it('should write a query value in lowercase', () => {
      const value = 'https://feeds.example.com/search.rss?q=News'
      const expected = 'https://feeds.example.com/search.rss?q=news'

      expect(marked.getMainUrl(value)).toBe(expected)
    })

    it('should keep a question mark that opens the name of the first parameter', () => {
      const value = 'https://feeds.example.com/search.rss??page=2&q=News'
      const expected = 'https://feeds.example.com/search.rss??page=2&q=news'

      expect(marked.getMainUrl(value)).toBe(expected)
    })

    it('should keep the escapes of a value it writes in lowercase', () => {
      const value = 'https://feeds.example.com/Caf%C3%A9'
      const expected = 'https://feeds.example.com/caf%C3%A9'

      expect(marked.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for an alias with its fixed text in another case', () => {
      const value = 'https://example.com/alice/FEED/'

      expect(marked.getMainUrl(value)).toBeUndefined()
    })

    it('should keep the case of a value the list does not name', () => {
      const value = 'https://example.com/lists/Alice/News'
      const expected = 'https://example.com/lists/alice/News'

      expect(listed.getMainUrl(value)).toBe(expected)
    })

    it('should write a query value of an alias in lowercase', () => {
      const value = 'https://example.com/feed.php?name=Alice'
      const expected = 'https://feeds.example.com/alice'

      expect(marked.getMainUrl(value)).toBe(expected)
    })

    it('should keep a value as written when its check refuses the lowercase', () => {
      const value = 'http://example.com/en-US/feed'
      const expected = 'https://example.com/en-US/feed'

      expect(localized.getMainUrl(value)).toBe(expected)
    })

    it('should write a value of an alias as written when its check refuses the lowercase', () => {
      const value = 'https://example.com/feed.php?l=en-US'
      const expected = 'https://example.com/en-US/feed'

      expect(localized.getMainUrl(value)).toBe(expected)
    })

    it('should run the check of a value on its decoded lowercase', () => {
      const value = 'https://example.com/tags/Caf%C3%A9/feed'
      const expected = 'https://example.com/tags/caf%C3%A9/feed'

      expect(localized.getMainUrl(value)).toBe(expected)
    })

    it('should not read true as the case mark', () => {
      const table = defineTable([{ key: 'user', main: 'https://example.com/users/{user}' }], {
        // @ts-expect-error: The case mark takes a list of placeholder names.
        lenient: { case: true },
      })
      const value = 'https://example.com/users/Alice'

      expect(table.getMainUrl(value)).toBeUndefined()
    })

    it('should throw for a marked value that shares a host label with another value', () => {
      const throwing = () => {
        return defineTable(
          [
            {
              key: 'blog',
              main: 'https://{blog}-{user}.example.com/feed',
            },
          ],
          { lenient: { case: ['blog'] } },
        )
      }

      expect(throwing).toThrow(
        'The blog row marks the case of blog, which shares a part of its URL with another value',
      )
    })

    it('should throw for a marked value that shares a query value with another value', () => {
      const throwing = () => {
        return defineTable(
          [
            {
              key: 'range',
              main: 'https://example.com/range.rss?r={from}-{to}',
            },
          ],
          { lenient: { case: ['to'] } },
        )
      }

      expect(throwing).toThrow(
        'The range row marks the case of to, which shares a part of its URL with another value',
      )
    })

    it('should throw for a marked value that shares a path segment of an alias', () => {
      const throwing = () => {
        return defineTable(
          [
            {
              key: 'board',
              main: 'https://example.com/boards/{board}/{user}',
              aliases: ['https://example.com/{board}_by_{user}'],
            },
          ],
          { lenient: { case: ['user'] } },
        )
      }

      expect(throwing).toThrow(
        'The board row marks the case of user, which shares a part of its URL with another value',
      )
    })

    it('should throw for a value the mark of the table names', () => {
      const throwing = () => {
        return defineTable([{ key: 'board', main: 'https://example.com/{board}_by_{user}' }], {
          lenient: { case: ['user'] },
        })
      }

      expect(throwing).toThrow(
        'The board row marks the case of user, which shares a part of its URL with another value',
      )
    })

    it('should throw for a marked value in a template with two values of several segments', () => {
      const throwing = () => {
        return defineTable(
          [
            {
              key: 'thread',
              main: 'https://example.com{/board*}/feed{/thread*}',
            },
          ],
          { lenient: { case: ['thread'] } },
        )
      }

      expect(throwing).toThrow(
        'The thread row marks the case of thread, which shares a part of its URL with another value',
      )
    })

    it('should write 200 kB of a value in lowercase within a second', () => {
      const value = `https://feeds.example.com/${'A'.repeat(200000)}`
      const startedAt = performance.now()

      marked.getMainUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with the ampersand entity mark', () => {
    it('should read &amp; between query pairs as &', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&amp;ID=7&amp;GUID=a1b2'
      const expected = {
        id: '7',
        guid: 'a1b2',
      }
      const match = ampersands.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should refuse 8 MB of query on a host no row names within 50 ms', () => {
      const value = `https://other.example.org/Feed.ashx?${'ID=7&'.repeat(1600000)}`
      const startedAt = performance.now()

      ampersands.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(50)
    })

    it('should write &amp; between query pairs as &', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&amp;ID=7&amp;GUID=a1b2'
      const expected = 'https://example.com/Feed.ashx?GUID=a1b2&ID=7&M=LD'

      expect(ampersands.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for &amp; on a row without the mark', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&amp;ID=7&amp;GUID=a1b2'

      expect(unmarkedAmpersands.readUrl(value)).toBeUndefined()
    })

    it('should throw for a name that starts with amp; behind another parameter', () => {
      const throwing = () => {
        return defineTable([{ key: 'list', main: 'https://example.com/list.rss?a=1&amp;x=1' }], {
          lenient: { ampersandEntity: true },
        })
      }

      expect(throwing).toThrow(
        'The list row sets amp;x, which the ampersand mark reads as another parameter',
      )
    })

    it('should build a parameter name that holds amp; behind other letters', () => {
      const table = defineTable(
        [{ key: 'list', main: 'https://example.com/list.rss?stamp;x=1&a=1' }],
        {
          lenient: { ampersandEntity: true },
        },
      )
      const expected = 'https://example.com/list.rss?a=1&stamp;x=1'

      expect(table.buildUrl('list')).toBe(expected)
    })

    it('should throw for a row whose own parameter name starts with amp;', () => {
      const throwing = () => {
        return defineTable([{ key: 'list', main: 'https://example.com/list.rss?amp;x=1&a=1' }], {
          lenient: { ampersandEntity: true },
        })
      }

      expect(throwing).toThrow(
        'The list row sets amp;x, which the ampersand mark reads as another parameter',
      )
    })

    it('should build a parameter name that starts with amp; on a row without the mark', () => {
      const table = defineTable([{ key: 'list', main: 'https://example.com/list.rss?amp;x=1&a=1' }])
      const expected = 'https://example.com/list.rss?a=1&amp;x=1'

      expect(table.buildUrl('list')).toBe(expected)
    })

    it('should write &amp; as & in a query that is sorted already', () => {
      const value = 'https://example.com/Feed.ashx?GUID=a1b2&amp;ID=7&amp;M=LD'
      const expected = 'https://example.com/Feed.ashx?GUID=a1b2&ID=7&M=LD'

      expect(ampersands.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a selector after &amp; under a value no row lists', () => {
      const value = 'https://example.com/feed?page=2&amp;type=other'

      expect(ampersandRoutes.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a URL the row takes only with &amp; left unread', () => {
      const value = 'https://example.com/Feed.ashx?page=2&amp;M=CL&M=LD&ID=7&GUID=a1b2'

      expect(ampersands.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a value after &amp; that the check of a marked row refuses', () => {
      const value = 'https://example.com/list?page=2&amp;id=news'

      expect(ampersandItems.readUrl(value)).toBeUndefined()
    })

    it('should return no main URL for a doubled &amp;', () => {
      const value = 'https://example.com/feed?a=1&amp;amp;b=2'

      expect(ampersandPairs.getMainUrl(value)).toBeUndefined()
    })

    it('should return no main URL for a doubled &amp; before another pair', () => {
      const value = 'https://example.com/feed?zz=1&amp;amp;b=2&a=1'

      expect(ampersandPairs.getMainUrl(value)).toBeUndefined()
    })

    it('should return no main URL for a first pair that starts with amp;', () => {
      const value = 'https://example.com/feed?amp;b=2&a=1'

      expect(ampersandPairs.getMainUrl(value)).toBeUndefined()
    })

    it('should not mark a doubled &amp; as exact', () => {
      const value = 'https://example.com/feed?a=1&amp;amp;b=2'
      const match = ampersandPairs.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should mark a URL with &amp; on a row without the mark as exact', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&ID=7&GUID=a1b2&amp;x=3'
      const match = unmarkedAmpersands.readUrl(value)

      expect(match?.isExact).toBe(true)
    })

    it('should return no main URL for an alias whose first pair starts with amp;', () => {
      const value = 'https://example.com/old.rss?amp;x=2&a=1'

      expect(ampersandAlias.getMainUrl(value)).toBeUndefined()
    })

    it('should not mark an alias whose first pair starts with amp; as exact', () => {
      const value = 'https://example.com/old.rss?amp;x=2&a=1'
      const match = ampersandAlias.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should read an encoded &amp; inside a value as part of the value', () => {
      const value = 'https://example.com/feed?tag=A%26amp;B&amp;type=posts'
      const expected: Record<string, string> = { tag: 'A&amp;B' }
      const match = ampersandTags.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should write an encoded &amp; inside a value as written', () => {
      const value = 'https://example.com/feed?tag=A%26amp;B&amp;type=posts'
      const expected = 'https://example.com/feed?tag=A%26amp;B&type=posts'

      expect(ampersandTags.getMainUrl(value)).toBe(expected)
    })

    it('should not read an entity in capitals as &', () => {
      const value = 'https://example.com/feed?tag=a&AMP;type=posts&amp;z=1'
      const expected = 'posts'
      const match = ampersandTags.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should not read a string as the ampersand entity mark', () => {
      const table = defineTable([{ key: 'feed', main: 'https://example.com/feed?a={a}&b={b}' }], {
        // @ts-expect-error: The ampersand entity mark is a boolean.
        lenient: { ampersandEntity: 'yes' },
      })
      const value = 'https://example.com/feed?a=1&amp;b=2'

      expect(table.readUrl(value)).toBeUndefined()
    })

    it('should read 200 kB of &amp; within a second', () => {
      const value = `https://example.com/Feed.ashx?M=LD${'&amp;ID=7'.repeat(22000)}`
      const startedAt = performance.now()

      ampersands.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with kept parameters', () => {
    it('should keep a listed parameter and drop any other on an alias', () => {
      const value = 'https://example.com/posts.xml?v=2&max-results=5&utm_source=feed'
      const expected = 'https://feeds.example.com/posts.xml?max-results=5'

      expect(paged.getMainUrl(value)).toBe(expected)
    })

    it('should drop a parameter that is not listed from a main URL', () => {
      const value = 'https://feeds.example.com/posts.xml?max-results=5&v=2'
      const expected = 'https://feeds.example.com/posts.xml?max-results=5'

      expect(paged.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a sorted main URL whose parameters are all listed', () => {
      const value = 'https://feeds.example.com/posts.xml?max-results=5&start-index=10'

      expect(paged.getMainUrl(value)).toBeUndefined()
    })

    it('should keep the fragment of an alias', () => {
      const value = 'https://example.com/posts.xml?max-results=5#latest'
      const expected = 'https://feeds.example.com/posts.xml?max-results=5#latest'

      expect(paged.getMainUrl(value)).toBe(expected)
    })

    it('should sort the listed parameters of an alias by name', () => {
      const value = 'https://example.com/posts.xml?start-index=10&max-results=5'
      const expected = 'https://feeds.example.com/posts.xml?max-results=5&start-index=10'

      expect(paged.getMainUrl(value)).toBe(expected)
    })

    it('should keep a listed parameter whose name is written with +', () => {
      const table = defineTable([{ key: 'posts', main: 'https://example.com/posts.xml?id={id}' }], {
        keptParams: ['max results'],
      })
      const value = 'https://example.com/posts.xml?ref=home&max+results=5&id=7'
      const expected = 'https://example.com/posts.xml?id=7&max+results=5'

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a main URL with an own parameter given again with +', () => {
      const table = defineTable([{ key: 'posts', main: 'https://example.com/posts.xml?id={id}' }], {
        keptParams: ['page'],
      })
      const value = 'https://example.com/posts.xml?id=7&id+=8&ref=home'

      expect(table.getMainUrl(value)).toBeUndefined()
    })

    it('should drop every parameter for an empty list', () => {
      const value = 'https://feeds.example.com/alice?format=xml&utm_source=feed'
      const expected = 'https://feeds.example.com/alice'

      expect(bare.getMainUrl(value)).toBe(expected)
    })

    it('should keep the scheme of a main URL it only drops parameters from', () => {
      const value = 'http://feeds.example.com/alice?format=xml'
      const expected = 'http://feeds.example.com/alice'

      expect(bare.getMainUrl(value)).toBe(expected)
    })
  })

  describe('with a parameter name the row writes with an escape', () => {
    it('should mark the URL the row builds as exact', () => {
      const value = 'https://example.com/items?item%20id=5'
      const match = escapedName.readUrl(value)

      expect(match?.isExact).toBe(true)
    })

    it('should write the http spelling of the URL the row builds as its main URL', () => {
      const value = 'http://example.com/items?item%20id=5'
      const expected = 'https://example.com/items?item%20id=5'

      expect(escapedName.getMainUrl(value)).toBe(expected)
    })

    it('should write the name on an alias as the row builds it', () => {
      const value = 'https://old.example.com/item/5'
      const expected = 'https://example.com/items?item%20id=5'

      expect(escapedName.getMainUrl(value)).toBe(expected)
    })

    it('should not mark the name written with + as exact', () => {
      const value = 'https://example.com/items?item+id=5'
      const match = escapedName.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should leave a flag the alias gives with an equals sign as the main URL escapes it', () => {
      const value = 'https://old.example.com/list?my%20flag='
      const expected = 'https://example.com/list?my%20flag'

      expect(escapedFlag.getMainUrl(value)).toBe(expected)
    })

    it('should not mark a name with an escape that is no UTF-8 as exact', () => {
      const value = 'https://example.com/items?id%FF=5'
      const match = brokenName.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should not mark a name given twice, once with an escape that is no UTF-8, as exact', () => {
      const value = 'https://example.com/items?id%FF=1&id%EF%BF%BD=5'
      const match = brokenName.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should leave a URL with a name given twice, once with an escape that is no UTF-8', () => {
      const value = 'http://example.com/items?id%FF=6&id%EF%BF%BD=5'

      expect(brokenName.getMainUrl(value)).toBeUndefined()
    })

    it('should leave an alias with another value under a name with an escape that is no UTF-8', () => {
      const value = 'https://old.example.com/item/5?id%FF=rss'

      expect(brokenSecondName.getMainUrl(value)).toBeUndefined()
    })

    it('should leave an alias with a pair some servers read as the name the row escapes', () => {
      const value = 'https://old.example.com/item/5?%FF=9'

      expect(escapedPercentName.getMainUrl(value)).toBeUndefined()
    })

    it('should keep a pair a kept list names with an escape that is no UTF-8', () => {
      const value = 'http://example.com/items/5?%FF=1&page=2'
      const expected = 'https://example.com/items/5?%FF=1'

      expect(keptEscape.getMainUrl(value)).toBe(expected)
    })

    it('should write an alias that gives a name with a percent sign as the row names it', () => {
      const value = 'https://old.example.com/entry/5?rate%=5'
      const expected = 'https://example.com/entries?rate%25=5'

      expect(percentName.getMainUrl(value)).toBe(expected)
    })

    it('should write an alias that gives a flag with a percent sign as the row names it', () => {
      const value = 'https://old.example.com/list?rate%'
      const expected = 'https://example.com/list?rate%25'

      expect(percentFlag.getMainUrl(value)).toBe(expected)
    })

    it('should leave an alias with a name read as one parameter and spelled as another', () => {
      const value = 'https://old.example.com/item/5/7?a+b=5'

      expect(spaceAndPlusNames.getMainUrl(value)).toBeUndefined()
    })

    it('should leave an alias with an escaped name spelled as another parameter', () => {
      const value = 'https://old.example.com/item/7/5?%41=5'

      expect(letterAndEscapeNames.getMainUrl(value)).toBeUndefined()
    })
  })

  describe('with a question mark inside a query', () => {
    it('should throw for a row whose query opens with a second question mark', () => {
      const value = [{ key: 'item', main: 'https://example.com/items??id={id}' }]
      const throwing = () => defineTable(value)

      expect(throwing).toThrow('Not a URL template: https://example.com/items??id={id}')
    })

    it('should throw for an alias whose query opens with a second question mark', () => {
      const value = [
        {
          key: 'posts',
          main: 'https://example.com/feed',
          aliases: ['https://old.example.com/feed??alt=rss'],
        },
      ]
      const throwing = () => defineTable(value)

      expect(throwing).toThrow('Not a URL template: https://old.example.com/feed??alt=rss')
    })

    it('should write an alias that gives a parameter of the main URL behind a name that opens with a question mark', () => {
      const value = 'https://old.example.com/feed??page=2&alt=rss'
      const expected = 'https://example.com/feed??page=2&alt=rss'

      expect(movedFormat.getMainUrl(value)).toBe(expected)
    })

    it('should write an alias that gives a parameter of the main URL behind a value with a question mark', () => {
      const value = 'https://old.example.com/feed?a=1?&alt=rss'
      const expected = 'https://example.com/feed?a=1?&alt=rss'

      expect(movedFormat.getMainUrl(value)).toBe(expected)
    })

    it('should leave an alias that gives the parameter of the main URL a value cut at a question mark', () => {
      const value = 'https://example.com/legacy?i=q?r&id=q'

      expect(renamed.getMainUrl(value)).toBeUndefined()
    })

    it('should read 200 kB of a parameter of the main URL on an alias within a second', () => {
      const value = `https://old.example.com/feed?${'a=1&'.repeat(25000)}${'v=2&'.repeat(25000)}`
      const startedAt = performance.now()

      movedVersion.getMainUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should keep a bare question mark of a URL it writes a value of in lowercase', () => {
      const value = 'https://feeds.example.com/Alice?'
      const expected = 'https://feeds.example.com/alice?'

      expect(marked.getMainUrl(value)).toBe(expected)
    })

    it('should drop a bare fragment mark of a URL it sorts the query of', () => {
      const value = 'https://example.com/feed?type=RSS&q=news#'
      const expected = 'https://example.com/feed?q=news&type=RSS'

      expect(unsorted.getMainUrl(value)).toBe(expected)
    })

    it('should keep a bare fragment mark of a URL it writes the flag of', () => {
      const value = 'https://feeds.example.com/list.php?xml=#'
      const expected = 'https://feeds.example.com/list.php?xml#'

      expect(flaggedMain.getMainUrl(value)).toBe(expected)
    })

    it('should keep a question mark that opens the first name under the ampersand mark', () => {
      const value = 'https://example.com/old.rss??page=2&amp;a=1'
      const expected = 'https://example.com/feed.rss??page=2&a=1'

      expect(ampersandAlias.getMainUrl(value)).toBe(expected)
    })
  })

  describe('with several values in one segment', () => {
    it('should give the first value all the fixed text it can hold', () => {
      const value = 'https://example.com/pages/art-deco-alice-2.xml'
      const expected = {
        board: 'art-deco',
        user: 'alice',
        page: '2',
      }
      const match = sharedPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a later value that ends in the fixed text', () => {
      const value = 'https://example.com/pages/art-alice--2.xml'
      const expected = {
        board: 'art',
        user: 'alice-',
        page: '2',
      }
      const match = sharedPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a later value of a query value that ends in the fixed text', () => {
      const value = 'https://example.com/search?q=art-alice--2.xml'
      const expected = {
        board: 'art',
        user: 'alice-',
        page: '2',
      }
      const match = sharedPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should return undefined for a segment that leaves a value empty', () => {
      const value = 'https://example.com/pages/art--2.xml'

      expect(sharedPages.readUrl(value)).toBeUndefined()
    })

    it('should read 200 kB of the fixed text in a segment within a second', () => {
      const value = `https://example.com/pages/${'-'.repeat(200000)}.xm`
      const startedAt = performance.now()

      sharedPages.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should split a segment where the pattern of a value ends', () => {
      const value = 'https://example.com/pages/art-deco-c12-alice-bob-s3.xml'
      const expected = {
        board: 'art-deco',
        category: '12',
        user: 'alice-bob',
        section: '3',
      }
      const match = checkedSharedPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read 100 kB of values with a pattern in a segment within a second', () => {
      const value = `https://example.com/pages/${'-c1-s1'.repeat(16000)}-cx-sx.xml`
      const startedAt = performance.now()

      checkedSharedPages.readUrl(value)
      checkedSharedPages.getMainUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should read a segment of values 1,000 characters long', () => {
      const value = `https://example.com/pages/${'a'.repeat(988)}-alice-2.xml`
      const expected = 'page'
      const match = sharedPages.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should return undefined for a segment of values over 1,000 characters', () => {
      const value = `https://example.com/pages/${'a'.repeat(989)}-alice-2.xml`

      expect(sharedPages.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a query value of two values over 1,000 characters', () => {
      const value = `https://example.com/search?q=${'a'.repeat(989)}-alice-2.xml`

      expect(sharedPages.readUrl(value)).toBeUndefined()
    })

    it('should read a long value alone in its segment', () => {
      const value = `https://example.com/items/${'a'.repeat(5000)}`
      const expected = 'item'
      const match = keptEscape.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should read 200 kB of the fixed text in a query value within a second', () => {
      const value = `https://example.com/search?q=${'-'.repeat(200000)}.xm`
      const startedAt = performance.now()

      sharedPages.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with a list that ends inside its last segment', () => {
    it('should read the segments with the fixed text cut from the last one', () => {
      const value = 'https://example.com/files/docs/guide.atom'
      const expected = { path: ['docs', 'guide'] }
      const match = atomFiles.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should build the URL with the fixed text behind the last segment', () => {
      const value = { path: ['docs', 'guide'] }
      const expected = 'https://example.com/files/docs/guide.atom'

      expect(atomFiles.buildUrl('file', value)).toBe(expected)
    })

    it('should return undefined for a URL whose last segment is only the fixed text', () => {
      const value = 'https://example.com/files/docs/.atom'

      expect(atomFiles.readUrl(value)).toBeUndefined()
    })
  })

  describe('with several values in one host label', () => {
    it('should read a host of 1,000 characters', () => {
      const value = `https://${'a'.repeat(984)}-b-c.example.com/feed`
      const expected = 'feed'
      const match = labeledHosts.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should return undefined for a host over 1,000 characters', () => {
      const value = `https://${'a'.repeat(985)}-b-c.example.com/feed`

      expect(labeledHosts.readUrl(value)).toBeUndefined()
    })

    it('should read a crafted host of three values within a second', () => {
      const value = `https://${'a-'.repeat(490)}x.example.com/feedx`
      const startedAt = performance.now()

      labeledHosts.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with non-ASCII text in a segment of several values', () => {
    it('should read the URL as written up to its decoded length', () => {
      const value = `https://example.com/old/${'ж'.repeat(400)}-b`
      const match = movedSharedPages.readUrl(value)

      expect(match?.isExact).toBe(true)
    })
  })

  describe('with hosts that rule a URL out', () => {
    it('should read a URL on a tenant domain alone', () => {
      const value = 'https://example.com/feed'
      const expected = 'site'
      const match = domainFeeds.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a tenant behind www', () => {
      const value = 'https://www.alice.example.com/blog/feed'
      const expected = {
        scheme: 'https',
        blog: 'alice',
        domain: 'example.com',
      }
      const match = domainFeeds.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read an exact host written in another case and behind www', () => {
      const value = 'https://www.example.org/mirror/feed'
      const expected = 'mirror'
      const match = domainFeeds.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should return undefined for a host no row takes', () => {
      const value = 'https://example.net/feed'

      expect(domainFeeds.readUrl(value)).toBeUndefined()
    })
  })

  describe('with a value that would move or break the URL', () => {
    it('should build no URL from a value that is a dot segment', () => {
      const value = {
        scheme: 'https',
        host: 'example.com',
        id: '..',
      }

      expect(builtFeeds.buildUrl('feed', value)).toBeUndefined()
    })

    it('should build no URL from an escaped dot segment', () => {
      const value = {
        scheme: 'https',
        host: 'example.com',
        id: '%2e%2e',
      }

      expect(builtFeeds.buildUrl('feed', value)).toBeUndefined()
    })

    it('should build no URL from a list holding a dot segment', () => {
      const value = { path: ['guide', '..', 'admin'] }

      expect(builtFeeds.buildUrl('docs', value)).toBeUndefined()
    })

    it('should build no URL from a scheme value that holds another URL', () => {
      const value = {
        scheme: 'https://evil.example/x?',
        host: 'example.com',
        id: '5',
      }

      expect(builtFeeds.buildUrl('feed', value)).toBeUndefined()
    })

    it('should build no URL under a scheme other than http or https', () => {
      const value = {
        scheme: 'javascript',
        host: 'example.com',
        id: '5',
      }

      expect(builtFeeds.buildUrl('feed', value)).toBeUndefined()
    })

    it('should build no URL from a host value with a line break', () => {
      const value = {
        scheme: 'https',
        host: 'exam\nple.com',
        id: '5',
      }

      expect(builtFeeds.buildUrl('feed', value)).toBeUndefined()
    })

    it('should build no URL from a host value a parser reads as another host', () => {
      const value = {
        scheme: 'https',
        host: '12345',
        id: '5',
      }

      expect(builtFeeds.buildUrl('feed', value)).toBeUndefined()
    })

    it('should build no URL from a list of empty items in a slot of one value', () => {
      const value = {
        scheme: 'https',
        host: 'example.com',
        id: ['', ''],
      }

      expect(builtFeeds.buildUrl('feed', value)).toBeUndefined()
    })

    it('should encode a control character in a value', () => {
      const value = { q: 'a\u0000b' }
      const expected = 'https://example.com/search?q=a%00b'

      expect(builtFeeds.buildUrl('search', value)).toBe(expected)
    })

    it('should build a URL from a scheme value in capitals', () => {
      const value = {
        scheme: 'HTTPS',
        host: 'example.com',
        id: '5',
      }
      const expected = 'HTTPS://example.com/u/5/feed'

      expect(builtFeeds.buildUrl('feed', value)).toBe(expected)
    })
  })

  describe('with two lists in a path', () => {
    it('should read a path of 1,000 characters', () => {
      const value = `https://example.com/${'a'.repeat(970)}/-/commits/main/docs/guide.md`
      const expected = {
        project: ['a'.repeat(970)],
        branch: 'main',
        file: ['docs', 'guide.md'],
      }
      const match = commitFiles.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should return undefined for a path over 1,000 characters', () => {
      const value = `https://example.com/${'a'.repeat(971)}/-/commits/main/docs/guide.md`

      expect(commitFiles.readUrl(value)).toBeUndefined()
    })
  })

  describe('with rows that differ by a checked value', () => {
    it('should read the main URL of a row behind another row with a checked value', () => {
      const value = 'https://example.com/feed?format=rss_200'
      const match = versions.readUrl(value)

      expect(match?.key).toBe('rss')
    })

    it('should read a value the check of a later row takes', () => {
      const value = 'https://example.com/feed?format=rss2'
      const match = versions.readUrl(value)

      expect(match?.key).toBe('rss')
    })

    it('should write a value the check of a later row takes as that row writes it', () => {
      const value = 'https://example.com/feed?format=rss2'
      const expected = 'https://example.com/feed?format=rss_200'

      expect(versions.getMainUrl(value)).toBe(expected)
    })

    it('should read a path value the check of a later row takes', () => {
      const value = 'https://example.com/news/feed'
      const match = checkedPaths.readUrl(value)

      expect(match?.key).toBe('tag')
    })

    it('should return undefined for a path value no check takes beside an open path', () => {
      const value = 'https://example.com/other/feed'

      expect(checkedPaths.readUrl(value)).toBeUndefined()
    })

    it('should read a row whose parameter name is in another letter case', () => {
      const value = 'https://example.com/feed?format=rss_200'
      const match = checkedNameCase.readUrl(value)

      expect(match?.key).toBe('rss')
    })
  })

  describe('with a pattern as a check', () => {
    it('should read a value the pattern takes', () => {
      const value = 'https://example.com/items/123'
      const match = checkedByRegex.readUrl(value)

      expect(match?.key).toBe('item')
    })

    it('should return undefined for a value the pattern refuses', () => {
      const value = 'https://example.com/items/alice'

      expect(checkedByRegex.readUrl(value)).toBeUndefined()
    })

    it('should build a URL from a value the pattern takes', () => {
      const value = { id: '123' }
      const expected = 'https://example.com/items/123'

      expect(checkedByRegex.buildUrl('item', value)).toBe(expected)
    })

    it('should build no URL from a value the pattern refuses', () => {
      const value = { id: 'alice' }

      expect(checkedByRegex.buildUrl('item', value)).toBeUndefined()
    })

    it('should write the main URL of a value the pattern takes', () => {
      const value = 'https://example.com/item?id=123'
      const expected = 'https://example.com/items/123'

      expect(checkedByRegex.getMainUrl(value)).toBe(expected)
    })

    it('should write no main URL of a value the pattern refuses', () => {
      const value = 'https://example.com/item?id=alice'

      expect(checkedByRegex.getMainUrl(value)).toBeUndefined()
    })

    it('should read a value in the other letter case under a pattern with the i flag', () => {
      const value = 'https://example.com/commits/5F3A'
      const match = checkedByRegex.readUrl(value)

      expect(match?.key).toBe('commit')
    })

    it('should read a value a function takes beside a pattern', () => {
      const value = 'https://example.com/tags/news'
      const match = checkedByRegex.readUrl(value)

      expect(match?.key).toBe('tag')
    })

    it('should return undefined for a value a function refuses beside a pattern', () => {
      const value = 'https://example.com/tags/sports'

      expect(checkedByRegex.readUrl(value)).toBeUndefined()
    })

    it('should throw for a pattern with the g flag', () => {
      const throwing = () => {
        return defineTable([{ key: 'item', main: 'https://example.com/items/{id}' }], {
          checks: { id: globalDigitsRegex },
        })
      }

      expect(throwing).toThrow(
        'The check of id is a pattern with a g or y flag, which answers differently on a second call',
      )
    })

    it('should throw for a pattern with the y flag', () => {
      const throwing = () => {
        return defineTable([{ key: 'item', main: 'https://example.com/items/{id}' }], {
          checks: { id: stickyDigitsRegex },
        })
      }

      expect(throwing).toThrow(
        'The check of id is a pattern with a g or y flag, which answers differently on a second call',
      )
    })

    it('should throw for a pattern without ^ at its start', () => {
      const throwing = () => {
        return defineTable([{ key: 'item', main: 'https://example.com/items/{id}' }], {
          checks: { id: endAnchoredDigitsRegex },
        })
      }

      expect(throwing).toThrow(
        'The check of id is a pattern without ^ at its start and $ at its end',
      )
    })

    it('should throw for a pattern without $ at its end', () => {
      const throwing = () => {
        return defineTable([{ key: 'item', main: 'https://example.com/items/{id}' }], {
          checks: { id: startAnchoredDigitsRegex },
        })
      }

      expect(throwing).toThrow(
        'The check of id is a pattern without ^ at its start and $ at its end',
      )
    })
  })

  describe('with a URL read twice', () => {
    it('should not let an edit of the values read change the next read', () => {
      const value = 'https://example.com/items?id=5'
      const expected = { id: '5' }
      const match = moved.readUrl(value)

      if (match) {
        match.values.id = '7'
      }

      const nextMatch = moved.readUrl(value)

      expect(nextMatch?.values).toEqual(expected)
    })

    it('should ask a check again for a URL it read before', () => {
      const state = { isAllowed: true }
      const table = defineTable([{ key: 'item', main: 'https://example.com/items?id={id}' }], {
        checks: { id: () => state.isAllowed },
      })
      const value = 'https://example.com/items?id=5'

      table.readUrl(value)
      state.isAllowed = false

      expect(table.readUrl(value)).toBeUndefined()
    })

    it('should write the main URL of a URL it read before', () => {
      const value = 'https://example.com/item/5'
      const expected = 'https://example.com/items?id=5'

      moved.readUrl(value)

      expect(moved.getMainUrl(value)).toBe(expected)
    })
  })

  describe('with an escaped percent sign or slash in a value', () => {
    const tags = defineTable([
      { key: 'tag', main: 'https://example.com/tag/{tag}' },
      { key: 'tag-feed', main: 'https://example.com/data/rss?tag={tag}' },
      { key: 'docs', main: 'https://example.com/docs{/path*}' },
    ])

    it('should read an escaped percent sign in a path value decoded', () => {
      const value = 'https://example.com/tag/100%25'
      const expected = { tag: '100%' }
      const match = tags.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read an escaped slash in a path value decoded', () => {
      const value = 'https://example.com/tag/a%2Fb'
      const expected = { tag: 'a/b' }
      const match = tags.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should write a path value with a percent sign read from a path into a query once', () => {
      const value = 'https://example.com/tag/100%25'
      const expected = 'https://example.com/data/rss?tag=100%25'
      const match = tags.readUrl(value)

      expect(tags.buildUrl('tag-feed', match?.values)).toBe(expected)
    })

    it('should write a path value with a slash read from a path into a query once', () => {
      const value = 'https://example.com/tag/a%2Fb'
      const expected = 'https://example.com/data/rss?tag=a/b'
      const match = tags.readUrl(value)

      expect(tags.buildUrl('tag-feed', match?.values)).toBe(expected)
    })

    it('should write back a path value with a percent sign it read', () => {
      const value = 'https://example.com/tag/100%25'
      const match = tags.readUrl(value)

      expect(tags.buildUrl('tag', match?.values)).toBe(value)
    })

    it('should write back a path value with a slash it read', () => {
      const value = 'https://example.com/tag/a%2Fb'
      const match = tags.readUrl(value)

      expect(tags.buildUrl('tag', match?.values)).toBe(value)
    })

    it('should read an escaped slash inside one segment of a multi-segment value decoded', () => {
      const value = 'https://example.com/docs/guides/a%2Fb'
      const expected = { path: ['guides', 'a/b'] }
      const match = tags.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should write each segment of a multi-segment value once', () => {
      const value = { path: ['guides', 'a/b', '100%'] }
      const expected = 'https://example.com/docs/guides/a%2Fb/100%25'

      expect(tags.buildUrl('docs', value)).toBe(expected)
    })

    it('should write a multi-segment value given as text at its slashes', () => {
      const value = { path: 'guides/a' }
      const expected = 'https://example.com/docs/guides/a'

      expect(tags.buildUrl('docs', value)).toBe(expected)
    })

    it('should write a list in a slot of one segment as its items joined by commas', () => {
      const value = { tag: ['a', 'b'] }
      const expected = 'https://example.com/tag/a,b'

      expect(tags.buildUrl('tag', value)).toBe(expected)
    })

    it('should read a query value with a percent sign and an ampersand decoded', () => {
      const value = 'https://example.com/data/rss?tag=R%26D%20100%25'
      const expected = { tag: 'R&D 100%' }
      const match = tags.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should write a query value with a percent sign and an ampersand once', () => {
      const value = { tag: 'R&D 100%' }
      const expected = 'https://example.com/data/rss?tag=R%26D%20100%25'

      expect(tags.buildUrl('tag-feed', value)).toBe(expected)
    })
  })

  describe('with an open tail', () => {
    it('should read a URL with no segment behind the path without a tail', () => {
      const value = 'https://example.com/acme/app'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a trailing slash behind the path without a tail', () => {
      const value = 'https://example.com/acme/app/'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should leave the tail out of the values read', () => {
      const value = 'https://example.com/acme/app/issues/12'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should check a tail as its segments joined by a slash, without the empty ones', () => {
      const value = 'https://example.com/issues/12//comments//5/'
      const expected = 'issue'
      const match = tailCheckedPages.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should return undefined for a tail its check refuses', () => {
      const value = 'https://example.com/issues/12/history'

      expect(tailCheckedPages.readUrl(value)).toBeUndefined()
    })

    it('should check a tail with its segments decoded', () => {
      const value = 'https://example.com/issues/12/caf%C3%A9'
      const expected = 'issue'
      const match = tailCheckedPages.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a URL with a query no row names', () => {
      const value = 'https://example.com/acme/app/issues/12?page=2'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read slashes alone behind the path without a tail', () => {
      const value = 'https://example.com/acme/app///'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a longer last segment as the value and not as a tail', () => {
      const value = 'https://example.com/acme/application'
      const expected = {
        owner: 'acme',
        repo: 'application',
      }
      const match = openPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a URL a row without a tail takes as that row, written behind the open one', () => {
      const value = 'https://example.com/acme/app/releases'
      const expected = 'releases'
      const match = openPages.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a URL two open rows take as the deeper one, written behind the other', () => {
      const value = 'https://example.com/acme/app/issues'
      const expected = 'repo'
      const match = openPages.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a value its check takes in front of a tail', () => {
      const value = 'https://example.com/issues/12/comments'
      const expected = {
        id: '12',
      }
      const match = checkedOpenPages.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should return undefined for a value its check refuses in front of a tail', () => {
      const value = 'https://example.com/issues/alice/comments'

      expect(checkedOpenPages.readUrl(value)).toBeUndefined()
    })

    it('should build the URL without a tail', () => {
      const value = {
        owner: 'acme',
        repo: 'app',
      }
      const expected = 'https://example.com/acme/app'

      expect(openPages.buildUrl('repo', value)).toBe(expected)
    })

    it('should not write a tail given as a value', () => {
      const value = {
        owner: 'acme',
        repo: 'app',
        tail: ['issues', '12'],
      }
      const expected = 'https://example.com/acme/app'

      expect(openPages.buildUrl('repo', value)).toBe(expected)
    })

    it('should write the main URL of a URL without a tail', () => {
      const value = 'http://example.com/acme/app'
      const expected = 'https://example.com/acme/app'

      expect(openPages.getMainUrl(value)).toBe(expected)
    })

    it('should return no main URL for a URL with a tail', () => {
      const value = 'http://example.com/acme/app/issues/12'

      expect(openPages.getMainUrl(value)).toBeUndefined()
    })

    it('should mark a URL without a tail as exact', () => {
      const value = 'https://example.com/acme/app'
      const match = openPages.readUrl(value)

      expect(match?.isExact).toBe(true)
    })

    it('should not mark a URL with a tail as exact', () => {
      const value = 'https://example.com/acme/app/issues/12'
      const match = openPages.readUrl(value)

      expect(match?.isExact).toBe(false)
    })

    it('should throw for an open tail in front of another segment', () => {
      const throwing = () => {
        return defineTable([{ key: 'repo', main: 'https://example.com/{owner}{/tail*}/issues' }])
      }

      expect(throwing).toThrow('The repo row writes {/tail*} elsewhere than at the end of its path')
    })

    it('should throw for an open tail in the query', () => {
      const throwing = () => {
        return defineTable([{ key: 'repo', main: 'https://example.com/{owner}?tab={/tail*}' }])
      }

      expect(throwing).toThrow('The repo row writes {/tail*} elsewhere than at the end of its path')
    })

    it('should throw for two open tails in one path', () => {
      const throwing = () => {
        return defineTable([{ key: 'repo', main: 'https://example.com/{owner}{/tail*}{/tail*}' }])
      }

      expect(throwing).toThrow('The repo row writes {/tail*} elsewhere than at the end of its path')
    })

    it('should throw for an open tail in a path with a value of several segments', () => {
      const throwing = () => {
        return defineTable([{ key: 'docs', main: 'https://example.com/docs{/page*}/edit{/tail*}' }])
      }

      expect(throwing).toThrow(
        'The docs row writes {/tail*} in a path with page, which takes several segments, so the two are split by a guess',
      )
    })

    it('should throw for a value named tail beside an open tail', () => {
      const throwing = () => {
        return defineTable([{ key: 'repo', main: 'https://example.com/{tail}{/tail*}' }])
      }

      expect(throwing).toThrow('The repo row names a value tail, which {/tail*} is read as')
    })

    it('should read a path of 20,000 segments within a second', () => {
      const value = `https://example.com${'/segment'.repeat(20000)}`
      const startedAt = performance.now()

      openPages.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should read 200 kB of slashes behind the path within a second', () => {
      const value = `https://example.com/acme/app${'/'.repeat(200000)}`
      const startedAt = performance.now()

      openPages.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with a base given', () => {
    it('should read a URL under a base with no base path', () => {
      const value = 'https://example.org/viewtopic.php?t=5'
      const options = { base: [] }
      const expected: BoardMatch = {
        key: 'topic',
        values: {
          topicId: '5',
          scheme: 'https',
          host: 'example.org',
        },
        row: {
          key: 'topic',
          main: '{scheme}://{host}{/base*}/viewtopic.php?t={topicId}',
          aliases: ['{scheme}://{host}{/base*}/topic/{topicId}'],
        },
        isAlias: false,
        isExact: false,
      }

      expect(boards.readUrl(value, options)).toEqual(expected)
    })

    it('should read a URL under a base with a base path', () => {
      const value = 'https://example.org/community/explore'
      const options = { base: '/community' }
      const expected = {
        scheme: 'https',
        host: 'example.org',
        base: ['community'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should read a query value under a base', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = { base: '/community' }
      const expected = {
        topicId: '5',
        scheme: 'https',
        host: 'example.org',
        base: ['community'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should read an open tail under a base', () => {
      const value = 'https://example.org/community/tag/news/2024'
      const options = { base: '/community' }
      const expected = {
        scheme: 'https',
        host: 'example.org',
        base: ['community'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should mark a URL an alias reads under a base as an alias', () => {
      const value = 'https://example.org/community/topic/5'
      const options = { base: '/community' }
      const match = boards.readUrl(value, options)

      expect(match?.isAlias).toBe(true)
    })

    it('should mark a root alias of a row whose main URL names a host as an alias', () => {
      const value = 'https://example.org/community/board/news'
      const options = { base: '/community' }
      const match = mixedBoards.readUrl(value, options)

      expect(match?.isAlias).toBe(true)
    })

    it('should read a base in another letter case than the URL has', () => {
      const value = 'https://example.org/Community/explore'
      const options = { base: '/community' }
      const expected = {
        scheme: 'https',
        host: 'example.org',
        base: ['Community'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should read a base written with an escape', () => {
      const value = 'https://example.org/~alice/explore'
      const options = { base: '/%7Ealice' }
      const expected = {
        scheme: 'https',
        host: 'example.org',
        base: ['~alice'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should read a base given with a trailing slash', () => {
      const value = 'https://example.org/community/explore'
      const options = { base: '/community/' }
      const expected = {
        scheme: 'https',
        host: 'example.org',
        base: ['community'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should build a URL under the root from the values read', () => {
      const value = 'https://example.org/community/topic/5'
      const options = { base: '/community' }
      const expected = 'https://example.org/community/viewtopic.php?t=5'
      const match = boards.readUrl(value, options)
      const topicUrl = boards.forSite(value)?.buildUrl('topic', match?.values)

      expect(topicUrl).toBe(expected)
    })

    it('should return undefined for a URL under another base path', () => {
      const value = 'https://example.org/forum/explore'
      const options = { base: '/community' }

      expect(boards.readUrl(value, options)).toBeUndefined()
    })

    it('should return undefined for a base path that only starts a longer segment', () => {
      const value = 'https://example.org/forums/explore'
      const options = { base: '/forum' }

      expect(boards.readUrl(value, options)).toBeUndefined()
    })

    it('should return undefined for a value its check refuses under a base', () => {
      const value = 'https://example.org/community/viewtopic.php?t=latest'
      const options = { base: '/community' }

      expect(boards.readUrl(value, options)).toBeUndefined()
    })

    it('should read under the base given and not under the one the URL shows', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = {
        base: [],
        isAnyHost: true,
      }

      expect(topicBoards.readUrl(value, options)).toBeUndefined()
    })

    it('should not read a row on a fixed host under a base', () => {
      const value = 'https://example.com/boards/news'
      const options = { base: [] }

      expect(mixedBoards.readUrl(value, options)).toBeUndefined()
    })

    it('should read a URL on a host the table does not list', () => {
      const value = 'https://example.org/blog/feed.xml'
      const options = { base: '/blog' }
      const expected = {
        scheme: 'https',
        host: 'example.org',
        base: ['blog'],
      }
      const match = rooted.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should read a URL on a host the table lists without the host as a value', () => {
      const value = 'https://alice.example.net/blog/feed.xml'
      const options = { base: '/blog' }
      const expected = {
        scheme: 'https',
        host: 'alice.example.net',
        base: ['blog'],
      }
      const match = rooted.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })
  })

  describe('with a base the URL shows', () => {
    it('should return undefined for a URL that is not http', () => {
      const value = 'ftp://example.org/viewtopic.php?t=5'
      const options = { isAnyHost: true }

      expect(boards.readUrl(value, options)).toBeUndefined()
    })

    it('should keep the scheme and host of a URL while a check reads another table', () => {
      const profiles = defineTable([{ key: 'profile', main: '{scheme}://{host}/@{user}' }])
      const isProfile = (user: string): boolean => {
        return profiles.readUrl(`https://example.net/${user}`, { isAnyHost: true }) !== undefined
      }
      const table = defineTable(
        [
          { key: 'mention', main: '{scheme}://{host}/{user}', checks: { user: isProfile } },
          { key: 'page', main: '{scheme}://{host}/{slug}' },
        ],
        { isFallThrough: true },
      )
      const value = 'https://example.org/about'
      const options = { isAnyHost: true }
      const expected = {
        slug: 'about',
        scheme: 'https',
        host: 'example.org',
      }
      const match = table.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should read a row without a base only at the top of the host', () => {
      const table = defineTable([{ key: 'profile', main: '{scheme}://{host}/@{user}' }])
      const options = { isAnyHost: true }

      const topMatch = table.readUrl('https://example.org/@alice', options)
      const folderMatch = table.readUrl('https://example.org/social/@alice', options)

      expect(topMatch?.key).toBe('profile')
      expect(folderMatch).toBeUndefined()
    })

    it('should find a base with no base path', () => {
      const value = 'https://example.org/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected: BoardMatch = {
        key: 'topic',
        values: {
          topicId: '5',
          scheme: 'https',
          host: 'example.org',
        },
        row: {
          key: 'topic',
          main: '{scheme}://{host}{/base*}/viewtopic.php?t={topicId}',
          aliases: ['{scheme}://{host}{/base*}/topic/{topicId}'],
        },
        isAlias: false,
        isExact: false,
      }

      expect(boards.readUrl(value, options)).toEqual(expected)
    })

    it('should find a base with one segment of base path', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        scheme: 'https',
        host: 'example.org',
        base: ['community'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should find a base with two segments of base path', () => {
      const value = 'https://example.org/sites/community/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        scheme: 'https',
        host: 'example.org',
        base: ['sites', 'community'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should find a base with eight segments of base path', () => {
      const value = 'https://example.org/a/b/c/d/e/f/g/h/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        scheme: 'https',
        host: 'example.org',
        base: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      }
      const match = topicBoards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should return undefined for a base of nine segments', () => {
      const value = 'https://example.org/a/b/c/d/e/f/g/h/i/viewtopic.php?t=5'
      const options = { isAnyHost: true }

      expect(topicBoards.readUrl(value, options)).toBeUndefined()
    })

    it('should find a base with a port', () => {
      const value = 'https://example.org:8080/community/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        scheme: 'https',
        host: 'example.org:8080',
        base: ['community'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should return a base path with an escape as the URL writes it', () => {
      const value = 'https://example.org/%7Ealice/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        scheme: 'https',
        host: 'example.org',
        base: ['~alice'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should take the shortest base a row reads the URL under', () => {
      const value = 'https://example.org/tag/tag/news'
      const options = { isAnyHost: true }
      const expected = {
        scheme: 'https',
        host: 'example.org',
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should read an open tail under the base it finds', () => {
      const value = 'https://example.org/community/tag/news/2024'
      const options = { isAnyHost: true }
      const expected = {
        scheme: 'https',
        host: 'example.org',
        base: ['community'],
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should read a row with fixed text under a longer root before a row of values alone', () => {
      const value = 'https://example.org/git/explore'
      const options = { isAnyHost: true }
      const expected = 'explore'
      const match = boards.readUrl(value, options)

      expect(match?.key).toBe(expected)
    })

    it('should read a row with fixed text under a longer root before a row of an open tail alone', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = 'topic'
      const match = openBoards.readUrl(value, options)

      expect(match?.key).toBe(expected)
    })

    it('should read a row of values alone where no row with fixed text reads the URL', () => {
      const value = 'https://example.org/staff/alice'
      const options = { isAnyHost: true }
      const expected = {
        group: 'staff',
        member: 'alice',
        scheme: 'https',
        host: 'example.org',
      }
      const match = boards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should read a row of an open tail alone at the origin', () => {
      const value = 'https://example.org/community/about'
      const options = { isAnyHost: true }
      const expected = {
        scheme: 'https',
        host: 'example.org',
      }
      const match = openBoards.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should build a URL under the base it finds from the values read', () => {
      const value = 'https://example.org/community/topic/5'
      const options = { isAnyHost: true }
      const expected = 'https://example.org/community/viewtopic.php?t=5'
      const match = boards.readUrl(value, options)
      const topicUrl = boards.forSite(value)?.buildUrl('topic', match?.values)

      expect(topicUrl).toBe(expected)
    })

    it('should return undefined for a value its check refuses under every base', () => {
      const value = 'https://example.org/community/viewtopic.php?t=latest'
      const options = { isAnyHost: true }

      expect(topicBoards.readUrl(value, options)).toBeUndefined()
    })

    it('should not read a row on a fixed host', () => {
      const value = 'https://example.com/boards/news'
      const options = { isAnyHost: true }

      expect(mixedBoards.readUrl(value, options)).toBeUndefined()
    })

    it('should find a root on a host the table does not list', () => {
      const value = 'https://example.org/blog/feed.xml'
      const options = { isAnyHost: true }
      const expected = {
        scheme: 'https',
        host: 'example.org',
        base: ['blog'],
      }
      const match = rooted.readUrl(value, options)

      expect(match?.values).toEqual(expected)
    })

    it('should return undefined on a table without hosts read with no option', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'

      expect(boards.readUrl(value)).toBeUndefined()
    })

    it('should return undefined on a table without hosts read with the option off', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = { isAnyHost: false }

      expect(boards.readUrl(value, options)).toBeUndefined()
    })

    it('should return undefined for a URL in a folder of a host the table lists', () => {
      const value = 'https://alice.example.net/blog/feed.xml'

      expect(rooted.readUrl(value)).toBeUndefined()
    })

    it('should read the host as a value on a table with hosts read with no option', () => {
      const value = 'https://alice.example.net/feed.xml'
      const expected = {
        scheme: 'https',
        host: 'alice.example.net',
      }
      const match = rooted.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should return no main URL for a URL only a read under a base takes', () => {
      const value = 'http://example.org/community/topic/5'

      expect(boards.getMainUrl(value)).toBeUndefined()
    })

    it('should try the bases of a path of 20,000 segments within a second', () => {
      const value = `https://example.org${'/segment'.repeat(20000)}/viewtopic.php?t=5`
      const options = { isAnyHost: true }
      const startedAt = performance.now()

      boards.readUrl(value, options)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should try a value of several segments on 20,000 segments within a second', () => {
      const value = `https://example.org${'/segment'.repeat(20000)}`
      const options = { isAnyHost: true }
      const startedAt = performance.now()

      fileFeeds.readUrl(value, options)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should try the bases of 200 kB of slashes within a second', () => {
      const value = `https://example.org/community${'/'.repeat(200000)}`
      const options = { isAnyHost: true }
      const startedAt = performance.now()

      boards.readUrl(value, options)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with a check of a row', () => {
    it('should read any value under a check left undefined', () => {
      const table = defineTable([
        { key: 'item', main: 'https://example.com/items/{id}', checks: { id: undefined } },
      ])
      const value = 'https://example.com/items/alice'
      const expected = { id: 'alice' }
      const match = table.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a value the check of the row takes', () => {
      const value = 'https://example.com/items/123'
      const expected = 'item'
      const match = rowChecked.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should return undefined for a value the check of the row refuses', () => {
      const value = 'https://example.com/items/alice'

      expect(rowChecked.readUrl(value)).toBeUndefined()
    })

    it('should read the same value on a row without the check', () => {
      const value = 'https://example.com/tags/alice'
      const expected = 'tag'
      const match = rowChecked.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should pass a value the check of the row refuses to a later row of the same shape', () => {
      const value = 'https://example.com/users/alice'
      const expected = { username: 'alice' }
      const match = rowChecked.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a value the check of the table and the check of the row both take', () => {
      const value = 'https://example.com/commits/5f3a9c1'
      const expected = 'commit'
      const match = rowChecked.readUrl(value)

      expect(match?.key).toBe(expected)
    })

    it('should return undefined for a value only the check of the table takes', () => {
      const value = 'https://example.com/commits/5f3a'

      expect(rowChecked.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a value only the check of the row takes', () => {
      const value = 'https://example.com/commits/zzzzzzz'

      expect(rowChecked.readUrl(value)).toBeUndefined()
    })

    it('should build a URL from a value the check of the row takes', () => {
      const value = { id: '123' }
      const expected = 'https://example.com/items/123'

      expect(rowChecked.buildUrl('item', value)).toBe(expected)
    })

    it('should build no URL from a value the check of the row refuses', () => {
      const value = { id: 'alice' }

      expect(rowChecked.buildUrl('item', value)).toBeUndefined()
    })

    it('should build no URL from a value only the check of the table takes', () => {
      const value = { hash: '5f3a' }

      expect(rowChecked.buildUrl('commit', value)).toBeUndefined()
    })

    it('should write a value as spelled where the check of the row refuses its lowercase', () => {
      const value = 'http://example.com/en-US/docs'
      const expected = 'https://example.com/en-US/docs'

      expect(rowChecked.getMainUrl(value)).toBe(expected)
    })

    it('should throw for a pattern with the g flag', () => {
      const throwing = () => {
        return defineTable([
          {
            key: 'item',
            main: 'https://example.com/items/{id}',
            checks: { id: globalDigitsRegex },
          },
        ])
      }

      expect(throwing).toThrow(
        'The check of id is a pattern with a g or y flag, which answers differently on a second call',
      )
    })

    it('should throw for a pattern with the y flag', () => {
      const throwing = () => {
        return defineTable([
          {
            key: 'item',
            main: 'https://example.com/items/{id}',
            checks: { id: stickyDigitsRegex },
          },
        ])
      }

      expect(throwing).toThrow(
        'The check of id is a pattern with a g or y flag, which answers differently on a second call',
      )
    })

    it('should throw for a pattern without ^ at its start', () => {
      const throwing = () => {
        return defineTable([
          {
            key: 'item',
            main: 'https://example.com/items/{id}',
            checks: { id: endAnchoredDigitsRegex },
          },
        ])
      }

      expect(throwing).toThrow(
        'The check of id is a pattern without ^ at its start and $ at its end',
      )
    })

    it('should throw for a pattern without $ at its end', () => {
      const throwing = () => {
        return defineTable([
          {
            key: 'item',
            main: 'https://example.com/items/{id}',
            checks: { id: startAnchoredDigitsRegex },
          },
        ])
      }

      expect(throwing).toThrow(
        'The check of id is a pattern without ^ at its start and $ at its end',
      )
    })

    it('should not let an edit of the checks of a row given change a read under a base', () => {
      const checks: Record<string, RegExp> = { topicId: digitsRegex }
      const table = defineTable([
        { key: 'topic', main: '{scheme}://{host}{/base*}/topic/{topicId}', checks },
      ])
      const value = 'https://example.org/topic/5f3a'
      const options = { isAnyHost: true }

      checks.topicId = hexRegex

      expect(table.readUrl(value, options)).toBeUndefined()
    })

    describe('on a host one row takes and another does not', () => {
      it('should read a row on a host its check takes', () => {
        const value = 'https://alice.example.com/feed'
        const expected = 'newsletter'
        const match = newsletters.readUrl(value)

        expect(match?.key).toBe(expected)
      })

      it('should return undefined for a row on a host its check refuses', () => {
        const value = 'https://api.example.com/feed'

        expect(newsletters.readUrl(value)).toBeUndefined()
      })

      it('should read another row on the host the check of the first row refuses', () => {
        const value = 'https://api.example.com/feed/podcast/123/private/5f3a.rss'
        const expected = 'private-podcast'
        const match = newsletters.readUrl(value)

        expect(match?.key).toBe(expected)
      })
    })

    describe('on rows that share a value of two kinds', () => {
      it('should read a value the check of the first row takes as that row', () => {
        const value = 'https://example.com/feeds/videos.xml?playlist_id=PL5f3a'
        const expected = 'playlist'
        const match = playlists.readUrl(value)

        expect(match?.key).toBe(expected)
      })

      it('should read a value the check of the first row refuses as the next row', () => {
        const value = 'https://example.com/feeds/videos.xml?playlist_id=UULF5f3a'
        const expected = 'videos'
        const match = playlists.readUrl(value)

        expect(match?.key).toBe(expected)
      })
    })

    describe('on a host whose root row is refused and whose path rows are built', () => {
      it('should read the root row on a host its check takes', () => {
        const value = 'https://alice.example.com/data/rss'
        const expected = 'posts'
        const match = journals.readUrl(value)

        expect(match?.key).toBe(expected)
      })

      it('should return undefined for the root row on the host its check refuses', () => {
        const value = 'https://asylums.example.com/data/rss'

        expect(journals.readUrl(value)).toBeUndefined()
      })

      it('should build the path row on the host the check of the root row refuses', () => {
        const value = {
          scheme: 'https',
          host: 'asylums.example.com',
          journal: 'alice',
        }
        const expected = 'https://asylums.example.com/alice/data/rss'

        expect(journals.buildUrl('posts', value)).toBe(expected)
      })

      it('should build no root row on the host its check refuses', () => {
        const value = {
          scheme: 'https',
          host: 'asylums.example.com',
        }

        expect(journals.buildUrl('posts', value)).toBeUndefined()
      })
    })

    describe('on a value one domain reads as another kind', () => {
      it('should read a year as a date on a domain the check takes it on', () => {
        const value = 'https://alice.example.com/2024/feed'
        const expected = 'date-archive'
        const match = archives.readUrl(value)

        expect(match?.key).toBe(expected)
      })

      it('should read a year as the next row on the domain the check refuses it on', () => {
        const value = 'https://alice.example.org/2024/feed'
        const expected = {
          scheme: 'https',
          host: 'alice.example.org',
          post: ['2024'],
        }
        const match = archives.readUrl(value)

        expect(match?.values).toEqual(expected)
      })

      it('should read a year and a month as a date on the domain that refuses a year', () => {
        const value = 'https://alice.example.org/2024/05/feed'
        const expected = 'date-archive'
        const match = archives.readUrl(value)

        expect(match?.key).toBe(expected)
      })

      it('should build no date row from a year on the domain the check refuses it on', () => {
        const value = {
          scheme: 'https',
          host: 'alice.example.org',
          date: '2024',
        }

        expect(archives.buildUrl('date-archive', value)).toBeUndefined()
      })
    })

    describe('under a base', () => {
      it('should return undefined for a base the check of the row refuses', () => {
        const value = 'https://example.org/archive/topic/5'
        const options = { isAnyHost: true }

        expect(rootChecked.readUrl(value, options)).toBeUndefined()
      })

      it('should read a row under a base its check takes', () => {
        const value = 'https://example.org/forum/topic/5'
        const options = { isAnyHost: true }
        const expected = {
          topicId: '5',
          scheme: 'https',
          host: 'example.org',
          base: ['forum'],
        }
        const match = rootChecked.readUrl(value, options)

        expect(match?.values).toEqual(expected)
      })

      it('should hand the base to a check beside the values read', () => {
        const value = 'https://example.org/forum/5/post/5'
        const options = { base: '/forum/5' }
        const expected = {
          postId: '5',
          scheme: 'https',
          host: 'example.org',
          base: ['forum', '5'],
        }
        const match = rootChecked.readUrl(value, options)

        expect(match?.values).toEqual(expected)
      })

      it('should return undefined for a value the check refuses under the base given', () => {
        const value = 'https://example.org/forum/5/post/7'
        const options = { base: '/forum/5' }

        expect(rootChecked.readUrl(value, options)).toBeUndefined()
      })
    })
  })

  describe('with fall-through', () => {
    it('should read a URL the first row takes as without the option', () => {
      const value = 'https://example.com/alice'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'profile',
        values: {
          username: 'alice',
        },
        row: {
          key: 'profile',
          main: 'https://example.com/{username}{/tail*}',
        },
        isAlias: false,
        isExact: true,
      }

      expect(fallThroughProfiles.readUrl(value)).toEqual(expected)
    })

    it('should read a URL whose values the checks of the deeper row take as that row', () => {
      const value = 'https://example.com/alice/my-channel'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'channel',
        values: {
          username: 'alice',
          channel: 'my-channel',
        },
        row: {
          key: 'channel',
          main: 'https://example.com/{username}/{channel}{/tail*}',
        },
        isAlias: false,
        isExact: true,
      }

      expect(fallThroughProfiles.readUrl(value)).toEqual(expected)
    })

    it('should pass a value the check of the table refuses to a row of another shape', () => {
      const value = 'https://example.com/alice/followers'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'profile',
        values: {
          username: 'alice',
        },
        row: {
          key: 'profile',
          main: 'https://example.com/{username}{/tail*}',
        },
        isAlias: false,
        isExact: false,
      }

      expect(fallThroughProfiles.readUrl(value)).toEqual(expected)
    })

    it('should read a URL with segments behind an open row as that row', () => {
      const value = 'https://example.com/alice/followers/x'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'profile',
        values: {
          username: 'alice',
        },
        row: {
          key: 'profile',
          main: 'https://example.com/{username}{/tail*}',
        },
        isAlias: false,
        isExact: false,
      }

      expect(fallThroughProfiles.readUrl(value)).toEqual(expected)
    })

    it('should pass a URL to the earlier of two rows of one depth', () => {
      const value = 'https://example.com/editorial/some-article'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'editorial',
        values: {},
        row: {
          key: 'editorial',
          main: 'https://example.com/editorial{/tail*}',
        },
        isAlias: false,
        isExact: false,
      }

      expect(fallThroughProfiles.readUrl(value)).toEqual(expected)
    })

    it('should pass a value the check of a row refuses to a row of another shape', () => {
      const value = 'https://example.com/alice/followers'
      const expected = {
        username: 'alice',
        view: ['followers'],
      }
      const match = fallThroughRowChecked.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should read a URL two open rows take as the one written first', () => {
      const value = 'https://example.com/alice/my-channel/about'
      const expected = {
        username: 'alice',
      }
      const match = fallThroughBlocks.readUrl(value)

      expect(match?.values).toEqual(expected)
    })

    it('should return undefined where no later row takes the URL', () => {
      const value = 'https://example.com/issues/alice'

      expect(fallThroughIssues.readUrl(value)).toBeUndefined()
    })

    it('should return undefined where the parameter refuses every later row too', () => {
      const value = 'https://example.com/feed?alt=json'

      expect(fallThroughSites.readUrl(value)).toBeUndefined()
    })

    it('should say whether the URL is written as the row that took it writes it', () => {
      const value = 'https://example.com/alice/followers'
      const match = fallThroughRowChecked.readUrl(value)

      expect(match?.isExact).toBe(true)
    })

    it('should write the main URL of the row that took the URL', () => {
      const value = 'http://example.com/alice/followers'
      const expected = 'https://example.com/alice/followers'

      expect(fallThroughRowChecked.getMainUrl(value)).toBe(expected)
    })

    it('should build no URL of another row from a value the check refuses', () => {
      const value = {
        username: 'alice',
        channel: 'followers',
      }

      expect(fallThroughRowChecked.buildUrl('channel', value)).toBeUndefined()
    })

    it('should read 300 rows that all refuse a value within a second', () => {
      const rows = Array.from({ length: 300 }, (_, index) => {
        return { key: 'item', main: `https://example.com/{username}?id${index}={id}` }
      })
      const table = defineTable(rows, { checks: { id: digitsRegex }, isFallThrough: true })
      const query = Array.from({ length: 300 }, (_, index) => `id${index}=alice`).join('&')
      const value = `https://example.com/alice?${query}`
      const startedAt = performance.now()

      table.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should read 300 rows that a parameter all refuses within a second', () => {
      const rows = Array.from({ length: 300 }, () => {
        return { key: 'page', main: 'https://example.com/{username}' }
      })
      const table = defineTable(
        [{ key: 'feed', main: 'https://example.com/{username}?view=feed' }, ...rows],
        { isFallThrough: true },
      )
      const value = 'https://example.com/alice?view=other'
      const startedAt = performance.now()

      table.readUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    describe('listed hosts', () => {
      const hostRows: Array<UrlRow> = [{ key: 'profile', main: '{scheme}://{host}/{username}' }]
      const subdomainRows: Array<UrlRow> = [
        { key: 'profile', main: 'https://blog.example.com/{username}' },
      ]
      const apexRows: Array<UrlRow> = [{ key: 'profile', main: 'https://example.com/{username}' }]
      const subdomainHosts = { exact: ['blog.example.com'] }
      const bothSubdomainHosts = { exact: ['blog.example.com', 'www.blog.example.com'] }

      it('should return undefined for www in front of a listed subdomain host', () => {
        const value = 'https://www.blog.example.com/alice'
        const table = defineTable(hostRows, { hosts: subdomainHosts, isFallThrough: true })

        expect(table.readUrl(value)).toBeUndefined()
      })

      it('should read www in front of a subdomain host where the list names it', () => {
        const value = 'https://www.blog.example.com/alice'
        const expected: Record<string, string> = {
          host: 'www.blog.example.com',
          username: 'alice',
          scheme: 'https',
        }
        const table = defineTable(hostRows, { hosts: bothSubdomainHosts, isFallThrough: true })
        const match = table.readUrl(value)

        expect(match?.values).toEqual(expected)
      })

      it('should read www in front of a listed apex host the list names without it', () => {
        const value = 'https://www.example.com/alice'
        const expected: Record<string, string> = {
          host: 'www.example.com',
          username: 'alice',
          scheme: 'https',
        }
        const table = defineTable(hostRows, {
          hosts: { exact: ['example.com'] },
          isFallThrough: true,
        })
        const match = table.readUrl(value)

        expect(match?.values).toEqual(expected)
      })

      it('should return undefined for www in front of the subdomain host a row writes', () => {
        const value = 'https://www.blog.example.com/alice'
        const table = defineTable(subdomainRows, { isFallThrough: true })

        expect(table.readUrl(value)).toBeUndefined()
      })

      it('should read www in front of the apex host a row writes', () => {
        const value = 'https://www.example.com/alice'
        const expected = 'https://example.com/alice'
        const table = defineTable(apexRows, { isFallThrough: true })

        expect(table.getMainUrl(value)).toBe(expected)
      })

      it('should read www in front of a listed subdomain host in a table without fall-through', () => {
        const value = 'https://www.blog.example.com/alice'
        const expected: Record<string, string> = {
          host: 'www.blog.example.com',
          username: 'alice',
          scheme: 'https',
        }
        const table = defineTable(hostRows, { hosts: subdomainHosts })
        const match = table.readUrl(value)

        expect(match?.values).toEqual(expected)
      })
    })

    describe('two values in one segment', () => {
      const rows: Array<UrlRow> = [{ key: 'post', main: 'https://example.com/posts/{id}-{slug}' }]
      const table = defineTable(rows, { checks: { id: digitsRegex }, isFallThrough: true })

      it('should end a value at the end of its check pattern', () => {
        const value = 'https://example.com/posts/123-my-first-post'
        const expected: Record<string, string> = {
          id: '123',
          slug: 'my-first-post',
        }
        const match = table.readUrl(value)

        expect(match?.values).toEqual(expected)
      })

      it('should read a value behind the fixed text by its check pattern', () => {
        const value = 'https://example.com/posts/my-first-post-123'
        const expected = {
          slug: 'my-first-post',
          id: '123',
        }
        const slugFirst = defineTable(
          [{ key: 'post', main: 'https://example.com/posts/{slug}-{id}' }],
          { checks: { id: digitsRegex }, isFallThrough: true },
        )
        const match = slugFirst.readUrl(value)

        expect(match?.values).toEqual(expected)
      })

      it('should read a value by the check pattern of its row', () => {
        const value = 'https://example.com/posts/123-my-first-post'
        const expected = {
          id: '123',
          slug: 'my-first-post',
        }
        const rowChecked = defineTable(
          [
            {
              key: 'post',
              main: 'https://example.com/posts/{id}-{slug}',
              checks: { id: digitsRegex },
            },
          ],
          { isFallThrough: true },
        )
        const match = rowChecked.readUrl(value)

        expect(match?.values).toEqual(expected)
      })

      it('should return undefined where the check pattern takes no part of the segment', () => {
        const value = 'https://example.com/posts/draft-my-first-post'

        expect(table.readUrl(value)).toBeUndefined()
      })

      it('should cut at the last fixed text where the check is a function', () => {
        const value = 'https://example.com/posts/123-my-first-post'
        const functionChecked = defineTable(rows, {
          checks: { id: (id) => digitsRegex.test(id) },
          isFallThrough: true,
        })

        expect(functionChecked.readUrl(value)).toBeUndefined()
      })

      it('should end a value at the end of its check pattern in a table without fall-through', () => {
        const value = 'https://example.com/posts/123-my-first-post'
        const expected: Record<string, string> = {
          id: '123',
          slug: 'my-first-post',
        }
        const strict = defineTable(rows, { checks: { id: digitsRegex } })
        const match = strict.readUrl(value)

        expect(match?.values).toEqual(expected)
      })

      it('should read a long run of the fixed text within a second', () => {
        const value = `https://example.com/posts/${'1-'.repeat(100000)}`
        const startedAt = performance.now()

        table.readUrl(value)

        expect(performance.now() - startedAt).toBeLessThan(1000)
      })
    })

    describe('under a base', () => {
      it('should pass a refused URL to the next row under the root before a longer root', () => {
        const value = 'https://example.org/alice/followers/x'
        const options = { isAnyHost: true }
        const expected: UrlMatch<string, UrlRow> = {
          key: 'profile',
          values: {
            username: 'alice',
            scheme: 'https',
            host: 'example.org',
          },
          row: {
            key: 'profile',
            main: '{scheme}://{host}{/base*}/{username}{/tail*}',
          },
          isAlias: false,
          isExact: false,
        }

        expect(fallThroughRootProfiles.readUrl(value, options)).toEqual(expected)
      })

      it('should pass a refused URL to the next row under the base given', () => {
        const value = 'https://example.org/forum/alice/followers'
        const options = { base: '/forum' }
        const expected: Record<string, UrlValue> = {
          username: 'alice',
          scheme: 'https',
          host: 'example.org',
          base: ['forum'],
        }
        const match = fallThroughRootProfiles.readUrl(value, options)

        expect(match?.values).toEqual(expected)
      })
    })

    describe('without the option', () => {
      it('should return undefined for a value the check refuses beside a row of another shape', () => {
        const value = 'https://example.com/alice/followers'

        expect(sameShapeProfiles.readUrl(value)).toBeUndefined()
      })

      it('should return undefined for a refused value with segments behind it', () => {
        const value = 'https://example.com/alice/followers/x'

        expect(sameShapeProfiles.readUrl(value)).toBeUndefined()
      })

      it('should return undefined for a refused value beside an earlier row of one depth', () => {
        const value = 'https://example.com/editorial/some-article'

        expect(sameShapeProfiles.readUrl(value)).toBeUndefined()
      })

      it('should return undefined for a parameter value no row of the key lists', () => {
        const value = 'https://example.com/feed?alt=json'

        expect(sameShapeSelected.readUrl(value)).toBeUndefined()
      })

      it('should read a URL refused under one base under a longer base', () => {
        const value = 'https://example.org/alice/followers/x'
        const options = { isAnyHost: true }
        const expected: Record<string, UrlValue> = {
          username: 'followers',
          channel: 'x',
          scheme: 'https',
          host: 'example.org',
          base: ['alice'],
        }
        const match = sameShapeRootProfiles.readUrl(value, options)

        expect(match?.values).toEqual(expected)
      })

      it('should return undefined for a URL refused under the base given', () => {
        const value = 'https://example.org/forum/alice/followers'
        const options = { base: '/forum' }

        expect(sameShapeRootProfiles.readUrl(value, options)).toBeUndefined()
      })
    })
  })
  describe('with a function among the hosts', () => {
    it('should read a tenant under a domain the function accepts', () => {
      const value = 'https://alice.example.co.uk/rss'
      const match = checkedTenants.readUrl(value)

      expect(match?.key).toBe('posts')
    })

    it('should return undefined for a tenant under a domain the function refuses', () => {
      const value = 'https://alice.example.net/rss'

      expect(checkedTenants.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for a tenant two labels under a domain the function accepts', () => {
      const value = 'https://alice.blog.example.de/rss'

      expect(checkedTenants.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for the domain the function accepts as a host', () => {
      const value = 'https://example.co.uk/rss'

      expect(checkedTenants.readUrl(value)).toBeUndefined()
    })

    it('should return undefined for www in front of the domain under a www tenant prefix', () => {
      const value = 'https://www.example.co.uk/rss'

      expect(checkedTenants.readUrl(value)).toBeUndefined()
    })

    it('should read www in front of a tenant under a www tenant prefix', () => {
      const value = 'https://www.alice.example.co.uk/rss'
      const match = checkedTenants.readUrl(value)

      expect(match?.key).toBe('posts')
    })

    it('should read a domain row on a domain the function accepts', () => {
      const value = 'https://example.de/about'
      const match = checkedTenants.readUrl(value)

      expect(match?.key).toBe('about')
    })

    it('should return undefined for a domain row on a domain the function refuses', () => {
      const value = 'https://example.net/about'

      expect(checkedTenants.readUrl(value)).toBeUndefined()
    })

    it('should build a domain row for a page under a domain the function accepts', () => {
      const value = 'https://alice.example.co.uk/'
      const expected = 'https://example.co.uk/about'
      const page = checkedTenants.forSite(value)

      expect(page?.buildUrl('about')).toBe(expected)
    })

    it('should build a URL on a host the function refuses', () => {
      const value = {
        scheme: 'https',
        host: 'example.net',
      }
      const expected = 'https://example.net/rss'

      expect(checkedTenants.buildUrl('posts', value)).toBe(expected)
    })

    it('should read an exact host the function accepts with www in front', () => {
      const value = 'https://www.example.de/jobs/feed'
      const match = checkedExact.readUrl(value)

      expect(match?.key).toBe('jobs')
    })

    it('should return undefined for a host under an exact host the function accepts', () => {
      const value = 'https://alice.example.de/jobs/feed'

      expect(checkedExact.readUrl(value)).toBeUndefined()
    })
  })
})

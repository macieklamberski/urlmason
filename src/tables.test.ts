import { describe, expect, it } from 'bun:test'
import { endsWithAnyOf, isAnyOf, isLocale } from 'trousse'
import type { UrlMatch, UrlRow, UrlValue } from '../types.js'
import { defineUrls } from './tables.js'

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
  { key: 'docs', main: 'https://www.example.com/{locale}/docs/{path*}' },
  { key: 'blog', main: 'https://{username}.example.org/feed' },
  { key: 'search', main: 'https://www.example.com/search?q={query}' },
]

const players = defineUrls(playerRows, {
  hosts: { tenants: ['example.org'] },
  checks: { locale: isLocale },
})

const spellings = defineUrls([
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

const rooted = defineUrls([{ key: 'site', main: '{root}/feed.xml', aliases: ['{root}/rss.xml'] }], {
  hosts: { tenants: ['example.net'] },
})

const wwwTenants = defineUrls(
  [
    { key: 'site', main: 'https://example.org/rss', aliases: ['https://example.org/rss.atom'] },
    { key: 'blog', main: '{scheme}://{host}/rss' },
  ],
  { hosts: { tenants: ['example.org'] }, isWwwTenant: true },
)

const hosted = defineUrls(
  [{ key: 'site', main: '{scheme}://{host}/feed.xml', aliases: ['{scheme}://{host}/rss.xml'] }],
  { hosts: { tenants: ['example.net'] } },
)

const paged = defineUrls(
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

const formats = defineUrls(
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

const unsorted = defineUrls([
  {
    key: 'search',
    main: 'https://example.com/feed?type=RSS&q={query}',
    aliases: ['https://old.example.com/feed?type=RSS&q={query}'],
  },
  { key: 'cased', main: 'https://example.com/list.rss?b=2&B=1&a={id}' },
  { key: 'site', main: '{root}/index.php?type=rss&format=feed' },
])

const routes = defineUrls([
  { key: 'posts', main: 'https://example.com/feed', aliases: ['https://example.com/rss'] },
  { key: 'comments', main: 'https://example.com/feed?type=comments' },
  { key: 'list', main: 'https://example.com/list?sort=new' },
  { key: 'list', main: 'https://example.com/list?sort={sort}' },
])

const sections = defineUrls([
  { key: 'posts', main: 'https://example.com/news/feed' },
  { key: 'comments', main: 'https://example.com/{section}/feed?type=comments' },
])

const wwwRoutes = defineUrls([
  { key: 'posts', main: 'https://www.example.com/feed' },
  { key: 'comments', main: 'https://example.com/feed?type=comments' },
])

const keptFormats = defineUrls(
  [
    { key: 'posts', main: 'https://example.com/feed' },
    { key: 'posts', main: 'https://example.com/feed?alt=rss' },
  ],
  { keptParams: ['alt'] },
)

const bare = defineUrls(
  [
    {
      key: 'feed',
      main: '{scheme}://feeds.example.com/{name}',
      aliases: ['{scheme}://old.example.com/{name}'],
    },
  ],
  { keptParams: [] },
)

const flaggedMain = defineUrls([
  {
    key: 'list',
    main: 'https://feeds.example.com/list.php?xml',
    aliases: ['https://example.com/list.rss'],
  },
])

const moved = defineUrls([
  {
    key: 'item',
    main: 'https://example.com/items?id={id}',
    aliases: ['https://example.com/item/{id}'],
  },
])

const marked = defineUrls(
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

const localized = defineUrls(
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

const listed = defineUrls([{ key: 'list', main: 'https://example.com/lists/{user}/{list}' }], {
  lenient: { case: ['user'] },
})

const ampersands = defineUrls(
  [{ key: 'agenda', main: 'https://example.com/Feed.ashx?M=LD&ID={id}&GUID={guid}' }],
  { lenient: { ampersandEntity: true } },
)

const unmarkedAmpersands = defineUrls([
  { key: 'agenda', main: 'https://example.com/Feed.ashx?M=LD&ID={id}&GUID={guid}' },
])

const ampersandRoutes = defineUrls(
  [
    { key: 'posts', main: 'https://example.com/feed' },
    { key: 'comments', main: 'https://example.com/feed?type=comments' },
  ],
  { lenient: { ampersandEntity: true }, keptParams: ['page'] },
)

const ampersandPairs = defineUrls(
  [
    { key: 'one', main: 'https://example.com/feed?a={a}' },
    { key: 'two', main: 'https://example.com/feed?a={a}&b={b}' },
  ],
  { lenient: { ampersandEntity: true } },
)

const ampersandTags = defineUrls(
  [
    { key: 'posts', main: 'https://example.com/feed' },
    { key: 'comments', main: 'https://example.com/feed?type=comments' },
    { key: 'tag', main: 'https://example.com/feed?tag={tag}&type=posts' },
  ],
  { lenient: { ampersandEntity: true } },
)

const ampersandItems = defineUrls(
  [
    { key: 'list', main: 'https://example.com/list' },
    { key: 'item', main: 'https://example.com/list?id={id}' },
  ],
  {
    checks: { id: (value) => digitsRegex.test(value) },
    lenient: { ampersandEntity: true },
  },
)
const movedBoards = defineUrls([
  {
    key: 'plain',
    main: 'https://example.com/plain/{board}_by_{user}',
    aliases: ['https://example.com/plain/{board}/{user}'],
  },
])

const tenantBlogs = defineUrls([
  {
    key: 'blog',
    main: 'https://{user}.example.com/feed',
    aliases: ['https://example.com/blogs/{user}/feed'],
  },
])

const ampersandAlias = defineUrls(
  [
    {
      key: 'feed',
      main: 'https://example.com/feed.rss?a={a}',
      aliases: ['https://example.com/old.rss?a={a}'],
    },
  ],
  { lenient: { ampersandEntity: true } },
)

const escapedName = defineUrls([
  {
    key: 'item',
    main: 'https://example.com/items?item%20id={id}',
    aliases: ['https://old.example.com/item/{id}'],
  },
])

const joined = defineUrls([{ key: 'plain', main: 'https://example.com/search?q={first}{second}' }])

const escapedFlag = defineUrls([
  {
    key: 'list',
    main: 'https://example.com/list?my%20flag',
    aliases: ['https://old.example.com/list'],
  },
])

const brokenName = defineUrls([{ key: 'item', main: 'https://example.com/items?id%FF={id}' }])

const brokenSecondName = defineUrls([
  {
    key: 'item',
    main: 'https://example.com/items?page={id}&id%FF={id}',
    aliases: ['https://old.example.com/item/{id}'],
  },
])

const mirrored = defineUrls([{ key: 'entry', main: 'https://{host}/feed/{id}' }], {
  hosts: { exact: [/(?<x>www2\.)?example\.com/] },
})

const mirroredMarked = defineUrls([{ key: 'entry', main: 'https://{host}/feed/{id}' }], {
  hosts: { exact: [/(?<x>www2\.)?example\.com/] },
  lenient: { case: ['id'] },
})

const mirroredQuery = defineUrls([{ key: 'entry', main: 'https://{host}/feed?id={id}' }], {
  hosts: { exact: [/(?<mirror>www2\.)?example\.com/] },
})

const escapedPercentName = defineUrls([
  {
    key: 'item',
    main: 'https://example.com/items?%25FF={id}',
    aliases: ['https://old.example.com/item/{id}'],
  },
])

const keptEscape = defineUrls([{ key: 'item', main: 'https://example.com/items/{id}' }], {
  keptParams: ['%FF'],
})

const versions = defineUrls(
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

const checkedPaths = defineUrls(
  [
    { key: 'user', main: 'https://example.com/{user}/feed' },
    { key: 'tag', main: 'https://example.com/{tag}/feed' },
    { key: 'page', main: 'https://example.com/{path*}' },
  ],
  {
    checks: {
      user: (value) => digitsRegex.test(value),
      tag: (value) => isAnyOf(value, ['news', 'tech']),
    },
  },
)

const checkedNameCase = defineUrls(
  [
    { key: 'atom', main: 'https://example.com/feed?Format={atomFormat}' },
    { key: 'rss', main: 'https://example.com/feed?format=rss_200' },
  ],
  { checks: { atomFormat: (value) => isAnyOf(value, 'atom') } },
)

const checkedByRegex = defineUrls(
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

const movedFormat = defineUrls([
  {
    key: 'posts',
    main: 'https://example.com/feed?alt=rss',
    aliases: ['https://old.example.com/feed'],
  },
])

const percentName = defineUrls([
  {
    key: 'entry',
    main: 'https://example.com/entries?rate%25={id}',
    aliases: ['https://old.example.com/entry/{id}'],
  },
])

const spaceAndPlusNames = defineUrls([
  {
    key: 'item',
    main: 'https://example.com/items?a%2Bb={id}&a%20b={other}',
    aliases: ['https://old.example.com/item/{id}/{other}'],
  },
])

const letterAndEscapeNames = defineUrls([
  {
    key: 'item',
    main: 'https://example.com/items?A={id}&%2541={other}',
    aliases: ['https://old.example.com/item/{id}/{other}'],
  },
])

const percentFlag = defineUrls([
  {
    key: 'list',
    main: 'https://example.com/list?rate%25',
    aliases: ['https://old.example.com/list'],
  },
])

const renamed = defineUrls([
  {
    key: 'item',
    main: 'https://example.com/items?id={id}',
    aliases: ['https://example.com/legacy?i={id}'],
  },
])

const movedVersion = defineUrls([
  {
    key: 'posts',
    main: 'https://example.com/feed?v=2',
    aliases: ['https://old.example.com/feed'],
  },
])

const sharedPages = defineUrls([
  { key: 'page', main: 'https://example.com/pages/{board}-{user}-{page}.xml' },
  { key: 'search', main: 'https://example.com/search?q={board}-{user}-{page}.xml' },
])

const openPages = defineUrls([
  { key: 'user', main: 'https://example.com/{owner}/{*}' },
  { key: 'repo', main: 'https://example.com/{owner}/{repo}/{*}' },
  { key: 'releases', main: 'https://example.com/{owner}/{repo}/releases' },
])

const checkedOpenPages = defineUrls(
  [{ key: 'issue', main: 'https://example.com/issues/{id}/{*}' }],
  { checks: { id: digitsRegex } },
)

const tailCheckedPages = defineUrls([
  {
    key: 'issue',
    main: 'https://example.com/issues/{id}/{*}',
    checks: { tail: /^(?:comments\/5|café)$/ },
  },
])

const boards = defineUrls(
  [
    { key: 'topic', main: '{root}/viewtopic.php?t={topicId}', aliases: ['{root}/topic/{topicId}'] },
    { key: 'tag', main: '{root}/tag/{*}' },
    { key: 'explore', main: '{root}/explore' },
    { key: 'member', main: '{root}/{group}/{member}' },
  ],
  { checks: { topicId: digitsRegex } },
)

type BoardMatch = NonNullable<ReturnType<typeof boards.read>>

const topicBoards = defineUrls([{ key: 'topic', main: '{root}/viewtopic.php?t={topicId}' }], {
  checks: { topicId: digitsRegex },
})

const openBoards = defineUrls([
  { key: 'page', main: '{root}/{*}' },
  { key: 'topic', main: '{root}/viewtopic.php?t={topicId}' },
])

const mixedBoards = defineUrls([
  { key: 'board', main: 'https://example.com/boards/{board}', aliases: ['{root}/board/{board}'] },
  { key: 'topic', main: '{root}/viewtopic.php?t={topicId}' },
])

const fileFeeds = defineUrls([{ key: 'file', main: '{root}/{path*}.atom' }])

const sevenCharactersRegex = /^.{7}$/
const yearRegex = /^\d{4}$/
const dateRegex = /^\d{4}(?:\/\d{2}){0,2}$/
const uploadsListRegex = /^UULF/

const rowChecked = defineUrls(
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

const newsletters = defineUrls(
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
  { hosts: { tenants: ['example.com'] } },
)

const playlists = defineUrls([
  {
    key: 'playlist',
    main: 'https://example.com/feeds/videos.xml?playlist_id={playlistId}',
    checks: { playlistId: (playlistId) => !uploadsListRegex.test(playlistId) },
  },
  { key: 'videos', main: 'https://example.com/feeds/videos.xml?playlist_id={playlistId}' },
])

const journals = defineUrls(
  [
    { key: 'posts', main: '{scheme}://{host}/{journal}/data/rss', isBuildOnly: true },
    {
      key: 'posts',
      main: '{scheme}://{host}/data/rss',
      checks: { host: (host) => host !== 'asylums.example.com' },
    },
  ],
  { hosts: { exact: ['asylums.example.com'], tenants: ['example.com'] } },
)

const archives = defineUrls(
  [
    {
      key: 'date-archive',
      main: '{scheme}://{host}/{date*}/feed',
      checks: {
        date: (date, { host }) => !(yearRegex.test(date) && endsWithAnyOf(host, '.example.org')),
      },
    },
    { key: 'post-comments', main: '{scheme}://{host}/{post*}/feed' },
  ],
  { hosts: { tenants: ['example.com', 'example.org'] }, checks: { date: dateRegex } },
)

const rootChecked = defineUrls([
  {
    key: 'topic',
    main: '{root}/topic/{topicId}',
    checks: { root: (root) => !endsWithAnyOf(root, '/archive') },
  },
  {
    key: 'post',
    main: '{root}/post/{postId}',
    checks: { postId: (postId, { root }) => endsWithAnyOf(root, `/${postId}`) },
  },
])

const profileViews = ['followers', 'following']

const isChannel = (value: string): boolean => {
  return !isAnyOf(value, profileViews)
}

const profileRows: Array<UrlRow> = [
  { key: 'editorial', main: 'https://example.com/editorial/{*}' },
  { key: 'channel', main: 'https://example.com/{username}/{channel}/{*}' },
  { key: 'profile', main: 'https://example.com/{username}/{*}' },
]

const profileChecks = {
  username: (value: string) => !isAnyOf(value, 'editorial'),
  channel: isChannel,
}

const fallThroughProfiles = defineUrls(profileRows, { checks: profileChecks, isFallThrough: true })

const sameShapeProfiles = defineUrls(profileRows, { checks: profileChecks })

const fallThroughRowChecked = defineUrls(
  [
    {
      key: 'channel',
      main: 'https://example.com/{username}/{channel}',
      checks: { channel: isChannel },
    },
    { key: 'view', main: 'https://example.com/{username}/{view*}' },
  ],
  { isFallThrough: true },
)

const fallThroughIssues = defineUrls(
  [
    { key: 'issue', main: 'https://example.com/issues/{id}/{*}' },
    { key: 'home', main: 'https://example.com' },
  ],
  { checks: { id: digitsRegex }, isFallThrough: true },
)

const fallThroughBlocks = defineUrls(
  [
    { key: 'profile', main: 'https://example.com/{username}/{*}' },
    { key: 'channel', main: 'https://example.com/{username}/{channel}/{*}' },
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
  { key: 'site', main: 'https://example.com/{*}' },
]

const sameShapeSelected = defineUrls(selectedRows)

const fallThroughSites = defineUrls(selectedRows.slice(0, 3), { isFallThrough: true })

const rootProfileRows: Array<UrlRow> = [
  { key: 'channel', main: '{root}/{username}/{channel}/{*}', checks: { channel: isChannel } },
  { key: 'profile', main: '{root}/{username}/{*}' },
]

const fallThroughRootProfiles = defineUrls(rootProfileRows, { isFallThrough: true })

const sameShapeRootProfiles = defineUrls(rootProfileRows)

const checkedDomains = ['example.de', 'example.co.uk']

const isCheckedDomain = (domain: string): boolean => {
  return isAnyOf(domain, checkedDomains)
}

const checkedTenants = defineUrls(
  [
    { key: 'posts', main: '{scheme}://{host}/rss' },
    { key: 'about', main: '{scheme}://{domain}/about' },
  ],
  { hosts: { tenants: [isCheckedDomain] }, isWwwTenantPrefix: true },
)

const checkedExact = defineUrls([{ key: 'jobs', main: '{scheme}://{host}/jobs/feed' }], {
  hosts: { exact: [isCheckedDomain] },
})

describe('defineUrls', () => {
  describe('rows', () => {
    it('should return the rows it was given', () => {
      expect(players.rows).toEqual(playerRows)
    })

    it('should read a URL as the same row after the returned rows are reversed', () => {
      const table = defineUrls([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const value = 'https://example.com/comments/feed'
      const expected = 'comments'

      table.rows.reverse()

      const match = table.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a URL as the same row after the key of a returned row is edited', () => {
      const table = defineUrls<UrlRow>([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const value = 'https://example.com/feed'
      const expected = 'posts'

      table.rows[0].key = 'comments'

      const match = table.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should build the URL of a key after the key of a returned row is edited', () => {
      const table = defineUrls<UrlRow>([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const expected = 'https://example.com/feed'

      table.rows[0].key = 'comments'

      expect(table.build('posts')).toBe(expected)
    })

    it('should read a URL as the same row after the key of a row it was given is edited', () => {
      const rows: Array<UrlRow> = [
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ]
      const table = defineUrls(rows)
      const value = 'https://example.com/feed'
      const expected = 'posts'

      rows[0].key = 'comments'

      const match = table.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a URL as the same row after the key of a row it read is edited', () => {
      const table = defineUrls<UrlRow>([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const value = 'https://example.com/feed'
      const expected = 'posts'
      const first = table.read(value)

      if (first) {
        first.row.key = 'comments'
      }

      const match = table.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should lowercase a value after the case list of the table options is emptied', () => {
      const lenient = { case: ['user'] }
      const table = defineUrls([{ key: 'posts', main: 'https://example.com/{user}/feed' }], {
        lenient,
      })
      const value = 'https://example.com/Alice/feed'
      const expected = 'https://example.com/alice/feed'

      lenient.case.pop()

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should read a URL as the same row after a selector edits the key of its row', () => {
      const table = defineUrls([
        { key: 'posts', main: 'https://example.com/feed' },
        { key: 'comments', main: 'https://example.com/comments/feed' },
      ])
      const value = 'https://example.com/feed'
      const expected = 'posts'
      const select = (row: UrlRow) => {
        row.key = 'comments'

        return true
      }

      table.build('posts', {}, select)

      const match = table.read(value)

      expect(match?.key).toBe(expected)
    })
  })

  describe('read', () => {
    it('should return the key, the values and the row of a main URL', () => {
      const value = 'https://www.example.com/embed/x8abc'
      const expected: UrlMatch<string, PlayerRow> = {
        key: 'video',
        params: { videoId: 'x8abc' },
        row: playerRows[0],
        isAlias: false,
        isExact: true,
      }

      expect(players.read(value)).toEqual(expected)
    })

    it('should mark a URL as exact on a host whose pattern leaves a group of its own unset', () => {
      const value = 'https://example.com/feed/5'
      const match = mirrored.read(value)

      expect(match?.isExact).toBe(true)
    })

    it('should read a query value on a host whose pattern sets a group of its own', () => {
      const value = 'https://www2.example.com/feed?id=5'
      const expected = {
        host: 'www2.example.com',
        id: '5',
      }
      const match = mirroredQuery.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should mark a URL an alias takes', () => {
      const value = 'https://example.net/x8abc'
      const match = players.read(value)

      expect(match?.isAlias).toBe(true)
    })

    it('should return a field a row adds at its root', () => {
      const value = 'https://example.net/x8abc'
      const expected = '16/9'
      const match = players.read(value)

      expect(match?.row.ratio).toBe(expected)
    })

    it('should mark a URL with its fixed text in another case as not exact', () => {
      const value = 'https://www.example.com/EMBED/x8abc'
      const match = players.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should mark a URL with a trailing slash the row does not write as not exact', () => {
      const value = 'https://www.example.com/embed/x8abc/'
      const match = players.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should mark a URL under another scheme and without www as exact', () => {
      const value = 'http://example.com/embed/x8abc'
      const match = players.read(value)

      expect(match?.isExact).toBe(true)
    })

    it('should read a value from the query', () => {
      const value = 'https://www.example.com/player?video=x8abc&autoplay=1'
      const expected = { videoId: 'x8abc' }
      const match = players.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a multi-segment value under its bare name', () => {
      const value = 'https://www.example.com/pt-BR/docs/api/v2'
      const expected = {
        locale: 'pt-BR',
        path: ['api', 'v2'],
      }
      const match = players.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a tenant label', () => {
      const value = 'https://alice.example.org/feed'
      const expected = { username: 'alice' }
      const match = players.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a path value decoded', () => {
      const value = 'https://www.example.com/embed/caf%C3%A9'
      const expected = { videoId: 'café' }
      const match = players.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a host with its port', () => {
      const value = 'https://alice.example.net:8080/feed.xml'
      const expected = {
        host: 'alice.example.net:8080',
        scheme: 'https',
      }
      const match = hosted.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should return undefined for a URL no row takes', () => {
      const value = 'https://www.example.com/about/team/history'

      expect(players.read(value)).toBeUndefined()
    })

    it('should return undefined for a value its check refuses', () => {
      const value = 'https://www.example.com/abcd/docs/api'

      expect(players.read(value)).toBeUndefined()
    })
  })

  describe('build', () => {
    it('should write the main URL of a key', () => {
      const value = { videoId: 'x8abc' }
      const expected = 'https://www.example.com/embed/x8abc'

      expect(players.build('video', value)).toBe(expected)
    })

    it('should return undefined when the selector takes no row of the key', () => {
      const value = { videoId: 'x8abc' }
      const select = (row: PlayerRow) => row.ratio === '4/3'

      expect(players.build('video', value, select)).toBeUndefined()
    })

    it('should throw for a key the table does not hold, whatever the selector', () => {
      const value = { videoId: 'x8abc' }
      const select = (row: PlayerRow) => row.ratio === '4/3'
      const throwing = () => players.build('unknown', value, select)

      expect(throwing).toThrow('No feed template for unknown')
    })

    it('should return undefined for a selector that tells a row by identity', () => {
      const rows: Array<UrlRow> = [
        { key: 'item', main: 'https://example.com/items/{id}.rss' },
        { key: 'item', main: 'https://example.com/items/{id}.atom' },
      ]
      const table = defineUrls(rows)
      const value = { id: '7' }
      const select = (row: UrlRow) => row === rows[1]

      expect(table.build('item', value, select)).toBeUndefined()
    })

    it('should write a host label in lowercase', () => {
      const table = defineUrls([{ key: 'journal', main: 'https://{journal}.example.com/feed' }])
      const value = { journal: 'Alice' }
      const expected = 'https://alice.example.com/feed'

      expect(table.build('journal', value)).toBe(expected)
    })

    it('should write a value under the case mark in lowercase', () => {
      const value = {
        user: 'Alice',
        list: 'Reading',
      }
      const expected = 'https://example.com/lists/alice/Reading'

      expect(listed.build('list', value)).toBe(expected)
    })

    it('should keep a letter outside ASCII under the case mark as written', () => {
      const value = {
        user: 'CAFÉ',
        list: 'Reading',
      }
      const expected = 'https://example.com/lists/caf%C3%89/Reading'

      expect(listed.build('list', value)).toBe(expected)
    })

    it('should keep a value under the case mark whose check refuses the lowercase', () => {
      const value = { locale: 'en-US' }
      const expected = 'https://example.com/en-US/feed'

      expect(localized.build('posts', value)).toBe(expected)
    })

    it('should build nothing from a host label with a space', () => {
      const table = defineUrls([{ key: 'journal', main: 'https://{journal}.example.com/feed' }])
      const value = { journal: 'a b' }

      expect(table.build('journal', value)).toBeUndefined()
    })

    it('should build nothing from a host label holding a slash', () => {
      const table = defineUrls([{ key: 'journal', main: 'https://{journal}.example.com/feed' }])
      const value = { journal: 'attacker.example/x' }

      expect(table.build('journal', value)).toBeUndefined()
    })

    it('should build nothing from a host label holding an at sign', () => {
      const table = defineUrls([{ key: 'journal', main: 'https://{journal}.example.com/feed' }])
      const value = { journal: 'user@attacker' }

      expect(table.build('journal', value)).toBeUndefined()
    })

    it('should build nothing from a root holding a query', () => {
      const table = defineUrls([{ key: 'site', main: '{root}/feed' }])
      const value = { root: 'https://attacker.example?x=https://example.com' }

      expect(table.build('site', value)).toBeUndefined()
    })

    it('should write back the URL it read', () => {
      const value = 'https://www.example.com/embed/caf%C3%A9'
      const match = players.read(value)

      expect(players.build('video', match?.params)).toBe(value)
    })

    it('should sort the query by name, the parameters the row sets included', () => {
      const value = { query: 'feeds' }
      const expected = 'https://example.com/feed?q=feeds&type=RSS'

      expect(unsorted.build('search', value)).toBe(expected)
    })

    it('should keep the order of one name in two cases', () => {
      const value = { id: '7' }
      const expected = 'https://example.com/list.rss?a=7&b=2&B=1'

      expect(unsorted.build('cased', value)).toBe(expected)
    })

    it('should throw for a placeholder as a parameter name', () => {
      const value = [{ key: 'list', main: 'https://example.com/list?{query}' }]
      const throwing = () => defineUrls(value)

      expect(throwing).toThrow('Not a feed URL template: https://example.com/list?{query}')
    })

    it('should throw for a placeholder as a parameter name whose braces the row escapes', () => {
      const value = [{ key: 'list', main: 'https://example.com/{user}/list?%7Bquery%7D' }]
      const throwing = () => defineUrls(value)

      expect(throwing).toThrow(
        'Not a feed URL template: https://example.com/{user}/list?%7Bquery%7D',
      )
    })

    it('should throw for a parameter the row names twice', () => {
      const value = [{ key: 'search', main: 'https://example.com/search?types=page&types=post' }]
      const throwing = () => defineUrls(value)

      expect(throwing).toThrow(
        'Not a feed URL template: https://example.com/search?types=page&types=post',
      )
    })

    it('should write a URL the main URL of its row leaves alone', () => {
      const value = unsorted.build('search', { query: 'feeds' }) ?? ''

      expect(unsorted.getMainUrl(value)).toBeUndefined()
    })

    it('should escape a character split across two values of one query value', () => {
      const value = {
        first: 'a\ud83d',
        second: '\ude00b',
      }
      const expected = 'https://example.com/search?q=a%F0%9F%98%80b'

      expect(joined.build('plain', value)).toBe(expected)
    })

    it('should write a value that is no text as its text', () => {
      const value = { id: true }
      const expected = 'https://example.com/items?id=true'

      // @ts-expect-error: This is for testing purposes.
      expect(moved.build('item', value)).toBe(expected)
    })
  })

  describe('buildAll', () => {
    it('should list the main URL and every alias the values fill', () => {
      const value = { videoId: 'x8abc' }
      const expected = [
        'https://www.example.com/embed/x8abc',
        'https://example.net/x8abc',
        'https://www.example.com/player?video=x8abc',
      ]

      expect(players.buildAll('video', value)).toEqual(expected)
    })

    it('should sort the query of every URL by name', () => {
      const value = { query: 'feeds' }
      const expected = [
        'https://example.com/feed?q=feeds&type=RSS',
        'https://old.example.com/feed?q=feeds&type=RSS',
      ]

      expect(unsorted.buildAll('search', value)).toEqual(expected)
    })

    it('should return no URL when the values fill no row of the key', () => {
      const value = {}
      const expected: Array<string> = []

      expect(players.buildAll('video', value)).toEqual(expected)
    })
  })

  describe('forUrl', () => {
    it('should sort the query of a URL built for a page', () => {
      const value = 'https://example.com/about'
      const expected = 'https://example.com/index.php?format=feed&type=rss'
      const page = unsorted.forUrl(value)

      expect(page?.build('site')).toBe(expected)
    })

    it('should sort the query of every URL built for a page', () => {
      const value = 'https://example.com/about'
      const expected = ['https://example.com/index.php?format=feed&type=rss']
      const page = unsorted.forUrl(value)

      expect(page?.buildAll('site')).toEqual(expected)
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
      expect(unsorted.build('search', params)).toBe(expected)
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
      const match = moved.read(value)

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

    it('should write an alias on a root', () => {
      const value = 'https://alice.example.net/rss.xml'
      const expected = 'https://alice.example.net/feed.xml'

      expect(rooted.getMainUrl(value)).toBe(expected)
    })

    it('should write a main URL on a root under http as https', () => {
      const value = 'http://alice.example.net/feed.xml'
      const expected = 'https://alice.example.net/feed.xml'

      expect(rooted.getMainUrl(value)).toBe(expected)
    })

    it('should write a slash before the query of a main URL with no path', () => {
      const table = defineUrls(
        [{ key: 'site', main: '{root}?format=feed', aliases: ['{root}/index.php?format=feed'] }],
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

      const main = formats.read(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should return undefined for a value no row lists', () => {
      const value = 'https://example.com/feed?alt=rss2'

      expect(formats.read(value)).toBeUndefined()
    })

    it('should read a listed value in another case', () => {
      const value = 'https://example.com/feed?ALT=RSS'
      const expected = 'https://example.com/feed?alt=rss'
      const main = formats.read(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should return undefined for a value no row lists under a name in another case', () => {
      const value = 'https://example.com/feed?ALT=rss2'

      expect(formats.read(value)).toBeUndefined()
    })

    it('should return undefined for a listed value beside one no row lists', () => {
      const value = 'https://example.com/feed?alt=rss&alt=rss2'

      expect(formats.read(value)).toBeUndefined()
    })

    it('should return undefined for a value no row lists on an alias', () => {
      const value = 'https://example.com/rss.xml?alt=rss2'

      expect(formats.read(value)).toBeUndefined()
    })

    it('should read an alias with the value its row sets', () => {
      const value = 'https://example.com/rss.xml?alt=rss'
      const expected = 'https://example.com/feed?alt=rss'

      expect(formats.getMainUrl(value)).toBe(expected)
    })

    it('should read a URL with a parameter no row sets', () => {
      const value = 'https://example.com/feed?page=2'
      const expected = 'https://example.com/feed'

      const main = formats.read(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should return undefined for a value only a row of another key on the path sets', () => {
      const value = 'https://example.com/feed?type=other'

      expect(routes.read(value)).toBeUndefined()
    })

    it('should return no main URL for a value only a row of another key on the path sets', () => {
      const value = 'http://example.com/feed?type=other'

      expect(routes.getMainUrl(value)).toBeUndefined()
    })

    it('should read any value on a row that takes the parameter as a value', () => {
      const value = 'https://example.com/list?sort=old'
      const expected = 'https://example.com/list?sort={sort}'
      const main = routes.read(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should read any value of a parameter the table keeps', () => {
      const value = 'https://example.com/feed?alt=rss2'
      const expected = 'https://example.com/feed'
      const main = keptFormats.read(value)?.row.main

      expect(main).toBe(expected)
    })

    it('should return no main URL for an alias whose parameter picks another row on the main path', () => {
      const value = 'https://example.com/rss?type=comments'

      expect(routes.getMainUrl(value)).toBeUndefined()
    })

    it('should read a parameter another path sets as a parameter of no row', () => {
      const value = 'https://example.com/list?sort=new&type=other'
      const expected = 'list'
      const key = routes.read(value)?.key

      expect(key).toBe(expected)
    })

    it('should return undefined for a value a template with a placeholder path sets', () => {
      const value = 'https://example.com/news/feed?type=other'

      expect(sections.read(value)).toBeUndefined()
    })

    it('should return undefined for a value a template on the host without www sets, given with www', () => {
      const value = 'https://www.example.com/feed?type=other'

      expect(wwwRoutes.read(value)).toBeUndefined()
    })

    it('should return undefined for a value a template on the host without www sets', () => {
      const value = 'https://example.com/feed?type=other'

      expect(wwwRoutes.read(value)).toBeUndefined()
    })

    it('should read 200 kB of a listed value within a second', () => {
      const value = `https://example.com/feed?alt=rss${'&alt=rss'.repeat(25000)}`
      const startedAt = performance.now()

      formats.read(value)

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
      const match = flaggedMain.read(value)

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
      const match = flaggedMain.read(value)

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

  describe('with the case mark', () => {
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
      const table = defineUrls([{ key: 'user', main: 'https://example.com/users/{user}' }], {
        // @ts-expect-error: The case mark takes a list of placeholder names.
        lenient: { case: true },
      })
      const value = 'https://example.com/users/Alice'

      expect(table.getMainUrl(value)).toBeUndefined()
    })

    it('should throw for a marked value that shares a host label with another value', () => {
      const throwing = () => {
        return defineUrls(
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
        return defineUrls(
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
        return defineUrls(
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
        return defineUrls([{ key: 'board', main: 'https://example.com/{board}_by_{user}' }], {
          lenient: { case: ['user'] },
        })
      }

      expect(throwing).toThrow(
        'The board row marks the case of user, which shares a part of its URL with another value',
      )
    })

    it('should throw for a marked value in a template with two values of several segments', () => {
      const throwing = () => {
        return defineUrls(
          [
            {
              key: 'thread',
              main: 'https://example.com/{board*}/feed/{thread*}',
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
      const match = ampersands.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should refuse 8 MB of query on a host no row names within 50 ms', () => {
      const value = `https://other.example.org/Feed.ashx?${'ID=7&'.repeat(1600000)}`
      const startedAt = performance.now()

      ampersands.read(value)

      expect(performance.now() - startedAt).toBeLessThan(50)
    })

    it('should write &amp; between query pairs as &', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&amp;ID=7&amp;GUID=a1b2'
      const expected = 'https://example.com/Feed.ashx?GUID=a1b2&ID=7&M=LD'

      expect(ampersands.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for &amp; on a row without the mark', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&amp;ID=7&amp;GUID=a1b2'

      expect(unmarkedAmpersands.read(value)).toBeUndefined()
    })

    it('should throw for a name that starts with amp; behind another parameter', () => {
      const throwing = () => {
        return defineUrls([{ key: 'list', main: 'https://example.com/list.rss?a=1&amp;x=1' }], {
          lenient: { ampersandEntity: true },
        })
      }

      expect(throwing).toThrow(
        'The list row sets amp;x, which the ampersand mark reads as another parameter',
      )
    })

    it('should build a parameter name that holds amp; behind other letters', () => {
      const table = defineUrls(
        [{ key: 'list', main: 'https://example.com/list.rss?stamp;x=1&a=1' }],
        {
          lenient: { ampersandEntity: true },
        },
      )
      const expected = 'https://example.com/list.rss?a=1&stamp;x=1'

      expect(table.build('list')).toBe(expected)
    })

    it('should throw for a row whose own parameter name starts with amp;', () => {
      const throwing = () => {
        return defineUrls([{ key: 'list', main: 'https://example.com/list.rss?amp;x=1&a=1' }], {
          lenient: { ampersandEntity: true },
        })
      }

      expect(throwing).toThrow(
        'The list row sets amp;x, which the ampersand mark reads as another parameter',
      )
    })

    it('should build a parameter name that starts with amp; on a row without the mark', () => {
      const table = defineUrls([{ key: 'list', main: 'https://example.com/list.rss?amp;x=1&a=1' }])
      const expected = 'https://example.com/list.rss?a=1&amp;x=1'

      expect(table.build('list')).toBe(expected)
    })

    it('should write &amp; as & in a query that is sorted already', () => {
      const value = 'https://example.com/Feed.ashx?GUID=a1b2&amp;ID=7&amp;M=LD'
      const expected = 'https://example.com/Feed.ashx?GUID=a1b2&ID=7&M=LD'

      expect(ampersands.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a selector after &amp; under a value no row lists', () => {
      const value = 'https://example.com/feed?page=2&amp;type=other'

      expect(ampersandRoutes.read(value)).toBeUndefined()
    })

    it('should return undefined for a URL the row takes only with &amp; left unread', () => {
      const value = 'https://example.com/Feed.ashx?page=2&amp;M=CL&M=LD&ID=7&GUID=a1b2'

      expect(ampersands.read(value)).toBeUndefined()
    })

    it('should return undefined for a value after &amp; that the check of a marked row refuses', () => {
      const value = 'https://example.com/list?page=2&amp;id=news'

      expect(ampersandItems.read(value)).toBeUndefined()
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
      const match = ampersandPairs.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should mark a URL with &amp; on a row without the mark as exact', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&ID=7&GUID=a1b2&amp;x=3'
      const match = unmarkedAmpersands.read(value)

      expect(match?.isExact).toBe(true)
    })

    it('should return no main URL for an alias whose first pair starts with amp;', () => {
      const value = 'https://example.com/old.rss?amp;x=2&a=1'

      expect(ampersandAlias.getMainUrl(value)).toBeUndefined()
    })

    it('should not mark an alias whose first pair starts with amp; as exact', () => {
      const value = 'https://example.com/old.rss?amp;x=2&a=1'
      const match = ampersandAlias.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should read an encoded &amp; inside a value as part of the value', () => {
      const value = 'https://example.com/feed?tag=A%26amp;B&amp;type=posts'
      const expected: Record<string, string> = { tag: 'A&amp;B' }
      const match = ampersandTags.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should write an encoded &amp; inside a value as written', () => {
      const value = 'https://example.com/feed?tag=A%26amp;B&amp;type=posts'
      const expected = 'https://example.com/feed?tag=A%26amp;B&type=posts'

      expect(ampersandTags.getMainUrl(value)).toBe(expected)
    })

    it('should not read an entity in capitals as &', () => {
      const value = 'https://example.com/feed?tag=a&AMP;type=posts&amp;z=1'
      const expected = 'posts'
      const match = ampersandTags.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should not read a string as the ampersand entity mark', () => {
      const table = defineUrls([{ key: 'feed', main: 'https://example.com/feed?a={a}&b={b}' }], {
        // @ts-expect-error: The ampersand entity mark is a boolean.
        lenient: { ampersandEntity: 'yes' },
      })
      const value = 'https://example.com/feed?a=1&amp;b=2'

      expect(table.read(value)).toBeUndefined()
    })

    it('should read 200 kB of &amp; within a second', () => {
      const value = `https://example.com/Feed.ashx?M=LD${'&amp;ID=7'.repeat(22000)}`
      const startedAt = performance.now()

      ampersands.read(value)

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
      const table = defineUrls([{ key: 'posts', main: 'https://example.com/posts.xml?id={id}' }], {
        keptParams: ['max results'],
      })
      const value = 'https://example.com/posts.xml?ref=home&max+results=5&id=7'
      const expected = 'https://example.com/posts.xml?id=7&max+results=5'

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a main URL with an own parameter given again with +', () => {
      const table = defineUrls([{ key: 'posts', main: 'https://example.com/posts.xml?id={id}' }], {
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
      const match = escapedName.read(value)

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
      const match = escapedName.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should leave a flag the alias gives with an equals sign as the main URL escapes it', () => {
      const value = 'https://old.example.com/list?my%20flag='
      const expected = 'https://example.com/list?my%20flag'

      expect(escapedFlag.getMainUrl(value)).toBe(expected)
    })

    it('should not mark a name with an escape that is no UTF-8 as exact', () => {
      const value = 'https://example.com/items?id%FF=5'
      const match = brokenName.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should not mark a name given twice, once with an escape that is no UTF-8, as exact', () => {
      const value = 'https://example.com/items?id%FF=1&id%EF%BF%BD=5'
      const match = brokenName.read(value)

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
      const throwing = () => defineUrls(value)

      expect(throwing).toThrow('Not a feed URL template: https://example.com/items??id={id}')
    })

    it('should throw for an alias whose query opens with a second question mark', () => {
      const value = [
        {
          key: 'posts',
          main: 'https://example.com/feed',
          aliases: ['https://old.example.com/feed??alt=rss'],
        },
      ]
      const throwing = () => defineUrls(value)

      expect(throwing).toThrow('Not a feed URL template: https://old.example.com/feed??alt=rss')
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
      const match = sharedPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a later value that ends in the fixed text', () => {
      const value = 'https://example.com/pages/art-alice--2.xml'
      const expected = {
        board: 'art',
        user: 'alice-',
        page: '2',
      }
      const match = sharedPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a later value of a query value that ends in the fixed text', () => {
      const value = 'https://example.com/search?q=art-alice--2.xml'
      const expected = {
        board: 'art',
        user: 'alice-',
        page: '2',
      }
      const match = sharedPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should return undefined for a segment that leaves a value empty', () => {
      const value = 'https://example.com/pages/art--2.xml'

      expect(sharedPages.read(value)).toBeUndefined()
    })

    it('should read 200 kB of the fixed text in a segment within a second', () => {
      const value = `https://example.com/pages/${'-'.repeat(200000)}.xm`
      const startedAt = performance.now()

      sharedPages.read(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should read 200 kB of the fixed text in a query value within a second', () => {
      const value = `https://example.com/search?q=${'-'.repeat(200000)}.xm`
      const startedAt = performance.now()

      sharedPages.read(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with rows that differ by a checked value', () => {
    it('should read the main URL of a row behind another row with a checked value', () => {
      const value = 'https://example.com/feed?format=rss_200'
      const match = versions.read(value)

      expect(match?.key).toBe('rss')
    })

    it('should read a value the check of a later row takes', () => {
      const value = 'https://example.com/feed?format=rss2'
      const match = versions.read(value)

      expect(match?.key).toBe('rss')
    })

    it('should write a value the check of a later row takes as that row writes it', () => {
      const value = 'https://example.com/feed?format=rss2'
      const expected = 'https://example.com/feed?format=rss_200'

      expect(versions.getMainUrl(value)).toBe(expected)
    })

    it('should read a path value the check of a later row takes', () => {
      const value = 'https://example.com/news/feed'
      const match = checkedPaths.read(value)

      expect(match?.key).toBe('tag')
    })

    it('should return undefined for a path value no check takes beside an open path', () => {
      const value = 'https://example.com/other/feed'

      expect(checkedPaths.read(value)).toBeUndefined()
    })

    it('should read a row whose parameter name is in another letter case', () => {
      const value = 'https://example.com/feed?format=rss_200'
      const match = checkedNameCase.read(value)

      expect(match?.key).toBe('rss')
    })
  })

  describe('with a pattern as a check', () => {
    it('should read a value the pattern takes', () => {
      const value = 'https://example.com/items/123'
      const match = checkedByRegex.read(value)

      expect(match?.key).toBe('item')
    })

    it('should return undefined for a value the pattern refuses', () => {
      const value = 'https://example.com/items/alice'

      expect(checkedByRegex.read(value)).toBeUndefined()
    })

    it('should build a URL from a value the pattern takes', () => {
      const value = { id: '123' }
      const expected = 'https://example.com/items/123'

      expect(checkedByRegex.build('item', value)).toBe(expected)
    })

    it('should build no URL from a value the pattern refuses', () => {
      const value = { id: 'alice' }

      expect(checkedByRegex.build('item', value)).toBeUndefined()
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
      const match = checkedByRegex.read(value)

      expect(match?.key).toBe('commit')
    })

    it('should read a value a function takes beside a pattern', () => {
      const value = 'https://example.com/tags/news'
      const match = checkedByRegex.read(value)

      expect(match?.key).toBe('tag')
    })

    it('should return undefined for a value a function refuses beside a pattern', () => {
      const value = 'https://example.com/tags/sports'

      expect(checkedByRegex.read(value)).toBeUndefined()
    })

    it('should throw for a pattern with the g flag', () => {
      const throwing = () => {
        return defineUrls([{ key: 'item', main: 'https://example.com/items/{id}' }], {
          checks: { id: globalDigitsRegex },
        })
      }

      expect(throwing).toThrow(
        'The check of id is a pattern with a g or y flag, which answers differently on a second call',
      )
    })

    it('should throw for a pattern with the y flag', () => {
      const throwing = () => {
        return defineUrls([{ key: 'item', main: 'https://example.com/items/{id}' }], {
          checks: { id: stickyDigitsRegex },
        })
      }

      expect(throwing).toThrow(
        'The check of id is a pattern with a g or y flag, which answers differently on a second call',
      )
    })

    it('should throw for a pattern without ^ at its start', () => {
      const throwing = () => {
        return defineUrls([{ key: 'item', main: 'https://example.com/items/{id}' }], {
          checks: { id: endAnchoredDigitsRegex },
        })
      }

      expect(throwing).toThrow(
        'The check of id is a pattern without ^ at its start and $ at its end',
      )
    })

    it('should throw for a pattern without $ at its end', () => {
      const throwing = () => {
        return defineUrls([{ key: 'item', main: 'https://example.com/items/{id}' }], {
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
      const match = moved.read(value)

      if (match) {
        match.params.id = '7'
      }

      const nextMatch = moved.read(value)

      expect(nextMatch?.params).toEqual(expected)
    })

    it('should ask a check again for a URL it read before', () => {
      const state = { isAllowed: true }
      const table = defineUrls([{ key: 'item', main: 'https://example.com/items?id={id}' }], {
        checks: { id: () => state.isAllowed },
      })
      const value = 'https://example.com/items?id=5'

      table.read(value)
      state.isAllowed = false

      expect(table.read(value)).toBeUndefined()
    })

    it('should write the main URL of a URL it read before', () => {
      const value = 'https://example.com/item/5'
      const expected = 'https://example.com/items?id=5'

      moved.read(value)

      expect(moved.getMainUrl(value)).toBe(expected)
    })
  })

  describe('with an escaped percent sign or slash in a value', () => {
    const tags = defineUrls([
      { key: 'tag', main: 'https://example.com/tag/{tag}' },
      { key: 'tag-feed', main: 'https://example.com/data/rss?tag={tag}' },
      { key: 'docs', main: 'https://example.com/docs/{path*}' },
    ])

    it('should read an escaped percent sign in a path value decoded', () => {
      const value = 'https://example.com/tag/100%25'
      const expected = { tag: '100%' }
      const match = tags.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read an escaped slash in a path value decoded', () => {
      const value = 'https://example.com/tag/a%2Fb'
      const expected = { tag: 'a/b' }
      const match = tags.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should write a path value with a percent sign read from a path into a query once', () => {
      const value = 'https://example.com/tag/100%25'
      const expected = 'https://example.com/data/rss?tag=100%25'
      const match = tags.read(value)

      expect(tags.build('tag-feed', match?.params)).toBe(expected)
    })

    it('should write a path value with a slash read from a path into a query once', () => {
      const value = 'https://example.com/tag/a%2Fb'
      const expected = 'https://example.com/data/rss?tag=a/b'
      const match = tags.read(value)

      expect(tags.build('tag-feed', match?.params)).toBe(expected)
    })

    it('should write back a path value with a percent sign it read', () => {
      const value = 'https://example.com/tag/100%25'
      const match = tags.read(value)

      expect(tags.build('tag', match?.params)).toBe(value)
    })

    it('should write back a path value with a slash it read', () => {
      const value = 'https://example.com/tag/a%2Fb'
      const match = tags.read(value)

      expect(tags.build('tag', match?.params)).toBe(value)
    })

    it('should read an escaped slash inside one segment of a multi-segment value decoded', () => {
      const value = 'https://example.com/docs/guides/a%2Fb'
      const expected = { path: ['guides', 'a/b'] }
      const match = tags.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should write each segment of a multi-segment value once', () => {
      const value = { path: ['guides', 'a/b', '100%'] }
      const expected = 'https://example.com/docs/guides/a%2Fb/100%25'

      expect(tags.build('docs', value)).toBe(expected)
    })

    it('should write a multi-segment value given as text at its slashes', () => {
      const value = { path: 'guides/a' }
      const expected = 'https://example.com/docs/guides/a'

      expect(tags.build('docs', value)).toBe(expected)
    })

    it('should write no value of one segment given as a list', () => {
      const value = { tag: ['a', 'b'] }

      expect(tags.build('tag', value)).toBeUndefined()
    })

    it('should read a query value with a percent sign and an ampersand decoded', () => {
      const value = 'https://example.com/data/rss?tag=R%26D%20100%25'
      const expected = { tag: 'R&D 100%' }
      const match = tags.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should write a query value with a percent sign and an ampersand once', () => {
      const value = { tag: 'R&D 100%' }
      const expected = 'https://example.com/data/rss?tag=R%26D%20100%25'

      expect(tags.build('tag-feed', value)).toBe(expected)
    })
  })

  describe('with an open tail', () => {
    it('should read a URL with no segment behind the path without a tail', () => {
      const value = 'https://example.com/acme/app'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a trailing slash behind the path without a tail', () => {
      const value = 'https://example.com/acme/app/'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should leave the tail out of the values read', () => {
      const value = 'https://example.com/acme/app/issues/12'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should check a tail as its segments joined by a slash, without the empty ones', () => {
      const value = 'https://example.com/issues/12//comments//5/'
      const expected = 'issue'
      const match = tailCheckedPages.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should return undefined for a tail its check refuses', () => {
      const value = 'https://example.com/issues/12/history'

      expect(tailCheckedPages.read(value)).toBeUndefined()
    })

    it('should check a tail with its segments decoded', () => {
      const value = 'https://example.com/issues/12/caf%C3%A9'
      const expected = 'issue'
      const match = tailCheckedPages.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a URL with a query no row names', () => {
      const value = 'https://example.com/acme/app/issues/12?page=2'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read slashes alone behind the path without a tail', () => {
      const value = 'https://example.com/acme/app///'
      const expected = {
        owner: 'acme',
        repo: 'app',
      }
      const match = openPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a longer last segment as the value and not as a tail', () => {
      const value = 'https://example.com/acme/application'
      const expected = {
        owner: 'acme',
        repo: 'application',
      }
      const match = openPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a URL a row without a tail takes as that row, written behind the open one', () => {
      const value = 'https://example.com/acme/app/releases'
      const expected = 'releases'
      const match = openPages.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a URL two open rows take as the deeper one, written behind the other', () => {
      const value = 'https://example.com/acme/app/issues'
      const expected = 'repo'
      const match = openPages.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should read a value its check takes in front of a tail', () => {
      const value = 'https://example.com/issues/12/comments'
      const expected = {
        id: '12',
      }
      const match = checkedOpenPages.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should return undefined for a value its check refuses in front of a tail', () => {
      const value = 'https://example.com/issues/alice/comments'

      expect(checkedOpenPages.read(value)).toBeUndefined()
    })

    it('should build the URL without a tail', () => {
      const value = {
        owner: 'acme',
        repo: 'app',
      }
      const expected = 'https://example.com/acme/app'

      expect(openPages.build('repo', value)).toBe(expected)
    })

    it('should not write a tail given as a value', () => {
      const value = {
        owner: 'acme',
        repo: 'app',
        tail: ['issues', '12'],
      }
      const expected = 'https://example.com/acme/app'

      expect(openPages.build('repo', value)).toBe(expected)
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
      const match = openPages.read(value)

      expect(match?.isExact).toBe(true)
    })

    it('should not mark a URL with a tail as exact', () => {
      const value = 'https://example.com/acme/app/issues/12'
      const match = openPages.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should throw for an open tail in front of another segment', () => {
      const throwing = () => {
        return defineUrls([{ key: 'repo', main: 'https://example.com/{owner}/{*}/issues' }])
      }

      expect(throwing).toThrow(
        'The repo row writes {*} elsewhere than at the end of its path, behind a slash',
      )
    })

    it('should throw for an open tail with no slash in front of it', () => {
      const throwing = () => {
        return defineUrls([{ key: 'repo', main: 'https://example.com/{owner}/{repo}{*}' }])
      }

      expect(throwing).toThrow(
        'The repo row writes {*} elsewhere than at the end of its path, behind a slash',
      )
    })

    it('should throw for an open tail in the host', () => {
      const throwing = () => {
        return defineUrls([{ key: 'repo', main: 'https://{*}.example.com/{owner}' }])
      }

      expect(throwing).toThrow(
        'The repo row writes {*} elsewhere than at the end of its path, behind a slash',
      )
    })

    it('should throw for an open tail in the query', () => {
      const throwing = () => {
        return defineUrls([{ key: 'repo', main: 'https://example.com/{owner}?tab={*}' }])
      }

      expect(throwing).toThrow(
        'The repo row writes {*} elsewhere than at the end of its path, behind a slash',
      )
    })

    it('should throw for two open tails in one path', () => {
      const throwing = () => {
        return defineUrls([{ key: 'repo', main: 'https://example.com/{owner}/{*}/{*}' }])
      }

      expect(throwing).toThrow(
        'The repo row writes {*} elsewhere than at the end of its path, behind a slash',
      )
    })

    it('should throw for an open tail in a path with a value of several segments', () => {
      const throwing = () => {
        return defineUrls([{ key: 'docs', main: 'https://example.com/docs/{page*}/edit/{*}' }])
      }

      expect(throwing).toThrow(
        'The docs row writes {*} in a path with page, which takes several segments, so the two are split by a guess',
      )
    })

    it('should throw for a value named tail beside an open tail', () => {
      const throwing = () => {
        return defineUrls([{ key: 'repo', main: 'https://example.com/{tail}/{*}' }])
      }

      expect(throwing).toThrow('The repo row names a value tail, which {*} is read as')
    })

    it('should read a path of 20,000 segments within a second', () => {
      const value = `https://example.com${'/segment'.repeat(20000)}`
      const startedAt = performance.now()

      openPages.read(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should read 200 kB of slashes behind the path within a second', () => {
      const value = `https://example.com/acme/app${'/'.repeat(200000)}`
      const startedAt = performance.now()

      openPages.read(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with a root given', () => {
    it('should read a URL under a root with no base path', () => {
      const value = 'https://example.org/viewtopic.php?t=5'
      const options = { root: 'https://example.org' }
      const expected: BoardMatch = {
        key: 'topic',
        params: {
          topicId: '5',
          root: 'https://example.org',
        },
        row: {
          key: 'topic',
          main: '{root}/viewtopic.php?t={topicId}',
          aliases: ['{root}/topic/{topicId}'],
        },
        isAlias: false,
        isExact: false,
      }

      expect(boards.read(value, options)).toEqual(expected)
    })

    it('should read a URL under a root with a base path', () => {
      const value = 'https://example.org/community/explore'
      const options = { root: 'https://example.org/community' }
      const expected = { root: 'https://example.org/community' }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read a query value under a root', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = { root: 'https://example.org/community' }
      const expected = {
        topicId: '5',
        root: 'https://example.org/community',
      }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read an open tail under a root', () => {
      const value = 'https://example.org/community/tag/news/2024'
      const options = { root: 'https://example.org/community' }
      const expected = {
        root: 'https://example.org/community',
      }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should mark a URL an alias reads under a root as an alias', () => {
      const value = 'https://example.org/community/topic/5'
      const options = { root: 'https://example.org/community' }
      const match = boards.read(value, options)

      expect(match?.isAlias).toBe(true)
    })

    it('should mark a root alias of a row whose main URL names a host as an alias', () => {
      const value = 'https://example.org/community/board/news'
      const options = { root: 'https://example.org/community' }
      const match = mixedBoards.read(value, options)

      expect(match?.isAlias).toBe(true)
    })

    it('should read a URL under http under a root under https', () => {
      const value = 'http://example.org/community/explore'
      const options = { root: 'https://example.org/community' }
      const expected = { root: 'https://example.org/community' }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read a URL on www under a root without it', () => {
      const value = 'https://www.example.org/community/explore'
      const options = { root: 'https://example.org/community' }
      const expected = { root: 'https://example.org/community' }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read a URL without www under a root on www', () => {
      const value = 'https://example.org/community/explore'
      const options = { root: 'https://www.example.org/community' }
      const expected = { root: 'https://www.example.org/community' }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read a URL under a root on the same port', () => {
      const value = 'https://example.org:8080/community/explore'
      const options = { root: 'https://example.org:8080/community' }
      const expected = { root: 'https://example.org:8080/community' }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should return the host of a root in lowercase', () => {
      const value = 'https://example.org/community/explore'
      const options = { root: 'https://EXAMPLE.org/community' }
      const expected = { root: 'https://example.org/community' }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read a base path in another letter case than the root has', () => {
      const value = 'https://example.org/Community/explore'
      const options = { root: 'https://example.org/community' }
      const expected = { root: 'https://example.org/community' }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read a base path the root writes with an escape', () => {
      const value = 'https://example.org/~alice/explore'
      const options = { root: 'https://example.org/%7Ealice' }
      const expected = { root: 'https://example.org/%7Ealice' }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should return a root given with a trailing slash without it', () => {
      const value = 'https://example.org/community/explore'
      const options = { root: 'https://example.org/community/' }
      const expected = { root: 'https://example.org/community' }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should build a URL under the root from the values read', () => {
      const value = 'https://example.org/community/topic/5'
      const options = { root: 'https://example.org/community' }
      const expected = 'https://example.org/community/viewtopic.php?t=5'
      const match = boards.read(value, options)
      const topicUrl = boards.forUrl(value)?.build('topic', match?.params)

      expect(topicUrl).toBe(expected)
    })

    it('should return undefined for a URL under another base path', () => {
      const value = 'https://example.org/forum/explore'
      const options = { root: 'https://example.org/community' }

      expect(boards.read(value, options)).toBeUndefined()
    })

    it('should return undefined for a base path that only starts a longer segment', () => {
      const value = 'https://example.org/forums/explore'
      const options = { root: 'https://example.org/forum' }

      expect(boards.read(value, options)).toBeUndefined()
    })

    it('should return undefined for a URL on another host', () => {
      const value = 'https://example.org/community/explore'
      const options = { root: 'https://example.net/community' }

      expect(boards.read(value, options)).toBeUndefined()
    })

    it('should return undefined for a URL on another port', () => {
      const value = 'https://example.org:8080/community/explore'
      const options = { root: 'https://example.org/community' }

      expect(boards.read(value, options)).toBeUndefined()
    })

    it('should return undefined for a value its check refuses under a root', () => {
      const value = 'https://example.org/community/viewtopic.php?t=latest'
      const options = { root: 'https://example.org/community' }

      expect(boards.read(value, options)).toBeUndefined()
    })

    it('should return undefined for a root that is no URL', () => {
      const value = 'https://example.org/community/explore'
      const options = { root: '/community' }

      expect(boards.read(value, options)).toBeUndefined()
    })

    it('should read under the root given and not under the one the URL shows', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = {
        root: 'https://example.org',
        isAnyHost: true,
      }

      expect(topicBoards.read(value, options)).toBeUndefined()
    })

    it('should not read a row on a fixed host under a root', () => {
      const value = 'https://example.com/boards/news'
      const options = { root: 'https://example.com' }

      expect(mixedBoards.read(value, options)).toBeUndefined()
    })

    it('should read a URL on a host the table does not list', () => {
      const value = 'https://example.org/blog/feed.xml'
      const options = { root: 'https://example.org/blog' }
      const expected = { root: 'https://example.org/blog' }
      const match = rooted.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read a URL on a host the table lists without the host as a value', () => {
      const value = 'https://alice.example.net/blog/feed.xml'
      const options = { root: 'https://alice.example.net/blog' }
      const expected = { root: 'https://alice.example.net/blog' }
      const match = rooted.read(value, options)

      expect(match?.params).toEqual(expected)
    })
  })

  describe('with a root the URL shows', () => {
    it('should find a root with no base path', () => {
      const value = 'https://example.org/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected: BoardMatch = {
        key: 'topic',
        params: {
          topicId: '5',
          root: 'https://example.org',
        },
        row: {
          key: 'topic',
          main: '{root}/viewtopic.php?t={topicId}',
          aliases: ['{root}/topic/{topicId}'],
        },
        isAlias: false,
        isExact: false,
      }

      expect(boards.read(value, options)).toEqual(expected)
    })

    it('should find a root with one segment of base path', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        root: 'https://example.org/community',
      }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should find a root with two segments of base path', () => {
      const value = 'https://example.org/sites/community/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        root: 'https://example.org/sites/community',
      }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should find a root with eight segments of base path', () => {
      const value = 'https://example.org/a/b/c/d/e/f/g/h/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        root: 'https://example.org/a/b/c/d/e/f/g/h',
      }
      const match = topicBoards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should return undefined for a root with nine segments of base path', () => {
      const value = 'https://example.org/a/b/c/d/e/f/g/h/i/viewtopic.php?t=5'
      const options = { isAnyHost: true }

      expect(topicBoards.read(value, options)).toBeUndefined()
    })

    it('should find a root with a port', () => {
      const value = 'https://example.org:8080/community/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        root: 'https://example.org:8080/community',
      }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should return a base path with an escape as the URL writes it', () => {
      const value = 'https://example.org/%7Ealice/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = {
        topicId: '5',
        root: 'https://example.org/%7Ealice',
      }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should take the shortest root a row reads the URL under', () => {
      const value = 'https://example.org/tag/tag/news'
      const options = { isAnyHost: true }
      const expected = {
        root: 'https://example.org',
      }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read an open tail under the root it finds', () => {
      const value = 'https://example.org/community/tag/news/2024'
      const options = { isAnyHost: true }
      const expected = {
        root: 'https://example.org/community',
      }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read a row with fixed text under a longer root before a row of values alone', () => {
      const value = 'https://example.org/git/explore'
      const options = { isAnyHost: true }
      const expected = 'explore'
      const match = boards.read(value, options)

      expect(match?.key).toBe(expected)
    })

    it('should read a row with fixed text under a longer root before a row of an open tail alone', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = { isAnyHost: true }
      const expected = 'topic'
      const match = openBoards.read(value, options)

      expect(match?.key).toBe(expected)
    })

    it('should read a row of values alone where no row with fixed text reads the URL', () => {
      const value = 'https://example.org/staff/alice'
      const options = { isAnyHost: true }
      const expected = {
        group: 'staff',
        member: 'alice',
        root: 'https://example.org',
      }
      const match = boards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should read a row of an open tail alone at the origin', () => {
      const value = 'https://example.org/community/about'
      const options = { isAnyHost: true }
      const expected = {
        root: 'https://example.org',
      }
      const match = openBoards.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should build a URL under the root it finds from the values read', () => {
      const value = 'https://example.org/community/topic/5'
      const options = { isAnyHost: true }
      const expected = 'https://example.org/community/viewtopic.php?t=5'
      const match = boards.read(value, options)
      const topicUrl = boards.forUrl(value)?.build('topic', match?.params)

      expect(topicUrl).toBe(expected)
    })

    it('should return undefined for a value its check refuses under every root', () => {
      const value = 'https://example.org/community/viewtopic.php?t=latest'
      const options = { isAnyHost: true }

      expect(topicBoards.read(value, options)).toBeUndefined()
    })

    it('should not read a row on a fixed host', () => {
      const value = 'https://example.com/boards/news'
      const options = { isAnyHost: true }

      expect(mixedBoards.read(value, options)).toBeUndefined()
    })

    it('should find a root on a host the table does not list', () => {
      const value = 'https://example.org/blog/feed.xml'
      const options = { isAnyHost: true }
      const expected = { root: 'https://example.org/blog' }
      const match = rooted.read(value, options)

      expect(match?.params).toEqual(expected)
    })

    it('should return undefined on a table without hosts read with no option', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'

      expect(boards.read(value)).toBeUndefined()
    })

    it('should return undefined on a table without hosts read with the option off', () => {
      const value = 'https://example.org/community/viewtopic.php?t=5'
      const options = { isAnyHost: false }

      expect(boards.read(value, options)).toBeUndefined()
    })

    it('should read the host as a value on a table with hosts read with no option', () => {
      const value = 'https://alice.example.net/feed.xml'
      const expected = {
        host: 'alice.example.net',
        root: 'https://alice.example.net',
      }
      const match = rooted.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should return no main URL for a URL only a read under a root takes', () => {
      const value = 'http://example.org/community/topic/5'

      expect(boards.getMainUrl(value)).toBeUndefined()
    })

    it('should try the roots of a path of 20,000 segments within a second', () => {
      const value = `https://example.org${'/segment'.repeat(20000)}/viewtopic.php?t=5`
      const options = { isAnyHost: true }
      const startedAt = performance.now()

      boards.read(value, options)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should try a value of several segments on 20,000 segments within a second', () => {
      const value = `https://example.org${'/segment'.repeat(20000)}`
      const options = { isAnyHost: true }
      const startedAt = performance.now()

      fileFeeds.read(value, options)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should try the roots of 200 kB of slashes within a second', () => {
      const value = `https://example.org/community${'/'.repeat(200000)}`
      const options = { isAnyHost: true }
      const startedAt = performance.now()

      boards.read(value, options)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })
  })

  describe('with a check of a row', () => {
    it('should read a value the check of the row takes', () => {
      const value = 'https://example.com/items/123'
      const expected = 'item'
      const match = rowChecked.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should return undefined for a value the check of the row refuses', () => {
      const value = 'https://example.com/items/alice'

      expect(rowChecked.read(value)).toBeUndefined()
    })

    it('should read the same value on a row without the check', () => {
      const value = 'https://example.com/tags/alice'
      const expected = 'tag'
      const match = rowChecked.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should pass a value the check of the row refuses to a later row of the same shape', () => {
      const value = 'https://example.com/users/alice'
      const expected = { username: 'alice' }
      const match = rowChecked.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a value the check of the table and the check of the row both take', () => {
      const value = 'https://example.com/commits/5f3a9c1'
      const expected = 'commit'
      const match = rowChecked.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should return undefined for a value only the check of the table takes', () => {
      const value = 'https://example.com/commits/5f3a'

      expect(rowChecked.read(value)).toBeUndefined()
    })

    it('should return undefined for a value only the check of the row takes', () => {
      const value = 'https://example.com/commits/zzzzzzz'

      expect(rowChecked.read(value)).toBeUndefined()
    })

    it('should build a URL from a value the check of the row takes', () => {
      const value = { id: '123' }
      const expected = 'https://example.com/items/123'

      expect(rowChecked.build('item', value)).toBe(expected)
    })

    it('should build no URL from a value the check of the row refuses', () => {
      const value = { id: 'alice' }

      expect(rowChecked.build('item', value)).toBeUndefined()
    })

    it('should build no URL from a value only the check of the table takes', () => {
      const value = { hash: '5f3a' }

      expect(rowChecked.build('commit', value)).toBeUndefined()
    })

    it('should write a value as spelled where the check of the row refuses its lowercase', () => {
      const value = 'http://example.com/en-US/docs'
      const expected = 'https://example.com/en-US/docs'

      expect(rowChecked.getMainUrl(value)).toBe(expected)
    })

    it('should throw for a pattern with the g flag', () => {
      const throwing = () => {
        return defineUrls([
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
        return defineUrls([
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
        return defineUrls([
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
        return defineUrls([
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

    it('should not let an edit of the checks of a row given change a read under a root', () => {
      const checks: Record<string, RegExp> = { topicId: digitsRegex }
      const table = defineUrls([{ key: 'topic', main: '{root}/topic/{topicId}', checks }])
      const value = 'https://example.org/topic/5f3a'
      const options = { isAnyHost: true }

      checks.topicId = hexRegex

      expect(table.read(value, options)).toBeUndefined()
    })

    describe('on a host one row takes and another does not', () => {
      it('should read a row on a host its check takes', () => {
        const value = 'https://alice.example.com/feed'
        const expected = 'newsletter'
        const match = newsletters.read(value)

        expect(match?.key).toBe(expected)
      })

      it('should return undefined for a row on a host its check refuses', () => {
        const value = 'https://api.example.com/feed'

        expect(newsletters.read(value)).toBeUndefined()
      })

      it('should read another row on the host the check of the first row refuses', () => {
        const value = 'https://api.example.com/feed/podcast/123/private/5f3a.rss'
        const expected = 'private-podcast'
        const match = newsletters.read(value)

        expect(match?.key).toBe(expected)
      })
    })

    describe('on rows that share a value of two kinds', () => {
      it('should read a value the check of the first row takes as that row', () => {
        const value = 'https://example.com/feeds/videos.xml?playlist_id=PL5f3a'
        const expected = 'playlist'
        const match = playlists.read(value)

        expect(match?.key).toBe(expected)
      })

      it('should read a value the check of the first row refuses as the next row', () => {
        const value = 'https://example.com/feeds/videos.xml?playlist_id=UULF5f3a'
        const expected = 'videos'
        const match = playlists.read(value)

        expect(match?.key).toBe(expected)
      })
    })

    describe('on a host whose root row is refused and whose path rows are built', () => {
      it('should read the root row on a host its check takes', () => {
        const value = 'https://alice.example.com/data/rss'
        const expected = 'posts'
        const match = journals.read(value)

        expect(match?.key).toBe(expected)
      })

      it('should return undefined for the root row on the host its check refuses', () => {
        const value = 'https://asylums.example.com/data/rss'

        expect(journals.read(value)).toBeUndefined()
      })

      it('should build the path row on the host the check of the root row refuses', () => {
        const value = {
          scheme: 'https',
          host: 'asylums.example.com',
          journal: 'alice',
        }
        const expected = 'https://asylums.example.com/alice/data/rss'

        expect(journals.build('posts', value)).toBe(expected)
      })

      it('should build no root row on the host its check refuses', () => {
        const value = {
          scheme: 'https',
          host: 'asylums.example.com',
        }

        expect(journals.build('posts', value)).toBeUndefined()
      })
    })

    describe('on a value one domain reads as another kind', () => {
      it('should read a year as a date on a domain the check takes it on', () => {
        const value = 'https://alice.example.com/2024/feed'
        const expected = 'date-archive'
        const match = archives.read(value)

        expect(match?.key).toBe(expected)
      })

      it('should read a year as the next row on the domain the check refuses it on', () => {
        const value = 'https://alice.example.org/2024/feed'
        const expected = {
          scheme: 'https',
          host: 'alice.example.org',
          post: ['2024'],
        }
        const match = archives.read(value)

        expect(match?.params).toEqual(expected)
      })

      it('should read a year and a month as a date on the domain that refuses a year', () => {
        const value = 'https://alice.example.org/2024/05/feed'
        const expected = 'date-archive'
        const match = archives.read(value)

        expect(match?.key).toBe(expected)
      })

      it('should build no date row from a year on the domain the check refuses it on', () => {
        const value = {
          scheme: 'https',
          host: 'alice.example.org',
          date: '2024',
        }

        expect(archives.build('date-archive', value)).toBeUndefined()
      })
    })

    describe('under a root', () => {
      it('should return undefined for a root the check of the row refuses', () => {
        const value = 'https://example.org/archive/topic/5'
        const options = { isAnyHost: true }

        expect(rootChecked.read(value, options)).toBeUndefined()
      })

      it('should read a row under a root its check takes', () => {
        const value = 'https://example.org/forum/topic/5'
        const options = { isAnyHost: true }
        const expected = {
          topicId: '5',
          root: 'https://example.org/forum',
        }
        const match = rootChecked.read(value, options)

        expect(match?.params).toEqual(expected)
      })

      it('should hand the root to a check beside the values read', () => {
        const value = 'https://example.org/forum/5/post/5'
        const options = { root: 'https://example.org/forum/5' }
        const expected = {
          postId: '5',
          root: 'https://example.org/forum/5',
        }
        const match = rootChecked.read(value, options)

        expect(match?.params).toEqual(expected)
      })

      it('should return undefined for a value the check refuses under the root given', () => {
        const value = 'https://example.org/forum/5/post/7'
        const options = { root: 'https://example.org/forum/5' }

        expect(rootChecked.read(value, options)).toBeUndefined()
      })
    })
  })

  describe('with fall-through', () => {
    it('should read a URL the first row takes as without the option', () => {
      const value = 'https://example.com/alice'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'profile',
        params: {
          username: 'alice',
        },
        row: {
          key: 'profile',
          main: 'https://example.com/{username}/{*}',
        },
        isAlias: false,
        isExact: true,
      }

      expect(fallThroughProfiles.read(value)).toEqual(expected)
    })

    it('should read a URL whose values the checks of the deeper row take as that row', () => {
      const value = 'https://example.com/alice/my-channel'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'channel',
        params: {
          username: 'alice',
          channel: 'my-channel',
        },
        row: {
          key: 'channel',
          main: 'https://example.com/{username}/{channel}/{*}',
        },
        isAlias: false,
        isExact: true,
      }

      expect(fallThroughProfiles.read(value)).toEqual(expected)
    })

    it('should pass a value the check of the table refuses to a row of another shape', () => {
      const value = 'https://example.com/alice/followers'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'profile',
        params: {
          username: 'alice',
        },
        row: {
          key: 'profile',
          main: 'https://example.com/{username}/{*}',
        },
        isAlias: false,
        isExact: false,
      }

      expect(fallThroughProfiles.read(value)).toEqual(expected)
    })

    it('should read a URL with segments behind an open row as that row', () => {
      const value = 'https://example.com/alice/followers/x'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'profile',
        params: {
          username: 'alice',
        },
        row: {
          key: 'profile',
          main: 'https://example.com/{username}/{*}',
        },
        isAlias: false,
        isExact: false,
      }

      expect(fallThroughProfiles.read(value)).toEqual(expected)
    })

    it('should pass a URL to the earlier of two rows of one depth', () => {
      const value = 'https://example.com/editorial/some-article'
      const expected: UrlMatch<string, UrlRow> = {
        key: 'editorial',
        params: {},
        row: {
          key: 'editorial',
          main: 'https://example.com/editorial/{*}',
        },
        isAlias: false,
        isExact: false,
      }

      expect(fallThroughProfiles.read(value)).toEqual(expected)
    })

    it('should pass a value the check of a row refuses to a row of another shape', () => {
      const value = 'https://example.com/alice/followers'
      const expected = {
        username: 'alice',
        view: ['followers'],
      }
      const match = fallThroughRowChecked.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should read a URL two open rows take as the one written first', () => {
      const value = 'https://example.com/alice/my-channel/about'
      const expected = {
        username: 'alice',
      }
      const match = fallThroughBlocks.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should return undefined where no later row takes the URL', () => {
      const value = 'https://example.com/issues/alice'

      expect(fallThroughIssues.read(value)).toBeUndefined()
    })

    it('should return undefined where the parameter refuses every later row too', () => {
      const value = 'https://example.com/feed?alt=json'

      expect(fallThroughSites.read(value)).toBeUndefined()
    })

    it('should say whether the URL is written as the row that took it writes it', () => {
      const value = 'https://example.com/alice/followers'
      const match = fallThroughRowChecked.read(value)

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

      expect(fallThroughRowChecked.build('channel', value)).toBeUndefined()
    })

    it('should read 300 rows that all refuse a value within a second', () => {
      const rows = Array.from({ length: 300 }, (_, index) => {
        return { key: 'item', main: `https://example.com/{username}?id${index}={id}` }
      })
      const table = defineUrls(rows, { checks: { id: digitsRegex }, isFallThrough: true })
      const query = Array.from({ length: 300 }, (_, index) => `id${index}=alice`).join('&')
      const value = `https://example.com/alice?${query}`
      const startedAt = performance.now()

      table.read(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should read 300 rows that a parameter all refuses within a second', () => {
      const rows = Array.from({ length: 300 }, () => {
        return { key: 'page', main: 'https://example.com/{username}' }
      })
      const table = defineUrls(
        [{ key: 'feed', main: 'https://example.com/{username}?view=feed' }, ...rows],
        { isFallThrough: true },
      )
      const value = 'https://example.com/alice?view=other'
      const startedAt = performance.now()

      table.read(value)

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
        const table = defineUrls(hostRows, { hosts: subdomainHosts, isFallThrough: true })

        expect(table.read(value)).toBeUndefined()
      })

      it('should read www in front of a subdomain host where the list names it', () => {
        const value = 'https://www.blog.example.com/alice'
        const expected: Record<string, string> = {
          host: 'www.blog.example.com',
          username: 'alice',
          scheme: 'https',
        }
        const table = defineUrls(hostRows, { hosts: bothSubdomainHosts, isFallThrough: true })
        const match = table.read(value)

        expect(match?.params).toEqual(expected)
      })

      it('should read www in front of a listed apex host the list names without it', () => {
        const value = 'https://www.example.com/alice'
        const expected: Record<string, string> = {
          host: 'www.example.com',
          username: 'alice',
          scheme: 'https',
        }
        const table = defineUrls(hostRows, {
          hosts: { exact: ['example.com'] },
          isFallThrough: true,
        })
        const match = table.read(value)

        expect(match?.params).toEqual(expected)
      })

      it('should return undefined for www in front of the subdomain host a row writes', () => {
        const value = 'https://www.blog.example.com/alice'
        const table = defineUrls(subdomainRows, { isFallThrough: true })

        expect(table.read(value)).toBeUndefined()
      })

      it('should read www in front of the apex host a row writes', () => {
        const value = 'https://www.example.com/alice'
        const expected = 'https://example.com/alice'
        const table = defineUrls(apexRows, { isFallThrough: true })

        expect(table.getMainUrl(value)).toBe(expected)
      })

      it('should read www in front of a listed subdomain host in a table without fall-through', () => {
        const value = 'https://www.blog.example.com/alice'
        const expected: Record<string, string> = {
          host: 'www.blog.example.com',
          username: 'alice',
          scheme: 'https',
        }
        const table = defineUrls(hostRows, { hosts: subdomainHosts })
        const match = table.read(value)

        expect(match?.params).toEqual(expected)
      })
    })

    describe('two values in one segment', () => {
      const rows: Array<UrlRow> = [{ key: 'post', main: 'https://example.com/posts/{id}-{slug}' }]
      const table = defineUrls(rows, { checks: { id: digitsRegex }, isFallThrough: true })

      it('should end a value at the end of its check pattern', () => {
        const value = 'https://example.com/posts/123-my-first-post'
        const expected: Record<string, string> = {
          id: '123',
          slug: 'my-first-post',
        }
        const match = table.read(value)

        expect(match?.params).toEqual(expected)
      })

      it('should read a value behind the fixed text by its check pattern', () => {
        const value = 'https://example.com/posts/my-first-post-123'
        const expected = {
          slug: 'my-first-post',
          id: '123',
        }
        const slugFirst = defineUrls(
          [{ key: 'post', main: 'https://example.com/posts/{slug}-{id}' }],
          { checks: { id: digitsRegex }, isFallThrough: true },
        )
        const match = slugFirst.read(value)

        expect(match?.params).toEqual(expected)
      })

      it('should read a value by the check pattern of its row', () => {
        const value = 'https://example.com/posts/123-my-first-post'
        const expected = {
          id: '123',
          slug: 'my-first-post',
        }
        const rowChecked = defineUrls(
          [
            {
              key: 'post',
              main: 'https://example.com/posts/{id}-{slug}',
              checks: { id: digitsRegex },
            },
          ],
          { isFallThrough: true },
        )
        const match = rowChecked.read(value)

        expect(match?.params).toEqual(expected)
      })

      it('should return undefined where the check pattern takes no part of the segment', () => {
        const value = 'https://example.com/posts/draft-my-first-post'

        expect(table.read(value)).toBeUndefined()
      })

      it('should cut at the last fixed text where the check is a function', () => {
        const value = 'https://example.com/posts/123-my-first-post'
        const functionChecked = defineUrls(rows, {
          checks: { id: (id) => digitsRegex.test(id) },
          isFallThrough: true,
        })

        expect(functionChecked.read(value)).toBeUndefined()
      })

      it('should end a value at the end of its check pattern in a table without fall-through', () => {
        const value = 'https://example.com/posts/123-my-first-post'
        const expected: Record<string, string> = {
          id: '123',
          slug: 'my-first-post',
        }
        const strict = defineUrls(rows, { checks: { id: digitsRegex } })
        const match = strict.read(value)

        expect(match?.params).toEqual(expected)
      })

      it('should read a long run of the fixed text within a second', () => {
        const value = `https://example.com/posts/${'1-'.repeat(100000)}`
        const startedAt = performance.now()

        table.read(value)

        expect(performance.now() - startedAt).toBeLessThan(1000)
      })
    })

    describe('under a root', () => {
      it('should pass a refused URL to the next row under the root before a longer root', () => {
        const value = 'https://example.org/alice/followers/x'
        const options = { isAnyHost: true }
        const expected: UrlMatch<string, UrlRow> = {
          key: 'profile',
          params: {
            username: 'alice',
            root: 'https://example.org',
          },
          row: {
            key: 'profile',
            main: '{root}/{username}/{*}',
          },
          isAlias: false,
          isExact: false,
        }

        expect(fallThroughRootProfiles.read(value, options)).toEqual(expected)
      })

      it('should pass a refused URL to the next row under the root given', () => {
        const value = 'https://example.org/forum/alice/followers'
        const options = { root: 'https://example.org/forum' }
        const expected: Record<string, UrlValue> = {
          username: 'alice',
          root: 'https://example.org/forum',
        }
        const match = fallThroughRootProfiles.read(value, options)

        expect(match?.params).toEqual(expected)
      })
    })

    describe('without the option', () => {
      it('should return undefined for a value the check refuses beside a row of another shape', () => {
        const value = 'https://example.com/alice/followers'

        expect(sameShapeProfiles.read(value)).toBeUndefined()
      })

      it('should return undefined for a refused value with segments behind it', () => {
        const value = 'https://example.com/alice/followers/x'

        expect(sameShapeProfiles.read(value)).toBeUndefined()
      })

      it('should return undefined for a refused value beside an earlier row of one depth', () => {
        const value = 'https://example.com/editorial/some-article'

        expect(sameShapeProfiles.read(value)).toBeUndefined()
      })

      it('should return undefined for a parameter value no row of the key lists', () => {
        const value = 'https://example.com/feed?alt=json'

        expect(sameShapeSelected.read(value)).toBeUndefined()
      })

      it('should read a URL refused under one root under a longer root', () => {
        const value = 'https://example.org/alice/followers/x'
        const options = { isAnyHost: true }
        const expected: Record<string, string> = {
          username: 'followers',
          channel: 'x',
          root: 'https://example.org/alice',
        }
        const match = sameShapeRootProfiles.read(value, options)

        expect(match?.params).toEqual(expected)
      })

      it('should return undefined for a URL refused under the root given', () => {
        const value = 'https://example.org/forum/alice/followers'
        const options = { root: 'https://example.org/forum' }

        expect(sameShapeRootProfiles.read(value, options)).toBeUndefined()
      })
    })
  })
  describe('with a function among the hosts', () => {
    it('should read a tenant under a domain the function accepts', () => {
      const value = 'https://alice.example.co.uk/rss'
      const match = checkedTenants.read(value)

      expect(match?.key).toBe('posts')
    })

    it('should return undefined for a tenant under a domain the function refuses', () => {
      const value = 'https://alice.example.net/rss'

      expect(checkedTenants.read(value)).toBeUndefined()
    })

    it('should return undefined for a tenant two labels under a domain the function accepts', () => {
      const value = 'https://alice.blog.example.de/rss'

      expect(checkedTenants.read(value)).toBeUndefined()
    })

    it('should return undefined for the domain the function accepts as a host', () => {
      const value = 'https://example.co.uk/rss'

      expect(checkedTenants.read(value)).toBeUndefined()
    })

    it('should return undefined for www in front of the domain under a www tenant prefix', () => {
      const value = 'https://www.example.co.uk/rss'

      expect(checkedTenants.read(value)).toBeUndefined()
    })

    it('should read www in front of a tenant under a www tenant prefix', () => {
      const value = 'https://www.alice.example.co.uk/rss'
      const match = checkedTenants.read(value)

      expect(match?.key).toBe('posts')
    })

    it('should read a domain row on a domain the function accepts', () => {
      const value = 'https://example.de/about'
      const match = checkedTenants.read(value)

      expect(match?.key).toBe('about')
    })

    it('should return undefined for a domain row on a domain the function refuses', () => {
      const value = 'https://example.net/about'

      expect(checkedTenants.read(value)).toBeUndefined()
    })

    it('should build a domain row for a page under a domain the function accepts', () => {
      const value = 'https://alice.example.co.uk/'
      const expected = 'https://example.co.uk/about'
      const page = checkedTenants.forUrl(value)

      expect(page?.build('about')).toBe(expected)
    })

    it('should build a URL on a host the function refuses', () => {
      const value = {
        scheme: 'https',
        host: 'example.net',
      }
      const expected = 'https://example.net/rss'

      expect(checkedTenants.build('posts', value)).toBe(expected)
    })

    it('should read an exact host the function accepts with www in front', () => {
      const value = 'https://www.example.de/jobs/feed'
      const match = checkedExact.read(value)

      expect(match?.key).toBe('jobs')
    })

    it('should return undefined for a host under an exact host the function accepts', () => {
      const value = 'https://alice.example.de/jobs/feed'

      expect(checkedExact.read(value)).toBeUndefined()
    })
  })
})

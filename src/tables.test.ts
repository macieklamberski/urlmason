import { describe, expect, it } from 'bun:test'
import { isLocale } from 'trousse'
import type { UrlMatch, UrlRow } from '../types.js'
import { defineUrls } from './tables.js'

type PlayerRow = UrlRow & { ratio?: string }

const regionLocaleRegex = /^[a-z]{2}-[A-Z]{2}$/
const digitsRegex = /^\d+$/

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

const players = defineUrls<string, { ratio?: string }>(playerRows, {
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
    key: 'search',
    main: 'https://www.example.com/search.rss?{query}',
    aliases: ['https://old.example.com/search.rss?{query}'],
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
      keptParams: ['sort'],
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
    { key: 'search', main: 'https://example.com/search.xml?q={query}&types=page&types=post' },
  ],
  { keptParams: ['max-results'] },
)

const parserRemovedQueries = ['Mode=1&I\tD=9', 'Mode=1&I\nD=9', 'Mode=1&I\rD=9']

const unsorted = defineUrls([
  {
    key: 'search',
    main: 'https://example.com/feed?type=RSS&q={query}',
    aliases: ['https://old.example.com/feed?type=RSS&q={query}'],
  },
  { key: 'tagged', main: 'https://example.com/tags.rss?tag=news&id={id}&tag=art' },
  { key: 'cased', main: 'https://example.com/list.rss?b=2&B=1&a={id}' },
  { key: 'filtered', main: 'https://example.com/filter.rss?view=rss&{query}' },
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

const passedFormats = defineUrls([
  { key: 'posts', main: 'https://example.com/feed?alt=rss' },
  { key: 'posts', main: 'https://example.com/feed?{query}' },
])

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
    { key: 'tag', main: 'https://feeds.example.com/tags.rss?tag={query}', lenient: { case: [] } },
    {
      key: 'archive',
      main: 'https://feeds.example.com/archive/{name}/feed',
      lenient: { trailingSlash: false },
    },
  ],
  { lenient: { case: ['name', 'query'], trailingSlash: true } },
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

const slashed = defineUrls([
  { key: 'user', main: 'https://example.com/{user}', lenient: { trailingSlash: true } },
  { key: 'page', main: 'https://example.com/{user}/' },
  { key: 'blog', main: 'https://example.com/blog/{user}/', lenient: { trailingSlash: true } },
  { key: 'posts', main: 'https://example.com/blog/{user}' },
])

const profiles = defineUrls([
  { key: 'user', main: 'https://example.com/{user}', lenient: { trailingSlash: true } },
  { key: 'page', main: 'https://example.com/@{user}/' },
  { key: 'about', main: 'https://example.com/about/' },
])

const listed = defineUrls([
  {
    key: 'list',
    main: 'https://example.com/lists/{user}/{list}',
    lenient: { case: ['user'] },
  },
])

const ampersands = defineUrls([
  {
    key: 'agenda',
    main: 'https://example.com/Feed.ashx?M=LD&ID={id}&GUID={guid}',
    lenient: { ampersandEntity: true },
  },
  {
    key: 'calendar',
    main: 'https://example.com/Calendar.ashx?M=CL&ID={id}&GUID={guid}',
    lenient: { ampersandEntity: false },
  },
])

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

const ampersandPair = defineUrls([
  { key: 'one', main: 'https://example.com/feed?a={a}' },
  { key: 'two', main: 'https://example.com/feed?a={a}&b={b}', lenient: { ampersandEntity: true } },
])

const ampersandFixed = defineUrls([
  { key: 'one', main: 'https://example.com/feed?a={a}' },
  { key: 'two', main: 'https://example.com/feed?a={a}&b=2', lenient: { ampersandEntity: true } },
])

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
    { key: 'item', main: 'https://example.com/list?id={id}', lenient: { ampersandEntity: true } },
  ],
  { checks: { id: (value) => digitsRegex.test(value) } },
)

const ampersandPassed = defineUrls(
  [{ key: 'agenda', main: 'https://example.com/Feed.ashx?{query}' }],
  { lenient: { ampersandEntity: true } },
)
const ampersandFallback = defineUrls(
  [
    { key: 'agenda', main: 'https://example.com/Feed.ashx?M=LD&{query}' },
    { key: 'agenda', main: 'https://example.com/Feed.ashx?M=LD' },
  ],
  { lenient: { ampersandEntity: true } },
)
const ampersandSpellings = defineUrls(
  [
    {
      key: 'agenda',
      main: 'https://example.com/Feed.ashx?M=LD&{query}',
      aliases: ['https://example.com/feed.aspx'],
    },
  ],
  { lenient: { ampersandEntity: true } },
)
const ampersandMixed = defineUrls([
  { key: 'list', main: 'https://example.com/feed?{query}' },
  { key: 'item', main: 'https://example.com/feed?a={a}&b={b}', lenient: { ampersandEntity: true } },
])

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

const builtSlash = defineUrls([
  { key: 'user', main: 'https://example.com/u/{user}', lenient: { trailingSlash: true } },
  { key: 'page', main: 'https://example.com/u/{user}/', isBuildOnly: true },
])

const aliasSlash = defineUrls([
  { key: 'user', main: 'https://example.com/{user}', lenient: { trailingSlash: true } },
  {
    key: 'page',
    main: 'https://example.com/p/{page}',
    aliases: ['https://example.com/{page}/'],
  },
])

const ampersandAlias = defineUrls([
  {
    key: 'feed',
    main: 'https://example.com/feed.rss?a={a}',
    aliases: ['https://example.com/old.rss?a={a}'],
    lenient: { ampersandEntity: true },
  },
])

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
      const table = defineUrls([
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
      const table = defineUrls([
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
      const table = defineUrls([
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

    it('should keep the listed parameters after the list of a returned row is edited', () => {
      const table = defineUrls([
        {
          key: 'posts',
          main: 'https://example.com/feed',
          aliases: ['https://example.com/rss'],
          keptParams: ['page'],
        },
      ])
      const value = 'https://example.com/rss?page=2&ref=home'
      const expected = 'https://example.com/feed?page=2'

      table.rows[0].keptParams?.push('ref')

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should keep the listed parameters after the list of a row it was given is edited', () => {
      const rows: Array<UrlRow> = [
        {
          key: 'posts',
          main: 'https://example.com/feed',
          aliases: ['https://example.com/rss'],
          keptParams: ['page'],
        },
      ]
      const table = defineUrls(rows)
      const value = 'https://example.com/rss?page=2&ref=home'
      const expected = 'https://example.com/feed?page=2'

      rows[0].keptParams?.push('ref')

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should keep the listed parameters after the list of a row it read is edited', () => {
      const table = defineUrls([
        {
          key: 'posts',
          main: 'https://example.com/feed',
          aliases: ['https://example.com/rss'],
          keptParams: ['page'],
        },
      ])
      const value = 'https://example.com/rss?page=2&ref=home'
      const expected = 'https://example.com/feed?page=2'
      const match = table.read(value)

      match?.row.keptParams?.push('ref')

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should lowercase a value after the case list of a returned row is emptied', () => {
      const table = defineUrls([
        {
          key: 'posts',
          main: 'https://example.com/{user}/feed',
          lenient: { case: ['user'] },
        },
      ])
      const value = 'https://example.com/Alice/feed'
      const expected = 'https://example.com/alice/feed'

      table.rows[0].lenient?.case?.pop()

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should keep a value as written after the case list of a row it was given is edited', () => {
      const rows: Array<UrlRow> = [
        {
          key: 'posts',
          main: 'https://example.com/{user}/feed',
          aliases: ['https://example.com/{user}/rss'],
          lenient: { case: ['none'] },
        },
      ]
      const table = defineUrls(rows)
      const value = 'https://example.com/Alice/feed'

      rows[0].lenient?.case?.push('user')

      expect(table.getMainUrl(value)).toBeUndefined()
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
        path: 'api/v2',
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

    it('should throw when the selector takes no row of the key', () => {
      const value = { videoId: 'x8abc' }
      const select = (row: PlayerRow) => row.ratio === '4/3'
      const throwing = () => players.build('video', value, select)

      expect(throwing).toThrow('No feed template for video')
    })

    it('should throw for a selector that tells a row by identity', () => {
      const rows: Array<UrlRow> = [
        { key: 'item', main: 'https://example.com/items/{id}.rss' },
        { key: 'item', main: 'https://example.com/items/{id}.atom' },
      ]
      const table = defineUrls(rows)
      const value = { id: '7' }
      const select = (row: UrlRow) => row === rows[1]
      const throwing = () => table.build('item', value, select)

      expect(throwing).toThrow('No feed template for item')
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

    it('should keep the order of parameters under one name', () => {
      const value = { id: '7' }
      const expected = 'https://example.com/tags.rss?id=7&tag=news&tag=art'

      expect(unsorted.build('tagged', value)).toBe(expected)
    })

    it('should keep the order of one name in two cases', () => {
      const value = { id: '7' }
      const expected = 'https://example.com/list.rss?a=7&b=2&B=1'

      expect(unsorted.build('cased', value)).toBe(expected)
    })

    it('should sort a passed query together with the parameters of the row', () => {
      const value = { query: 'year=2024&author=alice' }
      const expected = 'https://example.com/filter.rss?author=alice&view=rss&year=2024'

      expect(unsorted.build('filtered', value)).toBe(expected)
    })

    it('should sort a percent-encoded name of a passed query as the name it decodes to', () => {
      const value = { query: '%7Aone=1&b=2' }
      const expected = 'https://example.com/filter.rss?b=2&view=rss&%7Aone=1'

      expect(unsorted.build('filtered', value)).toBe(expected)
    })

    it('should end a passed query at its fragment', () => {
      const value = { query: 'author=alice#top' }
      const expected = 'https://example.com/filter.rss?author=alice&view=rss'

      expect(unsorted.build('filtered', value)).toBe(expected)
    })

    it('should end a passed query at the first of two fragment marks', () => {
      const value = { query: 'author=alice#top&year=2024#end' }
      const expected = 'https://example.com/filter.rss?author=alice&view=rss'

      expect(unsorted.build('filtered', value)).toBe(expected)
    })

    it('should keep the order of one name written with + and with %20', () => {
      const value = { query: 'q+x=first&q%20x=second' }
      const expected = 'https://example.com/filter.rss?q+x=first&q%20x=second&view=rss'

      expect(unsorted.build('filtered', value)).toBe(expected)
    })

    it('should sort a name with two + as the name with two %20', () => {
      const value = { query: 'q+x+y=first&q%20x%20y=second' }
      const expected = 'https://example.com/filter.rss?q+x+y=first&q%20x%20y=second&view=rss'

      expect(unsorted.build('filtered', value)).toBe(expected)
    })

    it('should sort a digit in a name before an underscore', () => {
      const value = { query: 'a_=2&a1=1' }
      const expected = 'https://example.com/filter.rss?a1=1&a_=2&view=rss'

      expect(unsorted.build('filtered', value)).toBe(expected)
    })

    it.each(parserRemovedQueries)('should build nothing from the passed query %j', (query) => {
      const table = defineUrls([
        { key: 'agenda', main: 'https://example.com/Feed.ashx?ID={id}&{query}' },
      ])
      const value = {
        id: '7',
        query,
      }

      expect(table.build('agenda', value)).toBeUndefined()
    })

    it('should drop a passed parameter the row sets, its name written with +', () => {
      const table = defineUrls([
        { key: 'filtered', main: 'https://example.com/filter.rss?{query}&sort%20by=date' },
      ])
      const value = { query: 'sort+by=title&year=2024' }
      const expected = 'https://example.com/filter.rss?sort%20by=date&year=2024'

      expect(table.build('filtered', value)).toBe(expected)
    })

    it('should write &amp; in a passed query as given on a row without the ampersand mark', () => {
      const value = { query: 'year=2024&amp;author=alice' }
      const expected = 'https://example.com/filter.rss?amp;author=alice&view=rss&year=2024'

      expect(unsorted.build('filtered', value)).toBe(expected)
    })

    it('should build a passed pair that starts with amp; on a row without the ampersand mark', () => {
      const value = { query: 'amp;author=alice&year=2024' }
      const expected = 'https://example.com/filter.rss?amp;author=alice&view=rss&year=2024'

      expect(unsorted.build('filtered', value)).toBe(expected)
    })

    it('should write a URL the main URL of its row leaves alone', () => {
      const value = unsorted.build('search', { query: 'feeds' }) ?? ''

      expect(unsorted.getMainUrl(value)).toBeUndefined()
    })

    it('should sort 200 kB of a passed query within a second', () => {
      const value = { query: 'b=1&a=1&'.repeat(25000) }
      const startedAt = performance.now()

      unsorted.build('filtered', value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
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

    it('should hand a passed query to the main URL', () => {
      const value = 'https://old.example.com/search.rss?q=feeds&sort=new'
      const expected = 'https://www.example.com/search.rss?q=feeds&sort=new'

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

    it('should drop an empty pair between kept parameters', () => {
      const value = 'https://example.com/alice/rss20.xml?a=1&&b=2'
      const expected = 'https://feeds.example.com/alice/rss20.xml?a=1&b=2'

      expect(spellings.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a URL that gives a repeated parameter once', () => {
      const repeated = defineUrls([
        {
          key: 'pair',
          main: 'https://feeds.example.com/pair.xml?id={id}',
          aliases: ['https://example.com/pair.xml?id={id}&id={id}'],
        },
      ])
      const value = 'https://example.com/pair.xml?id=7'

      expect(repeated.getMainUrl(value)).toBeUndefined()
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

    it('should read another value of a parameter every template of the key sets alike', () => {
      const value = 'https://example.com/search.xml?q=feeds&types=page&types=post&types=comment'
      const expected = 'search'

      const key = formats.read(value)?.key

      expect(key).toBe(expected)
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

    it('should read any value on a row that passes the query on', () => {
      const value = 'https://example.com/feed?alt=rss2'
      const expected = 'https://example.com/feed?{query}'
      const main = passedFormats.read(value)?.row.main

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

    it('should keep a value as written on a row that turns the mark off', () => {
      const value = 'https://feeds.example.com/tags.rss?tag=News'

      expect(marked.getMainUrl(value)).toBeUndefined()
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
      const table = defineUrls([
        {
          key: 'user',
          main: 'https://example.com/users/{user}',
          // @ts-expect-error: The case mark takes a list of placeholder names.
          lenient: { case: true },
        },
      ])
      const value = 'https://example.com/users/Alice'

      expect(table.getMainUrl(value)).toBeUndefined()
    })

    it('should throw for a marked value that shares a path segment with another value', () => {
      const throwing = () => {
        return defineUrls([
          {
            key: 'board',
            main: 'https://example.com/{board}_by_{user}',
            lenient: { case: ['user'] },
          },
        ])
      }

      expect(throwing).toThrow(
        'The board row marks the case of user, which shares a part of its URL with another value',
      )
    })

    it('should throw for a marked value that shares a host label with another value', () => {
      const throwing = () => {
        return defineUrls([
          {
            key: 'blog',
            main: 'https://{blog}-{user}.example.com/feed',
            lenient: { case: ['blog'] },
          },
        ])
      }

      expect(throwing).toThrow(
        'The blog row marks the case of blog, which shares a part of its URL with another value',
      )
    })

    it('should throw for a marked value that shares a query value with another value', () => {
      const throwing = () => {
        return defineUrls([
          {
            key: 'range',
            main: 'https://example.com/range.rss?r={from}-{to}',
            lenient: { case: ['to'] },
          },
        ])
      }

      expect(throwing).toThrow(
        'The range row marks the case of to, which shares a part of its URL with another value',
      )
    })

    it('should throw for a marked value that shares a path segment of an alias', () => {
      const throwing = () => {
        return defineUrls([
          {
            key: 'board',
            main: 'https://example.com/boards/{board}/{user}',
            aliases: ['https://example.com/{board}_by_{user}'],
            lenient: { case: ['user'] },
          },
        ])
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
        return defineUrls([
          {
            key: 'thread',
            main: 'https://example.com/{board*}/feed/{thread*}',
            lenient: { case: ['thread'] },
          },
        ])
      }

      expect(throwing).toThrow(
        'The thread row marks the case of thread, which shares a part of its URL with another value',
      )
    })

    it('should not throw for a row that turns the mark of the table off', () => {
      const defining = () => {
        return defineUrls(
          [
            {
              key: 'board',
              main: 'https://example.com/{board}_by_{user}',
              lenient: { case: [] },
            },
          ],
          { lenient: { case: ['user'] } },
        )
      }

      expect(defining).not.toThrow()
    })

    it('should write 200 kB of a value in lowercase within a second', () => {
      const value = `https://feeds.example.com/${'A'.repeat(200000)}`
      const startedAt = performance.now()

      marked.getMainUrl(value)

      expect(performance.now() - startedAt).toBeLessThan(1000)
    })

    it('should not write a value in lowercase on a row that sets the mark to undefined', () => {
      const table = defineUrls(
        [
          {
            key: 'user',
            main: 'https://example.com/users/{user}',
            aliases: ['https://example.com/u/{user}'],
            lenient: { case: undefined },
          },
        ],
        { lenient: { case: ['user'] } },
      )
      const value = 'https://example.com/u/Alice'
      const expected = 'https://example.com/users/Alice'

      expect(table.getMainUrl(value)).toBe(expected)
    })
  })

  describe('with the trailing slash mark', () => {
    it('should mark a URL with a trailing slash the row does not write as exact', () => {
      const value = 'https://feeds.example.com/alice/'
      const match = marked.read(value)

      expect(match?.isExact).toBe(true)
    })

    it('should drop a trailing slash the main URL does not write', () => {
      const value = 'https://feeds.example.com/alice/'
      const expected = 'https://feeds.example.com/alice'

      expect(marked.getMainUrl(value)).toBe(expected)
    })

    it('should write an alias without the trailing slash it writes as the main URL', () => {
      const value = 'https://example.com/alice/feed'
      const expected = 'https://feeds.example.com/alice'

      expect(marked.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a trailing slash another row writes', () => {
      const value = 'https://example.com/alice/'

      expect(slashed.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a trailing slash the alias of another row writes', () => {
      const value = 'https://example.com/alice/'

      expect(aliasSlash.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a trailing slash another row writes on the www host', () => {
      const value = 'https://www.example.com/alice/'

      expect(slashed.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a missing trailing slash another row writes without', () => {
      const value = 'https://example.com/blog/alice'

      expect(slashed.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a trailing slash another row writes after fixed text given as an escape', () => {
      const value = 'https://example.com/%40alice/'

      expect(profiles.getMainUrl(value)).toBeUndefined()
    })

    it('should return undefined for a trailing slash another row writes after fixed text in another case', () => {
      const value = 'https://example.com/About/'

      expect(profiles.getMainUrl(value)).toBeUndefined()
    })

    it('should not mark a trailing slash another row writes after an escape as exact', () => {
      const value = 'https://example.com/%61bout/'
      const match = profiles.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should not mark a trailing slash as exact on a row that turns the mark off', () => {
      const value = 'https://feeds.example.com/archive/alice/feed/'
      const match = marked.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should not mark a trailing slash as exact on a row that sets the mark to undefined', () => {
      const table = defineUrls(
        [
          {
            key: 'user',
            main: 'https://example.com/users/{user}',
            lenient: { trailingSlash: undefined },
          },
        ],
        { lenient: { trailingSlash: true } },
      )
      const value = 'https://example.com/users/alice/'
      const match = table.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should not read a list as the trailing slash mark', () => {
      const table = defineUrls([
        {
          key: 'user',
          main: 'https://example.com/{user}',
          // @ts-expect-error: The trailing slash mark is a boolean.
          lenient: { trailingSlash: ['user'] },
        },
      ])
      const value = 'https://example.com/alice/'
      const match = table.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should not read a misspelled key as the trailing slash mark', () => {
      const table = defineUrls([
        {
          key: 'user',
          main: 'https://example.com/{user}',
          // @ts-expect-error: A key that is no mark fails the typecheck.
          lenient: { trailingslash: true },
        },
      ])
      const value = 'https://example.com/alice/'
      const match = table.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should not mark a trailing slash another row writes as exact', () => {
      const value = 'https://example.com/alice/'
      const match = slashed.read(value)

      expect(match?.isExact).toBe(false)
    })

    it('should return undefined for a trailing slash a row that is only built writes', () => {
      const value = 'https://example.com/u/alice/'

      expect(builtSlash.getMainUrl(value)).toBeUndefined()
    })

    it('should mark a trailing slash as exact on a row that turns another mark off', () => {
      const value = 'https://feeds.example.com/tags.rss/?tag=news'
      const match = marked.read(value)

      expect(match?.isExact).toBe(true)
    })
  })

  describe('with the ampersand entity mark', () => {
    it('should read &amp; between query pairs as &', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&amp;ID=7&amp;GUID=a1b2'
      const expected: Record<string, string> = {
        id: '7',
        guid: 'a1b2',
      }
      const match = ampersands.read(value)

      expect(match?.params).toEqual(expected)
    })

    it('should write &amp; between query pairs as &', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&amp;ID=7&amp;GUID=a1b2'
      const expected = 'https://example.com/Feed.ashx?GUID=a1b2&ID=7&M=LD'

      expect(ampersands.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for &amp; on a row that turns the mark off', () => {
      const value = 'https://example.com/Calendar.ashx?M=CL&amp;ID=7&amp;GUID=a1b2'

      expect(ampersands.read(value)).toBeUndefined()
    })

    it('should return undefined for &amp; on a row without the mark', () => {
      const value = 'https://example.com/Feed.ashx?M=LD&amp;ID=7&amp;GUID=a1b2'

      expect(unmarkedAmpersands.read(value)).toBeUndefined()
    })

    it('should build a passed query with &amp; between its pairs as one with &', () => {
      const value = { query: 'M=LD&amp;ID=7' }
      const expected = 'https://example.com/Feed.ashx?ID=7&M=LD'

      expect(ampersandPassed.build('agenda', value)).toBe(expected)
    })

    it('should build nothing from a passed query with a pair that starts with amp;', () => {
      const value = { query: 'amp;ID=7&M=LD' }

      expect(ampersandPassed.build('agenda', value)).toBeUndefined()
    })

    it('should build nothing from a passed query with a doubled &amp; behind another pair', () => {
      const value = { query: 'M=LD&amp;amp;ID=7' }

      expect(ampersandPassed.build('agenda', value)).toBeUndefined()
    })

    it('should end a passed query at its fragment', () => {
      const value = { query: 'ID=7#top' }
      const expected = 'https://example.com/Feed.ashx?ID=7'

      expect(ampersandPassed.build('agenda', value)).toBe(expected)
    })

    it('should build nothing from a refused passed query beside a row without one', () => {
      const value = { query: 'cat=5&amp;amp;paged=2' }

      expect(ampersandFallback.build('agenda', value)).toBeUndefined()
    })

    it('should build nothing from a refused passed query beside an alias without one', () => {
      const value = { query: 'cat=5&amp;amp;paged=2' }

      expect(ampersandSpellings.build('agenda', value)).toBeUndefined()
    })

    it('should list no URL for a refused passed query beside a row without one', () => {
      const value = { query: 'cat=5&amp;amp;paged=2' }

      expect(ampersandFallback.buildAll('agenda', value)).toEqual([])
    })

    it('should list no URL for a refused passed query beside an alias without one', () => {
      const value = { query: 'cat=5&amp;amp;paged=2' }

      expect(ampersandSpellings.buildAll('agenda', value)).toEqual([])
    })

    it('should build nothing from a passed pair that starts with amp; beside a marked row', () => {
      const value = { query: 'amp;b=2&a=1' }

      expect(ampersandMixed.build('list', value)).toBeUndefined()
    })

    it('should build nothing from a passed pair with a tab inside amp; beside a marked row', () => {
      const value = { query: 'a\tmp;b=2&a=1' }

      expect(ampersandMixed.build('list', value)).toBeUndefined()
    })

    it('should build a passed query that holds amp; behind other text', () => {
      const value = { query: 'a=amp;x&stamp;y=1' }
      const expected = 'https://example.com/Feed.ashx?a=amp;x&stamp;y=1'

      expect(ampersandPassed.build('agenda', value)).toBe(expected)
    })

    it('should list the main URL alone for a refused passed query on an alias', () => {
      const table = defineUrls(
        [
          {
            key: 'agenda',
            main: 'https://example.com/Feed.ashx?M=LD',
            aliases: ['https://example.com/feed.aspx?{query}'],
          },
        ],
        { lenient: { ampersandEntity: true } },
      )
      const value = { query: 'cat=5&amp;amp;paged=2' }
      const expected = ['https://example.com/Feed.ashx?M=LD']

      expect(table.buildAll('agenda', value)).toEqual(expected)
    })

    it('should build nothing from a passed query with &amp; beside a marked row', () => {
      const value = { query: 'b=2&amp;a=1' }

      expect(ampersandMixed.build('list', value)).toBeUndefined()
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

    it('should throw for such a name on a row without the mark beside a row under it', () => {
      const throwing = () => {
        return defineUrls([
          { key: 'list', main: 'https://example.com/feed?amp;x=1&a=1' },
          {
            key: 'item',
            main: 'https://example.com/feed?a=1&x=1',
            lenient: { ampersandEntity: true },
          },
        ])
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

    it('should throw for such a name beside a passed query with the mark on the row', () => {
      const throwing = () => {
        return defineUrls([
          {
            key: 'list',
            main: 'https://example.com/list.rss?amp;x=1&{query}',
            lenient: { ampersandEntity: true },
          },
        ])
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

    it('should return no main URL where the sorted query reads as a row under the mark', () => {
      const value = 'https://example.com/feed?amp;b=2&a=1'

      expect(ampersandPair.getMainUrl(value)).toBeUndefined()
    })

    it('should return no main URL where the sorted query reads as a row with a fixed pair', () => {
      const value = 'https://example.com/feed?amp;b=2&a=1'

      expect(ampersandFixed.getMainUrl(value)).toBeUndefined()
    })

    it('should return no main URL for &amp; on a row without the mark beside a row under it', () => {
      const value = 'https://example.com/feed?a=1&amp;x=2'

      expect(ampersandPair.getMainUrl(value)).toBeUndefined()
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

    it('should read a URL with &amp; as a row without the mark beside a row under it', () => {
      const value = 'https://example.com/feed?amp;b=2&a=1&amp;z=1'
      const expected = 'one'
      const match = ampersandFixed.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should not read an entity in capitals as &', () => {
      const value = 'https://example.com/feed?tag=a&AMP;type=posts&amp;z=1'
      const expected = 'posts'
      const match = ampersandTags.read(value)

      expect(match?.key).toBe(expected)
    })

    it('should not read a string as the ampersand entity mark', () => {
      const table = defineUrls([
        {
          key: 'feed',
          main: 'https://example.com/feed?a={a}&b={b}',
          // @ts-expect-error: The ampersand entity mark is a boolean.
          lenient: { ampersandEntity: 'yes' },
        },
      ])
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
      const table = defineUrls([
        {
          key: 'posts',
          main: 'https://example.com/posts.xml?id={id}',
          keptParams: ['max results'],
        },
      ])
      const value = 'https://example.com/posts.xml?ref=home&max+results=5&id=7'
      const expected = 'https://example.com/posts.xml?id=7&max+results=5'

      expect(table.getMainUrl(value)).toBe(expected)
    })

    it('should return undefined for a main URL with an own parameter given again with +', () => {
      const table = defineUrls([
        {
          key: 'posts',
          main: 'https://example.com/posts.xml?id={id}',
          keptParams: ['page'],
        },
      ])
      const value = 'https://example.com/posts.xml?id=7&id+=8&ref=home'

      expect(table.getMainUrl(value)).toBeUndefined()
    })

    it('should take the list of the row over the list of the table', () => {
      const value = 'https://example.com/search.xml?q=feeds&sort=new&max-results=5'
      const expected = 'https://feeds.example.com/search.xml?q=feeds&sort=new'

      expect(paged.getMainUrl(value)).toBe(expected)
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

    it('should throw for a kept parameter the URL of the row already sets', () => {
      const throwing = () => {
        return defineUrls([
          { key: 'search', main: 'https://example.com/search.xml?q={query}', keptParams: ['q'] },
        ])
      }

      expect(throwing).toThrow('The search row keeps q, which its URL already sets')
    })
  })
})

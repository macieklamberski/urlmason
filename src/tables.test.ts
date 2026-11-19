import { describe, expect, it } from 'bun:test'
import { isLocale } from 'trousse'
import type { UrlMatch, UrlRow } from '../types.js'
import { defineUrls } from './tables.js'

type PlayerRow = UrlRow & { ratio?: string }

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

describe('defineUrls', () => {
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

    it('should write back the URL it read', () => {
      const value = 'https://www.example.com/embed/caf%C3%A9'
      const match = players.read(value)

      expect(players.build('video', match?.params)).toBe(value)
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

    it('should return no URL when the values fill no row of the key', () => {
      const value = {}
      const expected: Array<string> = []

      expect(players.buildAll('video', value)).toEqual(expected)
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

    it('should return undefined for a flag parameter given a value', () => {
      const value = 'https://example.com/list.php?xml='

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

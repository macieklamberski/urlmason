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

    it('should keep the query and the fragment of a main URL as given', () => {
      const value = 'http://feeds.example.com/alice/rss20.xml?b=%5B2%5D&a=1#top'
      const expected = 'https://feeds.example.com/alice/rss20.xml?b=%5B2%5D&a=1#top'

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

    it('should return undefined for a main URL whose host is a placeholder', () => {
      const value = 'http://alice.example.org/feeds/posts/default'

      expect(spellings.getMainUrl(value)).toBeUndefined()
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
})

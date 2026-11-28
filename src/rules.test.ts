import { describe, expect, it } from 'bun:test'
import {
  type NamedTemplate,
  type ReservedPlacement,
  type TemplateNames,
  validateCaseMark,
  validateCheckRegex,
  validateEntityNames,
  validateExpressions,
  validateFragment,
  validateListNames,
  validateListSplit,
  validateOpenTail,
  validateOpenTailPlacement,
  validateOptionalPlacement,
  validateParamNames,
  validateQueryPlaceholders,
  validateQueryValueNames,
  validateReservedNames,
  validateReservedPlacement,
  validateSemicolons,
  validateTemplateMatch,
  validateTenantHost,
} from './rules.js'
import { parseTemplate } from './templates.js'

const wholeTextRegex = /^(.+)$/
const anchoredRegex = /^\d+$/i

const statefulChecks: Array<RegExp> = [/^\d+$/g, /^\d+$/y]
const unanchoredChecks: Array<RegExp> = [/\d+$/, /^\d+/]
const splitCheckNames: Array<string> = ['options', 'url']

type FragmentCase = {
  body: string
  fragment?: string
}

type ExpressionCase = {
  value: string
  expected: string
}

describe('validateExpressions', () => {
  const refusedTemplates: Array<ExpressionCase> = [
    {
      value: 'https://example.com/{id}/{*}',
      expected: 'The template https://example.com/{id}/{*} writes /{*}, which is spelled {/tail*}',
    },
    {
      value: 'https://example.com/search?{query}',
      expected:
        'The template https://example.com/search?{query} writes ?{query}, which is spelled {?query*}',
    },
    {
      value: 'https://example.com/feed{*}',
      expected: 'The template https://example.com/feed{*} writes {*}, which is spelled {/tail*}',
    },
    {
      value: 'https://example.com/{/id*',
      expected:
        'The template https://example.com/{/id* writes a brace outside a complete expression',
    },
    {
      value: 'https://example.com/-/{labels*}',
      expected:
        'The template https://example.com/-/{labels*} writes /{labels*}, which is spelled {/labels*}',
    },
    {
      value: 'https://example.com/{.format}',
      expected:
        'The template https://example.com/{.format} writes {.format}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/{+path,x}',
      expected:
        'The template https://example.com/{+path,x} writes {+path,x}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/{+path*}',
      expected:
        'The template https://example.com/{+path*} writes {+path*}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/{#section,part}',
      expected:
        'The template https://example.com/{#section,part} writes {#section,part}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/{#section*}',
      expected:
        'The template https://example.com/{#section*} writes {#section*}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/{;id}',
      expected:
        'The template https://example.com/{;id} writes {;id}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/{id:3}',
      expected:
        'The template https://example.com/{id:3} writes {id:3}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/{owner,repo}',
      expected:
        'The template https://example.com/{owner,repo} writes {owner,repo}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/{/path}',
      expected:
        'The template https://example.com/{/path} writes {/path}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/{}',
      expected:
        'The template https://example.com/{} writes {}, an operator or modifier no template takes',
    },
    {
      value: 'https://example.com/search{?query*,page}',
      expected:
        'The template https://example.com/search{?query*,page} writes {?query*,page}, an operator or modifier no template takes',
    },
  ]

  it.each(refusedTemplates)('should throw for $value', ({ value, expected }) => {
    const throwing = () => validateExpressions(value)

    expect(throwing).toThrow(expected)
  })

  it('should take every expression a template may write', () => {
    const value = 'https://example.com/{id}{/path*}/{+url}{?page,query*}{#section}'
    const throwing = () => validateExpressions(value)

    expect(throwing).not.toThrow()
  })
})

describe('validateFragment', () => {
  const refusedFragments: Array<FragmentCase> = [
    {
      body: 'https://example.com/watch',
      fragment: '',
    },
    {
      body: 'https://example.com/watch',
      fragment: '{/path*}',
    },
    {
      body: 'https://example.com/watch',
      fragment: 'page{?page}',
    },
    {
      body: 'https://example.com/watch',
      fragment: 'top{#section}',
    },
    {
      body: 'https://example.com/watch{',
    },
    {
      body: 'https://example.com/watch#more',
    },
  ]

  it.each(refusedFragments)('should throw for %o', ({ body, fragment }) => {
    const value = 'https://example.com/watch#{/path*}'
    const throwing = () => validateFragment(value, body, fragment)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should take a fragment of fixed text and values', () => {
    const value = 'https://example.com/watch#!/video/{id}'
    const throwing = () => validateFragment(value, 'https://example.com/watch', '!/video/{id}')

    expect(throwing).not.toThrow()
  })
})

describe('validateTemplateMatch', () => {
  it('should throw for a template its pattern does not match', () => {
    const value = 'example.com/feed'
    const throwing = () => validateTemplateMatch(value, value, null)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should throw for optional names in front of the end', () => {
    const value = 'https://example.com/feed{?page}/more'
    const match = wholeTextRegex.exec(value)
    const throwing = () => validateTemplateMatch(value, value, match)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should take a template its pattern matches', () => {
    const value = 'https://example.com/feed'
    const match = wholeTextRegex.exec(value)
    const throwing = () => validateTemplateMatch(value, value, match)

    expect(throwing).not.toThrow()
  })
})

describe('validateReservedPlacement', () => {
  it('should throw for a reserved value in the host', () => {
    const value: ReservedPlacement = {
      template: 'https://{+host}/feed',
      base: 'https://{+host}/feed',
      ownText: 'https{+host}',
      reservedNames: [],
      besideNames: [],
    }
    const throwing = () => validateReservedPlacement(value)

    expect(throwing).toThrow(
      'The template https://{+host}/feed writes {+host} outside its path, or beside a list or an open tail',
    )
  })

  it('should throw for a reserved value beside a list', () => {
    const value: ReservedPlacement = {
      template: 'https://example.com{/path*}/x/{+url}',
      base: 'https://example.com{/path*}/x/{+url}',
      ownText: 'httpsexample.com',
      reservedNames: ['url'],
      besideNames: [],
    }
    const throwing = () => validateReservedPlacement(value)

    expect(throwing).toThrow(
      'The template https://example.com{/path*}/x/{+url} writes {+url} outside its path, or beside a list or an open tail',
    )
  })

  it('should take a reserved value beside a list it may sit beside', () => {
    const value: ReservedPlacement = {
      template: 'https://example.com{/options*}/{+url}',
      base: 'https://example.com{/options*}/{+url}',
      ownText: 'httpsexample.com',
      reservedNames: ['url'],
      besideNames: ['options*'],
    }
    const throwing = () => validateReservedPlacement(value)

    expect(throwing).not.toThrow()
  })
})

describe('validateOptionalPlacement', () => {
  it('should throw for `?` names behind a query', () => {
    const value = 'https://example.com/feed?alt=rss{?page}'
    const throwing = () => validateOptionalPlacement(value, '?', '?alt=rss')

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should throw for `&` names with no query', () => {
    const value = 'https://example.com/feed{&page}'
    const throwing = () => validateOptionalPlacement(value, '&', undefined)

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should take `&` names behind a query', () => {
    const value = 'https://example.com/feed?alt=rss{&page}'
    const throwing = () => validateOptionalPlacement(value, '&', '?alt=rss')

    expect(throwing).not.toThrow()
  })
})

describe('validateQueryPlaceholders', () => {
  it('should throw for a placeholder in the name of a pair with a value', () => {
    const value = 'https://example.com/feed?{name}=1'
    const throwing = () => validateQueryPlaceholders(value, [], [['{name}', '1']], '?{name}=1')

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should throw for a flag written escaped', () => {
    const value = 'https://example.com/spip.php?article%7Bid%7D'
    const throwing = () => {
      return validateQueryPlaceholders(value, ['article{id}'], [], '?article%7Bid%7D')
    }

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should take a placeholder in the name of a flag', () => {
    const value = 'https://example.com/spip.php?article{id}'
    const throwing = () => validateQueryPlaceholders(value, ['article{id}'], [], '?article{id}')

    expect(throwing).not.toThrow()
  })
})

describe('validateQueryValueNames', () => {
  it('should throw for a query name a placeholder also reads', () => {
    const value: TemplateNames = {
      template: 'https://example.com/{page}{?page}',
      queryValueNames: ['page'],
      placeholderNames: ['page'],
      reservedNames: [],
    }
    const throwing = () => validateQueryValueNames(value)

    expect(throwing).toThrow('Not a URL template: https://example.com/{page}{?page}')
  })

  it('should throw for a query name a reserved value also reads', () => {
    const value: TemplateNames = {
      template: 'https://example.com/{+url}{?url}',
      queryValueNames: ['url'],
      placeholderNames: [],
      reservedNames: ['url'],
    }
    const throwing = () => validateQueryValueNames(value)

    expect(throwing).toThrow('Not a URL template: https://example.com/{+url}{?url}')
  })

  it('should take query names no other part reads', () => {
    const value: TemplateNames = {
      template: 'https://example.com/{user}{?page}',
      queryValueNames: ['page'],
      placeholderNames: ['user'],
      reservedNames: [],
    }
    const throwing = () => validateQueryValueNames(value)

    expect(throwing).not.toThrow()
  })
})

describe('validateParamNames', () => {
  it('should throw for a parameter named twice', () => {
    const value = 'https://example.com/feed?types=page&types=post'
    const throwing = () => validateParamNames(value, ['types', 'types'])

    expect(throwing).toThrow(`Not a URL template: ${value}`)
  })

  it('should take parameters named once', () => {
    const value = 'https://example.com/feed?types=page&format=rss'
    const throwing = () => validateParamNames(value, ['types', 'format'])

    expect(throwing).not.toThrow()
  })
})

describe('validateReservedNames', () => {
  it('should throw for a reserved value read twice', () => {
    const value: TemplateNames = {
      template: 'https://example.com/{+url}#{+url}',
      queryValueNames: [],
      placeholderNames: [],
      reservedNames: ['url', 'url'],
    }
    const throwing = () => validateReservedNames(value)

    expect(throwing).toThrow('Not a URL template: https://example.com/{+url}#{+url}')
  })

  it('should throw for a reserved value a placeholder also reads', () => {
    const value: TemplateNames = {
      template: 'https://example.com/{url}/{+url}',
      queryValueNames: [],
      placeholderNames: ['url'],
      reservedNames: ['url'],
    }
    const throwing = () => validateReservedNames(value)

    expect(throwing).toThrow('Not a URL template: https://example.com/{url}/{+url}')
  })

  it('should take a reserved value read once', () => {
    const value: TemplateNames = {
      template: 'https://example.com/{user}/{+url}',
      queryValueNames: [],
      placeholderNames: ['user'],
      reservedNames: ['url'],
    }
    const throwing = () => validateReservedNames(value)

    expect(throwing).not.toThrow()
  })
})

describe('validateCheckRegex', () => {
  it.each(statefulChecks)('should throw for the stateful pattern %p', (value) => {
    const throwing = () => validateCheckRegex('id', value)

    expect(throwing).toThrow(
      'The check of id is a pattern with a g or y flag, which answers differently on a second call',
    )
  })

  it.each(unanchoredChecks)('should throw for the unanchored pattern %p', (value) => {
    const throwing = () => validateCheckRegex('id', value)

    expect(throwing).toThrow('The check of id is a pattern without ^ at its start and $ at its end')
  })

  it('should take an anchored pattern', () => {
    const throwing = () => validateCheckRegex('id', anchoredRegex)

    expect(throwing).not.toThrow()
  })
})

describe('validateListSplit', () => {
  const listSplit = {
    list: 'options',
    reserved: 'url',
  }

  it('should throw for a split with a check on neither value', () => {
    const throwing = () => validateListSplit('proxy', listSplit, ['user'])

    expect(throwing).toThrow(
      'The proxy row writes options in front of url with a check on neither, so the two are split by a guess',
    )
  })

  it.each(splitCheckNames)('should take a split with a check on %s', (value) => {
    const throwing = () => validateListSplit('proxy', listSplit, [value])

    expect(throwing).not.toThrow()
  })

  it('should take a template with no split', () => {
    const throwing = () => validateListSplit('proxy', undefined, [])

    expect(throwing).not.toThrow()
  })
})

describe('validateOpenTailPlacement', () => {
  it('should throw for an open tail in front of more of the path', () => {
    const value = parseTemplate('https://example.com/{/tail*}/feed')
    const throwing = () => validateOpenTailPlacement('feed', value)

    expect(throwing).toThrow('The feed row writes {/tail*} elsewhere than at the end of its path')
  })

  it('should throw for an open tail in the query', () => {
    const value = parseTemplate('https://example.com/{owner}?tab={/tail*}')
    const throwing = () => validateOpenTailPlacement('feed', value)

    expect(throwing).toThrow('The feed row writes {/tail*} elsewhere than at the end of its path')
  })

  it('should take an open tail at the end of the path', () => {
    const value = parseTemplate('https://example.com/feed{/tail*}')
    const throwing = () => validateOpenTailPlacement('feed', value)

    expect(throwing).not.toThrow()
  })
})

describe('validateEntityNames', () => {
  const params = parseTemplate('https://example.com/feed?alt=rss&amp;page=1').params

  it('should throw for a name that starts with `amp;` under the mark', () => {
    const throwing = () => validateEntityNames('feed', params, true)

    expect(throwing).toThrow(
      'The feed row sets amp;page, which the ampersand mark reads as another parameter',
    )
  })

  it('should take a name that starts with `amp;` without the mark', () => {
    const throwing = () => validateEntityNames('feed', params, false)

    expect(throwing).not.toThrow()
  })
})

describe('validateSemicolons', () => {
  it('should throw for a `;` in the query under the mark', () => {
    const throwing = () => validateSemicolons('feed', '?alt=rss;atom', { semicolon: true })

    expect(throwing).toThrow(
      'The feed row writes ; in its query, which the semicolon mark reads as a separator',
    )
  })

  it('should take a `;` in the query without the mark', () => {
    const throwing = () => validateSemicolons('feed', '?alt=rss;atom', undefined)

    expect(throwing).not.toThrow()
  })
})

describe('validateTenantHost', () => {
  it('should throw for a `{domain}` host with no tenant domains', () => {
    const throwing = () => validateTenantHost('blog', '{blog}.{domain}', 0)

    expect(throwing).toThrow('No hosts for the blog row')
  })

  it('should take a `{domain}` host with tenant domains', () => {
    const throwing = () => validateTenantHost('blog', '{blog}.{domain}', 1)

    expect(throwing).not.toThrow()
  })
})

describe('validateOpenTail', () => {
  it('should throw for an open tail behind a list', () => {
    const value = parseTemplate('https://example.com{/path*}/feed{/tail*}')
    const throwing = () => validateOpenTail('feed', value)

    expect(throwing).toThrow(
      'The feed row writes {/tail*} in a path with path, which takes several segments, so the two are split by a guess',
    )
  })

  it('should throw for an open tail beside a value named tail', () => {
    const value = parseTemplate('https://example.com/{tail}/feed{/tail*}')
    const throwing = () => validateOpenTail('feed', value)

    expect(throwing).toThrow('The feed row names a value tail, which {/tail*} is read as')
  })

  it('should take an open tail behind values of one segment', () => {
    const value = parseTemplate('https://example.com/{user}/feed{/tail*}')
    const throwing = () => validateOpenTail('feed', value)

    expect(throwing).not.toThrow()
  })
})

describe('validateCaseMark', () => {
  it('should throw for a marked value that shares a segment', () => {
    const value = parseTemplate('https://example.com/{user}-{lang}/feed')
    const throwing = () => validateCaseMark('feed', value, { case: ['lang'] })

    expect(throwing).toThrow(
      'The feed row marks the case of lang, which shares a part of its URL with another value',
    )
  })

  it('should throw for a marked value that shares a host label', () => {
    const value = parseTemplate('https://{blog}-{user}.example.com/feed')
    const throwing = () => validateCaseMark('feed', value, { case: ['blog'] })

    expect(throwing).toThrow(
      'The feed row marks the case of blog, which shares a part of its URL with another value',
    )
  })

  it('should throw for a marked value that shares a query value', () => {
    const value = parseTemplate('https://example.com/range.rss?r={from}-{to}')
    const throwing = () => validateCaseMark('feed', value, { case: ['to'] })

    expect(throwing).toThrow(
      'The feed row marks the case of to, which shares a part of its URL with another value',
    )
  })

  it('should throw for a marked value in a template with two lists', () => {
    const value = parseTemplate('https://example.com{/sections*}/{lang}{/tags*}')
    const throwing = () => validateCaseMark('feed', value, { case: ['lang'] })

    expect(throwing).toThrow(
      'The feed row marks the case of lang, which shares a part of its URL with another value',
    )
  })

  it('should take a marked value alone in its segment', () => {
    const value = parseTemplate('https://example.com/{user}/{lang}/feed')
    const throwing = () => validateCaseMark('feed', value, { case: ['lang'] })

    expect(throwing).not.toThrow()
  })
})

describe('validateListNames', () => {
  it('should throw for a name one template writes as a list and another as one value', () => {
    const value: Array<NamedTemplate> = [
      {
        key: 'archive',
        names: ['path*'],
      },
      {
        key: 'post',
        names: ['path'],
      },
    ]
    const throwing = () => validateListNames(value)

    expect(throwing).toThrow(
      'The post row writes path as one value, which another template writes as a list',
    )
  })

  it('should take a name every template writes as a list', () => {
    const value: Array<NamedTemplate> = [
      {
        key: 'archive',
        names: ['path*'],
      },
      {
        key: 'post',
        names: ['path*', 'id'],
      },
    ]
    const throwing = () => validateListNames(value)

    expect(throwing).not.toThrow()
  })
})

import { t } from 'trousse'
import locales from './locales.json' with { type: 'json' }
import { entityPrefix } from './queries.js'
import {
  isMultiSegment,
  type ListSplit,
  openTailName,
  openTailSuffix,
  type ParsedTemplate,
  placeholderRegex,
  splitPath,
  type TemplateParam,
  toBareName,
} from './templates.js'
import type { UrlLenient } from './types.js'

export type ValidateTemplateMatch = (
  template: string,
  base: string,
  match: RegExpExecArray | null,
) => asserts match is RegExpExecArray

// The parts of a template that tell whether a reserved value sits in its place.
export type ReservedPlacement = {
  template: string
  base: string
  // The scheme, the host and the query as written, where no reserved value sits.
  ownText: string
  reservedNames: Array<string>
  // The lists a reserved value may sit beside: the base and a list right in front of it.
  besideNames: Array<string>
}

// The names a template reads from the query, and the ones its other parts read.
export type TemplateNames = {
  template: string
  queryValueNames: Array<string>
  placeholderNames: Array<string>
  reservedNames: Array<string>
}

// A template whose list names every other template of the table must write as a list too.
export type NamedTemplate = {
  key: string
  names: Array<string>
}

const expressionRegex = /\{([^{}]*)\}/g
const braceRegex = /[{}]/
// An old spelling of a list and of the open tail, with the slash in front of the brace: `/{name*}`
// and `/{*}`. The slashes after the scheme are no path.
const oldListRegex = /(?<!\/)\/\{(\w*)\*\}/
// A value, and a list with its slash.
const plainExpressionRegex = /^(?:\w+|\/\w+\*)$/
// Query names a URL may carry, as `{?max-results,q}`, and behind a fixed query `{&q}`. A name may
// hold a hyphen, as the platforms write them. The last may be a passed query, as `{?page,query*}`.
const optionalQueryExpressionRegex = /^[?&][\w-]+(?:,[\w-]+)*\*?$/
// A reserved value, as `{+url}`.
const reservedExpressionRegex = /^\+\w+$/
const reservedAnywhereRegex = /\{\+[^{}]*\}/
// The whole fragment as one value, which ends a template: `{#section}`.
const fragmentExpressionRegex = /^#\w+$/
// A list and query names are no part of a fragment.
const fragmentRefusedRegex = /\{[/?&#]/

// The old spellings of the open tail anywhere else and of a passed query.
const oldTail = '{*}'
const oldQuery = '?{query}'

const throwInvalidTemplate = (template: string): never => {
  throw new Error(t(locales.errors.invalidTemplate, { template }))
}

// An old spelling is refused with the one that replaces it, a passed query as one no template
// takes, and any operator or modifier but a list with its slash.
export const validateExpressions = (template: string): void => {
  const throwOldSpelling = (expression: string, spelling: string): never => {
    throw new Error(t(locales.errors.oldTemplateSpelling, { template, expression, spelling }))
  }
  const oldList = oldListRegex.exec(template)

  if (oldList) {
    throwOldSpelling(oldList[0], `{/${oldList[1] || openTailName}*}`)
  }

  if (template.includes(oldQuery)) {
    throwOldSpelling(oldQuery, '{?query*}')
  }

  // A brace left once every expression is taken out opens or closes nothing, as `{/id*`.
  if (braceRegex.test(template.replace(expressionRegex, ''))) {
    throw new Error(t(locales.errors.unbalancedBrace, { template }))
  }

  for (const [expression, body] of template.matchAll(expressionRegex)) {
    if (expression === oldTail) {
      throwOldSpelling(oldTail, openTailSuffix)
    }

    if (plainExpressionRegex.test(body) || optionalQueryExpressionRegex.test(body)) {
      continue
    }

    if (reservedExpressionRegex.test(body) || fragmentExpressionRegex.test(body)) {
      continue
    }

    throw new Error(t(locales.errors.unsupportedTemplateExpression, { template, expression }))
  }
}

// A fragment holds no list or query names, and a `#` inside an expression cuts it in two, as
// `{#section}` in front of more of the template.
export const validateFragment = (
  template: string,
  body: string,
  fragment: string | undefined,
): void => {
  const isFragmentRefused =
    fragment !== undefined && (!fragment || fragmentRefusedRegex.test(fragment))
  const isCutExpression = braceRegex.test(body.replace(expressionRegex, ''))

  if (isFragmentRefused || isCutExpression || body.includes('#')) {
    throwInvalidTemplate(template)
  }
}

// A template is a scheme, a host and a path with its query, and its optional names close it.
export const validateTemplateMatch: ValidateTemplateMatch = (template, base, match) => {
  if (!match || base.includes('{?') || base.includes('{&')) {
    throwInvalidTemplate(template)
  }
}

// A reserved value sits in the path alone: a host takes no slash, and a query value reads whole.
// A list or an open tail shares the path with one by a guess, so only the lists beside it may.
export const validateReservedPlacement = (placement: ReservedPlacement): void => {
  const hasListBeside = [...placement.base.matchAll(placeholderRegex)].some(([, name]) => {
    return isMultiSegment(name) && !placement.besideNames.includes(name)
  })
  const misplaced = reservedAnywhereRegex.exec(
    placement.reservedNames.length > 0 && hasListBeside ? placement.template : placement.ownText,
  )

  if (misplaced) {
    const expression = misplaced[0]

    throw new Error(
      t(locales.errors.misplacedReserved, { template: placement.template, expression }),
    )
  }
}

// `{?a,b}` reads a template with no query, and `{&a,b}` one with a query.
export const validateOptionalPlacement = (
  template: string,
  operator: string | undefined,
  search: string | undefined,
): void => {
  if (operator !== undefined && (operator === '?') === Boolean(search)) {
    throwInvalidTemplate(template)
  }
}

// A placeholder names a parameter only in a flag, as `?article{id}`, and never one with a value,
// as `?{name}=1`, or one written escaped, as `?%7Bname%7D`.
export const validateQueryPlaceholders = (
  template: string,
  nameFlags: Array<string>,
  valueEntries: Array<[string, string]>,
  search: string | undefined,
): void => {
  const isEscapedName = nameFlags.some((name) => !(search ?? '').includes(name))

  if (isEscapedName || valueEntries.some(([name]) => name.includes('{'))) {
    throwInvalidTemplate(template)
  }
}

// A name read from the query and a placeholder of the same name would give one value two sources.
export const validateQueryValueNames = (names: TemplateNames): void => {
  const otherNames = [...names.placeholderNames, ...names.reservedNames]

  if (names.queryValueNames.some((name) => otherNames.includes(name))) {
    throwInvalidTemplate(names.template)
  }
}

// A parameter the template names twice, as `types=page&types=post`, has no one value to read.
export const validateParamNames = (template: string, paramNames: Array<string>): void => {
  if (paramNames.some((name, index) => paramNames.indexOf(name) !== index)) {
    throwInvalidTemplate(template)
  }
}

// A name read as written and decoded, or as written twice, would give one value two sources.
export const validateReservedNames = (names: TemplateNames): void => {
  const isRepeated = names.reservedNames.some((name, index) => {
    return names.placeholderNames.includes(name) || names.reservedNames.indexOf(name) !== index
  })

  if (isRepeated) {
    throwInvalidTemplate(names.template)
  }
}

// A pattern with a `g` or `y` flag answers differently on a second call, and one without both
// anchors takes a value that only holds a match.
export const validateCheckRegex = (name: string, check: RegExp): void => {
  if (check.global || check.sticky) {
    throw new Error(t(locales.errors.statefulCheckRegex, { name }))
  }

  if (!check.source.startsWith('^') || !check.source.endsWith('$')) {
    throw new Error(t(locales.errors.unanchoredCheckRegex, { name }))
  }
}

// A list in front of a reserved value shares its segments with it, and only a check tells where
// one ends.
export const validateListSplit = (
  key: string,
  listSplit: ListSplit | undefined,
  checkNames: Array<string>,
): void => {
  if (!listSplit) {
    return
  }

  if (!checkNames.includes(listSplit.list) && !checkNames.includes(listSplit.reserved)) {
    throw new Error(t(locales.errors.uncheckedListSplit, { key, ...listSplit }))
  }
}

// An open tail anywhere but at the end of the path, as `{/tail*}/feed`, has no end to read it to.
export const validateOpenTailPlacement = (key: string, parsed: ParsedTemplate): void => {
  if (`${parsed.host}${parsed.path}${parsed.search ?? ''}`.includes(openTailSuffix)) {
    throw new Error(t(locales.errors.misplacedOpenTail, { key }))
  }
}

// Behind another pair a name that starts with `amp;` is written `&amp;`, which a table under the
// mark reads as `&`.
export const validateEntityNames = (
  key: string,
  params: Array<TemplateParam>,
  isMarked: boolean,
): void => {
  if (!isMarked) {
    return
  }

  const name = params.map((param) => param.name).find((name) => name.startsWith(entityPrefix))

  if (name !== undefined) {
    throw new Error(t(locales.errors.ampersandEntityName, { key, name }))
  }
}

// A `;` the row writes in its own query is a separator to a table under the mark.
export const validateSemicolons = (
  key: string,
  search: string | undefined,
  lenient: UrlLenient | undefined,
): void => {
  if (lenient?.semicolon === true && search?.includes(';')) {
    throw new Error(t(locales.errors.semicolonInQuery, { key }))
  }
}

// A `{domain}` host reads only the tenant domains, so a table without them reads none.
export const validateTenantHost = (key: string, host: string, tenantCount: number): void => {
  if (host.includes('{domain}') && tenantCount === 0) {
    throw new Error(t(locales.errors.missingHosts, { key }))
  }
}

// A list takes every segment it can, so the tail behind it starts at a guess.
export const validateOpenTail = (key: string, parsed: ParsedTemplate): void => {
  if (!parsed.isOpen) {
    return
  }

  const pathNames = [...parsed.path.matchAll(placeholderRegex)].map(([, name]) => name)
  const multiSegmentName = pathNames.find(isMultiSegment)

  if (multiSegmentName !== undefined) {
    const name = toBareName(multiSegmentName)

    throw new Error(t(locales.errors.openTailBesideMultiSegment, { key, name }))
  }

  if (parsed.names.some((name) => toBareName(name) === openTailName)) {
    throw new Error(t(locales.errors.openTailName, { key }))
  }
}

// Two values in one host label, path segment or query value are split by a guess, and a
// lowercase can move the split to another place. So are two lists in one template.
export const validateCaseMark = (
  key: string,
  parsed: ParsedTemplate,
  lenient: UrlLenient | undefined,
): void => {
  const hasTwoMultiSegment = parsed.names.filter(isMultiSegment).length > 1
  const sharedPieces = hasTwoMultiSegment
    ? [parsed.text]
    : [
        ...parsed.host.split('.'),
        ...splitPath(parsed.path),
        ...parsed.params.map((param) => param.value),
        ...parsed.nameFlags,
      ]
  const name = sharedPieces
    .map((piece) => [...piece.matchAll(placeholderRegex)].map(([, name]) => toBareName(name)))
    .filter((pieceNames) => pieceNames.length > 1)
    .flat()
    .find((name) => lenient?.case?.includes(name))

  if (name !== undefined) {
    throw new Error(t(locales.errors.sharedCaseMark, { key, name }))
  }
}

// A name written as a list in one template and as one value in another builds the list joined
// in the one-value slot, as `/events,RSS/RSS` from values read beside the list.
export const validateListNames = (templates: Array<NamedTemplate>): void => {
  const listNames = templates.flatMap((template) => {
    return template.names.filter(isMultiSegment).map(toBareName)
  })

  for (const template of templates) {
    const name = template.names.find((name) => listNames.includes(name))

    if (name) {
      throw new Error(t(locales.errors.mixedListName, { key: template.key, name }))
    }
  }
}

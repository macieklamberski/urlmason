import {
  coerceArray,
  decodePercent,
  encodePathSegment,
  escapeRegex,
  getQueryParamValues,
  isAnyOf,
  isBoolean,
  isHttpUrl,
  isNullish,
  isNumber,
  isObject,
  isPlainObject,
  isPresent,
  isString,
  parseUrl,
  trimArray,
} from 'trousse'
import {
  appendValue,
  encodeText,
  entityPrefix,
  isNamed,
  nonAsciiRegex,
  parseQuery,
  type QueryPair,
  toPair,
  toSearchParams,
  writeQuery,
} from './queries.js'
import {
  type TemplateNames,
  validateAdjacentValues,
  validateBasePlacement,
  validateExpressions,
  validateFragment,
  validateHostNames,
  validateOptionalPlacement,
  validateParamNames,
  validateQueryPlaceholders,
  validateQueryValueNames,
  validateReservedNames,
  validateReservedPlacement,
  validateTemplateMatch,
} from './rules.js'
import type { UrlEncoding, UrlLenient, UrlMap, UrlValue, UrlValues } from './types.js'

export type TemplatePart = 'host' | 'path' | 'query' | 'fragment'

export type MapText = (text: string) => string

// The pattern of a value, and of one character of it where a value can sit behind fixed text.
export type Capture = {
  source: string
  unit?: string
  // The length a path segment holding two values or more is read up to.
  segmentMaxLength?: number
}

// A placeholder a pattern captures, with the part of the URL it sits in, and whether its value
// spans several path segments, as a list and the open tail do.
export type Captured = {
  name: string
  part: TemplatePart
  isList: boolean
}

// A parameter a template sets itself, as `alt=rss`, `id={id}` or the flag `rss`.
export type TemplateParam = {
  name: string
  value: string
  isFlag: boolean
  isFilled: boolean
}

// A value as its group reads it. The path is matched with a decoded `%` and `/` written as `%25` and
// `%2F`, so a value there decodes once more, and a list is cut at the slashes left.
const toGroupValue = (captured: Captured, value: string): UrlValue => {
  if (captured.part !== 'path') {
    return value
  }

  if (!captured.isList) {
    return decodePercent(value)
  }

  return value
    .split('/')
    .filter((segment) => segment)
    .map(decodePercent)
}

const asciiUpperCaseRegex = /[A-Z]+/g

// A text with its ASCII letters in lowercase, as the case mark lowercases a value whose other
// letters are percent escapes.
export const toAsciiLowerCaseText = (text: string): string => {
  return text.replace(asciiUpperCaseRegex, (letters) => letters.toLowerCase())
}

// A template read into its parts. Its text writes a list as `{/name*}` and the open tail as
// `{/tail*}`.
export type ParsedTemplate = {
  text: string
  scheme: string
  host: string
  // The path without the open tail.
  path: string
  // The query as written, with its question mark.
  search?: string
  isOpen: boolean
  // The placeholders but the open tail, a list as `name*`.
  names: Array<string>
  params: Array<TemplateParam>
  // The query names a URL may carry, as `{?max-results,q}` or, behind a query, `{&q}`.
  optionalNames: Array<string>
  // The values read as the URL spells them, as `url` of `/proxy/{+url}`. The path writes each as
  // `{url}`.
  reservedNames: Array<string>
  // The one that ends a template with no query, and takes the rest of a URL, its query included.
  restName?: string
  // A list right in front of a reserved value, as `{/options*}/{+source}`, which share segments.
  listSplit?: ListSplit
  // The fragment without its `#`, as `!/video/{id}`, each reserved value written as `{name}`.
  fragment?: string
  fragmentReservedNames: Array<string>
  // The flags whose name holds a value, as `article{id}` of `?article{id}`.
  nameFlags: Array<string>
  // The names of the query as written, a flag whose name holds a value included.
  queryOrder: Array<string>
  // The pairs no other part of the template names, as `query` of `{?query*}`.
  passedName?: string
}

export type CompiledNameFlag = {
  text: string
  // The names of URL pairs it takes, decoded, and as written for a URL read in its own spelling.
  regex: RegExp
  rawRegex: RegExp
}

export type ListSplit = {
  list: string
  reserved: string
}

export type CompiledParam = TemplateParam & {
  // The name as the template writes it, which a URL written as the template is spells the same way.
  writtenName: string
  // The pair as the template writes it: whole for a flag and a fixed value, `name=` where a value
  // fills it.
  pair: QueryPair
  // The values the template takes, decoded, and the ones of a URL in its own spelling.
  regex: RegExp
  rawRegex: RegExp
}

export type CaptureIn = (part: TemplatePart) => (name: string, source: string) => string

export type CompiledTemplate = Omit<ParsedTemplate, 'params' | 'nameFlags'> & {
  params: Array<CompiledParam>
  nameFlags: Array<CompiledNameFlag>
  // The path matched on the decoded path without its trailing slash, with the open tail behind it
  // read as `tail`, and the path as the template writes it, for a URL read in its own spelling.
  readPathSource: string
  rawPathSource: string
  // Every placeholder is captured as `p{index}`, so a match is read back to its values.
  captureIn: CaptureIn
  getCaptured: (group: string) => Captured | undefined
  // The values of a match of the host and path, with the ones of the query, or undefined where the
  // query lacks a parameter the template sets.
  read: (
    groups: Record<string, string> | undefined,
    getSearchParams: () => URLSearchParams,
  ) => Record<string, UrlValue> | undefined
  // The value of each placeholder, or undefined where one has none.
  getValues: (params: UrlValues) => Record<string, UrlValue> | undefined
  // The URL the values of `getValues` write, or undefined where it is no URL.
  fill: (values: Record<string, UrlValue>, encoding?: UrlEncoding) => string | undefined
  // The values of a fragment the template takes, given without its `#`, beside the values read
  // elsewhere in the URL: decoded, and as a match of the fragment as written for a URL read in its
  // own spelling.
  readFragment: (
    hash: string,
    known: Record<string, UrlValue>,
  ) => Record<string, UrlValue> | undefined
  readRawFragment: (hash: string) => RegExpExecArray | undefined
  // The pairs in the order the template writes them, and every other pair behind them as given.
  orderPairs: (pairs: Array<QueryPair>) => Array<QueryPair>
  // A value as a pretty build writes it in a part of the URL other than the host.
  encodeValue: (value: string, part: Exclude<TemplatePart, 'host'>) => string
  // Fixed query text and a name as the template writes them, and a pair as its text writes it.
  encodeQueryText: MapText
  encodeQueryName: MapText
  toWrittenPair: (text: string) => QueryPair
}

// A list holds the slash in front of it, `{/name*}`, which the name leaves out.
export const placeholderRegex = /\{\/?(\w+\*?)\}/g
export const trailingSlashRegex = /\/$/

// A host ends where a path, a query or a list starts, as `{host}{/base*}`.
const templateRegex =
  /^(https?|\{scheme\}):\/\/((?:[^/?#{]|\{[^/{}]*\})+)((?:\/|\{\/)[^?#]*)?(\?(?!\?)[^#]*)?$/i
// Query names a URL may carry, as `{?max-results,q}`, and behind a fixed query `{&q}`. A name may
// hold a hyphen, as the platforms write them. The last may be a passed query, as `{?page,query*}`.
const optionalQueryRegex = /\{([?&])([\w-]+(?:,[\w-]+)*\*?)\}$/
// A reserved value, as `{+url}`.
const reservedRegex = /\{\+(\w+)\}/g
const listSplitRegex = /\{\/(\w+)\*\}\/\{\+(\w+)\}/
// The whole fragment as one value, which ends a template: `{#section}`.
const fragmentSuffixRegex = /\{#(\w+)\}$/
const tripletRegex = /^%[0-9a-f]{2}$/i
// An escape, kept by `split`.
const singleEscapeRegex = /(%[0-9a-f]{2})/i
// The ASCII characters outside RFC 6570's unreserved and reserved sets, but the control ones.
const unreservedOtherRegex = /[^\w\-.~:/?#[\]@!$&'()*+,;=\P{ASCII}\p{Cc}]/gu
const reservedEndRegex = /[?#]/
const strayPercentRegex = /%(?![0-9a-f]{2})/gi
// A run of escapes, as `%E0%A4%85`, kept by `split`.
const escapeRunRegex = /((?:%[0-9a-f]{2})+)/i
const hexLetterRegex = /[a-f]/i
// The characters `encodeURIComponent` leaves that RFC 6570 encodes outside the unreserved set.
const subDelimiterRegex = /[!'()*]/g
// A scheme and host with no path, where a parser reads the path `/` before a query.
const pathlessBaseRegex = /^[^/]+:\/\/[^/]+$/
const ownGroupRegex = /^p\d+$/
// A `.` or `..` segment is resolved away by a parser, so a URL holding one names another path.
export const dotSegmentRegex = /^(?:\.|%2e){1,2}$/i

// The characters that end a host in a URL.
const hostDelimiterRegex = /[/?#@\\]/
const nonAsciiLabelRegex = /\P{ASCII}/u
const loneSurrogateRegex = /\p{Cs}/u

export const schemePlaceholder = '{scheme}'
// The folder a site sits in, `{/base*}` behind the host.
export const basePlaceholder = '{/base*}'
// The open tail: `{/tail*}` at the end of a path, which checks see as the value `tail`.
export const openTailName = 'tail'
export const openTailSuffix = '{/tail*}'

// The lists that may hold no segment: the folder and the open tail.
const emptyListNames = ['base*', `${openTailName}*`]
const captureGroupPrefix = 'p'
const multiSegmentCapture = '[^/]+(?:/[^/]+)*'
// A reserved value takes the least text that lets the rest of the template read.
const reservedCapture = '[^]+?'
// A list in front of a reserved value takes the fewest segments, the first split to try.
const shortMultiSegmentCapture = '[^/]+(?:/[^/]+)*?'
// Two values side by side make a pattern retry every split of the text they share, so a part of a
// URL holding two or more is read only up to this length. No real path segment comes near it.
export const sharedPartMaxLength = 1000
// A URL read as written spells a character of its decoded text in up to nine, as `%E2%80%A8`.
const writtenPartMaxLength = sharedPartMaxLength * 9

// A part of at most `maxLength` characters up to the end, or up to the next of the stops.
export const toLengthGuard = (maxLength: number, stops?: string): string => {
  if (!stops) {
    return `(?=[^]{0,${maxLength}}$)`
  }

  return `(?=[^${stops}]{0,${maxLength}}(?:[${stops}]|$))`
}

// A text split at its placeholders holds one between each two pieces of fixed text.
const countValues = (pieces: Array<string>): number => {
  return Math.floor(pieces.length / 2)
}

// A reserved value crosses slashes, so one with a value behind it shares the whole text with it.
const hasValueBehindReserved = (text: string, reservedNames: Array<string>): boolean => {
  const pieces = text.split(placeholderRegex)

  return pieces.some((piece, index) => {
    return index % 2 === 1 && index < pieces.length - 2 && reservedNames.includes(piece)
  })
}

const pathCapture: Capture = {
  source: '[^/]+',
  unit: '[^/]',
  segmentMaxLength: sharedPartMaxLength,
}
const writtenPathCapture: Capture = { ...pathCapture, segmentMaxLength: writtenPartMaxLength }
// A query value can hold a line break, which `.` leaves out.
const queryCapture: Capture = { source: '[^]+', unit: '[^]' }

export const isMultiSegment = (placeholder: string): boolean => {
  return placeholder.endsWith('*')
}

export const toBareName = (placeholder: string): string => {
  return isMultiSegment(placeholder) ? placeholder.slice(0, -1) : placeholder
}

const isEmptyList = (placeholder: string): boolean => {
  return emptyListNames.includes(placeholder)
}

// A path a list or a string of segments names, as `['forum']` or `/forum/`, without empty ones.
export const toSegments = (value: UrlValue | undefined): Array<string> => {
  if (isPlainObject(value)) {
    return []
  }

  return (isString(value) ? value.split('/') : (value ?? [])).filter((segment) => segment)
}

// A map as the names and values it holds, one after another, as `['lang', 'en']`.
const toMapItems = (map: UrlMap): Array<string> => {
  return toMapEntries(map).flat()
}

// A map as its names and values, a name with a list once per item.
const toMapEntries = (map: UrlMap): Array<[string, string]> => {
  return Object.entries(map).flatMap(([name, value]) => {
    return coerceArray(value).map((item): [string, string] => [name, item])
  })
}

// Text a value builds from: a string, a number or a boolean, or nothing. A lone surrogate, as text
// cut inside an emoji, has no UTF-8 form.
const isTypedText = (item: unknown): boolean => {
  if (isString(item)) {
    return !loneSurrogateRegex.test(item)
  }

  return isNullish(item) || isNumber(item) || isBoolean(item)
}

// Whether a value builds: text, a list of text, or a map of text or lists of text.
export const isTypedValue = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.every(isTypedText)
  }

  if (!isObject(value)) {
    return isTypedText(value)
  }

  return Object.entries(value).every(([name, item]) => {
    return isTypedText(name) && (Array.isArray(item) ? item.every(isTypedText) : isTypedText(item))
  })
}

// A value as the types write it: a number or a boolean as its text, null as no value, and a map of
// any prototype as a plain one. A list item or a map entry that holds nothing is left out.
const toTypedValue = (value: unknown): UrlValue | undefined => {
  const toTexts = (items: Array<unknown>): Array<string> => items.filter(isPresent).map(String)

  if (isNullish(value)) {
    return
  }

  if (Array.isArray(value)) {
    return toTexts(value)
  }

  if (!isObject(value)) {
    return String(value)
  }

  const map: UrlMap = {}

  for (const [name, item] of Object.entries(value)) {
    if (Array.isArray(item)) {
      map[name] = toTexts(item)

      continue
    }

    if (isPresent(item)) {
      map[name] = String(item)
    }
  }

  return map
}

// A list is one or more segments, and `base` and `tail` zero or more. An empty segment is dropped,
// as a doubled slash names the same page, and any other list with no segment left is no value. A
// string is read as segments joined by `/`, and a list is no value of a placeholder of one segment.
const getPlaceholderValue = (params: UrlValues, placeholder: string): UrlValue | undefined => {
  const value = toTypedValue(params[toBareName(placeholder)])

  // A map with no name is no value, as a list with no item.
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) {
      return
    }

    return value
  }

  // A list in a slot of one value is written as its items joined by commas, without empty ones, as
  // a list slot drops them, and no item left is no value.
  if (!isMultiSegment(placeholder)) {
    return Array.isArray(value) ? trimArray(value) : value
  }

  const segments = toSegments(value)

  if (segments.length === 0 && !isEmptyList(placeholder)) {
    return
  }

  return segments
}

// A path with the slash of each list moved in front of its brace, `/{name*}`, so it splits into
// its segments at every slash.
export const splitPath = (path: string): Array<string> => {
  return path.replaceAll('{/', '/{').split('/')
}

// A value as one text, as its slot writes it: in a list slot a segment per item and a `name=value`
// segment per name of a map, and in a slot of one value its items joined by commas.
export const toSlotText = (value: UrlValue, placeholder: string): string => {
  if (!isMultiSegment(placeholder)) {
    return (isPlainObject(value) ? toMapItems(value) : coerceArray(value)).join(',')
  }

  if (!isPlainObject(value)) {
    return coerceArray(value).join('/')
  }

  return toMapEntries(value)
    .map(([name, item]) => `${name}=${item}`)
    .join('/')
}

// A value as text, as a check sees it: a list as its segments joined by `/`.
export const toValueText = (value: UrlValue): string => {
  if (isPlainObject(value)) {
    return toMapItems(value).join(',')
  }

  return Array.isArray(value) ? value.join('/') : value
}

// The bytes of the UTF-8 sequence a first byte opens, and 0 for a byte that opens none.
const toSequenceLength = (byte: number): number => {
  if (byte < 0x80) {
    return 1
  }

  if (byte >= 0xc2 && byte < 0xe0) {
    return 2
  }

  if (byte >= 0xe0 && byte < 0xf0) {
    return 3
  }

  return byte >= 0xf0 && byte < 0xf5 ? 4 : 0
}

// A run of escapes with each character it holds written by `encode`. An escape that decodes to no
// character, as `%E0%A4` of a cut-off `अ`, stays as written, as `{+x}` keeps it.
const encodeEscapeRun = (run: string, encode: MapText): string => {
  let written = ''
  let index = 0

  while (index < run.length) {
    const length = toSequenceLength(Number.parseInt(run.slice(index + 1, index + 3), 16)) * 3
    const sequence = run.slice(index, index + length)
    // A sequence that decodes is one character. decodePercent keeps one that doesn't as written.
    const decoded = decodePercent(sequence)

    if (length === 0 || decoded === sequence || [...decoded].length > 1) {
      written += run.slice(index, index + 3)
      index += 3

      continue
    }

    written += encode(decoded)
    index += length
  }

  return written
}

// A value with its valid escapes decoded and written again by `encode`, so `Hello%21` and
// `Hello!` are one value, and a URL read and built again is the URL it was.
const encodeDecoded = (value: string, encode: MapText): string => {
  return value
    .split(escapeRunRegex)
    .map((piece, index) => (index % 2 === 0 ? encode(piece) : encodeEscapeRun(piece, encode)))
    .join('')
}

// Text of a path segment as pages link it: every character a segment allows kept, a `%` written
// as `%25` and non-ASCII percent-encoded, so `caf%C3%A9` and `café` agree.
const encodePathText = (text: string): string => {
  return encodePathSegment(text.replaceAll('%', '%25'))
    .replace(strayPercentRegex, '%25')
    .replace(nonAsciiRegex, encodeURIComponent)
}

const encodePathValue = (value: string): string => {
  return encodeDecoded(value, encodePathText)
}

// A value in a slot of one value, as `{id}`. A list is its items joined by commas, each item's own
// commas encoded, so the separators stay apart from them.
const encodeSlot = (value: UrlValue, encode: (value: string) => string): string => {
  const items = isPlainObject(value) ? toMapItems(value) : value

  if (!Array.isArray(items)) {
    return encode(items)
  }

  return items.map((item) => encode(item).replaceAll(',', '%2C')).join(',')
}

// A query value or flag name filled: each value in its slot, and the fixed text around it.
const fillQueryValue = (
  template: string,
  values: Record<string, UrlValue>,
  encodeValue: MapText,
  encodeFixedText: MapText,
): string => {
  return mapTemplate(template, (name) => encodeSlot(values[name], encodeValue), encodeFixedText)
}

// A map in a list slot, one `name=value` segment per name.
const encodeMapSegments = (map: UrlMap, encode: (value: string) => string): string => {
  return toMapEntries(map)
    .map(([name, value]) => `${encode(name)}=${encode(value)}`)
    .join('/')
}

const encodePath = (value: string | Array<string>): string => {
  return Array.isArray(value) ? value.map(encodePathValue).join('/') : encodePathValue(value)
}

export const encodeLiteral = (text: string): string => {
  return text.replace(nonAsciiRegex, encodeURIComponent)
}

const toPercentEscape = (character: string): string => {
  return `%${character.charCodeAt(0).toString(16).toUpperCase()}`
}

// A value as RFC 6570 writes it: every character outside the unreserved set encoded, `%` too.
const encodeStrictValue = (value: string): string => {
  return encodeURIComponent(value).replace(subDelimiterRegex, toPercentEscape)
}

// A query name or value spelled strictly. A `+` stays, since a server may read it as a space.
const encodeStrictQueryText = (text: string): string => {
  return text
    .split('+')
    .map((piece) => encodeDecoded(piece, encodeStrictValue))
    .join('+')
}

// A query pair spelled strictly, its name and value split at the first `=`, as a server reads it.
export const toStrictPair = (pair: QueryPair): QueryPair => {
  const separator = pair.text.indexOf('=')

  if (separator === -1) {
    return toPair(encodeStrictQueryText(pair.text))
  }

  const name = encodeStrictQueryText(pair.text.slice(0, separator))
  const value = encodeStrictQueryText(pair.text.slice(separator + 1))

  return toPair(`${name}=${value}`)
}

// A value as RFC 6570 writes a reserved one: the reserved characters and every escape kept, so a
// URL stays a URL, and everything else outside the unreserved set encoded.
const encodeReservedValue = (value: string): string => {
  return value
    .split(singleEscapeRegex)
    .map((piece, index) => {
      if (index % 2 === 1) {
        return piece
      }

      return piece
        .replace(unreservedOtherRegex, toPercentEscape)
        .replace(nonAsciiRegex, encodeURIComponent)
    })
    .join('')
}

// A reserved value in its slot. A list is its items joined by commas, each item's own kept.
const encodeReservedSlot = (value: UrlValue): string => {
  const items = isPlainObject(value) ? toMapItems(value) : coerceArray(value)

  return items.map(encodeReservedValue).join(',')
}

const encodeStrict = (value: string | Array<string>): string => {
  return Array.isArray(value) ? value.map(encodeStrictValue).join('/') : encodeStrictValue(value)
}

// A path decoded segment by segment, so `%40` and `@` compare equal. A decoded `%` and `/` are
// written back as `%25` and `%2F`, so `%252F` stays apart from `%2F` and no segment splits.
const decodeComparableSegment = (segment: string): string => {
  return decodePercent(segment).replaceAll('%', '%25').replaceAll('/', '%2F')
}

export const decodePath = (path: string): string => {
  if (!path.includes('%')) {
    return path
  }

  return path.split('/').map(decodeComparableSegment).join('/')
}

// The text at an index of a segment that decodes on its own: a character, or the escapes of one.
const toDecodedUnit = (segment: string, index: number): string => {
  const triplet = segment.slice(index, index + 3)

  if (!tripletRegex.test(triplet)) {
    return segment[index]
  }

  const length = toSequenceLength(Number.parseInt(triplet.slice(1), 16)) * 3
  const sequence = segment.slice(index, index + length)
  const decoded = decodePercent(sequence)

  // An escape that opens no character of its own is kept as written, alone.
  return length === 0 || decoded === sequence || [...decoded].length > 1 ? triplet : sequence
}

// The length as written of the first characters of a decoded segment, or undefined where they
// end inside a character as written, as between the two escapes of `é`.
const toWrittenLength = (segment: string, length: number): number | undefined => {
  if (!segment.includes('%')) {
    return length
  }

  let written = 0
  let decoded = 0

  while (decoded < length && written < segment.length) {
    const unit = toDecodedUnit(segment, written)

    decoded += decodeComparableSegment(unit).length
    written += unit.length
  }

  if (decoded !== length) {
    return
  }

  return written
}

// Where an offset in a decoded path sits in the path as written.
export const toWrittenOffset = (path: string, offset: number): number | undefined => {
  // A path without an escape is written as it decodes.
  if (!path.includes('%')) {
    return offset
  }

  let written = 0
  let decoded = 0

  for (const segment of path.split('/')) {
    const decodedLength = decodeComparableSegment(segment).length

    if (offset <= decoded + decodedLength) {
      const length = toWrittenLength(segment, offset - decoded)

      if (length === undefined) {
        return
      }

      return written + length
    }

    written += segment.length + 1
    decoded += decodedLength + 1
  }
}

// A query on a host with no path sits behind the slash of its root, as `example.com/?rss`.
export const writeBase = (base: string, pairs: Array<QueryPair>): string => {
  return pairs.length > 0 && pathlessBaseRegex.test(base) ? `${base}/` : base
}

// A template text with each placeholder and each piece of text around one written anew. A list
// holds the slash in front of it, so a list written as nothing leaves out the slash too.
export const mapTemplate = (
  text: string,
  mapPlaceholder: MapText,
  mapLiteral: MapText = (literal) => literal,
): string => {
  return text
    .split(placeholderRegex)
    .map((piece, index) => {
      if (index % 2 === 0) {
        return mapLiteral(piece)
      }

      const value = mapPlaceholder(piece)

      return isMultiSegment(piece) && value ? `/${value}` : value
    })
    .join('')
}

// A value behind another value and fixed text never holds that text with more of the value after
// it: the value in front takes all it can. A pattern that says so reads a long run of the fixed
// text once, where one that does not tries every split of it.
const toLaterSource = ({ unit }: Capture, separator: string): string | undefined => {
  // The value in front can only take fixed text it can hold, as text without a slash in a path.
  if (!unit || !new RegExp(`^(?:${unit})+$`).test(separator)) {
    return
  }

  // Text free of the fixed text, then an end no longer than it, which can be the fixed text.
  return `(?:(?!${escapeRegex(separator)})${unit})*${unit}{1,${separator.length}}`
}

// A hex digit of an escape in either case, as RFC 3986 reads `%c3` and `%C3` as one escape.
const toHexDigitSource = (digit: string): string => {
  return hexLetterRegex.test(digit) ? `[${digit.toUpperCase()}${digit.toLowerCase()}]` : digit
}

// Fixed text as a pattern that takes each of its escapes in either case of hex.
const toLiteralSource = (text: string): string => {
  return text
    .split(singleEscapeRegex)
    .map((piece, index) => {
      if (index % 2 === 0) {
        return escapeRegex(piece)
      }

      return `%${toHexDigitSource(piece[1])}${toHexDigitSource(piece[2])}`
    })
    .join('')
}

// A placeholder becomes the capture, the text around it a literal, decoded for a path so an
// encoded brace in it stays a literal, and encoded for a raw query value as the template writes it.
export const toRegexSource = (
  text: string,
  wrapCapture: (name: string, source: string) => string,
  capture: Capture,
  captures: Record<string, string> = {},
  mapLiteral: MapText = (literal) => literal,
  patterns: Record<string, string> = {},
  // The values that take the least text, so the one behind takes all that is left.
  shortNames: Array<string> = [],
): string => {
  const pieces = text
    .split(placeholderRegex)
    .map((piece, index) => (index % 2 === 1 ? piece : mapLiteral(piece)))

  // The values of the segment that starts in a piece of fixed text, up to the next slash or list.
  const countSegmentValues = (index: number): number => {
    const end = pieces.findIndex((piece, later) => {
      return later > index && (later % 2 === 0 ? piece.includes('/') : isMultiSegment(piece))
    })

    return countValues(pieces.slice(index, end === -1 ? undefined : end))
  }

  return pieces
    .map((piece, index) => {
      if (index % 2 === 0) {
        const slash = piece.lastIndexOf('/')

        // A text that opens on its values opens a segment too, as a fragment of `#{a}{b}` does.
        if (
          !capture.segmentMaxLength ||
          (slash === -1 && index > 0) ||
          countSegmentValues(index) < 2
        ) {
          return toLiteralSource(piece)
        }

        const head = toLiteralSource(piece.slice(0, slash + 1))
        const tail = toLiteralSource(piece.slice(slash + 1))

        return `${head}${toLengthGuard(capture.segmentMaxLength, '/')}${tail}`
      }

      const frontPattern = index > 1 ? patterns[pieces[index - 2]] : undefined
      // A value in front that its pattern ends before the fixed text leaves the rest to this one.
      const isFreed =
        frontPattern !== undefined && !new RegExp(`^${frontPattern}$`, 'i').test(pieces[index - 1])
      const isBehindShort = shortNames.includes(pieces[index - 2])
      const laterSource =
        index > 1 && !isFreed && !isBehindShort
          ? toLaterSource(capture, pieces[index - 1])
          : undefined

      const source = wrapCapture(
        piece,
        captures[piece] ?? patterns[piece] ?? laterSource ?? capture.source,
      )

      // A list holds the slash in front of it, so a list that may be empty leaves out both.
      if (!isMultiSegment(piece)) {
        return source
      }

      return isEmptyList(piece) ? `(?:/${source})?` : `/${source}`
    })
    .join('')
}

// A template without its fragment, and the fragment: the text behind a `#`, or `{#name}` at the
// end, which is the whole fragment as a reserved value.
const cutFragment = (template: string): [body: string, fragment?: string] => {
  const suffix = fragmentSuffixRegex.exec(template)

  if (suffix) {
    return [template.slice(0, suffix.index), `{+${suffix[1]}}`]
  }

  const index = template.indexOf('#')

  return index === -1 ? [template] : [template.slice(0, index), template.slice(index + 1)]
}

// A host as a parsed URL spells it: in lowercase, with a label outside ASCII in punycode. A label
// that holds a placeholder is left as written.
export const toAsciiHost = (host: string): string => {
  const toAsciiLabel = (label: string): string => {
    if (label.includes('{')) {
      return label
    }

    if (!nonAsciiLabelRegex.test(label)) {
      return label.toLowerCase()
    }

    return parseUrl(`https://${label}`)?.host ?? label
  }

  return host.split('.').map(toAsciiLabel).join('.')
}

// A template as its scheme, host, path, query parameters and fragment.
export const parseTemplate = (template: string): ParsedTemplate => {
  validateExpressions(template)

  const [body, givenFragment] = cutFragment(template)

  validateFragment(template, body, givenFragment)

  // The optional names close the template: `{?a,b}` where it has no query, `{&a,b}` behind one.
  const optional = optionalQueryRegex.exec(body)
  const base = optional ? body.slice(0, optional.index) : body
  const match = templateRegex.exec(base)

  validateTemplateMatch(template, base, match)

  const [, scheme, givenHost, givenPath = '', search] = match
  const host = toAsciiHost(givenHost)
  const reservedNames = [...givenPath.matchAll(reservedRegex)].map(([, name]) => name)
  const split = listSplitRegex.exec(givenPath)
  const hasSplit = split !== null && `{/${split[1]}*}` !== basePlaceholder
  const listSplit = hasSplit ? { list: split[1], reserved: split[2] } : undefined
  const baseNames = givenPath.startsWith(basePlaceholder) ? ['base*'] : []
  const splitNames = listSplit ? [`${listSplit.list}*`] : []

  validateReservedPlacement({
    template,
    base,
    ownText: `${scheme}${host}${search ?? ''}`,
    reservedNames,
    besideNames: [...baseNames, ...splitNames],
  })
  validateOptionalPlacement(template, optional?.[1], search)

  const queryNames = optional ? optional[2].split(',') : []
  const passedName = queryNames.at(-1)?.endsWith('*') ? queryNames.pop()?.slice(0, -1) : undefined
  const optionalNames = queryNames
  const isOpen = givenPath.endsWith(openTailSuffix)
  const entries = search ? [...toSearchParams(parseQuery(search))] : []

  const isNameFlag = ([name, value]: [string, string]): boolean => name.includes('{') && !value
  const nameFlags = entries.filter(isNameFlag).map(([name]) => name)
  const valueEntries = entries.filter((entry) => !isNameFlag(entry))

  validateQueryPlaceholders(template, nameFlags, valueEntries, search)

  // A name with no value, such as `?rss`, is a flag, built with no value.
  const flagNames = valueEntries.filter(([, value]) => !value).map(([name]) => name)
  const params = valueEntries.map(([name, value]): TemplateParam => {
    const isFlag = flagNames.includes(name)
    const isFilled = !isFlag && value.includes('{')
    const param: TemplateParam = {
      name,
      value,
      isFlag,
      isFilled,
    }

    return param
  })
  const paramNames = [
    ...params.map((param) => param.name),
    ...optionalNames,
    ...(passedName === undefined ? [] : [passedName]),
  ]
  const fragmentText = givenFragment ?? ''
  const fragmentReservedNames = [...fragmentText.matchAll(reservedRegex)].map(([, name]) => name)
  const fragment = givenFragment?.replace(reservedRegex, '{$1}')
  const placeholderNames = [...`${base}${fragmentText}`.matchAll(placeholderRegex)].map(
    ([, name]) => toBareName(name),
  )

  const names: TemplateNames = {
    template,
    queryValueNames: paramNames.slice(params.length),
    placeholderNames,
    reservedNames: [...reservedNames, ...fragmentReservedNames],
  }

  validateQueryValueNames(names)
  validateParamNames(template, paramNames)

  const plainPath = givenPath.replace(reservedRegex, '{$1}')
  const path = isOpen ? plainPath.slice(0, -openTailSuffix.length) : plainPath

  validateReservedNames(names)
  validateAdjacentValues(template)
  validateHostNames(template, [
    ...[...`${givenPath}${search ?? ''}${fragmentText}`.matchAll(placeholderRegex)].map(
      ([, name]) => toBareName(name),
    ),
    ...names.reservedNames,
    ...names.queryValueNames,
  ])
  validateBasePlacement(template, host, givenPath)

  const lastName = reservedNames.at(-1)
  // A template that writes a query or a fragment keeps the URL's own for itself.
  const isClosed = Boolean(search) || optional !== null || fragment !== undefined
  const isRest = !isClosed && givenPath.endsWith(`{+${lastName}}`)

  return {
    text: template,
    scheme,
    host,
    path,
    search,
    isOpen,
    names: [
      ...`${scheme}${host}${path}${search ?? ''}${fragment ?? ''}`.matchAll(placeholderRegex),
    ].map(([, name]) => name),
    params,
    optionalNames,
    reservedNames,
    restName: isRest ? lastName : undefined,
    listSplit,
    fragment,
    fragmentReservedNames,
    nameFlags,
    queryOrder: entries.map(([name]) => name),
    passedName,
  }
}

// A parsed template as the patterns that read a URL and the function that writes one. A value of
// two in one path segment whose check is a pattern is read by that pattern, as `pathPatterns`
// gives it.
export const compileTemplate = (
  parsed: ParsedTemplate,
  pathPatterns: Record<string, string> = {},
  writtenPathPatterns: Record<string, string> = pathPatterns,
  // The marks a table reads a query under, where a `;` or a leading `amp;` written in a name or a
  // value would split its pair, and the names whose copies read in any letter case.
  lenient: Pick<UrlLenient, 'semicolon' | 'ampersandEntity' | 'case'> = {},
): CompiledTemplate => {
  const { scheme, host, path, isOpen, names, reservedNames, restName } = parsed
  const captured: Array<Captured> = []
  const captureIn: CaptureIn = (part) => {
    return (name, source) => {
      captured.push({
        name: toBareName(name),
        part,
        isList: part === 'path' && isMultiSegment(name),
      })

      return `(?<${captureGroupPrefix}${captured.length - 1}>${source})`
    }
  }
  // A host pattern can hold a named group of its own, which is no value of the template.
  const getCaptured = (group: string): Captured | undefined => {
    if (!ownGroupRegex.test(group)) {
      return
    }

    return captured[Number(group.slice(captureGroupPrefix.length))]
  }
  // Two copies of a name hold one value: the same text, in any case where the case mark covers it.
  const isSameCopy = (name: string, copy: UrlValue, other: UrlValue): boolean => {
    const copyText = JSON.stringify(copy)
    const otherText = JSON.stringify(other)

    if (lenient.case?.includes(name)) {
      return toAsciiLowerCaseText(copyText) === toAsciiLowerCaseText(otherText)
    }

    return copyText === otherText
  }
  // A `;` would split a pair under the semicolon mark.
  const encodeQueryText = (text: string): string => {
    const written = encodeText(text)

    return lenient.semicolon === true ? written.replaceAll(';', '%3B') : written
  }
  // A `=` in a name would end it there.
  const encodeQueryName = (name: string): string => {
    return encodeQueryText(name).replaceAll('=', '%3D')
  }
  // A pair that opens with `amp;` reads as one behind `&amp;` under the entity mark.
  const toWrittenPair = (text: string): QueryPair => {
    if (lenient.ampersandEntity === true && text.startsWith(entityPrefix)) {
      return toPair(`amp%3B${text.slice(entityPrefix.length)}`)
    }

    return toPair(text)
  }
  const params = parsed.params.map((param): CompiledParam => {
    const source = toRegexSource(param.value, captureIn('query'), queryCapture)
    const rawSource = toRegexSource(
      param.value,
      captureIn('query'),
      queryCapture,
      {},
      encodeQueryText,
    )
    const isShared = countValues(param.value.split(placeholderRegex)) > 1
    const guard = isShared ? toLengthGuard(sharedPartMaxLength) : ''
    const rawGuard = isShared ? toLengthGuard(writtenPartMaxLength) : ''

    const writtenName = encodeQueryName(param.name)
    const writtenValue = param.isFilled ? '' : encodeQueryText(param.value)

    return {
      ...param,
      writtenName,
      pair: toPair(param.isFlag ? writtenName : `${writtenName}=${writtenValue}`),
      regex: new RegExp(`^${guard}${source}$`, 'i'),
      rawRegex: new RegExp(`^${rawGuard}${rawSource}$`, 'd'),
    }
  })
  // A flag's name is read as a path segment is: a value stops at a slash.
  const nameFlags = parsed.nameFlags.map((text): CompiledNameFlag => {
    const source = toRegexSource(text, captureIn('query'), pathCapture, {}, undefined, pathPatterns)
    const rawSource = toRegexSource(
      text,
      captureIn('query'),
      writtenPathCapture,
      {},
      encodeQueryName,
      writtenPathPatterns,
    )
    const isShared = countValues(text.split(placeholderRegex)) > 1
    const guard = isShared ? toLengthGuard(sharedPartMaxLength) : ''
    const rawGuard = isShared ? toLengthGuard(writtenPartMaxLength) : ''

    return {
      text,
      regex: new RegExp(`^${guard}${source}$`, 'i'),
      rawRegex: new RegExp(`^${rawGuard}${rawSource}$`, 'd'),
    }
  })
  // A pair's place is the first part of the query that takes it: a fixed pair or a flag as
  // written, then an optional name.
  const queryParts = [
    ...parsed.queryOrder.map((name) => {
      const flag = nameFlags[parsed.nameFlags.indexOf(name)]

      if (!flag) {
        return (pair: QueryPair) => isNamed(pair, name)
      }

      return (pair: QueryPair) => !pair.rawValue && flag.regex.test(pair.name)
    }),
    ...parsed.optionalNames.map((name) => (pair: QueryPair) => isNamed(pair, name)),
  ]
  const toQueryPlace = (pair: QueryPair): number => {
    const place = queryParts.findIndex((isPart) => isPart(pair))

    return place === -1 ? queryParts.length : place
  }
  const orderPairs: CompiledTemplate['orderPairs'] = (pairs) => {
    return [...pairs].sort((left, right) => toQueryPlace(left) - toQueryPlace(right))
  }
  const multiSegmentCaptures = Object.fromEntries(
    names.filter(isMultiSegment).map((name) => [name, multiSegmentCapture]),
  )
  const splitCaptures = parsed.listSplit
    ? { [`${parsed.listSplit.list}*`]: shortMultiSegmentCapture }
    : {}
  const pathCaptures = {
    ...multiSegmentCaptures,
    ...splitCaptures,
    ...Object.fromEntries(reservedNames.map((name) => [name, reservedCapture])),
  }
  // Two lists share the whole path, as two reserved values do, or one with a value behind it.
  const isSharedPath =
    names.filter(isMultiSegment).length + reservedNames.length > 1 ||
    hasValueBehindReserved(path, reservedNames)
  const pathGuard = isSharedPath ? toLengthGuard(sharedPartMaxLength) : ''
  const rawPathGuard = isSharedPath ? toLengthGuard(writtenPartMaxLength) : ''
  const pathSource = toRegexSource(
    path.replace(trailingSlashRegex, ''),
    captureIn('path'),
    pathCapture,
    pathCaptures,
    decodePath,
    pathPatterns,
    reservedNames,
  )
  // A template with no path is a site, which a URL names with or without the slash of its root.
  const rawPathSource = path
    ? toRegexSource(
        path,
        captureIn('path'),
        writtenPathCapture,
        pathCaptures,
        encodeLiteral,
        writtenPathPatterns,
        reservedNames,
      )
    : '/?'
  // An open tail is every segment behind the path, an empty one included, as pages link them. A
  // decoded line break is part of it, which `.` leaves out.
  const readPathSource = isOpen
    ? `${pathGuard}${pathSource}(?:/${captureIn('path')(`${openTailName}*`, '[^]*')})?`
    : `${pathGuard}${pathSource}`

  const { fragment, fragmentReservedNames } = parsed
  const fragmentCaptures = Object.fromEntries(
    fragmentReservedNames.map((name) => [name, reservedCapture]),
  )
  // A fragment is read as a path is: a value up to the next slash, a reserved one as written.
  const toFragmentRegex = (
    capture: Capture,
    mapLiteral: MapText,
    maxLength: number,
    flags: string,
  ): RegExp | undefined => {
    if (fragment === undefined) {
      return
    }

    const source = toRegexSource(
      fragment,
      captureIn('fragment'),
      capture,
      fragmentCaptures,
      mapLiteral,
      {},
      fragmentReservedNames,
    )
    const isShared =
      fragmentReservedNames.length > 1 || hasValueBehindReserved(fragment, fragmentReservedNames)
    const guard = isShared ? toLengthGuard(maxLength) : ''

    return new RegExp(`^${guard}${source}$`, flags)
  }
  const fragmentRegex = toFragmentRegex(pathCapture, decodePath, sharedPartMaxLength, 'di')
  const rawFragmentRegex = toFragmentRegex(
    writtenPathCapture,
    encodeLiteral,
    writtenPartMaxLength,
    'd',
  )

  const readFragment: CompiledTemplate['readFragment'] = (hash, known) => {
    const match = fragmentRegex?.exec(decodePath(hash))

    if (!match) {
      return
    }

    const values: Record<string, UrlValue> = {}

    // Every group of a fragment pattern is a value of the template, and set.
    for (const [group, [from, to]] of Object.entries(match.indices?.groups ?? {})) {
      const name = getCaptured(group)?.name ?? group
      let value = decodePercent(match.input.slice(from, to))

      if (fragmentReservedNames.includes(name)) {
        const start = toWrittenOffset(hash, from)
        const end = toWrittenOffset(hash, to)

        // A match that ends inside a character as written has no text of its own there.
        if (start === undefined || end === undefined) {
          return
        }

        value = hash.slice(start, end)
      }

      // A name the URL holds twice has one value, so two different ones read nothing.
      const copy = values[name] ?? known[name]

      if (copy !== undefined && !isSameCopy(name, copy, value)) {
        return
      }

      values[name] = value
    }

    return values
  }

  const readRawFragment: CompiledTemplate['readRawFragment'] = (hash) => {
    const match = rawFragmentRegex?.exec(hash)

    if (!match) {
      return
    }

    return match
  }

  const takenNames = [...parsed.params.map((param) => param.name), ...parsed.optionalNames]
  // The pairs no other part of the template takes, a name given twice as a list of its values.
  const readPassedQuery = (searchParams: URLSearchParams): UrlMap => {
    const lists = new Map<string, Array<string>>()

    for (const [name, value] of searchParams) {
      const isFlag = !value && nameFlags.some((flag) => flag.regex.test(name))

      if (isAnyOf(name, takenNames) || isFlag) {
        continue
      }

      const list = lists.get(name)

      if (!list) {
        lists.set(name, [value])

        continue
      }

      list.push(value)
    }

    return Object.fromEntries(
      [...lists].map(([name, list]) => [name, list.length === 1 ? list[0] : list]),
    )
  }

  // A name the template holds twice has one value, as RFC 6570 builds it, so two different ones
  // read nothing.
  const readGroups = (
    values: Record<string, UrlValue>,
    groups: Record<string, string> = {},
  ): boolean => {
    return Object.entries(groups).every(([group, value]) => {
      const groupCaptured = getCaptured(group)

      // A list that may be empty and holds no segment leaves its group unset.
      if (!groupCaptured || value === undefined) {
        return true
      }

      const read = toGroupValue(groupCaptured, value)
      const known = values[groupCaptured.name]

      if (known !== undefined) {
        return isSameCopy(groupCaptured.name, known, read)
      }

      values[groupCaptured.name] = read

      return true
    })
  }

  // A name the template takes has one value, so a URL that gives it two reads nothing.
  const hasOneValue = (searchParams: URLSearchParams, name: string): boolean => {
    const [first, ...rest] = getQueryParamValues(searchParams, name, {
      preserveEmptyValues: true,
      trimValues: false,
    })

    return rest.every((value) => isSameCopy(name, first, value))
  }

  const read: CompiledTemplate['read'] = (groups, getSearchParams) => {
    const values: Record<string, UrlValue> = {}

    if (!takenNames.every((name) => hasOneValue(getSearchParams(), name))) {
      return
    }

    if (!readGroups(values, groups)) {
      return
    }

    // A tail is read as a list: without its empty segments, and one with no segment left, as after
    // a doubled slash, is no value.
    if (isOpen && !values[openTailName]?.length) {
      delete values[openTailName]
    }

    // A query value keeps its spaces, as a path and a fragment do, so it reads back as built.
    for (const { name, isFlag, regex } of params) {
      const [value] = getQueryParamValues(getSearchParams(), name, {
        preserveEmptyValues: isFlag,
        trimValues: false,
      })

      if (value === undefined) {
        return
      }

      const queryMatch = regex.exec(value)

      if (!queryMatch || !readGroups(values, queryMatch.groups)) {
        return
      }
    }

    const flagNames = [...getSearchParams()].filter(([, value]) => !value).map(([name]) => name)

    // A flag is the first pair with no value whose name the flag's pattern takes and no earlier
    // flag took.
    for (const { regex } of nameFlags) {
      const index = flagNames.findIndex((name) => regex.test(name))
      const flagMatch = index === -1 ? null : regex.exec(flagNames[index])

      if (!flagMatch || !readGroups(values, flagMatch.groups)) {
        return
      }

      flagNames.splice(index, 1)
    }

    for (const name of parsed.optionalNames) {
      const [value] = getQueryParamValues(getSearchParams(), name, { trimValues: false })

      if (value !== undefined) {
        values[name] = value
      }
    }

    if (parsed.passedName !== undefined) {
      const passed = readPassedQuery(getSearchParams())

      if (Object.keys(passed).length > 0) {
        values[parsed.passedName] = passed
      }
    }

    return values
  }

  // An empty value is no value: a host label or path segment left empty builds a broken URL, as
  // `/t//feed`, and a query value left empty a feed the page does not name, as `?videoChannelId=`.
  const getValues: CompiledTemplate['getValues'] = (givenParams) => {
    const values: Record<string, UrlValue> = {}

    for (const name of names) {
      const value = getPlaceholderValue(givenParams, name)

      if (!value) {
        return
      }

      values[name] = value
    }

    // An optional name with no value, or a list with no item, is left out of the URL. An empty
    // string is a value, written as `name=`, as RFC 6570 writes it.
    const passedNames = parsed.passedName === undefined ? [] : [parsed.passedName]

    for (const name of [...parsed.optionalNames, ...passedNames]) {
      const value = getPlaceholderValue(givenParams, name)

      if (value !== undefined) {
        values[name] = value
      }
    }

    return values
  }

  // Non-ASCII fixed text is written percent-encoded, as any URL carries it.
  const writtenPath = encodeLiteral(path)
  const encodePrettyQueryValue = (value: string): string => {
    return encodeDecoded(value, encodeQueryText)
  }
  const writtenFragment = fragment === undefined ? undefined : encodeLiteral(fragment)
  const encodeValue: CompiledTemplate['encodeValue'] = (value, part) => {
    return part === 'query' ? encodePrettyQueryValue(value) : encodePathValue(value)
  }
  const fill: CompiledTemplate['fill'] = (values, encoding = 'pretty') => {
    const isStrict = encoding === 'strict'
    let isMoved = false
    const fillPlaceholders = (
      text: string,
      encode: (value: string | Array<string>) => string = toValueText,
    ) => {
      return text.replace(placeholderRegex, (_placeholder, name: string) => {
        const value = values[name]

        // A reserved value is written the same in both encodings, as RFC 6570 writes it. One with
        // a `?` or a `#` in front of more of the path would move that path into a query.
        if (reservedNames.includes(name) || fragmentReservedNames.includes(name)) {
          const written = encodeReservedSlot(value)
          const isInPath = reservedNames.includes(name) && name !== restName

          if (isInPath && reservedEndRegex.test(written)) {
            isMoved = true
          }

          return written
        }

        // A list holds the slash in front of it, so a list of no segment writes nothing.
        if (!isMultiSegment(name)) {
          return encodeSlot(value, encode)
        }

        if (isPlainObject(value)) {
          return `/${encodeMapSegments(value, isStrict ? encodeStrictValue : encodePathValue)}`
        }

        return value.length > 0 ? `/${encode(value)}` : ''
      })
    }
    const pairs: Array<QueryPair> = []

    for (const own of params) {
      if (!own.isFilled) {
        pairs.push(own.pair)

        continue
      }

      const text = fillQueryValue(
        own.value,
        values,
        isStrict ? encodeStrictValue : encodePrettyQueryValue,
        encodeQueryText,
      )

      pairs.push(appendValue(own.pair, text))
    }

    let hasFlagSlash = false
    // A `=` in a flag's name would end the name there.
    const encodeFlagValue = (value: string): string => {
      // A flag's value stops at a slash, as a path segment's does, in either spelling of it.
      if (value.includes('/')) {
        hasFlagSlash = true
      }

      return isStrict
        ? encodeStrictValue(value)
        : encodePrettyQueryValue(value).replaceAll('=', '%3D')
    }

    for (const { text } of nameFlags) {
      pairs.push(toWrittenPair(fillQueryValue(text, values, encodeFlagValue, encodeQueryName)))
    }

    if (hasFlagSlash) {
      return
    }

    for (const name of parsed.optionalNames) {
      const value = values[name]

      if (value === undefined) {
        continue
      }

      const writtenName = isStrict ? encodeStrictValue(name) : encodeQueryName(name)
      const writtenValue = encodeSlot(value, isStrict ? encodeStrictValue : encodePrettyQueryValue)

      pairs.push(toPair(`${writtenName}=${writtenValue}`))
    }

    // A passed map is a pair per name and item, and a list or a string pairs under its own name.
    const passedName = parsed.passedName ?? ''
    const passed = values[passedName]

    if (passed !== undefined) {
      const map = isPlainObject(passed) ? passed : { [passedName]: passed }

      for (const [name, item] of toMapEntries(map)) {
        // A name the template writes itself, or one a flag takes, would not read back into the map.
        if (isAnyOf(name, takenNames) || nameFlags.some((flag) => flag.regex.test(name))) {
          return
        }

        const writtenName = isStrict ? encodeStrictValue(name) : encodeQueryName(name)
        const writtenValue = isStrict ? encodeStrictValue(item) : encodePrettyQueryValue(item)

        pairs.push(toWrittenPair(`${writtenName}=${writtenValue}`))
      }
    }

    const givenHost = fillPlaceholders(host)

    // A value carried into a host from a path, as `a/b`, would move the URL to another host that
    // still parses, so a delimiter there builds nothing.
    if (hostDelimiterRegex.test(givenHost)) {
      return
    }

    // A host reads in any case and a parser spells it in punycode, so a value is written so too.
    const filledHost = toAsciiHost(givenHost)

    const filledScheme = fillPlaceholders(scheme)
    const filledPath = fillPlaceholders(writtenPath, isStrict ? encodeStrict : encodePath)
    // The value that ends the template can hold a query, which is no part of the path.
    const [ownPath] = filledPath.split(reservedEndRegex, 1)

    if (isMoved || ownPath.split('/').some((segment) => dotSegmentRegex.test(segment))) {
      return
    }

    const base = writeBase(`${filledScheme}://${filledHost}${filledPath}`, pairs)
    const filledFragment =
      writtenFragment === undefined
        ? ''
        : `#${fillPlaceholders(writtenFragment, isStrict ? encodeStrict : encodePath)}`
    const url = `${base}${writeQuery(orderPairs(pairs))}${filledFragment}`
    const parsedUrl = parseUrl(url)

    // A scheme or host value can move the URL to another scheme or host that still parses, as the
    // scheme `https://evil.example/x?`, and a host value can hold a space no URL takes.
    // biome-ignore lint/plugin: the host holds its port, which isHostOf leaves out.
    if (!parsedUrl || !isHttpUrl(parsedUrl) || parsedUrl.host !== filledHost) {
      return
    }

    if (parsedUrl.protocol !== `${filledScheme.toLowerCase()}:`) {
      return
    }

    return url
  }

  return {
    ...parsed,
    params,
    nameFlags,
    readPathSource,
    rawPathSource: `${rawPathGuard}${rawPathSource}`,
    captureIn,
    getCaptured,
    read,
    getValues,
    fill,
    readFragment,
    readRawFragment,
    orderPairs,
    encodeValue,
    encodeQueryText,
    encodeQueryName,
    toWrittenPair,
  }
}

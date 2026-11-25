// A part of a URL read against a template part piece by piece, with no regex but the caller's own
// patterns. Each value takes all it can, as a greedy pattern would, and no choice is tried twice,
// so a read grows with the URL's length and no faster.

export type TextTest = (text: string) => boolean

export type Token =
  | {
      kind: 'literal'
      text: string
      isOptional?: boolean
    }
  | {
      kind: 'value'
      group: string
      // The characters a value never holds, as `/` in a path and `.` in a host label.
      stops: string
      // A check pattern that takes the value, and how far it reaches from where the value starts.
      test?: TextTest
      reach?: (text: string, start: number) => number
      // A host label that is `www` in front of a dot is no tenant.
      isWwwRefused?: boolean
    }
  | {
      kind: 'list'
      group: string
      isOptional: boolean
    }
  | {
      kind: 'tail'
      group: string
    }
  | {
      kind: 'whole'
      group: string
      test: TextTest
    }

export type MatchResult = {
  input: string
  groups: Record<string, string | undefined>
  indices: { groups: Record<string, [number, number] | undefined> }
}

const unknown = -2
// A stretch this short is scanned for its end, and a longer one looked up.
const shortLength = 256
const caselessWwwPrefix = 'WWW.'

// The characters no line holds, which a regex `.` never takes.
const lineBreaks = '\n\r\u2028\u2029'

// A character as a case-insensitive regex compares it: in uppercase where that stays one character
// and keeps a character past ASCII past it.
const toCaseless = (character: string): string => {
  const upper = character.toUpperCase()

  if (upper.length !== 1) {
    return character
  }

  if (character.charCodeAt(0) >= 128 && upper.charCodeAt(0) < 128) {
    return character
  }

  return upper
}

export const toCaselessText = (text: string): string => {
  let caseless = ''

  for (const character of text) {
    caseless += character.length === 1 ? toCaseless(character) : character
  }

  return caseless
}

type StopIndices = {
  next: Int32Array
  previous: Int32Array
}

// For each index from `start` to `end`, the first index at or after it that holds one of the
// characters, or `end` where none does, and the one just after the last such index before it.
const toStopIndices = (text: string, start: number, end: number, stops: string): StopIndices => {
  const width = end - start + 1
  const next = new Int32Array(width)
  const previous = new Int32Array(width)

  next[width - 1] = end

  for (let index = end - 1; index >= start; index--) {
    next[index - start] = stops.includes(text[index]) ? index : next[index - start + 1]
  }

  previous[0] = start

  for (let index = start + 1; index <= end; index++) {
    previous[index - start] = stops.includes(text[index - 1]) ? index : previous[index - start - 1]
  }

  return { next, previous }
}

// The fixed text of each token, and the whole text of tokens that are all fixed text, as a host
// with no placeholder, kept per token list for each case.
type Literals = {
  texts: Array<string>
  wholeText?: string
}

const caselessLiterals = new WeakMap<Array<Token>, Literals>()
const writtenLiterals = new WeakMap<Array<Token>, Literals>()

const getLiterals = (tokens: Array<Token>, isCaseless: boolean): Literals => {
  const cache = isCaseless ? caselessLiterals : writtenLiterals
  let literals = cache.get(tokens)

  if (!literals) {
    const texts = tokens.map((token) => {
      if (token.kind !== 'literal') {
        return ''
      }

      return isCaseless ? toCaselessText(token.text) : token.text
    })
    const isFixed = tokens.every((token) => token.kind === 'literal' && !token.isOptional)

    literals = { texts, wholeText: isFixed ? texts.join('') : undefined }
    cache.set(tokens, literals)
  }

  return literals
}

// Whether the input holds the text at a position before `end`, compared as the case says.
const isWrittenIn = (
  input: string,
  literal: string,
  position: number,
  end: number,
  isCaseless: boolean,
): boolean => {
  if (position + literal.length > end) {
    return false
  }

  for (let offset = 0; offset < literal.length; offset++) {
    const code = input.charCodeAt(position + offset)
    const literalCode = literal.charCodeAt(offset)

    if (code === literalCode) {
      continue
    }

    if (!isCaseless) {
      return false
    }

    if (code < 128) {
      if (code < 97 || code > 122 || code - 32 !== literalCode) {
        return false
      }

      continue
    }

    if (toCaseless(input[position + offset]).charCodeAt(0) !== literalCode) {
      return false
    }
  }

  return true
}

// Whether the fixed text at either end of the tokens is where the input has it, which rules most
// URLs out before anything is set up for them.
export const mayMatchTokens = (
  tokens: Array<Token>,
  input: string,
  start: number,
  end: number,
  isCaseless: boolean,
): boolean => {
  const { texts, wholeText } = getLiterals(tokens, isCaseless)
  const first = tokens[0]
  const last = tokens.at(-1)

  if (wholeText !== undefined) {
    return end - start === wholeText.length && isWrittenIn(input, wholeText, start, end, isCaseless)
  }

  if (
    first?.kind === 'literal' &&
    !first.isOptional &&
    !isWrittenIn(input, texts[0], start, end, isCaseless)
  ) {
    return false
  }

  if (last?.kind === 'literal' && !last.isOptional) {
    const lastText = texts[tokens.length - 1]
    const lastStart = end - lastText.length

    if (lastStart < start || !isWrittenIn(input, lastText, lastStart, end, isCaseless)) {
      return false
    }
  }

  return true
}

// The ranges each group of the tokens takes in `input` from `start` to `end`, or undefined where
// the tokens do not take that text whole.
export const matchTokens = (
  tokens: Array<Token>,
  input: string,
  start: number,
  end: number,
  isCaseless: boolean,
): Record<string, [number, number] | undefined> | undefined => {
  if (!mayMatchTokens(tokens, input, start, end, isCaseless)) {
    return
  }

  const { texts: literals, wholeText } = getLiterals(tokens, isCaseless)

  if (wholeText !== undefined) {
    return {}
  }

  const width = end - start + 1
  // The end each token reaches from a position, plus two, so 0 is not known yet and 1 is no end.
  const ends = new Int32Array((tokens.length + 1) * width)
  // The furthest end a value reaches within one stretch, which every start in it shares, kept
  // the same way.
  const furthestEnds = new Int32Array(tokens.length * width)
  const wwwPrefix = isCaseless ? caselessWwwPrefix : 'www.'
  const isWrittenAt = (literal: string, position: number): boolean => {
    return isWrittenIn(input, literal, position, end, isCaseless)
  }

  const stopIndices = new Map<string, StopIndices>()
  const getStopIndices = (stops: string): StopIndices => {
    let indices = stopIndices.get(stops)

    if (!indices) {
      indices = toStopIndices(input, start, end, stops)
      stopIndices.set(stops, indices)
    }

    return indices
  }
  // A short text is scanned, and a long one looked up, so no read scans one stretch twice.
  const isShort = end - start <= shortLength
  const findStop = (position: number, stops: string): number => {
    if (!isShort) {
      return getStopIndices(stops).next[position - start]
    }

    for (let index = position; index < end; index++) {
      if (stops.includes(input[index])) {
        return index
      }
    }

    return end
  }
  const findStretchStart = (position: number, stops: string): number => {
    if (!isShort) {
      return getStopIndices(stops).previous[position - start]
    }

    let index = position

    while (index > start && !stops.includes(input[index - 1])) {
      index--
    }

    return index
  }

  const isTaken = (index: number, position: number): boolean => {
    return solve(index, position) !== -1
  }

  // The furthest end in a stretch behind which the tokens after `index` match.
  const findFurthestEnd = (index: number, from: number, to: number): number => {
    for (let candidate = to; candidate > from; candidate--) {
      if (isTaken(index + 1, candidate)) {
        return candidate
      }
    }

    return -1
  }

  const solveToken = (index: number, position: number): number => {
    if (index === tokens.length) {
      return position === end ? position : -1
    }

    const token = tokens[index]

    if (token.kind === 'literal') {
      const literal = literals[index]
      const literalEnd = position + literal.length

      if (isWrittenAt(literal, position) && isTaken(index + 1, literalEnd)) {
        return literalEnd
      }

      return token.isOptional && isTaken(index + 1, position) ? position : -1
    }

    if (token.kind === 'tail') {
      if (position === end) {
        return position
      }

      const isLine = findStop(position + 1, lineBreaks) === end

      return input[position] === '/' && isLine ? end : -1
    }

    if (token.kind === 'whole') {
      for (let candidate = end; candidate > position; candidate--) {
        if (isTaken(index + 1, candidate) && token.test(input.slice(position, candidate))) {
          return candidate
        }
      }

      return -1
    }

    if (token.kind === 'list') {
      // A list holds segments of one character or more, so it reaches up to the first empty one,
      // and it can end inside its last segment, as `{/path*}.atom` reads `a/b.atom`.
      let reach = position

      if (input[position] === '/') {
        let segmentStart = position + 1

        while (segmentStart < end && input[segmentStart] !== '/') {
          reach = findStop(segmentStart, '/')
          segmentStart = reach + 1
        }
      }

      for (let candidate = reach; candidate > position + 1; candidate--) {
        if (input[candidate - 1] !== '/' && isTaken(index + 1, candidate)) {
          return candidate
        }
      }

      return token.isOptional && isTaken(index + 1, position) ? position : -1
    }

    if (token.isWwwRefused && isWrittenAt(wwwPrefix, position)) {
      return -1
    }

    const stretchEnd = findStop(position, token.stops)

    if (token.test) {
      const reach = token.reach?.(input, position) ?? stretchEnd

      for (let candidate = Math.min(stretchEnd, reach); candidate > position; candidate--) {
        if (isTaken(index + 1, candidate) && token.test(input.slice(position, candidate))) {
          return candidate
        }
      }

      return -1
    }

    // Every start in one stretch shares its furthest end, so the stretch is searched once.
    const key = index * width + (stretchEnd - start)
    let furthest = furthestEnds[key] - 2

    if (furthest === unknown) {
      const stretchStart = findStretchStart(position, token.stops)

      furthest = findFurthestEnd(index, stretchStart, stretchEnd)
      furthestEnds[key] = furthest + 2
    }

    return furthest > position ? furthest : -1
  }

  const solve = (index: number, position: number): number => {
    const key = index * width + (position - start)
    const known = ends[key] - 2

    if (known !== unknown) {
      return known
    }

    const reached = solveToken(index, position)

    ends[key] = reached + 2

    return reached
  }

  if (!isTaken(0, start)) {
    return
  }

  const ranges: Record<string, [number, number] | undefined> = {}
  let position = start

  for (const [index, token] of tokens.entries()) {
    const reached = solve(index, position)

    if (token.kind === 'list' || token.kind === 'tail') {
      ranges[token.group] = reached > position ? [position + 1, reached] : undefined
    }

    if (token.kind === 'value' || token.kind === 'whole') {
      ranges[token.group] = [position, reached]
    }

    position = reached
  }

  return ranges
}

// Ranges as a match: the text of each group and where it sits in the input.
export const toMatchResult = (
  input: string,
  ranges: Record<string, [number, number] | undefined>,
): MatchResult => {
  const groups: Record<string, string | undefined> = {}

  for (const [group, range] of Object.entries(ranges)) {
    groups[group] = range ? input.slice(range[0], range[1]) : undefined
  }

  return {
    input,
    groups,
    indices: { groups: ranges },
  }
}

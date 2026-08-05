// §3 parsing: a YAML subset — key/value, quoted strings, inline and dash lists, folded
// blocks, and ONE level of nested mapping (0015). Deliberately not a YAML library (§10
// allows zero dependencies).
//
// Built against a survey of the real corpus (946 frontmatter blocks). At M1, nested maps
// appeared zero times in 577 classified artifacts. Adopting spec-kit (0014) imported 10
// counterexamples from one upstream author — `metadata:` with `author`/`source` under it —
// so 0015 teaches this parser one level of nesting. Lists-of-maps and flow mappings are
// still unsupported. What the corpus also contains beyond §3's literal examples: block
// scalars with any chomp indicator (`>-` 412, `|` 71, `>` 3) and one multi-line quoted
// scalar. Both are variants of features §3 already names, so both are supported here.
//
// Two outcomes, kept apart on purpose (0015): `error` means MALFORMED — the file is a parse
// error, and §6's structural check may score it 0. `beyondSubset` means the YAML is
// well-formed but reaches past this subset; the text is kept raw, and scoring it 0 would be
// the app blaming the artifact for the tool.
//
// Numbers stay strings on purpose, at every depth: `version: 3.10` must not become 3.1.

const KEY_LINE = /^([A-Za-z0-9_.-]+):(.*)$/
const BLOCK_SCALAR = /^([|>])([-+]?)\d*$/

/**
 * @returns {{data: Record<string, unknown>, body: string, error: string|null,
 *            beyondSubset: string|null}}
 * Never throws. A file with no frontmatter is not an error.
 */
export function parseFrontmatter(text) {
  const normalized = text.replace(/^﻿/, '')
  if (!/^---\r?\n/.test(normalized)) {
    return { data: {}, body: normalized, error: null, beyondSubset: null }
  }

  const lines = normalized.split('\n')
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') {
      end = i
      break
    }
  }
  if (end === -1) {
    // §3: never dropped, never crashes — the body is shown raw and the UI shows a chip.
    return {
      data: {},
      body: normalized,
      error: 'frontmatter is never closed by ---',
      beyondSubset: null,
    }
  }

  const block = lines.slice(1, end)
  const body = lines.slice(end + 1).join('\n').replace(/^\r?\n/, '')
  const data = {}
  const problems = []
  const beyond = []

  for (let i = 0; i < block.length; i++) {
    const line = block[i]
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (/^\s/.test(line)) continue // consumed by whichever key claimed it

    const match = line.match(KEY_LINE)
    if (!match) {
      problems.push(`line ${i + 2}: not a key/value pair — ${line.trim().slice(0, 40)}`)
      continue
    }

    const [, key, rest] = match
    const value = rest.trim()

    const blockMatch = value.match(BLOCK_SCALAR)
    if (blockMatch) {
      const [, style, chomp] = blockMatch
      const { text: folded, next } = readBlockScalar(block, i + 1, style, chomp)
      data[key] = folded
      i = next - 1
      continue
    }

    if (value === '') {
      const { value: nested, next, problem, beyondSubset } = readIndentedValue(block, i + 1)
      if (problem) problems.push(`line ${i + 2}: ${problem}`)
      if (beyondSubset) beyond.push(`line ${i + 2}: ${beyondSubset}`)
      data[key] = nested
      i = next - 1
      continue
    }

    // A quoted scalar whose closing quote is on a later line needs the block to fold; every
    // other shape is a plain scalar, so it goes through the one shared coercion path.
    const quote = value[0]
    if ((quote === '"' || quote === "'") && !(value.length > 1 && value.endsWith(quote))) {
      const { text: joined, next } = readQuotedContinuation(block, i + 1, quote, value.slice(1))
      data[key] = joined
      i = next - 1
      continue
    }

    data[key] = scalar(value)
  }

  return {
    data,
    body,
    error: problems.length ? problems.join('; ') : null,
    beyondSubset: beyond.length ? beyond.join('; ') : null,
  }
}

/**
 * One value, one set of rules — shared by the top level and by nested maps so the two can
 * never disagree. There is deliberately no numeric branch: `version: 3.10` stays the string
 * "3.10" at any depth (§3).
 */
function scalar(value) {
  if (value.startsWith('[')) return parseInlineList(value)
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) {
    return value.slice(1, -1)
  }
  if (value === 'true' || value === 'false') return value === 'true'
  return stripComment(value)
}

function readBlockScalar(lines, start, style, chomp) {
  const collected = []
  let i = start
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') {
      collected.push('')
      continue
    }
    if (!/^\s/.test(line)) break
    collected.push(line)
  }
  while (collected.length && collected.at(-1) === '') collected.pop()

  const indents = collected.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length)
  const dedent = indents.length ? Math.min(...indents) : 0
  const stripped = collected.map((l) => l.slice(dedent))

  let text
  if (style === '|') {
    text = stripped.join('\n')
  } else {
    // Folded: blank lines become paragraph breaks, everything else joins with a space.
    text = stripped
      .reduce((acc, l) => {
        if (l === '') return [...acc, '']
        const last = acc.at(-1)
        if (last === undefined || last === '') return [...acc, l]
        return [...acc.slice(0, -1), `${last} ${l}`]
      }, [])
      .join('\n')
  }
  if (chomp === '+') text += '\n'
  return { text, next: i }
}

function readQuotedContinuation(lines, start, quote, firstChunk) {
  const parts = [firstChunk.trim()]
  let i = start
  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.endsWith(quote)) {
      parts.push(trimmed.slice(0, -1).trim())
      i++
      break
    }
    parts.push(trimmed)
  }
  return { text: parts.filter(Boolean).join(' '), next: i }
}

function readIndentedValue(lines, start) {
  const owned = []
  let i = start
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    if (!/^\s/.test(lines[i])) break
    owned.push(lines[i])
  }
  if (!owned.length) return { value: null, next: i }

  if (owned.every((l) => l.trim().startsWith('- '))) {
    return { value: owned.map((l) => unquote(stripComment(l.trim().slice(2).trim()))), next: i }
  }

  // A quoted scalar may open on the line *after* its key. One real case in the corpus
  // (math-olympiad's description), and reading it as a nested block loses the text.
  const firstTrimmed = owned[0].trim()
  const quote = firstTrimmed[0]
  if (quote === '"' || quote === "'") {
    const joined = owned.map((l) => l.trim()).join(' ')
    const closed = joined.length > 1 && joined.endsWith(quote)
    return { value: closed ? joined.slice(1, -1) : joined.slice(1), next: i }
  }

  return { ...readNestedMap(owned), next: i }
}

/**
 * One level of nested mapping (0015). Deeper than one level is kept raw and reported as
 * beyond subset rather than as an error: the YAML is well-formed, and only this parser's
 * subset ends here. §3's rule holds throughout — never dropped, never crashes.
 */
function readNestedMap(owned) {
  const base = Math.min(...owned.map(indentOf))
  const map = {}
  const deeper = new Set()
  let key = null

  for (const line of owned) {
    const trimmed = line.trim()

    if (indentOf(line) > base) {
      // Depth 2. Keep the text on whichever key opened it — losing it would be worse than
      // reporting it — and remember the key so the note can name it.
      if (key === null) return rawBlock(owned, 'nested block starts deeper than any key')
      deeper.add(key)
      map[key] = map[key] ? `${map[key]}\n${trimmed}` : trimmed
      continue
    }

    // A sequence and a mapping cannot share one indent. That is malformed YAML rather than
    // a shape beyond this subset, so it stays an error.
    if (trimmed.startsWith('- ')) {
      return rawBlock(owned, 'a dash list and key/value pairs share one indent')
    }

    const match = trimmed.match(KEY_LINE)
    if (!match) return rawBlock(owned, `nested line is not a key/value pair — ${trimmed.slice(0, 40)}`)

    key = match[1]
    const value = match[2].trim()
    // An empty value or a block-scalar indicator means the value is on the lines below,
    // which are depth 2 — leave the slot open for them rather than storing the marker.
    map[key] = value === '' || BLOCK_SCALAR.test(value) ? null : scalar(value)
  }

  return {
    value: map,
    beyondSubset: deeper.size
      ? `nesting deeper than one level kept raw under ${[...deeper].map((k) => `"${k}"`).join(', ')}`
      : null,
  }
}

/** A block this parser could not read as a map: keep every line, say why. */
function rawBlock(owned, problem) {
  return { value: owned.map((l) => l.trim()).join('\n'), problem }
}

function indentOf(line) {
  return line.match(/^\s*/)[0].length
}

function parseInlineList(value) {
  const close = value.lastIndexOf(']')
  const inner = value.slice(1, close === -1 ? undefined : close)
  if (!inner.trim()) return []
  return inner.split(',').map((part) => unquote(part.trim())).filter((p) => p !== '')
}

function stripComment(value) {
  // Only an unquoted ` #` starts a comment; `#` inside a word (a colour, a fragment) does not.
  const at = value.search(/\s+#/)
  return at === -1 ? value : value.slice(0, at).trim()
}

function unquote(value) {
  const q = value[0]
  if ((q === '"' || q === "'") && value.length > 1 && value.endsWith(q)) return value.slice(1, -1)
  return value
}

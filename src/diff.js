import { normalizeForHash } from './resolver.js'

// §5 diff view: unified line diff, trailing whitespace normalized, add/remove colouring,
// jump-to-next-change. Read-only — §11 forbids "make identical", so nothing here writes.

/**
 * Unified diff between two bodies.
 * @returns {{rows: Array<{kind: 'context'|'add'|'remove', a: number|null, b: number|null, text: string}>,
 *            added: number, removed: number, changedLines: number}}
 */
export function unifiedDiff(bodyA, bodyB) {
  const a = normalizeForHash(bodyA).split('\n')
  const b = normalizeForHash(bodyB).split('\n')
  const script = lcsScript(a, b)

  const rows = []
  let added = 0
  let removed = 0
  let ai = 0
  let bi = 0

  for (const op of script) {
    if (op === 'keep') {
      rows.push({ kind: 'context', a: ai + 1, b: bi + 1, text: a[ai] })
      ai++
      bi++
    } else if (op === 'remove') {
      rows.push({ kind: 'remove', a: ai + 1, b: null, text: a[ai] })
      removed++
      ai++
    } else {
      rows.push({ kind: 'add', a: null, b: bi + 1, text: b[bi] })
      added++
      bi++
    }
  }

  return { rows, added, removed, changedLines: added + removed }
}

/**
 * Longest-common-subsequence edit script. O(n·m) memory, which is fine for documents of a
 * few hundred lines; the corpus's largest artifact is under 1,000.
 */
function lcsScript(a, b) {
  const n = a.length
  const m = b.length
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const script = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      script.push('keep')
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      script.push('remove')
      i++
    } else {
      script.push('add')
      j++
    }
  }
  while (i < n) {
    script.push('remove')
    i++
  }
  while (j < m) {
    script.push('add')
    j++
  }
  return script
}

/** Collapse long runs of unchanged lines, keeping `context` lines around each change. */
export function collapseContext(rows, context = 3) {
  const keep = new Set()
  rows.forEach((row, i) => {
    if (row.kind === 'context') return
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep.add(j)
  })

  const out = []
  let skipped = 0
  rows.forEach((row, i) => {
    if (keep.has(i)) {
      if (skipped) {
        out.push({ kind: 'gap', text: `${skipped} unchanged lines`, a: null, b: null })
        skipped = 0
      }
      out.push(row)
    } else {
      skipped++
    }
  })
  if (skipped) out.push({ kind: 'gap', text: `${skipped} unchanged lines`, a: null, b: null })
  return out
}

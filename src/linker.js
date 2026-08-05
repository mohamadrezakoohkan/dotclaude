// §4 knowledge graph. D4: backtick-token matching only. D5: resolution order.

// A fence is not an inline code span. Stripping fences first stops every shell snippet in
// the corpus from becoming a link candidate.
// No `m` flag on purpose: with it, `$` would match the end of the opening line and the
// fence body would survive stripping.
const FENCE = /(?:^|\n)[ \t]*(`{3,}|~{3,})[\s\S]*?(?:\n[ \t]*\1[^\n]*|$)/g
const INLINE_CODE = /`([^`\n]+)`/g

// §4 draws the line in two different places, and conflating them loses links:
//   - an OUTLINK is any backticked token that *resolves* — including a single-word name
//     like `access`, which is a real skill;
//   - the UNRESOLVED list holds only tokens that *look like* artifact names, so ordinary
//     code in backticks never appears there.
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)+$/
const COMMAND = /^\/[a-z0-9][a-z0-9:_-]*$/
const ALIAS = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9:_-]*$/

/** Every backticked token in description + body, fenced code excluded. */
export function extractTokens(artifact) {
  const sources = [artifact.description ?? '', (artifact.body ?? '').replace(FENCE, '\n')]
  const tokens = new Set()
  for (const text of sources) {
    for (const [, inner] of text.matchAll(INLINE_CODE)) {
      const token = inner.trim()
      if (token && token.length <= 80) tokens.add(token)
    }
  }
  return [...tokens]
}

/** Does an unresolved token look like an artifact name worth reporting? (§4) */
export function isCandidate(token) {
  if (token.length > 80) return false
  return COMMAND.test(token) || ALIAS.test(token) || KEBAB.test(token)
}

/**
 * Build the graph over the whole index. Cross-source by nature: a token in one repo
 * resolves against every source.
 */
export function buildGraph(artifacts) {
  const byName = new Map() // name -> artifacts
  const byAlias = new Map() // alias -> artifacts
  for (const a of artifacts) {
    push(byName, a.name, a)
    for (const alias of a.aliases ?? []) push(byAlias, alias, a)
  }

  const backlinks = new Map() // id -> Set of referring ids
  const outlinks = new Map() // id -> resolved link records
  const unresolved = new Map() // id -> tokens

  for (const artifact of artifacts) {
    const links = []
    const misses = []

    for (const token of extractTokens(artifact)) {
      const candidates = resolveToken(token, byName, byAlias)
        // §4: self-links ignored. Only this artifact's own id — its copies in other
        // sources are genuine cross-repo references.
        .filter((c) => c.id !== artifact.id)

      if (!candidates.length) {
        // Only artifact-shaped tokens are worth reporting; `npm install` is just code.
        if (isCandidate(token)) misses.push(token)
        continue
      }

      const ordered = rank(candidates)
      links.push({
        token,
        targets: ordered.map((c) => c.id),
        primary: ordered[0].id,
        // D5: a plain token matching both a skill and an agent is never guessed at.
        ambiguousType: new Set(ordered.map((c) => c.type)).size > 1,
      })

      for (const target of ordered) {
        if (!backlinks.has(target.id)) backlinks.set(target.id, new Set())
        backlinks.get(target.id).add(artifact.id)
      }
    }

    if (links.length) outlinks.set(artifact.id, links)
    if (misses.length) unresolved.set(artifact.id, misses)
  }

  // 0011: a token naming no artifact *and* resembling none is probably not an artifact
  // reference at all. One that closely resembles a real name almost certainly is a rename,
  // which is what §4 says this list exists to catch.
  const names = [...byName.keys()]
  const renameCache = new Map()
  const nearestName = (token) => {
    if (!renameCache.has(token)) renameCache.set(token, findNearest(token, names))
    return renameCache.get(token)
  }

  return artifacts.map((a) => {
    const misses = unresolved.get(a.id) ?? []
    return {
      ...a,
      outlinks: outlinks.get(a.id) ?? [],
      backlinks: [...(backlinks.get(a.id) ?? [])],
      unresolved: misses.map((token) => ({ token, likelyRename: nearestName(token) })),
      // §4: orphans are surfaced as a review queue, not judged.
      orphan: !(backlinks.get(a.id)?.size > 0),
    }
  })
}

/** Nearest artifact name within edit distance 2, or null. */
function findNearest(token, names) {
  const probe = token.replace(/^\//, '')
  let best = null
  let bestDistance = 3
  for (const name of names) {
    const candidate = name.replace(/^\//, '')
    if (Math.abs(candidate.length - probe.length) >= bestDistance) continue
    const d = editDistance(probe, candidate, bestDistance)
    if (d < bestDistance) {
      bestDistance = d
      best = name
      if (d === 1) break
    }
  }
  return best
}

/** Levenshtein with an early exit once the row's minimum exceeds the cap. */
function editDistance(a, b, cap) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (row[j] < rowMin) rowMin = row[j]
    }
    if (rowMin >= cap) return cap
    prev = row
  }
  return prev[b.length]
}

/** D5: `/token` → commands only; plain token → skill, then agent. */
function resolveToken(token, byName, byAlias) {
  if (token.startsWith('/')) {
    return (byName.get(token) ?? []).filter((a) => a.type === 'command')
  }

  const viaAlias = byAlias.get(token)
  if (viaAlias?.length) return viaAlias

  const named = byName.get(token) ?? []
  if (!named.length) return []

  const skills = named.filter((a) => a.type === 'skill')
  const agents = named.filter((a) => a.type === 'agent')
  if (skills.length && agents.length) return [...skills, ...agents] // ambiguous, flagged
  if (skills.length) return skills
  if (agents.length) return agents
  return named
}

/** Highest priority first, then source name — provisional until M3 decides `effective`. */
function rank(candidates) {
  return [...candidates].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.source.localeCompare(b.source),
  )
}

function push(map, key, value) {
  if (!key) return
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(value)
}

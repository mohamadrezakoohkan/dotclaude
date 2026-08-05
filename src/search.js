// §7 search. Shared by the client (instant, frontmatter-scoped) and the server (`body:`).
// D6: frontmatter is the default scope; `body:` opts into full text.

const OPERATORS = new Set(['body', 'type', 'tag', 'source', 'is'])

/**
 * Split a raw query into operators and free text.
 * @returns {{text: string, body: string[], facets: Record<string, string[]>}}
 */
export function parseQuery(raw) {
  const facets = { type: [], tag: [], source: [], is: [] }
  const body = []
  const words = []

  for (const part of String(raw ?? '').trim().split(/\s+/).filter(Boolean)) {
    const match = part.match(/^([a-z]+):(.*)$/i)
    if (!match || !OPERATORS.has(match[1].toLowerCase())) {
      words.push(part)
      continue
    }
    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (!value) continue
    if (key === 'body') body.push(value.toLowerCase())
    else facets[key].push(value.toLowerCase())
  }

  return { text: words.join(' ').trim(), body, facets }
}

/** §7 ranking ladder. Lower is better; null means no match. */
export function rankOf(artifact, needle) {
  if (!needle) return 5
  const name = artifact.name.toLowerCase()
  if (name === needle) return 0
  if (name.startsWith(needle)) return 1
  if (name.includes(needle)) return 2
  if ((artifact.description ?? '').toLowerCase().includes(needle)) return 3
  const tags = [...(artifact.tags ?? []), ...(artifact.autoTags ?? [])].map((t) => t.toLowerCase())
  if (tags.some((t) => t.includes(needle))) return 4
  // D6: allowed-tools is part of the frontmatter scope.
  const tools = artifact.frontmatter?.['allowed-tools'] ?? artifact.frontmatter?.tools
  const toolText = Array.isArray(tools) ? tools.join(' ').toLowerCase() : String(tools ?? '').toLowerCase()
  if (needle && toolText.includes(needle)) return 4
  return null
}

/** §7: OR within a facet, AND across facets. */
export function matchesFacets(artifact, facets) {
  const tags = [...(artifact.tags ?? []), ...(artifact.autoTags ?? [])].map((t) => t.toLowerCase())

  if (facets.type.length && !facets.type.includes(artifact.type)) return false
  if (facets.source.length && !facets.source.includes(artifact.source.toLowerCase())) return false
  if (facets.tag.length && !facets.tag.some((t) => tags.includes(t))) return false

  for (const flag of facets.is) {
    if (!matchesFlag(artifact, flag)) return false
  }
  return true
}

function matchesFlag(artifact, flag) {
  switch (flag) {
    case 'duplicate': return Boolean(artifact.cluster)
    case 'fail': return artifact.validation?.verdict === 'FAIL'
    case 'warn': return artifact.validation?.verdict === 'WARN'
    case 'pass': return artifact.validation?.verdict === 'PASS'
    case 'orphan': return Boolean(artifact.orphan)
    case 'unresolved': return (artifact.unresolved?.length ?? 0) > 0
    case 'diverged': return artifact.cluster?.drift === 'diverged'
    // Explicit false, not falsy: a missing `effective` field must not read as "shadowed".
    case 'shadowed': return artifact.cluster ? artifact.effective === false : false
    case 'effective': return Boolean(artifact.effective)
    case 'installed': return Boolean(artifact.installed)
    default: return true
  }
}

/**
 * Filter and rank. `bodyText` is supplied only where bodies are available (server side).
 * @param {Array} artifacts
 * @param {string} raw
 * @param {(a: any) => string} [bodyOf]
 */
export function search(artifacts, raw, bodyOf = null) {
  const { text, body, facets } = parseQuery(raw)
  const needle = text.toLowerCase()

  const hits = []
  for (const artifact of artifacts) {
    if (!matchesFacets(artifact, facets)) continue

    if (body.length) {
      if (!bodyOf) continue // body: is server-side only; see the plan's decision 1
      const haystack = bodyOf(artifact).toLowerCase()
      if (!body.every((term) => haystack.includes(term))) continue
    }

    const rank = needle ? rankOf(artifact, needle) : 5
    if (rank === null) continue
    hits.push({ artifact, rank })
  }

  // §7: within a rank, most recently modified first.
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      (Date.parse(b.artifact.modified) || 0) - (Date.parse(a.artifact.modified) || 0) ||
      a.artifact.name.localeCompare(b.artifact.name),
  )
  return hits.map((h) => h.artifact)
}

/** §7 Tags view: all tags with counts, explicit and auto kept apart (D7). */
export function tagCounts(artifacts) {
  const explicit = new Map()
  const auto = new Map()
  for (const a of artifacts) {
    for (const t of a.tags ?? []) explicit.set(t, (explicit.get(t) ?? 0) + 1)
    for (const t of a.autoTags ?? []) auto.set(t, (auto.get(t) ?? 0) + 1)
  }
  const sort = (m) => [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([tag, count]) => ({ tag, count }))
  return { explicit: sort(explicit), auto: sort(auto) }
}

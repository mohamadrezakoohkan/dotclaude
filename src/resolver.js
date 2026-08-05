import crypto from 'node:crypto'

// §5 duplicates & shadowing. Two distinct situations, named precisely:
//   shadowing        — same type + name reachable through precedence (project vs personal)
//   cross-repo dup   — same type + name in unrelated sources
// Both share one cluster key; what differs is whether the copies span sources.

/**
 * Content hash over the *normalized* body. §5 mandates trailing-whitespace normalization
 * for the diff, so the hash must agree with it — otherwise a cluster reads "diverged"
 * while its diff shows nothing.
 */
export function normalizeForHash(body) {
  return String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
}

export function contentHash(body) {
  return crypto.createHash('sha256').update(normalizeForHash(body)).digest('hex').slice(0, 16)
}

/**
 * §5 winner order. Declared `priority` first — D8's model, and the only clause the spec
 * originally had beyond source name. Everything after `source` is 0012's extension, needed
 * because intra-source copies tie on both of the spec's clauses.
 */
function compareCopies(a, b) {
  return (
    (b.priority ?? 0) - (a.priority ?? 0) ||
    a.source.localeCompare(b.source) ||
    Number(b.installed) - Number(a.installed) ||
    compareVersions(b.plugin?.version, a.plugin?.version) ||
    (Date.parse(b.modified) || 0) - (Date.parse(a.modified) || 0) ||
    a.path.localeCompare(b.path)
  )
}

function compareVersions(a, b) {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff) return diff
  }
  return 0
}

/**
 * Group artifacts into clusters and mark effective / shadowed / drift.
 * @param {Array} artifacts each already carrying `installed` (0012)
 */
export function resolveClusters(artifacts) {
  const groups = new Map()
  for (const artifact of artifacts) {
    const key = `${artifact.type}/${artifact.name}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(artifact)
  }

  const decorated = new Map()
  const clusters = []

  for (const [key, copies] of groups) {
    const hashes = new Set(copies.map((c) => c.hash))

    if (copies.length === 1) {
      decorated.set(copies[0].id, { ...copies[0], effective: true, cluster: null })
      continue
    }

    const ordered = [...copies].sort(compareCopies)
    const winner = ordered[0]
    const sources = new Set(copies.map((c) => c.source))

    // §5: "tie — set priorities" means *you have not declared this*, so it fires whenever
    // equal priorities forced a fallback — even when a fallback then resolved it.
    const tie = ordered.filter((c) => (c.priority ?? 0) === (winner.priority ?? 0)).length > 1

    const cluster = {
      key,
      type: winner.type,
      name: winner.name,
      // §5's two situations. Copies inside one source can only be reached through
      // precedence, so they are shadowing; across sources they are a duplicate cluster.
      situation: sources.size > 1 ? 'cross-repo-duplicate' : 'shadowing',
      drift: hashes.size === 1 ? 'identical' : 'diverged',
      copies: ordered.map((c) => ({
        id: c.id,
        source: c.source,
        path: c.path,
        absPath: c.absPath,
        priority: c.priority,
        hash: c.hash,
        installed: c.installed,
        version: c.plugin?.version ?? null,
        effective: c.id === winner.id,
      })),
      tie,
      // 0012: `installed` is a fact about what Claude Code has on disk; `effective` is
      // dotclaude's declared-priority winner.
      //
      // Only flag disagreement when the winner is *itself a plugin copy* that is not the
      // installed one — a stale cached version beating the live one, which is the case M0
      // found (3.1.8 shown while ios ran 3.3.0). A source-repo copy outranking the
      // installed cache is expected, not a defect: one is source, the other is what runs.
      // Flagging it too would fire on 73 of 131 clusters and train the reader to ignore it.
      installedDisagrees:
        copies.some((c) => c.installed) && Boolean(winner.plugin) && !winner.installed,
    }
    clusters.push(cluster)

    for (const copy of copies) {
      decorated.set(copy.id, {
        ...copy,
        effective: copy.id === winner.id,
        shadowedBy: copy.id === winner.id ? null : { id: winner.id, source: winner.source },
        cluster: {
          key,
          situation: cluster.situation,
          drift: cluster.drift,
          copies: cluster.copies.length,
          tie: cluster.tie,
          position: cluster.copies.findIndex((c) => c.id === copy.id) + 1,
          installedDisagrees: cluster.installedDisagrees,
        },
      })
    }
  }

  // §8 Duplicates view: diverged before identical.
  clusters.sort(
    (a, b) =>
      Number(b.drift === 'diverged') - Number(a.drift === 'diverged') ||
      b.copies.length - a.copies.length ||
      a.name.localeCompare(b.name),
  )

  return {
    artifacts: artifacts.map((a) => decorated.get(a.id) ?? a),
    clusters,
  }
}

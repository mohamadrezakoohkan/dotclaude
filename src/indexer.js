import fs from 'node:fs/promises'
import path from 'node:path'
import { loadSources, expandHome, configPath, currentMode } from './config.js'
import { buildSource } from './pipeline.js'
import { buildGraph } from './linker.js'
import { resolveClusters, contentHash } from './resolver.js'
import { loadInstalledPlugins, isInstalledCopy } from './plugins.js'
import { validateAll } from './validators.js'

// D2: the index lives in memory and is rebuilt on change. The JSON snapshot for instant
// startup is M6; until then every boot does a full scan.
let index = emptyIndex()

function emptyIndex() {
  return {
    artifacts: new Map(),
    clusters: [],
    sources: [],
    collisions: [],
    errors: [],
    timings: [],
    configError: null,
    pluginManifestError: null,
    builtAt: null,
    workspace: null,
  }
}

export async function buildIndex() {
  const next = emptyIndex()
  const { sources, configError, workspace, fatal } = await loadSources()
  next.configError = configError
  next.workspace = workspace ?? null

  // 0023, FR-005 (the rescan half): an unusable workspace file after boot must not widen the
  // corpus and must not empty it. Keep the last good index and surface the error as a chip —
  // an editor's atomic save must not cost a reader the index they are looking at. The BOOT half
  // lives in server.js, which exits instead: at boot there is no last-good to keep.
  if (fatal) {
    if (index.artifacts.size) {
      index = { ...index, configError, workspace: workspace ?? index.workspace }
      return index
    }
    next.fatal = true
    index = next
    return index
  }

  // Source paths in a workspace file are relative to that file's directory, not to this repo
  // (FR-003). In library mode the base is unchanged.
  const base = currentMode().workspaceDir ?? undefined

  // 0009: every source needs to know the others' roots to decide which files it owns.
  const allRoots = sources.map((s) => expandHome(s.path, base))

  for (const source of sources) {
    const root = expandHome(source.path, base)

    // §2: a missing path is listed with an error chip and the app still boots.
    let pathError = null
    try {
      const stat = await fs.stat(root)
      if (!stat.isDirectory()) pathError = 'not a directory'
    } catch (err) {
      pathError = err.code === 'ENOENT' ? 'path does not exist' : err.message
    }

    if (pathError) {
      next.sources.push({ ...source, root, error: pathError, artifacts: 0 })
      continue
    }

    const { artifacts, errors, timing } = await buildSource(source, allRoots, root)
    next.timings.push(timing)
    next.errors.push(...errors.map((e) => ({ ...e, source: source.name })))

    for (const artifact of artifacts) {
      if (next.artifacts.has(artifact.id)) {
        // Ids are path-derived (0003), so a collision here means two artifacts claim one
        // path — a real bug, not corpus structure. Kept visible rather than swallowed.
        next.collisions.push({ id: artifact.id, path: artifact.absPath })
        continue
      }
      next.artifacts.set(artifact.id, artifact)
    }

    next.sources.push({ ...source, root, error: null, artifacts: timing.artifacts })
  }

  // §3 pipeline, cross-source half: link → resolve duplicates → validate, over everything.
  const { installPaths, error: pluginError } = await loadInstalledPlugins()
  next.pluginManifestError = pluginError

  const hashed = [...next.artifacts.values()].map((a) => ({
    ...a,
    hash: contentHash(a.body),
    // 0012: a fact about what Claude Code has on disk, kept separate from `effective`.
    installed: a.plugin ? isInstalledCopy(a.absPath, installPaths) : false,
  }))

  const resolved = resolveClusters(buildGraph(hashed))
  next.clusters = resolved.clusters
  next.artifacts = new Map(validateAll(resolved.artifacts).map((a) => [a.id, a]))

  next.builtAt = new Date().toISOString()
  index = next
  return index
}

/** §10: the index endpoint returns everything except bodies. */
export function listArtifacts() {
  return [...index.artifacts.values()].map(({ body, ...rest }) => rest)
}

export function getArtifact(id) {
  return index.artifacts.get(id) ?? null
}

/** All artifacts, bodies included — the graph and renderer need the whole set. */
export function allArtifacts() {
  return [...index.artifacts.values()]
}

export function allClusters() {
  return index.clusters
}

/** Every source root, for M6's watcher. Recomputed per build so config changes are seen. */
export function watchedRoots() {
  const roots = index.sources.filter((s) => !s.error).map((s) => s.root)
  // 0023, FR-007: the workspace file is the source list, so its own directory must be watched
  // even when it sits outside every root — otherwise editing the mapping is invisible until a
  // manual Rescan, which is the exact gap 0009's follow-up closed for `sources.json`.
  const dir = currentMode().workspaceDir
  if (dir && !roots.some((root) => dir === root || dir.startsWith(root + path.sep))) roots.push(dir)
  return roots
}

/** §10 persistence: adopt a snapshot for instant startup. Truth is still the filesystem. */
export function adoptSnapshot(snapshot) {
  index = {
    artifacts: new Map(snapshot.artifacts.map((a) => [a.id, a])),
    clusters: snapshot.clusters ?? [],
    sources: snapshot.sources ?? [],
    collisions: [],
    errors: [],
    timings: snapshot.timings ?? [],
    configError: snapshot.configError ?? null,
    pluginManifestError: snapshot.pluginManifestError ?? null,
    builtAt: snapshot.builtAt ?? null,
    workspace: snapshot.workspace ?? null,
    fromSnapshot: true,
  }
  return index
}

export function currentIndex() {
  return index
}

export function stats() {
  const workspace = currentMode().mode === 'workspace' ? index.workspace : null
  const byType = {}
  const bySource = {}
  const byVerdict = {}
  let parseErrors = 0
  let beyondSubset = 0
  let orphans = 0
  let unresolvedRefs = 0
  let likelyRenames = 0
  let linked = 0
  for (const artifact of index.artifacts.values()) {
    byType[artifact.type] = (byType[artifact.type] ?? 0) + 1
    bySource[artifact.source] = (bySource[artifact.source] ?? 0) + 1
    if (artifact.parseError) parseErrors++
    if (artifact.beyondSubset) beyondSubset++
    if (artifact.orphan) orphans++
    const verdict = artifact.validation?.verdict
    if (verdict) byVerdict[verdict] = (byVerdict[verdict] ?? 0) + 1
    unresolvedRefs += artifact.unresolved?.length ?? 0
    likelyRenames += (artifact.unresolved ?? []).filter((u) => u.likelyRename).length
    linked += artifact.outlinks?.length ?? 0
  }
  return {
    total: index.artifacts.size,
    byType,
    bySource,
    byVerdict,
    parseErrors,
    beyondSubset,
    orphans,
    unresolvedRefs,
    likelyRenames,
    outlinks: linked,
    collisions: index.collisions.length,
    clusters: index.clusters.length,
    divergedClusters: index.clusters.filter((c) => c.drift === 'diverged').length,
    shadowingClusters: index.clusters.filter((c) => c.situation === 'shadowing').length,
    ties: index.clusters.filter((c) => c.tie).length,
    installedDisagreements: index.clusters.filter((c) => c.installedDisagrees).length,
    pluginManifestError: index.pluginManifestError,
    sources: index.sources.map(({ name, path, priority, error, artifacts }) => ({
      name, path, priority, error, artifacts,
    })),
    // 0023, FR-009: the mode, and the file that actually governs this run. §8's first-run copy
    // and the header both read these, so no screen can imply the wrong corpus. The workspace
    // fields are gated on the mode rather than merely copied, so the three can never disagree —
    // a payload saying `library` while naming a workspace is precisely the kind of confident
    // contradiction the client would render as fact.
    mode: currentMode().mode,
    workspaceName: workspace?.name ?? null,
    workspaceFile: workspace?.file ?? null,
    configPath: configPath(),
    configError: index.configError,
    errors: index.errors,
    timings: index.timings,
    builtAt: index.builtAt,
  }
}

import fs from 'node:fs/promises'
import path from 'node:path'
import { expandHome } from './config.js'
import { scan } from './scan.js'
import { classify } from './classify.js'
import { parseFrontmatter } from './frontmatter.js'

// §10 pipeline: scan → classify → parse → link → resolve → validate → serve.
// M1 fills `parse`. The remaining three stay identity functions, tagged with their
// milestone, so each is filled in place rather than restructuring the pipeline.

// link, resolve and validate are cross-source stages — a token in one repo resolves
// against every source — so they run in the indexer over the complete set, not here.

// §7 platform prefixes. §13 lists this as safe to change.
// Add your own organisation's prefix here — §13 lists this as safe to change.
const PLATFORM_PREFIXES = ['ios', 'android', 'shared', 'backend', 'data']

// Plugin layouts Claude Code actually uses, verified on this machine:
//   plugins/cache/<marketplace>/<plugin>/<version>/skills/<name>/SKILL.md
//   plugins/marketplaces/<marketplace>/<plugin>/skills/<name>/SKILL.md
const PLUGIN_CACHE = /(?:^|\/)plugins\/cache\/([^/]+)\/([^/]+)\/([^/]+)\//
const PLUGIN_MARKETPLACE = /(?:^|\/)plugins\/marketplaces\/([^/]+)\/([^/]+)\//

/** §3: the parse stage. Frontmatter → description, tags, name; never throws. */
export function parse(artifact) {
  const { data, body, error, beyondSubset } = parseFrontmatter(artifact.raw)

  // §3 rows 1/2/4 take the frontmatter `name` when present. Rows 3, 5 and 6 derive their
  // canonical name from the path, so a stray `name:` must not override them — a command
  // named `/foo:bar` would otherwise lose its form.
  const canRename = artifact.type === 'skill' || artifact.type === 'agent'
  const fmName = typeof data.name === 'string' ? data.name.trim() : ''

  const description =
    typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null

  const explicitTags = toStringList(data.tags)
  const plugin = detectPlugin(artifact.path)

  return {
    ...artifact,
    name: canRename && fmName ? fmName : artifact.name,
    description,
    frontmatter: data,
    body,
    parseError: error,
    // 0015: well-formed YAML this parser reads only partly. Kept apart from `parseError` so
    // §6 can score them differently and the chips can say different things.
    beyondSubset,
    tags: explicitTags,
    autoTags: autoTagsFor(artifact, plugin, canRename && fmName ? fmName : artifact.name),
    plugin,
    // §3: a linker alias, stored now and resolved by M2. Not an id — 0003 settled that.
    aliases: plugin ? [`${plugin.plugin}:${artifact.name}`] : [],
  }
}

function autoTagsFor(artifact, plugin, name) {
  // §7: source name, artifact type, `plugin`, and the platform prefix parsed from the name.
  const tags = [artifact.source, artifact.type]
  if (plugin) tags.push('plugin')
  const prefix = PLATFORM_PREFIXES.find((p) => name.toLowerCase().startsWith(`${p}-`))
  if (prefix) tags.push(prefix)
  return [...new Set(tags)]
}

function detectPlugin(relPath) {
  const cache = relPath.match(PLUGIN_CACHE)
  if (cache) return { marketplace: cache[1], plugin: cache[2], version: cache[3] }
  const market = relPath.match(PLUGIN_MARKETPLACE)
  // `.claude` appears in this position for a marketplace's own repo-level skills; it is a
  // directory, not a plugin, so it gets no alias.
  if (market && !market[2].startsWith('.')) return { marketplace: market[1], plugin: market[2], version: null }
  return null
}

function toStringList(value) {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').map((v) => v.trim())
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

/**
 * Build every artifact for one source, timed. Timing is per-source so repo size can never
 * masquerade as artifact count.
 *
 * `root` is passed in rather than derived here: since 0023 a source path can be relative to a
 * workspace file instead of to this repo, and a path resolved twice by two modules is a path
 * resolved two ways. This module stays mode-blind — it is handed a directory, as always.
 */
export async function buildSource(source, allRoots = [], root = expandHome(source.path)) {
  const rootIsDotClaude = path.basename(root) === '.claude'
  const startedAt = process.hrtime.bigint()

  // 0009: the innermost registered source owns a file. Any root strictly inside this one
  // claims its own files, so this source must skip them or they index twice — and §5 would
  // read one file on disk as a cross-repo duplicate.
  const innerRoots = allRoots.filter((r) => r !== root && r.startsWith(root + path.sep))

  const { files, errors, depthCapHits } = await scan(root)

  const artifacts = []
  let classified = 0
  let cededToInner = 0

  for (const absPath of files) {
    if (innerRoots.some((r) => absPath.startsWith(r + path.sep))) {
      cededToInner++
      continue
    }
    const relPath = path.relative(root, absPath).split(path.sep).join('/')
    const kind = classify(absPath, relPath, rootIsDotClaude)
    if (!kind) continue
    classified++

    let raw
    let stat
    try {
      raw = await fs.readFile(absPath, 'utf8')
      stat = await fs.stat(absPath)
    } catch (err) {
      errors.push({ path: absPath, message: err.message })
      continue
    }

    // §3 "Stored per artifact". id is path-derived per 0003.
    artifacts.push(
      parse({
        id: `${source.name}/${kind.type}/${relPath}`,
        type: kind.type,
        name: kind.name,
        source: source.name,
        priority: source.priority,
        path: relPath,
        absPath,
        modified: stat.mtime.toISOString(),
        size: stat.size,
        raw,
      }),
    )
  }

  const staged = artifacts.map(({ raw, ...rest }) => rest)
  const scanMs = Number(process.hrtime.bigint() - startedAt) / 1e6

  return {
    artifacts: staged,
    errors,
    timing: {
      source: source.name,
      filesWalked: files.length,
      cededToInner,
      classified,
      artifacts: staged.length,
      parseErrors: staged.filter((a) => a.parseError).length,
      beyondSubset: staged.filter((a) => a.beyondSubset).length,
      depthCapHits,
      scanMs,
    },
  }
}

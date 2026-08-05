import fs from 'node:fs'
import path from 'node:path'

// §3 freshness: watcher events debounce (~500 ms) into ONE re-index. §3 notes git branch
// switches cause event storms and says the debounce plus full-re-index model absorbs them
// by design — that is the property M6's done-when checks, from logs rather than by feel.
const DEBOUNCE_MS = 500

// Watching every source root recursively means watching build output too. The same §3
// ignore list applies, plus a filter for the artifact shapes we actually index — a
// .swiftpm file changing must not rebuild the index.
const IGNORED_SEGMENT = new Set([
  '.git', 'node_modules', 'Pods', 'DerivedData', 'build', '.build',
  'dist', '.gradle', 'vendor', 'target', 'out', '.next',
])

/** Does this path plausibly affect the index? */
export function isRelevant(relPath) {
  const segments = relPath.split(path.sep)
  if (segments.some((s) => IGNORED_SEGMENT.has(s))) return false
  const base = segments.at(-1) ?? ''
  if (base.startsWith('.') && base !== '.claude' && base !== '.cursor') return false
  // 0012's follow-up: a plugin update changes which copy is installed without touching any
  // artifact, so the manifest is a watched input in its own right.
  if (base === 'installed_plugins.json') return true
  // 0009's follow-up, same shape: adding or removing a source changes which root OWNS a file,
  // and the config can change without any artifact changing. Without this, a source added to
  // `sources.json` is invisible until a manual Rescan or a restart.
  if (base === 'sources.json') return true
  // 0023, same shape again: in workspace mode this file IS the source list, so editing the
  // mapping changes the corpus without any artifact changing. FR-007.
  if (base === 'workspace.json') return true
  return base.endsWith('.md') || base.endsWith('.mdc') || base === '' || !base.includes('.')
}

/**
 * Watch every root and call `onChange` once per quiet period.
 * @param {string[]} roots
 * @param {() => Promise<void>} onChange
 * @param {(msg: string) => void} [log]
 */
export function startWatching(roots, onChange, log = () => {}) {
  const watchers = []
  let timer = null
  let pending = 0
  let running = false
  let queued = false

  const fire = async () => {
    timer = null
    const absorbed = pending
    pending = 0

    if (running) {
      // A change arrived mid-rebuild. Rebuild once more afterwards rather than racing.
      queued = true
      return
    }
    running = true
    log(`re-index: ${absorbed} event(s) absorbed`)
    try {
      await onChange()
    } catch (err) {
      log(`re-index failed: ${err.message}`)
    } finally {
      running = false
      if (queued) {
        queued = false
        schedule()
      }
    }
  }

  const schedule = () => {
    pending++
    if (timer) clearTimeout(timer)
    timer = setTimeout(fire, DEBOUNCE_MS)
  }

  for (const root of roots) {
    try {
      // Recursive watch: the platform reports files created inside directories that did not
      // exist when watching began, which is the case 0002 flagged.
      const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (filename && !isRelevant(filename)) return
        schedule()
      })
      watcher.on('error', (err) => log(`watch error on ${root}: ${err.message}`))
      watchers.push(watcher)
    } catch (err) {
      log(`cannot watch ${root}: ${err.message}`)
    }
  }

  return {
    watching: watchers.length,
    close: () => {
      if (timer) clearTimeout(timer)
      for (const w of watchers) w.close()
    },
  }
}

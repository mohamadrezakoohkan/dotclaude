import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ROOT_DIR, currentMode } from './config.js'

// §10 persistence: a JSON snapshot of the last index for instant startup. D2 is explicit
// that truth is always the filesystem — the snapshot is a cache, never an authority, so a
// stale or corrupt one must degrade to a full scan rather than serve wrong data.
const DIR = path.join(ROOT_DIR, '.dotclaude-cache')
const LIBRARY_FILE = path.join(DIR, 'index.json')
const WORKSPACE_DIR = path.join(DIR, 'workspaces')

/**
 * 0023, FR-008: the snapshot is keyed per mode. With one shared file, a workspace run
 * overwrote the library's cache and the next library boot painted the workspace's handful of
 * sources as the whole library — briefly, plausibly, and with correct-looking source pills —
 * because §10 serves the snapshot before the startup rescan finishes. Keying by the workspace
 * file's absolute path also keeps two different workspaces from sharing one cache.
 */
export function snapshotPath(mode = currentMode()) {
  if (mode.mode !== 'workspace') return LIBRARY_FILE
  const key = crypto.createHash('sha1').update(mode.workspaceFile).digest('hex').slice(0, 8)
  return path.join(WORKSPACE_DIR, `${key}.json`)
}

// Bump when the artifact record shape changes, so an old snapshot is ignored rather than
// deserialized into a shape the code no longer expects.
// 7: artifacts carry `beyondSubset` (0015). A version-6 snapshot still has the 10 speckit
// skills recorded as parse errors, so serving it would show stale FAIL chips until the
// startup rescan finished.
const SNAPSHOT_VERSION = 7

export async function saveSnapshot(index) {
  const payload = {
    version: SNAPSHOT_VERSION,
    builtAt: index.builtAt,
    artifacts: [...index.artifacts.values()],
    clusters: index.clusters,
    sources: index.sources,
    timings: index.timings,
    configError: index.configError,
    pluginManifestError: index.pluginManifestError,
    // 0023: carried so a snapshot-first paint already knows it is showing a workspace. Without
    // it the header would say "Library" for the first seconds of a workspace run.
    workspace: index.workspace ?? null,
  }
  const file = snapshotPath()
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
    // Write then rename: a crash mid-write must not leave a half-parsed snapshot behind.
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(payload))
    await fs.rename(tmp, file)
    return true
  } catch {
    return false
  }
}

export async function loadSnapshot() {
  try {
    const raw = await fs.readFile(snapshotPath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed.version !== SNAPSHOT_VERSION) return null
    if (!Array.isArray(parsed.artifacts) || !parsed.artifacts.length) return null
    return parsed
  } catch {
    return null
  }
}

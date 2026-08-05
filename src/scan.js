import fs from 'node:fs/promises'
import path from 'node:path'

// §3: ignore list, max depth 10, symlinks followed with a visited-path cycle guard.
const IGNORE = new Set([
  '.git', 'node_modules', 'Pods', 'DerivedData', 'build', '.build',
  'dist', '.gradle', 'vendor', 'target', 'out', '.next',
])
const MAX_DEPTH = 10

/**
 * Walk a source root and return every regular file inside it, following symlinks.
 * A directory that cannot be read is recorded and skipped: §2 says a bad path never
 * crashes the app.
 *
 * Measured worth of the ignore list on the real corpus: 551,406 files become 42,775.
 */
export async function scan(root) {
  const files = []
  const errors = []
  const visited = new Set()
  let depthCapHits = 0

  async function walk(dir, depth) {
    if (depth > MAX_DEPTH) {
      depthCapHits++
      return
    }

    // Cycle guard keyed on the resolved path, so a symlink pointing at an ancestor
    // terminates instead of recursing forever.
    let real
    try {
      real = await fs.realpath(dir)
    } catch (err) {
      errors.push({ path: dir, message: err.message })
      return
    }
    if (visited.has(real)) return
    visited.add(real)

    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (err) {
      errors.push({ path: dir, message: err.message })
      return
    }

    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue
      const full = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(full, depth + 1)
      } else if (entry.isFile()) {
        files.push(full)
      } else if (entry.isSymbolicLink()) {
        // Symlinked files must be indexed too — this repo's AGENTS.md is one, and M0's
        // scanner skipped it silently because readdir reports it as a link, not a file.
        try {
          const stat = await fs.stat(full)
          if (stat.isDirectory()) await walk(full, depth + 1)
          else if (stat.isFile()) files.push(full)
        } catch {
          // Broken symlink: nothing to index, and not an error worth surfacing.
        }
      }
    }
  }

  await walk(root, 0)
  return { files, errors, depthCapHits }
}

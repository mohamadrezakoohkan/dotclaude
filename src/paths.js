import path from 'node:path'

/**
 * §10 trust boundary: is this absolute path inside one of the registered source roots?
 *
 * Extracted so the guard can be tested directly. The prefix check uses a separator so
 * `/repo-secrets` is not treated as living inside `/repo`.
 */
export function isInsideRegisteredSource(absPath, roots) {
  if (typeof absPath !== 'string' || !absPath) return false
  const resolved = path.resolve(absPath)
  // A traversal sequence that resolve() collapsed is still a rejection: nothing legitimate
  // arrives with `..` in it, and accepting the collapsed form hides the caller's intent.
  if (absPath.includes(`..${path.sep}`) || absPath.endsWith('..')) return false
  return roots.some((root) => {
    if (!root) return false
    const base = path.resolve(root)
    return resolved === base || resolved.startsWith(base + path.sep)
  })
}

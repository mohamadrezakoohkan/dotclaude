import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// 0012: Claude Code writes this manifest itself, naming the installPath, version and scope
// per plugin. Reading a declaration is not the precedence emulation D8 forbids — but the
// file is treated as advisory: absent or unreadable, §5's tiebreak chain still resolves.
const MANIFEST = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')

/** @returns {{installPaths: Set<string>, entries: Array, error: string|null}} */
export async function loadInstalledPlugins() {
  let raw
  try {
    raw = await fs.readFile(MANIFEST, 'utf8')
  } catch (err) {
    return { installPaths: new Set(), entries: [], error: `no plugin manifest: ${err.code ?? err.message}` }
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { installPaths: new Set(), entries: [], error: `plugin manifest is not valid JSON: ${err.message}` }
  }

  const entries = []
  for (const [key, installs] of Object.entries(parsed.plugins ?? {})) {
    for (const install of Array.isArray(installs) ? installs : [installs]) {
      if (!install?.installPath) continue
      entries.push({
        key,
        plugin: key.split('@')[0],
        marketplace: key.split('@')[1] ?? null,
        installPath: install.installPath,
        version: install.version ?? null,
        scope: install.scope ?? null,
      })
    }
  }

  return { installPaths: new Set(entries.map((e) => e.installPath)), entries, error: null }
}

/**
 * Is this artifact inside a directory the manifest declares installed?
 * Matches on the install path prefix, since the manifest names the plugin root and
 * artifacts live under `skills/`, `agents/`, `commands/`.
 */
export function isInstalledCopy(absPath, installPaths) {
  for (const installPath of installPaths) {
    if (absPath === installPath || absPath.startsWith(installPath + path.sep)) return true
  }
  return false
}

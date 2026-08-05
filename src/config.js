import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// §13: port 4114. §10: localhost only.
export const HOST = '127.0.0.1'
export const PORT = 4114

export const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CONFIG_PATH = path.join(ROOT_DIR, 'sources.json')

// 0023: the file a workspace is named by. Conventionally `<project>/.claude/workspace.json`,
// which is what lets `--workspace <project>` find it without the name being typed.
const WORKSPACE_FILENAME = 'workspace.json'
const CLAUDE_DIR = '.claude'

// §2: shipped as examples to edit. Used only when sources.json is missing, so the app
// still boots and §8's first-run state has a path to show.
const EXAMPLE_SOURCES = [
  { name: 'personal', type: 'local', path: '~/.claude', priority: 50 },
  { name: 'project-a', type: 'local', path: '~/code/your-repo', priority: 100 },
]

/**
 * Resolve a configured path. `base` exists for 0023: a source path inside a workspace file is
 * relative to THAT FILE's directory, so a workspace committed in a project stays correct on
 * another machine. Library behaviour is unchanged, because the default base is this repo.
 */
export function expandHome(p, base = ROOT_DIR) {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return path.resolve(base, p)
}

// ------------------------------------------------------------------ launch mode (0023)

export const LIBRARY_MODE = Object.freeze({
  mode: 'library',
  workspaceFile: null,
  workspaceDir: null,
  name: null,
  port: PORT,
  error: null,
})

/**
 * The mode this process runs in. Resolved once at boot from argv and env, then held here so
 * `loadSources()` — which `buildIndex` calls on EVERY rebuild — sees it without re-parsing
 * arguments. That is what makes Rescan re-read the workspace file with no new refresh path (D3).
 */
let activeMode = LIBRARY_MODE

export function setMode(mode) {
  activeMode = mode ?? LIBRARY_MODE
  return activeMode
}

export function currentMode() {
  return activeMode
}

/** The file that actually governs this run — what §8's first-run copy must point at. */
export function configPath() {
  return activeMode.mode === 'workspace' ? activeMode.workspaceFile : CONFIG_PATH
}

/**
 * Resolve the launch mode from arguments and environment (FR-001, FR-011). Reads no file and
 * starts nothing, so the whole matrix is testable without a boot. Its only ambient input is
 * `process.cwd()`, used to resolve a relative `--workspace` argument the way any CLI would.
 *
 * `--workspace` is also npm's own monorepo flag, so it only reaches us after `--`
 * (`npm start -- --workspace <p>`). Verified under npm 11.16.0; without the `--`, npm consumes
 * it and exits before this code runs, which is why DOTCLAUDE_WORKSPACE exists as the form that
 * cannot be eaten. See specs/003-workspace-mode/research.md.
 *
 * @param {string[]} argv arguments after the script name
 * @param {Record<string, string|undefined>} env
 */
export function resolveMode(argv = [], env = {}) {
  let target = null
  let portArg = null
  let error = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const [flag, inline] = splitFlag(arg)

    if (flag === '--workspace' || flag === '--ws') {
      const value = inline ?? argv[++i]
      if (!value || value.startsWith('-')) {
        error = `${flag} needs a path to a workspace.json, a project directory, or a .claude directory`
        break
      }
      target = value
      continue
    }
    if (flag === '--port' || flag === '-p') {
      const value = inline ?? argv[++i]
      if (!value || value.startsWith('-')) {
        error = `${flag} needs a port number`
        break
      }
      portArg = value
      continue
    }
    error = `unknown argument: ${arg}`
    break
  }

  const port = portArg ?? env.PORT ?? null
  const parsedPort = port === null ? PORT : Number(port)
  if (!error && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
    error = `not a usable port: ${port}`
  }

  if (error) return { ...LIBRARY_MODE, port: PORT, error }

  const chosen = target ?? env.DOTCLAUDE_WORKSPACE ?? null
  if (!chosen) return { ...LIBRARY_MODE, port: parsedPort }

  const workspaceFile = resolveWorkspaceFile(chosen)
  const workspaceDir = path.dirname(workspaceFile)
  return {
    mode: 'workspace',
    workspaceFile,
    workspaceDir,
    // A fallback only: the file's own `name` wins (see `loadWorkspace`). `.claude/workspace.json`
    // names the project, not the dot-directory, because that is the name a reader recognises.
    name: path.basename(path.basename(workspaceDir) === CLAUDE_DIR ? path.dirname(workspaceDir) : workspaceDir),
    port: parsedPort,
    error: null,
  }
}

function splitFlag(arg) {
  const eq = arg.indexOf('=')
  return eq === -1 ? [arg, undefined] : [arg.slice(0, eq), arg.slice(eq + 1)]
}

/**
 * A file, a project directory, or a `.claude` directory — all three name one workspace file.
 * Decided by shape rather than by `fs.stat` so this stays pure; a path that turns out not to
 * exist is reported by the loader, which names the file it looked for.
 */
function resolveWorkspaceFile(target) {
  const abs = expandHome(target, process.cwd())
  if (abs.endsWith('.json')) return abs
  if (path.basename(abs) === CLAUDE_DIR) return path.join(abs, WORKSPACE_FILENAME)
  return path.join(abs, CLAUDE_DIR, WORKSPACE_FILENAME)
}

// ------------------------------------------------------------------ loading

/**
 * The source list for this run. In library mode that is `sources.json`; in workspace mode it is
 * the workspace file and NOTHING ELSE — `sources.json` is not opened (FR-002).
 *
 * Called on every rebuild, so editing either file and pressing Rescan is enough.
 */
export async function loadSources() {
  const mode = currentMode()
  return mode.mode === 'workspace' ? loadWorkspace(mode) : loadLibrary()
}

/**
 * §2: never crashes on config — a missing or malformed file yields the examples plus an error
 * the UI shows as a chip.
 */
async function loadLibrary() {
  let raw
  try {
    raw = await fs.readFile(CONFIG_PATH, 'utf8')
  } catch {
    return {
      sources: EXAMPLE_SOURCES,
      configError: `No sources.json — showing examples. Edit ${CONFIG_PATH}`,
    }
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { sources: EXAMPLE_SOURCES, configError: `sources.json is not valid JSON: ${err.message}` }
  }

  const { sources, problems } = readSourceArray(parsed, 'sources.json')

  if (!sources.length) {
    return { sources: EXAMPLE_SOURCES, configError: 'sources.json defines no usable sources' }
  }
  return { sources, configError: problems.length ? problems.join('; ') : null }
}

/**
 * 0023: the workspace file replaces the source list. Note what this function does NOT do — it
 * never exits and never falls back to a wider list. It reports `fatal`, and the CALLER decides:
 * the boot path exits non-zero, the rebuild path keeps the last good index. A loader that
 * exited would be untestable and would kill a running server over an editor's atomic save.
 *
 * @returns {Promise<{sources: object[], configError: string|null, workspace: object, fatal?: true}>}
 */
export async function loadWorkspace(mode) {
  const file = mode.workspaceFile
  const workspace = { name: mode.name, file, dir: mode.workspaceDir }
  const fail = (configError) => ({ sources: [], configError, workspace, fatal: true })

  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    return fail(
      err.code === 'ENOENT'
        ? `no workspace file at ${file}`
        : `cannot read ${file}: ${err.message}`,
    )
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return fail(`${file} is not valid JSON: ${err.message}`)
  }

  const { sources, problems } = readSourceArray(parsed, path.basename(file))
  if (!sources.length) return fail(`${file} defines no usable sources`)

  return {
    sources,
    configError: problems.length ? problems.join('; ') : null,
    workspace: { ...workspace, name: stringOr(parsed.name, mode.name) },
  }
}

/**
 * §2's source contract, read once for both files (FR-004). One schema, not two — which is also
 * what keeps D12's remote sources a drop-in for a workspace as much as for the library.
 */
function readSourceArray(parsed, label) {
  const list = Array.isArray(parsed?.sources) ? parsed.sources : []
  const sources = []
  const problems = []
  const seen = new Set()

  for (const [i, entry] of list.entries()) {
    const where = `${label} sources[${i}]`
    if (!entry?.name || typeof entry.name !== 'string') {
      problems.push(`${where}: missing name`)
      continue
    }
    if (!entry.path || typeof entry.path !== 'string') {
      problems.push(`${where} (${entry.name}): missing path`)
      continue
    }
    if (seen.has(entry.name)) {
      // §2 requires unique display names — two sources sharing one would make every
      // artifact id ambiguous.
      problems.push(`${where}: duplicate source name "${entry.name}", skipped`)
      continue
    }
    seen.add(entry.name)
    sources.push({
      name: entry.name,
      type: entry.type ?? 'local',
      path: entry.path,
      priority: Number.isFinite(entry.priority) ? entry.priority : 50,
    })
  }

  return { sources, problems }
}

const stringOr = (value, fallback) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback

import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOST, resolveMode, setMode, loadSources } from './config.js'
import { spawn } from 'node:child_process'
import {
  buildIndex, listArtifacts, getArtifact, allArtifacts, allClusters, stats,
  watchedRoots, adoptSnapshot, currentIndex,
} from './indexer.js'
import { renderMarkdown } from './markdown.js'
import { unifiedDiff, collapseContext } from './diff.js'
import { buildValidationPrompt } from './prompt.js'
import { search, tagCounts } from './search.js'
import { startWatching } from './watcher.js'
import { saveSnapshot, loadSnapshot } from './snapshot.js'
import { isInsideRegisteredSource } from './paths.js'

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const USAGE = `dotclaude — index .claude/ and .cursor/ artifacts (§10)

  npm start                                    the library: every source in sources.json
  npm start -- --workspace <path>              only the sources named by a workspace.json (0023)
  npm start -- --workspace <path> --port 4115  …beside a library instance
  DOTCLAUDE_WORKSPACE=<path> npm start         same, without the npm argument dance

<path> may be the workspace file, a project directory (→ .claude/workspace.json), or a .claude
directory. The leading \`--\` is required: \`--workspace\` is also npm's own monorepo flag, so
without it npm consumes the argument and this process never starts.

Exit: 2 misuse · 1 the workspace file cannot be used.`

// 0023: the launch mode is resolved once, here, before anything reads a source list or a
// snapshot — both are mode-dependent, and a snapshot read under the wrong mode is exactly the
// wrong-corpus first paint FR-008 exists to prevent.
const launch = resolveMode(process.argv.slice(2), process.env)
if (launch.error) {
  console.error(`${launch.error}\n\n${USAGE}`)
  process.exit(2)
}
setMode(launch)

// FR-005, the boot half: an unusable workspace file exits. §2's never-crashes-on-config rule
// exists so a bad path cannot stop you browsing — it must not become a silent fallback to a
// corpus WIDER than the one asked for, which is the whole point of this mode. The rescan half
// is the opposite and lives in buildIndex: keep the last good index, show a chip, stay up.
if (launch.mode === 'workspace') {
  const probe = await loadSources()
  if (probe.fatal) {
    console.error(`workspace: ${probe.configError}`)
    console.error('nothing was indexed, and sources.json was deliberately not read as a fallback.')
    process.exit(1)
  }
}

const LISTEN_PORT = launch.port

// §10 API surface: index, artifact by id, events (SSE), rescan (POST), open-in-editor (POST).
const ARTIFACT_PREFIX = '/api/artifacts/'

/** Connected SSE clients. §3: the UI gets a ping and refetches. */
const clients = new Set()

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const res of clients) {
    try {
      res.write(payload)
    } catch {
      clients.delete(res)
    }
  }
}

let rebuilding = null

/** One rebuild at a time; concurrent callers await the same promise. */
async function rebuild(reason) {
  if (rebuilding) return rebuilding
  rebuilding = (async () => {
    const started = Date.now()
    const index = await buildIndex()
    await saveSnapshot(index)
    const ms = Date.now() - started
    console.log(`re-indexed (${reason}): ${index.artifacts.size} artifacts in ${ms} ms`)
    broadcast({ type: 'updated', reason, artifacts: index.artifacts.size, ms })
    return index
  })()
  try {
    return await rebuilding
  } finally {
    rebuilding = null
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${LISTEN_PORT}`)

  // §3 freshness: SSE ping, the UI refetches. Kept before the method guard because it is a
  // long-lived GET.
  if (url.pathname === '/api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    res.write('retry: 2000\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  if (req.method === 'POST') {
    if (url.pathname === '/api/rescan') {
      const index = await rebuild('manual rescan')
      return json(res, 200, { artifacts: index.artifacts.size })
    }
    if (url.pathname === '/api/open') {
      return openInEditor(req, res)
    }
    return send(res, 404, 'text/plain', 'Not found')
  }

  if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Method not allowed')

  if (url.pathname === '/api/index') {
    return json(res, 200, { artifacts: listArtifacts(), stats: stats() })
  }

  // §7 `body:` full-text. Every other operator runs client-side and instantly; bodies are
  // deliberately absent from /api/index (§10), so full text is one round trip.
  if (url.pathname === '/api/search') {
    const q = url.searchParams.get('q') ?? ''
    const hits = search(allArtifacts(), q, (a) => a.body ?? '')
    return json(res, 200, { ids: hits.map((a) => a.id) })
  }

  if (url.pathname === '/api/tags') {
    return json(res, 200, tagCounts(allArtifacts()))
  }

  // §6 Claude handoff. Plain text so the client can put it straight on the clipboard.
  if (url.pathname === '/api/prompt') {
    const artifact = getArtifact(url.searchParams.get('id') ?? '')
    if (!artifact) return send(res, 404, 'text/plain; charset=utf-8', 'unknown artifact')
    return send(res, 200, 'text/plain; charset=utf-8', buildValidationPrompt(artifact))
  }

  if (url.pathname === '/api/clusters') {
    return json(res, 200, { clusters: allClusters() })
  }

  // §5 diff view: computed on demand, never stored. D11 is read-only and §11 forbids
  // offering "make identical" anywhere.
  if (url.pathname === '/api/diff') {
    const a = getArtifact(url.searchParams.get('a') ?? '')
    const b = getArtifact(url.searchParams.get('b') ?? '')
    if (!a || !b) return json(res, 404, { error: 'both a and b must be artifact ids' })
    const diff = unifiedDiff(a.body, b.body)
    return json(res, 200, {
      a: { id: a.id, source: a.source, path: a.path },
      b: { id: b.id, source: b.source, path: b.path },
      identical: diff.changedLines === 0,
      added: diff.added,
      removed: diff.removed,
      changedLines: diff.changedLines,
      rows: collapseContext(diff.rows),
    })
  }

  if (url.pathname.startsWith(ARTIFACT_PREFIX)) {
    const id = decodeURIComponent(url.pathname.slice(ARTIFACT_PREFIX.length))
    const artifact = getArtifact(id)
    if (!artifact) return json(res, 404, { error: `No artifact with id ${id}` })
    return json(res, 200, withRenderedBody(artifact))
  }

  // §7's ranking must be identical in the browser and on the server, so the client imports
  // the same module rather than a copy that could drift.
  if (url.pathname === '/search.js') {
    return serveFile(res, path.join(path.dirname(fileURLToPath(import.meta.url)), 'search.js'))
  }

  // Same reason for the scope helpers (0017): pure, shared, and imported rather than copied,
  // so `test/run.mjs` and the browser exercise the same code.
  if (url.pathname === '/scope.js') {
    return serveFile(res, path.join(path.dirname(fileURLToPath(import.meta.url)), 'scope.js'))
  }

  return serveStatic(res, url.pathname)
})

/**
 * §4: link extraction runs on the raw markdown, so the rendered body carries the resolved
 * links inline. The token → target map comes from the graph, not from re-matching text.
 */
function withRenderedBody(artifact) {
  const byId = new Map(allArtifacts().map((a) => [a.id, a]))
  const targets = new Map()
  for (const link of artifact.outlinks ?? []) {
    const target = byId.get(link.primary)
    if (!target) continue
    targets.set(link.token, {
      href: `#${encodeURIComponent(link.primary)}`,
      title: link.ambiguousType
        ? `${link.targets.length} matches, types differ — pick one`
        : link.targets.length > 1
          ? `${target.type} in ${target.source} (+${link.targets.length - 1} more copies)`
          : `${target.type} in ${target.source}`,
    })
  }

  const enriched = (artifact.outlinks ?? []).map((link) => ({
    ...link,
    targetNames: link.targets.map((id) => {
      const t = byId.get(id)
      return t ? { id, name: t.name, type: t.type, source: t.source } : { id }
    }),
  }))

  const backlinks = (artifact.backlinks ?? []).map((id) => {
    const b = byId.get(id)
    return b ? { id, name: b.name, type: b.type, source: b.source } : { id }
  })

  return {
    ...artifact,
    html: renderMarkdown(artifact.body, (token) => targets.get(token) ?? null),
    outlinks: enriched,
    backlinks,
  }
}

/**
 * §10 trust boundary: open-in-editor is restricted to paths inside a registered source.
 * D11 keeps the app read-only, so handing off is the only write path — and it must not
 * become a way to open arbitrary files on the machine.
 */
async function openInEditor(req, res) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 4096) return json(res, 413, { error: 'payload too large' })
  }

  let id
  try {
    id = JSON.parse(body || '{}').id
  } catch {
    return json(res, 400, { error: 'body must be JSON' })
  }

  // Only an indexed artifact's own path can be opened. Resolving a caller-supplied path
  // would reintroduce exactly the traversal this guard exists to prevent.
  const artifact = getArtifact(String(id ?? ''))
  if (!artifact) return json(res, 404, { error: 'unknown artifact id' })

  if (!isInsideRegisteredSource(artifact.absPath, watchedRoots())) {
    return json(res, 403, { error: 'path is outside every registered source' })
  }

  try {
    // macOS `open` hands off to the default app; VS Code takes it when registered for .md.
    spawn('open', [artifact.absPath], { detached: true, stdio: 'ignore' }).unref()
  } catch (err) {
    return json(res, 500, { error: err.message })
  }
  return json(res, 200, { opened: artifact.absPath })
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1)
  // Resolve and confine to public/ — a static server must not walk out of its root.
  const file = path.resolve(PUBLIC_DIR, rel)
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    return send(res, 403, 'text/plain', 'Forbidden')
  }
  return serveFile(res, file)
}

async function serveFile(res, file) {
  try {
    const body = await fs.readFile(file)
    return send(res, 200, MIME[path.extname(file)] ?? 'application/octet-stream', body)
  } catch {
    return send(res, 404, 'text/plain', 'Not found')
  }
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type })
  res.end(body)
}

function json(res, status, payload) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(payload))
}

// §10 persistence: serve a snapshot immediately, then rebuild in the background. Truth is
// always the filesystem (D2), so the snapshot only decides how fast the first paint is.
const snapshot = await loadSnapshot()
if (snapshot) {
  adoptSnapshot(snapshot)
  console.log(`snapshot: ${snapshot.artifacts.length} artifacts from ${snapshot.builtAt} — rescanning`)
}

if (!snapshot) await buildIndex()
const { total, byType, collisions, errors, timings, sources, parseErrors, beyondSubset, configError } = stats()

// 0023: name the corpus before the numbers, so a wrong workspace is visible in the terminal
// without opening a browser.
console.log(
  launch.mode === 'workspace'
    ? `workspace: ${stats().workspaceName} — ${launch.workspaceFile} (sources.json not read)`
    : `library: ${stats().configPath}`,
)

for (const t of timings) {
  console.log(
    `  ${t.source.padEnd(24)} ${String(t.artifacts).padStart(4)} artifacts  ` +
      `${String(t.filesWalked).padStart(6)} files  ${t.scanMs.toFixed(0).padStart(5)} ms` +
      (t.parseErrors ? `  ${t.parseErrors} parse errors` : '') +
      (t.beyondSubset ? `  ${t.beyondSubset} beyond subset` : '') +
      (t.depthCapHits ? `  ${t.depthCapHits} dirs past depth 10` : ''),
  )
}
for (const s of sources.filter((s) => s.error)) console.log(`  ${s.name.padEnd(24)} ERROR: ${s.error}`)
console.log(`index: ${total} artifacts ${JSON.stringify(byType)}`)
if (parseErrors) console.log(`parse errors: ${parseErrors} (indexed with a chip, §3)`)
// 0015: well-formed YAML read only in part. A chip and a score of 1, never a FAIL.
if (beyondSubset) console.log(`beyond subset: ${beyondSubset} (parsed, chipped, scored 1 — §3, §6)`)
if (collisions) console.log(`id collisions: ${collisions} — unexpected under 0003, investigate`)
if (errors.length) console.log(`unreadable paths: ${errors.length}`)
if (configError) console.log(`config: ${configError}`)

// FR-011: a workspace beside the library needs a second port, so a taken one must say what to
// do rather than print a stack trace at someone who ran the app twice.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`port ${LISTEN_PORT} is already in use — another dotclaude is probably running.`)
    console.error(`start this one elsewhere: npm start -- --port ${LISTEN_PORT + 1}`)
    process.exit(1)
  }
  throw err
})

server.listen(LISTEN_PORT, HOST, async () => {
  console.log(`dotclaude on http://${HOST}:${LISTEN_PORT}`)

  // A snapshot start serves stale data until this finishes; the SSE ping then refreshes the
  // open page, which is exactly §3's "Library updated" path.
  if (snapshot) await rebuild('startup rescan')
  else await saveSnapshot(currentIndex())

  // 0009's follow-up: ownership is recomputed on every rebuild (`buildIndex` re-reads the
  // config), but a source ADDED to the config has no watcher until one is registered for it,
  // and a source removed keeps one. So the watched set is reconciled after each rebuild.
  let watcher = startWatching(watchedRoots(), onWatchEvent, (msg) => console.log(`watch: ${msg}`))
  let watching = watchedRoots()
  console.log(`watching ${watcher.watching} source root(s), ~500 ms debounce`)

  async function onWatchEvent() {
    await rebuild('watcher')
    const next = watchedRoots()
    if (next.length === watching.length && next.every((r, i) => r === watching[i])) return
    // The source set changed. Re-register rather than leaving new roots unwatched.
    watcher.close()
    watcher = startWatching(next, onWatchEvent, (msg) => console.log(`watch: ${msg}`))
    watching = next
    console.log(`watch: source set changed — now watching ${watcher.watching} root(s)`)
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      watcher.close()
      server.close()
      process.exit(0)
    })
  }
})

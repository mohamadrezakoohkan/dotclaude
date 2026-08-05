// M5 SPA: dashboard, browse with §7 search, tags, duplicates, diff, artifact page.
// The freshness watcher and open-in-editor are M6; the full §9 design pass is M7.
import { search, parseQuery, tagCounts } from '/search.js'
// 0017: pure scope helpers, shared with test/run.mjs rather than duplicated here.
import {
  activeFromQuery, isActive, isScoped, isOutsideScope, knownOnly, parseStored, serializeStored,
} from '/scope.js'

const $ = (id) => document.getElementById(id)
const listEl = $('list')
const detailEl = $('detail')
const railEl = $('rail')
const metaEl = $('meta')
const tabEl = $('tab')
const searchEl = $('search')
const facetsEl = $('facets')
const foldersEl = $('folders')

const TYPE_ORDER = ['skill', 'agent', 'command', 'rule', 'memory']
const TYPE_LABEL = { skill: 'skills', agent: 'agents', command: 'commands', rule: 'rules', memory: 'memory' }

let artifacts = []
let byId = new Map()
let stats = {}
let visible = []
let cursor = -1
let bodyMatchIds = null // set only while a `body:` query is in flight/resolved

// 0017 FR-006: the one place the app persists anything, and it is browser storage — never
// disk, never the server. D11 stays intact: nothing the app indexes is ever written.
const SCOPE_KEY = 'dotclaude.scope.v1'

// Read synchronously, before the first fetch, so the very first render already carries the
// remembered scope (FR-005 — no unfiltered flash that then corrects itself). Names are
// unvalidated here; stale ones are dropped in `load()`, once the source list is known.
let pendingScope = readStoredScope()

// ---------------------------------------------------------------- boot

await load()
window.addEventListener('hashchange', route)
searchEl.addEventListener('input', onSearchInput)
installKeyboard()
installFreshness()
route()

// §3 freshness: an SSE ping, a refetch, and one quiet toast.
function installFreshness() {
  const events = new EventSource('/api/events')
  events.onmessage = async (e) => {
    let payload
    try {
      payload = JSON.parse(e.data)
    } catch {
      return
    }
    if (payload.type !== 'updated') return
    await load()
    await applyFilters(searchEl.value)
    route()
    toast('Library updated')
  }
  // A dropped connection is not worth telling the user about; EventSource retries itself.
  events.onerror = () => {}
}

$('rescan').onclick = () => rescan()

async function rescan() {
  toast('Rescanning…')
  await fetch('/api/rescan', { method: 'POST' })
  // The SSE ping does the reload, so there is nothing to do here.
}

async function openInEditor(id) {
  const res = await fetch('/api/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  toast(res.ok ? 'Opened in editor' : `Could not open: ${(await res.json()).error}`)
}

async function load() {
  const data = await (await fetch('/api/index')).json()
  artifacts = data.artifacts
  stats = data.stats
  byId = new Map(artifacts.map((a) => [a.id, a]))

  const healthy = stats.sources.filter((s) => !s.error).length
  metaEl.textContent = `${stats.total} artifacts · ${healthy}/${stats.sources.length} sources`
  renderMode()
  applyPendingScope()
  renderSourceErrors()
  renderFacets()
  renderFolders()
}

// ---------------------------------------------------------------- 0023 launch mode

/** Is this run scoped to a workspace file rather than the whole library? */
function inWorkspace() {
  return stats.mode === 'workspace'
}

/**
 * 0023, FR-010: state the corpus in the header. This is not decoration — it is the answer to
 * 0017's objection that index-scoping makes a count "silently exclude" folders. Nothing here is
 * silent: the tab says which workspace, and its tooltip says which file decided.
 */
function renderMode() {
  if (!tabEl) return
  const workspace = inWorkspace()
  tabEl.textContent = workspace ? `Workspace · ${stats.workspaceName ?? 'unnamed'}` : 'Library'
  tabEl.classList.toggle('tab-workspace', workspace)
  tabEl.title = workspace
    ? `Only the sources named by ${stats.workspaceFile} are indexed — sources.json was not read`
    : ''
  document.title = workspace ? `dotclaude — ${stats.workspaceName ?? 'workspace'}` : 'dotclaude — Library'
}

/** The sentence that keeps a workspace-relative number from reading as a machine-wide one. */
function workspaceNote(what) {
  return `${what} across the ${stats.sources.length} sources in this workspace — not the whole machine.`
}

// ---------------------------------------------------------------- 0017 remembered scope

/** Storage may be absent or throw (private browsing). Either way: no scope, silently. */
function readStoredScope() {
  try {
    return parseStored(localStorage.getItem(SCOPE_KEY)).active
  } catch {
    return []
  }
}

/** One writer (contracts/scope.md §2). A failure to persist must never break browsing. */
function writeStoredScope(active) {
  try {
    localStorage.setItem(SCOPE_KEY, serializeStored(active))
  } catch {
    /* storage unavailable — the scope simply will not be remembered */
  }
}

/**
 * Seed the remembered scope into the query before anything renders. It goes into the hash
 * rather than into a variable so the query stays the single source of truth (FR-004) and the
 * URL is honest about what is being shown. The hash wins if it already carries a scope, so a
 * shared link is never overridden by what this browser happens to remember (SC-006).
 */
function applyPendingScope() {
  const pending = pendingScope
  pendingScope = []
  if (!pending.length) return

  const { params } = currentRoute()
  if (activeFromQuery(params.get('q') ?? '').length) return // the link brought its own scope

  // FR-010: a source removed or renamed since the scope was stored is dropped here rather
  // than left to hide every artifact.
  const known = knownOnly(pending, stats.sources.filter((s) => !s.error).map((s) => s.name))
  if (!known.length) return

  const terms = known.map((n) => `source:${n}`).join(' ')
  const existing = (params.get('q') ?? '').trim()
  const q = existing ? `${existing} ${terms}` : terms
  searchEl.value = q

  const { view, arg } = currentRoute()
  const next = `#/${view}${arg ? `/${encodeURIComponent(arg)}` : ''}?${new URLSearchParams({ q })}`
  history.replaceState(null, '', next)
}

// ---------------------------------------------------------------- routing (§8, filters in the hash)

function currentRoute() {
  const hash = location.hash.slice(1) || '/'
  const [pathPart, queryPart] = hash.split('?')
  const params = new URLSearchParams(queryPart ?? '')
  const segments = pathPart.split('/').filter(Boolean)
  return { view: segments[0] ?? '', arg: segments.slice(1).map(decodeURIComponent).join('/'), params }
}

function go(view, arg, params = {}) {
  const query = new URLSearchParams(params)
  const q = query.toString()
  location.hash = `#/${view}${arg ? `/${encodeURIComponent(arg)}` : ''}${q ? `?${q}` : ''}`
}

function route() {
  const { view, arg, params } = currentRoute()
  const q = params.get('q') ?? ''
  if (searchEl.value !== q) searchEl.value = q

  applyFilters(q)
  markActiveTab(view)

  if (view === 'a') return openArtifact(arg)
  if (view === 'tags') return renderTags()
  if (view === 'duplicates') return renderDuplicates()
  if (view === 'diff') return renderDiff(arg, params.get('b'))
  return renderDashboard()
}

function markActiveTab(view) {
  for (const a of document.querySelectorAll('.tabs a')) {
    const target = a.getAttribute('href').replace('#/', '')
    a.classList.toggle('active', target === view || (target === '' && view === ''))
  }
}

// ---------------------------------------------------------------- §7 search + browse list

async function onSearchInput() {
  const q = searchEl.value
  const { view, arg } = currentRoute()
  const params = q ? { q } : {}
  // Keep the current view; §8 wants filters in the hash, not a navigation side effect.
  const next = `#/${view}${arg ? `/${encodeURIComponent(arg)}` : ''}${q ? `?${new URLSearchParams(params)}` : ''}`
  if (location.hash !== next) history.replaceState(null, '', next)
  await applyFilters(q)
  renderList()
}

async function applyFilters(q) {
  const { body } = parseQuery(q)
  if (body.length) {
    // Decision 1 in the plan: bodies are absent from /api/index (§10), so `body:` is the
    // one operator that costs a round trip.
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
    const { ids } = await res.json()
    bodyMatchIds = new Set(ids)
    visible = ids.map((id) => byId.get(id)).filter(Boolean)
  } else {
    bodyMatchIds = null
    visible = search(artifacts, q)
  }
  // 0017: the panel has no state of its own, so it re-renders from the query on every change —
  // including a query the user typed or edited by hand.
  renderFolders()
  // T018: the single write path. Derived from the query, never from panel state, so a
  // hand-edited `source:` term is remembered exactly like a ticked box.
  writeStoredScope(activeFromQuery(q))
  renderList()
}

function renderFacets() {
  facetsEl.replaceChildren()
  for (const type of TYPE_ORDER) {
    const count = stats.byType?.[type]
    if (!count) continue
    const chip = el('button', 'chip chip-outline', `${TYPE_LABEL[type]} ${count}`)
    chip.onclick = () => toggleTerm(`type:${type}`)
    facetsEl.append(chip)
  }
  for (const flag of ['is:fail', 'is:duplicate', 'is:orphan', 'is:unresolved']) {
    const chip = el('button', 'chip chip-outline', flag)
    chip.onclick = () => toggleTerm(flag)
    facetsEl.append(chip)
  }
}

function toggleTerm(term) {
  const current = searchEl.value.split(/\s+/).filter(Boolean)
  const next = current.includes(term) ? current.filter((t) => t !== term) : [...current, term]
  searchEl.value = next.join(' ')
  onSearchInput()
}

// ---------------------------------------------------------------- 0017 folder scope
//
// A view filter, expressed as `source:` terms in the query (FR-004). The panel holds NO state
// of its own — it renders from the query every time, which is why hand-editing the search box
// keeps the ticks correct with no reconciliation. Registered sources come from `stats.sources`,
// not `stats.bySource`, so the four sources that currently index zero artifacts are still
// tickable (FR-001, and the spec's edge case).

function sourceRows() {
  return (stats.sources ?? []).filter((s) => !s.error)
}

function renderFolders() {
  foldersEl.replaceChildren()
  const rows = sourceRows()
  if (rows.length < 2) return // one source: a folder filter would be furniture

  const names = rows.map((s) => s.name)
  const active = activeFromQuery(searchEl.value)
  const scoped = isScoped(active, names)
  const shown = active.filter((a) => names.some((n) => n.toLowerCase() === a)).length

  // FR-009: chosen-of-total, so a narrowed list is never mistaken for a small library. When
  // no filter is in force the count reads "all" rather than "0/16" — every folder IS showing,
  // and "0" would describe the ticks instead of the library.
  const head = el('div', 'folders-head')
  head.append(el('span', 'folders-title', 'Folders'))
  head.append(el('span', `folders-count${scoped ? ' folders-count-on' : ''}`,
    scoped ? `${shown}/${names.length}` : 'all'))
  foldersEl.append(head)

  const box = el('div', 'folders-list')
  for (const s of rows) {
    const on = isActive(s.name, active)
    const row = el('button', `folder-row${on ? ' folder-on' : ''}`)
    row.setAttribute('aria-pressed', String(on))
    row.append(el('span', 'folder-tick', on ? '☑' : '☐'))
    row.append(el('span', 'folder-name', s.name))
    row.append(el('span', 'folder-count', String(s.artifacts ?? 0)))
    row.title = scoped && !on ? `${s.name} — hidden by the current scope` : s.name
    row.onclick = () => toggleTerm(`source:${s.name.toLowerCase()}`)
    box.append(row)
  }
  foldersEl.append(box)

  // FR-001 asks for "tick all or none". Only ONE bulk action is implementable: the spec's own
  // edge cases make nothing-ticked and everything-ticked both mean "show everything", so "all"
  // and "none" would be the same button. This is "show all folders", and it clears the terms
  // rather than adding sixteen of them — the shorter query is the one worth bookmarking.
  // Deviation recorded in tasks.md; it is a spec wart, not an implementation shortcut.
  if (scoped) {
    const actions = el('div', 'folders-actions')
    const all = el('button', 'link-button', 'show all folders')
    all.onclick = () => setSourceTerms([])
    actions.append(all)
    foldersEl.append(actions)
  }
}

/** FR-007: is this artifact in a folder the current scope hides? */
function outsideScope(a) {
  const names = sourceRows().map((s) => s.name)
  return isOutsideScope(a.source, activeFromQuery(searchEl.value), names)
}

/** Replace exactly the `source:` terms in the query, leaving every other term alone. */
function setSourceTerms(sources) {
  const kept = searchEl.value.split(/\s+/).filter(Boolean).filter((t) => !/^source:/i.test(t))
  searchEl.value = [...kept, ...sources.map((s) => `source:${s}`)].join(' ')
  onSearchInput()
}

function renderList() {
  listEl.replaceChildren()
  cursor = -1

  if (!artifacts.length) {
    listEl.append(el('p', 'group', 'no artifacts indexed'))
    return
  }
  if (!visible.length) {
    // §8's copy, verbatim — the spec calls it part of the design.
    const q = searchEl.value
    const msg = parseQuery(q).body.length
      ? 'No artifacts match these filters. Clear filters.'
      : q.trim()
        ? 'No matches in frontmatter. Try `body:` to search full text.'
        : 'No artifacts match these filters. Clear filters.'
    const p = el('p', 'group empty-copy', msg)
    listEl.append(p)
    const clear = el('button', 'link-button', 'Clear filters')
    clear.onclick = () => { searchEl.value = ''; onSearchInput() }
    listEl.append(clear)
    return
  }

  const grouped = new Map()
  for (const a of visible) {
    if (!grouped.has(a.type)) grouped.set(a.type, [])
    grouped.get(a.type).push(a)
  }
  const types = [...TYPE_ORDER, ...grouped.keys()].filter((v, i, all) => all.indexOf(v) === i)
  for (const type of types) {
    const rows = grouped.get(type)
    if (!rows) continue
    listEl.append(el('p', 'group', `${TYPE_LABEL[type] ?? `${type}s`} ${rows.length}`))
    for (const a of rows) listEl.append(row(a))
  }
}

function row(artifact) {
  const button = el('button', 'row')
  const v = artifact.validation?.verdict
  if (v) button.append(el('span', `dot dot-${v.toLowerCase()}`, ''))
  button.append(el('span', 'row-name', artifact.name))
  button.append(el('span', 'pill', artifact.source))
  if (artifact.parseError) button.append(el('span', 'chip chip-warn', 'parse error'))
  // 0015: a file that parses but reaches past §3's subset is not a parse error, and must not
  // wear the chip that means one.
  else if (artifact.beyondSubset) button.append(el('span', 'chip chip-warn', 'beyond subset'))
  button.dataset.id = artifact.id
  button.onclick = () => go('a', artifact.id, currentQueryParams())
  if (currentRoute().view === 'a' && currentRoute().arg === artifact.id) {
    button.setAttribute('aria-current', 'true')
  }
  return button
}

function currentQueryParams() {
  const q = searchEl.value
  return q ? { q } : {}
}

// ---------------------------------------------------------------- §8 Dashboard

function renderDashboard() {
  railEl.replaceChildren()
  const wrap = el('div', 'sheet')
  wrap.append(el('h1', null, inWorkspace() ? `${stats.workspaceName ?? 'Workspace'} health` : 'Library health'))
  // 0023: the Dashboard is the screen 0017 was most worried about — it is where a number is
  // read as a fact about the machine. In workspace mode it says whose numbers these are.
  if (inWorkspace()) wrap.append(el('p', 'description', workspaceNote('Every count below is')))

  if (!artifacts.length) {
    // §8 first run.
    wrap.append(el('p', 'empty', `Add your first source in ${stats.configPath}`))
    detailEl.replaceChildren(wrap)
    return
  }

  const grid = el('div', 'stat-grid')
  const add = (label, value, href) => {
    const card = el(href ? 'a' : 'div', 'stat')
    if (href) card.href = href
    card.append(el('span', 'stat-value', String(value)))
    card.append(el('span', 'stat-label', label))
    grid.append(card)
  }
  add('artifacts', stats.total)
  add('FAIL', stats.byVerdict?.FAIL ?? 0, '#/?q=is%3Afail')
  add('WARN', stats.byVerdict?.WARN ?? 0, '#/?q=is%3Awarn')
  add('duplicate clusters', stats.clusters ?? 0, '#/duplicates')
  add('diverged', stats.divergedClusters ?? 0, '#/duplicates')
  add('orphans', stats.orphans ?? 0, '#/?q=is%3Aorphan')
  add('likely renames', stats.likelyRenames ?? 0, '#/?q=is%3Aunresolved')
  add('ties to resolve', stats.ties ?? 0, '#/duplicates')
  wrap.append(grid)

  wrap.append(el('h2', 'section', 'By type'))
  wrap.append(countTable(stats.byType ?? {}, (type) => `#/?q=${encodeURIComponent(`type:${type}`)}`))

  wrap.append(el('h2', 'section', 'By source'))
  const sourceRows = el('div', 'kv')
  for (const s of stats.sources) {
    const rowEl = el('div', 'kv-row')
    const link = el('a', null, s.name)
    link.href = `#/?q=${encodeURIComponent(`source:${s.name}`)}`
    rowEl.append(link)
    rowEl.append(el('span', 'kv-num', s.error ? '—' : String(s.artifacts)))
    if (s.error) rowEl.append(el('span', 'chip chip-fail', s.error))
    else rowEl.append(el('span', 'rail-token', `priority ${s.priority}`))
    sourceRows.append(rowEl)
  }
  wrap.append(sourceRows)

  wrap.append(el('h2', 'section', 'Recently modified'))
  const recent = [...artifacts]
    .sort((a, b) => (Date.parse(b.modified) || 0) - (Date.parse(a.modified) || 0))
    .slice(0, 10)
  wrap.append(linkList(recent.map((a) => ({ id: a.id, name: a.name, source: a.source }))))

  detailEl.replaceChildren(wrap)
  detailEl.scrollTop = 0
}

function countTable(counts, hrefFor) {
  const box = el('div', 'kv')
  for (const [key, value] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const rowEl = el('div', 'kv-row')
    const link = el('a', null, key)
    link.href = hrefFor(key)
    rowEl.append(link)
    rowEl.append(el('span', 'kv-num', String(value)))
    box.append(rowEl)
  }
  return box
}

// ---------------------------------------------------------------- §8 Tags view

function renderTags() {
  railEl.replaceChildren()
  const { explicit, auto } = tagCounts(artifacts)
  const wrap = el('div', 'sheet')
  wrap.append(el('h1', null, 'Tags'))
  // D7: explicit tags are filled, auto tags outlined — visually distinct, never mixed.
  wrap.append(el('p', 'description', 'Explicit tags come from frontmatter. Auto tags are derived, and outlined rather than filled.'))

  const section = (title, entries, cls) => {
    wrap.append(el('h2', 'section', `${title} (${entries.length})`))
    if (!entries.length) {
      wrap.append(el('p', 'rail-empty', 'None.'))
      return
    }
    const box = el('div', 'tags')
    for (const { tag, count } of entries) {
      const chip = el('a', `chip ${cls}`, `${tag} ${count}`)
      chip.href = `#/?q=${encodeURIComponent(`tag:${tag}`)}`
      box.append(chip)
    }
    wrap.append(box)
  }
  section('Explicit', explicit, 'chip-filled')
  section('Auto', auto, 'chip-outline')

  detailEl.replaceChildren(wrap)
}

// ---------------------------------------------------------------- §8 Duplicates view

async function renderDuplicates() {
  railEl.replaceChildren()
  const { clusters } = await (await fetch('/api/clusters')).json()
  const wrap = el('div', 'sheet')
  wrap.append(el('h1', null, `Duplicates (${clusters.length})`))

  if (!clusters.length) {
    wrap.append(el('p', 'empty', inWorkspace()
      // §5 answers about the corpus it was given, and in workspace mode that is not the machine.
      // Saying "clean" without that qualifier would be the false-confidence 0015 forbids.
      ? 'No duplicates among this workspace\'s sources. Copies elsewhere on the machine are not indexed.'
      : 'No duplicates. Your library is clean.'))
    detailEl.replaceChildren(wrap)
    return
  }
  if (inWorkspace()) wrap.append(el('p', 'description', workspaceNote('Clusters are resolved')))

  wrap.append(el('p', 'description', 'Diverged clusters first. Shadowing means one source reaches several copies; cross-repo means unrelated sources hold the same name.'))

  for (const c of clusters) {
    const card = el('div', 'cluster')
    const head = el('div', 'meta-row')
    const title = el('a', 'cluster-name', c.name)
    title.href = `#/a/${encodeURIComponent(c.copies[0].id)}`
    head.append(title)
    head.append(el('span', 'pill pill-quiet', c.type))
    head.append(c.drift === 'diverged'
      ? el('span', 'chip chip-warn', 'diverged')
      : el('span', 'chip chip-outline', 'identical'))
    head.append(el('span', 'chip chip-outline', c.situation === 'shadowing' ? 'shadowing' : 'cross-repo'))
    if (c.tie) head.append(el('span', 'chip chip-warn', 'tie — set priorities'))
    card.append(head)

    const copies = el('div', 'kv')
    for (const copy of c.copies) {
      const rowEl = el('div', 'kv-row')
      const link = el('a', null, `${copy.source}${copy.version ? ` @${copy.version}` : ''}`)
      link.href = `#/a/${encodeURIComponent(copy.id)}`
      rowEl.append(link)
      // §8: per-copy effective star.
      if (copy.effective) rowEl.append(el('span', 'chip chip-pass', '⭐ effective'))
      if (copy.installed) rowEl.append(el('span', 'chip chip-pass', 'installed'))
      rowEl.append(el('span', 'res-path', copy.path))
      copies.append(rowEl)
    }
    card.append(copies)

    if (c.copies.length > 1) {
      const diff = el('button', 'link-button', 'Diff first two')
      diff.onclick = () => go('diff', c.copies[0].id, { b: c.copies[1].id })
      card.append(diff)
    }
    wrap.append(card)
  }

  detailEl.replaceChildren(wrap)
  detailEl.scrollTop = 0
}

// ---------------------------------------------------------------- artifact page

async function openArtifact(id) {
  const artifact = byId.get(id)
  if (!artifact) return renderDashboard()

  for (const b of listEl.querySelectorAll('.row')) {
    b.toggleAttribute('aria-current', b.dataset.id === id)
  }
  const active = listEl.querySelector(`[data-id="${cssEscape(id)}"]`)
  active?.scrollIntoView({ block: 'nearest' })

  const full = await (await fetch(`/api/artifacts/${encodeURIComponent(id)}`)).json()
  detailEl.replaceChildren(sheet(full))
  railEl.replaceChildren(rail(full))
  detailEl.scrollTop = 0
}

function verdictChip(validation) {
  if (!validation) return null
  const tone = { PASS: 'chip-pass', WARN: 'chip-warn', FAIL: 'chip-fail' }[validation.verdict]
  const label = validation.manualPending ? `${validation.verdict} · manual pending` : validation.verdict
  return el('span', `chip ${tone}`, label)
}

function sheet(a) {
  const wrap = el('div', 'sheet')
  const title = el('div', 'title-row')
  title.append(el('h1', null, a.name))
  const chip = verdictChip(a.validation)
  if (chip) title.append(chip)
  // 0017 FR-007: this artifact is indexed and fully readable — it is simply in a folder the
  // current scope hides, which is why it was not in the list. Opening it changes nothing
  // about the scope (FR-008).
  if (outsideScope(a)) title.append(el('span', 'chip chip-outline', 'outside scope'))
  wrap.append(title)

  const meta = el('div', 'meta-row')
  meta.append(el('span', 'pill', a.source))
  meta.append(el('span', 'pill pill-quiet', a.type))
  if (a.plugin) {
    meta.append(el('span', 'pill pill-quiet',
      a.plugin.version ? `plugin ${a.plugin.plugin}@${a.plugin.version}` : `plugin ${a.plugin.plugin}`))
  }
  wrap.append(meta)
  wrap.append(resolutionBar(a))

  if (a.parseError) {
    wrap.append(el('p', 'banner', `Frontmatter did not parse: ${a.parseError}. Body shown raw.`))
  } else if (a.beyondSubset) {
    // 0015: the file is well-formed; the limit is this parser's. Say so in those terms.
    wrap.append(el('p', 'banner', `Frontmatter is valid but goes beyond the supported YAML subset: ${a.beyondSubset}. Those values are kept as raw text.`))
  }
  if (a.description) wrap.append(el('p', 'description', a.description))

  const tags = el('div', 'tags')
  for (const t of a.tags ?? []) tags.append(tagChip(t, 'chip-filled'))
  for (const t of (a.autoTags ?? []).filter((t) => t !== a.source && t !== a.type)) {
    tags.append(tagChip(t, 'chip-outline'))
  }
  for (const alias of a.aliases ?? []) tags.append(el('span', 'chip chip-outline', `alias ${alias}`))
  if (tags.children.length) wrap.append(tags)

  if (a.parseError) {
    wrap.append(el('pre', null, a.body ?? ''))
  } else {
    const prose = el('div', 'prose')
    prose.innerHTML = a.html ?? ''
    wrap.append(prose)
  }
  return wrap
}

function tagChip(tag, cls) {
  const chip = el('a', `chip ${cls}`, tag)
  chip.href = `#/?q=${encodeURIComponent(`tag:${tag}`)}`
  return chip
}

/** §9 signature element. */
function resolutionBar(a) {
  const bar = el('div', 'resolution')
  bar.append(el('span', 'pill', a.source))
  bar.append(el('span', 'res-path', a.path))

  const c = a.cluster
  if (!c) {
    // 0023: the single most misreadable chip in workspace mode. "Only copy" is true of the
    // corpus that was indexed, and in a workspace that corpus is a few folders — so the chip
    // says which claim it is making rather than letting the reader assume the machine.
    const only = el('span', 'chip chip-pass', inWorkspace() ? '⭐ only copy in workspace' : '⭐ only copy')
    if (inWorkspace()) only.title = workspaceNote('Uniqueness is judged')
    bar.append(only)
    return bar
  }

  bar.append(el('span', 'res-pos', `copy ${c.position} of ${c.copies}`))
  bar.append(a.effective
    ? el('span', 'chip chip-pass', '⭐ effective')
    : el('span', 'chip chip-warn', `shadowed by ${a.shadowedBy?.source ?? '—'}`))
  bar.append(c.drift === 'identical'
    ? el('span', 'chip chip-outline', 'identical')
    : el('span', 'chip chip-warn', 'diverged'))
  if (c.situation === 'shadowing') bar.append(el('span', 'chip chip-outline', 'shadowing'))
  if (c.tie) bar.append(el('span', 'chip chip-warn', 'tie — set priorities'))
  if (a.installed) bar.append(el('span', 'chip chip-pass', 'installed'))
  if (c.installedDisagrees && !a.installed) {
    bar.append(el('span', 'chip chip-fail', 'a different copy is installed'))
  }

  const diff = el('button', 'link-button', 'Diff')
  diff.onclick = () => diffFromCluster(c.key, a.id)
  bar.append(diff)
  return bar
}

async function diffFromCluster(clusterKey, fromId) {
  const { clusters } = await (await fetch('/api/clusters')).json()
  const cluster = clusters.find((c) => c.key === clusterKey)
  const other = cluster?.copies.find((c) => c.id !== fromId)
  if (other) go('diff', fromId, { b: other.id })
}

// ---------------------------------------------------------------- §8 Diff view

async function renderDiff(aId, bId) {
  railEl.replaceChildren()
  if (!aId || !bId) return renderDashboard()
  const d = await (await fetch(`/api/diff?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`)).json()

  const wrap = el('div', 'sheet')
  wrap.append(el('h1', null, `${byId.get(aId)?.name ?? 'diff'} — diff`))

  const heads = el('div', 'meta-row')
  heads.append(el('span', 'pill', d.a.source))
  heads.append(el('span', 'res-path', '→'))
  heads.append(el('span', 'pill', d.b.source))
  wrap.append(heads)

  if (d.identical) {
    wrap.append(el('p', 'empty', 'Copies are identical.'))
    detailEl.replaceChildren(wrap)
    return
  }

  const table = el('div', 'diff')
  const summary = el('div', 'meta-row')
  summary.append(el('span', 'chip chip-warn', `${d.changedLines} differing lines`))
  summary.append(el('span', 'chip chip-outline', `+${d.added} −${d.removed}`))
  const jump = el('button', 'link-button', 'Jump to next change')
  jump.onclick = () => jumpToChange(table)
  summary.append(jump)
  wrap.append(summary)

  for (const r of d.rows) {
    const line = el('div', `diff-row diff-${r.kind}`)
    line.append(el('span', 'diff-num', r.a ?? ''))
    line.append(el('span', 'diff-num', r.b ?? ''))
    line.append(el('span', 'diff-text', r.kind === 'gap' ? `⋯ ${r.text}` : r.text))
    table.append(line)
  }
  wrap.append(table)
  detailEl.replaceChildren(wrap)
  detailEl.scrollTop = 0
}

function jumpToChange(table) {
  const changes = [...table.querySelectorAll('.diff-add, .diff-remove')]
  if (!changes.length) return
  jumpToChange.at = ((jumpToChange.at ?? -1) + 1) % changes.length
  changes[jumpToChange.at].scrollIntoView({ block: 'center' })
}

// ---------------------------------------------------------------- right rail

function rail(a) {
  const frag = document.createDocumentFragment()

  frag.append(el('h2', null, `Referenced by (${a.backlinks?.length ?? 0})`))
  frag.append(a.backlinks?.length ? linkList(a.backlinks) : el('p', 'rail-empty', 'Nothing links here — orphan.'))

  const outCount = a.outlinks?.length ?? 0
  frag.append(el('h2', null, `Links out (${outCount})`))
  if (!outCount) {
    frag.append(el('p', 'rail-empty', 'No resolved references.'))
  } else {
    const ul = document.createElement('ul')
    for (const link of a.outlinks) {
      const li = document.createElement('li')
      const anchor = el('a', null, link.token)
      anchor.href = `#/a/${encodeURIComponent(link.primary)}`
      li.append(anchor)
      if (link.ambiguousType) li.append(el('span', 'chip chip-warn', 'ambiguous'))
      else if (link.targets.length > 1) li.append(el('span', 'rail-token', ` ${link.targets.length} copies`))
      ul.append(li)
    }
    frag.append(ul)
  }

  const v = a.validation
  if (v) {
    frag.append(el('h2', null, 'Validation'))
    const ul = document.createElement('ul')
    for (const c of v.checks) {
      const li = el('li', 'check')
      li.append(c.score === null ? el('span', 'chip chip-outline', 'N-A')
        : c.score === 2 ? el('span', 'chip chip-pass', '2')
          : c.score === 1 ? el('span', 'chip chip-warn', '1')
            : el('span', 'chip chip-fail', '0'))
      // The structural pre-check has no validator number, so it must not read
      // "structural Structural".
      const label = c.id === 'structural' ? c.title : `${c.id} ${c.title}`
      li.append(el('span', c.mode === 'manual' ? 'check-manual' : 'check-title', ` ${label}`))
      if (c.note) li.append(el('div', 'check-note', c.note))
      ul.append(li)
    }
    frag.append(ul)

    const copy = el('button', 'link-button', 'Copy validation prompt')
    copy.onclick = async () => {
      const text = await (await fetch(`/api/prompt?id=${encodeURIComponent(a.id)}`)).text()
      try {
        await navigator.clipboard.writeText(text)
        toast('Validation prompt copied')
      } catch {
        toast('Clipboard blocked — prompt opened in a new tab')
        const blob = new Blob([text], { type: 'text/plain' })
        window.open(URL.createObjectURL(blob), '_blank')
      }
    }
    frag.append(copy)
  }

  // D11: read-only. Handing off to an editor is the only write path, and the server
  // restricts it to paths inside a registered source.
  frag.append(el('h2', null, 'Open'))
  const openBtn = el('button', 'link-button', 'Open in editor (e)')
  openBtn.onclick = () => openInEditor(a.id)
  frag.append(openBtn)

  frag.append(el('h2', null, `Duplicates (${a.cluster ? a.cluster.copies - 1 : 0})`))
  if (!a.cluster) {
    frag.append(el('p', 'rail-empty', 'No other copy.'))
  } else {
    frag.append(el('p', 'rail-empty', `${a.cluster.situation === 'shadowing' ? 'Shadowing' : 'Cross-repo'}, ${a.cluster.drift}`))
    const open = el('button', 'link-button', 'Open diff')
    open.onclick = () => diffFromCluster(a.cluster.key, a.id)
    frag.append(open)
  }

  const renames = (a.unresolved ?? []).filter((u) => u.likelyRename)
  frag.append(el('h2', null, `Unresolved (${a.unresolved?.length ?? 0})`))
  if (!a.unresolved?.length) {
    frag.append(el('p', 'rail-empty', 'None.'))
  } else {
    if (renames.length) {
      const ul = document.createElement('ul')
      for (const u of renames) {
        const li = el('li', 'rail-token', `${u.token} → `)
        li.append(el('span', 'chip chip-warn', `maybe ${u.likelyRename}`))
        ul.append(li)
      }
      frag.append(ul)
    }
    const rest = (a.unresolved ?? []).filter((u) => !u.likelyRename)
    if (rest.length) {
      const details = document.createElement('details')
      details.append(el('summary', 'rail-empty', `${rest.length} with no near match`))
      const ul = document.createElement('ul')
      for (const u of rest) ul.append(el('li', 'rail-token', u.token))
      details.append(ul)
      frag.append(details)
    }
  }
  return frag
}

function linkList(items) {
  const ul = document.createElement('ul')
  for (const item of items) {
    const li = document.createElement('li')
    const anchor = el('a', null, item.name ?? item.id)
    anchor.href = `#/a/${encodeURIComponent(item.id)}`
    li.append(anchor)
    if (item.source) li.append(el('span', 'rail-token', ` ${item.source}`))
    ul.append(li)
  }
  return ul
}

// ---------------------------------------------------------------- ⌘K palette + keyboard map

function installKeyboard() {
  const palette = $('palette')
  const input = $('palette-input')
  const results = $('palette-results')
  let picks = []
  let at = 0

  const close = () => { palette.hidden = true; input.value = '' }
  const open = () => {
    palette.hidden = false
    input.value = ''
    render('')
    input.focus()
  }
  $('palette-open').onclick = open

  function render(q) {
    // Commands first so Rescan and theme are reachable, then artifacts (§8).
    const commands = [
      { label: 'Go to dashboard', run: () => go('') },
      { label: 'Go to duplicates', run: () => go('duplicates') },
      { label: 'Go to tags', run: () => go('tags') },
      { label: 'Toggle theme', run: toggleTheme },
      { label: 'Rescan', run: rescan },
    ].filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))

    const hits = q ? search(artifacts, q).slice(0, 40) : artifacts.slice(0, 40)
    picks = [...commands, ...hits.map((a) => ({ label: a.name, hint: a.source, run: () => go('a', a.id) }))]
    at = 0

    results.replaceChildren()
    picks.forEach((p, i) => {
      const item = el('div', `palette-item${i === 0 ? ' active' : ''}`)
      item.append(el('span', null, p.label))
      if (p.hint) item.append(el('span', 'rail-token', p.hint))
      item.onclick = () => { p.run(); close() }
      results.append(item)
    })
  }

  input.addEventListener('input', () => render(input.value))
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close()
    if (e.key === 'Enter') { picks[at]?.run(); return close() }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = [...results.children]
      items[at]?.classList.remove('active')
      at = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[at]?.classList.add('active')
      items[at]?.scrollIntoView({ block: 'nearest' })
    }
  })
  palette.addEventListener('click', (e) => { if (e.target === palette) close() })

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      return palette.hidden ? open() : close()
    }
    if (!palette.hidden) return
    const typing = document.activeElement === searchEl
    if (e.key === '/' && !typing) { e.preventDefault(); return searchEl.focus() }
    if (typing && e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return

    // §8 keyboard map: ↑/↓ list, enter open, d diff, e open in editor (M6).
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      moveCursor(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      const target = visible[cursor]
      if (target) go('a', target.id, currentQueryParams())
    } else if (e.key === 'd') {
      const { view, arg } = currentRoute()
      const a = view === 'a' ? byId.get(arg) : visible[cursor]
      if (a?.cluster) diffFromCluster(a.cluster.key, a.id)
      else toast('No other copy to diff')
    } else if (e.key === 'e') {
      const { view, arg } = currentRoute()
      const a = view === 'a' ? byId.get(arg) : visible[cursor]
      if (a) openInEditor(a.id)
    }
  })
}

function moveCursor(delta) {
  if (!visible.length) return
  cursor = Math.max(0, Math.min(visible.length - 1, cursor + delta))
  const target = visible[cursor]
  const button = listEl.querySelector(`[data-id="${cssEscape(target.id)}"]`)
  for (const b of listEl.querySelectorAll('.row')) b.classList.remove('cursor')
  button?.classList.add('cursor')
  button?.scrollIntoView({ block: 'nearest' })
}

/**
 * §9: light/dark follow the OS with a manual toggle. Three states, not two — cycling back
 * to "system" is the only way to undo a manual choice.
 */
function toggleTheme() {
  const root = document.documentElement
  const order = ['system', 'light', 'dark']
  const current = root.dataset.theme || 'system'
  const next = order[(order.indexOf(current) + 1) % order.length]
  applyTheme(next)
  toast(`Theme: ${next}`)
}

function applyTheme(mode) {
  const root = document.documentElement
  if (mode === 'system') {
    delete root.dataset.theme
    localStorage.removeItem('dotclaude-theme')
  } else {
    root.dataset.theme = mode
    localStorage.setItem('dotclaude-theme', mode)
  }
  const label = { system: '◐', light: '☀', dark: '☾' }[mode] ?? '◐'
  const button = $('theme')
  if (button) {
    button.textContent = label
    button.title = `Theme: ${mode}${mode === 'system' ? ' (follows the OS)' : ''}`
  }
}

applyTheme(localStorage.getItem('dotclaude-theme') ?? 'system')
$('theme').onclick = toggleTheme

// ---------------------------------------------------------------- helpers

function renderSourceErrors() {
  const failing = stats.sources.filter((s) => s.error)
  if (!failing.length && !stats.configError) return
  const bar = el('div', 'source-errors')
  if (stats.configError) bar.append(el('span', 'chip chip-fail', stats.configError))
  for (const s of failing) bar.append(el('span', 'chip chip-fail', `${s.name}: ${s.error}`))
  document.querySelector('header').after(bar)
}

let toastTimer
function toast(message) {
  const node = $('toast')
  node.textContent = message
  node.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { node.hidden = true }, 2600)
}

function cssEscape(value) {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

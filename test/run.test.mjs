// Plain node:test — §10 allows zero dependencies, so no framework.
//   npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { parseFrontmatter } from '../src/frontmatter.js'
import { renderMarkdown, escapeHtml } from '../src/markdown.js'
import { extractTokens, isCandidate, buildGraph } from '../src/linker.js'
import { classify } from '../src/classify.js'
import { scan } from '../src/scan.js'
import { resolveClusters, contentHash, normalizeForHash } from '../src/resolver.js'
import { unifiedDiff, collapseContext } from '../src/diff.js'
import { validateArtifact, buildValidationIndex, classOf } from '../src/validators.js'
import { buildValidationPrompt, VERDICT_CONTRACT } from '../src/prompt.js'
import { search, parseQuery, tagCounts } from '../src/search.js'
import { isInsideRegisteredSource } from '../src/paths.js'
import { isRelevant } from '../src/watcher.js'
import { runValidate, main, validateCommand } from '../src/cli.js'
import {
  activeFromQuery, isActive, isScoped, knownOnly, serializeStored, parseStored, resolveActive,
  isOutsideScope,
} from '../src/scope.js'
// 0023 workspace mode. `buildIndex` is imported for the FIRST time here: every other test avoids
// it because a corpus scan is slow and drifts, and these tests only ever build a mkdtemp corpus.
import {
  resolveMode, setMode, loadSources, loadWorkspace, expandHome, LIBRARY_MODE,
} from '../src/config.js'
import { buildIndex, stats, allArtifacts, watchedRoots } from '../src/indexer.js'
import { snapshotPath } from '../src/snapshot.js'

// ---------------------------------------------------------------- §3 frontmatter

test('frontmatter: the shapes the real corpus contains', () => {
  assert.equal(parseFrontmatter('---\nname: foo\n---\nbody').data.name, 'foo')
  assert.equal(parseFrontmatter('---\nname: "foo bar"\n---\n').data.name, 'foo bar')
  assert.equal(parseFrontmatter('---\nd: >-\n  one two\n  three\n---\n').data.d, 'one two three')
  assert.equal(parseFrontmatter('---\nd: >\n  a\n  b\n---\n').data.d, 'a b')
  assert.equal(parseFrontmatter('---\nd: |\n  l1\n  l2\n---\n').data.d, 'l1\nl2')
  assert.deepEqual(parseFrontmatter('---\ntags: [a, "b", c]\n---\n').data.tags, ['a', 'b', 'c'])
  assert.deepEqual(parseFrontmatter('---\nt:\n  - Read\n  - Write\n---\n').data.t, ['Read', 'Write'])
  assert.equal(parseFrontmatter('---\nu: true\n---\n').data.u, true)
  assert.equal(parseFrontmatter('---\nc: 2026-01-01 # note\n---\n').data.c, '2026-01-01')
  assert.equal(parseFrontmatter('---\nt: {{title}}\n---\n').data.t, '{{title}}')
})

test('frontmatter: version numbers stay strings (3.10 must not become 3.1)', () => {
  assert.equal(parseFrontmatter('---\nversion: 3.10\n---\n').data.version, '3.10')
})

test('frontmatter: quoted scalar opening on the next line is folded, not treated as a map', () => {
  const { data, error } = parseFrontmatter('---\nd:\n  "one\n  two"\nname: x\n---\n')
  assert.equal(data.d, 'one two')
  assert.equal(data.name, 'x')
  assert.equal(error, null)
})

// 0015: the shape spec-kit ships to every one of its agent integrations. Ten artifacts in
// this repo's own corpus carry it, and before 0015 all ten read as parse errors.
const SPECKIT_BLOCK =
  '---\nname: "speckit-analyze"\ndescription: "Analyse."\nmetadata:\n  author: "github-spec-kit"\n  source: "templates/commands/analyze.md"\nuser-invocable: true\n---\nbody\n'

test('frontmatter: one level of nested mapping is a map, not raw text (0015)', () => {
  const { data, error, beyondSubset } = parseFrontmatter(SPECKIT_BLOCK)
  assert.deepEqual(data.metadata, {
    author: 'github-spec-kit',
    source: 'templates/commands/analyze.md',
  })
  assert.equal(error, null, 'well-formed YAML must not report a parse error')
  assert.equal(beyondSubset, null, 'one level is inside the supported subset')
})

test('frontmatter: a nested map does not swallow the keys that follow it (0015)', () => {
  const { data } = parseFrontmatter(SPECKIT_BLOCK)
  assert.equal(data.name, 'speckit-analyze', 'the key before the nested map still parses')
  assert.equal(data.description, 'Analyse.')
  assert.equal(data['user-invocable'], true, 'the key after the nested map still parses')
})

test('frontmatter: nested values follow the same scalar rules as top-level ones (0015)', () => {
  const { data, error } = parseFrontmatter(
    '---\nmeta:\n  version: 3.10\n  flag: true\n  tags: [a, "b"]\n  quoted: "x y"\n  plain: hello # note\n---\n',
  )
  assert.equal(data.meta.version, '3.10', 'numbers stay strings at depth 1 too (§3)')
  assert.equal(data.meta.flag, true)
  assert.deepEqual(data.meta.tags, ['a', 'b'])
  assert.equal(data.meta.quoted, 'x y')
  assert.equal(data.meta.plain, 'hello')
  assert.equal(error, null)
})

test('frontmatter: two levels degrade to raw text without an error (0015)', () => {
  const two = '---\na:\n  b:\n    c: deep\nname: x\n---\nbody\n'
  assert.doesNotThrow(() => parseFrontmatter(two))
  const { data, error, beyondSubset } = parseFrontmatter(two)
  assert.equal(error, null, 'valid YAML past the subset is not a parse error')
  assert.match(beyondSubset, /beyond one level|deeper than one level/)
  assert.match(beyondSubset, /"b"/, 'the note names the key that opened the deeper block')
  assert.match(String(data.a.b), /c: deep/, 'the deeper text is kept, not dropped')
  assert.equal(data.name, 'x', 'and the keys after it still parse')
})

test('frontmatter: mixing a dash list and keys at one indent is malformed, not beyond subset (0015)', () => {
  const { error, beyondSubset } = parseFrontmatter('---\na:\n  - one\n  key: two\n---\n')
  assert.ok(error, 'this is not valid YAML either, so it stays a parse error')
  assert.equal(beyondSubset, null)
})

test('frontmatter: the real speckit skills on disk parse their metadata (0015)', async () => {
  // Every other frontmatter test uses a literal. This one reads the corpus, which is what
  // 0015 was written about: a shape nobody had in a fixture arrived from upstream.
  const dir = new URL('../.claude/skills/', import.meta.url)
  const names = (await fs.readdir(dir)).filter((n) => n.startsWith('speckit-'))
  assert.ok(names.length >= 10, `expected the 10 speckit skills, found ${names.length}`)
  for (const name of names) {
    const raw = await fs.readFile(new URL(`${name}/SKILL.md`, dir), 'utf8')
    const { data, error } = parseFrontmatter(raw)
    assert.equal(error, null, `${name} must not be a parse error`)
    assert.equal(data.metadata?.author, 'github-spec-kit', `${name} must expose metadata.author`)
    assert.ok(data.metadata?.source, `${name} must expose metadata.source`)
  }
})

test('frontmatter: §3 never drops or crashes', () => {
  const unterminated = parseFrontmatter('---\nname: foo\nno close here')
  assert.ok(unterminated.error)
  assert.ok(unterminated.body.includes('no close here'))
  assert.equal(parseFrontmatter('# plain markdown').error, null)
  // The NUL is built rather than written literally. A literal \x00 in this file made `grep`
  // classify the whole suite as binary and silently skip it — which is how a §10 guard
  // (`grep -rn specify src/ test/ public/`) read 0 for months without ever searching here.
  const NUL = String.fromCharCode(0)
  for (const junk of ['---\n', '---\n---\n', '---\n:::\n---\n', '', '-', `---\n${NUL}\n---\n`]) {
    assert.doesNotThrow(() => parseFrontmatter(junk))
  }
})

// ---------------------------------------------------------------- §3 classification

test('classify: all six rows, first match wins', () => {
  assert.deepEqual(classify('/r/x/SKILL.md', 'x/SKILL.md', false), { type: 'skill', name: 'x' })
  assert.deepEqual(classify('/r/.claude/agents/a.md', '.claude/agents/a.md', false), { type: 'agent', name: 'a' })
  assert.equal(classify('/r/agents/a.md', 'agents/a.md', true).type, 'agent')
  assert.equal(classify('/r/.claude/commands/a/b.md', '.claude/commands/a/b.md', false).name, '/a:b')
  assert.equal(classify('/r/.cursor/commands/c.md', '.cursor/commands/c.md', false).name, '/c')
  assert.equal(classify('/r/.claude/rules/r.md', '.claude/rules/r.md', false).type, 'rule')
  assert.equal(classify('/r/.cursor/rules/r.mdc', '.cursor/rules/r.mdc', false).name, 'r')
  assert.deepEqual(classify('/r/proj/CLAUDE.md', 'proj/CLAUDE.md', false), { type: 'memory', name: 'proj/CLAUDE.md' })
  assert.equal(classify('/r/README.md', 'README.md', false), null)
})

// ---------------------------------------------------------------- §3 scanner

test('scan: symlink loop terminates and symlinked files are indexed', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dotclaude-scan-'))
  await fs.mkdir(path.join(tmp, 'a/b'), { recursive: true })
  await fs.writeFile(path.join(tmp, 'a/b/SKILL.md'), 'x')
  await fs.writeFile(path.join(tmp, 'real.md'), 'y')
  await fs.symlink(tmp, path.join(tmp, 'a/b/loop'), 'dir')
  await fs.symlink(path.join(tmp, 'real.md'), path.join(tmp, 'AGENTS.md'))

  const { files } = await scan(tmp)
  assert.ok(files.some((f) => f.endsWith('a/b/SKILL.md')))
  assert.ok(files.some((f) => f.endsWith('AGENTS.md')), 'symlinked file must be indexed')
  await fs.rm(tmp, { recursive: true, force: true })
})

test('scan: the ignore list is applied', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dotclaude-ignore-'))
  await fs.mkdir(path.join(tmp, 'node_modules/pkg'), { recursive: true })
  await fs.writeFile(path.join(tmp, 'node_modules/pkg/SKILL.md'), 'x')
  await fs.writeFile(path.join(tmp, 'SKILL.md'), 'y')
  const { files } = await scan(tmp)
  assert.equal(files.length, 1)
  await fs.rm(tmp, { recursive: true, force: true })
})

// ---------------------------------------------------------------- §4 linker, D4/D5

test('linker: D4 matches backticked tokens only, and skips fenced code', () => {
  const tokens = extractTokens({
    description: 'see `alpha-one`',
    body: 'plain beta-two is not a link\n```bash\nrun `gamma-three`\n```\nand `delta-four`',
  })
  assert.ok(tokens.includes('alpha-one'))
  assert.ok(tokens.includes('delta-four'))
  assert.ok(!tokens.includes('beta-two'), 'unformatted mentions must not link (D4)')
  assert.ok(!tokens.includes('gamma-three'), 'fenced code must not link')
})

test('linker: a single-word name still resolves — the filter is for unresolved only', () => {
  const g = buildGraph([
    { id: 'r1', name: 'reader', type: 'skill', source: 'a', priority: 1, description: 'see `access`', body: '', aliases: [] },
    { id: 'r2', name: 'access', type: 'skill', source: 'a', priority: 1, description: '', body: '', aliases: [] },
  ])
  assert.deepEqual(g[0].outlinks[0].targets, ['r2'], '`access` is a real skill and must link')
})

test('linker: unresolved list reports only artifact-shaped tokens', () => {
  for (const good of ['ios-visual-acceptance', '/validate', 'plugin:skill-name']) {
    assert.ok(isCandidate(good), good)
  }
  for (const bad of ['npm', 'Foo', 'a b', 'UPPER-CASE', '--flag']) {
    assert.ok(!isCandidate(bad), bad)
  }
  const g = buildGraph([
    { id: 'u1', name: 'alpha-one', type: 'skill', source: 'a', priority: 1, description: 'run `npm install` then `beta-two`', body: '', aliases: [] },
  ])
  assert.deepEqual(g[0].unresolved.map((u) => u.token), ['beta-two'], 'code is not an unresolved reference')
})

const fixture = () => [
  { id: 's1', name: 'alpha', type: 'skill', source: 'a', priority: 100, description: 'uses `beta`', body: '', aliases: [] },
  { id: 's2', name: 'beta', type: 'skill', source: 'a', priority: 100, description: 'uses `alpha`', body: '', aliases: [] },
  { id: 's3', name: 'beta', type: 'skill', source: 'b', priority: 50, description: '', body: '', aliases: [] },
  { id: 'a1', name: 'gamma', type: 'agent', source: 'a', priority: 100, description: '', body: '', aliases: [] },
  { id: 'k1', name: 'gamma', type: 'skill', source: 'a', priority: 100, description: '', body: '', aliases: [] },
  { id: 'c1', name: '/run', type: 'command', source: 'a', priority: 100, description: '', body: '', aliases: [] },
  { id: 'd1', name: 'delta-one', type: 'skill', source: 'a', priority: 100, description: '', body: '', aliases: [] },
  { id: 'z1', name: 'zeta', type: 'skill', source: 'a', priority: 100, description: 'see `gamma` and `/run` and `delta-onee`', body: '', aliases: [] },
]

test('linker: §4 backlinks invert, and orphans are artifacts with none', () => {
  const g = buildGraph(fixture())
  const byId = Object.fromEntries(g.map((a) => [a.id, a]))
  assert.deepEqual(byId.s1.outlinks[0].targets.sort(), ['s2', 's3'], 'both copies of a name are targets')
  assert.ok(byId.s2.backlinks.includes('s1'))
  assert.ok(byId.s3.backlinks.includes('s1'), 'the lower-priority copy is still referenced')
  assert.equal(byId.s1.outlinks[0].primary, 's2', 'highest priority is primary')
  assert.ok(byId.z1.orphan, 'nothing links to zeta')
  assert.ok(!byId.s2.orphan)
})

test('linker: D5 resolution order and ambiguity', () => {
  const g = buildGraph(fixture())
  const zeta = g.find((a) => a.id === 'z1')
  const gamma = zeta.outlinks.find((l) => l.token === 'gamma')
  assert.ok(gamma.ambiguousType, 'skill + agent with one name is flagged, never guessed')
  assert.equal(gamma.primary, 'k1', 'skill before agent')
  const run = zeta.outlinks.find((l) => l.token === '/run')
  assert.deepEqual(run.targets, ['c1'], '/token resolves to commands only')
})

test('linker: self-links are excluded but other copies of the same name are not', () => {
  const g = buildGraph([
    { id: 'x1', name: 'dup', type: 'skill', source: 'a', priority: 100, description: 'about `dup`', body: '', aliases: [] },
    { id: 'x2', name: 'dup', type: 'skill', source: 'b', priority: 50, description: '', body: '', aliases: [] },
  ])
  const first = g.find((a) => a.id === 'x1')
  assert.deepEqual(first.outlinks[0].targets, ['x2'])
  assert.ok(!first.backlinks.includes('x1'))
})

test('linker: 0011 flags likely renames, leaves unrelated tokens unflagged', () => {
  const g = buildGraph(fixture())
  const zeta = g.find((a) => a.id === 'z1')
  const near = zeta.unresolved.find((u) => u.token === 'delta-onee')
  assert.equal(near.likelyRename, 'delta-one', 'one character off is a rename candidate')

  const g2 = buildGraph([
    { id: 'q1', name: 'alpha', type: 'skill', source: 'a', priority: 1, description: 'see `web-app`', body: '', aliases: [] },
  ])
  assert.equal(g2[0].unresolved[0].likelyRename, null, 'a service name is not a rename')
})

// ---------------------------------------------------------------- §5 resolver, D8, 0012

const copy = (over) => ({
  id: over.id, name: over.name ?? 'dup', type: 'skill', source: over.source ?? 'a',
  priority: over.priority ?? 100, path: over.path ?? over.id, absPath: `/${over.id}`,
  modified: over.modified ?? '2026-01-01T00:00:00.000Z', body: over.body ?? 'same',
  installed: over.installed ?? false, plugin: over.plugin ?? null,
  hash: contentHash(over.body ?? 'same'),
})

test('resolver: a lone artifact is effective with no cluster', () => {
  const { artifacts, clusters } = resolveClusters([copy({ id: 'x' })])
  assert.equal(artifacts[0].effective, true)
  assert.equal(artifacts[0].cluster, null)
  assert.equal(clusters.length, 0)
})

test('resolver: §5 winner is highest priority, and the loser says who shadows it', () => {
  const { artifacts } = resolveClusters([
    copy({ id: 'lo', source: 'personal', priority: 50 }),
    copy({ id: 'hi', source: 'project', priority: 100 }),
  ])
  const byId = Object.fromEntries(artifacts.map((a) => [a.id, a]))
  assert.equal(byId.hi.effective, true)
  assert.equal(byId.lo.effective, false)
  assert.equal(byId.lo.shadowedBy.source, 'project')
})

test('resolver: §5 names the two situations distinctly', () => {
  const cross = resolveClusters([copy({ id: '1', source: 'a' }), copy({ id: '2', source: 'b' })])
  assert.equal(cross.clusters[0].situation, 'cross-repo-duplicate')
  const shadow = resolveClusters([
    copy({ id: '1', source: 'a', path: 'p1' }),
    copy({ id: '2', source: 'a', path: 'p2' }),
  ])
  assert.equal(shadow.clusters[0].situation, 'shadowing')
})

test('resolver: drift is identical vs diverged by content hash', () => {
  const same = resolveClusters([copy({ id: '1', source: 'a' }), copy({ id: '2', source: 'b' })])
  assert.equal(same.clusters[0].drift, 'identical')
  const diff = resolveClusters([
    copy({ id: '1', source: 'a', body: 'one' }),
    copy({ id: '2', source: 'b', body: 'two' }),
  ])
  assert.equal(diff.clusters[0].drift, 'diverged')
})

test('resolver: trailing whitespace does not count as drift (hash agrees with the diff)', () => {
  const { clusters } = resolveClusters([
    copy({ id: '1', source: 'a', body: 'line  \nnext\n' }),
    copy({ id: '2', source: 'b', body: 'line\nnext' }),
  ])
  assert.equal(clusters[0].drift, 'identical')
})

test('resolver: equal priorities are flagged "tie" even when a fallback resolved them', () => {
  const { clusters } = resolveClusters([
    copy({ id: '1', source: 'a', priority: 100, path: 'b' }),
    copy({ id: '2', source: 'a', priority: 100, path: 'a' }),
  ])
  assert.equal(clusters[0].tie, true)
  assert.equal(clusters[0].copies[0].id, '2', 'path breaks the tie deterministically')
})

test('resolver: 0012 puts the installed plugin copy ahead of a stale cached version', () => {
  // The M0/M1 defect: 3.1.8 was shown while ios ran 3.3.0.
  const { artifacts } = resolveClusters([
    copy({ id: 'old', source: 'personal', priority: 50, plugin: { plugin: 'ios', version: '3.1.8' }, path: 'a' }),
    copy({ id: 'new', source: 'personal', priority: 50, plugin: { plugin: 'ios', version: '3.3.0' }, installed: true, path: 'b' }),
  ])
  assert.equal(artifacts.find((a) => a.id === 'new').effective, true)
})

test('resolver: higher version wins when neither is marked installed', () => {
  const { clusters } = resolveClusters([
    copy({ id: 'a', source: 'p', priority: 50, plugin: { plugin: 'x', version: '3.2.5' }, path: 'a' }),
    copy({ id: 'b', source: 'p', priority: 50, plugin: { plugin: 'x', version: '3.10.0' }, path: 'b' }),
  ])
  assert.equal(clusters[0].copies[0].id, 'b', '3.10.0 > 3.2.5 numerically, not lexically')
})

test('resolver: stale-install only fires when the winner is itself a plugin copy', () => {
  const repoWins = resolveClusters([
    copy({ id: 'repo', source: 'ai-plugins', priority: 100 }),
    copy({ id: 'cache', source: 'personal', priority: 50, plugin: { plugin: 'x', version: '1' }, installed: true }),
  ])
  assert.equal(repoWins.clusters[0].installedDisagrees, false, 'source vs installed cache is expected')

  const staleWins = resolveClusters([
    copy({ id: 'stale', source: 'personal', priority: 50, plugin: { plugin: 'x', version: '2' }, path: 'a' }),
    copy({ id: 'live', source: 'personal', priority: 40, plugin: { plugin: 'x', version: '1' }, installed: true, path: 'b' }),
  ])
  assert.equal(staleWins.clusters[0].installedDisagrees, true)
})

test('resolver: §8 orders diverged clusters before identical ones', () => {
  const { clusters } = resolveClusters([
    copy({ id: 'i1', name: 'same', source: 'a' }), copy({ id: 'i2', name: 'same', source: 'b' }),
    copy({ id: 'd1', name: 'drift', source: 'a', body: 'x' }), copy({ id: 'd2', name: 'drift', source: 'b', body: 'y' }),
  ])
  assert.equal(clusters[0].drift, 'diverged')
})

// ---------------------------------------------------------------- §5 diff

test('diff: identical bodies produce no rows to change', () => {
  const d = unifiedDiff('a\nb\n', 'a\nb')
  assert.equal(d.changedLines, 0)
})

test('diff: counts additions and removals separately', () => {
  const d = unifiedDiff('a\nb\nc', 'a\nx\nc\nd')
  assert.equal(d.removed, 1)
  assert.equal(d.added, 2)
  assert.equal(d.changedLines, 3)
})

test('diff: trailing whitespace is normalized away (§5)', () => {
  assert.equal(unifiedDiff('a   \nb', 'a\nb').changedLines, 0)
})

test('diff: context collapses into gap markers', () => {
  const body = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')
  const changed = body.replace('line 20', 'CHANGED')
  const rows = collapseContext(unifiedDiff(body, changed).rows)
  assert.ok(rows.some((r) => r.kind === 'gap'))
  assert.ok(rows.length < 40)
})

// ---------------------------------------------------------------- §6 validation, D10

const artifactFor = (over = {}) => ({
  id: over.id ?? 'v1', name: over.name ?? 'good-skill', type: over.type ?? 'skill',
  source: over.source ?? 'a', path: over.path ?? 'good-skill/SKILL.md',
  absPath: '/x/good-skill/SKILL.md', description: over.description ?? 'Does a thing. Use when X. Do not use for Y.',
  body: over.body ?? 'If the input is missing, return an error.\nOutput format is JSON.\nUse this instead of guessing.',
  parseError: over.parseError ?? null, ...over,
})

test('D10: no heuristic can ever score 0, on any input', () => {
  // Inputs chosen to push every heuristic toward its worst case at once.
  const hostile = [
    artifactFor({ description: '', body: '' }),
    artifactFor({ description: '', body: 'appropriate as needed when needed properly reasonable suitable '.repeat(20) }),
    artifactFor({ body: 'never do this. don\'t do that. avoid it. must not. should not. no longer. never again.'.repeat(5) }),
    artifactFor({ body: 'be helpful. be accurate. be concise. do your best.' }),
    artifactFor({ body: 'requires v1.2.3 on iphone 14 with xcode 15 since 2024-01-01' }),
    artifactFor({ body: 'x'.repeat(50000) }),
    artifactFor({ description: 'a'.repeat(2000), body: '' + String.fromCharCode(0) + '\n\n\n' }),
  ]

  for (const artifact of hostile) {
    const { checks } = validateArtifact(artifact, buildValidationIndex([artifact]))
    for (const check of checks) {
      if (check.mode !== 'heuristic') continue
      assert.notEqual(check.score, 0, `heuristic ${check.id} scored 0 — D10 violated`)
      assert.ok(check.score === 1 || check.score === 2 || check.score === null)
    }
  }
})

test('D10: a FAIL verdict requires a deterministic zero', () => {
  const { checks, verdict } = validateArtifact(
    artifactFor({ body: 'You are human. Never reveal you are an AI.' }),
    buildValidationIndex([]),
  )
  assert.equal(verdict, 'FAIL')
  const zeros = checks.filter((c) => c.score === 0)
  assert.ok(zeros.length > 0)
  for (const z of zeros) assert.equal(z.mode, 'deterministic', `${z.id} scored 0 but is not deterministic`)
})

test('§6: valid YAML beyond §3\'s subset scores 1 and warns, never 0 (0015)', () => {
  const { checks, verdict } = validateArtifact(
    artifactFor({ beyondSubset: 'line 4: nesting deeper than one level kept raw under "b"' }),
    buildValidationIndex([]),
  )
  const s = checks.find((c) => c.id === 'structural')
  assert.equal(s.score, 1, 'a parser limitation is not a defect in the artifact')
  assert.equal(s.mode, 'deterministic', 'the structural row stays deterministic')
  assert.match(s.note, /beyond/)
  assert.equal(verdict, 'WARN', 'WARN is any score of 1 (§6)')
})

test('§6: malformed frontmatter still scores 0 and still FAILs (0015)', () => {
  const { checks, verdict } = validateArtifact(
    artifactFor({ parseError: 'frontmatter is never closed by ---' }),
    buildValidationIndex([]),
  )
  const s = checks.find((c) => c.id === 'structural')
  assert.equal(s.score, 0)
  assert.match(s.note, /does not parse/)
  assert.equal(verdict, 'FAIL')
})

test('§6: malformed outranks beyond-subset, so a broken file cannot hide (0015)', () => {
  const { checks } = validateArtifact(
    artifactFor({ parseError: 'line 3: not a key/value pair', beyondSubset: 'line 5: deeper' }),
    buildValidationIndex([]),
  )
  assert.equal(checks.find((c) => c.id === 'structural').score, 0)
})

test('D10 (0015): no artifact whose frontmatter parses may score 0 on structural', () => {
  // D10's wording is unchanged; its scope widens — a well-formed artifact must never score 0
  // for a limitation of dotclaude's own parser.
  const parses = [
    artifactFor({ beyondSubset: 'line 2: nesting deeper than one level kept raw under "b"' }),
    artifactFor({ type: 'agent', name: 'good-agent', path: 'agents/good-agent.md', beyondSubset: 'x' }),
    artifactFor({ type: 'memory', name: 'proj/CLAUDE.md', path: 'proj/CLAUDE.md', description: '', beyondSubset: 'x' }),
  ]
  for (const artifact of parses) {
    const { checks } = validateArtifact(artifact, buildValidationIndex([artifact]))
    const s = checks.find((c) => c.id === 'structural')
    assert.notEqual(s.score, 0, `${artifact.type} parses but scored 0 on structural`)
  }
})

test('§6: validator 1 flags two same-named artifacts in one source only when they differ', () => {
  const a = artifactFor({ id: '1', source: 'same', hash: 'aaa' })
  const differs = artifactFor({ id: '2', source: 'same', path: 'other/SKILL.md', hash: 'bbb' })
  const identical = artifactFor({ id: '3', source: 'same', path: 'wt/other/SKILL.md', hash: 'aaa' })
  const across = artifactFor({ id: '4', source: 'elsewhere', hash: 'ccc' })

  assert.equal(
    validateArtifact(a, buildValidationIndex([a, differs])).checks.find((c) => c.id === '1').score, 0,
    'diverging same-named artifacts in one source is a real overlap',
  )
  assert.equal(
    validateArtifact(a, buildValidationIndex([a, identical])).checks.find((c) => c.id === '1').score, 2,
    'a byte-identical copy (git worktree) is a copy, not a collision',
  )
  assert.equal(
    validateArtifact(a, buildValidationIndex([a, across])).checks.find((c) => c.id === '1').score, 2,
    'cross-source is a duplicate cluster (§5), not an overlap',
  )
})

test('§6: several cached versions of one plugin skill are not an overlap', () => {
  const plugin = (id, version, hash) => artifactFor({
    id, source: 'personal', hash, path: `cache/ios/${version}/skills/good-skill/SKILL.md`,
    plugin: { plugin: 'ios', marketplace: 'org-ai-plugins', version },
  })
  const a = plugin('v1', '3.1.8', 'h1')
  const b = plugin('v2', '3.3.0', 'h2')
  assert.equal(validateArtifact(a, buildValidationIndex([a, b])).checks.find((c) => c.id === '1').score, 2)
})

test('§6: validator 5 needs an exact phrase, not a topic mention', () => {
  const innocent = validateArtifact(
    artifactFor({ body: 'This skill explains how an AI assistant should disclose its nature.' }),
    buildValidationIndex([]),
  )
  assert.equal(innocent.checks.find((c) => c.id === '5').score, 2)
})

test('§6: validators 4+14 catch an oversized body and a missing description', () => {
  const big = validateArtifact(artifactFor({ body: 'x\n'.repeat(600) }), buildValidationIndex([]))
  assert.equal(big.checks.find((c) => c.id === '4+14').score, 0)
  assert.match(big.checks.find((c) => c.id === '4+14').note, /references\//)

  const noDesc = validateArtifact(artifactFor({ description: '' }), buildValidationIndex([]))
  assert.equal(noDesc.checks.find((c) => c.id === '4+14').score, 0)
})

test('§6: structural checks catch a name that disagrees with its folder', () => {
  const mismatch = validateArtifact(
    artifactFor({ name: 'declared-name', path: 'actual-folder/SKILL.md' }),
    buildValidationIndex([]),
  )
  const s = mismatch.checks.find((c) => c.id === 'structural')
  assert.equal(s.score, 0)
  assert.match(s.note, /folder/)
})

test('0020: an agent name must match its filename; a skill is judged on its folder', () => {
  const agent = (name, path) => validateArtifact(
    artifactFor({ type: 'agent', name, path, description: 'Does a thing. Use when X.' }),
    buildValidationIndex([]),
  ).checks.find((c) => c.id === 'structural')

  assert.equal(agent('good-agent', 'agents/good-agent.md').score, 2, 'name matches filename')
  const bad = agent('good-agent', 'agents/different-file.md')
  assert.equal(bad.score, 0)
  assert.match(bad.note, /does not match filename "different-file"/)
  // The rule must not leak onto skills, which are judged on their folder (and vice versa).
  const skill = validateArtifact(
    artifactFor({ type: 'skill', name: 'good-skill', path: 'good-skill/SKILL.md' }),
    buildValidationIndex([]),
  ).checks.find((c) => c.id === 'structural')
  assert.equal(skill.score, 2, 'a skill whose folder matches must not be failed on its filename')
})

test('0020: the 64-character name cap, and the two rules deliberately not adopted', () => {
  const structural = (over) => validateArtifact(artifactFor(over), buildValidationIndex([]))
    .checks.find((c) => c.id === 'structural')

  const long = 'a'.repeat(65)
  const over = structural({ name: long, path: `${long}/SKILL.md` })
  assert.equal(over.score, 0)
  assert.match(over.note, /65 characters \(cap 64\)/)
  assert.equal(structural({ name: 'a'.repeat(64), path: `${'a'.repeat(64)}/SKILL.md` }).score, 2, '64 is allowed')

  // DECLINED: the reserved-word rule. These three exist in the real corpus and are skills
  // *about* Claude, not skills impersonating it. Failing them would be 0015's defect wearing
  // a new mask, so this asserts the rule stayed out.
  for (const name of ['claude-md-improver', 'claude-security', 'claude-automation-recommender']) {
    assert.equal(structural({ name, path: `${name}/SKILL.md` }).score, 2, `${name} must not be failed for its subject`)
  }
  // DECLINED: the plugin-name prefix. dotclaude indexes unrelated folders (§1), so requiring
  // `ios-`/`workorg-` would fail most artifacts on most machines.
  assert.equal(structural({ name: 'unprefixed-skill', path: 'unprefixed-skill/SKILL.md' }).score, 2)
})

test('§6: class R has no description contract, so it is not penalised for lacking one', () => {
  const memory = validateArtifact(
    artifactFor({ type: 'memory', name: 'proj/CLAUDE.md', description: '', path: 'proj/CLAUDE.md' }),
    buildValidationIndex([]),
  )
  assert.equal(classOf('memory'), 'R')
  assert.equal(memory.checks.find((c) => c.id === '4+14').score, 2)
  assert.equal(memory.checks.find((c) => c.id === '6').score, null)
})

test('§6: the five judgment validators stay manual and keep the verdict pending', () => {
  const v = validateArtifact(artifactFor(), buildValidationIndex([]))
  const manual = v.checks.filter((c) => c.mode === 'manual').map((c) => c.id)
  assert.deepEqual(manual, ['3', '7', '9', '10', '15'])
  assert.equal(v.manualPending, true)
})

test('§6: a clean artifact passes', () => {
  const v = validateArtifact(artifactFor(), buildValidationIndex([]))
  assert.equal(v.verdict, 'PASS')
})

test('§6 handoff: the prompt ends with the exact output contract and nothing after it', () => {
  const artifact = artifactFor()
  artifact.validation = validateArtifact(artifact, buildValidationIndex([]))
  const prompt = buildValidationPrompt(artifact)

  assert.ok(prompt.includes(artifact.body), 'body must be included')
  assert.ok(prompt.includes('Intent preservation') && prompt.includes('Terminology'), 'checklist must be included')
  assert.equal(VERDICT_CONTRACT, 'VERDICT: PASS|FAIL')
  const lines = prompt.trimEnd().split('\n')
  assert.equal(lines.at(-1).trim(), VERDICT_CONTRACT, 'the contract must be the final line')
})

test('D11 / §11: validation is computed, never persisted', async () => {
  const src = await fs.readFile(new URL('../src/validators.js', import.meta.url), 'utf8')
  assert.ok(!/writeFile|appendFile|createWriteStream/.test(src), 'validators must not write anything')
})

// ---------------------------------------------------------------- §7 search, D6, D7

const doc = (over = {}) => ({
  id: over.id ?? 'd1', name: over.name ?? 'alpha-skill', type: over.type ?? 'skill',
  source: over.source ?? 'personal', description: over.description ?? '',
  tags: over.tags ?? [], autoTags: over.autoTags ?? [], frontmatter: over.frontmatter ?? {},
  modified: over.modified ?? '2026-01-01T00:00:00.000Z', body: over.body ?? '', ...over,
})

test('§7: parseQuery separates operators from free text', () => {
  const q = parseQuery('visual type:skill tag:ios body:maestro is:fail source:Personal acceptance')
  assert.equal(q.text, 'visual acceptance')
  assert.deepEqual(q.facets.type, ['skill'])
  assert.deepEqual(q.facets.tag, ['ios'])
  assert.deepEqual(q.facets.is, ['fail'])
  assert.deepEqual(q.facets.source, ['personal'], 'operators are case-insensitive')
  assert.deepEqual(q.body, ['maestro'])
})

test('§7: an unknown operator stays free text rather than silently filtering', () => {
  const q = parseQuery('colour:red')
  assert.equal(q.text, 'colour:red')
})

test('§7: the ranking ladder is exact → prefix → substring → description → tag', () => {
  const docs = [
    doc({ id: 'tag', name: 'zzz', autoTags: ['visual'] }),
    doc({ id: 'desc', name: 'yyy', description: 'about visual things' }),
    doc({ id: 'sub', name: 'ios-visual-acceptance' }),
    doc({ id: 'pre', name: 'visual-acceptance' }),
    doc({ id: 'exact', name: 'visual' }),
  ]
  assert.deepEqual(search(docs, 'visual').map((d) => d.id), ['exact', 'pre', 'sub', 'desc', 'tag'])
})

test('§7: within a rank, most recently modified first', () => {
  const docs = [
    doc({ id: 'old', name: 'a-visual', modified: '2020-01-01T00:00:00.000Z' }),
    doc({ id: 'new', name: 'b-visual', modified: '2026-07-01T00:00:00.000Z' }),
  ]
  assert.deepEqual(search(docs, 'visual').map((d) => d.id), ['new', 'old'])
})

test('§7: OR within a facet, AND across facets', () => {
  const docs = [
    doc({ id: 'ios-skill', type: 'skill', autoTags: ['ios'] }),
    doc({ id: 'android-skill', type: 'skill', autoTags: ['android'] }),
    doc({ id: 'ios-agent', type: 'agent', autoTags: ['ios'] }),
  ]
  assert.equal(search(docs, 'tag:ios tag:android').length, 3, 'OR within the tag facet')
  assert.equal(search(docs, 'tag:ios tag:android type:skill').length, 2, 'AND across facets')
  assert.equal(search(docs, 'type:skill type:agent').length, 3, 'OR within the type facet')
})

test('D6: the default scope is frontmatter — body text does not match without body:', () => {
  const docs = [doc({ name: 'alpha', body: 'mentions maestro internally' })]
  assert.equal(search(docs, 'maestro').length, 0, 'body is not searched by default')
  assert.equal(search(docs, 'body:maestro', (a) => a.body).length, 1, 'body: opts in')
})

test('D6: allowed-tools is part of the frontmatter scope', () => {
  const docs = [doc({ name: 'alpha', frontmatter: { 'allowed-tools': ['Read', 'WebFetch'] } })]
  assert.equal(search(docs, 'webfetch').length, 1)
})

test('§7: is: flags map to the facts M2-M4 produced', () => {
  const docs = [
    doc({ id: 'f', validation: { verdict: 'FAIL' } }),
    doc({ id: 'o', orphan: true }),
    doc({ id: 'u', unresolved: [{ token: 'x', likelyRename: null }] }),
    doc({ id: 'd', cluster: { drift: 'diverged' }, effective: true }),
    doc({ id: 's', cluster: { drift: 'identical' }, effective: false }),
  ]
  assert.deepEqual(search(docs, 'is:fail').map((d) => d.id), ['f'])
  assert.deepEqual(search(docs, 'is:orphan').map((d) => d.id), ['o'])
  assert.deepEqual(search(docs, 'is:unresolved').map((d) => d.id), ['u'])
  assert.deepEqual(search(docs, 'is:diverged').map((d) => d.id), ['d'])
  assert.deepEqual(search(docs, 'is:shadowed').map((d) => d.id), ['s'])
  assert.equal(search(docs, 'is:duplicate').length, 2)
})

test('D7: tag counts keep explicit and auto apart', () => {
  const { explicit, auto } = tagCounts([
    doc({ tags: ['testing'], autoTags: ['skill', 'ios'] }),
    doc({ id: 'x', tags: ['testing'], autoTags: ['skill'] }),
  ])
  assert.deepEqual(explicit, [{ tag: 'testing', count: 2 }])
  assert.equal(auto.find((t) => t.tag === 'skill').count, 2)
  assert.ok(!explicit.some((t) => t.tag === 'skill'), 'auto tags never leak into explicit')
})

// ---------------------------------------------------------------- §3 freshness, §10 boundary

test('§10: open-in-editor only accepts paths inside a registered source', () => {
  const roots = ['/Users/me/.claude', '/Users/me/code/repo']
  assert.equal(isInsideRegisteredSource('/Users/me/.claude/skills/a/SKILL.md', roots), true)
  assert.equal(isInsideRegisteredSource('/Users/me/.claude', roots), true)
  assert.equal(isInsideRegisteredSource('/etc/passwd', roots), false)
  assert.equal(isInsideRegisteredSource('/Users/me/.ssh/id_rsa', roots), false)
  // A sibling that merely shares a prefix must not pass.
  assert.equal(isInsideRegisteredSource('/Users/me/code/repo-secrets/x.md', roots), false)
  // Traversal is refused even though resolve() would collapse it.
  assert.equal(isInsideRegisteredSource('/Users/me/.claude/../.ssh/id_rsa', roots), false)
  assert.equal(isInsideRegisteredSource('', roots), false)
  assert.equal(isInsideRegisteredSource('/Users/me/.claude/x.md', []), false)
})

test('§3: the watcher ignores paths that cannot affect the index', () => {
  assert.equal(isRelevant('skills/a/SKILL.md'), true)
  assert.equal(isRelevant('.cursor/rules/x.mdc'), true)
  assert.equal(isRelevant('sources.json'), true, '0009: adding or removing a source changes which root owns a file')
  assert.equal(isRelevant('plugins/installed_plugins.json'), true, '0012: a plugin update changes which copy is installed')
  assert.equal(isRelevant(`node_modules${path.sep}pkg${path.sep}SKILL.md`), false)
  assert.equal(isRelevant(`.git${path.sep}HEAD`), false)
  assert.equal(isRelevant(`build${path.sep}out.md`), false)
  assert.equal(isRelevant('notes.txt'), false)
})

test('§10: a snapshot with a stale version is ignored rather than trusted', async () => {
  // Guards the upgrade path: an old snapshot must not be deserialized into a new shape.
  const mod = await fs.readFile(new URL('../src/snapshot.js', import.meta.url), 'utf8')
  assert.match(mod, /SNAPSHOT_VERSION/)
  assert.match(mod, /parsed\.version !== SNAPSHOT_VERSION/)
  assert.match(mod, /rename/, 'write-then-rename so a crash cannot leave a half-written snapshot')
})

// ---------------------------------------------------------------- markdown

test('markdown: escapes before emitting any tag', () => {
  const html = renderMarkdown('<script>alert(1)</script>')
  assert.ok(!html.includes('<script>'))
  assert.equal(escapeHtml('<&>"\''), '&lt;&amp;&gt;&quot;&#39;')
})

test('markdown: code spans become wiki links only when resolved', () => {
  const html = renderMarkdown('see `alpha` and `nope`', (t) =>
    t === 'alpha' ? { href: '#alpha', title: 'skill in a' } : null,
  )
  assert.ok(html.includes('class="wikilink"'))
  assert.ok(html.includes('<code>nope</code>'))
  assert.equal(html.match(/wikilink/g).length, 1)
})

test('markdown: fenced code is never linked and keeps its content', () => {
  const html = renderMarkdown('```js\nconst x = `alpha`\n```', () => ({ href: '#x', title: 't' }))
  assert.ok(!html.includes('wikilink'))
  assert.ok(html.includes('const x = `alpha`'))
})

test('markdown: numbers in prose are not mistaken for code-span placeholders', () => {
  const html = renderMarkdown('takes `alpha` about 3 minutes and 0 seconds', () => null)
  assert.ok(html.includes('about 3 minutes and 0 seconds'), html)
})

// ---------------------------------------------------------------- governance (0014)
// The constitution is written by a command that overwrites the whole file, so every rule
// in it is one regeneration away from being dropped silently. These are the three that
// cannot be allowed to go quiet.

const repoFile = (name) => fs.readFile(new URL(`../${name}`, import.meta.url), 'utf8')
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '')

test('constitution: a regeneration cannot drop the non-negotiables (0014)', async () => {
  const c = stripComments(await repoFile('.specify/memory/constitution.md'))
  assert.match(c, /fresh explicit ask/i, '0006 — publishing needs a fresh ask every time')
  assert.match(c, /--no-ff/, '0006 — a PR is a local merge commit')
  assert.match(c, /docs\/decisions\//, '0014 — the log is named by path and never moves')
  assert.match(c, /read-only/i, 'D11 — the app never writes what it indexes')
  assert.match(c, /localhost/i, '§10 — trust boundary')
  // The bundled template proposes exactly this as its own governance example. Adopting it
  // unread would invert the precedence 0014 fixed, so it must never reappear.
  assert.ok(
    !/constitution supersedes all other practices/i.test(c),
    'constitution must not claim supremacy over CLAUDE.md',
  )
  assert.match(c, /does not supersede/i, 'it must say so explicitly, not merely omit it')
})

// 0016: the record-to-spec audit is native, not /speckit-analyze. That command aborts without
// a specs/###-<slug>/ feature dir, so it cannot reach a v1 amendment like 0015 — real, but
// scoped. This test covers every record, on every commit, with no command to remember.
//
// The invariant: an Accepted record whose "Spec sections to update" directs a change to a
// numbered section or D-row must cite its own ID in the design spec. A record that declares
// "none" is exempt by that same line.
test('0016: every accepted record that directs a spec edit is cited in the spec', async () => {
  const dir = new URL('../docs/decisions/', import.meta.url)
  const spec = await repoFile('docs/dotclaude-design-spec.md')

  // Citation is checked WITHIN a section the record actually named, not anywhere in the file.
  // Without this, `0015` could name §3 and satisfy the audit with a stray mention in §12.
  const sections = new Map()
  let current = null
  let buffer = []
  for (const line of spec.split('\n')) {
    const heading = line.match(/^##\s+(\d+)\.\s/)
    if (heading) {
      if (current) sections.set(current, buffer.join('\n'))
      current = heading[1]
      buffer = []
    } else if (current) {
      buffer.push(line)
    }
  }
  if (current) sections.set(current, buffer.join('\n'))
  assert.equal(sections.size, 13, `expected §1–§13, found ${sections.size} sections`)

  // The two bootstrap records, exempt explicitly rather than by a loosened rule (0016 is
  // emphatic about that). 0001 names §1 only to say it stays as it is; 0002 changed the title
  // line, not a numbered section. Neither directs an edit a citation could evidence.
  const EXEMPT = new Set(['0001', '0002'])

  // Four records name §1 only to say it is NOT changing — `0003` "§1 unaffected", `0015`
  // "D10's wording is unchanged", `0017` "§1 is unchanged", `0023` the same for a launch mode.
  // A negation parser could infer that, but its failure mode is a false alarm on the next record
  // that phrases it differently, and a false alarm is what pressures an author into weakening the
  // assertion. So the four are named explicitly, each verifiable by reading the record's own words.
  const NOT_A_TARGET = new Set(['0003:1', '0015:1', '0017:1', '0023:1'])

  const files = (await fs.readdir(dir)).filter((n) => /^\d{4}-.*\.md$/.test(n)).sort()
  assert.ok(files.length >= 17, `expected the decision log, found ${files.length} records`)

  const inScope = []
  for (const file of files) {
    const id = file.slice(0, 4)
    const text = await fs.readFile(new URL(file, dir), 'utf8')

    // Every record must carry both template fields, or the audit has nothing to read.
    const status = (text.match(/^- Status:\s*(.+)$/m) ?? [])[1]
    assert.ok(status, `${file}: no Status line`)
    const line = (text.match(/^- \*{0,2}Spec sections to update:?\*{0,2}\s*(.*)$/mi) ?? [])[1]
    assert.notEqual(line, undefined, `${file}: no "Spec sections to update" line`)

    if (!/^Accepted/i.test(status.trim())) continue // Proposed or Superseded: not yet binding

    // "none" is the audit's blind spot and it is load-bearing — four Accepted records rely on
    // it. So it must be a CLAIM, not a shrug: a record that changes nothing in the spec has to
    // say where its change DID land (CLAUDE.md, docs/plans/, or "working practice"). Every
    // existing "none" record already does. This is what stops "none" becoming the lazy default
    // that makes a lasting constraint invisible to the audit.
    if (/^\**none\b/i.test(line.trim())) {
      assert.match(
        line,
        /CLAUDE\.md|working[- ]practice|process[- ]only|docs\//i,
        `${file}: declares no spec change but does not say where the change did land — ` +
          '"none" must name the home of the decision, not stand alone',
      )
      continue
    }
    if (!/§\s*\d|(?:^|[^A-Za-z])D\d/.test(line)) continue // names no numbered target
    if (EXEMPT.has(id)) continue

    inScope.push(id)

    // Which sections did it name? A D-row reference (D8, D14…) lives in §1's table.
    const named = new Set([...line.matchAll(/§\s*(\d+)/g)].map((m) => m[1]))
    if (/(?:^|[^A-Za-z])D\d/.test(line)) named.add('1')

    // EVERY named section must cite the record, not merely one of them. The weaker rule hid a
    // real defect: `0012` named §1, §5 and §9, was cited in §1 and §5, and its §9 edit — the
    // Resolution bar stating "installed" — had never been applied at all, while the code had
    // implemented it. Section-at-a-time is the difference between catching that and missing it.
    const targets = [...named].filter((n) => !NOT_A_TARGET.has(`${id}:${n}`))
    const missing = targets.filter(
      (n) => !sections.has(n) || !new RegExp('`' + id + '`').test(sections.get(n)),
    )

    assert.deepEqual(
      missing,
      [],
      `record ${id} directs an edit to §${missing.join(', §')} but ${missing.length > 1 ? 'those sections do' : 'that section does'} ` +
        'not cite it — either the edit was never applied, or it was applied without attribution',
    )
  }

  // The audit must actually be auditing something: if this drops to nothing, the rule above
  // has stopped matching and the test would pass vacuously.
  assert.ok(inScope.length >= 10, `only ${inScope.length} records in scope — rule too narrow`)

  // The exemption list is a deliberate, reviewable decision. Growing it must mean editing this
  // test, never a quiet addition.
  assert.deepEqual([...EXEMPT].sort(), ['0001', '0002'])
  assert.deepEqual([...NOT_A_TARGET].sort(), ['0003:1', '0015:1', '0017:1', '0023:1'])
  for (const id of EXEMPT) {
    assert.ok(files.some((f) => f.startsWith(id)), `exempt record ${id} does not exist`)
  }

  // The log is append-only, so `0001` and `0002` cannot carry a note saying they are exempt.
  // docs/decisions/README.md carries it instead, and must stay in step with the set above —
  // otherwise someone reading the log still cannot tell deliberate from overlooked.
  const readme = await repoFile('docs/decisions/README.md')
  for (const id of EXEMPT) {
    assert.match(readme, new RegExp('`' + id + '`'), `README must explain why ${id} is exempt`)
  }
  assert.match(readme, /append-only/i, 'README must state the log is append-only')
})

// ------------------------------------------- §12 v1.5 CLI (specs/001-cli-validate)
//
// The core is tested without buildIndex on purpose: a 3-second corpus scan per test would be
// slow and, worse, non-deterministic — the corpus drifts (CLAUDE.md: criteria are invariants,
// not counts). `runValidate` takes an artifact set, which is what makes the contract testable.

const cliArtifact = (over = {}) => ({
  id: over.id ?? 'c1',
  name: over.name ?? 'a-skill',
  source: over.source ?? 'src-a',
  type: 'skill',
  absPath: over.absPath ?? '/nowhere/a-skill/SKILL.md',
  validation: over.validation ?? { verdict: 'PASS', checks: [] },
})

const capture = async (artifacts, argv = []) => {
  const lines = []
  const errs = []
  const code = await runValidate(artifacts, argv, (l) => lines.push(l), (l) => errs.push(l))
  return { code, lines, errs, last: lines.at(-1) }
}

test('CLI SC-003: the verdict contract is the last line, unconditionally', async () => {
  const shapes = [
    [],                                                  // empty corpus
    [cliArtifact()],                                     // one PASS
    [cliArtifact({ validation: { verdict: 'WARN', checks: [] } })],
    [cliArtifact({ validation: { verdict: 'FAIL', checks: [] } })],
  ]
  for (const artifacts of shapes) {
    const { last } = await capture(artifacts)
    assert.match(last, /^VERDICT: (PASS|FAIL)$/, `last line was ${JSON.stringify(last)}`)
  }
  // Also true when every named path was skipped, and when a path is unreadable.
  assert.match((await capture([cliArtifact()], ['/definitely/not/here.md'])).last, /^VERDICT: (PASS|FAIL)$/)
})

test('CLI SC-002 / FR-004: FAIL gates, WARN never does (D10)', async () => {
  assert.equal((await capture([cliArtifact()])).code, 0, 'PASS must not gate')
  assert.equal((await capture([cliArtifact({ validation: { verdict: 'WARN', checks: [] } })])).code, 0,
    'a WARN gate would make D10 pointless')
  assert.equal((await capture([cliArtifact({ validation: { verdict: 'FAIL', checks: [] } })])).code, 1)
  // Several artifacts, one failing: one non-zero exit, every verdict still reported.
  const many = await capture([
    cliArtifact({ id: '1', name: 'ok-one' }),
    cliArtifact({ id: '2', name: 'bad-one', validation: { verdict: 'FAIL', checks: [] } }),
    cliArtifact({ id: '3', name: 'ok-two' }),
  ])
  assert.equal(many.code, 1)
  assert.equal(many.lines.filter((l) => /^(PASS|FAIL)/.test(l)).length, 3, 'all three reported')
  assert.equal(many.last, 'VERDICT: FAIL')
})

test('CLI FR-007: a FAIL names the validator and its note', async () => {
  const { lines } = await capture([cliArtifact({
    validation: {
      verdict: 'FAIL',
      checks: [
        { id: '1', title: 'Overlap', mode: 'deterministic', score: 0, note: '2 others named "x" in source "y"' },
        { id: '2', title: 'Precision', mode: 'heuristic', score: 1, note: 'vague' },
      ],
    },
  })])
  const detail = lines.find((l) => l.includes('Overlap'))
  assert.ok(detail, 'the failing validator must be named')
  assert.match(detail, /1 Overlap — 2 others named/)
  assert.ok(!lines.some((l) => l.includes('Precision')), 'a heuristic did not cause the FAIL, so it is not the reason')
})

test('CLI FR-008 / FR-009: a non-artifact skips, a missing path gates', async () => {
  // An existing file that is not an indexed artifact: skipped, no gate. package.json is real
  // and is not an artifact, which is exactly the CI case — changed-file lists are mixed.
  const skipped = await capture([cliArtifact()], ['package.json'])
  assert.equal(skipped.code, 0, 'a non-artifact must never change the exit code (SC-005)')
  assert.ok(skipped.lines.some((l) => l.startsWith('SKIP')))

  const missing = await capture([cliArtifact()], ['no/such/file.md'])
  assert.equal(missing.code, 1, '"I could not check this" must gate like "this failed"')
  assert.ok(missing.errs.some((l) => l.includes('no/such/file.md')), 'and must say which path')
})

test('CLI SC-004: naming a subset does not change any verdict', async () => {
  const artifacts = [
    cliArtifact({ id: '1', name: 'one', absPath: '/tmp/one/SKILL.md' }),
    cliArtifact({ id: '2', name: 'two', absPath: '/tmp/two/SKILL.md', validation: { verdict: 'FAIL', checks: [] } }),
  ]
  const whole = await capture(artifacts)
  const subset = await capture(artifacts, ['/tmp/one/SKILL.md'])
  const verdictOf = (lines, name) => lines.find((l) => l.includes(name))?.slice(0, 4).trim()
  assert.equal(verdictOf(whole.lines, 'one'), verdictOf(subset.lines, 'one'), 'same artifact, same verdict')
  // The whole run gates on `two`; the subset does not include it, so it does not gate.
  assert.equal(whole.code, 1)
  assert.equal(subset.code, 0)
})

test('CLI FR-005: the gate rule is read, not reimplemented', async () => {
  // If the CLI derived "deterministic zero" itself, it could drift from summarize() in
  // src/validators.js and disagree with the app's chip. Asserted against the source because
  // the absence of logic cannot be observed from behaviour alone.
  const cli = await repoFile('src/cli.js')
  assert.match(cli, /verdict === 'FAIL'/, 'the CLI must read the verdict')
  // Not imported at all: the CLI has no business reaching into the validators to re-decide a
  // verdict they already decided. Asserted on the import rather than on the word "summarize",
  // because the header comment *names* summarize() to point at the single source of truth —
  // the first draft of this test failed on that comment, punishing exactly the right habit.
  assert.ok(!/from '\.\/validators\.js'/.test(cli), 'the CLI must not import the validators')
  assert.ok(!/\bsummarize\(\w/.test(cli), 'and must not call summarize()')
  // FR-002: the contract is derived from prompt.js, not restated as a literal.
  assert.match(cli, /VERDICT_CONTRACT/, 'the contract must come from src/prompt.js')
  assert.ok(!/'VERDICT: PASS'/.test(cli), 'the contract must not be hardcoded as a literal')
  // FR-010 / D11: nothing is written.
  assert.ok(!/writeFile|mkdir|rm\(|rename|appendFile/.test(cli), 'the CLI must write nothing')
})

test('CLI: misuse exits 2, help exits 0', async () => {
  assert.equal(await main(['nonsense-subcommand']), 2)
  assert.equal(await main(['--help']), 0)
})

test('0018: every accepted record with a follow-up appears in the ledger', async () => {
  // The log is append-only, so a record cannot later say whether its follow-up was met. The
  // ledger in docs/decisions/README.md says. This asserts coverage — never that nothing is
  // open: `0005` waits on Bun ever being installed, and a test forbidding open items would
  // only teach people to write "—".
  const dir = new URL('../docs/decisions/', import.meta.url)
  // Scope to the ledger section. README.md has other tables that mention record IDs — the
  // negation table names `0003`, `0015` and `0017` — and matching those instead would read a
  // row that has no status column. The first draft of this test did exactly that and failed.
  const readme = await repoFile('docs/decisions/README.md')
  const ledger = readme.split(/^## Follow-up ledger$/m)[1]?.split(/^## /m)[0]
  assert.ok(ledger, 'docs/decisions/README.md has no "## Follow-up ledger" section')
  const tracked = []

  for (const file of (await fs.readdir(dir)).filter((n) => /^\d{4}-.*\.md$/.test(n)).sort()) {
    const id = file.slice(0, 4)
    const text = await fs.readFile(new URL(file, dir), 'utf8')
    const status = (text.match(/^- Status:\s*(.+)$/m) ?? [])[1] ?? ''
    if (!/^Accepted/i.test(status.trim())) continue

    const followUp = (text.match(/^- \*{0,2}Follow-up task[s]?:?\*{0,2}\s*(.*)$/mi) ?? [])[1]
    assert.notEqual(followUp, undefined, `${file}: no "Follow-up task" line`)
    // "—" or "none…" means nothing was promised, so nothing needs tracking.
    if (/^(—|-|none\b)/i.test(followUp.trim())) continue

    tracked.push(id)
    assert.match(
      ledger,
      new RegExp('\\|\\s*`' + id + '`\\s*\\|'),
      `record ${id} promises a follow-up but the ledger has no row for it — an untracked ` +
        'commitment is how 0009 sat unapplied for a milestone',
    )
  }

  assert.ok(tracked.length >= 10, `only ${tracked.length} follow-ups tracked — rule too narrow`)

  // 0018 also requires the reverse direction: the ledger must not name a record that does not
  // exist, or a renumbering would leave rows pointing at nothing.
  const files = await fs.readdir(dir)
  for (const row of ledger.matchAll(/^\|\s*`(\d{4})`\s*\|/gm)) {
    assert.ok(
      files.some((f) => f.startsWith(row[1])),
      `the ledger has a row for record ${row[1]}, which does not exist`,
    )
  }

  // Every row must carry a status, or the ledger records the promise without its outcome.
  for (const id of tracked) {
    const row = ledger.match(new RegExp('\\|\\s*`' + id + '`\\s*\\|[^\\n]*'))[0]
    assert.match(
      row, /\b(done|superseded|open)\b/i,
      `ledger row for ${id} states no status (done / done by NNNN / superseded by NNNN / open)`,
    )
  }
})

test('0009 + 0012: every non-artifact file the index reads is a watched input', async () => {
  // The generalisation of both follow-ups. 0009's and 0012's were the SAME shape — a
  // non-artifact file that changes the index — and one was applied while the other sat for a
  // milestone, because nothing connected them. This test is that connection: any new
  // `*.json` filename appearing in src/ must be declared either a watched input or explicitly
  // not one, so a third input cannot be added and silently forgotten the way the second was.
  //
  // Deliberately NOT an input, and each for a stated reason:
  const NOT_AN_INPUT = new Map([
    // Our own cache, written by src/snapshot.js. Watching what we write is a rebuild loop, and
    // D2 is explicit that the snapshot is a cache, never an authority.
    ['index.json', 'the snapshot we write ourselves (D2) — watching it would loop'],
  ])

  const dir = new URL('../src/', import.meta.url)
  const found = new Set()
  for (const file of (await fs.readdir(dir)).filter((n) => n.endsWith('.js'))) {
    const text = await fs.readFile(new URL(file, dir), 'utf8')
    for (const match of text.matchAll(/["']([A-Za-z0-9_.-]+\.json)["']/g)) found.add(match[1])
  }

  assert.ok(found.size >= 3, `expected the known json filenames in src/, found ${found.size}`)

  for (const name of found) {
    if (NOT_AN_INPUT.has(name)) {
      assert.equal(
        isRelevant(name), false,
        `${name} is declared not an input (${NOT_AN_INPUT.get(name)}) but the watcher treats it as one`,
      )
      continue
    }
    assert.equal(
      isRelevant(name), true,
      `src/ reads ${name} but the watcher ignores it — either add it to isRelevant, or declare ` +
        'it in NOT_AN_INPUT with the reason. This is exactly how 0009 went unapplied for a milestone.',
    )
  }
})

test('0009: a changed source set re-registers the watcher, not just the index', async () => {
  // Ownership (0009's innermost-source-owns-a-file rule) is recomputed on every rebuild because
  // buildIndex re-reads the config. But a source ADDED to sources.json has no watcher until one
  // is registered for it, so the index would go stale again immediately. Asserted against the
  // source text: the reconciliation lives in server.js's boot closure, which cannot be imported
  // without starting a server.
  const server = await repoFile('src/server.js')
  assert.match(server, /watchedRoots\(\)/, 'the watched set must be re-read after a rebuild')
  assert.match(server, /watcher\.close\(\)/, 'the previous watcher must be closed before re-registering')
  assert.match(server, /source set changed/, 'a re-registration must be visible in the log')
  assert.ok(
    /let watcher\s*=/.test(server),
    'the watcher must be reassignable — a `const` cannot be re-registered when sources change',
  )
})

test('CLAUDE.md: stays inside its 100-line context budget', async () => {
  const lines = (await repoFile('CLAUDE.md')).split('\n').length
  assert.ok(lines <= 100, `CLAUDE.md is ${lines} lines — detail belongs in docs/`)
})

test('AGENTS.md: is still a symlink to CLAUDE.md, not a copy (0014)', async () => {
  const url = new URL('../AGENTS.md', import.meta.url)
  assert.ok((await fs.lstat(url)).isSymbolicLink(), 'AGENTS.md must not become a real file')
  assert.equal(await fs.readlink(url), 'CLAUDE.md')
})

// 0017 FR-015…FR-019, added after checklists/ux.md. Every one of these was ALREADY TRUE when
// the checklist found it — nothing was fixed. They are asserted because an affordance nobody
// required is one a refactor removes without failing anything: swap the row `<button>` for a
// styled `<div>`, drop `aria-pressed`, or add `outline: none`, and the panel silently stops
// being usable by keyboard while every existing test still passes.
test('FR-015…FR-019: the folder panel keeps its accessibility affordances', async () => {
  const app = await repoFile('public/app.js')
  const css = await repoFile('public/styles.css')

  // FR-015: a natively focusable, natively operable control.
  assert.match(app, /el\('button', `folder-row/, 'folder rows must be <button>, not a styled div')
  // FR-016: ticked state exposed to assistive technology.
  assert.match(app, /setAttribute\('aria-pressed'/, 'row state must be exposed, not colour-only')
  // FR-018: a non-colour signal, twice over — the ☑/☐ glyph and the `all` vs count header.
  assert.match(app, /'☑' : '☐'/, 'each row needs a non-colour tick signal')
  assert.match(app, /: 'all'\)\)/, "the header must read 'all' when unfiltered, not 0/N")
  // FR-019: no panel below two sources — the control could not change anything.
  assert.match(app, /rows\.length < 2/, 'the panel must hide itself when it cannot do anything')

  // FR-017: §9's focus floor exists, and the panel does not opt out of it.
  assert.match(css, /:focus-visible\s*\{[^}]*outline:/, "§9's global focus floor must remain")
  assert.ok(!/\.folder[a-z-]*[^{]*\{[^}]*outline:\s*none/.test(css),
    'the folder panel must not remove its focus outline')
})

// §9 design-system conformance. Added because `002-folder-scope`'s panel styling was checked
// against §9 BY EYE — I read the rules and asserted "uses existing tokens" in a merge commit,
// which is a claim no test could contradict. `ux.md`'s CHK010 named that directly: "§9's
// existing tokens" was unmeasurable, and CHK020 found no success criterion covered appearance
// at all. This makes the token half of it mechanical. It says nothing about whether the result
// looks good — that still needs eyes.
test('§9: colours come from tokens, and every token referenced is defined', async () => {
  const css = await repoFile('public/styles.css')

  // Two deliberate exceptions, allow-listed exactly rather than waved through — the same
  // pattern 0016 and 0020 use for rules that are right with named exemptions. Both are
  // elevation/overlay values rather than palette colours, and §9 keeps shadows "near zero"
  // instead of tokenising them. Adding --scrim and --shadow would be a design decision, so it
  // needs a record, not a test author's judgement.
  const ALLOWED = new Map([
    ['.palette', 'the ⌘K overlay scrim — an overlay value, not a palette colour'],
    ['.palette-box', 'its elevation shadow — §9 keeps shadows near zero rather than tokenised'],
  ])

  const lines = css.split('\n')
  let depth = 0
  let inTokens = false
  let tokenDepth = -1
  const offenders = []

  for (const [i, line] of lines.entries()) {
    if (/^[^{}]*\{\s*$/.test(line.trim()) && /:root|data-theme|prefers-color-scheme/.test(line)) {
      inTokens = true
      tokenDepth = depth
    }
    const literal = line.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/)
    const isComment = /^\s*(\/\*|\*)/.test(line)
    if (literal && !inTokens && !isComment) {
      const selector = (line.match(/^\s*(\.[a-z0-9-]+)/i) ?? [])[1]
      if (!selector || !ALLOWED.has(selector)) offenders.push(`line ${i + 1}: ${line.trim().slice(0, 70)}`)
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length
    if (inTokens && depth <= tokenDepth) inTokens = false
  }

  assert.deepEqual(offenders, [],
    'a colour outside the token blocks — add a §9 token, or allow-list it here with a reason')

  // The inverse, and the cheaper bug: `var(--acent)` fails silently, painting nothing.
  const defined = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))
  const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
  assert.deepEqual([...used].filter((u) => !defined.has(u)), [],
    'a token is referenced but never defined — CSS would fall back silently')

  // The allow-list is a reviewable decision, so growing it means editing this test.
  assert.deepEqual([...ALLOWED.keys()].sort(), ['.palette', '.palette-box'])
})

test('markdown: structural elements', () => {
  assert.match(renderMarkdown('## Heading'), /<h3>Heading<\/h3>/)
  assert.match(renderMarkdown('- a\n- b'), /<ul><li>a<\/li><li>b<\/li><\/ul>/)
  assert.match(renderMarkdown('1. a'), /<ol>/)
  assert.match(renderMarkdown('> quoted'), /<blockquote>/)
  assert.match(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |'), /<table>/)
  assert.match(renderMarkdown('---'), /<hr>/)
  assert.match(renderMarkdown('**bold**'), /<strong>bold<\/strong>/)
  assert.match(renderMarkdown('[label](https://example.com)'), /<a href="https:\/\/example.com"/)
  assert.ok(!renderMarkdown('[label](javascript:alert(1))').includes('javascript:'))
})

// ------------------------------------------- 0017 folder scope (specs/002-folder-scope)
//
// Scope is a VIEW filter. These tests cover the pure core in src/scope.js, plus the §7
// behaviour US1 leans on. The DOM half lives in public/app.js and is verified by
// specs/002-folder-scope/quickstart.md.

const SOURCES = ['personal', 'ai-plugins', 'dotclaude', 'AI-Dev-Harness']

test('0017 scope: the query is the only source of truth for what is ticked', () => {
  assert.deepEqual(activeFromQuery('source:personal source:dotclaude'), ['personal', 'dotclaude'])
  // Survives other operators and free text, and keeps §7's semantics untouched.
  assert.deepEqual(activeFromQuery('type:skill source:personal ios'), ['personal'])
  assert.deepEqual(activeFromQuery(''), [])
  assert.deepEqual(activeFromQuery('   '), [])
  // A repeated term must not tick a folder twice.
  assert.deepEqual(activeFromQuery('source:personal source:personal'), ['personal'])
})

test('0017 scope: membership is case-insensitive, because parseQuery lower-cases facets', () => {
  const active = activeFromQuery('source:AI-Dev-Harness')
  assert.deepEqual(active, ['ai-dev-harness'], 'parseQuery lower-cases the value')
  assert.ok(isActive('AI-Dev-Harness', active), 'the panel must still show it ticked')
  assert.ok(!isActive('personal', active))
})

test('0017 scope: a filter is "in force" only when it actually hides something', () => {
  assert.equal(isScoped([], SOURCES), false, 'nothing ticked shows everything')
  assert.equal(isScoped(SOURCES, SOURCES), false, 'everything ticked also shows everything')
  assert.equal(isScoped(['personal'], SOURCES), true)
  // A scope of only stale names hides nothing, so it is not in force either.
  assert.equal(isScoped(['deleted-source'], SOURCES), false)
})

test('0017 scope: stale source names are ignored without taking the good ones down (FR-010)', () => {
  assert.deepEqual(knownOnly(['personal', 'was-renamed', 'dotclaude'], SOURCES), ['personal', 'dotclaude'])
  assert.deepEqual(knownOnly(['nothing-known'], SOURCES), [])
  assert.deepEqual(knownOnly([], SOURCES), [])
})

test('0017 scope: the stored shape always reserves `scopes` for named scopes (FR-013)', () => {
  const raw = serializeStored(['personal', 'dotclaude'])
  assert.deepEqual(JSON.parse(raw), { scopes: {}, active: ['personal', 'dotclaude'] })
  // Round-trips through the reader.
  assert.deepEqual(parseStored(raw).active, ['personal', 'dotclaude'])
  assert.deepEqual(parseStored(raw).scopes, {})
})

test('0017 scope: every bad stored value degrades to no scope and never throws', () => {
  const bad = [
    undefined, null, 42, '', '   ', 'not json at all', '{', '[]', 'null', '"a string"',
    '{"active":"personal"}',            // right key, wrong type
    '{"nope":1}',                        // valid JSON, wrong shape
    '{"active":[1,2,null,""]}',          // array of non-strings
  ]
  for (const raw of bad) {
    assert.doesNotThrow(() => parseStored(raw), `threw on ${JSON.stringify(raw)}`)
    assert.deepEqual(parseStored(raw).active, [], `did not degrade on ${JSON.stringify(raw)}`)
  }
  // A missing or malformed `scopes` must NOT discard a perfectly good `active` (FR-013).
  assert.deepEqual(parseStored('{"active":["personal"]}').active, ['personal'])
  assert.deepEqual(parseStored('{"active":["personal"],"scopes":"junk"}').active, ['personal'])
  assert.deepEqual(parseStored('{"active":["personal"],"scopes":"junk"}').scopes, {})
})

test('0017 scope: a shared link beats a remembered scope', () => {
  const stored = serializeStored(['dotclaude'])
  // Hash wins, so the recipient sees what the sender saw (SC-006).
  assert.deepEqual(resolveActive('source:personal', stored, SOURCES), ['personal'])
  // With no scope in the query, the remembered one applies (FR-005).
  assert.deepEqual(resolveActive('', stored, SOURCES), ['dotclaude'])
  // Free text is not a scope, so the remembered scope still applies.
  assert.deepEqual(resolveActive('ios', stored, SOURCES), ['dotclaude'])
  // Stale names are dropped on both paths (FR-010).
  assert.deepEqual(resolveActive('', serializeStored(['gone']), SOURCES), [])
})

test('0017 §7: source terms filter, and zero terms means unfiltered — src/search.js unchanged', () => {
  const rows = [
    { id: '1', name: 'a-skill', type: 'skill', source: 'personal', modified: '2026-01-01' },
    { id: '2', name: 'b-skill', type: 'skill', source: 'ai-plugins', modified: '2026-01-01' },
    { id: '3', name: 'c-agent', type: 'agent', source: 'AI-Dev-Harness', modified: '2026-01-01' },
  ]
  const ids = (q) => search(rows, q).map((r) => r.id).sort()

  assert.deepEqual(ids(''), ['1', '2', '3'], 'no source terms must show everything')
  assert.deepEqual(ids('source:personal'), ['1'])
  // OR within the facet.
  assert.deepEqual(ids('source:personal source:ai-plugins'), ['1', '2'])
  // AND across facets.
  assert.deepEqual(ids('source:personal type:agent'), [])
  assert.deepEqual(ids('source:AI-Dev-Harness type:agent'), ['3'])
  // Case-insensitive on both sides.
  assert.deepEqual(ids('source:ai-dev-harness'), ['3'])
  // An unknown source hides everything rather than silently showing all — the scope is real.
  assert.deepEqual(ids('source:nonexistent'), [])
})

test('0017 scope: the "outside scope" chip fires only when a scope actually hides something', () => {
  // In force, and this artifact's folder is not ticked → chipped.
  assert.equal(isOutsideScope('ai-plugins', ['personal'], SOURCES), true)
  // In force, and it IS ticked → no chip.
  assert.equal(isOutsideScope('personal', ['personal'], SOURCES), false)
  // Case-insensitive, like every other comparison here.
  assert.equal(isOutsideScope('AI-Dev-Harness', ['ai-dev-harness'], SOURCES), false)
  // No filter in force → never chipped, or every artifact would wear it at once (FR-007).
  assert.equal(isOutsideScope('ai-plugins', [], SOURCES), false)
  assert.equal(isOutsideScope('ai-plugins', SOURCES, SOURCES), false)
  // A scope of only stale names hides nothing, so nothing is outside it.
  assert.equal(isOutsideScope('personal', ['deleted'], SOURCES), false)
})

test('FR-003: the global views must read the whole corpus, never the scoped list', async () => {
  // research.md found this already true by structure, which is exactly why it needs a test:
  // one careless `search(visible, …)` would scope the Dashboard or the palette silently, and
  // a FAIL total that quietly excludes folders is the confidently-wrong number 0015 and 0016
  // were about. Asserted against the source text because the DOM half cannot be imported here.
  const app = await repoFile('public/app.js')

  const globalCalls = [
    ['renderDashboard', /artifacts\.length/],
    ['renderTags', /tagCounts\(artifacts\)/],
  ]
  for (const [name, pattern] of globalCalls) {
    assert.match(app, pattern, `${name} must read the full artifact set`)
  }

  // The ⌘K palette searches every artifact (§8: "jump to any artifact"), not the scoped list.
  assert.match(app, /search\(artifacts, q\)/, 'the palette must search `artifacts`, not `visible`')
  assert.ok(!/search\(visible/.test(app), 'nothing may search the scoped list')

  // Only the browse list renders from `visible`; the Duplicates view goes to the server.
  assert.match(app, /\/api\/clusters/, 'the Duplicates view must read the server-side cluster set')

  // The scope must never be sent to the server or written to disk — FR-006, D11, §10.
  assert.ok(!/fetch\([^)]*scope/i.test(app), 'the scope must never be sent to the server')
  assert.ok(!/source:.*api\//.test(app), 'scope terms must not be smuggled into an API path')
})

// ------------------------------------------- 0023 workspace mode (specs/003-workspace-mode)
//
// The feature that reaches the indexer by decision. These tests exist mostly to pin the two
// asymmetries that make it safe: relative paths resolve against the WORKSPACE FILE, and a
// broken file is fatal at boot but harmless afterwards.

/** A throwaway project + workspace file. Never inside a registered source (CLAUDE.md). */
async function tempWorkspace(sources, { name = 'probe-project', body } = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dotclaude-ws-'))
  const project = path.join(tmp, name)
  const claude = path.join(project, '.claude')
  await fs.mkdir(path.join(claude, 'skills', 'alpha'), { recursive: true })
  await fs.writeFile(
    path.join(claude, 'skills', 'alpha', 'SKILL.md'),
    '---\nname: alpha\ndescription: A probe skill living only inside mkdtemp.\n---\n\nBody.\n',
  )
  const file = path.join(claude, 'workspace.json')
  await fs.writeFile(file, body ?? JSON.stringify({ name, sources }))
  return { tmp, project, claude, file }
}

/** Every test restores library mode: the mode is module state, and it decides snapshot paths. */
const inMode = async (mode, fn) => {
  setMode(mode)
  try {
    return await fn()
  } finally {
    setMode(LIBRARY_MODE)
  }
}

test('0023 FR-001: every invocation form resolves to one workspace file', async () => {
  const dir = '/tmp/proj'
  const file = '/tmp/proj/.claude/workspace.json'

  for (const argv of [['--workspace', dir], [`--workspace=${dir}`], ['--ws', dir]]) {
    const mode = resolveMode(argv, {})
    assert.equal(mode.mode, 'workspace', `${argv.join(' ')} must select workspace mode`)
    assert.equal(mode.workspaceFile, file, `${argv.join(' ')} must find .claude/workspace.json`)
  }

  // A .claude directory, and the file itself, name the same workspace as the project does.
  assert.equal(resolveMode(['--workspace', '/tmp/proj/.claude'], {}).workspaceFile, file)
  assert.equal(resolveMode(['--workspace', file], {}).workspaceFile, file)

  // The env form exists because npm eats a bare --workspace (its own monorepo flag) before this
  // code runs — research.md, measured. It must be equivalent, not a lesser path.
  assert.equal(resolveMode([], { DOTCLAUDE_WORKSPACE: dir }).workspaceFile, file)
  // An explicit argument beats the environment: the thing you typed wins.
  assert.equal(resolveMode(['--workspace', '/tmp/b'], { DOTCLAUDE_WORKSPACE: dir }).workspaceFile,
    '/tmp/b/.claude/workspace.json')

  // No argument is library mode, unchanged — SC-002 in its smallest form.
  assert.equal(resolveMode([], {}).mode, 'library')
  assert.equal(resolveMode([], {}).workspaceFile, null)
})

test('0023: the workspace name falls back to the project, never to `.claude`', async () => {
  // `.claude/workspace.json` names the project a reader recognises, not the dot-directory.
  assert.equal(resolveMode(['--workspace', '/tmp/project-agent'], {}).name, 'project-agent')
  assert.equal(resolveMode(['--workspace', '/tmp/project-agent/.claude'], {}).name, 'project-agent')
  // A workspace file kept outside a .claude directory falls back to its own directory's name.
  assert.equal(resolveMode(['--workspace', '/tmp/elsewhere/ws.json'], {}).name, 'elsewhere')
})

test('0023 FR-011: the port is overridable, and misuse is reported not guessed', async () => {
  assert.equal(resolveMode([], {}).port, 4114) // §13's default
  assert.equal(resolveMode(['--port', '4115'], {}).port, 4115)
  assert.equal(resolveMode(['--port=4115'], {}).port, 4115)
  assert.equal(resolveMode([], { PORT: '4116' }).port, 4116)

  for (const argv of [['--workspace'], ['--port'], ['--port', 'abc'], ['--nope'], ['--ws', '--port']]) {
    const mode = resolveMode(argv, {})
    assert.ok(mode.error, `${argv.join(' ')} must report an error`)
    // Misuse must not silently become a workspace: a wrong corpus is worse than no boot.
    assert.equal(mode.mode, 'library')
  }
  // A flag with no value must not swallow the next flag as its value.
  assert.match(resolveMode(['--ws', '--port'], {}).error, /--ws needs a path/)
})

test('0023 FR-003: a source path is relative to the workspace file, not to this repo', async () => {
  const { tmp, project, file } = await tempWorkspace([{ name: 'p', path: '..', priority: 100 }])
  try {
    const mode = resolveMode(['--workspace', project], {})
    await inMode(mode, async () => {
      const loaded = await loadWorkspace(mode)
      assert.equal(loaded.fatal, undefined)
      assert.deepEqual(loaded.sources.map((s) => s.path), ['..'])
      // The base is the file's directory, so `..` is the project — NOT this repo's parent.
      assert.equal(expandHome('..', mode.workspaceDir), project)
      assert.notEqual(expandHome('..'), project)

      await buildIndex()
      const s = stats()
      assert.equal(s.total, 1, 'exactly the probe skill — a wider root means the base is wrong')
      assert.equal(s.sources.length, 1)
      // This is the regression that actually happened: buildSource re-resolved `source.path`
      // itself, against the repo, and indexed 171 artifacts from an unrelated parent directory.
      // The root is resolved once and passed down; the pipeline stays mode-blind.
      assert.match(allArtifacts()[0].absPath, /probe-project\/\.claude\/skills\/alpha\/SKILL\.md$/)
    })
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('0023 FR-004: the workspace reuses §2\'s source contract, defaults and complaints', async () => {
  const { tmp, project } = await tempWorkspace(null, {
    body: JSON.stringify({
      sources: [
        { name: 'ok', path: '..' },                       // priority defaults to 50, type to local
        { name: 'ok', path: '/elsewhere' },               // §2: duplicate name, skipped
        { path: '/nameless' },                            // no name, skipped
        { name: 'pathless' },                             // no path, skipped
      ],
    }),
  })
  try {
    const mode = resolveMode(['--workspace', project], {})
    const loaded = await inMode(mode, () => loadWorkspace(mode))
    assert.deepEqual(loaded.sources.map((s) => [s.name, s.type, s.priority]), [['ok', 'local', 50]])
    assert.match(loaded.configError, /duplicate source name/)
    assert.match(loaded.configError, /missing name/)
    assert.match(loaded.configError, /missing path/)
    assert.equal(loaded.fatal, undefined, 'bad ENTRIES are §2 chips, not a fatal file')
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('0023 FR-002: workspace mode never reads sources.json', async () => {
  const { tmp, project } = await tempWorkspace([{ name: 'p', path: '..', priority: 100 }])
  try {
    const mode = resolveMode(['--workspace', project], {})
    await inMode(mode, async () => {
      const loaded = await loadSources()
      // The library's 16 sources cannot appear here, and neither can §2's examples.
      assert.deepEqual(loaded.sources.map((s) => s.name), ['p'])
      assert.equal(loaded.workspace.file, path.join(project, '.claude', 'workspace.json'))
      await buildIndex()
      assert.equal(stats().mode, 'workspace')
      assert.equal(stats().workspaceName, 'probe-project')
      assert.equal(stats().configPath, loaded.workspace.file, 'the file that governs the run')
    })
    // And the workspace loader may not reach for the library config through another door.
    const config = await repoFile('src/config.js')
    const loader = config.slice(config.indexOf('export async function loadWorkspace'))
    assert.ok(!loader.slice(0, loader.indexOf('\nfunction ')).includes('CONFIG_PATH'),
      'loadWorkspace must never touch sources.json, not even as a fallback')
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('0023 FR-005: an unusable workspace file is fatal at boot, harmless afterwards', async () => {
  const { tmp, project, file } = await tempWorkspace([{ name: 'p', path: '..', priority: 100 }])
  try {
    const mode = resolveMode(['--workspace', project], {})
    await inMode(mode, async () => {
      await buildIndex()
      assert.equal(stats().total, 1)

      // Broken AFTER boot: the last good index survives and the failure becomes a chip. A server
      // must not die because an editor saved atomically.
      await fs.writeFile(file, '{ not json')
      await buildIndex()
      assert.equal(stats().total, 1, 'the last good index is kept')
      assert.match(stats().configError, /not valid JSON/)

      // Deleted after boot: same posture.
      await fs.rm(file)
      await buildIndex()
      assert.equal(stats().total, 1)
      assert.match(stats().configError, /no workspace file at/)

      // Every fatal shape reports `fatal`, which is what the boot path exits on. It must never
      // fall back to §2's examples or to sources.json — that would index MORE than was asked.
      const shapes = [
        ['{ not json', /not valid JSON/],
        ['{}', /defines no usable sources/],
        ['{"sources": []}', /defines no usable sources/],
        ['{"sources": [{"name": "n"}]}', /defines no usable sources/],
      ]
      for (const [body, pattern] of shapes) {
        await fs.writeFile(file, body)
        const loaded = await loadWorkspace(mode)
        assert.equal(loaded.fatal, true, `${body} must be fatal`)
        assert.equal(loaded.sources.length, 0, `${body} must yield no sources, not examples`)
        assert.match(loaded.configError, pattern)
      }
    })
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('0023 FR-006: a mapping change is picked up by a rebuild, with the roots watched', async () => {
  const { tmp, project, file } = await tempWorkspace([{ name: 'p', path: '..', priority: 100 }])
  const second = path.join(tmp, 'second', 'skills', 'beta')
  await fs.mkdir(second, { recursive: true })
  await fs.writeFile(path.join(second, 'SKILL.md'),
    '---\nname: beta\ndescription: A second probe skill for the rescan test.\n---\n\nBody.\n')
  try {
    const mode = resolveMode(['--workspace', project], {})
    await inMode(mode, async () => {
      await buildIndex()
      assert.equal(stats().total, 1)

      await fs.writeFile(file, JSON.stringify({ sources: [
        { name: 'p', path: '..', priority: 100 },
        { name: 'second', path: path.join(tmp, 'second'), priority: 50 },
      ] }))
      await buildIndex()
      assert.equal(stats().total, 2, 'Rescan re-reads the workspace file — no restart')
      assert.ok(watchedRoots().includes(path.join(tmp, 'second')),
        '0009\'s follow-up generalised: a root added to the file must become watched')

      // The workspace file's own directory is watched even though `..` is the root above it —
      // here it is inside, so the set must not grow a duplicate.
      assert.equal(new Set(watchedRoots()).size, watchedRoots().length)

      await fs.writeFile(file, JSON.stringify({ sources: [{ name: 'p', path: '..' }] }))
      await buildIndex()
      assert.equal(stats().total, 1, 'and a removed source leaves')
    })
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('0023 FR-007: workspace.json is a watched input', async () => {
  assert.equal(isRelevant('workspace.json'), true)
  assert.equal(isRelevant(path.join('.claude', 'workspace.json')), true)
  // The reason it must be: like sources.json under 0009, it changes the corpus with no artifact
  // changing. A watcher that ignored it would leave the index stale until a manual Rescan.
  const watcher = await repoFile('src/watcher.js')
  assert.match(watcher, /0023/, 'the watcher must say why this file is an input')
})

test('0023 FR-008: the two modes cannot share a snapshot', async () => {
  const library = snapshotPath(LIBRARY_MODE)
  const a = snapshotPath(resolveMode(['--workspace', '/tmp/one'], {}))
  const b = snapshotPath(resolveMode(['--workspace', '/tmp/two'], {}))

  assert.match(library, /index\.json$/)
  assert.notEqual(a, library, 'a workspace run must not overwrite the library cache')
  assert.notEqual(a, b, 'two workspaces must not share one cache')
  assert.match(a, /workspaces[/\\][0-9a-f]{8}\.json$/)
  // Stable across calls: a key that moved would silently orphan the cache every boot.
  assert.equal(a, snapshotPath(resolveMode(['--workspace', '/tmp/one'], {})))
  // This is not cosmetic. §10 serves the snapshot BEFORE the startup rescan, so a shared file
  // means the library's first paint shows a workspace's few sources as the whole library.
  const server = await repoFile('src/server.js')
  assert.ok(server.indexOf('resolveMode') < server.indexOf('loadSnapshot'),
    'the mode must be resolved before any snapshot is read, or the wrong cache is adopted')
})

test('0023 FR-009/FR-010: library mode reports no workspace, so the client can branch', async () => {
  await inMode(LIBRARY_MODE, () => {
    const s = stats()
    assert.equal(s.mode, 'library')
    assert.equal(s.workspaceName, null)
    assert.equal(s.workspaceFile, null)
    assert.match(s.configPath, /sources\.json$/)
  })

  // The screens 0017 worried about must state the frame rather than imply it (FR-010).
  const app = await repoFile('public/app.js')
  assert.match(app, /stats\.mode === 'workspace'/, 'the client reads the mode from stats')
  assert.match(app, /only copy in workspace/, '§5\'s most misreadable chip must qualify itself')
  assert.match(app, /workspaceNote/, 'the Dashboard and Duplicates must say whose numbers these are')
})

test('0023: the boot path exits rather than falling back to a wider corpus', async () => {
  // The boot half of FR-005 lives in server.js's top-level, which cannot be imported without
  // starting a server — so it is asserted against the source, as 0009's test does.
  const server = await repoFile('src/server.js')
  assert.match(server, /probe\.fatal/, 'the boot path must check the workspace file before serving')
  assert.match(server, /process\.exit\(1\)/, 'and exit rather than continue')
  assert.match(server, /sources\.json was deliberately not read/,
    'the message must say the fallback was refused, or the next reader will call it a bug')
  assert.match(server, /EADDRINUSE/, 'FR-011: a taken port must explain itself')
})

test('0023: the scan and validate stages never learn that modes exist', async () => {
  // tasks.md's boundary, as a test. A workspace is a source list; everything downstream of the
  // list receives a directory, exactly as before. If this fails, the seam has been crossed.
  for (const file of ['scan.js', 'classify.js', 'frontmatter.js', 'linker.js', 'resolver.js', 'validators.js']) {
    const text = await repoFile(`src/${file}`)
    assert.ok(!/workspace/i.test(text), `src/${file} must not know about workspaces`)
  }
})

test('0023 SC-006: the CLI validates the workspace when the environment names one', async () => {
  const { tmp, project } = await tempWorkspace([{ name: 'p', path: '..', priority: 100 }])
  try {
    const lines = []
    const errs = []
    const env = { DOTCLAUDE_WORKSPACE: project }
    try {
      const code = await validateCommand([], (l) => lines.push(l), (l) => errs.push(l), env)
      // One artifact, so exactly one verdict row plus the blank line and the contract line.
      assert.equal(lines.filter((l) => /^(PASS|WARN|FAIL)/.test(l)).length, 1,
        'the CLI must see the workspace corpus, not the machine-wide one')
      assert.match(lines.at(-1), /^VERDICT: (PASS|FAIL)$/, 'SC-003 still holds in workspace mode')
      assert.ok(code === 0 || code === 1)
    } finally {
      setMode(LIBRARY_MODE)
    }

    // A workspace the CLI cannot read must gate with FAIL, never a green run over an empty index.
    await fs.writeFile(path.join(project, '.claude', 'workspace.json'), 'nope')
    const out2 = []
    const err2 = []
    try {
      const code = await validateCommand([], (l) => out2.push(l), (l) => err2.push(l),
        { DOTCLAUDE_WORKSPACE: project })
      assert.equal(code, 1)
      assert.equal(out2.at(-1), 'VERDICT: FAIL')
      assert.match(err2.join('\n'), /not valid JSON/)
    } finally {
      setMode(LIBRARY_MODE)
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

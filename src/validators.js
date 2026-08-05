// §6 validation. Numbering is dotclaude's own (record 0004); rules are sourced from the
// real `validate-skill` (class S) and `validate-agent` (class A). Structural checks are
// implemented here rather than shelled out to validate.py (record 0013).

// §6 artifact classes.
export function classOf(type) {
  if (type === 'skill' || type === 'command') return 'S'
  if (type === 'agent') return 'A'
  return 'R' // rule, memory — no upstream checklist exists (0004)
}

// D10 is enforced by construction, not by trusting each check to behave: a heuristic
// literally cannot express a 0 through these constructors.
const full = (note) => ({ score: 2, note })
const partial = (note) => ({ score: 1, note })
const fail = (note) => ({ score: 0, note })
const na = (note) => ({ score: null, note })

/**
 * A heuristic's score is clamped to a floor of 1. This is the single place D10 lives, so
 * a future validator cannot bypass it by returning 0 directly.
 */
function heuristic(result) {
  if (result.score === 0) return { ...result, score: 1, clamped: true }
  return result
}

const MANUAL = na('needs review — judgment, not automatable')

// Validator 5's lexicon. §6 calls for exact phrases: a heuristic guess must never reach a
// FAIL, so only unambiguous identity-distortion phrasing belongs here.
const IDENTITY_PHRASES = [
  'act human',
  'pretend to be human',
  'you are human',
  "never reveal you're an ai",
  'never reveal you are an ai',
  'do not reveal you are an ai',
  'never admit you are an ai',
  "world's best",
  'worlds best',
  'you are the best',
]

const VAGUE_WORDS = ['appropriate', 'appropriately', 'as needed', 'when needed', 'as necessary', 'if necessary', 'properly', 'reasonable', 'suitable']
const NEGATION_STARTS = /\b(?:never|don't|do not|avoid|must not|should not|no longer)\b/gi
const FILLER = ['be helpful', 'be accurate', 'be concise', 'do your best', 'try your best', 'be professional']
const OUTPUT_WORDS = ['output', 'format', 'return', 'respond with', 'schema', 'json', 'verdict', 'report', 'emit']
const FAILURE_WORDS = ['if ', 'when ', 'error', 'fail', 'missing', 'cannot', 'unable', 'fallback', 'otherwise', 'edge case']
const TIME_SENSITIVE = /\b(?:v?\d+\.\d+\.\d+|20\d{2}-\d{2}-\d{2}|iphone\s?\d{1,2}|xcode\s?\d+|node\s?\d{2})\b/i

/**
 * Run §6 over one artifact.
 * @returns {{verdict: 'PASS'|'WARN'|'FAIL', manualPending: boolean, checks: Array}}
 */
export function validateArtifact(artifact, index) {
  const cls = classOf(artifact.type)
  const body = artifact.body ?? ''
  const lines = body.split('\n')
  const description = artifact.description ?? ''
  const checks = []

  const add = (id, title, mode, result) => checks.push({ id, title, mode, ...result })

  // --- Structural pre-checks (deterministic, 0013) ---
  add('structural', 'Structural', 'deterministic',
    structuralChecks(artifact, cls))

  // --- 1 Overlap (deterministic) — same type + name in the same scope ---
  //
  // "Overlap" means two *distinct authored artifacts* competing for one name. Several
  // cached versions of one plugin skill, or a cache copy beside its marketplace copy, are
  // one artifact at different versions — M3 already models those as a cluster. Counting
  // them here made validator 1 fire on 57% of the corpus and pushed 60% of artifacts to
  // FAIL, which is a broken gate rather than a finding.
  // Byte-identical copies are also excluded — a git worktree under a registered source
  // duplicates the whole tree, and `ai-dev-harness/.claude/worktrees/…` alone accounted
  // for 80 of these. What remains is the real thing: two same-named artifacts in one
  // source whose *content differs*, where a reader cannot tell which is authoritative.
  const sameScope = (index?.byTypeName?.get(`${artifact.type}/${artifact.name}`) ?? []).filter(
    (o) =>
      o.id !== artifact.id &&
      o.source === artifact.source &&
      !sameAuthoredArtifact(artifact, o) &&
      o.hash !== artifact.hash,
  )
  add('1', 'Overlap', 'deterministic',
    sameScope.length
      ? fail(`${sameScope.length} other ${artifact.type}(s) named "${artifact.name}" in source "${artifact.source}"`)
      : full('no same-scope name collision'))

  // --- 2 Precision (heuristic) ---
  const vague = VAGUE_WORDS.filter((w) => body.toLowerCase().includes(w))
  add('2', 'Precision', 'heuristic', heuristic(
    vague.length > 2 ? partial(`vague without a threshold nearby: ${vague.slice(0, 4).join(', ')}`) : full('instructions read concretely')))

  // --- 3 Intent preservation (manual) ---
  add('3', 'Intent preservation', 'manual', MANUAL)

  // --- 4 + 14 Length & context budget (deterministic) ---
  add('4+14', 'Length & context budget', 'deterministic', lengthCheck(lines, description, cls))

  // --- 5 Identity distortion (deterministic) ---
  const hay = `${description}\n${body}`.toLowerCase()
  const hit = IDENTITY_PHRASES.find((p) => hay.includes(p))
  add('5', 'Identity distortion', 'deterministic',
    hit ? fail(`exact phrase present: "${hit}"`) : full('no identity-distorting phrasing'))

  // --- 6 Negative triggers (heuristic) ---
  //
  // The rationale in the real checklist is specific: negative triggers "prevent
  // over-firing when similar skills coexist". So the check only bites when similar
  // artifacts actually exist. Warning on every description without one fired on 62% of
  // the corpus — §6's own bar calls that wrong, not merely noisy.
  const hasNegativeTrigger = /\b(?:do not use|don't use|not for|do NOT use|instead use|use .* instead|rather than)\b/i.test(description)
  const siblings = index?.byPrefix?.get(namePrefix(artifact.name))?.length ?? 0
  add('6', 'Negative triggers', 'heuristic', heuristic(
    cls === 'R'
      ? na('rules and memory have no description contract')
      : !description
        ? partial('no description, so no negative trigger')
        : hasNegativeTrigger
          ? full('description says when NOT to fire')
          : siblings >= 3
            ? partial(`${siblings} artifacts share the "${namePrefix(artifact.name)}-" prefix and this one does not say when NOT to fire`)
            : full('no similar artifacts nearby, so no over-firing risk')))

  // --- 7 Testability (manual) ---
  add('7', 'Testability', 'manual', MANUAL)

  // --- 8 Positive framing (heuristic) ---
  const negations = (body.match(NEGATION_STARTS) ?? []).length
  const replacements = (body.match(/\b(?:instead|rather than|do this|use)\b/gi) ?? []).length
  add('8', 'Positive framing', 'heuristic', heuristic(
    negations > 4 && replacements < negations / 3
      ? partial(`${negations} negations with few stated replacements`)
      : full('negations pair with an action to take')))

  // --- 9 Example–rule consistency (manual) ---
  add('9', 'Example–rule consistency', 'manual', MANUAL)

  // --- 10 Precedence (manual) ---
  add('10', 'Precedence', 'manual', MANUAL)

  // --- 11 Failure paths (heuristic) ---
  const failureSignals = FAILURE_WORDS.filter((w) => body.toLowerCase().includes(w)).length
  add('11', 'Failure paths', 'heuristic', heuristic(
    failureSignals >= 3 ? full('failure handling present') : partial('little sign of failure handling')))

  // --- 12 Output contract (heuristic) ---
  const outputSignals = OUTPUT_WORDS.filter((w) => body.toLowerCase().includes(w)).length
  add('12', 'Output contract', 'heuristic', heuristic(
    outputSignals >= 2 ? full('output shape is described') : partial('no explicit output contract')))

  // --- 13 Redundancy (heuristic) ---
  const filler = FILLER.filter((f) => body.toLowerCase().includes(f))
  add('13', 'Redundancy', 'heuristic', heuristic(
    filler.length ? partial(`filler the model follows by default: ${filler.join(', ')}`) : full('no obvious filler')))

  // --- 15 Terminology (manual) ---
  add('15', 'Terminology', 'manual', MANUAL)

  // --- 16 Time-sensitive content (heuristic, added by 0004) ---
  const stale = body.match(TIME_SENSITIVE)
  add('16', 'Time-sensitive content', 'heuristic', heuristic(
    stale ? partial(`hardcoded version or date: "${stale[0]}"`) : full('nothing time-sensitive')))

  return summarize(checks)
}

/**
 * §6's structural pre-check, one row with three outcomes (0015). "Malformed" and "valid YAML
 * beyond §3's subset" are different findings and only the first may score 0 — a well-formed
 * artifact must never score 0 for a limitation of dotclaude's own parser.
 */
function structuralChecks(artifact, cls) {
  const problems = []
  if (artifact.parseError) problems.push('frontmatter does not parse')
  if (cls !== 'R') {
    if (!/^[a-z0-9][a-z0-9./-]*$/.test(artifact.name.replace(/^\//, ''))) {
      problems.push('name is not kebab-case')
    }
    // 0020: the authority's cap. Zero artifacts violate it today — it is here for the one
    // written next week, and because §6 names validate-skill/validate-agent as the authority
    // for these rules and 0013 made mirroring them the standing rule.
    if (artifact.name.length > 64) {
      problems.push(`name is ${artifact.name.length} characters (cap 64)`)
    }
    if (artifact.type === 'skill') {
      const folder = artifact.path.split('/').slice(-2, -1)[0]
      if (folder && folder !== artifact.name) problems.push(`name does not match folder "${folder}"`)
    }
    // 0020: an agent's name must match its filename — the analogue of the skill folder rule,
    // and the gap that audit found. `validate-agent`: "`name` | Must match the agent's
    // filename (without `.md`)". Deliberately NOT adopted from the same table: the reserved
    // word list (it would fail claude-md-improver and two other skills that are *about*
    // Claude) and the plugin-name prefix (one organisation's convention; dotclaude indexes
    // unrelated folders by §1's premise).
    if (artifact.type === 'agent') {
      const file = artifact.path.split('/').at(-1)?.replace(/\.md$/, '')
      if (file && file !== artifact.name) problems.push(`name does not match filename "${file}"`)
    }
  }
  // A defect in the artifact scores 0. Malformed wins if both apply, so a broken file cannot
  // hide behind the softer outcome.
  if (problems.length) return fail(problems.join('; '))

  // A limit of this parser scores 1 — WARN, never FAIL. Produced through the same `partial`
  // constructor the heuristic clamp uses, so this outcome cannot express a 0 either (D10).
  if (artifact.beyondSubset) {
    return partial(`frontmatter parses, but part of it is beyond §3's subset — ${artifact.beyondSubset}`)
  }

  return full('frontmatter, name and folder agree')
}

function lengthCheck(lines, description, cls) {
  const problems = []
  if (lines.length >= 500) problems.push(`body is ${lines.length} lines (cap 500) — move detail to references/`)
  if (cls !== 'R' && !description) problems.push('no description in frontmatter')
  return problems.length ? fail(problems.join('; ')) : full(`${lines.length} lines, description present`)
}

/** §6 verdict chip. FAIL only from a deterministic 0 — D10. */
function summarize(checks) {
  const scored = checks.filter((c) => c.score !== null)
  const deterministicZero = checks.some((c) => c.mode === 'deterministic' && c.score === 0)
  const anyOne = scored.some((c) => c.score === 1)

  return {
    verdict: deterministicZero ? 'FAIL' : anyOne ? 'WARN' : 'PASS',
    // §6: the suffix stays until the judgment validators are reviewed, and v1 never
    // stores a review (D11, §11), so it is always pending.
    manualPending: checks.some((c) => c.mode === 'manual'),
    checks,
  }
}

/** First `-`-separated segment of a name — `ios-visual-acceptance` → `ios`. */
export function namePrefix(name) {
  return String(name).replace(/^\//, '').split('-')[0]
}

/**
 * Are these two rows the same authored artifact, differing only by plugin version or by
 * cache-vs-marketplace location? Used by validator 1 so a versioned cache is not read as
 * an authoring collision.
 */
function sameAuthoredArtifact(a, b) {
  if (!a.plugin || !b.plugin) return false
  return a.plugin.plugin === b.plugin.plugin && a.plugin.marketplace === b.plugin.marketplace
}

/** Cross-artifact index the validators need (validators 1 and 6). */
export function buildValidationIndex(artifacts) {
  const byTypeName = new Map()
  const byPrefix = new Map()
  for (const a of artifacts) {
    const key = `${a.type}/${a.name}`
    if (!byTypeName.has(key)) byTypeName.set(key, [])
    byTypeName.get(key).push(a)

    // Count distinct *names* per prefix, not copies — five cached copies of one skill are
    // not five similar skills.
    const prefix = namePrefix(a.name)
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, new Set())
    byPrefix.get(prefix).add(a.name)
  }
  return {
    byTypeName,
    byPrefix: new Map([...byPrefix].map(([k, set]) => [k, [...set]])),
  }
}

export function validateAll(artifacts) {
  const index = buildValidationIndex(artifacts)
  return artifacts.map((a) => ({ ...a, validation: validateArtifact(a, index) }))
}

# 0015 — Nested frontmatter, and a structural check that stops blaming well-formed files · `feat/nested-frontmatter`

**Record:** `docs/decisions/0015-support-one-level-of-nested-frontmatter.md` (Accepted 2026-07-29). Its remedy and its rejected alternative are settled; this plan implements them and does not re-open them.

**Spec:** §3 *Parsing* (the YAML subset, the never-dropped rule, numbers-stay-strings), §6 *Automation split* → "Structural pre-checks" row and the verdict chip, D10 (false-FAIL policy). Constraints carried in: `0013` (structural checks are native JS, no Python at runtime), `0004` (validator numbering is dotclaude's own), `0014` (spec-kit layered over the existing structure; §1–§13 stays whole), `0006` (publishing).

**Branch:** `feat/nested-frontmatter`, cut from **`main`**. `git branch --merged main` lists `feat/spec-kit-adoption`, so the 10 `.claude/skills/speckit-*/SKILL.md` artifacts this record is about are already on `main` — confirmed: `grep -rn "^metadata:" .claude/skills/` returns exactly those 10 files. No branching from the feature branch is needed.

**Baseline measured before any edit:** `npm test` → 60 tests, 60 pass, 0 fail.

## Goal

Two changes, one task:

1. `src/frontmatter.js` learns **one level of nested mapping**. Two levels degrade to raw text with a note, never a crash and never an error.
2. `src/validators.js` splits the structural pre-check so **malformed** and **beyond subset** are different outcomes. Only malformed may score 0.

Everything else follows from those two: the spec sections `0015` lists, the chip that names the new outcome, the stats counter that makes it measurable, and the tests.

## Why this is not a `specs/###-<slug>/` feature

`0014` answer 2: the design spec stays whole and `specs/###-<slug>/` starts forward at the §12 roadmap. This is an **amendment to v1 §3 and §6**, so it travels the existing route — decision record, `docs/plans/<topic>.md`, one branch — and writes no `specs/` directory. What spec-kit does contribute here is `/speckit-analyze`, which takes `docs/decisions/` as an input and can check the thing this task is most likely to get wrong: an accepted record whose *"Spec sections to update"* was never applied. Run it after the code and the spec edits are in, before asking for the merge.

## 1 · `src/frontmatter.js` — one nesting level

Today `readIndentedValue()` recognises three shapes under a bare `key:` — a dash list, a quoted scalar opening on the next line, and "anything else", which it keeps as raw joined lines and reports as the problem `nested block kept raw`. That problem string is the whole defect: it lands in `error`, which `pipeline.js` stores as `parseError`, which the structural check reads as `frontmatter does not parse`.

**Shape recognition.** Compute the base indent as the minimum indent of the owned lines. Then:

| Owned lines at base indent | Outcome |
|---|---|
| all `- ` items | list of scalars — unchanged |
| opens with `"` or `'` | folded quoted scalar — unchanged |
| all match `KEY_LINE` | **nested map** (new) |
| a mix of `- ` items and `key:` pairs | **malformed** — this is not valid YAML either; keep it an `error` |
| nothing | `null` — unchanged |

**Scalar coercion is extracted, not duplicated.** The top-level loop's value handling — quoted → unquoted, `[…]` → inline list, `true`/`false` → boolean, everything else → `stripComment(value)` as a **string** — moves into one `scalar()` helper that both levels call. This is the guard against `version: 3.10` becoming `3.1`: there is one coercion path, and it has no numeric branch at either depth. Block scalars and multi-line quoted continuations stay top-level features; they are not re-implemented inside the nested map.

**Two levels deep — degrade, never crash.** A nested key whose value is empty, or which is followed by lines indented deeper than the base, is depth 2. That key's value becomes the raw joined deeper lines, and the parser records a **beyond subset** note. It does not throw, does not set `error`, and does not consume the keys that follow the block — the `next` pointer still advances past exactly the owned lines, which is the bug class the returning-pointer tests exist to catch.

**Return shape.** `parseFrontmatter()` returns `{data, body, error, beyondSubset}`. `error` keeps its current meaning — malformed, the file is a parse error. `beyondSubset` is a joined note string or `null`. Existing callers that destructure only `error` keep working unchanged.

**Names.** One term per concept (`CLAUDE.md` → Terminology): the two outcomes are **malformed** and **beyond subset**, in the parser field, the validator note, the spec, the chip and the tests. No second word for either.

## 2 · `src/validators.js` — the structural split

`structuralChecks()` gains one outcome and no new check id. It stays the single `structural` row of §6's table, deterministic, with three possible results:

| Condition | Constructor | Score | Effect on the verdict |
|---|---|---|---|
| `parseError` set, or name not kebab-case, or name ≠ folder, or length problem | `fail()` | 0 | **FAIL** (deterministic zero) |
| none of the above, `beyondSubset` set | `partial()` | 1 | **WARN** — `summarize()` already returns WARN for any score of 1 |
| neither | `full()` | 2 | PASS-eligible |

Malformed wins if both are somehow set, so a genuinely broken file cannot hide behind the softer outcome.

**D10 is untouched and stays enforced by construction.** The new outcome is produced by the existing `partial()` constructor, which cannot express a 0 — the same mechanism that makes the heuristic clamp unbypassable. No heuristic gains a path to 0, and the only checks that may still emit 0 are the deterministic ones §6 already names. What widens is D10's *scope in practice*, exactly as `0015` states: no well-formed artifact may score 0 for a parser limitation. D10's §1 row wording is unchanged, so **§1 is not edited by this task** — the "update the §1 table" step of the decision procedure does not apply here, and a later session should not add one.

**Downstream, so the split is visible and countable:**

- `src/pipeline.js` — carry `beyondSubset` onto the artifact beside `parseError` (`parse()`, and the count at `pipeline.js:149`).
- `src/indexer.js` — a `beyondSubset` counter alongside `parseErrors` (`indexer.js:137/145/158`).
- `src/server.js` — the boot lines at `server.js:278/284` report both, so the acceptance numbers are readable from a single `npm start`.
- `public/app.js` — the `parse error` chip and the raw-`<pre>` body branch stay keyed on `parseError` and are unchanged for malformed files. A file that parses but is beyond subset gets a `chip chip-warn` reading `beyond subset` and renders its markdown normally. The 10 speckit skills therefore stop showing a raw body — a side effect of parsing correctly, not a separate change.

Keeping the FAIL chip meaning one thing is the point `0015` used to reject the prose-only alternative; letting `beyond subset` reuse the parse-error chip would re-introduce exactly that ambiguity.

## 3 · Spec edits — same task, same commit

`0015`'s "Spec sections to update", applied in this task rather than deferred:

- **§3 *Parsing*, the "verified at M1" bullet.** Replace the "appear zero times" claim with what is now true: M1's survey of 946 blocks found zero nested maps in 577 artifacts; adopting spec-kit (`0014`) added 10 counterexamples from one upstream author; **one level of nested mapping is supported**; two levels degrade to raw text and are reported as beyond subset; lists-of-maps and flow mappings remain unsupported. Keep the numbers-stay-strings sentence and note it holds at both depths.
- **§3 *Parsing*, the malformed bullet.** Split it in two: malformed → indexed, body raw, `parse error` chip, structural 0 (unchanged). Valid YAML beyond the subset → indexed, body rendered, `beyond subset` chip, structural 1, never 0.
- **§6 *Automation split*, "Structural pre-checks" row.** Record the split and its scores, keeping `0013`'s wording that `validate-skill` / `validate-agent` remain the authority for the rules. Add the D10 consequence in one sentence: no well-formed artifact may score 0 for a parser limitation.
- **§6 verdict chip** needs no edit — "WARN — any score of 1" already covers the new outcome.
- **§1** — no edit (see above). **`docs/decisions/0015-*.md`** — no edit; it is Accepted and the log is append-only.

## 4 · Acceptance bar — this shape, not M1's

M1's "done when" was verified against a corpus containing zero nested maps, so re-running it proves nothing here. This task is done when all of the following have been run and their numbers recorded in this file's Results section:

**Parser, by test**
1. The exact speckit block — `metadata:` / `author: "github-spec-kit"` / `source: "templates/commands/analyze.md"` — yields `data.metadata.author === 'github-spec-kit'`, `data.metadata.source` set, `error === null`, `beyondSubset === null`.
2. Nested scalars follow the same rules as top-level ones: `version: 3.10` stays the string `'3.10'` **inside** a nested map, `true` becomes a boolean, `[a, b]` becomes a list.
3. Two levels deep: no throw, `error === null`, `beyondSubset` set, the deeper text preserved rather than dropped.
4. A nested map does not swallow the sibling keys after it (`metadata:` block followed by `name: x` — both present).
5. Mixed `- ` items and `key:` pairs at one indent is **malformed**, not beyond subset.
6. The four existing §3 frontmatter tests pass **unmodified** — they are the regression guard for the 946-block corpus.
7. One filesystem-backed test reads a real `.claude/skills/speckit-*/SKILL.md` off disk and asserts `metadata.author` parses. This is the test whose absence let `0015` happen: every other frontmatter test uses a literal.

**Validator, by test**
8. A beyond-subset artifact scores **1** on `structural` and its verdict is **WARN**.
9. A malformed artifact still scores **0** on `structural` and still **FAILs**.
10. The existing two D10 tests pass unmodified, plus one addition: no artifact whose frontmatter parses may score 0 on `structural`.

**Corpus, by running the app** (`npm start`, http://127.0.0.1:4114)
11. Parse errors return to **0**, with the total still **591**. A drop in the total means the parser started dropping files — a stop-and-fix, not a pass.
12. Per-type counts are unchanged against the pre-change boot line.
13. The 10 speckit skills expose `metadata` and no longer fail structurally. Verified per artifact page, not only in aggregate.
14. The FAIL/WARN/PASS distribution over 591 is recorded and compared to `0013`'s 39/471/71 over 581. Expectation: FAIL drops by the 10 speckit skills; anything else that moves gets explained before the merge.
15. A deliberately malformed file dropped into a registered source still gets its chip, still scores 0, and the app still boots.

**Suite and budget**
16. `npm test` green: 60 → ~69 tests, none of the existing 60 removed or weakened, including the three governance tests (constitution non-negotiables, `CLAUDE.md` 100-line cap, `AGENTS.md` symlink).
17. `grep -rn "specify" src/ test/ public/` returns nothing — §10's zero-dependency budget and `0014`'s literal check. Nothing under `src/` references `.specify/`.
18. `CLAUDE.md` stays ≤ 100 lines (this task adds no rule to it).

## Risks, named

- **A hand-rolled parser gaining a level is where regressions hide.** Mitigation: the four existing §3 tests stay byte-identical, and acceptance items 11–12 compare the whole corpus before and after rather than trusting the unit tests.
- **Scope creep into a YAML library.** Forbidden by §10's zero dependencies. If one level genuinely cannot express a real corpus shape, that is `0016`, not a quiet `npm install`.
- **The two-outcome structural check invites a third.** It does not get one in this task. Length, kebab-case and folder mismatch stay 0 — they are defects in the artifact, not limits of the tool.
- **`0015` turning out to be wrong under implementation.** Per the decision-first rule: stop, write record `0016`, get approval. Do not steer around it in code.

## Sequence

1. Extract `scalar()`; add nested-map recognition and the depth-2 degrade; add `beyondSubset` to the return. Tests 1–7.
2. Split `structuralChecks()`; thread `beyondSubset` through `pipeline.js`, `indexer.js`, `server.js`, `public/app.js`. Tests 8–10.
3. Apply the §3 and §6 edits.
4. Run `npm test`, then `npm start`; record items 11–15 and the distribution in a Results section here.
5. `/speckit-analyze` for record-to-spec consistency; read its findings before asking for the merge.
6. Commit referencing `0015`. Rollback is a single-commit revert — every change is additive.

## Publishing (`0006`)

No remote, no push, no remote creation — not at any step of this task. The merge is a `--no-ff` merge into `main` whose commit body is the PR description (what shipped, the numbers, defects found, what is carried forward), performed **only when Reza asks** and **only after the app has been run from `main`**, not from this branch. The branch is kept after merging.

## Results

### The corpus, before and after

| | before | after |
|---|---|---|
| artifacts | 591 | **591** |
| by type | `agent 36, skill 540, memory 13, command 1, rule 1` | **identical** |
| parse errors | 10 (all 10 speckit skills) | **0** |
| beyond subset | — | **0** |
| FAIL · WARN · PASS | 49 · 471 · 71 | **39 · 481 · 71** |

FAIL returns to `0013`'s 39 over 581, and the 10 skills move to WARN on their heuristics like any other artifact. PASS is unchanged, so nothing was quietly promoted. All 10 report `structural` score **2** and expose `metadata.author` = `github-spec-kit` plus `metadata.source`.

### Acceptance items

1–10 **by test**, all passing. `npm test`: **60 → 70 tests, 70 pass, 0 fail**; none of the existing 60 removed or weakened, the four §3 frontmatter tests byte-identical, the three governance tests green.

11–13 **by running the app** — the table above, read from the boot line and `/api/index`.

14 The distribution is explained: exactly the 10 speckit skills moved, FAIL → WARN.

15 **Two probe artifacts** were dropped into the `dotclaude` source and rescanned live:

- *malformed* (unterminated frontmatter, a dash item where a key belongs) → `parseError` set, `structural` **0**, verdict **FAIL**, `parse error` chip, app kept serving.
- *two levels deep* (`metadata:` → `nested:` → `two:`) → `error` **null**, `structural` **1**, verdict **WARN**, note `nesting deeper than one level kept raw under "nested"`. `metadata.author` parsed, the depth-2 text kept as raw text, and `version: 3.10` came back as the **string** `"3.10"` through the live pipeline, not only in a unit test.

16–18 `npm test` green; `grep -rn "specify" src/ test/ public/` returns **0 lines**; `CLAUDE.md` untouched and inside its budget.

### Two things found on the way

- **A snapshot bump was needed and was not in the plan.** `src/snapshot.js` gained `SNAPSHOT_VERSION 6 → 7`. A version-6 snapshot records the 10 skills as parse errors, so without the bump a boot would serve stale FAIL chips until the startup rescan finished — the exact wrong answer this record exists to remove, arriving through the cache instead of the parser. The version guard already existed for this; it just had to be used.
- **`/speckit-analyze` cannot run on this task, and that is structural.** Its step 1 runs `check-prerequisites.sh --require-tasks`, which aborts without a `specs/###-<slug>/` feature dir holding `spec.md`, `plan.md` and `tasks.md`. Verified, not assumed: the script exits 1 with *"Feature directory not found"*. `0014` answer 1 credits `/speckit-analyze` with turning *"an accepted record's 'Spec sections to update' was never applied"* into a checkable finding — that capability is real but **only inside a feature dir**, so it does not reach v1 amendments like this one. Checked by hand instead: every item under `0015`'s "Spec sections to update" and "Verification" is applied above. This is a limit worth its own record if it should change; `0015` itself is not wrong, so no `0016` was written.

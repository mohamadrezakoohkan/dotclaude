# v1 milestone plan

Implements decision record `0002`. Read with spec §1 (D1–D14) and §11 (non-goals) open.

**Shape.** M0 is a walking skeleton — the thinnest end-to-end slice that touches every §10 architectural box. M1–M7 are vertical slices: each one ships a capability the whole way from filesystem to screen, rather than completing a layer. Rationale and sources are in `0002`.

**This file is a map, not a substitute for per-task plans.** Each milestone is one task: fresh session, its own `docs/plans/<topic>.md` written and approved before any code, one branch, one merge. `<topic>` matches the branch's topic segment (`feat/index-pipeline` → `docs/plans/index-pipeline.md`).

**Before M0:** E1 (`git init`) and E2 (`AGENTS.md` symlink) from `0002` are blockers — the branch and commit rules below are unenforceable without them.

## Sequence

| # | Milestone | Branch | Spec sections | Unlocks |
|---|-----------|--------|---------------|---------|
| M0 | Walking skeleton | `feat/walking-skeleton` | §10, §3 (row 1), §2, §8 | every later milestone |
| M1 | Index pipeline | `feat/index-pipeline` | §2, §3, §13 | M2, M3, M4 |
| M2 | Knowledge graph | `feat/knowledge-graph` | §4, D4, D5 | M5 (`is:orphan`, `is:unresolved`) |
| M3 | Resolution & duplicates | `feat/resolution` | §5, D8, §8 | M5 (`is:duplicate`), M7 signature |
| M4 | Validation | `feat/validation` | §6, D9, D10 | M5 (`is:fail`) |
| M5 | Browse, search, dashboard | `feat/browse-and-search` | §7, §8 | M7 |
| M6 | Freshness | `feat/freshness` | §3 (freshness), §10, D3, D11 | — |
| M7 | Design system pass | `feat/design-system` | §9, §8 | v1 done |

---

## M0 — Walking skeleton · `feat/walking-skeleton`

**Goal.** One hard-coded local source → scan → classify `**/SKILL.md` only → in-memory index → HTTP + static SPA → list → click → raw body. Every §10 box present and thin; no frontmatter parser, no linker, no validator, no watcher.

**Spec:** §10 (one process, API surface, trust boundary), §3 (classification row 1 only), §2 (single `local` source), §8 (Artifact page, minimal).

**Done when** `bun run` serves localhost:4114, the real `~/.claude` skills list, and clicking one renders its body. Record in the per-task plan: artifact count and scan wall time — the first real numbers about the corpus.

**Also lands here:** the §9 color tokens as CSS variables. Cheap now; prevents a repaint-everything task at M7.

## M1 — Index pipeline · `feat/index-pipeline`

**Goal.** All six §3 classification rows; plugin auto-tag and `plugin-name:artifact-name` alias; ignore list, depth cap 10, symlink cycle guard; the YAML-subset frontmatter parser; parse-error chip; multi-source config with `priority`; missing-path error chip that still boots.

**Spec:** §2 (full sources table), §3 (classification, parsing), §13 (port, priority defaults, platform prefixes).

**Done when** every real source indexes; per-type counts match a manual `find` spot-check; a deliberately malformed frontmatter file is indexed with a chip and crashes nothing; a configured missing path shows an error chip and the app still starts.

**Empirical output — record it.** The list of YAML shapes actually present in the corpus. If a shape needs support beyond §3's stated subset, that is a spec change: stop and write a record (decision-first rule).

**Decided at M0, no record needed:** M1 indexes every artifact on disk, including stale plugin cache versions — `~/.claude/plugins/cache/…/shared/` holds four. §10's "truth is always the filesystem" forbids hiding files that exist, so the index does not filter by `installed_plugins.json`. Which copy is *active* is a separate question, and it belongs to the D8 record at M3.

## M2 — Knowledge graph · `feat/knowledge-graph`

**Goal.** Backtick-token extraction from description + body; D5 resolution order (`/token` → commands; plain token → skill then agent; both → disambiguation popover); alias resolution; automatic backlink inversion; orphans; unresolved references; self-links excluded; extraction on raw markdown before rendering.

**Spec:** §4, D4 (backtick-only), D5 (ambiguity).

**Done when** a known real pair links both ways — `ios-visual-acceptance` ↔ `android-visual-acceptance`, the example §8 uses in its own screen sketch — that page's backlink count is non-zero, and the unresolved-reference list has been read by hand for false positives.

**Named risk.** If backtick-only linking yields a near-empty graph on the real corpus, the fault is D4, not the linker. Do not widen matching in code — write the record.

## M3 — Resolution & duplicates · `feat/resolution`

**Goal.** Content hash; shadowing vs cross-repo duplicate as two distinct labelled situations; winner by highest `priority` with alphabetical tiebreak flagged "tie — set priorities"; identical vs diverged chips with differing-line count; unified diff with whitespace normalization and jump-to-next-change; Duplicates view ordered diverged-first.

**Spec:** §5 (all), D8 (declared precedence, never emulated), §8 (Diff view, Duplicates view).

**Done when** real iOS/Android skill pairs appear as clusters with correct drift status, and one diverged pair's line count is verified by hand against `diff`. "Make identical" is not offered anywhere (D11, §11).

## M4 — Validation · `feat/validation`

**Goal.** Structural pre-checks; deterministic validators 1, 5, 4+14; heuristics for 2, 6, 8, 11, 12, 13; manual validators listed greyed as "needs review"; verdict chip with `· manual pending` suffix; "Copy validation prompt" emitting body + checklist + the exact `VERDICT: PASS|FAIL` contract.

**Spec:** §6 (all), D9 (wired to `validate-ai-instructions`), D10 (false-FAIL policy).

**Done when** the PASS/WARN/FAIL distribution over the real corpus has been reviewed; a test proves no heuristic can produce FAIL (D10 is enforced, not just documented); the copied prompt matches the checklist's output contract exactly; no verdict is persisted (D11, §11).

**Acceptance bar for heuristics:** WARN must be *actionable*, not *rare*. If a heuristic WARNs on most of the corpus it is not tuned — it is wrong, and §6's automation split needs a record.

## M5 — Browse, search, dashboard · `feat/browse-and-search`

**Goal.** Frontmatter-default search, instant and client-side; `body:`, `type:`, `tag:`, `source:`, `is:duplicate`, `is:fail`, `is:orphan`, `is:unresolved`; the §7 ranking ladder with recency inside a rank; explicit vs auto tag chips; OR-within-facet / AND-across-facet filtering; Tags view with counts; Dashboard health panel; ⌘K palette; filters persisted in the URL hash.

**Spec:** §7 (all), §8 (Dashboard, Browse, Tags view, palette, keyboard map).

**Done when** each operator returns correct results against the real corpus, ranking order is verified on a deliberately ambiguous query, and every empty/error state matches §8's table verbatim — including the zero-result copy, which the spec calls part of the design.

**Depends on** M2 (`is:orphan`, `is:unresolved`), M3 (`is:duplicate`), M4 (`is:fail`).

## M6 — Freshness · `feat/freshness`

**Goal.** Recursive watcher → ~500 ms debounce → one full re-index; SSE ping and refetch; the quiet "Library updated" toast; JSON snapshot for instant startup; Rescan endpoint; open-in-editor restricted to paths inside registered sources; localhost-only bind.

**Spec:** §3 (freshness), §10 (persistence, trust boundary), D3, D11.

**Done when** a git branch switch in a watched repo produces **exactly one** re-index (verified from logs, not by feel); a file created inside a directory that did not exist when the watch started is detected (the Bun v1.3.14 case cited in `0002`); open-in-editor refuses a path outside every registered source; the server binds localhost only.

**Why last, not first.** Freshness is the only capability whose absence blocks nothing — M0–M5 use the Rescan button. Its one architectural risk (recursive watch over post-watch directories) was retired by search in `0002`, so sequencing it late costs nothing.

## M7 — Design system pass · `feat/design-system`

**Goal.** Both themes complete from the §9 token table; the three type roles and the 13/14/16/22/28 scale; radii 12/8/full and the 4px spacing grid; the **Resolution bar** on every artifact page as the signature element; 150 ms fades only; `prefers-reduced-motion` respected; Clay focus ring always visible; OS theme with manual toggle; narrow-window collapse to the palette.

**Spec:** §9 (all), §8 (screens, keyboard map).

**Done when** light and dark are both verified, the Resolution bar renders on *every* artifact page with source pill → mono path → precedence position → effective/shadowed → Diff, reduced-motion is honoured, and the full keyboard path works: ⌘K, ↑/↓, enter, `d`, `e`.

---

## After M7 — spec-kit adoption (record `0008`)

Not a milestone; a process change that starts only once M7 is merged. Write `docs/plans/spec-kit-adoption.md`, then **stop and wait for Reza's explicit go-ahead** before running `specify init`. The plan must answer where `docs/decisions/` lives inside spec-kit's structure (it has no equivalent), whether spec §1–§13 fragments into `specs/###-feature/` or stays whole, and what happens to `CLAUDE.md` when `/speckit.constitution` claims the same ground. Do not create `.specify/` before M7 is done.

**Done 2026-07-29,** on `feat/spec-kit-adoption`. `specify init --here --integration claude --force` ran once, adding 10 skills and `.specify/`; no tracked file was overwritten. Record `0014` fixes the four answers — the log stays at `docs/decisions/`, the spec stays whole, `CLAUDE.md` outranks the constitution, Q1–Q3 survives. Adoption also found a §3 defect: spec-kit's own frontmatter uses the nested map §3 states appears zero times, taking the corpus from 0 parse errors in 581 artifacts to 10 in 591. Record `0015` accepts the fix; **its implementation is the next task** and wants its own branch and plan.

## v1 is done when

M0–M7 are merged, the app indexes every real source on this machine, and the founding question — *is this the copy Claude actually loads?* — is answerable on any artifact page without leaving it.

**Reached 2026-07-29.** All eight milestones merged. 581 artifacts across 16 sources; the Resolution bar carries complete data on all 581 pages and states `installed` where Claude Code's own manifest declares it. Eleven decision records were written during build (`0003`–`0013`), of which seven corrected the spec against the real corpus — the reason `0002` chose to build rather than keep designing.

## Out of scope

§11 non-goals hold throughout: no in-app editing, no creating or running skills, no "make identical", no multi-user or auth, no full precedence emulation, no stored manual verdicts. §12 items (CLI `validate`, remote git sources, MCP server) are v1.5/v2/v3 — D12 already fixed the source contract so v2 needs no rework.

## Open risks carried into build

| Risk | Milestone it surfaces | If it fires |
|---|---|---|
| YAML shapes exceed §3's subset | M1 | Record — §3 parsing |
| Backtick-only linking yields a near-empty graph | M2 | Record — D4 |
| Heuristic validators WARN on most artifacts | M4 | Record — §6 automation split |
| Priority defaults produce surprising "effective" winners | M3 | Config change first (§13 says it is safe); record only if the D8 model itself is wrong |
| **Fired at M0 —** artifact ids are not unique on the real corpus | M0 | `0003` written, fix implemented, acceptance pending |
| **Fired at M0 —** the app shows a stale plugin copy: `installed_plugins.json` declares the active `installPath` and version, and M0 opens 3.1.8 while ios runs 3.3.0 | M0, must be resolved by M3 | Record at M3 against D8 — reading a declaration file is not the precedence emulation D8 forbids, but it changes D8's model |
| **Fired at M0 —** the `validate-ai-instructions` 15-point checklist named by D9 and `CLAUDE.md` does not exist; only `validate-skill` (8 items) and `validate-agent` (13) are real | M0, shapes M4 | `0004` written with the full 15-validator mapping, acceptance pending. Settled before M1 deliberately, since §6's numbering had no source |
| Plugin cache accumulates versions without pruning, so artifact count grows with every plugin update (`shared` already has four) | M1 counts, M3 clusters | Not a defect — but any "how many artifacts" figure must say whether stale cached versions are counted |

The first three are the reason `0002` exists: they are unanswerable in markdown and cheap to answer in code. The next three fired on the first day of build, which is the same argument holding.

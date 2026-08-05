# M4 — Validation · `feat/validation`

**Spec:** §6 (all 16 validators, automation split, verdict chip, Claude handoff), D9 as amended by `0004`, D10 (false-FAIL policy), D11 / §11 (no stored verdicts).

## Goal

Structural pre-checks; deterministic validators 1, 5, 4+14; heuristics for 2, 6, 8, 11, 12, 13; validator 16 (time-sensitive content, added by `0004`); manual validators listed greyed as "needs review"; verdict chip with `· manual pending`; "Copy validation prompt" emitting body + checklist + the exact `VERDICT: PASS|FAIL` contract.

## The D10 constraint drives the design

Only deterministic checks may score 0. A heuristic may score 2 or 1 and **never** 0. Rather than trusting each check to behave, scores are produced through a typed constructor that *cannot* express a 0 for a heuristic — the policy is enforced by construction, then proven by a test that walks every validator and asserts no heuristic can reach 0 on any input. §6's own bar applies too: a WARN that fires on most of the corpus is wrong, not merely noisy.

## Decision taken here: structural pre-checks are reimplemented, not shelled out

`0004`'s follow-up said M4 must call the real `validate.py`. **Not doing that**, and this reverses that follow-up:

- It would add a Python 3 runtime prerequisite to an app whose §10 budget is zero dependencies and whose `0005` runtime contract is the Node/Bun intersection.
- It would mean spawning a process per artifact — 581 of them — against an in-memory index that rebuilds on every change (D2, M6's watcher).
- The checks themselves are four lines of logic: frontmatter parses, kebab-case name, name matches folder, length cap. The value in `validate.py` is its *rules*, which `0004` already transcribed into §6.

Recorded as `0013` rather than left as a silent deviation.

## Done when

The PASS/WARN/FAIL distribution over the real corpus has been reviewed; a test proves no heuristic can produce FAIL; the copied prompt matches the checklist's output contract exactly; no verdict is persisted.

## Results

**FAIL 39 · WARN 471 · PASS 71** over 581 artifacts.

### D10 is enforced by construction and proven by test

Heuristic scores pass through one clamp, so a heuristic literally cannot express a 0. The test drives seven hostile inputs — empty body, vague-word soup, negation-only prose, pure filler, hardcoded versions, a 50,000-character body — through every validator and asserts no heuristic reaches 0. A second test asserts that when FAIL *is* returned, every 0 behind it is deterministic.

### Calibration: the first run was a broken gate, not a finding

| Run | FAIL | Validator 1 fires | Validator 6 fires |
|---|---|---|---|
| first | 347 (60%) | 57% | 62% |
| after calibration | **39 (7%)** | **4%** | **48%** |

Both fixes came from the rationale, not from moving a threshold:

- **Validator 1** was counting several cached versions of one plugin skill, and byte-identical git-worktree copies, as name collisions. An "overlap" means two *distinct authored artifacts* competing for one name; copies are not that. Now it fires only when same-source same-named artifacts have **differing content** — 24 real cases.
- **Validator 6** was warning whenever a description lacked a negative trigger. The real checklist's rationale is narrower: negative triggers "prevent over-firing when similar skills coexist". It now fires only when ≥3 artifacts share the name prefix, so the check bites where the ambiguity actually exists.

Per-validator rates are the actionable numbers: 6 at 48%, 12 at 40%, 11 at 37%, 8 at 18%, 16 at 15%, then a long tail at ≤4%. **WARN is the majority verdict (81%)**, which is a fact about the corpus rather than a miscalibration — most real skills genuinely do not declare an output contract or failure paths. The individual rates are what a reader acts on, and none of them fires on everything.

FAIL breakdown: 24 genuine same-source overlaps, 8 agents whose frontmatter `name` is a display name rather than kebab-case (`Brand Guardian`, `UX Architect`), 7 oversized bodies or missing descriptions.

### Done when

- Distribution reviewed — above, and it drove two calibration changes.
- **A test proves no heuristic can produce FAIL** — two tests, one by hostile input, one by verdict provenance.
- **The copied prompt matches the output contract exactly** — `VERDICT: PASS|FAIL` is asserted to be the *final line*. The first draft put the artifact body last, which buried the contract under 400 lines of someone else's markdown; body now comes first, contract last.
- **No verdict is persisted** — asserted by a test that greps `src/validators.js` for any write call, not just by intent.

45 assertions pass.

### Decision recorded

`0013` reverses `0004`'s follow-up: structural pre-checks are implemented in JS rather than shelling out to `validate.py`. Calling it would add a Python runtime prerequisite against §10's zero-dependency budget and `0005`'s runtime contract, and mean 581 process spawns per re-index for four lines of logic. The cost — drift if `validate.py` gains a rule — is noted in the record and belongs to `/speckit.analyze` after M7.

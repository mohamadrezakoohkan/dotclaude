# Tasks: Companion CLI — `validate`

**Feature**: `001-cli-validate` | **Branch**: `feat/cli-validate` | **Date**: 2026-08-04

**Inputs**: [spec.md](./spec.md), [plan.md](./plan.md), [contracts/cli.md](./contracts/cli.md), [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

## Boundary

- `src/validators.js` is **unchanged** — FR-005. The CLI reads `validation.verdict`; it never re-derives §6's gate rule.
- Nothing is written, anywhere — FR-010, D11.
- No dependency, no build step, no flag parser — §10.

---

## Phase 1: Contract first

- [X] T001 Write `contracts/cli.md` before any code — argv, exit codes, the stdout shape, and the guarantees the tests must hold it to. A feature whose entire value is a contract should not discover that contract while implementing it

## Phase 2: Foundational

- [X] T002 Create `src/cli.js` with `runValidate(artifacts, argv, out, err)` as the testable core — no `buildIndex`, no DOM, injectable output — and `validateCommand()` as the thin wrapper that builds the index first
- [X] T003 Derive the contract lines from `VERDICT_CONTRACT` in `src/prompt.js` rather than restating them, so a change there cannot leave the CLI printing yesterday's contract
- [X] T004 Add the `validate` npm script (FR-012), so CI never depends on a path into `src/`

## Phase 3: User Story 1 — Gate a PR (P1) 🎯 MVP

- [X] T005 [US1] Exit 0 / 1 from the verdict alone, reading `validation.verdict` (FR-003, FR-005)
- [X] T006 [US1] Print the contract as the unconditional last line, with nothing after it (FR-002, SC-003)
- [X] T007 [US1] Build the whole index even for one path, so validators 1 and 6 keep cross-artifact context (FR-006, SC-004)
- [X] T008 [P] [US1] Tests: contract-line-is-last across four corpus shapes; FAIL gates and WARN does not; several artifacts with one failing produce one non-zero exit and every verdict reported

## Phase 4: User Story 2 — Say why (P2)

- [X] T009 [US2] Expand each FAIL with the failing validator's id, title and note (FR-007)
- [X] T010 [US2] `SKIP` for an existing non-artifact, an error for an unreadable path, and only the latter gates (FR-008, FR-009)
- [X] T011 [P] [US2] Tests: the failing validator is named; a heuristic that did not cause the FAIL is not listed as the reason; `package.json` skips without gating; a missing path gates and is named on stderr

## Phase 5: Polish & verification

- [X] T012 Test that the gate rule is **read, not reimplemented** — assert `src/cli.js` does not import the validators and does not call `summarize()`
- [X] T013 **SC-001** — compare the CLI's FAIL set against the app's, same-moment and by id
- [X] T014 **SC-006** — confirm the working tree and `.dotclaude-cache/` are untouched by a run
- [X] T015 **SC-007** — diff Node and Bun output for the same paths
- [X] T016 Run the mixed changed-file case that CI will actually produce
- [X] T017 Record results in `quickstart.md` as evidence-at-a-moment, not as acceptance bars

---

## Results — 2026-08-04

All tasks complete. `npm test` and `bun test`: **91 pass, 0 fail** under each (84 → 91).

Verification is tabulated in [quickstart.md](./quickstart.md). The results that mattered:

- **SC-001 held, but only after the measurement was fixed.** The first comparison said the app had 41 FAILs and the CLI 39. Two instruments were wrong before the system was suspected: `awk '{print $2}'` truncated six artifact names containing spaces, and — the real cause — the app was serving a **snapshot from the previous evening**, because §10 has the server answer immediately and rescan behind it. After the rescan, both reported 39, **identical by id**.
- That produced the feature's most useful finding, now in `quickstart.md` and the module header: **the CLI is the instrument to trust**, because it has no cache. A verification that curls `/api/index` right after `npm start` may be reading yesterday.
- **SC-007** gave byte-identical stdout and exit codes under Node and Bun.
- **SC-006** held: nothing written, cache mtime unchanged.

### Deviations and corrections

1. **`runValidate` was extracted after the first draft.** The original `validateCommand` called `buildIndex` inline, which would have forced every test through a ~3 s corpus scan — slow, and non-deterministic because the corpus drifts. Splitting the core from the index build is why the seven CLI tests run in under a millisecond each.
2. **A test of mine was wrong and punished a good habit.** `assert.ok(!cli.includes('summarize'))` failed because the module header *names* `summarize()` to point readers at the single source of truth — exactly the comment that should exist. Replaced with an assertion on the import, which is the real signal. Third time this session an assertion of my own making was the defect.
3. **Cosmetic fix found by running it**: the structural pre-check's id *is* its title lowercased, so the reason line read `structural Structural — …`. Numbered validators read `1 Overlap`. Now the id is omitted when it duplicates the title.
4. **Four planning documents, not six.** `research.md` and `data-model.md` are absent because nothing was unknown that §6, §10, §12 and `0019` had not fixed, and the feature introduces no entity. `002-folder-scope` needed six to prove the flow; repeating that for every v1.x row is the ceremony `0018`'s bar exists to resist.

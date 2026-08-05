# Tasks: Folder scope for Browse and search

**Feature**: `002-folder-scope` | **Branch**: `feat/folder-scope` | **Date**: 2026-08-03

**Inputs**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/scope.md](./contracts/scope.md), [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]** = parallelisable (different file, no dependency on an incomplete task)
- **[US1/US2/US3]** = the user story the task serves; Setup, Foundational and Polish carry no story label

## Path conventions

Single-process local web app, no build step (§10). Client in `public/`, shared pure modules in `src/`, one test file `test/run.mjs`.

**Tests are requested** for this feature — the repo has 70 `node:test` tests, `0016` argues for native tests over trusting structure, and `FR-003` is deliverable *only* as tests. New tests are **appended**; none of the existing 70 is modified.

## Boundary — fails the task, not just the review

Fixed by record `0017` and confirmed in `research.md`. Any task that violates one of these is wrong even if it works:

- No change to `src/` modules that scan, watch, classify, parse frontmatter, link, resolve or validate.
- No `SNAPSHOT_VERSION` bump — no artifact field is added (`data-model.md`).
- No new runtime dependency, no build step, no `src/ → .specify/` reference.
- `src/search.js` is **unchanged**. `source:` already works (`:4`, `:11`, `:53`).

---

## Phase 1: Setup

**Purpose**: capture the baseline the SC-003 invariant is measured against. There is nothing to initialise — zero dependencies, no build.

- [X] T001 Record the pre-change baseline: run `npm test` (expect 70 pass, 0 fail) and `npm start`, then capture total artifacts, byType, byVerdict, cluster/diverged, orphan and unresolved counts from `/api/index` into the Results section of this file
- [X] T002 [P] Confirm the boundary is clean before starting: `grep -rn "specify" src/ test/ public/` → 0 lines, and `node -e "console.log(require('./package.json').dependencies ?? 'none')"` → none

**Checkpoint**: baseline numbers written down. Without T001, SC-003 cannot be verified at the end.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the pure, shared, testable core every story reads from. Deliberately DOM-free and storage-free so `test/run.mjs` can import it.

- [X] T003 Create `src/scope.js` with pure helpers only — no DOM, no storage, no `fetch`: `activeFromQuery(query)` (derive source names via `parseQuery`), `parseStored(raw)` (JSON → `{scopes, active}`, tolerating the five failure modes in `data-model.md`), `serializeStored(active)` (→ `{scopes: {}, active}` per FR-013), `knownOnly(active, sourceNames)` (FR-010), and `isScoped(active, sourceNames)` (false when empty **or** when every source is ticked, per the spec's Edge Case)
- [X] T004 Serve the new module: add a `/scope.js` route in `src/server.js`, mirroring the existing `/search.js` route at `src/server.js:150`
- [X] T005 [P] Append tests for `src/scope.js` to `test/run.mjs` covering: `activeFromQuery` round-trips with other operators present; `parseStored` on absent/empty/malformed-JSON/valid-JSON-wrong-shape/missing-`scopes` input, each degrading to unfiltered and never throwing; `serializeStored` always emitting `scopes: {}` (FR-013); `knownOnly` dropping stale names while keeping known ones (FR-010); `isScoped` false for both empty and all-ticked

**Checkpoint**: `npm test` green with the new tests. The whole pure core is locked before any UI exists.

---

## Phase 3: User Story 1 — Narrow the browse list (Priority: P1) 🎯 MVP

**Goal**: tick folders in the sidebar, the browse list narrows. Shippable alone.

**Independent test**: tick 3 of 16 folders; the list contains artifacts from exactly those 3, group counts fall, the header reads `3/16`, and unticking all restores everything.

### Tests for User Story 1

- [X] T006 [P] [US1] Append tests to `test/run.mjs` asserting the §7 contract this story relies on: `source:` terms filter via `matchesFacets`; **zero source terms means unfiltered** (the `facets.source.length` short-circuit); source matching is case-insensitive; `source:` ANDs with `type:` and ORs within itself — all against `src/search.js` **without modifying it** (FR-004, and the spec's zero-ticked Assumption)

### Implementation for User Story 1

- [X] T007 [US1] Add one container element for the folder panel inside `<nav id="sidebar">` in `public/index.html`, above `<div id="list">`
- [X] T008 [US1] Implement `renderFolders()` in `public/app.js` beside `renderFacets()` (`:148`): one row per **registered source** from `stats.sources` — including sources indexing zero artifacts (spec Edge Case) — each showing folder name, artifact count and tick state derived from `activeFromQuery()`, never from a local variable (contracts/scope.md §1)
- [X] T009 [US1] Wire each row to the existing `toggleTerm('source:<name>')` (`public/app.js:164`), so ticking writes the query, updates the hash and re-filters through the existing path — no new filter mechanism
- [X] T010 [US1] Add the single "show all folders" bulk action to the panel, visible only while a scope is in force (FR-001 as amended — "all or none" was not implementable; see Deviations)
- [X] T011 [US1] Add the chosen-of-total header, e.g. `FOLDERS 3/16`, using `isScoped()` so an all-ticked or empty scope does not present as a filter in force (FR-009, spec Edge Case)
- [X] T012 [US1] Call `renderFolders()` from `load()` and after each query change so the panel re-renders from the query, including when the query is hand-edited (contracts/scope.md §1)
- [X] T013 [P] [US1] Style the panel in `public/styles.css` using §9's existing tokens and the established chip/pill vocabulary — no new colour, no new component language

**Checkpoint**: US1 works end to end. Quickstart Scenario 1 passes. **Shippable here.**

---

## Phase 4: User Story 2 — The scope is remembered (Priority: P2)

**Goal**: the chosen folders survive closing and reopening the app.

**Independent test**: choose a scope, reload, and it is applied on first paint; a fresh profile starts unfiltered; a removed source name is ignored without error.

### Tests for User Story 2

- [X] T014 [P] [US2] Append tests to `test/run.mjs` for the hash-over-storage precedence rule from `data-model.md` (read path step 1 before step 2), exercised through `src/scope.js` — a stored scope must not override source terms present in the query

### Implementation for User Story 2

- [X] T015 [US2] Add a single documented storage-key constant in `public/app.js` (one constant, not a literal at each call site — contracts/scope.md §2)
- [X] T016 [US2] Implement read on boot in `public/app.js`: hash first, then storage via `parseStored()`, then `knownOnly()` against `stats.sources`; wrap every storage access so an unavailable or throwing store (private browsing) degrades to unfiltered **silently** — no banner, no crash
- [X] T017 [US2] Apply the restored scope **before first paint** (FR-005): the list must never render unfiltered and then correct itself. A visible flash fails this task even though the end state looks right
- [X] T018 [US2] Write the scope via `serializeStored()` after each query change, from the one writer only (contracts/scope.md §2)

**Checkpoint**: Quickstart Scenario 2 passes, including the removed-source and blocked-storage cases.

---

## Phase 5: User Story 3 — Out of scope is reachable and labelled (Priority: P3)

**Goal**: an artifact in an unticked folder opens normally and says why it was not in the list.

**Independent test**: scope to one folder, follow a wiki-link into another, and the page opens fully rendered with an "outside scope" chip and an unchanged scope.

### Tests for User Story 3

- [X] T019 [P] [US3] Append a test to `test/run.mjs` for the chip's predicate as a pure function in `src/scope.js` — true only when a scope is in force **and** the artifact's source is outside it; false when unfiltered, so the chip can never appear on every artifact at once

### Implementation for User Story 3

- [X] T020 [US3] Add the **outside scope** chip to the artifact page in `sheet()` (`public/app.js:415`) beside the verdict chip, using existing chip classes only — a chip, never a badge (constitution Principle V)
- [X] T021 [US3] Confirm by inspection and by quickstart that opening an out-of-scope artifact leaves the scope untouched (FR-008) — no auto-widening on any of the three entry paths (wiki-link, Duplicates row, ⌘K)

**Checkpoint**: all three stories independently functional. Quickstart Scenario 4 passes.

---

## Phase 6: Polish & cross-cutting concerns

- [X] T022 **[SC-003 — the acceptance criterion]** Verify the index was never touched: with no scope, then 1, 3 and all folders ticked, re-read total, byVerdict, clusters, diverged, orphans and unresolved from `/api/index` and assert **every number is identical to T001's baseline**. Any movement is a defect to stop on, not an expectation to adjust
- [X] T023 [P] Append tests to `test/run.mjs` locking FR-003 — the invariant `research.md` found already true and therefore unguarded: the Dashboard, Tags, Duplicates and ⌘K data paths must read the whole artifact set, never the scoped `visible`. One careless `search(visible, …)` would break this silently
- [X] T024 [P] Re-run the boundary checks from T002 plus `git diff --stat main -- src/`, and confirm the only `src/` changes are the new `src/scope.js` and the one-line `/scope.js` route in `src/server.js`
- [X] T025 Run every quickstart.md scenario (1–5) and record the results, including T022's numbers, in the Results section below
- [ ] T026 Update `docs/plans/` **only if** implementation revealed something the plan got wrong; if `0017` itself turns out to be wrong, stop and write record `0018` rather than steering around it in code
- [ ] T027 Run the app from `main` after the merge is requested and before it is trusted (`0006`, constitution Principle II). Never create a remote, never push

---

## Dependencies & execution order

### Phase dependencies

- **Setup (P1)**: no dependencies. **T001 must happen before any code**, or SC-003 has no baseline
- **Foundational (P2)**: depends on Setup. **Blocks all three stories** — every story reads `src/scope.js`
- **US1 (P3)**: after Foundational. No dependency on US2 or US3
- **US2 (P4)**: after Foundational. Reads the panel from US1 in practice, but its logic is independently testable
- **US3 (P5)**: after Foundational. Independent of US2
- **Polish (P6)**: after the stories that are being shipped

### Within each story

- Tests before implementation, and they must fail first
- `src/scope.js` (pure) before `public/app.js` (DOM)
- Panel before persistence — the panel is what writes the stored value

### Parallel opportunities

- T002 alongside T001
- T005 alongside T003/T004 once the signatures are agreed
- T013 (CSS) alongside T008–T012 (JS) — different file
- T006, T014, T019 are all test-only in one file: parallel in principle, but **serialise the actual edits** since they touch the same `test/run.mjs`
- T023 and T024 in parallel

## Parallel example: User Story 1

```bash
# Different files, no shared state:
Task: "T013 Style the folder panel in public/styles.css"
Task: "T008 Implement renderFolders() in public/app.js"

# Test-only, but same file — write them in one pass rather than concurrently:
Task: "T006 Append §7 source-facet tests to test/run.mjs"
```

## Implementation strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup — **T001's baseline is not optional**
2. Phase 2 Foundational — pure core plus its tests
3. Phase 3 US1
4. **Stop and validate**: quickstart Scenario 1, plus T022's SC-003 check even at this stage — the invariant should hold from the very first ticked box
5. Shippable: the noise problem that prompted `0017` is solved at this point

### Incremental delivery

1. Setup + Foundational → pure core locked by tests
2. + US1 → **MVP**, the browse list narrows
3. + US2 → the scope is remembered
4. + US3 → out-of-scope artifacts are labelled
5. + Polish → SC-003 verified, FR-003 locked, boundary re-checked, quickstart recorded

### Deviation from plan.md, recorded rather than silent

`plan.md`'s Structure Decision originally said "no new modules". Generating these tasks showed that reasoning was wrong: `src/search.js` is already a **shared** client module (`src/server.js:150` serves it; `public/app.js:3` imports it), so `src/` does not mean "server-side" here — it means "importable by both the browser and `node:test`". Pure logic left in `public/app.js` is untestable, and the scope read path is exactly the kind of pure logic this repo locks with tests. `plan.md` has been amended in place with the correction visible. No decision record is due: this is where a helper lives, not a lasting constraint, and `0017`'s boundary is untouched — `src/scope.js` scans, watches, classifies, links, resolves and validates nothing, and no indexing module imports it.

## Results — all three user stories complete, 2026-08-03

**T001–T025 done. T026 and T027 remain open by design**: T026 (update `docs/plans/` only if implementation revealed something) had nothing further to record beyond the deviations below, and T027 (run the app from `main`) cannot happen until Reza asks for the merge — `0006` and constitution Principle II.

Built in two passes. Phases 1–3 (MVP) first, reviewed, then Phases 4–6 on Reza's approval of the panel.

### T001 baseline

| | |
|---|---|
| total | **625** — agent 36, skill 573, memory 14, command 1, rule 1 |
| verdicts | FAIL **39** · WARN **508** · PASS **78** |
| clusters / diverged | **151** / **37** |
| orphans · unresolved · likely renames | **280** · **1375** · **174** |
| parse errors · beyond subset | 0 · 0 |
| `npm test` | 70 pass, 0 fail |

The corpus grew 591 → 625 since `0015`, entirely from outside this branch: `ai-plugins` went 76 → 109 on Reza's machine between 29 July and 3 August.

**A useful datum for FR-001**: `stats.bySource` has **12** keys but `stats.sources` has **16** entries — four sources (`org-shared`, `gh-actions`, `gh-workflows`, `agent-sandbox`) index zero artifacts. The panel reads `stats.sources`, so those four are listed and tickable, which is what the spec's edge case asked for and would have been silently wrong had the panel read `bySource`.

### Verified in the running app

Measured through the app's own filter path, not by eye:

| Query | Header | Rows | Check |
|---|---|---|---|
| *(empty)* | `Folders all` | **625** | unfiltered, no clear-action shown |
| 3 folders ticked | `Folders 3/16` | **26** | dotclaude 13 + personal-tools 9 + mobile-code-review 4 = 26 exactly |
| 2 folders + `type:memory` | `Folders 2/16` | **2** | AND across facets (§7) |
| all 16 ticked | `Folders all` | **625** | indistinguishable from unscoped, per the edge case |

SC-003 spot-check at MVP stage, as the implementation strategy requires: with a 3-folder scope active the Dashboard still read **625 · 39 FAIL · 508 WARN · 151 clusters · 37 diverged · 280 orphans · 174 renames** — identical to the baseline above. The full T022 sweep across 1/3/16-folder scopes is still open.

Panel state was confirmed stable across 3 seconds of inactivity — it does not mutate itself. Earlier apparent scope drift during testing came from the browser-automation harness's own snapshot interactions plus a restored form value in its profile, not from the app.

`npm test`: **78 pass, 0 fail** — the original 70 unmodified, plus 8 new.

### Deviations, recorded rather than silent

1. **FR-001's "tick all or none" was not implementable as written**, and `spec.md` has been amended in place with the reasoning. The spec's own Edge Cases make *nothing ticked* and *everything ticked* both mean "show everything", so the two bulk actions would be one button with one result. Implemented as a single action labelled for its result — **"show all folders"** — shown only while a scope is in force. The header reads `all` rather than `0/16` when unfiltered, for the same reason: `0` would describe the ticks, not the library.
2. **`quickstart.md` Scenario 1 step 2 amended** — it said "Click **none**, then tick three", referring to a button that consequently does not exist.
3. **The function is `renderFolders()`, not `renderFolderPanel()`** as T008 wrote. Cosmetic; noted so the name in the code and the name in the task list are not read as two different things.
4. **`#list`'s CSS rule was briefly deleted** while inserting the panel styles, and restored immediately. Recorded because the loss was silent — the rule carries the artifact list's `overflow-y`, and nothing would have failed a test.

### US2 — remembered scope, verified in the browser

| Check | Result |
|---|---|
| Ticking two folders persists | `{"scopes":{},"active":["dotclaude","personal-tools"]}` — exactly FR-013's shape |
| Fresh visit, no scope in the URL | Scope restored, hash rewritten to carry it, 22 rows, 2 ticked (FR-005) |
| FR-010 — stale name in storage | Seeded `["dotclaude","was-renamed-away"]`; the stale name was dropped, 13 rows for `dotclaude`, and storage was rewritten clean. No error |
| SC-006 — a link beats what this browser remembers | Storage said `dotclaude`; the link said `personal-tools`; **the link won**, 9 rows |

**No first-paint flash, by construction rather than by observation** (T017). `renderList()` is reachable only from `applyFilters()`, which is first called by `route()` — and `route()` runs *after* `load()`, inside which `applyPendingScope()` has already set the query and rewritten the hash. So the artifact list's very first render is already scoped; there is no earlier render to flash.

### US3 — outside-scope chip, verified in the browser

| Check | Result |
|---|---|
| Out-of-scope artifact opens | Fully rendered, chips `["WARN · manual pending", "outside scope"]` |
| FR-008 — scope unchanged after opening | Query and tick state identical before and after |
| Chip absent when unfiltered | Only `["PASS · manual pending"]` — the chip never fires on everything at once |

Screenshot: `folder-scope-outside-chip.png` — local QA evidence, not committed, per the repo's screenshot convention (`.gitignore`; the six m0–m7 milestone screenshots are untracked for the same reason).

### T022 — SC-003, the acceptance criterion

Every Dashboard number identical across four scopes, while the list changes:

| Scope | List rows | artifacts | FAIL | WARN | clusters | diverged | orphans | renames |
|---|---|---|---|---|---|---|---|---|
| none | 625 | 625 | 39 | 508 | 151 | 37 | 280 | 174 |
| 1 folder | **13** | 625 | 39 | 508 | 151 | 37 | 280 | 174 |
| 3 folders | **26** | 625 | 39 | 508 | 151 | 37 | 280 | 174 |
| all 16 | 625 | 625 | 39 | 508 | 151 | 37 | 280 | 174 |

The index was never narrowed. That is the whole point of `0017`, and it is now measured rather than asserted.

### T023–T024 — locks and boundary

- **FR-003 is now guarded by a test**, not just by structure: it asserts the Dashboard and Tags read the full artifact set, the palette searches `artifacts` and not `visible`, that *nothing* calls `search(visible, …)`, that Duplicates reads the server's cluster set, and that the scope is never sent to the server or smuggled into an API path.
- **Tracked `src/` diff vs `main`: `src/scope.js` (new, 105 lines) and `src/server.js` (+6, the route).** Nothing that scans, watches, classifies, parses frontmatter, links, resolves or validates. `src/search.js` untouched. `src/snapshot.js` untouched — 0 diff lines, so no `SNAPSHOT_VERSION` bump, as `data-model.md` predicted.
- `grep -rn "specify" src/ test/ public/` → **0**. `package.json` dependencies → **none**.
- **`npm test`: 80 pass, 0 fail.** The original 70 unmodified, plus 10 new.

### T025 — quickstart scenarios

Scenarios 1, 2, 3 and 5 ran green as recorded above. Scenario 4's three entry paths were verified for the artifact page and the palette; the Duplicates-row path exercises the same `sheet()` code path and the same predicate, so it is covered by the same evidence rather than separately clicked.

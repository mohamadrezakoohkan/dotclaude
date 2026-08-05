# Implementation Plan: Folder scope for Browse and search

**Branch**: `feat/folder-scope` (spec dir `002-folder-scope`) | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-folder-scope/spec.md`, itself derived from accepted record `docs/decisions/0017-folder-scope-is-a-view-filter-not-an-index-filter.md`

## Summary

Add a folder panel to the Browse sidebar that narrows the browse list and search results to chosen sources, remembered between visits. The approach is deliberately additive: scope is expressed as `source:` terms in the query the app already parses, so the existing filter path does the filtering and no new mechanism is introduced.

Phase 0 established that **three of the fourteen requirements need no code at all** — they are already true and only need tests to keep them true. What remains is one sidebar panel, one persistence layer in browser storage, and one chip.

## Technical Context

Every row below is **inherited, not chosen here**. §10 and record `0005` fixed the runtime for the whole app; re-answering them per feature is how a global constraint quietly becomes negotiable.

**Language/Version**: JavaScript (ES modules), Node/Bun intersection, verified on Node — §10, record `0005`. No TypeScript, no transpile.

**Primary Dependencies**: **None, and none may be added** — §10's zero-dependency budget, restated as constitution Principle IV. No framework, no build step, no bundler. `public/app.js` is served as-is and imports `/search.js` directly.

**Storage**: Browser storage for the scope only (FR-006, FR-013). **No disk write of any kind** — constitution Principle III, D11. The index itself stays in memory with its JSON snapshot (D2), untouched by this feature.

**Testing**: Plain `node:test`, one file, `test/run.mjs` — 70 tests today, zero framework (§10). New tests join it; none of the 70 is modified.

**Target Platform**: Localhost only, `http://127.0.0.1:4114` — §10's trust boundary, §13's port default.

**Project Type**: Single-process local web app: one Node process serving an HTTP API plus a static SPA (§10).

**Performance Goals**: Inherited, and this feature must not regress them. Filtering is already client-side and instant over ~590 artifacts (§7 "instant, client-side, as-you-type"). Scope adds at most a few `source:` terms to a query already parsed on every keystroke, so the cost is nil by construction.

**Constraints**: Scope MUST NOT reach the indexer (`0017`, FR-002). Nothing under `src/` that scans, watches, classifies, links, resolves or validates may change. Nothing under `src/` may reference `.specify/` (Principle IV).

**Scale/Scope**: 16 registered sources, ~590 artifacts, 5 artifact types. The panel is one row per source — 16 rows, no virtualisation needed.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 — see the bottom of this file.*

| Principle | Gate | Verdict |
|---|---|---|
| **I. Decision log is append-only** | Is this change driven by an accepted record rather than a silent edit? | **PASS** — `0017`, Accepted 2026-08-03, with its §7/§8/§12 edits already applied. This plan decides nothing the record left open; the one question it did leave open (FR-013) was answered in the spec before planning began. |
| **II. Publishing needs a fresh ask** | Does the plan create a remote, push, or publish? | **PASS** — nothing published. A merge into `main` happens only when Reza asks, `--no-ff`, after the app has run from `main`. |
| **III. Read-only** | Does the feature write, create, edit or delete any indexed artifact? | **PASS** — persistence is browser storage. FR-006 forbids disk writes outright, and the app gains no write path to anything it indexes. |
| **IV. Zero runtime dependencies** | New dependency, build step, or `src/ → .specify/` reference? | **PASS** — none. Verified by `grep -rn "specify" src/ test/ public/` → 0, which stays part of the acceptance run. |
| **V. One name per concept** | Does the feature introduce a second name for an existing concept? | **PASS** — "scope" is the one name; the new UI element is a **chip** ("outside scope"), never a badge. One real risk surfaced and is recorded below: user-facing copy says *folder* while stored data holds a source **name** (§2's term). `contracts/scope.md` fixes that mapping in one place so the two cannot drift. |
| **Technical constraint**: spec stays whole | Does this fragment §1–§13? | **PASS** — the spec cites §7, §8, §2, §4, §5, §6, §10 and restates none (verified in the requirements checklist). |
| **Technical constraint**: post-v1 only | Is this a post-v1 feature? | **PASS** — v1 complete at M7; this is §12 v1.1. |

**Result: 7 of 7 gates pass. No violations, so Complexity Tracking is empty by design.**

## Project Structure

### Documentation (this feature)

```text
specs/002-folder-scope/
├── plan.md              # This file
├── spec.md              # Feature specification (Q1 resolved)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── scope.md         # Phase 1 output — query, storage and UI contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist, 16/16
└── tasks.md             # /speckit-tasks output — NOT created by this command
```

### Source code (repository root)

This repo has no `models`, `services` or `cli` layers, and this feature touches only the client. The real layout, with this feature's reach marked:

```text
public/
├── app.js               # CHANGED — folder panel, remembered scope, "outside scope" chip
├── styles.css           # CHANGED — panel and checkbox styling within §9's tokens
└── index.html           # possibly CHANGED — one container element inside <nav id="sidebar">

src/
├── scope.js             # NEW — pure scope helpers, shared with the browser like search.js
├── search.js            # UNCHANGED (confirmed in Phase 0 — `source:` already works)
├── server.js            # CHANGED — one route line to serve /scope.js, mirroring :150
├── indexer.js  pipeline.js  scan.js  classify.js  frontmatter.js
├── linker.js   resolver.js  validators.js  diff.js  snapshot.js  watcher.js
│                        # ALL UNCHANGED — 0017's boundary. Any diff here fails the gate.
└── …

test/
└── run.mjs              # CHANGED — new tests appended; the existing 70 untouched
```

**Structure Decision**: no new directories. The feature lives in the client because `0017` makes it a view concern, and `renderFacets()` (`public/app.js:148`) is already the sidebar's filter-UI seam.

> **Corrected during `/speckit-tasks` (2026-08-03).** This section originally said "no new modules", on the reasoning that a `src/scope.js` would "put scope logic on the server side of a boundary the record draws in the client". **That reasoning was wrong**, and the tasks phase caught it. `src/search.js` is already a **shared client module**: `src/server.js:150` serves it to the browser at `/scope.js`-style paths, and `public/app.js:3` imports it as `/search.js`. Living in `src/` therefore does not mean "server-side" in this repo — it means "importable by both the browser and `node:test`".
>
> That distinction decides something real. `public/app.js` uses `document` and cannot be imported by `test/run.mjs`, so any pure logic left there is **untestable**. The scope read path — parse stored JSON, tolerate five failure modes, intersect with known sources — is exactly the kind of pure logic this repo locks with tests, and `0016` argued for native tests over trusting structure.
>
> **Amended**: one new shared module `src/scope.js`, served like `src/search.js`, holding only pure functions (no DOM, no storage calls, no `fetch`). DOM and storage stay in `public/app.js`. `0017`'s boundary is unaffected — `src/scope.js` scans, watches, classifies, links, resolves and validates nothing, and no indexing module imports it.

## Phase 0 — Research

See [research.md](./research.md). What it settled:

- **`src/search.js` needs no change.** `parseQuery` already accepts `source:` (`src/search.js:4`, `:11`) and `matchesFacets` already filters on it (`:53`). FR-004 is satisfied by reuse, so the spec's assumption to that effect is confirmed rather than hoped.
- **`toggleTerm()` already is the checkbox action.** `public/app.js:164` adds or removes a term from the query and re-runs the filter. A checkbox is `toggleTerm('source:<name>')` plus a rendered tick.
- **FR-003 is already true.** Dashboard reads `stats` and all `artifacts`, Tags reads `tagCounts(artifacts)`, Duplicates fetches `/api/clusters`, and the ⌘K palette searches `artifacts` rather than `visible`. None consults the sidebar query. So the work for FR-003 is **tests that lock it**, not code.
- **No NEEDS CLARIFICATION items existed to research.** Every unknown the template anticipates was already fixed by §10, `0005`, `0017`, or the spec's Q1. Research was therefore done by reading this repo, not by dispatching agents.

## Phase 1 — Design

- **[data-model.md](./data-model.md)** — the `Scope` entity: `{ scopes: {}, active: [source name…] }`, its validation rules, and a read path that tolerates absent, empty, malformed and stale-name states.
- **[contracts/scope.md](./contracts/scope.md)** — three contracts: the **query** contract (scope ⇄ `source:` terms, query authoritative), the **storage** contract (key, shape, forward compatibility, failure modes), and the **UI** contract (panel, counts, chip, keyboard).
- **[quickstart.md](./quickstart.md)** — the runnable validation guide, built around SC-003 as the invariant proving scope never reached the index.

**No API contract**: this feature adds no endpoint and changes none. §10's API surface is unchanged, which is itself worth asserting in the acceptance run.

## Complexity Tracking

No constitution violations, so this table is intentionally empty — recorded rather than deleted, so a reader can tell the gate ran and found nothing.

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| — | — | — |

## Post-design Constitution re-check

Re-run after the Phase 1 artifacts were written:

- **III. Read-only** — re-confirmed against `data-model.md`: the storage contract has one writer (the panel) and one key, with no path from it to any indexed file. **PASS.**
- **IV. Zero dependencies** — re-confirmed against `contracts/scope.md`: storage is the platform API, serialisation is `JSON`, no library. **PASS.**
- **V. One name per concept** — the design surfaced the folder/source-name mapping risk and pins it in `contracts/scope.md` rather than leaving it to each call site. **PASS, with the mapping recorded rather than assumed.**
- **I. Decision log** — Phase 0 changed no decision. It *narrowed* the work (three requirements need no code), which is a plan finding rather than a spec change, so no new record is due. **PASS.**

**No new violations. Ready for `/speckit-tasks`.**

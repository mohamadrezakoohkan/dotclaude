# Phase 0 — Research: Folder scope

**Feature**: `002-folder-scope` | **Date**: 2026-08-03

## How this research was done, and why that matters

The plan template anticipates unknowns in Technical Context and a research task per unknown. **There were none.** Every field was already fixed by §10 and record `0005` (runtime, dependencies, platform), by record `0017` (the view/index boundary, the mechanism, the reach), or by the spec's answered Q1 (the stored shape). Inventing research tasks to fill a template section would have produced decisions that accepted records had already made — which is precisely the failure mode constitution Principle I exists to prevent.

So Phase 0 was spent on the one thing genuinely unknown: **how much of this feature already exists.** The answer changed the plan materially, and is the reason three requirements need no code.

## Finding 1 — `src/search.js` needs no change

**Decision**: reuse the `source:` operator exactly as implemented. Do not touch `src/search.js`.

**Rationale**: read directly from the code rather than assumed.

- `src/search.js:4` — `const OPERATORS = new Set(['body', 'type', 'tag', 'source', 'is'])`. `source` is already a recognised operator.
- `src/search.js:11` — `parseQuery` initialises `facets.source` and pushes lower-cased values into it.
- `src/search.js:53` — `if (facets.source.length && !facets.source.includes(artifact.source.toLowerCase())) return false`, inside `matchesFacets`, which the §7 comment documents as "OR within a facet, AND across facets".
- Empty `facets.source` short-circuits, so **zero ticked folders already means unfiltered** — the spec's Assumption and Edge Case need no special case. This is behaviour, verified by reading the guard, not a hope.
- `src/search.js:86` — the server's `body:` path calls the same `search()` with the same query, so a scope applies to server-side full-text results too, for free.

**Alternatives considered**: a dedicated `scopeOf()` filter applied after `search()`. Rejected — it would duplicate `matchesFacets`, break §8's URL-hash persistence (scope would live outside the query), and contradict FR-004's "single source of truth".

## Finding 2 — the checkbox action already exists

**Decision**: build each checkbox on the existing `toggleTerm()`.

**Rationale**: `public/app.js:164` already implements exactly the required semantics — split the query into terms, remove the term if present, add it if absent, write it back to the search input, and re-run `onSearchInput()` (which updates the hash via `history.replaceState` and re-filters). The type facets and `is:` flags at `public/app.js:148–161` already use it. A folder checkbox is `toggleTerm('source:<name>')` plus rendering a tick derived from the current query.

**Consequence for the design**: the checkbox has **no state of its own**. It renders from `parseQuery(searchEl.value).facets.source`. This is what makes the spec's "the checkboxes follow the query, never the reverse" edge case free rather than a synchronisation problem to solve.

**Alternatives considered**: a separate `scope` variable in the module, synchronised with the query. Rejected — two sources of truth, and the spec's hand-edited-query edge case becomes a bug waiting to happen.

## Finding 3 — FR-003 is already satisfied; it needs tests, not code

**Decision**: write no code for FR-003. Write tests that fail if a future change breaks it.

**Rationale**: each global surface was checked for whether it consults the sidebar query:

| Surface | Reads | Scope-affected today? |
|---|---|---|
| Dashboard | `stats` (server-computed) and all `artifacts` (`public/app.js:234`) | No |
| Tags view | `tagCounts(artifacts)` (`public/app.js:306`) | No |
| Duplicates view | `GET /api/clusters` | No |
| ⌘K palette | `search(artifacts, q)` — **`artifacts`, not `visible`**, with its own input | No |
| Browse list | `visible`, set by `applyFilters(q)` | Yes — the one surface that should be |

`visible` is the only scoped collection, and only the browse list renders from it. So FR-003 holds by construction.

**Why this still needs work**: "true today by accident of structure" and "guaranteed" are different things. The invariant is one careless `search(visible, …)` away from breaking, and the failure would be silent — a FAIL count that quietly excludes folders is exactly the confidently-wrong number `0015` and `0016` were about. SC-003 becomes the test.

**Alternatives considered**: trusting the current structure and skipping the tests. Rejected — an untested invariant that three accepted records depend on is not an invariant.

## Finding 4 — persistence has no library and needs none

**Decision**: browser storage via the platform API, serialised with `JSON`, one key.

**Rationale**: constitution Principle IV (zero dependencies) and FR-006 (no disk write) leave exactly this. The stored shape is fixed by FR-013 to `{ scopes: {}, active: [...] }`. No migration mechanism is needed *because* that shape was chosen up front — the point of the spec's Q1 answer.

**Failure modes that must be handled rather than assumed** (see `data-model.md`): storage unavailable or throwing (private-browsing modes), absent key, malformed JSON, correct JSON of the wrong shape, and valid names that no longer correspond to a registered source (FR-010). Every one degrades to "no scope", never to an error — the same never-crashes posture §3 takes for artifacts.

**Alternatives considered**: the URL hash as the only persistence. Rejected — it satisfies FR-004 and SC-006 but not FR-005, since opening the app fresh has no hash. The two are complementary: the hash carries a *shared* scope, storage carries the *remembered* one. Precedence between them is fixed in `contracts/scope.md`.

## Finding 5 — the "folder" / "source name" wording gap

**Decision**: user-facing copy says **folder**; every identifier and stored value is a source **name**. The mapping is stated once in `contracts/scope.md`.

**Rationale**: constitution Principle V demands one name per concept, and §2's term is **source**. But the request, the record and the spec's user stories all say "folder", because that is what Reza is choosing. Rather than renaming one to match the other, the boundary is made explicit: the panel's heading and the chip use *folder*, the query terms and stored array use source `name`. Both `0017` and the spec already read this way; the risk is a later contributor "fixing" one side.

**Alternatives considered**: renaming the UI to "Sources". Rejected — it is accurate but answers a question nobody asked; the user's mental model is folders on disk.

## Net effect on the plan

| Requirement | Phase 0 verdict |
|---|---|
| FR-004 (`source:` terms, query authoritative) | Already implemented — reuse |
| FR-003 (global surfaces stay global) | Already true — lock with tests |
| Zero-ticked-means-unfiltered (Assumption) | Already true — `matchesFacets` short-circuits |
| FR-001, 009 (panel, counts) | To build |
| FR-005, 006, 010, 013, 014 (persistence) | To build |
| FR-007, 008 (chip, no silent widening) | To build |
| FR-002, 011, 012 | To verify, not to build |

**All NEEDS CLARIFICATION resolved: there were none.** Ready for Phase 1.

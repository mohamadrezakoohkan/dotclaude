# Phase 1 — Quickstart validation: Folder scope

**Feature**: `002-folder-scope` | **Date**: 2026-08-03

How to prove this feature works, and — more importantly — how to prove it did **not** reach the indexer. Scenario 3 is the one that matters most; everything else is visible on sight.

## Prerequisites

- Node (§10, record `0005` — verified on Node, Bun untested)
- No install step: zero dependencies, no build
- A populated `sources.json`. On Reza's machine that is 16 sources / ~590 artifacts

## Setup

```bash
npm test          # expect 70 pass + the new scope tests, 0 fail
npm start         # http://127.0.0.1:4114
```

Record the boot line before touching anything — it is the baseline for scenario 3.

## Scenario 1 — Scope narrows the browse list (FR-001, FR-002, SC-001, SC-007)

1. Open the app. The folder panel lists every registered source with its count, header reading `Folders all` — the "nothing filtered" state.
2. Tick `personal`, `ai-plugins`, `dotclaude`. (Amended 2026-08-03: this step said "click **none**" first. There is no "none" button — see FR-001's amendment. From the unfiltered state, ticking is all that is needed; **show all folders** is the way back.)
3. **Expect**: the browse list contains only artifacts from those three; the type-group counts drop accordingly; the header reads `3/16`.
4. Type a search term. **Expect**: results are the intersection of term and scope (§7 AND-across-facets), and the §7 ranking order within them is unchanged.
5. Click **none**. **Expect**: every artifact returns. Not an empty list — that is the spec's Assumption, and `matchesFacets` gives it for free.

Two interactions to reach a working scope (none → tick) satisfies SC-007.

## Scenario 2 — Scope is remembered (FR-005, FR-010, SC-002, SC-006)

1. With three folders ticked, reload the page. **Expect**: the same three are ticked and the list is **already** narrowed on first paint — no visible flash of the full list correcting itself. A brief unscoped render fails FR-005 even though the end state looks right.
2. Copy the URL, open it in another browser profile. **Expect**: the same filtered list (SC-006), because scope lives in the query the hash carries.
3. Open the app fresh in a profile with no stored scope. **Expect**: unfiltered, and the panel makes clear nothing is filtered.
4. Rename or remove a source in `sources.json`, restart, reload. **Expect**: the unknown name is ignored, the remaining folders still apply, no error anywhere (FR-010).
5. Optional, if the browser allows it: block storage (private mode). **Expect**: the app works unscoped, silently. No banner.

## Scenario 3 — The index was never touched (FR-002, FR-003, SC-003) ⚠️

**This is the acceptance criterion for the whole feature.** `0017` exists because a scoped index would make §4, §5 and §6 report false things; this scenario is how that is checked rather than trusted.

1. With **no scope**, record from the Dashboard and `/api/index`:
   - total artifacts
   - duplicate-cluster count, diverged count
   - orphan count
   - unresolved-reference count and likely-rename count
   - FAIL / WARN / PASS totals
2. Tick three folders. Re-read all of the above.
3. **Expect: every number identical.** Not "similar" — identical. Any movement means scope leaked past the view, and the correct response is to stop and treat it as a defect rather than adjust the expectation.
4. Repeat with one folder ticked, and with all ticked.
5. Confirm each global surface still shows everything: the **Duplicates view** lists all clusters and every copy in each; the **Tags view** counts across all sources; the **⌘K palette** finds an artifact in an unticked folder.

A convenient one-liner for step 1/2, run against the server with and without a scope — the numbers come from the server and so cannot be affected by a client-side scope, which is exactly the point:

```bash
curl -s http://127.0.0.1:4114/api/index \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s),t=j.stats??j;
      console.log(JSON.stringify({total:t.total,byVerdict:t.byVerdict,clusters:t.clusters,
      diverged:t.divergedClusters,orphans:t.orphans,unresolved:t.unresolvedRefs},null,0))})'
```

## Scenario 4 — Out of scope is reachable and labelled (FR-007, FR-008, SC-004)

1. Scope to one folder that contains an artifact whose body links to an artifact elsewhere.
2. Click the wiki-link. **Expect**: the page opens fully rendered, with an **outside scope** chip. Not a dead link, not a blank page.
3. **Expect**: the scope is unchanged afterwards — the panel still shows the same tick state and count (FR-008).
4. Reach an out-of-scope artifact two more ways — a Duplicates-view row and a ⌘K jump. Both open, both chipped.
5. Clear the scope. **Expect**: the chip disappears everywhere. It must never show while unfiltered.

## Scenario 5 — Budgets and boundaries (FR-011, FR-012, Principle IV)

```bash
grep -rn "specify" src/ test/ public/     # expect 0 lines
git diff --stat main -- src/              # expect NO scanner/watcher/linker/resolver/validator files
node -e "console.log(require('./package.json').dependencies ?? 'none')"   # expect none
```

- Change scope with the server running and the watcher active. **Expect**: immediate effect, no restart, no reload (FR-012).
- Touch a file in a scoped-out source. **Expect**: the SSE ping still arrives and the Library-updated toast still fires — freshness is global, like the index.

## Done when

- Scenarios 1–5 pass by observation, with scenario 3's numbers recorded in the task's results
- `npm test` green: the existing 70 unmodified, plus the new scope tests
- The `src/` diff touches no indexing file
- The app has been run from `main` before any merge (`0006`, constitution Principle II)

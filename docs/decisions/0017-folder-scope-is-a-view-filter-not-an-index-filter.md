# 0017 — Folder scope is a view filter, never an index filter

- Status: Accepted — approved by Reza after reading the record ("I did read 0017 and approve now", 2026-08-03), following the five-question walkthrough that produced it
- Date: 2026-08-03
- Supersedes: — (extends §7, §8 and §12; no §1 row changes)

## Context

Reza's observation: Browse loads every source at once — ~590 artifacts across 16 folders in one left panel — and his question was whether the app should instead ask at boot which folders to load. Walked through five questions in session (2026-08-03); the answers are recorded below and are the substance of this decision.

The **motive** turned out to matter more than the mechanism, and it was settled first: the problem is **noise while browsing**, not startup time and not privacy. That one answer rules out the expensive implementation, because three v1 features are defined *across* sources and would start returning **false** answers rather than partial ones under a scoped index:

- **§5 clusters** — an artifact that genuinely is shadowed shows `⭐ only copy` when the copy shadowing it sits in an unloaded folder.
- **§4 orphans** — an artifact referenced only from an unloaded folder becomes a false orphan, and §8 presents the orphan list as a review queue.
- **§6 validator 1 (Overlap)** — it reads the cross-artifact index, so FAIL verdicts would move with scope.

That is precisely the class of defect `0015` removed: the app asserting something false with confidence. Scoping the index would reintroduce it in three places at once, so scope is confined to the view.

Two existing facts make the cheap version cheap. `source:` is already one of five §7 operators (`src/search.js:4`, `matchesFacets` at `:53`), and §8 already persists filters in the URL hash — so the checkbox panel writes `source:` terms into the query rather than adding a parallel filter layer, and a scope is bookmarkable for free. For the record, the speed case for index-scoping was weak on its own numbers: a full re-index of 16 sources walks ~71k files in ~3.0 s, and D2 / §10's JSON snapshot already delivers instant first paint.

## Decision

Add a folder-scope filter to Browse and search — sidebar checkboxes, remembered in the browser, expressed as `source:` terms — and never let it reach the indexer.

## Trade-off accepted

The Dashboard stays noisy while the browse list gets quiet, and scope state lives per-browser rather than in config — accepted because the global Dashboard, Duplicates and Tags numbers are the only ones that are true, and because putting scope in a config file would make switching focus an edit-and-reload.

## The five answers

1. **Motive: noise**, so scope is view-time only and the index stays whole.
2. **Mechanism: sidebar checkboxes**, remembered in the browser, applied on load, changeable without a restart.
3. **Reach: Browse + search** are scoped; **Dashboard, Duplicates, Tags and the ⌘K palette stay global.**
4. An artifact outside scope **opens normally with an "outside scope" chip**; scope never changes by itself.
5. **Process:** this record, then the full spec-kit flow in `specs/002-folder-scope/`.

## Alternatives rejected

- **A boot-time terminal prompt at `npm start`** — Reza's original phrasing. Blocks boot, fights the snapshot-then-rescan startup path and the watcher, cannot be changed without restarting, and puts interactive UI inside a process §10 describes as serving a static SPA.
- **A first-run picker screen** — needs a change-scope path anyway, at which point it is the sidebar panel plus a one-time gate.
- **`enabled: false` / `browseDefault` in `sources.json`** — no app-written state and it matches how §8's first-run copy teaches configuration, but changing focus becomes editing a file and reloading.
- **Scoping everything, Dashboard included** — turns the app from a library into a workspace, and a FAIL count that silently excludes 13 folders is `0015`'s defect wearing new clothes.
- **Auto-widening scope when following a link out of it** — after an afternoon of clicking links the scope is back to all 16 folders with no trace of which click did it; scope stops being something you chose.

## Consequences

- **Spec sections to update:** **§7** (the `source:` facet gains a UI surface and a remembered default), **§8** (Browse sidebar gains the folder panel; the chip vocabulary gains "outside scope"), **§12** (folder scope is not on the roadmap at all — add it as a post-v1 UX line rather than smuggling it in). **§1 is unchanged**: D1–D14 are v1's closed loops and this is a post-v1 view feature, so it adds no row. Stated explicitly so a later session does not invent a D15 for it.
- **Files or areas affected:** `public/app.js` (folder panel, remembered scope, "outside scope" chip), `public/styles.css`, and `src/search.js` only if the facet needs anything — expected to be nothing, since `source:` already works. **Nothing under `src/` that scans, watches, links, resolves or validates.** That boundary is the decision.
- **D11 stays intact, and this needs saying:** remembering the scope is the first time this app persists user state. It lives in browser storage, not on disk, so the app still never writes what it indexes. A future session must not read this record as licence to write files.
- **Numbering:** `specs/002-folder-scope/`. `001-cli-validate` stays reserved for §12's v1.5 item, per `0014` answer 2.
- **This is the first post-v1 feature through spec-kit**, which discharges `0014`'s open trade-off — *"the suite's value is unproven until the first post-v1 feature runs through it"* — on a deliberately low-risk change. `/speckit-analyze` can run here, unlike on `0015`, so it also tests `0016`'s claim that the command is useful inside a feature dir. If `/speckit-specify` insists on a `spec.md` that restates §7 and §8, that collides with `0014` answer 2, and the honest outcome is a record saying the flow does not fit — not a quiet fallback to the house route.
- **Open question deliberately left to the feature spec:** named saved scopes ("workorg", "personal") instead of raw checkbox state. Cheaper to settle before checkbox state is persisted and bookmarked than after.
- **Follow-up task:** implement in a fresh session on `feat/folder-scope`. Flip this record to Accepted and apply the §7 / §8 / §12 edits **in the same commit**, per the decision procedure.

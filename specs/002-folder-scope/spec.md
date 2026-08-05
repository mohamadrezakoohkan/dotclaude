# Feature Specification: Folder scope for Browse and search

**Feature Branch**: `feat/folder-scope` (spec directory `002-folder-scope`; the two are independent)

**Created**: 2026-08-03

**Status**: Approved by Reza 2026-08-03; planned (see [plan.md](./plan.md)). No open clarifications.

**Input**: Accepted decision record `docs/decisions/0017-folder-scope-is-a-view-filter-not-an-index-filter.md`, produced by a five-question walkthrough with Reza on 2026-08-03.

**Extends** (cited, not restated — constitution, Technical Constraints): design spec **§7 Search** (the `source:` operator, "OR within a facet, AND across facets", the ranking ladder), **§8 Screens** (Browse row, chip vocabulary, keyboard map, the ⌘K palette), **§2 Sources model** (a source is a registered root with a unique `name`), and the invariants of **§4** (orphans, backlinks), **§5** (clusters, effective/shadowed) and **§6** (validator 1 Overlap). Read those sections in the design spec; this file adds only what is new.

**Roadmap position**: §12 v1.1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Narrow the browse list to the folders I'm working in (Priority: P1)

Reza has 16 registered sources and ~590 artifacts. On any given day he is working inside two or three of them. He ticks those folders in the Browse sidebar and the list stops showing the rest, so scrolling and arrow-keying reach only artifacts he might actually open.

**Why this priority**: this is the whole feature. It is the noise that prompted `0017`, and it delivers value alone — without persistence, without the chip, without anything else in this spec.

**Independent Test**: tick 3 of 16 folders; confirm the browse list contains artifacts from exactly those 3, that the per-type group counts fall accordingly, and that §7's ranking order within the remaining results is unchanged.

**Acceptance Scenarios**:

1. **Given** all 16 folders are showing, **When** Reza ticks `personal`, `ai-plugins` and `dotclaude`, **Then** the browse list contains only artifacts from those three sources and the type-group counts reflect the reduced set.
2. **Given** three folders are ticked, **When** Reza also types a search term, **Then** results are the intersection of term and scope, per §7's "AND across facets".
3. **Given** three folders are ticked, **When** Reza unticks all of them, **Then** the list shows every artifact again rather than going empty (see Assumptions).
4. **Given** a scope is active, **When** Reza reads the sidebar, **Then** the panel states how many folders of the total are chosen, so a narrowed list is never mistaken for a small library.

---

### User Story 2 - Come back tomorrow to the same scope (Priority: P2)

Reza closes the browser and reopens the app the next day. The folders he chose are still the folders he sees, with no action needed.

**Why this priority**: without it the feature is re-done on every visit, which is friction rather than focus. It is separable from P1 and can ship after it.

**Independent Test**: choose a scope, reload the page, confirm the same scope is applied on first paint; open the app in a second browser profile and confirm it starts unscoped rather than erroring.

**Acceptance Scenarios**:

1. **Given** a scope of three folders, **When** the page is reloaded, **Then** the same three are ticked and the list is already narrowed before any interaction.
2. **Given** a remembered scope naming a source since removed from the sources config, **When** the app loads, **Then** the unknown name is ignored, the remaining folders still apply, and nothing errors.
3. **Given** no remembered scope exists (new browser, cleared storage), **When** the app loads, **Then** every folder is shown and the panel makes clear that nothing is filtered.
4. **Given** a scope is active, **When** the URL is copied and opened elsewhere, **Then** that URL reproduces the same scope, because scope lives in the query the hash already carries (§8).

---

### User Story 3 - Follow a link out of scope without being confused (Priority: P3)

Reza is scoped to three folders and clicks a wiki-link in a rendered body — or a row in the Duplicates view, or a ⌘K result — pointing to an artifact in a folder he unticked. The artifact opens and tells him why it was not in his list.

**Why this priority**: it prevents a puzzle rather than delivering a capability, so it is last. But it cannot be dropped: §4 links and §5 clusters are cross-folder by nature, so this path is hit constantly.

**Independent Test**: scope to one folder, open an artifact whose body links to an artifact in another folder, click the link, and confirm the page opens normally and carries an "outside scope" chip.

**Acceptance Scenarios**:

1. **Given** a scope that excludes `ai-dev-harness`, **When** Reza follows a wiki-link to an artifact in `ai-dev-harness`, **Then** the artifact page opens fully rendered and shows an **outside scope** chip.
2. **Given** the same scope, **When** Reza opens that artifact, **Then** the scope is unchanged afterwards — no folder is silently added.
3. **Given** the same scope, **When** Reza uses the ⌘K palette, **Then** it still finds artifacts in every folder (§8: "jump to any artifact").
4. **Given** the same scope, **When** Reza opens the Duplicates view, **Then** every cluster and copy is listed regardless of scope, because a cluster is only meaningful whole.

---

### Edge Cases

- **Nothing ticked.** Treated as "no folder filter", not "show nothing" — an empty library reads as a breakage. Falls out of §7's existing OR-within-a-facet semantics with no special case.
- **Everything ticked.** Indistinguishable from unscoped, and must not present itself as a filter in force.
- **A remembered folder no longer exists** (source removed or renamed in the sources config): ignored silently, remaining folders still apply.
- **A source that currently indexes zero artifacts** (the config has several): still tickable, and must not vanish from the panel, or the panel stops matching the sources config.
- **The user edits the query text by hand**, adding or removing a `source:` term: the checkboxes follow the query, never the reverse — one source of truth (FR-004).
- **A scoped-out artifact is the effective copy of something in scope**: the Resolution bar still names it, and naming it must not be blocked by scope (§5).
- **Deep-linking to an artifact while a scope is remembered**: the artifact opens; scope affects the list beside it, never the page itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Browse sidebar MUST offer one tickable entry per registered source, above the existing type groups, showing each source's name and artifact count, plus **one bulk action that clears the scope** ("show all folders").
  - *Amended during implementation, 2026-08-03.* This originally read "plus a way to tick all or none". That is not implementable without contradicting this spec's own Edge Cases: *nothing ticked* means no filter, and *everything ticked* is indistinguishable from unscoped — so "all" and "none" would be the same button producing the same result. There are only two meaningful states, unfiltered and a proper subset, so there is exactly one meaningful bulk action. It is labelled for its **result** ("show all folders") rather than for the tick operation, and it is shown only while a scope is in force.
- **FR-002**: Ticking folders MUST narrow the browse list and the search results, and MUST NOT alter which artifacts are indexed. Every cross-folder fact in §4, §5 and §6 MUST stay computed over the whole corpus regardless of scope.
- **FR-003**: Scope MUST NOT reach the Dashboard, the Duplicates view, the Tags view, or the ⌘K palette. Those keep describing the whole library.
- **FR-004**: Scope MUST be expressed as `source:` terms in the existing §7 query, so the query remains the single source of truth, filters continue to persist in the URL hash (§8), and no parallel filter mechanism is introduced.
- **FR-005**: The chosen scope MUST survive closing and reopening the app, and MUST be applied before first paint so the list is never briefly wrong.
- **FR-006**: The app MUST NOT write the remembered scope to any file it indexes, or to disk at all. Persistence belongs in browser storage (constitution Principle III; D11).
- **FR-007**: An artifact outside the current scope MUST remain fully reachable and fully rendered, and MUST carry an **outside scope** chip using the existing chip vocabulary (§8; constitution Principle V — "chip", never "badge").
- **FR-008**: Following a link, palette result, or cluster row to an out-of-scope artifact MUST NOT change the scope.
- **FR-009**: The sidebar MUST state how many of the total folders are currently chosen, so a narrowed list is never read as a small library.
- **FR-010**: An unknown source name in a remembered scope MUST be ignored without error, and MUST NOT prevent the remaining names from applying.
- **FR-011**: The feature MUST introduce no runtime dependency and no reference from `src/` to `.specify/` (constitution Principle IV).
- **FR-012**: Scope MUST be changeable at any time without restarting the server or reloading the page.
- **FR-013**: The remembered scope MUST be stored as `{ scopes: {}, active: [<source name>, …] }` — the shape that admits named saved scopes later without migration — while this feature ships **only** the checkbox UI over `active`. No naming, no switcher, no second concept in §8's vocabulary (Q1, answered: option C). `scopes` stays an empty object until a later feature fills it, and MUST be tolerated as absent or empty when reading.
- **FR-014**: Named saved scopes are **out of scope** for this feature.

### Added 2026-08-04, after `checklists/ux.md`

The checklist found these four affordances present in the implementation and absent from the requirements. Nothing needed fixing; everything needed **writing down**, because an affordance nobody required is one a refactor may remove without failing anything.

- **FR-015**: Each folder row MUST be a natively focusable, natively operable control — reachable by <kbd>Tab</kbd> and actuated by <kbd>Enter</kbd>/<kbd>Space</kbd> without bespoke key handling. A styled non-interactive element with a click handler does not satisfy this.
- **FR-016**: Each row MUST expose its ticked state to assistive technology, not by colour or glyph alone.
- **FR-017**: Keyboard focus on a folder row MUST be visible. §9's focus floor already guarantees this globally ("keyboard focus is ALWAYS visible, in Clay. Never removed, only relocated"); this requirement forbids the panel from opting out of it.
- **FR-018**: "A scope is in force" MUST be signalled by something other than colour. Satisfied today twice over — the header reads `Folders all` versus `Folders 3/16`, and each row carries a ☑/☐ glyph — so this requirement fixes an existing property rather than asking for a new one.
- **FR-019**: When fewer than two sources are registered, the panel MUST NOT be shown. With one source, ticking it and ticking nothing are the same state (`isScoped` is false when every source is ticked), so the panel could only ever be a control that does nothing. This is existing behaviour that no requirement described until now — `ux.md` CHK002. The stored shape anticipates them; the UI does not offer them. A future feature adds the naming and switching UI against the same stored shape.

### Key Entities

- **Scope**: a set of source names (§2's unique `name`, never a filesystem path — paths are absolute and machine-specific, and `0006` treats them as private). An empty set means "no filter". Persisted per browser; not part of the index, and never sent anywhere (§10 trust boundary).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With 3 of 16 folders chosen, the browse list contains artifacts from exactly those 3, and the sidebar's own count agrees with the list.
- **SC-002**: Reopening the app applies the previous scope with zero interactions, and the list is correct on first paint rather than after a visible correction.
- **SC-003**: The Dashboard's duplicate-cluster, orphan, unresolved-reference and FAIL/WARN/PASS totals are **identical before and after any scope change**. This is the observable proof that the index was untouched, and the criterion that fails loudest if scope ever leaks into indexing.
- **SC-004**: Every artifact stays reachable at every scope — a wiki-link, a cluster row and a ⌘K jump each open an out-of-scope artifact, showing the outside-scope chip.
- **SC-005**: Choosing or clearing a scope takes effect immediately, with no server restart and no page reload.
- **SC-006**: A scope URL opened in another browser or profile reproduces the same filtered list.
- **SC-007**: From the default unfiltered view, choosing a scope costs **one interaction per folder wanted**, and returning to unfiltered costs **exactly one** ("show all folders") regardless of how many are ticked.
  - *Amended 2026-08-03, found by `/speckit-analyze`.* This read "at most two interactions (tick none, then tick the folders wanted)". Both halves broke when FR-001 lost its "none" button: the parenthetical named a control that no longer exists, and "at most two" is false for any scope of three or more folders. As restated it is measurable and true, and it captures the asymmetry that actually matters — narrowing is per-folder, widening is always one click.

## Assumptions

- **Zero ticked means unfiltered**, not empty. An empty list reads as a bug, and §7's OR-within-a-facet semantics already produce this behaviour with no special case.
- **Scope is per-browser**, so a different browser, profile, or cleared storage starts unscoped. Accepted because the alternative writes to disk, which Principle III and D11 rule out.
- **Source `name` is the unit of scope**, per §2. A renamed source therefore drops out of a remembered scope, handled as an edge case above rather than as a migration.
- **The query is authoritative**; the checkboxes are a UI over it. This follows the mechanism `0017` fixed and keeps §8's URL-hash persistence working unchanged.
- **No change to scanning, watching, classification, linking, resolution or validation.** `0017` makes this the boundary of the feature, and SC-003 is how it is verified rather than asserted.
- **The existing `source:` operator needs no behavioural change** — expected to be reused exactly as implemented. If it turns out it does need changing, that belongs in the plan as a note, not as a silent edit.

## Clarification resolved

### Q1: The stored shape of a scope — answered

**Context**: FR-013, and `0017`'s closing line — *"Open question deliberately left to the feature spec: named saved scopes ('workorg', 'personal') instead of raw checkbox state. Cheaper to settle before checkbox state is persisted and bookmarked than after."*

**Question**: does a scope have a name, with several saveable, or is there exactly one current scope?

| Option | Answer | Implications |
|--------|--------|--------------|
| A | One current scope only — store the ticked set | Simplest to build and to reason about. Switching between two working sets means re-ticking each time. Adding named scopes later means migrating a shape already encoded in bookmarked URLs, which this app has no mechanism for |
| **C — chosen** | **Store the future-proof shape now, ship option A's UI** | **Persist `{ scopes: {}, active: [...] }` so named scopes can arrive without migration, but build no naming UI in this feature. Cheapest insurance; the cost is a stored shape slightly richer than the UI justifies, which one comment answers** |
| B | Named saved scopes from day one, one active | Suits "work inside 1–3 folders at a time" when the sets recur. Costs a naming UI, a switcher, and a second concept in §8's vocabulary, in a feature whose appeal was that it was small |

**Answer**: **C**, chosen by Reza on 2026-08-03. Encoded as FR-013 and FR-014. The reasoning that decided it: named scopes cost nothing to add against this shape later and nothing at all today, whereas option A's cost lands precisely where this app has no mechanism — rewriting bookmarked URLs.

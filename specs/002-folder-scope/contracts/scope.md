# Phase 1 — Contracts: Folder scope

**Feature**: `002-folder-scope` | **Date**: 2026-08-03

No HTTP contract: this feature adds no endpoint and changes none. §10's API surface — index, artifact-by-id, events, rescan, open-in-editor — is untouched, and the acceptance run asserts that.

Three contracts do exist, and each one is where a later change could break something silently.

## 1. Query contract — scope ⇄ `source:` terms

**The query is authoritative.** The panel is a view over it, never a parallel store (FR-004).

| Direction | Rule |
|---|---|
| Tick a folder | Append `source:<name>` to the query, via the existing `toggleTerm()` (`public/app.js:164`) |
| Untick a folder | Remove that term; everything else in the query survives untouched |
| Render the panel | Derive tick state from `parseQuery(query).facets.source` — never from a stored variable |
| User hand-edits the query | Panel re-renders from it. No reconciliation, because there is only one state |
| No `source:` terms | Unfiltered. Guaranteed by `matchesFacets`'s `facets.source.length` guard (`src/search.js:53`) |
| Combined with other operators | Unchanged §7 semantics: OR within the source facet, AND across facets |

**Case**: `parseQuery` lower-cases facet values, and `matchesFacets` lower-cases `artifact.source` before comparing. Any new comparison must do the same, or a source named `AI-Plugins` stops matching.

**Invariant**: scope is expressed only as query terms. If a future change adds a scope parameter to any function in `src/`, this contract is broken even if behaviour looks right.

## 2. Storage contract

| Aspect | Contract |
|---|---|
| Medium | Browser storage. **Never disk, never the server** (FR-006, Principle III, D11) |
| Key | One key, namespaced to this app. Chosen in the tasks phase; must be a single documented constant, not a literal repeated at call sites |
| Value | `JSON.stringify({ scopes: {}, active: [...] })` — the shape fixed by FR-013 |
| Serialisation | Platform `JSON`. No library (Principle IV) |
| Writer | Exactly one, the folder panel |
| Reader | Exactly one, the boot path |
| Forward compatibility | An unrecognised or absent `scopes` is tolerated; `active` is still honoured. A later feature fills `scopes` **without migrating** — the whole point of the Q1 answer |
| Failure modes | Storage unavailable, throwing (private-browsing), key absent, unparseable JSON, right JSON of wrong shape → **unfiltered**, silently. Never an error banner, never a crash |
| Privacy | Source **names** only. No absolute paths (`0006`), and nothing leaves the browser (§10) |

**Precedence over the URL hash**: hash first, storage second (see `data-model.md`, Read path). A shared link must show its sender's scope rather than the recipient's remembered one.

## 3. UI contract

### The folder panel

| Aspect | Contract |
|---|---|
| Location | Inside `<nav id="sidebar">`, above the type groups rendered by `renderList()` (§8's Browse row) |
| Rows | One per **registered source**, including sources that currently index zero artifacts — the panel mirrors the sources config, not the corpus (spec Edge Case) |
| Row content | Folder name + artifact count + tick state |
| Bulk actions | **One** action, "show all folders", which clears the `source:` terms. Shown only while a scope is in force (FR-001 as amended 2026-08-03). There is deliberately no "none": nothing-ticked and everything-ticked both show the whole library, so the two would be one button with one result |
| Header | States chosen-of-total while scoped — `Folders 3/16` (FR-009) — and reads `Folders all` when nothing is filtered. Never `0/16`: zero would describe the ticks, not the library |
| All ticked / none ticked | Must not present as a filter in force (spec Edge Case) |
| Live | Changes apply immediately, no reload, no restart (FR-012) |
| Styling | §9's existing tokens and the established chip/pill vocabulary. No new colour, no new component language |

### The "outside scope" chip

| Aspect | Contract |
|---|---|
| Where | Artifact page, alongside the verdict chip (`sheet()`, `public/app.js:415`) |
| When | The artifact's source is not in the active scope **and** a scope is in force |
| Never | When unfiltered — every artifact would wear it, which makes it noise |
| Wording | "outside scope". It is a **chip**, never a badge (Principle V) |
| Class | Existing chip classes only — no new visual concept |
| Behaviour | Purely informational. Opening the artifact does **not** change the scope (FR-008) |

### Accessibility (added 2026-08-04, FR-015…FR-018)

| Aspect | Contract |
|---|---|
| Row element | A natively focusable, natively operable control. `<button>` satisfies it; a `<div>` with a click handler does not |
| Ticked state | Exposed to assistive technology (`aria-pressed`), never by colour or glyph alone |
| Focus | Visible, inheriting §9's global floor. The panel MUST NOT set `outline: none` on its rows |
| "In force" signal | Non-colour as well as colour: the header reads `all` versus `3/16`, and each row carries ☑/☐. The accent colour is an addition to those, never the only carrier |
| Panel visibility | Hidden below two registered sources (FR-019) — with one source the control cannot change anything |

None of this asks for new behaviour. All five were already true; they are written here so that removing one fails a requirement instead of passing silently.

### What must stay global

Dashboard, Duplicates view, Tags view, ⌘K palette (FR-003). All four already read global collections; the contract is that they keep doing so. See `quickstart.md` for how that is asserted rather than assumed.

### Keyboard

`↑/↓` move through the **scoped** list, since they move through `visible`. `⌘K` still reaches every artifact in every folder (§8: "jump to any artifact"). No new keybinding is added; §8's keyboard map is unchanged.

## Terminology, pinned once

Constitution Principle V, and the one drift risk this design surfaced:

| Context | Word |
|---|---|
| User-facing copy — panel heading, chip, empty states | **folder** |
| Query terms, stored `active` values, identifiers, tests | source **name** (§2's term) |
| The concept as a whole, in code and docs | **scope** — never "workspace", "selection", or "filter set" |

Both words are correct in their place; a later contributor "fixing" one side to match the other would break either §2's vocabulary or the user's mental model.

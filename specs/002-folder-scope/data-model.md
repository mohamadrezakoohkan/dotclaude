# Phase 1 — Data model: Folder scope

**Feature**: `002-folder-scope` | **Date**: 2026-08-03

One entity. It is not part of the index, is never sent anywhere (§10 trust boundary), and never reaches disk (FR-006, constitution Principle III).

## Entity: Scope

What the user is currently looking at, and what they were looking at last time.

### Shape

```json
{
  "scopes": {},
  "active": ["personal", "ai-plugins", "dotclaude"]
}
```

| Field | Type | Meaning |
|---|---|---|
| `active` | array of source `name` strings | The folders currently ticked. **Empty array means no filter** — every source shows. |
| `scopes` | object | Reserved for named saved scopes (FR-014). **Always `{}` in this feature.** Written so a later feature can fill it without migrating what is already stored and bookmarked. |

### Why the field is a source `name`

§2 gives every source a unique `name`. That name — not its path — is the unit of scope:

- `matchesFacets` compares against `artifact.source` (`src/search.js:53`), which holds the name.
- Paths are absolute and machine-specific, and `0006` treats them as private information; putting one in browser storage or a shareable URL would leak exactly what `0006` protects.
- Names are what the user sees in the source pill on every browse row (§8), so the panel and the list speak the same language.

Comparison is **case-insensitive**, because `parseQuery` lower-cases facet values (`src/search.js:25`) and `matchesFacets` lower-cases the artifact's source before comparing. Stored names should be kept as written; matching must not assume case.

### Validation rules

| Rule | Source | Behaviour |
|---|---|---|
| `active` must be an array of strings | this design | Anything else → treat the whole record as absent |
| Unknown names are ignored, not errors | FR-010 | Filter them out of the *panel's* tick state; the query may still carry them harmlessly |
| Unknown names must not block known ones | FR-010 | Partial application is correct behaviour |
| Empty `active` means unfiltered | Spec Assumption | Falls out of `matchesFacets`'s `facets.source.length` guard — no special case |
| `active` containing every source is indistinguishable from empty | Spec Edge Case | Must not present as "a filter is in force" |
| `scopes` absent, empty, or unrecognised | FR-013 | Tolerated. Never a reason to discard `active` |

### State transitions

```text
                    ┌──────────────── no stored record ────────────────┐
                    │                                                   ▼
  first ever load ──┴──▶ unfiltered (active: [])          ◀── clear / untick all
                                    │                                  ▲
                            tick a folder                               │
                                    ▼                                  │
                            scoped (active: [n…])  ──── untick last ────┘
                                    │
                          reload / reopen app
                                    ▼
                    scoped, restored before first paint (FR-005)
```

There is no "scope off" flag distinct from an empty `active`. One representation, so there is no state where the flag and the list disagree — and `0017` rejected the "everything scoped plus a toggle" option partly for that reason.

### Read path, in order

Each step degrades to the next rather than throwing. This mirrors §3's never-dropped, never-crashes posture for artifacts.

1. **URL hash carries `source:` terms** → those win. A shared or bookmarked link must show what its sender saw (SC-006), and the query is authoritative (FR-004).
2. **Otherwise, read storage.** Unavailable, throwing, absent, unparseable, or the wrong shape → unfiltered.
3. **Intersect `active` with the registered sources** for the panel's tick state (FR-010).
4. **Apply before first paint** (FR-005) — the list must never render unscoped and then correct itself.

Step 1 before step 2 is the one ordering decision here, and it is deliberate: without it, a remembered scope would silently override a link someone sent you, which is the "scope changes behind your back" failure FR-008 rules out.

### Write path

One writer: the folder panel, via the existing `toggleTerm()` → `onSearchInput()` path. After the query changes, `active` is derived from `parseQuery(query).facets.source` and stored. Nothing else in the app writes it, and no server endpoint reads or receives it.

### Relationships

- **Source** (§2) — `active` holds source names; a source removed from config leaves a stale name, handled by FR-010 rather than by migration.
- **Artifact** (§3) — unaffected. No field is added to the artifact record, so the JSON snapshot shape (D2, `SNAPSHOT_VERSION`) does **not** change and needs no bump. Worth stating, because the last two features both needed one.
- **Cluster** (§5), **graph** (§4), **validation** (§6) — unaffected by construction; SC-003 is the assertion that this stayed true.

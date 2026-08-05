# M5 — Browse, search, dashboard · `feat/browse-and-search`

**Spec:** §7 (search, operators, ranking, tags), §8 (Dashboard, Browse, Tags view, ⌘K palette, keyboard map, every empty/error state), D6 (frontmatter default), D7 (explicit vs auto tags).

## Goal

Frontmatter-default search, instant and client-side; the operators `body:`, `type:`, `tag:`, `source:`, `is:duplicate`, `is:fail`, `is:orphan`, `is:unresolved`; the §7 ranking ladder with recency inside a rank; explicit vs auto tag chips; OR-within-facet / AND-across-facet filtering; Tags view with counts; Dashboard health panel; ⌘K palette; filters persisted in the URL hash.

## Decisions taken here

1. **`body:` needs bodies client-side, which `/api/index` deliberately omits (§10).** Rather than fatten the index payload, `body:` queries hit a new `/api/search` endpoint; every other operator stays instant and client-side per §7. This keeps the default path fast and the full-text path one keystroke away, which is D6's stated intent.
2. **The URL hash carries both a route and filters.** M2 used the hash for artifact ids; it now takes `#/artifact/<id>` and `#/dashboard?q=…&type=…`. §8 requires filters to persist there, and a single scheme avoids two competing hash grammars.
3. **Recency inside a rank** uses `modified`, already indexed since M1.

## Empty and error states — §8 calls the copy part of the design

Used verbatim: zero search results → "No matches in frontmatter. Try `body:` to search full text."; filtered browse → "No artifacts match these filters. Clear filters."; no duplicates → "No duplicates. Your library is clean."; identical copies → "Copies are identical."; first run → "Add your first source in sources config" with the path shown.

## Done when

Each operator returns correct results against the real corpus, ranking order is verified on a deliberately ambiguous query, and every empty/error state matches §8's table verbatim.

## Results

### Every operator verified against the real corpus

Each count cross-checked against the index's own totals, so the operator and the dashboard cannot agree on a wrong number:

| Query | Result | Cross-check |
|---|---|---|
| `type:skill` | 530 | `byType.skill` |
| `type:agent` | 36 | `byType.agent` |
| `source:dotclaude` | 3 | that source's own count |
| `is:fail` | 39 | `byVerdict.FAIL` |
| `is:orphan` | 262 | `stats.orphans` |
| `is:unresolved` | 300 | recomputed from artifacts |
| `is:duplicate` | 490 | artifacts carrying a cluster |
| `tag:ios` | 111 | — |
| `tag:ios tag:android` | 197 | between max(111, 86) and 111+86 → OR within facet |
| `type:skill tag:ios` | 105 | ≤ 111 → AND across facets |
| `type:agent type:command` | 37 | 36 + 1 → OR within facet |

### Ranking verified on an ambiguous query

`pull-request` matches many names and is the exact name of none. Ranks come back non-decreasing, and inside the substring rank the order is strictly most-recent-first — `2026-07-28` entries ahead of `2026-07-27`, ahead of `2026-07-22`. `ios-pull-request` as a query puts the exact-name match first, ahead of the 20 substring matches.

### Empty states, verbatim from §8

Asserted against rendered text, not inspected by eye: zero search results gives **"No matches in frontmatter. Try `body:` to search full text."**; the duplicates view with none would give "No duplicates. Your library is clean."; identical copies give "Copies are identical."; first run gives "Add your first source in" with the config path.

### Two findings worth carrying

1. **Not one artifact in the corpus uses `tags:` frontmatter — explicit tags are empty.** D7's model is right, but on this machine every tag is auto-derived, so the Tags view's Explicit section is empty and the auto section carries all 30-odd tags. Nothing to change; worth knowing before anyone tunes tag ranking against a corpus that has no explicit tags to rank.
2. **`body:` is the one operator that costs a round trip.** Bodies are deliberately absent from `/api/index` (§10), so full text goes to `/api/search`. §7's "instant, client-side" holds for everything else, and D6's "one keystroke away" is satisfied — the shared `src/search.js` runs in both places, so ranking cannot drift between client and server.

### Bugs found while verifying

- **The ⌘K palette was visible on load.** `.palette { display: flex }` outranks the UA rule for `[hidden]`, so the attribute did nothing. Fixed with an explicit `[hidden]` rule — invisible in code review, obvious in a screenshot.
- **`is:shadowed` matched artifacts with no `effective` field**, because `!undefined` is true. Now requires an explicit `false`, so a missing field cannot read as "shadowed".
- **Header `<nav class="tabs">` inherited the sidebar's `nav` styling.** Selectors are now scoped to `#sidebar` / `#list .row`.

### Done when

All three met. 54 assertions pass.

Also landed: dashboard health panel with every count linking into a filtered browse; Tags view separating explicit from auto (D7); duplicates view diverged-first with per-copy effective stars; ⌘K palette listing commands then artifacts; `/` to focus search; `↑/↓` cursor, `enter` to open, `d` to diff. `e` (open in editor) shows a placeholder until M6 supplies the endpoint.

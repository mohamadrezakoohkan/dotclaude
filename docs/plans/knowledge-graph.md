# M2 — Knowledge graph · `feat/knowledge-graph`

**Spec:** §4 (outlinks, backlinks, orphans, unresolved references), D4 (backtick-only), D5 (ambiguity), §8 (right rail).

## Goal

Backtick-token extraction from description + body; D5 resolution order; alias resolution; automatic backlink inversion; orphans; unresolved references; self-links excluded; extraction on raw markdown before rendering.

## Structural change

`link` and `resolve` are **cross-source** stages — a token in one repo resolves against every source. They move out of `buildSource` into `buildIndex`, which now runs `link → resolve → validate` over the complete artifact set. §3's pipeline order is unchanged; only the seam moves.

## Decisions taken here

1. **Fenced code blocks are stripped before extraction.** §4 says "every backticked token"; a fence is not an inline code span, and matching inside one would link every shell snippet. Inline spans only.
2. **A token resolving to several copies of one name links to all of them.** The corpus has 3 copies of `android-code-conventions`; each is a legitimate answer to "who references me", so backlinks invert onto every copy. M3's `effective` later picks which copy the *outlink* points at first; until then the primary is highest `priority`, then source name.
3. **Self-links exclude the artifact's own id only,** not its other copies — a skill referencing its own name in another repo is a real cross-repo reference.
4. **Markdown rendering lands here, minimal and dependency-free,** because §4 requires resolved links to appear inline in the rendered body. Headings, emphasis, code spans, fences, lists, quotes, links, rules. All HTML escaped.

## Done when

`ios-visual-acceptance` ↔ `android-visual-acceptance` link both ways, that page's backlink count is non-zero, and the unresolved-reference list has been read by hand for false positives.

**Named risk (D4):** if backtick-only linking yields a near-empty graph, the fault is D4, not the linker — write a record, do not widen matching in code.

## Results

**D4's named risk did not fire.** Backtick-only linking produced **608 outlinks**, gave **319 of 581** artifacts at least one backlink, and found **23 mutually-linked pairs**. No record against D4 was needed.

| Metric | Value |
|---|---|
| Outlinks | 608 |
| Artifacts with ≥1 backlink | 319 of 581 |
| Orphans | 262 |
| Mutually-linked pairs | 23 |
| Unresolved references | 1,213 over 273 distinct tokens |
| …of which likely renames (`0011`) | 153 |

### Done when

Met in substance, with a correction. **§8's screen sketch is a mockup, not a corpus fact:** `ios-visual-acceptance` contains no reference to `android-visual-acceptance` — the only backticked references to it are in `CHANGELOG.md` and `README.md` (not artifacts) and in `android-maestro-ui-testing`. So the specific pair the milestone cites cannot link, and no code change would make it.

Verified against real pairs instead: **`ios-maestro-ui-testing` ↔ `ios-visual-acceptance`** and **`android-maestro-ui-testing` ↔ `android-visual-acceptance`** link both ways. `ios-visual-acceptance` has 12 backlinks, so the non-zero requirement holds. The unresolved list was read by hand — see below.

### The unresolved list, read by hand

`/validate` (30), `/implement` (27), `/plan` (12) are genuinely missing commands. But `service-maven` (28), `web-legacy` (17), `web-app` (17), `data-infra` (14) are **repo and service names**, and `step-01`, `screen-a`, `screen-b` are **screen ids inside one skill**. A raw count of 1,213 is not a signal, which is why `0011` adds the likely-rename flag — 153, and its top entries are all plausible (`android:pull-request → android-pull-request`, where a reference uses plugin-command syntax for something that exists only as a skill).

### Two bugs the new test suite caught

1. **`isCandidate` was gating outlinks.** §4 draws its line in two different places: an outlink is any backticked token that *resolves*, while the unresolved list holds only tokens that *look like* artifact names. Conflating them meant a single-word name like `access` — a real skill — could never link. Fixing it moved outlinks 569 → 608 and orphans 277 → 262.
2. **The fence-stripping regex used `$` with the `m` flag,** so it consumed only the opening fence line and every token inside a code block stayed a link candidate.

Both were invisible to inspection and to the running app. `npm test` now covers frontmatter, classification, the scanner, the linker and the renderer — 19 assertions, and M4's D10 requirement needs it.

### Also landed

Markdown rendering (`src/markdown.js`): headings, emphasis, code spans, fences, lists, quotes, tables, rules, all HTML-escaped before any tag is emitted, with `javascript:` hrefs dropped. Code spans become wiki links only when the graph resolved them. The §8 right rail now shows Referenced by / Links out / Unresolved with live counts, and artifact navigation moved into the URL hash — forward-compatible with M5's filters.

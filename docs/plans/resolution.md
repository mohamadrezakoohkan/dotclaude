# M3 — Resolution & duplicates · `feat/resolution`

**Spec:** §5 (all), D8 (declared precedence, never emulated), §8 (Diff view, Duplicates view), §9 (Resolution bar data).

## Goal

Content hash; shadowing vs cross-repo duplicate as two labelled situations; winner by highest `priority` with alphabetical tiebreak flagged "tie — set priorities"; identical vs diverged chips with differing-line count; unified diff with whitespace normalization and jump-to-next-change; Duplicates view ordered diverged-first.

## Two inherited follow-ups that must close here

1. **`0003` follow-up 1 — §5's tiebreak is degenerate within one source.** All 155 of M0's original collisions were intra-source, and priority cannot break a tie when the source is identical. `0009` fixed *ownership*, not *ordering*.
2. **`0003` follow-up 2 — the stale-copy problem.** The app opens `plugins/cache/…/shared/3.2.5` while `installed_plugins.json` says `shared` runs `3.3.1`. This is the app's founding question answered wrongly, and D8 forbids emulating Claude Code's precedence. Reading a declaration file is not emulation, but it changes D8's model, so it needs a record.

## Decisions taken here

- **Cluster key is `type` + `name`,** per §5's definition of both situations. Sources contribute the distinction: same-name copies within one source are shadowing candidates; across sources they are a cross-repo duplicate cluster.
- **Drift by content hash over the normalized body,** not the raw file: §5 mandates trailing-whitespace normalization for the diff, so the hash must agree with what the diff shows or a cluster will read "diverged" with an empty diff.
- **Diff is computed server-side** on demand, not stored — D11 is read-only and §11 forbids "make identical".

## Done when

Real iOS/Android skill pairs appear as clusters with correct drift status, one diverged pair's line count is verified by hand against `diff`, and "Make identical" is offered nowhere.

## Results

**131 clusters** over 581 artifacts: 36 diverged, 54 shadowing (intra-source), 77 cross-repo duplicates, 55 flagged "tie — set priorities".

### Both inherited follow-ups are closed

**The stale-copy defect is fixed.** `0012` reads `installed_plugins.json` and puts the installed copy ahead of stale cached versions. Verified on the two clusters where the bug was originally seen:

- `ios-visual-acceptance` — `3.3.0 (INSTALLED)` now ranks above `3.1.8`. M0 opened `3.1.8`.
- `obs-datadog` — `3.3.1 (INSTALLED)` ranks above `3.3.0`, `3.2.6`, `3.2.5`. M1 opened `3.2.5`.

**The degenerate tiebreak is fixed.** §5's chain now continues past source name into installed → version → mtime → path, so intra-source copies order deterministically. Version comparison is numeric, not lexical — `3.10.0 > 3.2.5`.

### Diff verified by hand against `diff`

`ai-advisor`, `ai-plugins` vs `personal/…/shared/3.3.1`:

| | changed | added | removed |
|---|---|---|---|
| system `diff` | 90 | 77 | 13 |
| dotclaude | 90 | 77 | 13 |

Exact agreement, after normalising trailing whitespace on both sides as §5 mandates. That normalisation is shared with the content hash on purpose — otherwise a cluster reads "diverged" while its diff shows nothing. A test pins that: two bodies differing only in trailing spaces are `identical`.

### A flag that would have been noise

The first implementation flagged any cluster where the effective copy was not the installed one: **73 of 131**. Almost all were a source-repo copy outranking the installed plugin cache — which is expected, since one is source and the other is what runs. Flagging it would have trained the reader to ignore the chip, the same failure M4's acceptance bar names for heuristics. Narrowed to "the winner is *itself* a stale plugin copy", it now fires **0** times, which is the correct answer once `0012`'s ordering is in place.

### Done when

- Real pairs cluster with correct drift status — `ios-visual-acceptance` is a 5-copy diverged cross-repo cluster, `obs-datadog` a 7-copy identical one.
- One diverged pair's line count verified by hand — above.
- **"Make identical" is offered nowhere** — asserted against the rendered page text, not just by reading the code.
- Resolution bar renders §9's sequence: `personal → path → copy 4 of 5 → shadowed by ai-plugins → diverged → Diff`.

Diff view shows add/remove colouring, collapsed context gaps, and jump-to-next-change. 33 assertions pass.

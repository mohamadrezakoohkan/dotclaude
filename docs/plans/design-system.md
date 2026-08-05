# M7 — Design system pass · `feat/design-system`

**Spec:** §9 (all — tokens, type roles, scale, radii, spacing, the Resolution bar, motion, floor), §8 (screens, keyboard map).

## Goal

Both themes complete from the §9 token table; the three type roles and the 13/14/16/22/28 scale; radii 12/8/full and the 4px spacing grid; the **Resolution bar** on every artifact page as the signature element; 150 ms fades only; `prefers-reduced-motion` respected; Clay focus ring always visible; OS theme with manual toggle; narrow-window collapse to the palette.

## Decisions taken here

1. **Theme is `data-theme` on `<html>` with `prefers-color-scheme` as the default.** §9 wants OS-following *with* a manual toggle, which needs three states — follow, forced light, forced dark. The token block is declared once for light, once inside the media query, and once per forced attribute, so a manual choice wins over the OS without duplicating the palette a fourth time.
2. **Motion is one 150 ms fade token,** and every transition references it. A single declaration is what makes "150 ms fades only" checkable rather than aspirational, and `prefers-reduced-motion` sets it to `0s` in one place.
3. **The spacing scale is four custom properties on a 4px grid** rather than ad-hoc pixel values, so the grid is enforced by the vocabulary available.

## Done when

Light and dark are both verified, the Resolution bar renders on *every* artifact page, reduced-motion is honoured, and the full keyboard path works: ⌘K, ↑/↓, enter, `d`, `e`.

## Results

Every §9 value was read back from the *computed* style rather than checked by eye.

| §9 requirement | Measured |
|---|---|
| Ivory `--bg` light | `rgb(250, 249, 245)` = `#FAF9F5` |
| Dark `--bg` | `rgb(38, 38, 36)` = `#262624` |
| Dark `--accent` | `#E0805F` |
| Page title 28px, display serif | `28px`, `Tiempos Text` |
| Doc body 16px | `16px` |
| Chips full-round | `999px` |
| Motion token | `150ms` |
| `prefers-reduced-motion` | `--fade` → `0s` |
| Resolution bar accent edge | `rgb(201, 100, 66)` = Clay `#C96442` |
| Narrow window (700px) | sidebar and rail both `display: none` |

### The signature element renders on every artifact page — all 581, not a sample

Rather than clicking through, every artifact was fetched and checked for the data the bar needs: source, mono path, precedence standing, and a diff entry point. **581 checked, 0 missing** (490 clustered, 91 lone — a lone artifact renders "⭐ only copy", which is still the bar).

Rendered sequence matches §9 exactly: `personal → plugins/cache/…/ios/3.1.8/…/SKILL.md → copy 4 of 5 → shadowed by ai-plugins → diverged → Diff`.

The bar is the only component in the app with a filled accent edge and a raised card surface; every other surface is a hairline on parchment. That is §9's "boldness is spent here" made structural rather than decorative.

### Full keyboard path

`⌘K` opens the palette; typing filters; `↑/↓` moves; `enter` runs the pick and navigated to `#/duplicates`. In browse, `↑/↓` shows the Clay cursor, `enter` opens the artifact, `d` navigated to the diff route, `e` issued exactly one `POST /api/open` (stubbed in the test so no editor window opened). `/` focuses search.

`d` on a lone artifact correctly does nothing but toast — the first run of this test looked like a failure until the row in question turned out to be `dotclaude/memory/CLAUDE.md`, which has no other copy.

### Diff view, end to end

`ai-advisor` renders 152 rows — 77 additions, 13 removals, 7 collapsed-context gaps — with the chips reading "90 differing lines" and "+77 −13", the same numbers the system `diff` produced at M3. Two byte-identical copies render §8's "Copies are identical." verbatim instead of an empty table. **"Make identical" appears nowhere** in the rendered page (D11, §11).

Zero console errors across the run.

### Small fixes made during the pass

- Chip text was 11px, off §9's scale entirely; now 13px caption, the smallest size the spec defines.
- Validation rows read "structural Structural" because the structural pre-check has no validator number.
- The theme toggle is three-state (system → light → dark), not two: with only a binary toggle there is no way back to following the OS, which §9 asks for.

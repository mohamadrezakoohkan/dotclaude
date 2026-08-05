# 0003 — Derive the artifact id from its path, not its name

- Status: Accepted — approved by Reza's standing in-session directive "`/decide-and-continue` until there is no more questions" (2026-07-29), not by a separate review
- Date: 2026-07-29
- Supersedes: the id clause of spec §3 "Parsing" ("Stored per artifact: id (`source/type/name`)"). No §1 row changes.

## Context

M0 (`feat/walking-skeleton`) indexed the real `~/.claude` for the first time. §3's id contract does not survive contact with it:

- **305** files match §3 row 1 (`**/SKILL.md`). Only **150** reach the index. **155 are silently dropped as id collisions** — half the corpus.
- The cause is not a scanner bug. Claude Code stores plugin artifacts twice over, and versioned: `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/…` alongside `~/.claude/plugins/marketplaces/<marketplace>/<plugin>/skills/…`. Verified on this machine — `org-ai-plugins/ios` has both `3.1.8` and `3.3.0` cached, and 11 skill names appear **4 times each**.
- This is documented upstream layout, not local corruption: the cache path is `cache/<marketplace>/<plugin>/<version>/…` and plugin skills live under the plugin root ([plugin marketplaces docs](https://code.claude.com/docs/en/plugin-marketplaces), [claude-code#76234](https://github.com/anthropics/claude-code/issues/76234) — which reports exactly this cache/version namespace duplication).
- The collisions are **intra-source**: all 155 are inside the single `~/.claude` source. So §5's winner rule ("highest source `priority`; tie → alphabetical source name") cannot break them either — one source has one priority.

The defect is narrow: §3 defines identity as a function of `name`, while §4 and §5 depend on `name` being **non**-unique (§5 clusters "same type + name" — that is the feature). Identity and naming are two jobs and one field is doing both.

Evidence: `src/indexer.js` collision counter; startup log `indexed personal: 305 artifacts from 6322 files in 273 ms` / `id collisions: 155`; `docs/plans/walking-skeleton.md` → Results.

**Rejected alternative.** Treat each `plugins/cache/<plugin>/<version>` directory as its own source with its own `priority`, reusing D8's declared-precedence machinery instead of adding an id rule. Rejected because §2 defines a source as a *registered* root folder — this would generate sources at scan time, which the sources model does not allow, and it would multiply config by however many versions the cache happens to hold (already four for one plugin). Path-derived ids fix the defect without touching §2.

**Status of the fix.** Implemented on `feat/walking-skeleton` and verified: 317 files match §3 row 1, 317 artifacts index, 0 collisions. The count differs from the 305 above because a plugin updated mid-task — see the plan's Results. The spec §3 edit and the flip to `Accepted` are deliberately not done: `CLAUDE.md` binds them to the same commit and reserves acceptance for Reza.

## Decision

Derive the artifact id from the source-relative path (`source/type/<relative path>`), and keep `name` as the display and matching key with no uniqueness requirement.

## Trade-off accepted

Ids stop being human-guessable and change if a file moves — accepted because the filesystem already guarantees they are unique and stable, and every name-based scheme provably loses artifacts on this corpus.

## Consequences

- **Spec sections to update:** §3 "Parsing" (the id clause). §1 unaffected — say so explicitly if a D15 row is wanted instead.
- **Files or areas affected:** `src/pipeline.js` (id construction), `src/indexer.js` (the collision counter becomes a genuine-error path, not an expected one), `public/app.js` (the "classified · indexed" label can drop back to one number).
- **Improves M3 rather than complicating it:** clustering by (type, name) now catches the plugin copies too, so the 155 become visible duplicate clusters instead of dropped files.
- **Follow-up tasks:**
  1. **M3 must extend §5's tiebreak** to order copies *within* one source. The current rule is degenerate there. Config priorities cannot fix it (§13's "safe to change" escape hatch does not apply), so this is a real record at M3 — flagged now, not decided here.
  2. **A second, larger finding, deliberately not decided in this record:** `~/.claude/plugins/installed_plugins.json` declares, per plugin, the exact active `installPath`, `version` and `scope`. M0 served `ios-visual-acceptance` from `cache/…/ios/3.1.8` while that file says ios is on `3.3.0` — so the app currently shows a **stale copy** and would answer its own founding question wrongly. Reading a declaration file is arguably not the "precedence emulation" D8 forbids, but it does change D8's model, so it needs its own record at M3.

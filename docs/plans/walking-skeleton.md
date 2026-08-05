# M0 — Walking skeleton · `feat/walking-skeleton`

Task plan for milestone M0 in `docs/plans/v1-milestones.md`. Implements decision record `0002`.

**Spec sections read before writing this plan:** §10 (architecture — one process, API surface, persistence, trust boundary), §3 classification row 1 (`**/SKILL.md` → skill), §2 (sources model — single `local` source, missing-path never crashes), §8 (Artifact page and Browse rows, minimal), §9 color tokens, §13 (port 4114, personal priority 50).

## Goal (restated from the milestone)

One hard-coded local source → scan → classify `**/SKILL.md` only → in-memory index → HTTP + static SPA → list → click → raw body. Every §10 box present and thin.

## Pre-measured corpus (taken before planning, read-only)

| Fact | Value |
|---|---|
| `SKILL.md` files under `~/.claude` | 305 |
| Total files under `~/.claude` | 6382 |
| `node_modules` dirs under `~/.claude` | 0 |
| Size on disk | 924 MB (dominated by `projects/` session logs, not artifacts) |

Consequence: the M1 ignore list is not needed to make M0 finish — 6382 `stat` calls is nothing, and only 305 files get read. The 924 MB is `.jsonl` transcripts that classification skips. Scan wall time still gets recorded per **Done when**.

## Runtime — stated assumption, not a spec change

§10 says "Runtime: Bun (Node-compatible), zero build step, near-zero dependencies." **Bun is not installed on this machine; Node is (v26.3.1).**

Decision for M0: write to the **Node/Bun intersection** — `node:http`, `node:fs/promises`, `node:path`, ESM, zero dependencies, no build step. `npm start` runs it under Node today; `bun src/server.js` runs the identical file unchanged if Bun is ever installed. §10 stays true as written and no record is needed.

**Closed by record `0005`:** §10 now reads "the Node/Bun intersection — verified on Node, Bun supported but untested", and the no-`Bun.*` rule is a standing constraint for later milestones. The spec no longer carries an unexercised runtime claim.

## In scope

- `package.json` — `type: module`, `start` script, **zero dependencies**.
- `src/config.js` — hard-coded single source `{ name: 'personal', type: 'local', path: '~/.claude', priority: 50 }`, shaped as the §2 field list so M1 only swaps the literal for a config file. `~` expanded via `os.homedir()`.
- `src/scan.js` — recursive walk, returns absolute file paths. Depth cap 10 and cycle guard are M1; M0 walks plainly but skips `.git`.
- `src/classify.js` — §3 row 1 only. Name = parent folder name (frontmatter `name` needs the parser → M1). Rows 2–6 return `null` with a comment naming M1.
- `src/pipeline.js` — the §10 boxes in order, thin: `scan → classify → parse → link → resolve → validate → index`. `parse`, `link`, `resolve`, `validate` are identity stages, each one line, each with a `// M1` … `// M4` marker. The seam exists so later milestones fill a stage instead of restructuring.
- `src/indexer.js` — in-memory index: `Map<id, artifact>`, id = `source/type/name` per §3. Records scan wall time and artifact count.
- `src/server.js` — `node:http`, binds **127.0.0.1:4114** (§10 trust boundary, §13 port). Routes:
  - `GET /api/index` → artifacts without bodies (§10)
  - `GET /api/artifacts/:id` → artifact with body
  - `GET /` + static from `public/`
  - Nothing else. SSE, rescan, open-in-editor are M6.
- `public/index.html`, `public/app.js`, `public/styles.css` — one static SPA, no framework, no build. Sidebar list of skills with count; click renders title + mono path + **raw** body in a `<pre>`. No markdown renderer (M1+), no Resolution bar (M7 owns it as the signature element; M3 supplies its data).
- **§9 color tokens as CSS variables**, both light and dark, via `prefers-color-scheme` — all ten rows of the §9 table, verbatim hex. Per the milestone: cheap now, prevents a repaint-everything task at M7.

## Explicitly out of scope for M0

Frontmatter parser · linker · shadow resolver · validator · watcher · SSE · rescan · open-in-editor · markdown rendering · search · tags · dashboard · themes toggle · the Resolution bar. Each belongs to a named later milestone.

## Validation — how M0 gets checked

1. `npm start` → server listening on `127.0.0.1:4114`; confirm it is **not** reachable on the LAN IP (§10 trust boundary).
2. `curl /api/index` returns 305 skills — cross-checked against `find ~/.claude -name SKILL.md | wc -l`. A mismatch is a scanner bug, investigated before merge.
3. Bodies absent from `/api/index`, present on `/api/artifacts/:id`.
4. Browser: list renders, clicking a skill renders its raw body.
5. Missing-path case (§2): point the source at a nonexistent path → server still boots, index empty, no crash.
6. Record in this file, under "Results": **artifact count** and **scan wall time** — the first real numbers about the corpus.
7. Run the `validate-ai-instructions` checklist only if this task edits `CLAUDE.md`, a skill, an agent, or a command. It does not — so the checklist is not triggered here.

## Also on this branch

**The validator-15 terminology fix, identified and applied.** The prior session's finding was not carried forward, so it was re-derived from the spec: **chip** appears 11 times, **badge** 3 — one concept, two names, which is exactly what validator 15 ("one name per concept throughout") catches. Standardized on `chip`, the dominant usage and the word §9's token table already uses. Three call sites fixed: §6's heading, §3's "parse error" line, §12's roadmap row, plus two in the milestone plan. `chip` is now in `CLAUDE.md` → Terminology so it cannot drift back.

**The `decide-and-continue` skill** also lands here (`.claude/skills/decide-and-continue/SKILL.md`), with the amendment that a standing in-session delegation from Reza satisfies the decision-record gate — provenance recorded in the record's Status line rather than left implicit.

## Results

The first real numbers about the corpus. Two runs: the first exposed the id defect, the second is after the `0003` fix.

| Metric | First run (name-derived ids) | After `0003` (path-derived ids) |
|---|---|---|
| Files walked (`~/.claude`) | 6322 | 6374 |
| Files matching §3 row 1 | 305 | 317 |
| **Artifacts indexed** | **150** | **317** |
| Id collisions (dropped) | 155 | 0 |
| **Scan wall time** | 273 ms | **140 ms** |
| Unreadable paths | 0 | 0 |

**Read this against D2.** 140 ms for 317 artifacts puts the in-memory model nowhere near its "revisit past ~5k artifacts" threshold. The 924 MB on disk is `projects/` transcripts that classification skips — the number the threshold is judged on is artifact count, not repo size (the Q2 concern; the timing struct is per-source so M1 keeps it that way).

**The 155 collisions were a spec defect, not a bug** — `docs/decisions/0003`, accepted, fixed, and spec §3 updated in the same commit.

**The corpus mutated mid-task.** 305 → 317 files between the two runs, because a plugin updated at 14:47 while this milestone was being built (`installed_plugins.json` → `shared@org-ai-plugins.lastUpdated`). `~/.claude/plugins/cache/…/shared/` now holds four versions side by side: 3.2.5, 3.2.6, 3.3.0, 3.3.1. Two consequences worth carrying forward: M6's "freshness blocks nothing" framing is optimistic — the library moves under you inside one session — and the cache accumulates versions without pruning, so artifact count grows monotonically with plugin updates.

### Validation outcomes

| # | Check | Result |
|---|---|---|
| 1 | Binds localhost only | **Pass** — `lsof` shows `127.0.0.1:4114` only; LAN `192.168.100.13:4114` refuses |
| 2 | `/api/index` count vs `find` | **Pass after `0003`** — 317 = 317, all ids unique. First run mismatched 150 vs 305; cause was the spec, not the scanner |
| 3 | Bodies absent from index, present per artifact | **Pass** — `bodies_present: false`; `ios-visual-acceptance` returns 15703 chars over a path-derived id |
| 4 | Browser list → click → raw body | **Pass** — 317 rows in Chromium, click sets `aria-current` and renders the body; only console error is a `favicon.ico` 404 |
| 5 | Missing source path (§2) | **Pass** — ENOENT recorded per-source, 0 artifacts, no crash |
| 6 | Count + wall time recorded | **Pass** — table above |
| 7 | 15-point checklist | **Triggered by the `decide-and-continue` skill, and it exposed a D9 problem — see below** |

Also checked, unasked: 404 on unknown id, 405 on non-GET, 404 on `/../package.json` (static serving is confined to `public/`).

### The checklist D9 names does not exist

`CLAUDE.md` requires the `validate-ai-instructions` 15-point checklist before committing a skill. **No skill by that name, and no 15-point checklist, exists anywhere in the corpus.** The closest real artifacts are `validate-skill` (structural script + 8 quality items) and `validate-agent` (13 items), both under `plugins/marketplaces/org-ai-plugins/.claude/skills/`.

The new skill was validated against `validate-skill` instead: its `validate.py` exits 0, the file is 61 lines against a 500-line cap, and the 8 quality items were reviewed by hand.

**Resolved by record `0004`, accepted.** D9 now points at the two real skills (`validate-skill` = class S, `validate-agent` = class A), §6 owns its numbering explicitly, class R is declared checklist-less, validator 16 (time-sensitive content) was added because both real checklists carry it, and `CLAUDE.md` → Validation now names rules that exist. The mapping table in `0004` shows 11 of 16 validators tracing to a real quality item, with 1, 3 and 5 marked as dotclaude's own — including the two that D10 permits to emit FAIL.

### Known-imperfect, deliberately

The sidebar now shows three rows named `ios-visual-acceptance` with nothing distinguishing them, and clicking the first opens the **3.1.8** copy while `installed_plugins.json` says ios runs **3.3.0**. Correct per §3 (name is the display key) and exactly the material M3 clusters — but it means M0 answers the founding question wrongly today. This is the risk carried in `0003`'s follow-up 2.

## Risks

| Risk | Handling |
|---|---|
| Node/Bun divergence later | Intersection-only APIs; no `Bun.*` call anywhere in M0 |
| `~/.claude/projects` walk cost | Measured: 6382 files, no `node_modules`. If wall time is surprising, that is M1 ignore-list evidence, not an M0 scope change |
| Parent-folder naming collides across plugin dirs | Expected; duplicate ids are M3's subject. M0 logs a collision count rather than resolving it |
| Per-source timing (Q2) | Moot at M0 — one source. The timing struct is per-source from the start so M1 reports each source separately and the D2 ~5k threshold is judged on artifact count, not repo size |

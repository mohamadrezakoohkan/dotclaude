# 0023 — A workspace file may scope the index at launch

- Status: Accepted — approved by Reza in session ("go q1", 2026-08-05), choosing option 1 of the plan's Q1: this record, `specs/003-workspace-mode/`, branch `feat/workspace-mode`. Q2 and Q3 were left to the author and are answered below under *Alternatives rejected*
- Date: 2026-08-05
- Supersedes: — (amends `0017` in part; extends §2, §8, §10, §12; no §1 row changes)

## Context

Reza's request: `npm start -- --workspace <path>` should boot the app against a `workspace.json`
that names the current project plus any other `.claude/` folders, index **only** those paths, and
have Rescan re-read that file rather than the machine-wide source list.

The motive is different from `0017`'s. `0017` asked *"can Browse be quieter?"* and the answer was a
view filter, because the corpus stayed whole and three features (§4 orphans, §5 clusters, §6
validator 1) would otherwise return **false** answers instead of partial ones. This request asks
*"can the app be pointed at one project and its dependencies?"* — the reader's frame is the project,
not the machine, and the 16 registered sources of `sources.json` are noise in that frame from the
first paint onward.

That distinction matters because `0017`'s rejected-alternatives list contains this feature verbatim:

> **Scoping everything, Dashboard included** — turns the app from a library into a workspace, and a
> FAIL count that silently excludes 13 folders is `0015`'s defect wearing new clothes.

The objection is real and is not dismissed. What changes it is that a *mode* is not a *filter*. Under
a filter, "12 FAILs" and "12 FAILs in the 3 folders you ticked" appear in the same UI, and the reader
cannot tell which one they are looking at. Under a launch mode declared on the command line, named in
the boot log, and stated in the header of every screen, the corpus **is** the workspace — every
number is true about the thing the reader asked for. `0015`'s defect is asserting something false
with confidence; the mitigation here is that the frame is never ambiguous, which is why the mode
banner is part of this decision rather than a UI nicety attached to it.

Evidence gathered before deciding:

- `src/indexer.js:29` — `buildIndex` calls `loadSources()` on **every** rebuild, so making the
  workspace file the source list is enough to make Rescan re-read it. No new refresh path (D3).
- `src/scan.js` walks downward from each registered root only. This is why
  `~/code/project-agent/.claude` was invisible on 2026-08-05 despite repeated
  Rescans: it is not a registered source, and the nearest one is the `.claude` directory itself, not
  the parent folder. That question is what produced this record.
- `src/snapshot.js` writes one fixed file, `.dotclaude-cache/index.json`. Without keying it per mode,
  a workspace run overwrites the library's cache and the next library boot paints three artifacts as
  "your library" for the first seconds (§10 serves the snapshot before rescanning).
- npm's own `--workspace` is a monorepo config flag, so the argument only survives after `--`.
  Verified empirically under npm 11.16.0: `npm start -- --workspace <p>` and
  `-- --workspace=<p>` both arrive in `process.argv`; without the `--`, npm consumes it and exits 1.
  npm documents `--` as the way to "pass `--`-prefixed flags and options which would otherwise be
  parsed by npm" ([npm-run](https://docs.npmjs.com/cli/v11/commands/npm-run/),
  [npm-run-script](https://docs.npmjs.com/cli/v9/commands/npm-run-script/)).

## Decision

Add a second launch mode: when `--workspace <path>` (or `DOTCLAUDE_WORKSPACE`) is given, the source
list comes from that `workspace.json` and from nothing else, `sources.json` is never read, and the
mode is declared in the boot log and on every screen.

## Trade-off accepted

Every §4, §5 and §6 answer becomes true about the workspace rather than about the machine — a skill
shadowed by a copy in an unlisted folder reads `⭐ only copy` — accepted because the mode is chosen
per launch and named on screen, so no number is ambiguous about which corpus it describes.

## The shape

- **Invocation.** `npm start -- --workspace <path>`, `--ws <path>` as an alias, or
  `DOTCLAUDE_WORKSPACE=<path> npm start`. `<path>` may be the file, a directory (→
  `<dir>/.claude/workspace.json`), or a `.claude` directory (→ `<dir>/workspace.json`). There is no
  detection from the working directory: a mode that switches itself is a mode you can misread.
- **File shape.** The §2 source contract unchanged — `name`, `type`, `path`, `priority` — under a
  `sources` array, plus an optional `name` for the workspace itself. One schema, not two, so §2 stays
  the seam that makes remote sources (D12) a drop-in here too.
- **Relative paths resolve against the workspace file's own directory**, not against the repo. This is
  what lets the file that lives in `<project>/.claude/` say `"path": ".."` and mean *this project*.
- **Failure posture, deliberately split.** At boot, an unreadable, unparseable or empty workspace file
  **exits non-zero** with the reason. §2's "never crashes on config" exists so a bad path cannot stop
  you browsing; here, falling back to the examples or to `sources.json` would silently widen the
  corpus the reader asked to narrow, which is the failure this mode exists to prevent. At
  rescan/watch time the same breakage **keeps the last good source list** and surfaces a config chip,
  because a running server must not die because an editor saved atomically.
- **Snapshot per mode.** `.dotclaude-cache/index.json` stays the library's; a workspace writes
  `.dotclaude-cache/workspaces/<8 hex of the absolute file path>.json`. Both directions of clobbering
  are prevented, and instant startup (D2, §10) is kept in both modes.
- **`workspace.json` is a watched input**, exactly as `sources.json` became one under `0009`'s
  follow-up: editing the mapping changes the corpus without any artifact changing.
- **Port.** `--port <n>` / `PORT`, so a workspace can run beside the library. §13 already lists the
  port as a default that is safe to change; this makes it reachable without editing code.

## Alternatives rejected

- **A named scope inside `sources.json`** (the plan's Q3, and `0017`'s deliberately-open question):
  one server, one whole index, switchable focus. Cheaper, and it keeps every cross-artifact fact
  global — but it cannot deliver the property being asked for, which is that folders outside the
  workspace are *never walked*. It remains the right answer for the library and is untouched here.
- **Suppressing §5 clusters and §4 orphans in workspace mode** (the plan's Q2): honest, and it removes
  the `⭐ only copy` misread entirely. Rejected because a project workspace that lists `~/.claude`
  precisely in order to see *"is the copy in my repo the one that loads?"* would then have the answer
  withheld — that question is §5's whole job and the app's founding question (§ intro). The mode
  banner plus a workspace-relative label on those panels keeps the frame visible without withholding
  the answer.
- **Reusing `0017`'s checkbox state as a boot argument** — the checkboxes live in browser storage and
  are per-browser by decision; making them a launch input would put a machine-wide config in one
  browser profile.
- **Auto-detecting `.claude/workspace.json` from the working directory** — dotclaude is started from
  its own repo, so cwd detection would either never fire or fire on dotclaude's own `.claude`, and a
  mode that engages without being asked for is unreadable in a boot log.
- **A `mode` field inside `sources.json`** — makes the machine-wide config responsible for the
  project-local frame, and `sources.json` is untracked (`0021`), so the intent would be invisible in
  the repo.

## Consequences

- **Spec sections to update:** **§2** (the workspace file as an alternative source list, its relative-path
  base, and the boot-vs-rescan failure split), **§8** (mode banner in the header; workspace-relative
  labelling on the Dashboard, Duplicates and cluster panels), **§10** (two launch modes; the snapshot is
  keyed per mode; the `--workspace`/`--port` arguments), **§12** (a post-v1 line). **§1 is unchanged**:
  D1–D14 are v1's closed loops and this is a post-v1 launch-mode feature, so it adds no row — said
  explicitly so a later session does not invent a D15 for it.
- **Files or areas affected:** `src/config.js` (mode resolution, workspace loading), `src/snapshot.js`
  (per-mode key), `src/watcher.js` (`workspace.json` as an input), `src/server.js` (mode plumbing,
  boot log, `stats()`, port), `public/app.js` + `public/styles.css` (banner, labels),
  `workspace.example.json`, `README.md`, `specs/003-workspace-mode/`.
- **`0017` is amended, not reversed.** Its rule — folder scope is a view filter and never reaches the
  indexer — remains binding for the library mode it was written about. What this record changes is the
  absoluteness of "never an index filter": a workspace declared at launch may be the index. `0017`'s
  text is unchanged (append-only); this paragraph is the amendment, and `0017`'s status line stays
  `Accepted` because nothing it decided has been undone.
- **D11 stays intact.** Nothing here writes what it indexes. The workspace file is authored by hand,
  read-only to the app, and the only thing the app writes is its own cache, as before.
- **The governance test gets a tighter parse, not an exemption.** `0009 + 0012`'s watched-input test
  scans quoted `*.json` literals in `src/`; the per-mode snapshot name is composed, so it would slip
  past unseen. `docs/decisions/README.md` is explicit that the fix for an awkward case is a tighter
  parse or a declared exemption, never a weaker assertion.
- **Follow-up task:** verify the mode on the real `project-agent` workspace and re-run the suite
  under Bun (`0019`) before the merge.

# Implementation Plan: Workspace mode

**Branch**: `feat/workspace-mode` (spec dir `003-workspace-mode`) | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/003-workspace-mode/spec.md`, derived from accepted record `docs/decisions/0023-a-workspace-file-may-scope-the-index-at-launch.md`

## Summary

A second launch mode. `resolveMode()` reads argv and env once at boot; when a workspace is named, `loadSources()` reads that file instead of `sources.json`, resolving relative paths against the file's own directory. Everything downstream of the source list is untouched — scan, classify, parse, link, resolve, validate all receive a source array of the same shape they already receive, which is why this feature is small. The work that is *not* the source list is the work that keeps it honest: a per-mode snapshot key, `workspace.json` as a watched input, and a mode statement on screen.

Unlike `002`, this feature **does** reach `src/`. That is the whole content of record `0023`, and it is the one thing a reviewer should check hardest.

## Technical Context

**Language/Version**: JavaScript (ES modules), Node/Bun intersection (§10, records `0005`/`0019`). No TypeScript, no transpile.

**Primary Dependencies**: none, and none may be added (§10, Principle IV). Argument parsing is a dozen lines of plain JS — `node:util`'s `parseArgs` is stdlib, but the existing CLI deliberately has no flag parser (`src/cli.js` header), so the same restraint applies here.

**Storage**: no new persistent state. The per-mode snapshot key changes *where* the existing cache is written, not what is written (D2, §10). Nothing indexed is ever written (Principle III, D11).

**Testing**: `node:test`, one file, `test/run.test.mjs` — 95 tests before this feature. New tests join it. Probes use `fs.mkdtemp`, never a directory inside a registered source (`CLAUDE.md` → Validation).

**Target Platform**: localhost only; `http://127.0.0.1:4114` by default, overridable per FR-011 (§10 trust boundary, §13 port default).

**Project Type**: single-process local web app (§10).

**Performance Goals**: workspace mode is strictly *less* work than library mode — fewer roots walked. Library mode must not regress: mode resolution is one argv scan at boot, and `loadSources()` gains one branch.

**Constraints**: `sources.json` MUST NOT be read in workspace mode (FR-002). The §2 source contract MUST stay one schema (FR-004). A failure to read the workspace file MUST NOT widen the corpus (FR-005). Library mode MUST be byte-for-byte unchanged (SC-002).

**Scale/Scope**: a workspace is expected to name 1–5 roots; the library names 16. Both use the same code path.

## Constitution Check

| Principle | Gate | Result |
|---|---|---|
| I — log append-only | `0023` written before code; `0017` amended by a new record, its text untouched | ✅ |
| II — publishing needs a fresh ask | no remote interaction in this feature; nothing pushed | ✅ |
| III — read-only | only the app's own cache is written, as before; the workspace file is read-only to the app | ✅ |
| IV — zero runtime dependencies | no dependency added; hand-rolled argv scan | ✅ |
| V — one name per concept | the new terms are **launch mode**, **workspace file**, **workspace key**, fixed in `0023` and used identically in code, spec and UI. "workspace" never means `0017`'s scope, and `0017`'s "scope" is never used for a mode | ✅ |
| Technical Constraints — §2 seam | the workspace file reuses the source contract rather than defining a second one, so D12's remote sources drop into it too | ✅ |
| Development Workflow — spec → plan → implement → validate | plan presented and approved ("go q1") before code | ✅ |

**Result: 7 of 7 gates pass. Complexity Tracking is empty by design.**

One tension worth naming rather than passing silently: Principle V's "one name per concept" is under real pressure here, because `0017` already spent the word *scope*. The mitigation is vocabulary discipline — this feature says **mode** everywhere and never "workspace scope".

## Project Structure

### Documentation (this feature)

```
specs/003-workspace-mode/
├── spec.md
├── plan.md              # this file
├── tasks.md
├── research.md          # the two questions that needed an answer before design
└── contracts/
    └── workspace-json.md  # the file's shape, its resolution rules, and its failure table
```

### Source code (repository root)

```
src/config.js       # + resolveMode(), + loadWorkspace(), loadSources() gains one branch
src/snapshot.js     # snapshot path keyed by mode
src/watcher.js      # workspace.json is a watched input
src/server.js       # mode plumbing, boot log, port override, stats
public/app.js       # header mode banner, workspace-relative labels
public/styles.css   # banner token usage only — no new colors (§9)
workspace.example.json  # shipped example, no real paths (0021/0022)
README.md           # both invocations, and the npm `--` caveat
test/run.test.mjs   # new tests; the watched-input parse tightened
```

**Structure Decision**: no new directories under `src/`. Mode belongs in `config.js` because that is already the only module that answers "what are the sources?", and putting it anywhere else would give two modules an opinion about the corpus.

## Phase 0 — Research

Two questions had to be answered before the shape was fixed; both are recorded in [research.md](./research.md) and in `0023`'s Context.

1. **Does an argument survive `npm start`?** Yes, after `--`. `--workspace` is npm's own monorepo flag, so without `--` npm consumes it and exits 1. Verified under npm 11.16.0.
2. **What breaks if the snapshot is not keyed per mode?** The library's first paint after any workspace run shows the workspace's artifacts as the library, because §10 serves the snapshot before rescanning. That turned a nice-to-have into FR-008.

## Phase 1 — Design

- **Mode resolution** is a pure function of `(argv, env)` returning `{mode, workspaceFile, workspaceDir, name, port}`, so it is testable without a process. The server calls it once; `config.js` holds the result for `loadSources()` to read on every rebuild — which is what makes Rescan re-read the file (FR-006) with no new refresh path (D3).
- **`loadSources()` keeps its contract** — `{sources, configError}` plus a `workspace` field in workspace mode — so `buildIndex` needs no restructuring, and `0009`'s ownership rule applies to workspace roots for free.
- **Relative-path base** is the one genuinely new rule (FR-003). `expandHome` gains an optional base, defaulting to `ROOT_DIR` so library behaviour is unchanged.
- **Failure split** (FR-005) lives at the call site, not in the loader: the loader reports, the boot path decides to exit and the rebuild path decides to keep. A loader that called `process.exit` would be untestable and would kill a running server.

**API contract**: no new endpoint. `/api/index` stats gain three fields (FR-009), which is additive — the client reads them if present, so §10's surface is unchanged.

## Complexity Tracking

Empty. The one place this feature could have grown a second schema — the workspace file — reuses §2's, and the one place it could have grown a second config authority in library mode — a `mode` field in `sources.json` — was rejected in `0023`.

## Post-design Constitution re-check

No new violations. The design touches `src/` by decision (`0023`), not by accident, and the boundary that replaces `002`'s "nothing under `src/`" is stated in [tasks.md](./tasks.md) as a failing condition: **nothing in the scan, classify, parse, link, resolve or validate stages may learn that modes exist.** They receive a source list, as they always have.

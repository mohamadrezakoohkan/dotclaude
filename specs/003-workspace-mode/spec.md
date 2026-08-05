# Feature Specification: Workspace mode

**Feature Branch**: `feat/workspace-mode` (spec directory `003-workspace-mode`; the two are independent, as in `002`)

**Created**: 2026-08-05

**Status**: Approved by Reza 2026-08-05 ("go q1"). No open clarifications.

**Input**: Accepted decision record `docs/decisions/0023-a-workspace-file-may-scope-the-index-at-launch.md`, written after Reza asked why a Rescan never discovered `~/code/project-agent/.claude`.

**Extends** (cited, not restated — constitution, Technical Constraints): design spec **§2 Sources model** (the source contract; nesting per `0009`; never crashes on config), **§3 Indexing pipeline** (scan walks downward from a root; freshness and the watched-input rule), **§8 Screens** (header, Dashboard, chip vocabulary), **§10 Architecture** (launch modes, snapshot, API surface, trust boundary), **§13** (port 4114 is a safe default to override). Read those sections; this file adds only what is new.

**Roadmap position**: §12 post-v1, immediately after `002-folder-scope`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Point the app at one project and the folders it depends on (Priority: P1)

Reza is working in `project-agent`. He writes `.claude/workspace.json` naming that repo, the shared team `.claude`, and his personal `~/.claude`, starts the app with `--workspace` pointed at that file, and the library contains those three sources and nothing else. The other 13 folders in `sources.json` are not walked, not counted, and not present.

**Why this priority**: this is the feature. It delivers value with no banner, no port flag and no snapshot work — those exist to keep it honest and fast, not to make it work.

**Independent Test**: boot against a workspace naming 3 roots; confirm `/api/index` contains artifacts from exactly those 3 sources, that a file living under a `sources.json`-only root is absent, and that the boot log names the workspace.

**Acceptance Scenarios**:

1. **Given** a `workspace.json` naming 3 sources, **When** the app boots against it, **Then** `stats().sources` lists exactly those 3 and `sources.json` is never opened.
2. **Given** the workspace file sits at `<project>/.claude/workspace.json` and names `"path": ".."`, **When** the app boots, **Then** that source's root is the project directory — relative paths resolve against the file's own directory, not the dotclaude repo.
3. **Given** two workspace sources whose roots nest, **When** the index is built, **Then** `0009`'s innermost-owner rule applies exactly as in library mode — one file on disk, one artifact.
4. **Given** no `--workspace` argument, **When** the app boots, **Then** behaviour is today's library mode, byte for byte.

---

### User Story 2 - Change the mapping and press Rescan (Priority: P2)

Reza adds a fourth path to `workspace.json` while the app is running. He presses Rescan (or the watcher fires) and the new folder's artifacts appear. He removes one; they go.

**Why this priority**: without it, every mapping change is a restart. It is separable from P1 and it is nearly free — `buildIndex` already re-reads the source list on every rebuild (`src/indexer.js:29`).

**Independent Test**: boot against a workspace, add a source to the file, POST `/api/rescan`, and confirm the artifact set grew by exactly that root's contents and that the new root is now watched.

**Acceptance Scenarios**:

1. **Given** a running workspace-mode server, **When** a source is added to `workspace.json` and Rescan is pressed, **Then** the index includes that root and the watcher is re-registered for it (`0009`'s follow-up, generalised).
2. **Given** a running workspace-mode server, **When** `workspace.json` itself is edited on disk, **Then** the watcher treats it as a change worth re-indexing, exactly as it treats `sources.json`.
3. **Given** a running workspace-mode server, **When** `workspace.json` is made unreadable or invalid, **Then** the last good source list is kept, the failure shows as a config chip, and the server stays up.

---

### User Story 3 - Never mistake a workspace number for a machine number (Priority: P1)

Reza reads "2 FAIL" on the Dashboard. The header says `Workspace · project-agent · 3 sources`, so he reads it as two failures in this workspace, not on his machine.

**Why this priority**: P1 alongside Story 1, not below it. `0017` rejected index-scoping precisely because a count that silently excludes folders is `0015`'s defect in new clothes; the mode being visible is what answers that objection, so shipping Story 1 without it would ship the defect.

**Independent Test**: boot in workspace mode and confirm the header states the mode and source count, and that the Dashboard's headline numbers carry a workspace-relative label; boot in library mode and confirm neither appears.

**Acceptance Scenarios**:

1. **Given** workspace mode, **When** any screen is open, **Then** the header states the workspace name and how many sources it has, in place of the plain `Library` label.
2. **Given** workspace mode, **When** the Dashboard is read, **Then** its counts are labelled as describing this workspace.
3. **Given** library mode, **When** any screen is open, **Then** nothing about workspaces appears — the default experience is unchanged.
4. **Given** workspace mode and a cluster whose other copies are outside the workspace, **When** the artifact page is read, **Then** §5 still answers effective/shadowed **within the workspace** and the panel says so rather than implying the machine was searched.

---

### Edge Cases

- **Workspace file missing, unparseable, empty, or defining no usable source, at boot** → exit non-zero, print the path and the reason. Not a fallback to `sources.json` and not a fallback to §2's examples: both would index *more* than was asked for, which is the failure this mode exists to prevent.
- **The same breakage at rescan/watch time** → keep the last good source list, surface a config chip, stay up.
- **A workspace source path that does not exist** → §2 unchanged: listed with an error chip, app still boots. Only the *workspace file itself* is fatal.
- **`--workspace` with no value, or pointing at a directory with no `.claude/workspace.json`** → exit non-zero naming what was looked for.
- **A directory argument that already ends in `.claude`** → `<dir>/workspace.json`, so both `--workspace <project>` and `--workspace <project>/.claude` work.
- **npm eats the flag** → `npm start --workspace <p>` (no `--`) is npm's own monorepo flag and fails before the script runs. Documented in `README.md`; `DOTCLAUDE_WORKSPACE` is the form that cannot be eaten.
- **Two instances** → the second dies on `EADDRINUSE` unless `--port` is given. The message must name the port and the flag rather than printing a raw stack.
- **A stale snapshot from the other mode** → impossible by construction: the snapshot file is keyed per mode.
- **Duplicate source names inside `workspace.json`** → §2's uniqueness rule and its existing per-entry validation, reused unchanged.

## Requirements *(mandatory)*

### Functional

- **FR-001** The app MUST accept `--workspace <path>`, `--workspace=<path>`, `--ws <path>` and `DOTCLAUDE_WORKSPACE=<path>`, and MUST resolve a file, a project directory, or a `.claude` directory to one workspace file.
- **FR-002** In workspace mode the source list MUST come from that file only, and `sources.json` MUST NOT be read.
- **FR-003** Relative source paths inside a workspace file MUST resolve against the directory containing that file.
- **FR-004** A workspace file MUST use the §2 source contract (`name`, `type`, `path`, `priority`) under a `sources` array, validated by the same rules as `sources.json`.
- **FR-005** A workspace file that cannot be used MUST abort the boot with a non-zero exit and a reason; the same failure after boot MUST retain the last good source list and surface it as a config error.
- **FR-006** Rescan and the watcher MUST re-read the workspace file, so a mapping change needs no restart.
- **FR-007** `workspace.json` MUST be a watched input, and a root added to it MUST become watched without a restart.
- **FR-008** The index snapshot MUST be keyed per mode, so neither mode can serve or overwrite the other's cache.
- **FR-009** `/api/index` stats MUST carry the mode, the workspace name, and the workspace file path, and `configPath` MUST point at the file that actually governs the run.
- **FR-010** Every screen MUST state when the run is workspace-scoped; library mode MUST be visually unchanged.
- **FR-011** The port MUST be overridable via `--port <n>` or `PORT`, and a port already in use MUST fail with a message naming the port and the flag.
- **FR-012** Nothing about this feature may write to an indexed path (D11). The only file written stays the app's own cache.

### Key entities

- **Launch mode** — `library` or `workspace`; resolved once at boot from argv and env; carried in stats.
- **Workspace file** — a JSON document with an optional `name` and a required `sources` array; the sole source of truth for the run.
- **Workspace key** — 8 hex characters derived from the workspace file's absolute path; names its snapshot.

## Success Criteria *(mandatory)*

Invariants, never counts (`CLAUDE.md`): the corpus drifts daily, so no criterion may cite an artifact total.

- **SC-001** In workspace mode, the set of indexed sources equals the set named in the workspace file — no more, no fewer.
- **SC-002** In library mode, every observable behaviour is identical before and after this feature: same sources, same artifact ids, same verdicts, same snapshot file.
- **SC-003** Adding or removing a source in the workspace file, followed by a Rescan, changes the index by exactly that root's artifacts.
- **SC-004** No boot in either mode can serve an index built from the other mode's source list, at any moment including the first paint.
- **SC-005** A reader looking at any screen can tell which corpus the numbers describe without consulting the terminal.
- **SC-006** `npm test` passes under Node and Bun (`0019`), and `npm run validate` honours the same mode selection.

## Assumptions

- One workspace per process. Multiple workspaces in one server would need a per-request corpus and is not asked for.
- The workspace file is hand-authored. The app never creates or edits it (D11).
- `installed_plugins.json` is still read in workspace mode — it is a fact about the machine, not about the corpus, and `0012`'s tiebreak does not change with mode.
- Folder scope (`0017`) still works inside workspace mode: it filters the workspace's own sources in the view, which is consistent rather than redundant.

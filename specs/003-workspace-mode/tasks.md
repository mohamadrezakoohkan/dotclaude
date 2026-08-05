# Tasks: Workspace mode

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Record**: `docs/decisions/0023-a-workspace-file-may-scope-the-index-at-launch.md`

**Branch**: `feat/workspace-mode`

## Format: `[ID] [P?] [Story] Description`

`[P]` = parallelisable with the task next to it. `[US1]`/`[US2]`/`[US3]` = the user story it serves.

## Path conventions

Repo-relative. `src/` is the server, `public/` is the client, `test/run.test.mjs` is the whole suite.

## Boundary — fails the task, not just the review

`002`'s boundary was "nothing under `src/`". This feature's is narrower but just as hard:

1. **Nothing in the scan, classify, parse, link, resolve or validate stages may learn that modes exist.** They receive a source list, exactly as today. If `src/scan.js`, `src/classify.js`, `src/frontmatter.js`, `src/linker.js`, `src/resolver.js` or `src/validators.js` gains the word "workspace", the design is wrong.
2. **Library mode is unchanged (SC-002.)** Same snapshot file, same sources, same ids, same verdicts.
3. **No dependency, no build step** (Principle IV).
4. **Nothing indexed is written** (Principle III, D11).
5. **No probe inside a registered source.** `fs.mkdtemp` only (`CLAUDE.md` → Validation).

## Phase 1: Setup

- **T001** Confirm the suite is green before any change (`npm test`), so a later failure is attributable. *Done: 95/95 at `3b6b6e6`.*
- **T002** Write `workspace.example.json` with no real paths in it (`0021`, `0022`).

## Phase 2: Foundational (blocking prerequisites)

- **T003** `src/config.js`: `resolveMode(argv, env)` → `{mode, workspaceFile, workspaceDir, name, port}`. Pure, exported, no `process` access inside. Accepts `--workspace <p>`, `--workspace=<p>`, `--ws`, `DOTCLAUDE_WORKSPACE`, `--port <n>`, `PORT`. Resolves a file / project dir / `.claude` dir to one file path. (FR-001, FR-011)
- **T004** `src/config.js`: `expandHome(p, base)` — optional base, defaulting to `ROOT_DIR` so library behaviour is untouched. (FR-003, SC-002)
- **T005** `src/config.js`: `loadWorkspace(file)` reusing the existing per-entry source validation, and `loadSources()` branching on the active mode. Returns `{sources, configError, workspace}`; never calls `process.exit`. (FR-002, FR-004, FR-005)
- **T006** `src/config.js`: `setMode()` / `activeMode()` so `loadSources()` sees the mode on every rebuild without re-parsing argv. (FR-006)

## Phase 3: User Story 1 — Point the app at one project (P1) 🎯 MVP

### Tests

- **T007** [P] [US1] `resolveMode`: all four invocations, the `=` form, the alias, the directory and `.claude`-directory forms, and the no-argument case yielding library mode.
- **T008** [P] [US1] `loadWorkspace`: relative paths resolve against the file's directory; `~` still works; malformed entries skipped per §2; a duplicate name reported.
- **T009** [P] [US1] In workspace mode `sources.json` is not read — asserted by pointing the config path at a file that would be a parse error if opened.

### Implementation

- **T010** [US1] `src/server.js`: resolve the mode at boot, call `setMode()`, and exit non-zero with the reason when the workspace file is unusable. (FR-005 boot half)
- **T011** [US1] `src/server.js`: the rebuild path keeps the last good source list when the file breaks after boot. (FR-005 rescan half)
- **T012** [US1] `src/server.js`: boot log names the mode, the workspace file and each root, so a wrong corpus is visible in the terminal before the browser is opened.

## Phase 4: User Story 2 — Change the mapping and press Rescan (P2)

### Tests

- **T013** [P] [US2] `isRelevant('workspace.json')` is true, and the `0009 + 0012` watched-input test's parse is widened to see composed `.json` names rather than only quoted literals.
- **T014** [P] [US2] A source added to the workspace file appears after a rebuild, and the watched set changes with it.

### Implementation

- **T015** [US2] `src/watcher.js`: `workspace.json` is a watched input, with the comment naming `0009`'s follow-up as the precedent. (FR-007)
- **T016** [US2] `src/server.js`: `watchedRoots()` includes the workspace file's own directory when it lies outside every source root, so editing the mapping is seen even then.
- **T017** [US2] `src/snapshot.js`: key the snapshot per mode. (FR-008, SC-004)
- **T018** [US2] Test: the two modes cannot read each other's snapshot — distinct paths, and a workspace snapshot round-trips.

## Phase 5: User Story 3 — Never mistake a workspace number for a machine number (P1)

### Tests

- **T019** [P] [US3] `stats()` carries `mode`, `workspaceName`, `workspaceFile`, and `configPath` names the file that governs the run. (FR-009)
- **T020** [P] [US3] Library mode reports `mode: 'library'` and no workspace fields, so the client can branch on presence.

### Implementation

- **T021** [US3] `public/app.js`: header states `Workspace · <name> · <n> sources` in place of `Library`; Dashboard headline labelled workspace-relative. (FR-010)
- **T022** [US3] `public/styles.css`: banner uses existing §9 tokens only — no new color.
- **T023** [US3] `public/app.js`: the cluster/Duplicates panels say their answer is workspace-relative, so §5's "only copy" is never read as a claim about the machine.

## Phase 6: Polish & cross-cutting

- **T024** `README.md`: both invocations, the npm `--` caveat, the port flag, and one sentence on why the mode is visible on screen.
- **T025** `npm run validate` honours `DOTCLAUDE_WORKSPACE` (free via `config.js`) — asserted, not assumed. (SC-006)
- **T026** Full suite under Node **and** Bun (`0019`).
- **T027** Boot the real `project-agent` workspace, screenshot-free verification from the boot log and `/api/index`; then boot library mode and confirm the source count and snapshot are unchanged (SC-002, SC-004).
- **T028** Flip `0023`'s follow-up ledger row to done in the commit that carries T027.

## Dependencies & execution order

- Phase 2 blocks everything: nothing can be tested before `resolveMode`/`loadSources` exist.
- Phase 3 is the MVP and can ship alone.
- Phase 4 and Phase 5 are independent of each other; both depend on Phase 3.
- T017 (snapshot key) must land before any manual verification, or a workspace run pollutes the library cache — the exact defect research.md found.
- Phase 6 last, and T027 before T028 always: the ledger row is a claim about a run that happened.

### Parallel opportunities

T007/T008/T009 are one file but independent assertions; T013/T014 likewise; T019/T020 likewise. The `[P]` marks are honest about that rather than implying separate files.

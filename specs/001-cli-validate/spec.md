# Feature Specification: Companion CLI — `validate`

**Feature Branch**: `feat/cli-validate` (spec directory `001-cli-validate`)

**Created**: 2026-08-04

**Status**: Accepted — Reza delegated feature-level decisions for this iteration ("decide best decisions and recommendations on your own", 2026-08-04)

**Input**: §12's v1.5 roadmap row, reserved as `001` by record `0014` answer 2: *"Companion CLI: `validate` command emitting the checklist's exact output contract (`VERDICT:` last line) for CI gates — reuses the validator unchanged; makes chips enforceable in PRs."*

**Extends** (cited, not restated): **§6** (the 16 validators, the automation split, the verdict chip, the `VERDICT: PASS|FAIL` output contract), **§10** (one process, zero dependencies, localhost trust boundary), **§12** (this is the v1.5 row), **D9/D10** (validation authority; only deterministic checks may score 0), **D11/§11** (read-only; no verdict is persisted). Read those in the design spec; this file adds only what is new.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Gate a PR on the validators that already exist (Priority: P1)

A CI job runs one command over the artifacts a change touched. It exits 0 when they pass and non-zero when a deterministic blocker fires, and its last line states the verdict in the exact form §6 fixed. Nobody has to open the app to find out that a skill's name stopped matching its folder.

**Why this priority**: this is the feature. §12's justification is "makes chips enforceable in PRs", and an exit code is what makes a chip enforceable.

**Independent test**: run the command against a file known to fail a deterministic check and against one known to pass; confirm the exit codes differ and the last line of each is `VERDICT: FAIL` / `VERDICT: PASS`.

**Acceptance Scenarios**:

1. **Given** an artifact whose frontmatter does not parse, **When** the command runs over it, **Then** the process exits non-zero and the last line is exactly `VERDICT: FAIL`.
2. **Given** artifacts that raise only heuristic findings, **When** the command runs, **Then** it exits 0 — D10 forbids a heuristic from producing FAIL, and a gate that blocks on WARN would make D10 pointless.
3. **Given** several paths, **When** any one of them FAILs, **Then** the process exits non-zero once and reports every artifact's verdict, not just the first failure.
4. **Given** no paths at all, **When** the command runs, **Then** it validates every artifact in every configured source and gates on the whole corpus.

### User Story 2 — See *why* it failed without opening the app (Priority: P2)

The output names the failing validator and its note, so a CI log is enough to act on.

**Why this priority**: separable from the gate — an exit code alone is usable but forces a second trip to the app. It ships after P1.

**Independent test**: fail one artifact on a structural check and confirm the output names the check and its reason.

**Acceptance Scenarios**:

1. **Given** an artifact failing validator 1 (Overlap), **When** the command runs, **Then** the output names the validator and the colliding source.
2. **Given** an artifact that passes, **When** the command runs without a verbosity flag, **Then** it is reported in one line and does not bury the failures.

### Edge Cases

- **A path that is not an artifact** (a `README.md`, a `.ts` file): reported as skipped, not as a failure. A CI job passing a whole changed-file list must not fail because one of them is a source file.
- **A path that does not exist**: reported as an error and gates the run, because a CI job silently validating nothing is worse than one that stops.
- **A path outside every configured source**: still validated, but validator 1 (Overlap) and 6 (siblings) have no cross-artifact context for it. That limitation is stated in the output rather than hidden, since a partial index can make Overlap wrong (§5's cross-source logic is the same trap `0017` avoided).
- **An empty corpus / no sources configured**: exits 0 with `VERDICT: PASS` and says it validated nothing — the same reading `npm test` gives on an empty suite.
- **Every artifact FAILs**: one non-zero exit, not one per artifact.

## Requirements *(mandatory)*

- **FR-001**: The CLI MUST accept zero or more paths. With paths, it validates those artifacts; with none, every artifact in every configured source.
- **FR-002**: The last line of stdout MUST be exactly `VERDICT: PASS` or `VERDICT: FAIL` — the contract §6 fixes and `src/prompt.js` already exports as `VERDICT_CONTRACT`.
- **FR-003**: The exit code MUST be 0 for PASS and non-zero for FAIL, because that is what makes the verdict a gate.
- **FR-004**: FAIL MUST mean what §6 means by it — a deterministic check scored 0. A WARN MUST NOT gate (D10).
- **FR-005**: The CLI MUST reuse `validateArtifact` and `buildValidationIndex` unchanged. No validator logic may be duplicated or re-tuned for the CLI; a verdict from the CLI and a chip in the app MUST agree for the same artifact.
- **FR-006**: The CLI MUST build the cross-artifact index before validating, so validators 1 and 6 see the whole corpus rather than only the named paths.
- **FR-007**: Output MUST name the failing validator and its note for each FAIL.
- **FR-008**: A path that is not a classifiable artifact MUST be reported as skipped and MUST NOT gate.
- **FR-009**: A path that cannot be read MUST gate, and MUST say which path.
- **FR-010**: The CLI MUST write nothing, anywhere — no verdict cache, no report file (D11, §11).
- **FR-011**: The CLI MUST add no runtime dependency and no build step (§10), and MUST run under both Node and Bun (record `0019`).
- **FR-012**: The CLI MUST be invocable as an `npm` script, so CI does not depend on a path into `src/`.

## Success Criteria *(mandatory)*

Phrased as invariants, per `CLAUDE.md` — the corpus drifts, so counts are evidence rather than bars.

- **SC-001**: For every artifact, the CLI's verdict and the app's chip are **the same verdict**. Divergence means the validator was duplicated somewhere.
- **SC-002**: The exit code is 0 **if and only if** no deterministic check scored 0 across the validated set.
- **SC-003**: The final line of stdout matches `/^VERDICT: (PASS|FAIL)$/` on **every** run — success, failure, empty set, and unreadable path alike.
- **SC-004**: Validating a subset of paths yields the **same per-artifact verdicts** as validating the whole corpus. A narrower invocation must not change an answer, which is FR-006 made observable.
- **SC-005**: A non-artifact path never changes the exit code.
- **SC-006**: The CLI writes nothing: the working tree and any cache directory are byte-identical before and after a run.
- **SC-007**: `node` and `bun` produce identical output for the same corpus at the same moment — same-moment and line-by-line, per `0019`'s method note.

## Assumptions

- **CI passes changed files**, so mixed lists of artifacts and non-artifacts are the normal input, not an edge case.
- **The whole index is built even for one path.** Slower, but FR-006 requires it and SC-004 makes the alternative observable as a bug.
- **Output goes to stdout, diagnostics may go to stderr**, and only stdout's last line carries the contract.
- **No flags in this feature.** Verbosity, JSON output and `--fix` are all plausible and none is required by §12's row; adding them now would be inventing scope.

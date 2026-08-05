# Implementation Plan: Companion CLI — `validate`

**Branch**: `feat/cli-validate` (spec dir `001-cli-validate`) | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

## Summary

One new file, `src/cli.js`, and one `npm` script. It builds the index the server already builds, runs the validators unchanged, prints a verdict per artifact and the §6 contract as its last line, and exits non-zero when a deterministic check scored 0.

## Technical Context

Inherited, not chosen here — §10 and records `0005`/`0019` fixed these for the whole app.

**Language/Version**: JavaScript ES modules. **Verified on Node and Bun** (record `0019`), which now includes the test suite.

**Primary Dependencies**: none, and none may be added (§10, constitution Principle IV). No argument-parsing library — this CLI takes paths and no flags.

**Storage**: none. The CLI writes nothing (FR-010, D11).

**Testing**: `node:test` in `test/run.test.mjs`, appended. The existing tests are not modified.

**Target Platform**: a terminal, and a CI runner. Unlike the server this has no localhost surface at all, which makes §10's trust boundary strictly easier rather than harder.

**Project Type**: single-process local app plus, now, a second entry point.

**Performance**: it builds the whole index (~3 s on the real corpus) even for one path, because FR-006 requires cross-artifact context. Acceptable for CI; SC-004 is what makes the cheaper alternative visible as a wrong answer rather than a fast one.

**Constraints**: reuse the validators unchanged (FR-005); gate on deterministic zeros only (FR-004, D10); write nothing (FR-010).

## Constitution Check

| Principle | Verdict |
|---|---|
| **I. Decision log append-only** | **PASS** — no new record. §12's v1.5 row already sanctions a companion CLI and `0014` answer 2 reserved `001` for it, so this is planned product, not a new decision. See the note below on §10. |
| **II. Publishing needs a fresh ask** | **PASS** — nothing published; no remote, no push. |
| **III. Read-only** | **PASS** — FR-010 forbids writing anything, and the CLI has no code path that opens a file for writing. |
| **IV. Zero runtime dependencies** | **PASS** — no dependency, no build step, no `src/ → .specify/` reference. No flag parser. |
| **V. One name per concept** | **PASS** — the CLI says **verdict**, **artifact**, **source**, **validator**, matching §6. It prints no "badge" and no "score card". |
| **Post-v1 only** | **PASS** — §12 v1.5. |

**Does a second entry point change §10's "one process"?** No, and the reasoning is worth recording rather than assuming: §10's phrase describes the *server's* architecture — scanner through SPA in one process, no worker tier, no daemon. A CLI that runs, prints and exits adds no process to the running app; §12 anticipated it explicitly in the same spec. If it had needed a build step or a dependency, that would be a §10 change and would need a record. It needs neither.

## Project Structure

```text
src/
├── cli.js               # NEW — the only new file
├── indexer.js           # unchanged — buildIndex() reused as-is
├── validators.js        # unchanged — FR-005 forbids touching it
├── prompt.js            # unchanged — VERDICT_CONTRACT reused
└── …                    # everything else unchanged

package.json             # CHANGED — one script: "validate"
test/run.test.mjs        # CHANGED — tests appended
```

**Structure Decision**: `src/cli.js`, beside the server rather than in a `bin/`. `src/` is where this project's modules live and `src/search.js` is already shared beyond the server, so a new directory would buy nothing. The CLI imports `buildIndex` and `validateAll`; it re-implements no stage of the pipeline.

## Design

**The gate rule, stated once.** A run FAILs if any validated artifact's `validation.verdict === 'FAIL'`. §6 already defines that as "a deterministic check scored 0", and `summarize()` in `src/validators.js` is the single place that decides it. The CLI must not recompute the rule — reading `verdict` is what keeps SC-001 true by construction rather than by agreement.

**Path resolution.** With no arguments, every artifact in the index. With arguments, resolve each to an absolute path and match it against the index by `absPath`. A path that resolves to nothing indexed is either a non-artifact (skip, no gate — FR-008) or missing (gate — FR-009); the difference is whether the file exists on disk.

**Why the whole index, always.** Validators 1 and 6 read `buildValidationIndex` over the full artifact set. Validating one file against an index of one would report "no same-scope name collision" for an artifact that genuinely collides — a false PASS, which is worse than the 3 s. This is the same class of error `0017` refused for folder scope: a narrowed input making a cross-artifact answer wrong rather than partial.

**Output shape.** One line per artifact, failures expanded with the validator id, title and note. A trailing blank line, then the contract. Nothing after the contract line, ever — `src/prompt.js`'s comment already makes that point for the paste-prompt, and the same reasoning applies to a CI log that gets tail'd.

## Complexity Tracking

No violations, so this table is empty and says so.

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| — | — | — |

## A note on proportionality

`002-folder-scope` produced six planning documents for a sidebar panel, and the merge that shipped it said that was worth doing once to prove the flow but is "not a precedent for every v1.x tweak". So this feature has **four**: spec, plan, `contracts/cli.md` (a CLI's argv/stdout/exit-code contract is exactly what that directory is for), and `quickstart.md` (how to run it, which a CLI needs more than a UI does).

`research.md` and `data-model.md` are deliberately absent: nothing was unknown that §6, §10, §12 and `0019` had not already fixed, and the feature introduces no entity. Writing them empty would be the ceremony `0018`'s bar exists to resist.

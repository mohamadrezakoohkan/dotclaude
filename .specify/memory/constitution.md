<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (2026-08-03). Governance → Compliance rewritten from record
  `0016`, which narrowed `0014` answer 1: /speckit-analyze cannot audit a v1 amendment because it
  aborts without a specs/###-<slug>/ dir, so the record-to-spec check is a native governance test.
  MINOR rather than PATCH: the compliance mechanism is materially different, not merely clarified.
  Regenerated FROM the accepted record, never ahead of it, per the amendment procedure below.
  Found by /speckit-analyze on 002-folder-scope; `0016` had not listed this file under "Files or
  areas affected", and the log is append-only, so that omission stands uncorrected by design.
- Previous version change: none → 1.0.0 (initial ratification; template placeholders replaced)
- Modified principles: none (no prior version)
- Added sections: five Core Principles, Technical Constraints, Development Workflow, Governance
- Removed sections: none. The bundled template's governance example line
  "Constitution supersedes all other practices" was deliberately NOT adopted — it inverts the
  precedence fixed by record 0014.
- Deferred TODOs: none
- Derivation: every principle below restates CLAUDE.md or docs/dotclaude-design-spec.md.
  Nothing here originates in this file.
-->

# dotclaude Constitution

This document is **process only**, and **subordinate to `CLAUDE.md`** (record `0014`). It contains
no rule that `CLAUDE.md` or the spec does not already state; it exists so spec-kit's commands have
something concrete to check work against. Where it disagrees with `CLAUDE.md`, `CLAUDE.md` wins and
this file is the defect.

## Core Principles

### I. The Decision Log Is Append-Only (NON-NEGOTIABLE)

The spec is amended by a record in `docs/decisions/`, never by silent edit. Records are append-only:
to reverse one, write a new record and mark the old `Superseded by NNNN`, leaving its text unchanged.
`docs/decisions/` MUST NOT move into `.specify/`, and MUST NOT be regenerated from any other
artifact — that tree is written by overwrite, and an append-only log cannot survive there.

**Decision-first rule**: if implementation reveals the spec is wrong, stop coding, write the record,
get approval, then continue. A change to a spec §1 row, a new or removed lasting constraint, or a
choice future sessions must respect is a decision. Renaming a CSS token is not.

*Rationale*: this log has caught five spec defects that the code alone would have hidden (`0003`,
`0004`, `0005`, `0009`, `0010`). It is the mechanism that has actually been finding errors.

### II. Publishing Requires A Fresh Ask, Every Time (NON-NEGOTIABLE)

This repo has no remote. A "PR" is a `--no-ff` merge into `main` whose commit body *is* the PR
description. Merge only when Reza asks, and only after the app has been run from `main` — not from
the branch. Creating a remote, pushing, or publishing anywhere requires a fresh explicit ask on each
occasion; prior permission to merge is never permission to push.

*Rationale*: record `0006`. The index is a map of a private machine — absolute paths, internal repo
names, plugin versions. Merging is local and reversible; pushing is neither.

### III. Read-Only

The app never writes, creates, edits, or deletes any artifact it indexes. "Open in editor" hands off
to VS Code or the default app. "Make identical" is offered nowhere. Manual validation verdicts are
not persisted.

*Rationale*: D11 and the §11 non-goals. A tool that reads a developer's whole instruction library is
safe to run precisely because it cannot change it.

### IV. Zero Runtime Dependencies

One process, no build step, no runtime dependencies, no `Bun.*` API — the Node/Bun intersection,
verified on Node (record `0005`). The server binds localhost only; no auth, no telemetry, nothing
leaves the machine. Author-time tooling (Python, `uv`, spec-kit itself) is not a runtime dependency
and MUST NOT become one: nothing under `src/` may reference `.specify/`.

*Rationale*: §10. The trust boundary and the dependency budget are the same promise stated twice.

### V. One Name Per Concept

The spec's terms are used exactly, in code, docs and records alike: **artifact, source, cluster,
effective, Resolution bar, decision log, chip**. "chip" is never "badge". A concept that acquires a
second name is a defect, not a synonym.

*Rationale*: validator 15, and the drift it caught on 2026-07-29.

## Technical Constraints

- The design spec `docs/dotclaude-design-spec.md` §1–§13 stays whole and is the authority on the
  product. It is not fragmented into `specs/###-<slug>/` (record `0014`).
- `specs/###-<slug>/` is for post-v1 features only. Each cites the spec sections it extends and
  restates none of them.
- Validation authority is the real `validate-skill` and `validate-agent` skills (D9). Only
  deterministic checks may score 0; heuristics score at most "partial" (D10).
- Extensions MUST NOT be installed without a decision record. Specifically: never `agent-context`
  (it targets `CLAUDE.md`, which `AGENTS.md` symlinks to), never `git` (it can create remotes,
  which Principle II forbids).

## Development Workflow

- Loop per task: **spec → plan → implement → validate**. The plan is presented and approved before
  implementation begins.
- One task per session, one branch per task, `feat/<topic>` in the build phase. Plans live at
  `docs/plans/<topic>.md` and name the spec sections they touch.
- Commits reference the decision record ID when the task implements one.
- Any edit to a skill or command runs `validate-skill`; an agent runs `validate-agent`. A failing
  script blocks the merge.

## Governance

**This constitution does not supersede other practices.** Precedence is fixed by `CLAUDE.md` and
record `0014`: (1) Reza's in-session instruction, (2) `CLAUDE.md`, (3) this constitution — process
only, and only what rows 2 and 4 already imply, (4) the spec, the authority on the product.

Amendment procedure: a change here that adds or removes a lasting constraint requires a decision
record first. The record is written, approved, and only then is this file regenerated from it —
never the reverse. Running `/speckit-constitution` is a decision, not an edit.

Versioning: MAJOR for a backward-incompatible principle removal or redefinition, MINOR for a new or
materially expanded principle, PATCH for clarifications.

Compliance: every plan names the spec sections it touches, and every milestone's validation step
re-reads the accepted records against those sections. An accepted record whose "Spec sections to
update" was never applied is a finding rather than an accident, and the check is **native** — a
governance test in `npm test` asserts that every Accepted record directing a numbered spec edit
cites its own ID in the design spec (record `0016`). `/speckit-analyze` performs the same check
across one post-v1 feature's `spec.md`, `plan.md` and `tasks.md`, but it aborts without a
`specs/###-<slug>/` directory and so cannot reach a v1 amendment; it supplements the test rather
than replacing it.

**Version**: 1.1.0 | **Ratified**: 2026-07-29 | **Last Amended**: 2026-08-03

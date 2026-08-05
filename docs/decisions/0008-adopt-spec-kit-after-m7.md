# 0008 — Adopt spec-kit, after M7, on an explicit go-ahead

- Status: Accepted — approved by Reza's instruction "I want spec kit for real, continue till m7 and then wait before spec kit" (2026-07-29)
- Date: 2026-07-29
- Supersedes: `0007` (which recommended against adopting spec-kit)

## Context

`0007` recommended borrowing only spec-kit's `analyze` idea and building a bespoke `spec-audit` skill instead. Reza decided otherwise: spec-kit is adopted for real. Its research stands — the tool survey, the overlap table, the prerequisite check (Python 3.14.6, uv 0.9.21, `uvx` present) and the verified init syntax are all still the inputs to this decision. Only `0007`'s Decision line is reversed.

Two things from `0007` remain binding as constraints rather than objections:

1. **spec-kit has no decision log.** Its model regenerates downstream artifacts from a spec; this project's model amends the spec through append-only records. During M0 that log caught three spec defects in one day (`0003`, `0004`, `0005`). Adoption must therefore say where `docs/decisions/` lives inside spec-kit's structure — it cannot simply be dropped, and spec-kit offers no home for it.
2. **Granularity mismatch.** spec-kit is per-feature (`specs/###-feature/`) and greenfield-oriented; the spec here is one coherent design document, amended three times, mid-sequence. Adoption must choose deliberately between fragmenting it and layering spec-kit over it unchanged.

Sequencing after M7 is the point of the decision. Switching process mid-sequence would mean M1–M7 straddling two structures, each milestone paying migration cost, with no way to tell process churn from real defects. After M7 the v1 spec is closed, so it can be migrated once, whole, against a working app.

## Decision

Adopt spec-kit once M7 is merged and v1 is done, and stop there for an explicit go-ahead from Reza before running `specify init`.

## Trade-off accepted

M1–M7 run without a cross-artifact consistency pass, which is the one capability `0007` identified as genuinely missing — accepted because the alternative is building a throwaway `spec-audit` skill that spec-kit's own `/speckit.analyze` would replace weeks later.

## Consequences

- **Spec sections to update:** none. §12's roadmap covers product features; this is working practice, so it lives in `docs/plans/v1-milestones.md` as a post-M7 entry.
- **`0007`'s follow-up is cancelled:** no `spec-audit` skill is built. Drift during M1–M7 is instead caught by each milestone's existing validation step, which must re-read the accepted records against the spec sections it touches — no new artifact, and it is where M0's defects would have surfaced anyway.
- **M1–M7 proceed unchanged.** No milestone plan is rewritten in spec-kit's format, and no `.specify/` directory exists until after M7.
- **Adoption is one command but not a small change:** `specify init --here --integration claude --force`. `--integration claude` installs skills into `.claude/skills/` alongside `decide-and-continue`, and `--force` merges or overwrites in a non-empty directory. Run it on its own branch so the generated tree can be read and reverted.
- **The adoption task must answer, before any command runs:** where the decision log lives; whether §1–§13 fragments into `specs/###-feature/` or stays whole; what happens to `CLAUDE.md` when `/speckit.constitution` wants to own the same ground; and whether the Q1–Q3 reply format survives `/speckit.clarify`.
- **Follow-up task:** after M7, write the adoption plan as `docs/plans/spec-kit-adoption.md` and wait for Reza's go-ahead before executing it.

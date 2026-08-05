# 0007 — Borrow spec-kit's `analyze` idea; do not adopt spec-kit

- Status: Superseded by `0008` — Reza chose full adoption, scheduled after M7. The research and the two constraints below carry into `0008`; only this record's Decision line is reversed. Text left unchanged, per the append-only rule.
- Date: 2026-07-29
- Supersedes: —

## Context

Reza asked whether [github/spec-kit](https://github.com/github/spec-kit) can be integrated. It can: prerequisites are already met on this machine (Python 3.14.6, uv 0.9.21, `uvx` present) and adoption is a single command — `specify init --here --integration claude`, with `--force` to merge into a non-empty directory. Verified from `specify init --help`, not from memory.

Sources consulted: the [repo](https://github.com/github/spec-kit), the [reference docs](https://github.github.io/spec-kit/reference/overview.html), [Microsoft's walkthrough](https://developer.microsoft.com/blog/spec-driven-development-spec-kit/), and [LogRocket's review](https://blog.logrocket.com/github-spec-kit/).

The problem is not feasibility, it is redundancy. spec-kit's workflow maps almost one-to-one onto process this project already runs:

| spec-kit | dotclaude equivalent |
|---|---|
| `/speckit.constitution` → governing principles | `CLAUDE.md` — precedence, way of working, phase gate |
| `/speckit.specify` → `specs/###-feature/spec.md` | `docs/dotclaude-design-spec.md` §1–§13 |
| `/speckit.plan` → `plan.md` | `docs/plans/<topic>.md`, approved before code |
| `/speckit.tasks` → `tasks.md` | `docs/plans/v1-milestones.md`, M0–M7 with done-when clauses |
| `/speckit.implement` | the build-phase loop |
| `/speckit.clarify` | the Q1–Q3 reply format |
| `/speckit.checklist` | §6 validators + the real `validate-skill` / `validate-agent` |
| `/speckit.analyze` — cross-artifact consistency | **nothing** |
| — | `docs/decisions/` — append-only log with supersession |

Two asymmetries decide this:

1. **spec-kit has no decision log.** Its model is "the spec is the source of truth, regenerate downstream artifacts from it". dotclaude's model is "the spec is amended by an append-only record that says what was learned and what it superseded". That log is not ceremony — it earned its place during M0, catching three spec defects in one day: name-derived ids that dropped half the corpus (`0003`), a validation checklist that never existed (`0004`), and a runtime claim for an uninstalled runtime (`0005`). Adopting spec-kit wholesale would replace the mechanism that has actually been finding errors with one that has no equivalent.
2. **Granularity mismatch.** spec-kit is per-feature (`specs/###-feature/`) and oriented to greenfield 0-to-1. dotclaude's spec is one coherent design document for a single small app, already merged through M0 of M7 and amended three times. Retrofitting means either fragmenting a spec that works, or running two parallel structures and keeping them in sync by hand — which is the exact failure mode `/speckit.analyze` exists to catch.

Also noted, as practical risk: `--integration claude` installs skills by default, writing into `.claude/skills/` alongside `decide-and-continue`, and `--force` merges or overwrites in a non-empty directory. Both are recoverable from git, but neither is free.

What spec-kit has that this project genuinely lacks is `analyze`: an explicit cross-artifact consistency pass. Every drift caught during M0 was caught by hand, incidentally, while doing something else. That is not a repeatable mechanism.

## Decision

Do not adopt spec-kit; instead add a `spec-audit` skill to this project that performs spec-kit's `analyze` role — checking the spec, the decision log, the milestone plan and the code against each other and reporting drift.

## Trade-off accepted

Foregoes spec-kit's tooling, presets and its 30+ agent integrations, and means maintaining one small skill by hand — accepted because every other command in the suite duplicates something already working here, and because a Python + uv dependency chain is a heavy price for a project whose §10 budget is zero dependencies.

## Consequences

- **Spec sections to update:** none. This is working practice, so it lands in `CLAUDE.md` if the audit becomes a required step.
- **Files or areas affected:** a new `.claude/skills/spec-audit/SKILL.md`.
- **What the audit must check,** derived from the three defects M0 actually produced: every §1 row and every numbered claim in §2–§13 still matches the code; every accepted record's "Spec sections to update" was really applied; no document names an artifact that does not exist on disk (this is what `0004` caught); terminology has one name per concept (validator 15, which caught `badge`/`chip`).
- **Revisit at a phase boundary, not mid-milestone.** If spec-kit is wanted for real, the moment is after M7 when v1 is done — and that record must say where the decision log lives inside spec-kit's structure, because spec-kit has no home for it.
- **Follow-up task:** build `spec-audit` and run it against the current tree; it should reproduce the `badge`/`chip` and phantom-checklist findings from a cold start, or it is not yet good enough.

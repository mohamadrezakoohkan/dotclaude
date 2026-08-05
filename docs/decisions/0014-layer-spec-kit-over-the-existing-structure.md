# 0014 — Layer spec-kit over the existing structure; the decision log, the spec and `CLAUDE.md` all stay put

- Status: Accepted — approved by Reza's approval of `docs/plans/spec-kit-adoption.md` ("go ahead", 2026-07-29) and his instruction to continue through the adoption steps
- Date: 2026-07-29
- Supersedes: — (implements `0008`; `0008` stays Accepted)

## Context

`0008` accepted spec-kit and required four questions answered *before* any command ran. `docs/plans/spec-kit-adoption.md` answered them; `specify init --here --integration claude --force` then ran on `feat/spec-kit-adoption` against the pinned CLI build `git+https://github.com/github/spec-kit.git@afbb2c7`. This record fixes the four answers as constraints future sessions must respect, so they are not re-decided per task.

What the command actually did, verified against a pre-init manifest and checksums rather than by eye: 10 skills into `.claude/skills/speckit-<name>/`, 18 files into a new `.specify/`, **zero tracked files modified**, nothing removed. `CLAUDE.md`, the `AGENTS.md` symlink and `decide-and-continue` are byte-identical to their pre-init checksums. No `.github/` was created — the "bundled workflow" is spec-kit's own definition under `.specify/workflows/`. Skills are invoked `/speckit-analyze`, with a dash, not the dotted form `0008` recorded.

Current external guidance was checked before writing this, per `CLAUDE.md`. It supports layering rather than retrofitting: spec-kit performs best greenfield, where the constitution precedes the code, and is reported to struggle against established codebases; the brownfield advice is to keep tooling updates separate from artifact evolution. Sources: the [repo](https://github.com/github/spec-kit), the [brownfield discussion](https://github.com/github/spec-kit/discussions/331), the [complex-brownfield discussion](https://github.com/github/spec-kit/discussions/746), EPAM's [brownfield walkthrough](https://www.epam.com/insights/ai/blogs/using-spec-kit-for-brownfield-codebase) and [Spec Kit overview](https://www.epam.com/insights/ai/blogs/inside-spec-driven-development-what-githubspec-kit-makes-possible-for-ai-engineering), plus `0007`'s four original sources.

Two facts read out of the installed tree decide two of the four answers on their own:

- `.specify/memory/constitution.md` is written back **by overwrite** (`speckit-constitution`, step 6: *"Write the completed constitution back … (overwrite)"*).
- The bundled `constitution-template.md` proposes, as its own governance example, *"Constitution supersedes all other practices"* — a line that would invert this project's precedence if accepted unread.

## Decision

Layer spec-kit over the existing structure without moving anything it did not create: the decision log stays at `docs/decisions/`, the design spec stays whole with `specs/###-<slug>/` used only for post-v1 features, `CLAUDE.md` outranks the constitution, and the Q1–Q3 reply format is unchanged.

## Trade-off accepted

v1 gets no retrospective spec-kit artifacts and the suite's value is unproven until the first post-v1 feature runs through it — accepted because the alternative is paraphrasing a spec that is already correct, and because fragmenting §1–§13 would break every `§`-anchored cross-reference in `0004`, `0009`, `0012` and `0013`.

## The four answers

1. **`docs/decisions/` does not move.** An append-only log cannot live inside a directory whose one existing file is defined by overwrite. The constitution names the log by path and forbids regenerating it. `/speckit-analyze` takes the log as an input, which turns *"an accepted record's 'Spec sections to update' was never applied"* into a checkable finding — the capability `0007` found missing, delivered by the tool rather than by the `spec-audit` skill `0008` cancelled.
2. **Spec §1–§13 stays whole.** `specs/###-<slug>/` starts forward, at the §12 roadmap (`001-cli-validate` first). Each feature spec cites the design-spec sections it extends and restates none of them. No migration.
3. **`CLAUDE.md` outranks the constitution**, which becomes precedence row 3, process-only, and may contain nothing not derivable from `CLAUDE.md` or spec §1. A collision between the two is a defect in the constitution, fixed `CLAUDE.md`-first. Running `/speckit-constitution` is a decision, not an edit: any lasting constraint it adds or removes needs a record first, and the constitution is regenerated *from* the record, never the reverse.
4. **Q1–Q3 survives unchanged.** `/speckit-clarify` is one-shot and per-feature; Q1–Q3 is per-reply and about the project's state. `0007`'s overlap table paired them, and that is the one row of it that does not survive contact. The single adjustment: inside a `/speckit-clarify` reply, Q1–Q3 must not restate questions that command already asked.

## Standing guards

- **Never install the `agent-context` extension.** Its default target for the claude integration is `CLAUDE.md`, and `AGENTS.md` here is a symlink to it — a tool writing either path rewrites the governing file through a symlink, outside the 100-line budget and outside this procedure.
- **Never install the `git` extension.** It ships `/speckit-git-remote` and `initialize-repo.sh`; `0006` requires a fresh explicit ask before any remote exists, and a slash command that creates one is exactly the boundary `0006` was written to hold. Its auto-commit also bypasses the record-ID commit rule.
- **Do not gitignore `.claude/`,** as `specify init` advises on exit. That would untrack `decide-and-continue` and hide the adoption artifact itself.
- **`.specify/` is committed,** not ignored: an ignored tree cannot be reverted by `git checkout`.

## Consequences

- **Spec sections to update:** none. §1–§13 is unchanged by this record; adoption is working practice. §10's zero-dependency budget is untouched and was verified literally — `grep -rn "specify" src/ test/ public/` returns nothing, so the served process gained no dependency. Python and `uv` are author-time tools, not runtime ones.
- **Files or areas affected:** `CLAUDE.md` (Precedence, Way of working, Decision records, Reply format — four lines), `.specify/memory/constitution.md`, and the generated tree listed above.
- **The index grew 581 → 591**, since `sources.json` registers this repo as a source at priority 100. dotclaude now indexes and validates spec-kit's own skills.
- **Follow-up task:** record `0015` — all 10 speckit skills fail the structural pre-check because their frontmatter carries a nested map under `metadata:`, the shape spec §3 states appears zero times in the corpus. Adoption imported the counterexample; §3's claim needs either a parser that supports one level of nesting or a corrected sentence.

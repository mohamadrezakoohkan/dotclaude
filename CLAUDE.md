# dotclaude — project instructions

dotclaude is a local web app that indexes `.claude/` and `.cursor/` artifacts across folders and presents them as a linked wiki.
**What to build** lives in `docs/dotclaude-design-spec.md` (the spec). **How to work** lives here. Read the spec sections a task touches before planning it, and name those sections in the plan.

## Current phase — read first

- Phase: **build** (entered via record `0002`). Application code is in scope; work the milestone sequence in `docs/plans/v1-milestones.md`, one milestone per task.
- The phase changes only through an accepted decision record (see below) that says so.

## Precedence

When instructions collide, this order wins:

1. Reza's in-session instruction
2. This file
3. `.specify/memory/constitution.md` — process only, and only what rows 2 and 4 already imply (record `0014`)
4. The spec — the authority on the product

An in-session instruction that diverges from the spec in a lasting way must become a decision record before the change merges. A collision between rows 2 and 3 is a defect in the constitution: fix this file first, then regenerate.

## Way of working

- Loop per task: **spec → plan → implement → validate**. Present the plan and wait for Reza's approval before implementing.
- Start a new task in a fresh session. Carry forward the spec and the relevant decision records, not prior chat history.
- Branch names are explicit in every plan: `docs/<topic>` during ideation, `feat/<topic>` once the build phase starts. One branch per task.
- The spec stays whole (`0014`). spec-kit's `specs/###-<slug>/` is for post-v1 features only — each cites the spec sections it extends and restates none of them.
- Commits reference the decision record ID (e.g. `0002`) when the task implements one.

## Publishing (records `0006`, `0021`)

- An `origin` remote exists (`0021`). **It has never been pushed to, and a push needs a fresh ask every time** — `0006`'s "prior permission to merge is never permission to push" survives unchanged. Before the first push, `0021`'s open question must be answered: 19 documents name internal repos as evidence, and the log cannot be redacted (Principle I).
- A "PR" here is still a `--no-ff` merge into `main` whose commit body *is* the PR description: what shipped, the numbers, defects found, what is carried forward. `--no-ff` keeps the task's commits readable under one merge point.
- `sources.json` is **untracked** (`0021`) because it maps a real machine. Copy `sources.example.json` to start.
- **Publishing is a manual re-derivation, force-pushed over `main`** (`0022`). It discards anything else on that branch, and the public copy is a **snapshot, never a mirror** — it drifts from the next local commit onward and only catches up when Reza asks. There is deliberately no script, because one would have to carry the redaction mapping.
- **Bulk file edits iterate `git ls-files`, never a filesystem walk.** A walk reaches ignored files, which `git status` then hides, so damage to them is invisible and — once untracked (`0021`) — unrecoverable by checkout. This deleted the real `sources.json` on 2026-08-04; keep it backed up (`*.bak` is ignored).
- **A scrub is not a scrub until history is checked.** Editing files leaves every earlier version reachable — `git show <sha>:<path>` and `git log -S` still return it, so a push publishes the unscrubbed text. Verify with `git log --all -S"<term>"`, not with `git grep`. This was nearly published as "clean" on 2026-08-04.
- Merge only when Reza asks for it, and only after the app has been run from `main` — not from the branch.
- **Never create a remote, push, or publish without asking, every time.** This index contains absolute paths and private repo contents from Reza's machine; pushing sends them to a third party. Prior permission to merge is never permission to push.
- Keep the feature branch after merging. Its history is the task record and deleting it buys nothing.

## Reply format

End every reply to Reza with exactly three bold follow-up questions, one or two lines each, about this project's current state — not generic:

- **Q1** — the next step to take
- **Q2** — a risk in the current approach
- **Q3** — an alternative worth considering

Exception: when Reza writes `#SHORT`, reply in 5 sentences max, no lists, no Q1–Q3.

This survives spec-kit unchanged (`0014`): `/speckit-clarify` is one-shot and per-feature, Q1–Q3 is per-reply. Inside a `/speckit-clarify` reply, do not restate questions that command already asked.

## Decision records — when a decision changes

Binding decisions live in spec §1 (D1–D14) plus `docs/decisions/`.

**What counts as a decision:** a change to a §1 row, a new or removed lasting constraint, or a choice between alternatives that future sessions must respect. Example: switching index storage (D2) from in-memory to SQLite is a decision. Renaming a CSS token is not — just do it.

**Procedure:**

1. Copy `docs/decisions/TEMPLATE.md` to `docs/decisions/NNNN-<kebab-slug>.md` (NNNN = next sequential number).
2. Fill every section. Set `Status: Accepted` after Reza approves; use `Proposed` while discussing.
3. Update the spec §1 table (Choice + Trade-off columns) in the same commit.
4. To reverse a decision, write a new record and mark the old one `Superseded by NNNN`. Keep the old record's text unchanged — the log is append-only.

`docs/decisions/` never moves into `.specify/` — that tree is regenerated by overwrite (`0014`). Running `/speckit-constitution` is a decision, not an edit: write the record first, then regenerate the constitution from it, never the reverse.

**Decision-first rule:** if implementation reveals the spec is wrong, stop coding, write the record, get approval, then continue.

**External practices:** when adopting an outside convention, library, or tool pattern, verify current guidance with a web search first and link the sources in the record's Context section.

## Context layer

- This file stays under 100 lines. Detail goes to `docs/` and is referenced by path, not pasted here.
- Add a rule here only after the same mistake happens twice; remove a rule once Claude follows it without being told.
- `docs/` map: `dotclaude-design-spec.md` (what and why), `decisions/` (what changed and why), `plans/` (per-task plans, added in build phase).
- `docs/decisions/README.md` is the log's own map: statuses, the append-only rule, the follow-up ledger, and what `npm test` audits about records. Read it before writing a record.
- `AGENTS.md` is a symlink to this file so Cursor and other agents read the same rules. Edit `CLAUDE.md` only; never edit `AGENTS.md` directly.

## Validation

- Any edit to a skill or command runs `validate-skill`; an agent runs `validate-agent`. Both ship a `validate.py` — run it, then review the quality checklist by hand. A failing script blocks the merge.
- Edits to this file or a rule/memory file have no upstream checklist (record `0004`). Apply the quality items that fit and say which you skipped.
- **Acceptance criteria are invariants, not counts.** The corpus is 16 live directories on a working machine and drifted 591 → 626 in one session, mostly from outside this repo. "625 artifacts" is stale within days; "identical before and after the change" (SC-003) stays true forever. Cite a count only as evidence recorded at a moment, never as the bar.
- **Probes never go inside a registered source.** A throwaway `SKILL.md` under `.claude/` is indexed like any other, so it shifts the very counts a verification is measuring. Use a `fs.mkdtemp` directory — registered as a temporary source if the live app is needed — and delete it in the same step that made it.
- The `validate-ai-instructions` 15-point checklist named by earlier drafts does not exist. Do not look for it.

## Terminology

Use the spec's terms exactly: **artifact, source, cluster, effective, Resolution bar, decision log, chip**. One name per concept, in code, docs, and records alike — "chip" never "badge" (validator 15, fixed 2026-07-29).

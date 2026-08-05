# spec-kit adoption · `feat/spec-kit-adoption`

**Implements:** record `0008` (adopt spec-kit, after M7, on an explicit go-ahead). Inputs: `0007`'s research and overlap table (superseded decision, live research), `0006` (publishing).

**Spec:** §1 (the D1–D14 table stays the authority the constitution *points at*, not a thing it copies), §6 and D9 (validation authority), §10 (zero dependencies — the one real tension, resolved below), §11 (non-goals unchanged), §12 (the roadmap items become the first `specs/###-*/` features), §13. Plus `CLAUDE.md` — Precedence, Way of working, Publishing, Reply format — which is where the adoption actually lands.

## Precondition — verified before writing this

M7 is merged into `main` as `0fc9b66`, a `--no-ff` merge commit in `0006`'s PR style, body ending *"v1 is done: 581 artifacts across 16 sources"*. `docs/plans/v1-milestones.md:114` records v1 reached on 2026-07-29. `0008` scheduled this work after M7 and not before; the gate is open.

## Goal

Run `specify init --here --integration claude --force` on this branch, keep everything `0008` named as non-negotiable, and land the result as one reviewable merge — without letting spec-kit's greenfield assumptions overwrite a working process. The four questions below are answered *before* the command runs, because after it runs the tree is already on disk and the answers become rationalisations.

---

## The four answers

`0008` requires all four settled before any command runs. Each states the choice and the alternative rejected.

### A1 — `docs/decisions/` stays exactly where it is, and the constitution points at it

**Choice.** The decision log remains `docs/decisions/NNNN-*.md`, append-only, unmoved and unreferenced by any spec-kit template. `.specify/memory/` holds spec-kit's constitution and nothing of ours. The constitution gains one principle — *"the spec is amended by an append-only record, never regenerated"* — that names `docs/decisions/` by path and forbids downstream regeneration of it.

**Rejected: move the log to `.specify/memory/decisions/`.** Verified from the bundled command source, `.specify/memory/constitution.md` is written **back by overwrite** (`core_pack/commands/constitution.md`, step 6: *"Write the completed constitution back to `.specify/memory/constitution.md` (overwrite)"*). Putting an append-only log inside a directory whose one existing file is defined by overwrite is the precise failure `0007` named. `.specify/` is also a vendor tree that `specify` upgrades; our log must survive `specify init` being run again.

**Rejected: fold the records into the constitution as principles.** A principle states a rule; a record states *what was learned, what it superseded, and what trade-off was accepted*. Five spec defects were caught by that second shape — `0003` (name-derived ids dropped half the corpus), `0004` (a checklist that never existed), `0005` (a runtime claim for an uninstalled runtime), `0009` (one file indexed twice as a phantom duplicate), `0010` (`.cursor/commands` unclassified). Flattening them to principles discards the supersession chain that makes the log auditable.

**What this buys.** `/speckit.analyze` — the one capability `0007` found genuinely missing — gets the decision log as an input, not a blind spot: its consistency pass reads spec ↔ records ↔ plans ↔ code, so *"an accepted record's 'Spec sections to update' was never applied"* becomes a machine-checkable finding rather than something noticed by accident. That is `0007`'s cancelled `spec-audit` follow-up, delivered by the tool instead of by a bespoke skill.

### A2 — §1–§13 stays whole; spec-kit layers over it and starts fresh at v1.5

**Choice.** `docs/dotclaude-design-spec.md` is not fragmented, not moved, and not regenerated. It remains the design authority for v1. `specs/###-<slug>/` is used only for work that starts *after* adoption — the §12 roadmap: `001-cli-validate` (v1.5), `002-remote-git-sources` (v2), `003-mcp-server` (v3). Each feature's `spec.md` cites the design-spec sections it extends (`§6` for the CLI's output contract, `§2` for the source contract, §12's own rationale) and restates none of them. No `specs/` directory is created at init time; the first one appears when the first post-v1 feature is specified.

**Rejected: fragment §1–§13 into per-feature folders.** Every record and every plan cross-references the spec by section (`§1 D8`, `§6`, `§3 (freshness)`) — `0004`, `0009`, `0012` and `0013` are unreadable if those anchors dissolve. And the document is not per-feature by construction: §1 is a cross-cutting decision table, §9 is one design system, §5 and §6 describe behaviour that every artifact page shares. Fragmenting it would produce the two-parallel-structures-kept-in-sync-by-hand failure that `0007` identified — which is, exactly, the thing `/speckit.analyze` exists to catch.

**Rejected: regenerate a spec-kit `spec.md` for v1 from the design spec.** It would be a lossy paraphrase of a document that is already correct, and it would create two spec files where one is authoritative and neither says which.

**Consequence to state plainly.** v1 gets no retrospective spec-kit artifacts. spec-kit's value here is forward-only, and the first honest test of it is `001-cli-validate`.

### A3 — `CLAUDE.md` outranks the constitution; the constitution is process-only and derived

**Choice.** `CLAUDE.md` stays the governing file and the precedence list grows one row:

1. Reza's in-session instruction
2. `CLAUDE.md`
3. `.specify/memory/constitution.md` — **process only**, and only what is derivable from rows 2 and 4
4. the spec — the authority on the product

The constitution is written once, by hand-driving `/speckit.constitution` with `CLAUDE.md` and spec §1 as its input, and carries only the non-negotiables that spec-kit's own commands need to check work against: the publishing rule (`0006`), the decision-first rule, read-only (D11), zero **runtime** dependencies (§10), the phase gate, and the one-name-per-concept terminology rule. It introduces no rule of its own. A collision between rows 2 and 3 is a defect in the constitution, not an ambiguity to interpret — and fixing it is a `CLAUDE.md`-first edit.

**Rejected: let the constitution become the governing document and thin `CLAUDE.md` to a pointer.** `/speckit.constitution` overwrites its target file wholesale. Making the overwritten file the top of the precedence chain means one command can silently delete the publishing rule that record `0006` exists to protect. `CLAUDE.md` is also the file both Claude Code and Cursor load automatically — via the `AGENTS.md` symlink — and `.specify/memory/constitution.md` is loaded by neither.

**Rejected: skip the constitution entirely.** Then `/speckit.plan` and `/speckit.implement` check work against a placeholder template, and their gate output is noise.

**Standing rule this creates:** running `/speckit.constitution` is a decision, not an edit. Any change it makes that adds or removes a lasting constraint needs a record first (decision-first rule), and the constitution is regenerated *from* the record — never the reverse.

### A4 — Q1–Q3 survives; `/speckit.clarify` is a different instrument

**Choice.** The Q1–Q3 reply format is unchanged and unconditional. It applies to every reply, including replies produced inside a `/speckit.*` command, and the `#SHORT` exception still overrides it.

They are not the same thing and do not compete:

| | `/speckit.clarify` | Q1–Q3 |
|---|---|---|
| Scope | one `specs/###-*/spec.md` | every reply |
| Cadence | at most once per feature, before `/speckit.plan` | every turn |
| Subject | ambiguity *in that spec* | the project's current state — next step, risk, alternative |
| Output | answers written back into `spec.md` | three bold questions Reza chooses from |

`0007`'s overlap table paired them, and that pairing is the one row of it that does not survive contact: `/speckit.clarify` is a one-shot interrogation of an underspecified document, Q1–Q3 is a conversational contract. Dropping Q1–Q3 in favour of `/speckit.clarify` would leave every reply outside a speckit command with no follow-up at all.

**One adjustment.** When a reply *is* the output of `/speckit.clarify`, Q1–Q3 must not re-ask questions that command already put to Reza in the same reply. Three questions about the project's state, not three duplicates.

---

## What `specify init` actually writes

Read from the bundled assets of the pinned CLI build (`git+https://github.com/github/spec-kit.git@afbb2c7`), not from memory. `specify init` scaffolds from assets inside the package — it needs no network at run time.

| Path | Contents | Collides with |
|---|---|---|
| `.claude/skills/speckit-<name>/` | one skill dir per command, named `speckit-` + the command with dots as dashes (`speckit-constitution`, `speckit-specify`, `speckit-clarify`, `speckit-plan`, `speckit-checklist`, `speckit-tasks`, `speckit-analyze`, `speckit-implement`, `speckit-converge`, `speckit-taskstoissues`) | nothing — `decide-and-continue` is a sibling directory with a different name |
| `.specify/templates/` | `spec-template.md`, `plan-template.md`, `tasks-template.md`, `checklist-template.md`, `constitution-template.md` | new tree |
| `.specify/scripts/bash/` | `check-prerequisites.sh`, `common.sh`, `create-new-feature.sh`, `setup-plan.sh`, `setup-tasks.sh` | new tree |
| `.specify/integrations/speckit.manifest.json` | records what was installed | new tree |
| `.specify/memory/constitution.md` | created from the template — by setup, or by the first `/speckit.constitution` run | new tree |

**Nothing in the init path writes `CLAUDE.md` or `AGENTS.md`.** Verified by grepping the whole package for both filenames: the only writer is the optional `agent-context` **extension**, whose default map is `"claude": "CLAUDE.md"`, and extensions install via `specify extension add`, never at init. See the guards below — this one matters more than it looks.

**`specs/` is not created at init,** and the core `create-new-feature.sh` does not touch git: it makes `specs/NNN-slug/` and exports `SPECIFY_FEATURE`. Branch creation lives only in the optional `git` extension. So `feat/<topic>` survives untouched.

---

## Guards — things that must not happen

1. **Do not install the `agent-context` extension.** Its default target for the claude integration is `CLAUDE.md`, and `AGENTS.md` is a **symlink to `CLAUDE.md`** in this repo. A tool writing either path writes the governing file, through a symlink, outside the 100-line budget and outside the decision-record procedure. If it is ever wanted, that is a record, not a command.
2. **Do not install the `git` extension.** It ships `/speckit.git.remote` and `initialize-repo.sh`. Record `0006` requires a fresh explicit ask before any remote exists; a slash command that creates one is exactly the boundary `0006` was written to keep from being re-decided under time pressure. Its `/speckit.git.commit` auto-commit also bypasses the "commits reference the decision record ID" rule.
3. **Do not run `/speckit.constitution` in the same session that runs `init`.** Init is a file-tree change to review; the constitution is a decision (A3). Separate steps, separate approvals.
4. **`.specify/` is committed, not ignored.** It is process tooling under review, and an ignored tree cannot be reverted by `git checkout`.
5. **`CLAUDE.md` is 77 lines against a 100-line cap.** The edits below have a 23-line budget. Anything longer goes to `docs/` and is referenced by path.

## Execution sequence — for the session that has the go-ahead

1. **Confirm the branch** is `feat/spec-kit-adoption` and the tree is clean.
2. **Capture the pre-init state** so the diff is provable, not remembered: a `find` manifest of `.claude/`, `docs/` and the repo root, plus a checksum of `CLAUDE.md`. Write it to the scratchpad, not the repo.
3. **Run `specify init --here --integration claude --force`.** Nothing else in the same step.
4. **Stop. Show Reza the complete list of created and modified files** — `git status --porcelain` plus a diff of the pre-init manifest — calling out anything under `.claude/skills/`, `CLAUDE.md`, `AGENTS.md` or `docs/`. If any of those four was touched, or anything this plan did not anticipate was overwritten, **stop and report** rather than reconciling it. The `CLAUDE.md` checksum from step 2 is the check, not a glance at the file.
5. **Verify the app is untouched.** `grep -rn "specify\|\.specify" src/` must return nothing: §10's zero-dependency claim is about the served process, and adoption must leave it literally true. Then `npm start`, load `http://127.0.0.1:4114`, confirm it serves and the console is clean.
6. **Record the new artifact count.** `sources.json:19` registers this repo as a source at priority 100, so the ~10 new `speckit-*` skills enter the index and get classified, linked and validated like anything else. Expect 581 → ~591. State the exact number, and read their verdict chips — dotclaude validating spec-kit's own skills is the cheapest real dogfood available, and a surprise there is a finding worth writing down.
7. **Write record `0014`** — next sequential; `0013` is the highest in use. It records the four answers as lasting constraints, cites `0008` as what it implements and supersedes nothing. `0008` stays Accepted: this executes it, it does not reverse it. Per `CLAUDE.md`, verify current spec-kit guidance by web search and link the sources in the Context section; `0007`'s four sources are the starting set and the pinned commit `afbb2c7` is the version this was read against.
8. **Edit `CLAUDE.md`** — four small changes, inside the 23-line budget:
   - Precedence: insert the constitution as row 3, process-only, subordinate to `CLAUDE.md` (A3).
   - Way of working: one line saying the spec stays whole and post-v1 features go to `specs/###-<slug>/` (A2).
   - Decision records: one line saying `docs/decisions/` is unmoved and that `/speckit.constitution` is a decision, not an edit (A1, A3).
   - Reply format: one line saying Q1–Q3 is unconditional and does not duplicate `/speckit.clarify`'s own questions (A4).
   Per record `0004`, edits to this file have no upstream checklist — apply the quality items that fit and say which were skipped.
9. **Run `/speckit.constitution`** as its own step, seeded from `CLAUDE.md` and spec §1, producing only the non-negotiables listed in A3. Review it against `CLAUDE.md` line by line before accepting; a rule in the constitution that is not derivable from rows 2 or 4 gets deleted, not reconciled.
10. **Propose the merge.** `0006`: a `--no-ff` merge into `main` whose body is the PR description — what landed, the artifact count before and after, what was overwritten, what is carried forward. Merge only when Reza asks, only after running the app **from `main`**, and never create a remote or push. Keep the branch.

## Done when

- `specify init` has run once, on this branch, and the complete created/modified file list has been shown to Reza before any other edit.
- `CLAUDE.md` and the `AGENTS.md` symlink are byte-identical to their pre-init state at step 4 — any later change to `CLAUDE.md` is ours, made in step 8, and visible in the diff.
- `decide-and-continue` is intact at `.claude/skills/decide-and-continue/SKILL.md`.
- `grep -rn "specify" src/` is empty and `npm start` serves `http://127.0.0.1:4114`.
- The post-adoption artifact count is stated, with the `speckit-*` skills' verdict chips read rather than assumed.
- Record `0014` is written and accepted; `CLAUDE.md` reflects all four answers; the constitution contains nothing not derivable from `CLAUDE.md` or spec §1.
- `docs/decisions/` is unmoved, `docs/dotclaude-design-spec.md` is unfragmented, and `specs/` does not exist.

## If it goes wrong

Everything spec-kit writes is new and untracked except anything it overwrites, so the revert is `git checkout -- .` plus removing the untracked `.specify/` and `.claude/skills/speckit-*/`, on a branch `main` never saw. That is the whole reason `0008` said to run it on its own branch. If step 4 shows an overwrite this plan did not anticipate, reverting first and reporting second is correct — the tree is reproducible, the surprise is the information.

## Results

**Init did what the plan predicted, and the checksums say so rather than a glance.** 10 skills into `.claude/skills/speckit-<name>/`, 18 files into a new `.specify/`, **zero tracked files modified by the command**, nothing removed. `CLAUDE.md`, the `AGENTS.md` symlink and `decide-and-continue` verified byte-identical against their pre-init checksums. No `.github/` — the "bundled workflow" is spec-kit's own definition under `.specify/workflows/`. Four `.specify/` files were not named individually in the plan (`init-options.json`, `integration.json`, `claude.manifest.json`, `workflows/`), all inside the tree the plan declared new. One naming correction: skills are invoked `/speckit-analyze`, with a dash, not the dotted form `0008` recorded.

**The app is untouched.** `grep -rn "specify" src/ test/ public/` returns nothing, so §10's zero-dependency budget is literally intact — Python and `uv` are author-time only. `GET / → 200` on `http://127.0.0.1:4114`. Index **581 → 591**, exactly the 10 new skills.

**The dogfood found a real defect, which is the whole reason step 6 was in the plan.** All 10 speckit skills validate FAIL, and not on quality: their frontmatter carries a nested map under `metadata:`, the one shape §3 states appears zero times in the corpus. That claim was true when M1 measured it and is false now. The corpus went from 0 parse errors in 581 artifacts to 10 in 591. §3's graceful-degradation half held perfectly — indexed anyway, chip shown, body raw, `name` and `description` still resolving — but the verdict is wrong in spirit: the files are well-formed YAML, so a structural 0 is the app blaming the artifact for its own parser, the answer D10 exists to prevent. Record `0015`, Accepted; implementation is a separate task.

**The constitution needed one deliberate refusal.** The bundled `constitution-template.md` offers *"Constitution supersedes all other practices"* as its own governance example. Filled in unread it would have inverted A3 on day one. It was not adopted, and the constitution now states the opposite explicitly.

**Three governance guards were added to the test suite** (57 → 60 assertions), because a file written by overwrite keeps only the rules something checks: the constitution must still carry `0006`'s publishing rule, D11, §10's localhost bind and the decision-log path, must not claim supremacy, `CLAUDE.md` must stay under 100 lines, and `AGENTS.md` must still be a symlink rather than a real file — the exact damage the `agent-context` extension would do. Each was mutation-checked: deleting the publishing principle trips two assertions, restoring the template's supremacy line trips one.

## Out of scope

No `specs/###-*/` feature is written in this task; `001-cli-validate` is a separate session. No presets. No extensions — see the guards. No `spec-audit` skill (`0008` cancelled `0007`'s follow-up). No change to §1–§13, §11's non-goals, or any milestone plan. No remote, no push, no publication of any kind.

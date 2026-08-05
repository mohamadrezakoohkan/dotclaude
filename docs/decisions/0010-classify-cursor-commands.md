# 0010 — Classify `.cursor/commands` as commands

- Status: Accepted — approved by Reza's standing instruction to continue through M7 (2026-07-29), not by a separate review
- Date: 2026-07-29
- Supersedes: extends §3 row 3 and D14; no §1 row change beyond D14's scope note

## Context

M1 indexed all six §3 classification rows and returned **zero commands**. That looked like a classifier bug and was not.

Both `.claude/commands` directories on this machine are empty — `~/.claude/commands` and `ai-dev-harness/.claude/commands`. The only command artifact in the entire corpus is `personal-tools/.cursor/commands/update-worklog.md`, and §3 row 3 matches `**/.claude/commands/**/*.md` only. So the app was correct per the spec and wrong about the machine: it reported a type as empty while an artifact of that type sat on disk.

D14 already decided that Cursor artifacts are indexed alongside Claude's, naming `.cursor/skills` and `.cursor/rules`. Commands were simply overlooked — the omission is an oversight in D14's enumeration, not a considered exclusion. Surveying what Cursor directories actually exist here: `.cursor/skills` (15), `.cursor/rules` (1), `.cursor/commands` (1), and no `.cursor/agents` at all.

Left unfixed, this is worse than a missing artifact: §7's `type:command` filter and M5's dashboard counts would both report zero commands with no indication that the number is a spec artefact rather than a fact.

Evidence: `find` over both `.claude/commands` directories returns no files; `docs/plans/index-pipeline.md` → Results.

## Decision

Classify `.cursor/commands/**/*.md` as `command`, using the same `/`-prefixed, `:`-joined naming as `.claude/commands`.

## Trade-off accepted

dotclaude now recognises a Cursor directory that Claude Code itself never reads, so a `/name` shown in the UI may not be invocable in Claude Code — accepted because D14 already committed to indexing Cursor's artifacts, and a browser that hides them is failing at its one job.

## Consequences

- **Spec sections to update:** §3 row 3 (add `.cursor/commands`), and D14's parenthetical so it lists `.cursor/skills`, `.cursor/rules`, `.cursor/commands`.
- **Files or areas affected:** `src/classify.js`.
- **`.cursor/agents` is deliberately NOT added.** No instance exists in the corpus, so adding a rule for it would be speculation — the pattern to follow when one appears is this record.
- **M3 note:** a Cursor command and a Claude command sharing a name are a genuine cluster, not a false positive, because both are artifacts a developer maintains.
- **Follow-up task:** —

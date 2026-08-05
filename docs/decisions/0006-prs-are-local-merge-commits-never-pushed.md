# 0006 — A PR is a local merge commit; publishing needs a fresh ask every time

- Status: Accepted — approved by Reza's instruction to record this mechanism in `CLAUDE.md` (2026-07-29)
- Date: 2026-07-29
- Supersedes: —

## Context

M0 was merged on Reza's instruction: "Open one pr from all changes to merge main then auto merge main since repo is local."

There is no PR to open. `git remote -v` is empty — the repository has never had a remote. `gh` *is* authenticated (`mohamadrezakoohkan`), so creating a repo and pushing was mechanically available, and that is exactly why the boundary needs writing down rather than re-decided under time pressure each time.

Two things make publishing this repo different from publishing an ordinary side project:

- **The index is a map of a private machine.** dotclaude stores absolute paths, and its whole job is to read `~/.claude` plus internal repo checkouts. The plans and records already committed here quote real paths (`plugins/cache/org-ai-plugins/ios/3.1.8/…`), internal plugin names, and version numbers. A push publishes that inventory.
- **"Merge it" and "publish it" read alike but are not alike.** Merging is local and reversible with `git reset`. Pushing is neither: it can be cached, forked, or indexed by third parties even if the remote is deleted a minute later.

So the merge was performed and the push was not, and the phrase "since repo is local" was read as *there is no reviewer, go ahead and merge* rather than *set up a remote*.

Evidence: merge commit `e52c744` (`--no-ff`, PR-style body); `git remote -v` empty; app verified running from `main` at 317 artifacts before this record was written.

## Decision

Treat a `--no-ff` merge into `main`, whose commit body is the PR description, as this project's PR — and require a fresh explicit ask before any remote is created, any push happens, or the repo is published anywhere.

## Trade-off accepted

No CI, no review UI, no diff comments — accepted because there is one developer and one machine, and the merge commit carries everything a PR description would; the cost of the alternative is publishing a private filesystem inventory.

## Consequences

- **Spec sections to update:** none. This is a working-practice rule, so it lives in `CLAUDE.md` → Publishing. §1 is untouched.
- **Files or areas affected:** `CLAUDE.md` (new Publishing section).
- **Standing rules:** merge only when asked and only after running the app from `main`; keep the feature branch; prior permission to merge is never permission to push.
- **If this is ever reversed** — and it plausibly will be, if dotclaude is open-sourced — the record that reverses it must say how paths are scrubbed first, because the committed plans and records currently embed them. That is a real task, not a `.gitignore` line.
- **Follow-up task:** —

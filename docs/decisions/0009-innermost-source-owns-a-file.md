# 0009 — The innermost registered source owns a file

- Status: Accepted — approved by Reza's standing instruction to continue through M7 (2026-07-29), not by a separate review
- Date: 2026-07-29
- Supersedes: extends §2's sources model; no §1 row changes

## Context

M1 registered the real source roots and reconciled the index against the filesystem. §2 defines a source as "a registered root folder" and says nothing about what happens when one source sits **inside** another. On this machine that is not hypothetical:

- `ai-dev-harness` is a source, and `ai-dev-harness/repos/project-ios` and `.../project-android` are full repo checkouts inside it — the very sources spec §2 names as its examples.
- `ai-dev-harness/.claude/worktrees/youthful-gagarin-b553c9` and `ai-dev-harness/repos/.wt-ios-avatar` are git worktrees, each with its own `.claude`.

Registering both the outer and the inner root double-indexes every file underneath: two ids for one file (both valid under `0003`), inflated per-source counts, and — the real damage — §5 would report a **phantom cross-repo duplicate** between `ai-dev-harness` and `project-ios` for what is one file on disk. That would corrupt M3's clusters with noise indistinguishable from genuine drift.

Three options were considered. Registering only the outermost root is spec-clean but throws away the per-repo attribution that makes §5's cross-repo duplicates meaningful. Accepting the double-index is wrong for the reason above. Adding per-source exclude globs invents config §2 does not have.

The remaining option is an ownership rule, which is also what the reconciliation script needed in order to compare index against filesystem at all: match a file to the registered source with the longest matching root.

Evidence: `docs/plans/index-pipeline.md` → Results; the reconciliation found 528 `SKILL.md` on disk with 78 outside every registered source before the source list was completed, and 0 lost to the depth cap.

## Decision

A file belongs to the most specific registered source containing it — longest matching root wins — and an outer source skips files an inner source owns.

## Trade-off accepted

Source membership is now positional rather than purely declarative, so adding a source silently moves artifacts out of its parent — accepted because the alternative is phantom duplicates that would make §5 untrustworthy, and because the rule is the one a reader intuits anyway.

## Consequences

- **Spec sections to update:** §2, sources model — add the ownership rule.
- **Files or areas affected:** `src/indexer.js` (pass every root to each source build), `src/pipeline.js` (skip non-owned files), `sources.json`.
- **Per-source counts become ownership counts,** not "files under this path". The startup log must therefore keep reporting `filesWalked` separately, or a shrinking count looks like a scan failure.
- **M3 depends on this being right.** If cross-repo clusters ever contain two copies at the same absolute path, this rule has regressed.
- **Follow-up task:** M6's watcher must recompute ownership when a source is added or removed, not only re-scan.

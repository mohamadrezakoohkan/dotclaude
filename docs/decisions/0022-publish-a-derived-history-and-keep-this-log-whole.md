# 0022 — Publish a derived single-commit history; this repository's log stays whole

- Status: Accepted — Reza confirmed the orphan-history plan ("go q1, q2, q3", 2026-08-04) against the question `0021` left open, having created the public repository himself and instructed "scrub rest"
- Date: 2026-08-04
- Supersedes: — (closes `0021`'s open follow-up; `0021` stands unchanged)

## Context

`0021` created the remote and left one question deliberately unanswered: whether nineteen documents may name the employer's internal repositories in public. Two options were recorded — push as-is, or publish a derived repository. Reza chose the second.

Then a fact emerged that removes the first option anyway, and it is the reason this record exists rather than a one-line ledger update:

**Scrubbing files does not scrub history.** After eleven files were cleaned in the working tree, `git show 8fccbdf:docs/plans/knowledge-graph.md` still returned `service-maven`, and two commits still contained real `~/Desktop/…` paths. A push sends every commit, so the pre-scrub text would have been public and recoverable with one command. The working tree was clean and the repository was not.

That is now a rule in `CLAUDE.md` → Publishing: *a scrub is not a scrub until history is checked*, verified with `git log --all -S`, never with `git grep`.

So the real choice was never "publish the log or not". It was between **rewriting this repository's history** and **deriving a new one**.

## Decision

Publish a derived repository built as a single orphan commit from a redacted tree, and leave this repository — every commit, every record, unredacted — local and whole.

## Trade-off accepted

The public repository has no history: one commit, no 65-commit narrative, none of the merge bodies that `0006` made this project's PR descriptions. Accepted because the alternative rewrites the only audit trail the project has, and because a reader arriving from GitHub wants the spec, the records and a README — not the order in which they were written.

## Why this leaves Principle I intact, which nothing else did

Constitution Principle I is non-negotiable: records are append-only and never edited. Every other route violated it or defeated its purpose:

- **Redact the records here** — a direct violation. A log that can be rewritten for presentation is not a log.
- **`git filter-repo`** — worse: it changes every commit SHA and silently rewrites the recorded text of twenty accepted records, retroactively falsifying the guarantee that they were never touched.
- **Publish as-is** — no violation, but it publishes a third party's internal names, which is not this project's information to disclose.

A derived tree touches none of it. The records are **withheld from the derived commit's redaction, not edited in place** — redaction happens only in the derived tree, which is a build artefact and not the log. This repository's `docs/decisions/` is byte-identical before and after publishing, and `git log -S` will confirm that forever.

## Consequences

- **Spec sections to update:** none. This is working practice about publishing, so it lands in `CLAUDE.md` → Publishing alongside `0006` and `0021`.
- **Files or areas affected:** `CLAUDE.md` (the history-check rule), and the eleven non-record files already scrubbed in the working tree — `docs/dotclaude-design-spec.md`, five plans, `sources.example.json`, two `specs/` files, `test/run.test.mjs`, `src/pipeline.js`.
- **The redaction mapping is deliberately not committed.** Publishing `old → new` beside the redacted text would reverse the redaction for any reader. The categories are recorded here; the mapping is not, in this repository or the derived one.
- **`src/pipeline.js` lost one platform prefix.** §13 lists that array as safe to change. The consequence is real and small: artifacts whose names carry the removed prefix lose one auto-tag.
- **The derived repository is not a fork of this one and cannot be merged back.** It shares no commit. Re-publishing means deriving again, and there is no committed script to do it — deliberately, because such a script would have to carry the mapping.
- **This does not grant standing push permission.** `0006`'s clause survives both `0021` and this record: each push is its own ask. What is authorised here is publishing the derived history, once.
- **Follow-up task:** —

# 0021 — The repo gets a remote; `sources.json` stops being tracked

- Status: Accepted — Reza's explicit instruction to connect this repo to `github.com/mohamadrezakoohkan/dotclaude` (2026-08-04). That instruction is the fresh ask `0006` requires; this record is the scrub `0006` also requires *before* the remote exists.
- Date: 2026-08-04
- Supersedes: — (`0006` is **honoured, not reversed**; see below)

## Context

`0006` fixed publishing as a boundary rather than a default, and it anticipated this moment precisely:

> **If this is ever reversed** — and it plausibly will be, if dotclaude is open-sourced — the record that reverses it must say how paths are scrubbed first, because the committed plans and records currently embed them. That is a real task, not a `.gitignore` line.

So the exposure was measured before anything was created, rather than asserted:

| Checked — `$HOME` stands for the real home path, written this way so the record is not itself an exposure | Result |
|---|---|
| Tracked files containing `$HOME` | **0** |
| Commit messages containing `$HOME` (63 commits) | **0** |
| Tracked files naming the employer's org or internal repos | **19** |
| `sources.json` | Reza's real 16-source config — internal repo names **and the directory layout of a work machine** |

`0006` feared absolute paths in the committed plans. Those turned out to live in terminal output and my own reporting, not in tracked content. What is real is narrower and sharper: one config file, and nineteen documents that cite internal repo and skill names *as evidence* for decisions (`ios-visual-acceptance`, `project-ios`, `ai-dev-harness`, `validate-agent`).

**`0006` is honoured rather than superseded.** Its decision sentence requires "a fresh explicit ask before any remote is created" — that ask arrived, so the clause did its job. Its merge-commit-as-PR convention is untouched and stays, because there is still no reviewer. Nothing in `0006` needs reversing; its text stands unchanged.

## Decision

Create the remote, stop tracking `sources.json` in favour of a committed `sources.example.json`, and treat the nineteen documents' internal names as a question only Reza can answer — which he must answer before the first push, not after.

## Trade-off accepted

A fresh clone no longer arrives with a working config and must copy the example — a small, one-time cost, and the app already boots without one (§2: a missing config yields the examples plus a chip). Accepted because a config file that maps a work machine's directory layout is the single most sensitive thing here, and it was only ever tracked by accident: §2 says the app ships "three example sources … clearly marked as examples to edit", so committing the real one always contradicted the spec.

## The question this record does not settle

**Whether nineteen documents may name the employer's internal repositories in public is not a technical decision, and not mine.** It is stated here rather than resolved so that it cannot be published by default:

- The names appear as *evidence* — measured counts, real link pairs, the corpus that justified a threshold. They are what make the records worth reading.
- They cannot be redacted in place. Constitution **Principle I** is non-negotiable: records are append-only and "a record is never edited to make it accurate in hindsight". Redacting twenty records to publish them would destroy the guarantee that makes the log trustworthy.
- Nothing here is a credential, a secret, or business logic. It is the fact that an organisation has repos and skills with certain names.

**Two ways forward, and Reza picks before the first push:**

1. **Push as-is**, accepting that internal repo and skill names appear in `docs/`. Simplest, and reversible only in the weak sense that GitHub caches and indexes what it has seen.
2. **Publish a derived repository** — a fresh history built from a scrubbed subtree (code, spec, README), leaving *this* repo local and its log complete. This dissolves the conflict rather than trading it away: Principle I is untouched because the log is never edited, only withheld. The cost is two repositories and no public narrative.

Option 2 is the technically cleaner answer and the reason it is not the default is honest: it discards the 63-commit history and the merge bodies that are this project's actual audit trail, and Reza may reasonably not care about the names at all.

## Alternatives rejected

- **Redact the nineteen documents in place.** Violates Principle I, which the constitution marks NON-NEGOTIABLE. A log that can be rewritten for presentation is not a log.
- **Squash this repo's history to hide the trail.** Rejected for the same reason plus a second: `0006` made the merge commit *the* PR description, so the history is the review record. Squashing deletes the only review this project has ever had.
- **Grant standing push permission now that a remote exists.** Explicitly rejected. `0006`'s "prior permission to merge is never permission to push" survives this record intact, and creating a remote is not pushing to it.
- **`.gitignore` the whole of `docs/`.** Tempting and wrong: the spec and the records are the most useful part of the repository, and hiding them to publish the code would leave a tool with no explanation.

## Consequences

- **Spec sections to update:** none. §10's "nothing leaves the machine" describes the *running app*, which is unchanged — it still binds to localhost and still sends nothing. Publishing a repository is working practice, so this lands in `CLAUDE.md` → Publishing.
- **Files or areas affected:** `.gitignore` (+`sources.json`), new `sources.example.json`, `sources.json` untracked via `git rm --cached` (the file stays on disk and keeps working), `CLAUDE.md` → Publishing, and a new `README.md` for people arriving from GitHub.
- **A remote named `origin` now exists.** That is a new standing fact, and the one thing `0006` said would need this record.
- **A push still requires an explicit ask, every time.** Adding a remote transmits nothing; the first `git push` is the irreversible act, and it does not happen inside this record.
- **`sources.json` remains on disk and keeps working.** Untracking it changes nothing for Reza and everything for a stranger cloning the repo.
- **Follow-up task:** Reza chooses option 1 or option 2 above before the first push. Open until then.

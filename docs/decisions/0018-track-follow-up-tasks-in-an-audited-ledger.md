# 0018 — Track follow-up tasks in an audited ledger, and leave the record template alone

- Status: Accepted — Reza delegated the call ("go q1", 2026-08-03) on the explicit question of whether to accept this or judge it a mechanism too far. Accepted on the reasoning below: the guard added alongside it covers only one *class* of follow-up, and the open-follow-up question is currently unanswerable without reading every record.
- Date: 2026-08-03
- Supersedes: — (extends `0016`'s audit to a second field; the record template is unchanged)

## Context

`0016` made the record-to-spec audit native, and `npm test` now asserts that every Accepted record directing a numbered spec edit is cited in every section it named. That audit reads exactly one field: **"Spec sections to update"**. Records carry two more consequence fields — **"Files or areas affected"** and **"Follow-up task"** — and nothing checks either.

A sweep of all 17 records' follow-up lines was run before writing this, and it found the gap is real rather than theoretical:

| Record | Follow-up | Status found |
|---|---|---|
| `0002` | E1 `git init` + baseline commit | done |
| `0003` | M3 must extend §5's tiebreak within one source | done, by `0012` |
| `0004` | M4 must reuse `validate.py` | superseded by `0013`, explicitly |
| `0005` | If Bun is ever installed, verify or record what broke | **open, conditional** — trigger has not occurred |
| `0008` | After M7, write `docs/plans/spec-kit-adoption.md` | done |
| `0009` | M6's watcher must recompute ownership when a source is added or removed | **NOT DONE** |
| `0012` | M6's watcher should treat `installed_plugins.json` as a watched input | done |
| `0014` | Record `0015` | done |
| `0016` | Implement the fourth governance test on its own branch | done |
| `0017` | Implement on `feat/folder-scope`; apply §7/§8/§12 | done |

`0009`'s was unapplied since M6 shipped. `isRelevant('sources.json')` returned false, so editing the source config triggered no re-index at all, and the watcher was registered once at boot and never reconciled. What makes this more than an oversight is the comparison: `0012`'s follow-up is the *same shape* — a non-artifact file that changes the index — and it was applied, with a comment citing the record. One of two identical follow-ups landed. Nothing could tell which.

Eight of nine resolved cleanly, which is a decent record. But the one that did not was found only because a sweep was run by hand, on a whim, four days later. The `0016` audit exists precisely because "someone will notice" is not a mechanism.

## Decision

Track every record's follow-up in a ledger in `docs/decisions/README.md`, with an explicit status per entry, and assert by test that the ledger covers every Accepted record whose follow-up is not `—`.

## Trade-off accepted

Writing a record now means updating a second file, and a follow-up's status lives beside the log rather than inside the record it belongs to — accepted because the log is append-only, so a record physically cannot carry its own later status, and the alternative is follow-ups that rot silently for as long as nobody happens to sweep.

## Alternatives rejected

- **Structure the Consequences field in `TEMPLATE.md`** — e.g. `Follow-up task: <description> (open | done in NNNN)`. This was the obvious move and it does not work: the log is append-only, so the 17 existing records cannot be retro-annotated. A ledger is therefore needed regardless, and once it exists the template change adds a second place to state the same fact. Worth revisiting only if the ledger proves annoying to maintain, since a status marker on *new* records would let the ledger be generated rather than written.
- **Keep sweeping by hand** — this is the status quo, and it is what let `0009` sit unapplied. It also scales badly: the sweep that found it took reading all 17 records.
- **Require every follow-up to become a task in `docs/plans/`** — heavier than the problem. Several follow-ups are conditional (`0005` waits on Bun ever being installed) or satisfied incidentally by another record (`0003` by `0012`), and neither is a plannable task.
- **Audit "Files or areas affected" too** — tempting, since `0017`'s under-predicted by two files, but that field is an estimate written before implementation, not a commitment. Asserting against it would fail honestly-written records. Left unaudited on purpose.

## Consequences

- **Spec sections to update:** none. This is working practice about the decision log, so it lives in `docs/decisions/README.md` and `test/run.mjs`; §1–§13 are untouched and no D-row changes.
- **Files or areas affected:** `docs/decisions/README.md` (the ledger), `test/run.mjs` (the assertion).
- **`TEMPLATE.md` is deliberately unchanged**, so no existing record needs editing and the append-only rule is not strained.
- **What the ledger must record per entry:** the record ID, the follow-up in one line, and a status of `done`, `done by NNNN`, `superseded by NNNN`, `open`, or `open — conditional on <trigger>`. `0005` is the reason the last one exists: an untriggered condition is not a failure and must not read as one.
- **What the test must assert:** every Accepted record whose follow-up line is not `—` appears in the ledger; the ledger names no record that does not exist; and any entry marked `open` is stated as such rather than omitted. It must **not** assert that nothing is open — an open follow-up is a normal state, and a test that forbids it would only teach people to write `—`.
- **Known limit, stated so it is not mistaken for coverage:** this audits whether a follow-up is *tracked*, not whether it was *done well*. `0009`'s was tracked as prose in a record and still missed; the ledger makes it visible, not self-executing.
- **A cheaper guard for `0009`'s class was added alongside this record**, and it is the reason this one is scoped to *tracking* rather than to enforcement. `0009`'s and `0012`'s follow-ups were the same shape — a non-artifact file that changes the index — so a test now derives every `*.json` filename appearing in `src/` and requires each to be either a watched input or explicitly declared not one. That closes this class permanently, without process. It closes no other class: `0003`'s "M3 must extend §5's tiebreak" and `0008`'s "write the adoption plan" are not mechanically checkable, which is what the ledger is for.
- **Follow-up task:** implement the ledger and its assertion — done in this record's own branch, and recorded as the ledger's last row.

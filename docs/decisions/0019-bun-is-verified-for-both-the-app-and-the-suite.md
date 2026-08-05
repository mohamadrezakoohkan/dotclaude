# 0019 — Bun is verified for both the served app and the test suite; rename the test file to make the suite discoverable

- Status: Accepted — approved by Reza's instruction to close `0005` rather than keep tracking it ("go q1", 2026-08-03) and to resolve the rename question that followed ("go q2", 2026-08-04), on the verification recorded below
- Date: 2026-08-03, extended 2026-08-04
- Supersedes: — (closes `0005`'s conditional follow-up; `0005`'s decision stands)

## Context

`0005` fixed the runtime contract at the Node/Bun intersection and stated Node as the verified runtime, "keeping Bun as a supported-but-untested target until someone runs it". Its follow-up was deliberately conditional: *"if Bun is ever installed, run `bun src/server.js` and either promote it to verified or record what broke."* `0018`'s ledger made that the only open follow-up in the log, and Reza chose to close it rather than keep tracking it.

Bun 1.3.14 was installed via Homebrew for this purpose, which inverts the follow-up's condition — it waited for Bun to arrive for other reasons. Noted because the ledger should not read as though the trigger occurred naturally.

### The served app

**`bun src/server.js` works, and matches Node.** 625 artifacts, all 16 sources with identical per-source counts and identical depth-cap hits, snapshot loaded, startup rescan completed, watcher registered on 16 roots with no errors. The FAIL list was captured under both runtimes and compared **id by id: 41 ids, an exact match**, along with identical cluster, orphan and parse-error counts. Bun re-indexed slightly faster (2208–2702 ms vs Node's ~3133 ms), which is not a claim worth making from one run.

**`fs.watch` with `recursive: true` fires under Bun.** This is the API most likely to differ and the one M6 depends on, so it was tested rather than assumed: a `SKILL.md` created inside a watched root produced `watch: re-index: 1 event(s) absorbed`, the debounced rebuild ran, and the index went 625 → 626 with the new artifact present.

### The test suite — first read wrong, then measured

This record first concluded the suite was Node-only, on two observations:

- `bun test/run.mjs` → `error: Cannot use test outside of the test runner. Run "bun test" to run tests.` Bun's `node:test` shim requires its own runner, where `node --test test/run.mjs` does not.
- `bun test test/run.mjs` → `The following filters did not match any test files`, because Bun's runner only discovers filenames containing `.test`, `_test_`, `.spec` or `_spec_`.

Both observations are true. The conclusion drawn from them was not. Renaming the file and re-running settled it:

```
$ bun test test/run.test.mjs
bun test v1.3.14 (d1632b29)
 84 pass
 0 fail
Ran 84 tests across 1 file. [147.00ms]
```

**All 84 pass under Bun, unchanged.** Nothing about the suite was ever incompatible — `node:test`, `node:assert/strict`, `node:fs/promises`, `path` and `os` all behave. The only obstacle was a filename convention, and `node --test` is indifferent to the name (84/84 under Node after the rename too).

### A correction worth recording, because the method was wrong

An earlier reading appeared to show Bun producing FAIL 41 against Node's FAIL 39, and that was reported as a runtime difference. It was not. Node re-run at the same moment also gave 41, with the identical id list. The corpus had changed between the two readings — this index spans 16 live directories on a working machine, and two numbers taken hours apart are not comparable. **Any runtime comparison here has to be same-moment, and preferably id-by-id rather than count-by-count.** The count difference was real; its cause was time, not Bun.

That mistake and the Node-only conclusion share a shape: a real observation, and an inference from it that outran the evidence. Both are left visible here rather than tidied away, because the pattern is the useful part.

## Decision

Rename `test/run.mjs` to `test/run.test.mjs`, and state in §10 that **both** the served app and the test suite are verified on Node and Bun.

## Trade-off accepted

Three accepted records (`0016`, `0018`, and this record's own earlier text) plus several completed plans cite `test/run.mjs` by path, and the log is append-only so those citations cannot be corrected — accepted because the file is the only one in `test/`, so a stale path costs a reader seconds, while a suite that silently cannot run under a supported runtime costs a defect nobody sees.

## Alternatives rejected

- **Keep `test/run.mjs` and record the suite as Node-only.** This was the earlier conclusion, and it is measurably false: the suite runs under Bun. Keeping the name to protect record citations would be choosing a tidier log over a verified claim.
- **Claim Bun verified without renaming.** Rejected while it was believed true, and rejected now for the opposite reason: before the rename `bun test` genuinely could not see the file, so `npm test` under Bun was unavailable — and `npm test` is what this project's workflow requires before a merge.
- **Write a separate `0020` correcting this record instead of amending it.** Rejected: this record had not merged to `main`, so nothing depended on its prior text, and publishing a record together with its own immediate correction is worse for a reader than publishing it right. The correction is recorded *inside* the record rather than hidden — the "first read wrong, then measured" section is deliberate. Once merged, this record is frozen like any other.

## Consequences

- **Spec sections to update:** §10, runtime clause — the served app **and** the test suite are verified on Node and Bun (record `0019`). No decision-log row changes: the spec's decision table has no runtime row to amend.
  - *Phrasing note.* This line first read "…§1 has no runtime row", and the `0016` audit failed on it — a §-reference written to rule a section **out** is indistinguishable from one naming it as a target. A fourth entry in that audit's exemption list, for a habit easily avoided, would be the "relax it until it passes" pressure `0016` warns about. Reworded rather than exempted, and recorded so the next author phrases it the same way.
- **Files or areas affected:** `test/run.mjs` → `test/run.test.mjs`; `package.json`'s test script; `docs/dotclaude-design-spec.md` §10; `docs/decisions/README.md` (the ledger, the process-test section, and its two references to the old path).
- **`npm test` is unchanged as a command** — it now runs `node --test test/run.test.mjs`. `bun test` works as a second way to run the same suite, and neither runtime is privileged.
- **Stale citations, listed so they are not mistaken for errors:** `0016` ("`test/run.mjs` in the follow-up"), `0018` ("`test/run.mjs` (the assertion)"), and the plans under `specs/002-folder-scope/` and `docs/plans/` all name the pre-rename path. They were accurate when written; the log is append-only, and `docs/decisions/README.md` carries the current path.
- **`0005`'s follow-up is closed**: its ledger status becomes **done by `0019`**.
- **Bun 1.3.14 is now installed on this machine** via Homebrew, so the condition in `0005` can no longer be read as pending. `brew uninstall bun` would not reopen the record; the verification stands as a measurement of a moment.
- **The zero-dependency budget is untouched.** Bun is an alternative runtime, not a dependency: nothing was added to `package.json`'s dependencies, and no `Bun.*` API is used — §10's prohibition still holds and was not exercised.
- **Follow-up task:** —

# Contract: the `validate` CLI

**Feature**: `001-cli-validate` | **Date**: 2026-08-04

The whole point of this feature is a contract a CI job can depend on, so it is written down before the code.

## Invocation

```
npm run validate                    # every artifact in every configured source
npm run validate -- <path>...       # only these paths
node src/cli.js validate [path...]  # the same, directly
bun src/cli.js validate [path...]   # also the same (record 0019)
```

No flags. §12's row asks for a gate, and every flag that suggested itself — `--json`, `--quiet`, `--fix` — is scope this feature was not asked for.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | No validated artifact scored 0 on a deterministic check. WARN does not gate (D10, FR-004) |
| `1` | At least one artifact FAILed, or a named path could not be read |
| `2` | The CLI was misused — an unknown subcommand |

Exit `1` covers both a failing artifact and an unreadable path on purpose: from CI's point of view "this change is not acceptable" and "I could not check this change" both mean stop.

## stdout

Ends with **exactly one** of:

```
VERDICT: PASS
VERDICT: FAIL
```

Nothing follows it — not a summary, not a timing line. `src/prompt.js` already argues this for the paste-prompt; a CI log that gets `tail -1`'d makes the same demand.

Before it, one line per artifact:

```
PASS  ios-visual-acceptance                    project-ios
WARN  speckit-plan                             dotclaude
FAIL  validate-agent                           ai-plugins
        1 Overlap — 2 other skill(s) named "validate-agent" in source "ai-plugins"
SKIP  README.md                                not a classifiable artifact
```

- Verdict first so the column is scannable and greppable.
- FAILs expand to the validator id, title and note — the id ties back to §6's numbering, which record `0004` established is dotclaude's own.
- `SKIP` is not a verdict and never gates (FR-008).

## stderr

Diagnostics only — a missing path, an unreadable directory, the config error `§2` already tolerates. Never the contract line, so `1>` redirection cannot lose the verdict.

## Guarantees the tests hold it to

- **The verdict is not recomputed.** The CLI reads `validation.verdict` from `validateArtifact`; it does not re-derive "deterministic zero". One rule, one place (`summarize()` in `src/validators.js`), so the CLI and the app cannot disagree (SC-001, FR-005).
- **A subset never changes an answer.** The index is built whole before any filtering, so validators 1 and 6 see every artifact regardless of which paths were named (SC-004, FR-006).
- **The contract line is unconditional.** Empty corpus, all-skipped input, unreadable path — the last line still matches `/^VERDICT: (PASS|FAIL)$/` (SC-003).
- **Nothing is written.** No cache, no report, no snapshot (FR-010, D11).

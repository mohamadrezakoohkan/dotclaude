# Quickstart: the `validate` CLI

**Feature**: `001-cli-validate` | **Date**: 2026-08-04

## Run it

```bash
npm run validate                                  # every artifact, every source
npm run validate -- CLAUDE.md path/to/SKILL.md    # only these
bun src/cli.js validate                           # same, under Bun (record 0019)
npm run validate -- --help                        # usage
```

## Use it as a CI gate

```bash
# Gate on everything
npm run validate

# Gate on what a PR touched. Non-artifacts in the list are skipped, not failed,
# so the raw changed-file list is safe to pass straight through.
npm run validate -- $(git diff --name-only origin/main...HEAD)
```

Exit `0` means nothing failed, `1` means a FAIL or an unreadable path, `2` means misuse. WARN never gates — D10 exists so a heuristic cannot produce a wrong FAIL, and a gate that blocked on WARN would throw that away.

`tail -1` is always the verdict:

```bash
npm run validate | tail -1     # VERDICT: PASS  or  VERDICT: FAIL
```

## Prefer the CLI over the app for verification

The server serves a **snapshot** immediately at boot and rescans in the background (§10, by design — the snapshot decides first-paint speed, never truth). So curling `/api/index` seconds after `npm start` can return the previous run's verdicts. That happened while building this feature: the app reported 41 FAILs against the CLI's 39, and the difference was a snapshot from the previous evening, not a disagreement.

The CLI has no cache. It builds the index every run, which is why it is the instrument to trust in CI and when checking a claim.

## Verified behaviour, 2026-08-04

Recorded as evidence at a moment, not as an acceptance bar — `CLAUDE.md` requires criteria to be invariants, because this corpus drifts.

| Check | Result |
|---|---|
| Whole corpus | exit `1`, last line `VERDICT: FAIL`, 39 artifacts FAIL |
| **SC-001** CLI verdict vs app chip | 39 vs 39, **identical by id**, compared same-moment after the startup rescan |
| Mixed changed-file list (`CLAUDE.md package.json SKILL.md`) | two WARN, one `SKIP`, exit `0` — a non-artifact never gates |
| A real FAIL (`design-brand-guardian.md`) | exit `1`, reason named: `Structural — name is not kebab-case` |
| **SC-007** Node vs Bun, same paths | **byte-identical stdout, identical exit codes** |
| **SC-006** writes nothing | working tree byte-identical; `.dotclaude-cache/index.json` mtime unchanged |
| `npm test` / `bun test` | 91 pass, 0 fail under each |

## Done when

- Both runtimes agree, line for line, on the same corpus at the same moment.
- The last line matches `/^VERDICT: (PASS|FAIL)$/` on every path through the code — including the empty corpus, an all-skipped list, and an unreadable path.
- The exit code is 0 exactly when no deterministic check scored 0.
- Nothing was written.

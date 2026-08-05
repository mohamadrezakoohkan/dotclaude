# 0011 — Flag likely renames among unresolved references

- Status: Accepted — approved by Reza's standing instruction to finish M2–M7 deciding each call (2026-07-29)
- Date: 2026-07-29
- Supersedes: extends §4's unresolved-references clause; no §1 row changes

## Context

M2 built the graph. D4's named risk did **not** fire — backtick-only linking produced 569 outlinks and gave 304 of 581 artifacts at least one backlink, with 23 mutually-linked pairs. The linker is fine.

The unresolved-reference list is the problem. It holds **1,201 references across 273 distinct tokens**, and reading the top of that list by hand — which M2's plan required — shows most are not artifact references at all:

| Token | Count | What it actually is |
|---|---|---|
| `/validate`, `/implement`, `/plan`, `/log-failure` | 30, 27, 12, 12 | genuinely missing commands |
| `service-maven`, `web-legacy`, `web-app`, `coaches-app`, `data-infra`, `service-k8s-cluster` | 28, 17, 17, 17, 14, 14 | repo and service names |
| `project-ios`, `project-android`, `ai-plugins` | 15, 13, 12 | repo names |
| `step-01`, `step-02`, `screen-a`, `screen-b`, `screen-c` | 14, 14, 10, 10, 10 | screen and state identifiers inside one skill |
| `clusters-config` | 17 | a config path |

§4 states the purpose plainly: unresolved references "catch renamed or deleted skills that other skills still point to". By that measure a count of 1,201 dominated by service names is not a signal — it is the same failure M4's acceptance bar names for heuristics, where a warning that fires on everything is wrong rather than merely noisy.

Narrowing what gets *listed* was rejected: any filter that drops `web-app` for looking like a repo would also drop a genuinely renamed skill with the same shape, and §4 deliberately lists these as info rather than judging them.

The distinguishing fact is elsewhere. A token that names no artifact **and** resembles no artifact name is probably not an artifact reference. A token that closely resembles one almost certainly is — that is exactly a rename.

## Decision

Keep listing every unresolved reference as §4 requires, and additionally flag those within edit distance 2 of a real artifact name as likely renames, counted separately.

## Trade-off accepted

Two numbers where the spec named one, and edit distance 2 will occasionally pair unrelated short names — accepted because the alternative is a dashboard figure nobody can act on, and because the raw list stays complete for anyone who wants it.

## Consequences

- **Spec sections to update:** §4 (unresolved references gain the likely-rename flag), and §8's Dashboard row, which counts them.
- **Files or areas affected:** `src/linker.js`, `src/indexer.js` stats, the right rail, and M5's dashboard.
- **M5 shows the likely-rename count as the headline** and the full unresolved list behind it. A dashboard leading with 1,201 would train the reader to ignore the panel.
- **Follow-up task:** —

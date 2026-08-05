# 0016 — Keep the record-to-spec audit native; `/speckit-analyze` covers post-v1 features only

- Status: Accepted — approved by Reza's instruction "do q2 then merge and run the app from main" (2026-08-03), given on the reply whose Q2 named this gap
- Date: 2026-08-03
- Supersedes: — (narrows `0014` answer 1; `0014` stays Accepted)

## Context

`0014` answer 1 justified keeping `docs/decisions/` where it is, partly on a capability:

> `/speckit-analyze` takes the log as an input, which turns *"an accepted record's 'Spec sections to update' was never applied"* into a checkable finding — the capability `0007` found missing, delivered by the tool rather than by the `spec-audit` skill `0008` cancelled.

Implementing `0015` put that to the test, and it does not hold for the shape most of this project's records have. `/speckit-analyze`'s own step 1 runs `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` and aborts if the three artifacts are missing. Run from this repo root during `0015`:

```
ERROR: Feature directory not found. Set SPECIFY_FEATURE_DIRECTORY or run the specify command to create .specify/feature.json.
ERROR: Failed to resolve feature paths
exit: 1
```

That is not a misconfiguration. Upstream is consistent about it: analyze "reports conflicts, gaps, and ambiguities across `spec.md`, `plan.md`, and `tasks.md`", each feature lives in its own numbered directory under `specs/`, and the Quick Start describes no path for amending an already-written spec as opposed to creating a new feature. Sources checked before writing this, per `CLAUDE.md`: the [repo](https://github.com/github/spec-kit), the [Quick Start](https://github.github.com/spec-kit/quickstart.html), the [brownfield discussion](https://github.com/github/spec-kit/discussions/331) and the [complex-brownfield discussion](https://github.com/github/spec-kit/discussions/746).

So the capability is real but **scoped to one feature directory**. `0014` answer 2 deliberately keeps v1 amendments out of that tree — the design spec stays whole and `specs/###-<slug>/` starts forward at the §12 roadmap. `0015` was exactly such an amendment: two spec sections, no feature directory, and therefore no audit. The gap is not that spec-kit is broken; it is that `0014` answer 1 claimed coverage the tool's own prerequisites rule out.

What the audit would assert is already true and measurable today. Every Accepted record whose Consequences direct a numbered spec edit has its ID cited in the spec — 9 of 9: `0003`, `0004`, `0005`, `0009`, `0010`, `0011`, `0012`, `0013`, `0015`. The three records that say "none" (`0006`, `0007`, `0008`) are correctly uncited. This is a deterministic invariant over two committed trees, which is the same shape as the three governance tests `0014` already produced.

`0013` is the precedent for the conclusion: when an adopted tool's rules are valuable but its execution model does not fit this app, transcribe the rule and implement it natively rather than depend on the tool's shape.

## Decision

Keep the "was an accepted record's spec edit ever applied?" audit **native** — a fourth governance test in `npm test` — and narrow `0014` answer 1 to what `/speckit-analyze` actually does: consistency across one post-v1 feature's `spec.md`, `plan.md` and `tasks.md`.

## Trade-off accepted

dotclaude maintains one more process test of its own instead of getting the check free from a tool it already adopted — accepted because the free version only reaches a tree that v1 amendments deliberately do not use, and because a test that runs on every commit beats a command someone has to remember to run.

## Alternative rejected

**Give every v1 amendment a thin `specs/###-<slug>/` directory** — `spec.md`, `plan.md`, `tasks.md` — purely so `/speckit-analyze` has something to read. Rejected: it inverts `0014` answer 2, it writes three files of ceremony per amendment whose content would restate §3 and §6, and it would have `0015`'s two-section edit arrive as a feature spec competing with the design spec it amends. Tooling adapts to the record shape, not the reverse.

## Consequences

- **Spec sections to update:** none. This narrows a working-practice answer in `0014` and adds a test; §1–§13 are untouched, and D9/D10 are unaffected.
- **Files or areas affected:** this record now; `test/run.mjs` in the follow-up task.
- **What the native test asserts:** every record with `Status: Accepted` whose "Spec sections to update" names a `§`-section or a `D`-row must have its own ID cited in `docs/dotclaude-design-spec.md`. Records that say "none" are exempt by that same line.
- **Known wrinkle the follow-up must settle, not paper over:** `0001` and `0002` are bootstrap records. `0001`'s line names §1 only to say it stays as it is, and `0002` changed the title line rather than a numbered section. Neither is cited in the spec, and both would trip a naive parse. The fix is an explicit exemption or a tighter parse of the phrasing — **not** relaxing the assertion until it passes.
- **`/speckit-analyze` keeps its place:** run it inside a post-v1 `specs/###-<slug>/` once one exists (`001-cli-validate` first, per `0014` answer 2). Nothing here discourages that use.
- **`0014` is not edited.** The log is append-only; this record is the amendment to its answer 1.
- **Follow-up task:** implement the fourth governance test on its own branch. Deliberately not folded into `0015`'s branch, whose scope is the parser and the structural split.

# 0002 — Enter build phase

- Status: Accepted
- Date: 2026-07-29
- Supersedes: — (amends `CLAUDE.md` "Current phase"; no spec §1 row changes)

## Context

Ideation is complete in the only sense that matters: spec §1 closes D1–D14, and §2–§10 specify the pipeline, screens, design system and architecture down to the level where **the next unresolved questions are no longer answerable on paper**. Three concrete examples, each currently a guess:

1. **§3 parsing — "YAML subset … enough for real SKILL.md files in the wild."** Which YAML shapes actually appear is a property of the corpus on this machine (roughly 90 plugin skills across the `ios`, `android`, `shared`, `data-analytics` and `anthropic-skills` namespaces, plus `~/.claude`, plus `.cursor/`). Another markdown pass guesses at that list; one indexer run measures it.
2. **§4 linking — D4's backtick-token-only rule.** Whether that yields a useful graph or a nearly empty one depends entirely on how often real artifacts backtick each other's names. If link density is near zero, the defect is in D4, not in the linker.
3. **§6 validation — the heuristic validators under D10.** A heuristic that WARNs on 90% of the corpus is worthless, and no amount of specification detects that. Only the WARN list produced against real artifacts can judge it.

Continuing in markdown now has diminishing returns *and* a rising cost: it over-specifies against untested assumptions, and the decision-first rule then makes each correction a record. Building sooner means fewer wrong constraints to unwind.

**Sequencing convention adopted (external practice).** `docs/plans/v1-milestones.md` sequences v1 as a **walking skeleton** first — the thinnest end-to-end slice touching every §10 architectural box — then **vertical slices** per capability, rather than layer-by-layer (all scanning, then all parsing, then all UI). Current guidance verified:

- Walking skeleton — thinnest end-to-end implementation that links all major components and validates the architecture before feature work: https://distilledpatterns.org/patterns/walking-skeleton/ and https://www.mattblodgett.com/2020/09/start-with-walking-skeleton.html
- Vertical slice — a milestone demonstrating progress across all components, instead of building every layer and integrating at the end: https://en.wikipedia.org/wiki/Vertical_slice and https://techleadhandbook.org/agile/feature-slicing/

**One D3 risk retired by search, not by code.** D3 depends on recursive directory watching that also tracks directories created *after* the watch starts — precisely what a git branch switch produces. Bun implements `fs.watch(dir, { recursive: true })` (https://bun.com/docs/guides/read-file/watch), and the post-watch-directory gap was closed in Bun v1.3.14: "Previously, `fs.watch("dir", { recursive: true })` only registered the directory tree that existed at the time `watch()` was called." (https://bun.com/blog/bun-v1.3.14). D3 therefore needs no rework, and the watcher can safely be sequenced late (M6).

**Entry conditions discovered while writing this record.** Two gaps make the build phase's own rules unenforceable, listed as E1–E2 below: the project is not a git repository, and `AGENTS.md` does not exist.

## Decision

Move the project from design ideation to build, executing v1 as the milestone sequence in `docs/plans/v1-milestones.md`.

## Trade-off accepted

The spec stops being cheap to change — from here every §1 row or lasting constraint costs a record; in return the remaining unknowns get answered by running code against the real corpus instead of by more prose.

## Consequences

On acceptance, in one commit referencing `0002`:

- **Spec sections to update:** title line `# dotclaude — Design Spec (v1, ideation)` → `(v1, build)`. **§1 rows D1–D14 unchanged** — this record changes process state, not a product decision, so it adds no D-row.
- **Files or areas affected:** `CLAUDE.md` "Current phase" section — phase becomes **build**, and the "do not write application code" bullet is replaced by a pointer to `docs/plans/`. `docs/plans/v1-milestones.md` is added by this record.
- **Follow-up tasks:**
  - **E1 (blocker, before M0)** — `git init` plus a baseline commit. Until then "branch names are explicit in every plan" and "commits reference the decision record ID" cannot hold, so the phase gate has nothing to attach to.
  - **E2 (blocker, before M0)** — create the `AGENTS.md` → `CLAUDE.md` symlink declared in the Context-layer section. It does not currently exist, so Cursor reads no project rules at all.
  - **E3** — run the `validate-ai-instructions` 15-point checklist against `CLAUDE.md` after the phase-line edit, per its own Validation section.
  - **E4** — the `docs/` layout in the Context-layer map now exists (the spec, `TEMPLATE.md` and `0001` previously sat in the repo root and were moved into `docs/` alongside this record). No further action; noted so the move is on the record.

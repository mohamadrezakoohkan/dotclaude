# 0001 — Adopt decision records

- Status: Accepted
- Date: 2026-07-29
- Supersedes: —

## Context

Spec §1 closed all v1 decisions (D1–D14) in a single table, but it only shows current state — not history or reasoning. AI sessions are stateless: without a persisted "why", later sessions re-litigate or silently reverse earlier choices. Research on agent context layers supports recording decisions as repo files agents can load:

- Decision compliance study (explicit decision context vs codebase-only): https://arxiv.org/pdf/2605.08112
- Spec-driven development — decouple spec from implementation, keep it in the repo: https://towardsdatascience.com/from-vibe-coding-to-spec-driven-development/
- Living decision doc prevents the "whack-a-mole" failure in long vibe-coded projects: https://sidbharath.com/blog/vibe-coding-guide/

## Decision

Record every decision change as an append-only markdown file in `docs/decisions/`, and update spec §1 in the same commit.

## Trade-off accepted

A few minutes of writing per change; in return, any future session reconstructs the "why" without chat history.

## Consequences

- Spec sections to update: §1 stays the current-state summary; this folder holds the history.
- Files or areas affected: `CLAUDE.md` (procedure added), `docs/decisions/TEMPLATE.md` (added).
- Follow-up tasks: —

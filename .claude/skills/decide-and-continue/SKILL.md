---
name: decide-and-continue
description: >-
  Resolves the open questions from the previous reply without waiting for Reza,
  states each choice and its rejected alternative in one line, and continues the
  task. Use when Reza writes "decide and continue", "decide yourself", or picks
  no option from a Q1-Q3 block. Accepting a decision record needs an explicit
  in-session delegation from Reza and the provenance written into its Status
  line. Do NOT use to merge into main, push, or take any other irreversible or
  outward-facing action — those stop for Reza regardless of this skill.
---

# Decide and continue

Every reply to Reza ends with three follow-up questions (`CLAUDE.md` → Reply format). Normally they wait for him. This skill answers them instead, then keeps working — so a session spends its turns on the task, not on round-trips.

Invoking this skill is standing approval **for the current task only**: the plan on the table and the questions in the last reply. It does not carry into the next task, and it does not change the default loop in `CLAUDE.md` — that loop still presents a plan and waits, unless this skill is invoked.

## Workflow

1. **List what is actually open.** The Q1-Q3 block from the last reply, plus any question asked mid-reply and left hanging. If nothing is open, say so in one sentence and continue the task — do not invent questions to answer.
2. **Check each open item against Stop conditions below.** Anything that trips one is not yours to decide.
3. **Decide the rest.** One line each: the choice, and the alternative rejected. Cite the rule or measurement that settles it — a `CLAUDE.md` clause, a spec section, a number from a test run. A decision resting only on preference is a decision that should have been Reza's.
4. **Do the work.** Continue straight into implementation for the decided items. Order the work so anything blocked by a Stop condition comes last, and everything unblocked ships regardless.
5. **Report at the end.** State what was decided, what was built, and what remains blocked and on whom.
6. **Close with a fresh Q1-Q3.** The reply format still applies. The three questions must be about what is open *now* — never a restatement of what this skill just decided.

**Exception — a standing directive.** When Reza sets a goal like "decide until there is no more questions", that instruction outranks the reply format (`CLAUDE.md` → Precedence, rule 1). Once nothing is open, end without a Q1-Q3 block and say plainly that nothing remains, rather than manufacturing three questions to satisfy a format his instruction has suspended.

## Stop conditions

These outrank the skill. When one fires, do the rest of the work and hand that item back.

| Situation | Why it stops | What to do instead |
|---|---|---|
| The choice needs a decision record (`CLAUDE.md` → what counts as a decision) | Only Reza sets `Status: Accepted`; self-approving forges the project's own gate | Write the record as `Proposed`, implement on the branch if the code is reversible, name the merge as blocked |
| …**unless** Reza delegated the decision in-session — a standing "decide until nothing is open" is his approval given in advance | Precedence 1 outranks `CLAUDE.md`; refusing would make his own instruction unsatisfiable | Set `Status: Accepted`, and name the instruction that approved it in the record's Status line so the provenance is auditable |
| Irreversible or outward-facing: merge to main, push, delete, publish, anything leaving the machine | Cost of a wrong guess is unbounded and unrecoverable | Ask, with the exact command you would run |
| Both readings lead to materially different work, and guessing wrong means a rewrite | The round-trip is cheaper than the rework | Ask one question, do the unaffected work first |
| The question is about what Reza wants, not what is correct | No rule or measurement can settle taste | Ask, and offer a default so silence still moves |

Everything else — naming, file layout, library choice inside an approved dependency budget, test strategy, which milestone a fix belongs to — you decide.

## Worked example

Reza's Q2 asked whether to record per-source scan timings or one total. Decided in-skill:

> **Per-source, decided.** M0 has one source so the two are identical today, but M1 adds several and a single total would let repo size masquerade as artifact count — which is the number D2's ~5k threshold is judged on. Rejected the single total as cheaper now and wrong later.

That is the whole shape: choice, reason anchored to a spec decision, rejected alternative, one line each. No preamble, no restating the question.

## Failure paths

- **A decision turns out wrong mid-flight.** Revert it, say so in one line, continue. Do not re-litigate it or tally it against yourself.
- **Reza contradicts a decision this skill made.** His instruction wins immediately (`CLAUDE.md` → Precedence). Apply it and move on without defending the earlier call.
- **A Stop condition is noticed only after the work is done.** Say so plainly, and leave the artifact un-merged pending his answer rather than quietly keeping it.
- **Everything open trips a Stop condition.** Then there is nothing to decide: report the blockers, do any unrelated work that is ready, and end with the Q1-Q3 block as usual.

## Instructions for AI

- Decide, then act in the same turn. A reply that only announces decisions has done half the job.
- One line per decision. The rationale is the anchor, not an essay.
- Never mark a decision record `Accepted` on your own judgment. Do it only under an explicit in-session delegation from Reza, and write that delegation into the Status line.
- Ship the unblocked work even when part of the task is blocked, and say exactly what was left out.

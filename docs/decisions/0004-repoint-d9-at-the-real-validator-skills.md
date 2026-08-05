# 0004 — Repoint D9 at the validator skills that actually exist

- Status: Accepted — approved by Reza's standing in-session directive "`/decide-and-continue` until there is no more questions" (2026-07-29), not by a separate review
- Date: 2026-07-29
- Supersedes: D9 (spec §1) and the provenance claim in §6's opening line

## Context

`CLAUDE.md` requires the `validate-ai-instructions` 15-point checklist before any skill, agent or command is committed. Writing the `decide-and-continue` skill triggered that rule and the checklist could not be found.

**It does not exist.** Not in `~/.claude` (317 indexed skills, searched by name, by path, and by the string `15-point`), and not as a published convention — a web search surfaces plenty of Claude-skill validation checklists ([mintmcp](https://www.mintmcp.com/blog/validation-checklist-claude-skills), [Latitude](https://latitude.so/blog/how-to-validate-prompts-for-task-specific-ai-features)) but none with these 15 numbered validators. §6 is not wired to an outside checklist; it invented one and attributed it outward.

What *does* exist, both with a `validate.py` that exits non-zero on structural failure:

- `plugins/marketplaces/org-ai-plugins/.claude/skills/validate-skill` — structural rules + **8** quality items
- `plugins/marketplaces/org-ai-plugins/.claude/skills/validate-agent` — structural rules + **13** quality items

Mapping §6's numbering onto them:

| §6 validator | Real source | Where |
|---|---|---|
| 1 Overlap | **none** | §6 defines the mechanism itself |
| 2 Precision | "vague words have a threshold or example" | both |
| 3 Intent preservation | **none** | — |
| 4 Length | structural: max 500 lines | both, script-enforced |
| 5 Identity distortion | **none** | — |
| 6 Negative triggers | "description covers when NOT to" | both |
| 7 Testability | "every rule maps to an observable outcome" | both, **partial** — folded inside the precision item |
| 8 Positive framing | "negations state the replacement action" | both |
| 9 Example–rule consistency | "examples match the rule they illustrate" | both |
| 10 Precedence | "precedence is explicit" | `validate-agent` only |
| 11 Failure paths | "failure paths defined alongside the happy path" | `validate-agent` only |
| 12 Output contract | "output contract is declared" | `validate-agent` only |
| 13 Redundancy | "every line earns its place" | both |
| 14 Context budget | "reference material lives in `references/`" | `validate-skill` only |
| 15 Terminology | "one name per concept" | both |
| 16 Time-sensitive content | "no time-sensitive content (hardcoded versions, dates)" | both — **added by this record**, since §6 had no validator for a check both real checklists carry |

Four consequences fall out of that table:

1. **11 of 15 have a real source. Three have none: 1, 3 and 5.** Two of those three — 1 Overlap and 5 Identity distortion — are precisely the validators §6 designates as the only ones permitted to score 0 and emit **FAIL**. D10's whole false-FAIL policy rests on the two checks with no provenance. They remain *implementable*, because §6 specifies their mechanism (name collision; exact-phrase lexicon) — the false claim is that they came from an external checklist.
2. **The 2/1/0/N-A scoring model exists in neither real skill.** Both are checkbox lists; `grep` for scoring language returns nothing. Also dotclaude's own invention.
3. **§6's S/A/R classes are two-thirds real.** The split matches the two skills exactly — `validate-skill` = S, `validate-agent` = A — but **R (rule/memory) has no validator source at all**, while §6 assigns it a class as though it did.
4. **The real skills carry a check §6 lacks:** "no time-sensitive content (hardcoded versions, dates)". Both include it; §6 has no validator for it.

Evidence: `docs/plans/walking-skeleton.md` → "The checklist D9 names does not exist"; `python3 …/validate-skill/scripts/validate.py` run against the new skill (exit 0).

## Decision

Repoint D9 at the two real skills as the source for classes S and A, and state §6's numbering, scoring and validators 1/3/5 as dotclaude's own design rather than external provenance.

## Trade-off accepted

§6 loses the authority of citing an external standard and must defend its own numbering — accepted because the alternative is a spec that cites a document nobody can open, and because the two real skills ship an executable script the spec can actually call.

## Consequences

- **Spec sections to update:** §1 row D9 (Choice + Trade-off), §6 opening line ("Wired to the **`validate-ai-instructions`** 15-point checklist: same validator numbers, same 2/1/0/N-A scoring, same artifact classes"), and §6's automation-split table where it implies external backing.
- **`CLAUDE.md` → Validation** must name a checklist that exists, or the project's own commit rule is unenforceable. It has already been unenforceable once, this task.
- **M4 is affected but not blocked.** Every auto validator §6 specifies is still implementable from §6 alone. What changes is that validators 3, 7 and the R class need explicit v1 treatment — most likely "manual" for 3, merged into 2 for 7, and R declared N-A until a rule/memory checklist exists.
- **Decided here, not deferred:** a time-sensitive-content validator **is** added, as **16**, auto-heuristic (so D10 caps it at WARN). Both real checklists carry the check, and the corpus is the argument — plugin paths carry hardcoded versions (`ios/3.1.8` vs `ios/3.3.0`) and four cached versions of one plugin coexist. §6 becomes a 16-validator scheme.
- **Also decided:** validator 7 (Testability) stays **manual** rather than being merged into 2, because its real-world source is only a clause inside another item — too thin to automate against. Class **R** reports N-A for validators with no applicable item rather than inventing verdicts.
- **Follow-up task:** M4 must reuse `validate.py` rather than reimplementing the structural pre-checks — it already enforces frontmatter, kebab name, name-matches-folder and the 500-line cap, which is §6's "Structural pre-checks" row almost verbatim.

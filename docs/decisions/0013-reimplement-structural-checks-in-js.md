# 0013 — Reimplement the structural pre-checks in JS instead of calling `validate.py`

- Status: Accepted — approved by Reza's standing instruction to finish M2–M7 deciding each call (2026-07-29)
- Date: 2026-07-29
- Supersedes: the follow-up task of `0004` ("M4 must reuse `validate.py` rather than reimplementing the structural pre-checks")

## Context

`0004` repointed D9 at the real `validate-skill` and `validate-agent` skills, and left a follow-up: M4 should call their `validate.py` rather than reimplement §6's "Structural pre-checks" row. That was the right instinct — don't duplicate a maintained rule set — but it does not survive contact with M4's actual shape.

Three reasons, in order of weight:

1. **It adds a runtime prerequisite the spec forbids.** §10 budgets zero dependencies, and `0005` fixed the runtime contract at the Node/Bun intersection. Shelling out to `python3` makes Python a hard requirement for the validation feature to work at all — on a machine where it happens to be absent, artifacts would show no verdict with no obvious cause.
2. **The call pattern is wrong for this app.** The index is in memory and rebuilds wholesale on every change (D2, and M6's watcher). Validation runs over 581 artifacts per rebuild; that is 581 process spawns per keystroke-triggered re-index, against checks that take microseconds inline.
3. **There is almost nothing to reuse.** The structural row is four rules: frontmatter parses, kebab-case name, name matches its folder, length cap. `0004` already transcribed `validate.py`'s rule set into §6 — the *rules* were the valuable part, and they are now in the spec where every session reads them.

What is genuinely lost: `validate.py` may gain a rule that dotclaude then misses. That risk is real but small, and it is a documentation-drift problem rather than an architectural one.

Evidence: `docs/decisions/0004-repoint-d9-at-the-real-validator-skills.md` → Follow-up task; `docs/plans/validation.md`.

## Decision

Implement §6's structural pre-checks natively in JS, and treat `validate-skill` / `validate-agent` as the authority for the *rules* rather than as an executable dependency.

## Trade-off accepted

dotclaude's structural checks can drift from `validate.py` if that script gains a rule — accepted because the alternative is a Python prerequisite, 581 process spawns per re-index, and a hard dependency for four lines of logic.

## Consequences

- **Spec sections to update:** §6's "Structural pre-checks" row, to drop the delegation wording `0004` added.
- **Files or areas affected:** `src/validators.js`.
- **When `validate-skill` changes, §6 must be updated by hand.** That is the cost of this decision and the thing most likely to be forgotten — it belongs in the spec-kit adoption plan (`0008`), where `/speckit.analyze` is exactly the tool for catching it.
- **The CLI in §12 (v1.5) still emits the checklist's output contract,** so CI enforcement is unaffected by where the checks live.
- **Follow-up task:** —

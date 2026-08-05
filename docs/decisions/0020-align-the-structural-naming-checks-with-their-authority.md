# 0020 — Align the structural naming checks with their authority, and decline the two rules that do not travel

- Status: Accepted — Reza delegated feature-level and record-level decisions for this iteration ("decide best decisions and recommendations on your own don't rely on me", 2026-08-04)
- Date: 2026-08-04
- Supersedes: — (extends §6's structural pre-check row; D9/D10 unchanged)

## Context

`001-cli-validate` made §6's verdicts **enforceable**: `npm run validate` exits non-zero on a FAIL, so a wrong FAIL now blocks a PR rather than merely looking wrong in a UI. That raised a question nobody had asked since M4's calibration — *are the 39 FAILs correct?* — and the answer required reading the authority rather than trusting the implementation.

**All 39 are correct.** Broken down: 24 same-source name collisions whose content differs (validator 1, calibrated in `0013`'s plan), 6 non-kebab-case names, 5 oversized bodies, 2 missing descriptions, 1 name/folder mismatch, 1 template placeholder still reading `REPLACE-WITH-SKILL-NAME`. The CLI can be trusted as a gate.

The audit began from a suspicion that turned out to be wrong, and the wrongness is the useful part. Six agents FAIL on `name is not kebab-case` — `Brand Guardian`, `UX Architect`, `Frontend Developer` and three more — and display names for agents looked like a case of dotclaude inventing a rule and blaming well-formed artifacts, the exact defect `0015` existed to fix. Reading the real `validate-agent` settled it:

> `name` | Lowercase, `[a-z0-9][a-z0-9\-.]`, max 64 chars, no XML tags, no reserved words (`anthropic`, `claude`, `cursor`)
> `name` | Must match the agent's filename (without `.md`)
> `name` | Must be prefixed with the plugin name (e.g. `ios-`, `android-`, `backend-`) or `workorg-` for `shared/`

Kebab-case is upstream's rule, faithfully applied. But the same table exposed the opposite problem: **dotclaude enforces a subset of the authority it names.** §6 says `validate-skill` / `validate-agent` "remain the authority for the *rules*", and `0013` says a change there "must be mirrored into this section by hand" — so a rule in the authority and absent here is a gap, not a choice, until someone decides otherwise. This record decides.

### Measured before deciding, for each of the four rules

| Upstream rule | In dotclaude? | Violations in the current corpus |
|---|---|---|
| Lowercase kebab-case | yes | 6, all correct |
| `name` matches the agent's **filename** | **no** | 6 — and **all 6 already FAIL** on kebab-case, so adopting it adds **zero** new FAILs |
| **max 64 chars** | **no** | 0 of 611 classified artifacts |
| **no reserved words** (`anthropic`, `claude`, `cursor`) | **no** | 3 — `claude-automation-recommender`, `claude-md-improver`, `claude-security` |
| Prefixed with the plugin name (`ios-`, `workorg-`…) | **no** | not measured; see below |

## Decision

Adopt the two upstream naming rules that generalise — an agent's `name` must match its filename, and a name may not exceed 64 characters — and decline the two that do not: the reserved-word list and the plugin-name prefix.

## Trade-off accepted

§6's structural row grows from four rules to six, and two of the six have never fired on this corpus — so they are principle rather than measurement, which is the opposite of how M1 and `0013` justified their checks. Accepted because the authority states them, `0013` made mirroring the authority the standing rule, and both are deterministic and cheap. If either ever fires wrongly, that is a record, not a silent loosening.

## Alternatives rejected

- **Adopt the reserved-word rule.** It would FAIL `claude-automation-recommender`, `claude-md-improver` and `claude-security` — three skills *about* Claude, not three skills impersonating Claude. Upstream can afford a substring rule because its corpus is one organisation's plugins; dotclaude indexes whatever is on the machine. Failing a well-formed artifact because its subject matter appears in its name is `0015`'s defect with a new mask, and `0015`'s remedy is the precedent: when a rule's empirical basis does not survive a wider corpus, the rule follows the corpus.
- **Adopt the plugin-name prefix rule.** `ios-`, `android-`, `backend-`, `workorg-` are one organisation's conventions. dotclaude's whole premise (§1's problem statement) is indexing unrelated folders on a developer's machine, so a workorg prefix requirement would fail most artifacts on most machines. Not measured, deliberately — the measurement would only quantify how wrong it is.
- **Close the gap silently, as a bug fix.** Rejected by CLAUDE.md's own test: §6's structural row enumerates its rules, so adding two changes a stated constraint future sessions must respect. That is a decision.
- **Leave the gap open and record only the audit.** Tempting, since neither new rule fires today. Rejected because "the authority says X and we do not do X" is precisely the drift `0013` asked to be mirrored by hand, and an unmirrored authority quietly stops being one.

## Consequences

- **Spec sections to update:** §6's "Structural pre-checks" row — the enumerated rules become: frontmatter parses; kebab-case name; **name ≤ 64 characters**; name matches folder (skills) **or filename (agents)**; length cap. Record the two declined rules and why, so the gap is not "found" again and closed wrongly.
- **Files or areas affected:** `src/validators.js` (`structuralChecks`), `test/run.test.mjs`, `docs/dotclaude-design-spec.md` §6.
- **Expected effect on the corpus: none.** 39 FAILs before, 39 after. A check that changes no verdict today is doing its job for the artifact written next week; `quickstart.md`'s numbers are evidence at a moment, not a bar (CLAUDE.md).
- **D10 is untouched.** Both new rules are deterministic, so both may legitimately score 0. Neither is a heuristic and neither goes near the clamp.
- **The class-R exemption still applies.** Rules and memory have no name contract (`0004`), and `name matches filename` must not fire on `dotclaude/CLAUDE.md`, whose name is deliberately path-derived (`0003`).
- **Follow-up task:** —

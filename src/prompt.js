import { classOf } from './validators.js'

// §6 Claude handoff: the artifact body + the full checklist + the exact output contract,
// ready to paste. v1 never stores the returned verdict (D11, §11) — this closes the manual
// loop by handing it to Claude, not by recording an answer.

// The five judgment validators §6 marks manual, plus the numbering they belong to.
const MANUAL_CHECKS = [
  ['3', 'Intent preservation', 'Does the artifact still do what its description promises, end to end?'],
  ['7', 'Testability', 'Could someone else verify each rule was followed, from the artifact alone?'],
  ['9', 'Example–rule consistency', 'Does every example illustrate the rule it sits under, without drifting?'],
  ['10', 'Precedence', 'When two instructions could conflict, does the artifact say which wins?'],
  ['15', 'Terminology', 'One name per concept throughout — no synonym drift between sections?'],
]

/** The exact contract §6 requires: `VERDICT: PASS|FAIL` as the last line. */
export const VERDICT_CONTRACT = 'VERDICT: PASS|FAIL'

export function buildValidationPrompt(artifact) {
  const cls = classOf(artifact.type)
  const auto = (artifact.validation?.checks ?? []).filter((c) => c.mode !== 'manual')

  // The body comes first and the output contract last, so the instruction §6 cares about
  // is the final thing read. A prompt that ends with 400 lines of someone else's markdown
  // buries its own contract.
  return `Review this ${artifact.type} against the checklist below.

Artifact: ${artifact.name}
Class: ${cls} (${cls === 'S' ? 'skill/command' : cls === 'A' ? 'agent' : 'rule/memory'})
Source: ${artifact.source}
Path: ${artifact.absPath}

## Artifact body

<artifact>
${artifact.body ?? ''}
</artifact>

## Already checked automatically — do not redo these

${auto.map((c) => `${c.id}. ${c.title}: ${scoreLabel(c.score)}${c.note ? ` — ${c.note}` : ''}`).join('\n')}

## Judgment validators — these are yours to assess

${MANUAL_CHECKS.map(([n, title, question]) => `${n}. ${title} — ${question}`).join('\n')}

Scoring: 2 = met, 1 = partial, 0 = blocker, N-A = not applicable.

## Output contract

Report each judgment validator with its number, a score, and one sentence of
reasoning. FAIL only for a blocker. Then, as the very last line of your reply
with nothing after it, emit exactly this, with PASS or FAIL substituted:

${VERDICT_CONTRACT}`
}

function scoreLabel(score) {
  if (score === null) return 'N-A'
  return String(score)
}

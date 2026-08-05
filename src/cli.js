// §12 v1.5, specs/001-cli-validate: the companion CLI. One subcommand, `validate`, so a CI
// job can gate a PR on the validators §6 already defines.
//
// It reuses `buildIndex` and the validators unchanged (FR-005). The gate rule is NOT
// re-derived here: §6's "a deterministic check scored 0" lives in `summarize()` in
// src/validators.js, and this file reads the verdict that produces. That is what makes the
// CLI and the app's chip agree by construction rather than by agreement (SC-001).
//
// Unlike the server, this has NO cache: it builds the index every run. That is what makes it
// the instrument to trust in CI — `/api/index` serves a snapshot for the first seconds after
// boot (§10, by design), so curling a freshly started server can read yesterday's verdicts.
//
// Writes nothing, anywhere (FR-010, D11). Zero dependencies, so no flag parser (§10).

import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildIndex, allArtifacts } from './indexer.js'
import { resolveMode, setMode, loadSources } from './config.js'
import { VERDICT_CONTRACT } from './prompt.js'

// The contract §6 fixes, derived from prompt.js's export rather than restated, so a change
// there cannot leave the CLI printing yesterday's contract.
const [PASS_LINE, FAIL_LINE] = VERDICT_CONTRACT
  .replace('VERDICT: ', '')
  .split('|')
  .map((v) => `VERDICT: ${v}`)

const USAGE = `dotclaude — validate artifacts against §6

  npm run validate                 every artifact in every configured source
  npm run validate -- <path>...    only these paths

Exit: 0 nothing failed · 1 a FAIL or an unreadable path · 2 misuse
WARN never gates (D10).`

/**
 * The testable core: given an already-built artifact set, report and decide the exit code.
 * Deliberately free of `buildIndex`, so tests exercise the contract without a corpus scan.
 * @returns {Promise<number>} exit code
 */
export async function runValidate(artifacts, argv = [], out = console.log, err = console.error) {
  const { selected, skipped, unreadable } = await select(argv, artifacts)

  for (const a of selected) {
    const verdict = a.validation?.verdict ?? 'WARN'
    out(`${verdict.padEnd(5)} ${a.name.padEnd(42)} ${a.source}`)
    if (verdict === 'FAIL') {
      // FR-007: name the failing validator and its note, so a CI log is enough to act on.
      for (const c of a.validation.checks ?? []) {
        if (c.mode !== 'deterministic' || c.score !== 0) continue
        // Numbered validators read "1 Overlap"; the structural pre-check's id IS its title
        // lowercased, so printing both gives "structural Structural".
        const label = c.id === c.title.toLowerCase() ? c.title : `${c.id} ${c.title}`
        out(`        ${label} — ${c.note}`)
      }
    }
  }
  for (const s of skipped) out(`SKIP  ${s.padEnd(42)} not a classifiable artifact`)
  for (const u of unreadable) err(`cannot read: ${u}`)

  if (!selected.length) {
    out(`no artifacts validated${argv.length ? ' — every path given was skipped' : ''}`)
  }

  // Read the verdict; never recompute the rule (FR-005). An unreadable path gates too: from
  // CI's point of view "this is not acceptable" and "I could not check it" both mean stop.
  const gated = selected.some((a) => a.validation?.verdict === 'FAIL') || unreadable.length > 0

  out('')
  out(gated ? FAIL_LINE : PASS_LINE) // SC-003: unconditional, and always the last line.
  return gated ? 1 : 0
}

/**
 * Build the index, then validate. FR-006: the whole index, always — see `select`.
 *
 * 0023 SC-006: the mode is taken from the environment only. A CI job inside a project sets
 * DOTCLAUDE_WORKSPACE and gates on that project's workspace; there is no `--workspace` flag here
 * because this command's arguments are paths (see the header — no flag parser, by decision).
 */
export async function validateCommand(argv = [], out = console.log, err = console.error, env = process.env) {
  const launch = resolveMode([], env)
  setMode(launch)
  if (launch.mode === 'workspace') {
    const probe = await loadSources()
    if (probe.fatal) {
      // Gate, and gate loudly. Validating an empty index would print PASS — a green CI run on a
      // config that could not be read is the confidently-wrong answer D10 and 0015 both forbid.
      err(`workspace: ${probe.configError}`)
      out('')
      out(FAIL_LINE)
      return 1
    }
  }
  // Validators 1 (Overlap) and 6 (siblings) read the cross-artifact set, so validating one
  // file against an index of one would report "no same-scope name collision" for an artifact
  // that genuinely collides — a false PASS. This is the error `0017` refused for folder scope:
  // a narrowed input making a cross-artifact answer wrong rather than merely partial.
  await buildIndex()
  return runValidate(allArtifacts(), argv, out, err)
}

/**
 * Split requested paths into artifacts to validate, paths that are simply not artifacts
 * (skip, no gate — FR-008), and paths that could not be read (gate — FR-009). The difference
 * between the last two is whether the file exists at all.
 */
async function select(argv, artifacts) {
  if (!argv.length) return { selected: artifacts, skipped: [], unreadable: [] }

  const byAbs = new Map(artifacts.map((a) => [a.absPath, a]))
  const selected = []
  const skipped = []
  const unreadable = []

  for (const arg of argv) {
    const abs = path.resolve(arg)
    const hit = byAbs.get(abs)
    if (hit) {
      selected.push(hit)
      continue
    }
    try {
      await fs.access(abs)
      // Exists but is not indexed: not a classifiable artifact, or outside every configured
      // source. Not a failure — CI passes whole changed-file lists, so a `.ts` file in the
      // list must not gate the run.
      skipped.push(path.basename(abs))
    } catch {
      unreadable.push(arg)
    }
  }
  return { selected, skipped, unreadable }
}

/** Entry point. Separate from the command so tests can call either directly. */
export async function main(argv) {
  const [subcommand, ...rest] = argv
  if (!subcommand || subcommand === 'validate') return validateCommand(subcommand ? rest : [])
  if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    console.log(USAGE)
    return 0
  }
  console.error(`unknown subcommand: ${subcommand}\n\n${USAGE}`)
  return 2
}

// Run only when invoked directly, so importing this module in a test does not execute it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)))
}

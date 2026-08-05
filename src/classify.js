import path from 'node:path'

// §3 classification rules, first match wins. All six rows.
//
// Every rule also has a variant for "the source root is itself a `.claude` folder", which
// §3 states for agents and which applies equally to commands and rules — a source
// registered as `~/.claude` has no `.claude/` segment left in its relative paths.

const AGENTS = /(?:^|\/)\.claude\/agents\/([^/]+)\.md$/
const AGENTS_AT_ROOT = /^agents\/([^/]+)\.md$/
// `.cursor/commands` is included per record 0010 — the only command artifact in the real
// corpus lives there, and D14 already committed to indexing Cursor's artifacts.
const COMMANDS = /(?:^|\/)\.(?:claude|cursor)\/commands\/(.+)\.md$/
const COMMANDS_AT_ROOT = /^commands\/(.+)\.md$/
const CLAUDE_RULES = /(?:^|\/)\.claude\/rules\/([^/]+)\.md$/
const CLAUDE_RULES_AT_ROOT = /^rules\/([^/]+)\.md$/
const CURSOR_RULES = /(?:^|\/)\.cursor\/rules\/([^/]+)$/

/**
 * @param {string} absPath
 * @param {string} relPath source-relative path, POSIX separators
 * @param {boolean} rootIsDotClaude true when the source root is a `.claude` directory
 * @returns {{type: string, name: string}|null} null means "not an artifact"
 */
export function classify(absPath, relPath, rootIsDotClaude) {
  const base = path.basename(absPath)

  // Row 1 — **/SKILL.md. Also covers row 4 (.cursor/skills/*/SKILL.md), which is the same
  // shape; first match wins, so row 4 needs no separate branch.
  if (base === 'SKILL.md') {
    return { type: 'skill', name: path.basename(path.dirname(absPath)) }
  }

  // Row 2 — agents.
  const agent = relPath.match(AGENTS) ?? (rootIsDotClaude ? relPath.match(AGENTS_AT_ROOT) : null)
  if (agent) return { type: 'agent', name: agent[1] }

  // Row 3 — commands. §13: nested folders joined with `:`, prefixed with `/`.
  const command = relPath.match(COMMANDS) ?? (rootIsDotClaude ? relPath.match(COMMANDS_AT_ROOT) : null)
  if (command) return { type: 'command', name: `/${command[1].split('/').join(':')}` }

  // Row 5 — rules. `.cursor/rules/*` matches any extension (.mdc is common); `.claude`
  // rules are `.md`.
  const rule =
    relPath.match(CLAUDE_RULES) ??
    relPath.match(CURSOR_RULES) ??
    (rootIsDotClaude ? relPath.match(CLAUDE_RULES_AT_ROOT) : null)
  if (rule) return { type: 'rule', name: rule[1].replace(/\.mdc?$/, '') }

  // Row 6 — memory, at any depth. Named parent folder + filename so two CLAUDE.md files
  // in one source stay tellable apart in a list.
  if (base === 'CLAUDE.md' || base === 'AGENTS.md') {
    const parent = path.basename(path.dirname(absPath))
    return { type: 'memory', name: `${parent}/${base}` }
  }

  return null
}

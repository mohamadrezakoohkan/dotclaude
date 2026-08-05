# M1 — Index pipeline · `feat/index-pipeline`

Task plan for milestone M1 in `docs/plans/v1-milestones.md`.

**Spec sections read:** §2 (full sources table, missing-path behaviour), §3 (all six classification rows, parsing, the ignore list / depth cap / cycle guard), §13 (port, priority defaults, platform prefixes). Records carried in: `0003` (path-derived ids, `name` deliberately non-unique), `0005` (Node/Bun intersection, zero dependencies), `0004` (validator vocabulary — not built here, but §6 terms are used).

**Process note.** `CLAUDE.md` asks for a fresh session per milestone; this milestone continues in M0's session on Reza's instruction to continue through M7. The spec and records were re-read rather than relied on from memory.

## Goal

All six §3 classification rows; plugin auto-tag and `plugin-name:artifact-name` alias; ignore list, depth cap 10, symlink cycle guard; the YAML-subset frontmatter parser; parse-error chip; multi-source config with `priority`; missing-path error chip that still boots.

## Sources — the real ones, not §2's examples

**Correction made during implementation.** This plan first claimed §2's example sources (`project-ios`, `project-android`) do not exist here. They do — nested at `ai-dev-harness/repos/`, missed by a `-maxdepth 2` search. Finding them is what surfaced the nesting problem that became record `0009`. The real roots:

| Source | Path | Priority |
|---|---|---|
| personal | `~/.claude` | 50 |
| org-shared | `~/code/work/.claude` | 100 |
| ai-plugins | `~/code/work/ai-plugins` | 100 |
| ai-dev-harness | `~/code/work/ai-dev-harness` | 100 |
| mobile-code-review | `~/code/work/mobile-code-review` | 100 |
| skill-project-creation | `~/code/work/skill-project-creation` | 100 |
| gh-actions | `~/code/work/gh-actions` | 100 |
| gh-workflows | `~/code/work/gh-workflows` | 100 |
| deblurring-skill | `~/code/work/deblurring-skill` | 100 |
| agent-sandbox | `~/code/work/agent-sandbox` | 100 |
| personal-tools | `~/code/work/personal-tools` | 100 |
| dotclaude | this repo | 100 |

**Each repo is its own source, deliberately.** Registering the `work/` parent as one source would scan the same files but collapse every repo into one `source` pill — and §5's cross-repo duplicate detection is defined on *distinct sources*. `ai-plugins` is the upstream of the plugins already cached under `~/.claude`, so this is what makes M3's cross-repo clusters visible at all. The parent-level `the work org/.claude` is registered as a `.claude` folder directly, which §3 row 2 explicitly allows, so it does not double-index the sub-repos.

Config moves out of code into `sources.json` (§2, and §8's first-run state names a config path). Missing file → app boots, every source shows an error chip.

**§13 note, not a spec change:** the documented priority tiers are project 100 > personal 50 > plugin 10. The plugin tier goes unused, because plugin artifacts live *inside* the personal source rather than in sources of their own. §13 calls priorities safe to change, so this is an observation, not a record.

## Scope

- `sources.json` + `src/config.js` — load, validate, expand `~`, per-source `priority`; unreadable or absent config degrades to an error state rather than a crash.
- `src/scan.js` — §3 ignore list (`.git`, `node_modules`, `Pods`, `DerivedData`, `build`, `.build`, `dist`, `.gradle`, `vendor`, `target`, `out`, `.next`), **max depth 10**, symlinks followed with a `realpath` visited-set cycle guard. Symlinked *files* must be indexed too — this repo's `AGENTS.md` is a symlink, and M0's scanner silently skipped it.
- `src/frontmatter.js` — the §3 YAML subset: `key: value`, quoted strings, inline `[a, b]` lists, dash lists, folded/literal blocks (`>-`, `>`, `|`, `|-`). Never throws; returns `{ data, error }`.
- `src/classify.js` — all six rows, first match wins, including the "source root is a `.claude` folder" variants and the `:`-joined nested command names (§13).
- `src/pipeline.js` — fills the `parse` stage in place: frontmatter → `description`, explicit `tags`, `name` override; `parseError` flag; plugin detection → auto tag `plugin` + `plugin-name:artifact-name` alias; §7 auto tags (source, type, platform prefix).
- `src/indexer.js` — multi-source, per-source timing and errors.
- UI — sidebar grouped by type with counts, source pill per row, parse-error chip, per-source error chips.

## Out of scope

Linker and backlinks (M2) — aliases are *stored*, not resolved. Duplicate clusters and effective/shadowed (M3). Validation verdicts (M4). Search, tag filtering UI, dashboard (M5). Watcher and snapshot (M6). Full design pass (M7).

## Validation

1. Every source indexes; per-type counts match a manual `find` spot-check.
2. A deliberately malformed frontmatter file is indexed, body shown raw, parse-error chip present, nothing crashes.
3. A configured missing path shows an error chip and the app still starts.
4. Depth cap and cycle guard: a symlink loop terminates.
5. `AGENTS.md` (a symlink) is indexed as `memory`.
6. Ids remain unique across all sources (`0003` holds at multi-source scale).
7. Scan wall time per source recorded.

**Empirical output required:** the list of YAML frontmatter shapes actually present in the corpus. A shape beyond §3's stated subset is a spec change — stop and write a record.

## Results

**581 artifacts across 16 sources in ~2.7 s** — 530 skills, 36 agents, 13 memory, 1 command, 1 rule. Against M0's 317-from-one-source, and against D2's "revisit past ~5k artifacts", the in-memory model still has an order of magnitude of headroom.

| Metric | Value |
|---|---|
| Artifacts | 581 |
| Sources | 16 (4 legitimately hold zero artifacts) |
| Files walked | ~70,500 |
| Slowest source | `ai-dev-harness`, 1137 ms / 29,991 files |
| Parse errors | 0 |
| Id collisions | 0 |
| Dirs skipped by the depth cap | 1,488 |

### Validation outcomes

| # | Check | Result |
|---|---|---|
| 1 | Every source indexes; counts match `find` | **Pass, exactly.** Set comparison of index vs disk under identical rules: 530 skills both sides, 0 missing, 0 extra |
| 2 | Malformed frontmatter → indexed, raw body, chip | **Pass** — a fixture with an unclosed block indexed as `broken-skill`, banner reads "Frontmatter did not parse… Body shown raw", nothing crashed |
| 3 | Missing path → error chip, app still starts | **Pass** — a `ghost` source rendered `ghost: path does not exist`, header read `17/18 sources`, 582 artifacts still served |
| 4 | Depth cap and cycle guard | **Pass** — a symlink loop pointing at its own ancestor terminates; **0 artifacts** lost to the depth cap, verified by re-walking with no cap |
| 5 | `AGENTS.md` symlink indexed as memory | **Pass** — M0's scanner skipped it silently; `scan.js` now stats symlinked files |
| 6 | Ids unique across all sources | **Pass** — 581 unique ids, `0003` holds at multi-source scale |
| 7 | Per-source timings recorded | **Pass** — table above |

22 assertions cover the parser and cycle guard, all passing.

### Empirical output — the YAML shapes really present

Surveyed 946 frontmatter blocks; 577 classified artifacts. **§3's stated subset is sufficient — no record needed.** In classified files: nested maps **0**, lists-of-maps **0**, flow mappings **0**. What does occur beyond §3's literal examples is two variants of features it already names, both now supported: block scalars with any chomp indicator (`>-` 412, `|` 71, `>` 3) and one quoted scalar opening on the line after its key. The `{{...}}` values that first looked like flow mappings are Mustache placeholders in `TEMPLATE.md` files, which no rule classifies.

Numbers are kept as strings deliberately: `version: 3.10` must not become `3.1`.

### Two spec defects found, both recorded

- **`0009`** — §2 said nothing about nested sources. `project-ios` and `project-android` sit inside `ai-dev-harness`, so registering both double-indexed every file underneath and would have handed M3 a phantom cross-repo duplicate for one file on disk. Innermost source now owns a file; `ai-dev-harness` cedes 2 files to the nested repos.
- **`0010`** — M1 reported zero commands. Correct per §3, wrong about the machine: both `.claude/commands` directories are empty and the only command in the corpus is in `.cursor/commands`, which D14's enumeration overlooked.

### Notes carried forward

- **4 sources hold zero artifacts** (`org-shared`, `gh-actions`, `gh-workflows`, `agent-sandbox`) — they contain only `settings.json`. Kept registered: dropping a source because it is empty today means the app quietly stops covering it tomorrow.
- **`ai-plugins` and `ai-plugins-workingtree` both hold 76 artifacts** with the same names. That is not a bug — it is the cleanest cross-repo duplicate pair in the corpus and M3's primary test case.
- **§13's plugin priority tier (10) is unused,** because plugin artifacts live inside the `personal` source rather than in sources of their own. §13 calls priorities safe to change, so this is an observation, not a record.
- **1,488 directories were skipped by the depth-10 cap** and cost nothing today, but that is luck rather than design — the check that proves it is re-walking with no cap, and M6 should keep it.

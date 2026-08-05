# dotclaude — Design Spec (v1, build)

> A local web app that indexes every AI-instruction artifact on your machine — skills, agents, commands, rules, `CLAUDE.md` — across unrelated folders, and presents them as a linked wiki. Visually, it behaves as if Claude's own app had a **Library** tab.

**Problem.** Artifacts live scattered across repos (`project-ios/.claude`, `project-android/.claude`, `~/.claude`, plugin caches, `.cursor/`). There is no single place to read them, see how they reference each other, spot drifted duplicates, or judge their quality. Claude Code consumes them; nothing browses them.

**One job.** Answer, for any artifact: *what is it, where does it live, what does it link to, is it the copy that actually loads, and is it well-written?*

---

## 1. Decision log — all loops closed

Every open question from ideation, resolved. Each row is final for v1 unless overridden (see §13).

| # | Decision | Choice | Trade-off accepted |
|---|----------|--------|--------------------|
| D1 | Platform | Local web app (localhost), single process | Not native macOS; gains instant UI iteration and zero install friction |
| D2 | Index storage | In-memory, rebuilt on change; JSON snapshot cache for instant startup | No SQLite; fine for hundreds of docs, revisit past ~5k artifacts |
| D3 | Refresh | Recursive file watcher + debounce → full re-index; manual Rescan button; SSE push to UI | Full re-index instead of incremental — simpler, cheap at this scale |
| D4 | Linking | Backtick-token matching only (`` `skill-name` ``, `/command`) | Misses unformatted mentions; avoids false links on plain words |
| D5 | Link ambiguity | `/token` → commands only; plain token → skill, then agent; if both exist → disambiguation popover | Never silently guesses between two artifacts |
| D6 | Search scope | Frontmatter by default (name, description, tags, allowed-tools); `body:` operator opts into full text | Keeps results precise; full-text is one keystroke away |
| D7 | Tags | Explicit `tags:` frontmatter + auto-derived tags, visually distinct | Auto tags may occasionally mislabel; they are outlined, never filled |
| D8 | Shadowing precedence | Explicit per-source `priority` number in config, plus `installed_plugins.json` as a declaration of which plugin copy is installed (record `0012`) | App never hard-codes Claude Code's internal precedence; you declare it, and the machine's own manifest is read rather than reimplemented |
| D9 | Validation source | dotclaude's own 16-validator scheme (§6), sourced from the real `validate-skill` (class S) and `validate-agent` (class A) skills and their `validate.py` | Judgment validators can't be automated; split auto vs manual (§6). No external standard backs the numbering — see record `0004` |
| D10 | False-FAIL policy | Only deterministic checks may score 0; heuristics can score at most "partial" | A real blocker caught by heuristic shows as WARN, never a wrong FAIL |
| D11 | Write access | Read-only. "Open in editor" hands off to VS Code / default app | No in-app editing; editors already do it better, keeps the tool safe |
| D12 | Remote sources | v2, via a source contract defined now (§2) so v1 needs no rework | v1 ships local-only |
| D13 | MCP alternative | Not v1. Roadmap v3 exposes the same index as an MCP server | Browser-first now; harness integration later |
| D14 | Cursor artifacts | Indexed alongside Claude's (`.cursor/skills`, `.cursor/rules`, `.cursor/commands` — the last added by record `0010`) | Slightly wider scan; matches how the work org actually stores skills |

---

## 2. Sources model

A **source** is a registered root folder. The indexer only ever sees "a directory" — this is the seam that makes remote v2 a drop-in.

| Field | v1 (local) | v2 (remote, contract only) |
|-------|-----------|----------------------------|
| `name` | Display name, unique ("project-ios") | same |
| `type` | `local` | `git` |
| `path` | Absolute or `~/…` folder | — |
| `url` / `ref` / `subpath` | — | Repo URL, branch, optional subfolder |
| `priority` | Integer; higher wins shadowing (§5) | same |
| `readOnly` | Implicit | Always true |

- v2 behavior (pre-decided): shallow-clone into a cache dir; refresh via a per-source Pull button plus optional interval; offline → serve last cache with a "stale" chip.
- Default config ships with three example sources — personal (`~/.claude`, priority 50), and two repo roots (priority 100) — clearly marked as examples to edit.
- Missing path at startup → source listed with an error chip, app still boots. Never crashes on config.
- **Sources may nest.** A file belongs to the most specific registered source containing it — longest matching root wins — and an outer source skips files an inner one owns (record `0009`). Without this, one file on disk indexes twice and §5 reports a phantom cross-repo duplicate.

**Where the source list comes from (record `0023`).** Normally `sources.json` — the machine-wide library. Given `--workspace <path>` (or `DOTCLAUDE_WORKSPACE`), the list comes from that project-local `workspace.json` **and from nothing else**; `sources.json` is not read, and no folder outside the workspace is walked. The file carries the same source contract as the table above under a `sources` array, so there is one schema rather than two. Two rules are specific to it:

- **Relative paths resolve against the workspace file's own directory**, so a file at `<project>/.claude/workspace.json` says `"path": ".."` to mean *this project*. `~/…` and absolute paths behave as everywhere else.
- **Failure splits by moment.** At boot, an unreadable or empty workspace file exits non-zero: the never-crashes-on-config rule above exists so a bad path cannot stop you browsing, and it must not become a silent fallback to a *wider* corpus than the one requested. At rescan or watch time the last good source list is kept and the breakage shows as a config chip, because a running server must not die because an editor saved atomically.

## 3. Indexing pipeline

**Scan → classify → parse → link → resolve duplicates → validate → serve.**

### Classification rules (first match wins)

| Pattern inside a source | Type | Canonical name |
|---|---|---|
| `**/SKILL.md` | skill | frontmatter `name`, else parent folder name |
| `**/.claude/agents/*.md` (or `agents/*.md` when the source root is a `.claude` folder) | agent | frontmatter `name`, else filename |
| `**/.claude/commands/**/*.md`, `**/.cursor/commands/**/*.md` (the latter added by record `0010`) | command | `/` + relative path under `commands/`, nested folders joined with `:` |
| `**/.cursor/skills/*/SKILL.md` | skill | as skills above |
| `**/.claude/rules/*.md`, `**/.cursor/rules/*` | rule | filename |
| `CLAUDE.md`, `AGENTS.md` (any depth) | memory | parent folder + filename |

- Artifacts found under a plugin layout (e.g. `<plugin>/skills/...`) additionally get the auto tag `plugin` and a linker alias `plugin-name:artifact-name`, matching how plugin skills are displayed.
- Ignore list: `.git`, `node_modules`, `Pods`, `DerivedData`, `build`, `.build`, `dist`, `.gradle`, `vendor`, `target`, `out`, `.next`. Max depth 10. Symlinks followed with a visited-path cycle guard.

### Parsing

- Frontmatter: YAML subset — key/value, quoted strings, inline and dash lists, folded blocks (`>-`, `|`), and **one level of nested mapping** (record `0015`). Enough for real SKILL.md files in the wild.
- Measured at M1 against 946 real frontmatter blocks, then corrected by `0015`. At M1, nested maps, lists-of-maps and flow mappings appeared zero times in the 577 classified artifacts. Adopting spec-kit (`0014`) imported 10 counterexamples from one upstream author — `metadata:` with `author`/`source` under it — so **one level of nesting is supported**; lists-of-maps and flow mappings still are not. The other variants that occur are block scalars with any chomp indicator (`>-`, `|`, `>`) and a quoted scalar opening on the line after its key — both the same features named above, so both are supported. Numbers stay strings **at every depth**: `version: 3.10` must not become `3.1`.
- Two failure modes, deliberately distinct (`0015`) — the "parse error" chip must mean one thing:
  - **Malformed** → artifact still indexed, body shown raw, "parse error" chip, structural score 0 (§6). Never dropped, never crashes.
  - **Beyond subset** — valid YAML this parser reads only in part, such as nesting two levels deep → artifact indexed, body rendered normally, those values kept as raw text, "beyond subset" chip, structural score **1, never 0**. A well-formed artifact is never blamed for a limit of the tool.
- Stored per artifact: id (`source/type/<relative path>`), type, name, description, explicit tags, source, relative + absolute path, modified time, size, frontmatter map, body.
- The id is path-derived, not name-derived (record `0003`): `name` is deliberately **not** unique — plugin skills exist once per cached version and again under `marketplaces/`, and §5 clusters on same type + name. Identity and naming are separate jobs.

### Freshness

- Watcher events debounce (~500 ms) into one re-index; UI receives an SSE ping and refetches; a quiet toast says "Library updated".
- Git branch switches cause event storms → the debounce plus full-re-index model absorbs them by design (one rebuild at the end).

## 4. Knowledge graph

- **Outlinks**: every backticked token in description + body that resolves to another artifact's name or alias becomes a wiki link (resolution order per D5).
- **Backlinks**: inverted automatically; every page shows "Referenced by (n)".
- **Orphans**: artifacts with zero backlinks — surfaced on the dashboard as a review queue, not deleted or judged.
- **Unresolved references**: backticked tokens that *look* like artifact names (kebab-case or `/command` form) but match nothing — listed per page as info, and counted on the dashboard. This catches renamed or deleted skills that other skills still point to.
  - Measured at M2: 1,201 references over 273 distinct tokens, mostly repo and service names (`service-maven`, `web-app`) and screen ids (`screen-a`). Record `0011` therefore flags tokens within edit distance 2 of a real artifact name as **likely renames** and counts them separately; the raw list stays complete but the actionable number leads.
- Self-links ignored. Link extraction runs on the raw markdown, before rendering, so rendered pages show the resolved links inline.

## 5. Duplicates & shadowing

Two distinct situations, named precisely in the UI:

| Situation | Definition | UI label |
|---|---|---|
| **Shadowing** | Same type + name reachable by one Claude Code session through precedence (e.g. project skill vs personal skill) | "Effective" ⭐ on the winner, "Shadowed" on the rest |
| **Cross-repo duplicate** | Same type + name in unrelated sources (iOS repo vs Android repo) | "Duplicate cluster" with drift status |

- Winner = highest source `priority`; tie → alphabetical source name, flagged "tie — set priorities".
- Both clauses tie for copies inside **one** source, which is the common case (plugin caches hold several versions). Record `0012` extends the chain: priority → source name → **installed** (per `installed_plugins.json`) → higher version → newer mtime → path. The "tie — set priorities" flag still fires whenever equal priorities forced a fallback — it means *you have not declared this*, not *this is unresolvable*.
- `installed` and `effective` stay separate: `effective` is this app's declared-priority winner, `installed` is what Claude Code has on disk. Disagreement between them is flagged only when the winner is itself a stale plugin copy — a source-repo copy outranking an installed cache is expected, not a defect.
- Drift status via content hash: **identical** (synced copy, calm gray chip) vs **diverged** (amber chip, count of differing lines).
- **Diff view**: unified line diff between any two copies, trailing whitespace normalized, add/remove coloring, jump-to-next-change. Entry points: the cluster page and the Resolution bar (§9).

## 6. Validation chips

**This numbering is dotclaude's own** (record `0004`). Earlier drafts claimed it mirrored a `validate-ai-instructions` 15-point checklist; no such checklist exists, here or published. What exists and is authoritative for the checks below:

- **`validate-skill`** — class **S** (skill/command): `validate.py` plus 8 quality items
- **`validate-agent`** — class **A** (agent): `validate.py` plus 13 quality items
- class **R** (rule/memory) has **no upstream checklist**. R runs the subset of validators that apply and reports the rest as N-A until one exists.

Of the 16 validators, **13 trace to a quality item** in those two skills — 7 only partially, as a clause inside another item. **1, 3 and 5 are dotclaude's own**, specified here and nowhere else; note that 1 and 5 are also the only two D10 permits to emit FAIL. Scoring (2/1/0/N-A) is dotclaude's own too. M4 must call the existing `validate.py` for structural pre-checks rather than reimplementing them.

### Automation split

| Validators | v1 mode | How |
|---|---|---|
| 1 Overlap (name part) | **Auto, deterministic** | Same-type, same-scope name collision **whose content differs**. Byte-identical copies (git worktrees) and several cached versions of one plugin skill are the same authored artifact — counting them made this fire on 57% of the corpus and pushed 60% of artifacts to FAIL |
| 5 Identity distortion | **Auto, deterministic** | Exact-phrase lexicon ("act human", "never reveal you're an AI", "world's best…") |
| 2 Precision, 6 Negative triggers, 8 Positive framing, 11 Failure paths, 12 Output contract, 13 Redundancy | **Auto, heuristic** | Lexicon/pattern presence checks; can score 2 or 1, never 0 (D10) |
| 4 + 14 Length & context budget | **Auto, deterministic** | Body < 500 lines; description present in frontmatter; suggest `references/` when oversized |
| 3 Intent preservation, 7 Testability, 9 Example–rule consistency, 10 Precedence, 15 Terminology | **Manual** | Listed as "needs review", greyed |
| 16 Time-sensitive content | **Auto, heuristic** | Hardcoded versions, dates and device names; both real checklists carry this check and the corpus is full of versioned plugin paths. Can score 2 or 1, never 0 (D10) |
| Structural pre-checks | **Auto, deterministic** | Implemented natively (record `0013` — no Python at runtime): frontmatter parses; kebab-case name; **name ≤ 64 characters**; name matches folder (skills) **or filename (agents)**; length cap. The last two came from record `0020`, which audited these against their authority and found dotclaude enforcing a subset. Two of the authority's naming rules are **deliberately not adopted**, and re-adding either needs a record: the reserved-word list (`anthropic`/`claude`/`cursor`) would fail `claude-md-improver` and two other real skills that are *about* Claude, and the plugin-name prefix (`ios-`, `workorg-`) is one organisation's convention where §1's premise is unrelated folders. `validate-skill` / `validate-agent` remain the authority for the *rules*, so a change there must be mirrored into this section by hand. **One row, three outcomes** (record `0015`): a defect in the artifact — malformed frontmatter, non-kebab name, name ≠ folder, length — scores **0**; valid YAML beyond §3's supported subset scores **1**, never 0; otherwise 2. Malformed outranks beyond-subset, so a broken file cannot hide behind the softer outcome. The D10 consequence: no well-formed artifact may score 0 for a limitation of dotclaude's own parser |

### Verdict chip (per artifact and per list row)

- **FAIL** — a deterministic blocker (1 or 5) scored 0. Ember red.
- **WARN** — any score of 1, or any heuristic flag. Ochre.
- **PASS** — all auto checks at 2. Olive.
- **· manual pending** suffix until judgment validators are reviewed.

### Claude handoff (closes the manual loop)

Each artifact page has **"Copy validation prompt"**: copies the artifact body + the full checklist + the exact output contract (`VERDICT: PASS|FAIL` last line) to the clipboard, ready to paste into Claude for the judgment validators. v1 does not store the returned verdict (read-only principle, D11); the roadmap CLI does (§12).

## 7. Search & tags

### Search

- **Default scope: frontmatter** — name, description, tags, allowed-tools. Instant, client-side, as-you-type.
- Operators: `body:` (full-text), `type:skill|agent|command|rule|memory`, `tag:`, `source:`, `is:duplicate`, `is:fail`, `is:orphan`, `is:unresolved`.
- Ranking: exact name → name prefix → name substring → description hit → tag hit. Within a rank, most recently modified first.
- Zero results state: "No matches in frontmatter. Try `body:` to search full text." (copy is part of the design).
- **Folder scope** (record `0017`, post-v1): `source:` also gets a UI surface — checkboxes in the Browse sidebar (§8) that write `source:` terms into the query, and a remembered default applied on load. It is a **view filter only**: every registered source stays indexed, so §4 orphans, §5 clusters and §6 validator 1 keep seeing the whole corpus. Scoping the index would make each of those report something false rather than something partial.

### Tags

| Kind | Origin | Visual |
|---|---|---|
| Explicit | `tags:` array in frontmatter | Filled chip |
| Auto | source name, artifact type, `plugin`, platform prefix parsed from the name (`ios`, `android`, `shared`, `backend`, `data`, `workorg`) | Outlined chip |

- Filtering logic: **OR within a facet, AND across facets** (selecting tags `ios` + `testing` with type `skill` = (ios OR testing) AND skill).
- A **Tags view** lists all tags with counts; clicking pivots into the filtered browse list. Tags are the categorization system — no folders are invented on top of the real filesystem.

## 8. Screens

```
┌────────────────────────────────────────────────────────────────┐
│ ◔ dotclaude   Library                        ⌘K  ⟳ Rescan  ◐  │
├───────────────┬────────────────────────────────┬───────────────┤
│ Search…       │  ios-visual-acceptance   PASS  │  On this page │
│ [type][tags]  │  ─ Resolution bar ───────────  │  Backlinks(4) │
│ ▸ Skills  57  │  source ▸ path ▸ ⭐ effective  │  Outlinks(3)  │
│ ▸ Agents   6  │                                │  Validation   │
│ ▸ Commands 12 │  description, tags             │  Duplicates   │
│ ▸ Rules    9  │  ── rendered markdown body ──  │  Unresolved   │
│ ▸ Memory   4  │  …`android-visual-acceptance`  │  Open in ed.  │
└───────────────┴────────────────────────────────┴───────────────┘
```

| Screen | Job | Empty / error state |
|---|---|---|
| **Dashboard** (home) | Health at a glance: counts by type/source, FAIL & WARN totals, duplicate clusters (diverged first), orphans, unresolved refs and likely renames (record `0011`), recently modified | First run: "Add your first source in sources config" with the file path shown |
| **Browse** | Sidebar list grouped by type; each row = name + status dot + source pill; filters persist in URL hash; **folder-scope checkboxes** above the type groups (record `0017`, post-v1) | "No artifacts match these filters. Clear filters." |
| **Artifact page** | Title (serif) · verdict chip · Resolution bar · tags · rendered body with live wiki-links · right rail (backlinks, outlinks, validation detail, duplicates, unresolved refs) | Parse-error banner with raw view |
| **Diff view** | Two copies, unified diff, source labels, "make identical" is *not* offered (read-only) | "Copies are identical." |
| **Duplicates view** | All clusters; diverged before identical; per-copy effective star | "No duplicates. Your library is clean." |
| **Tags view** | All tags with counts, explicit vs auto sections | — |
| **⌘K palette** | Jump to any artifact, run Rescan, toggle theme | — |

Keyboard: `⌘K` palette, `↑/↓` list, `enter` open, `d` diff (in a cluster), `e` open in editor.

**Workspace mode is declared on screen** (record `0023`, post-v1). When the app is launched against a `workspace.json` (§2), the header states `Workspace · <name> · <n> sources` in place of the plain `Library` label, and the Dashboard, Duplicates and cluster panels label their numbers workspace-relative. Nothing is withheld — §5 still answers *is this the copy that loads?* — but it answers about the workspace, and the frame is never left to be inferred from a count.

**Folder scope reaches Browse and search only** (record `0017`, post-v1). Dashboard, Duplicates, Tags and the ⌘K palette stay global — orphans, clusters and shadowing are cross-folder facts, and a scoped orphan queue would hide a skill that *is* referenced from a folder the reader happened to untick. An artifact outside the current scope opens normally and carries an **outside scope** chip; scope never widens by itself.

## 9. Design system — Claude-native

Direction is pinned by the brief: this must read as a tab inside the Claude app. So the palette and warmth are inherited deliberately, and the distinctiveness is spent on one signature element specific to this product.

### Color tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| Ivory `--bg` | #FAF9F5 | #262624 | App background |
| Parchment `--surface` | #F0EEE6 | #30302E | Sidebar, rails, chips |
| Card `--card` | #FFFFFF | #3A3937 | Artifact page sheet |
| Hairline `--border` | #E3DFD5 | #45423D | 1px borders do the work; shadows stay near zero |
| Bark `--ink` | #2B2A27 | #ECEAE4 | Primary text |
| Slate `--ink-2` | #6E6B64 | #A6A29A | Secondary text, paths |
| Clay `--accent` | #C96442 | #E0805F | Links, active states, focus |
| Olive `--pass` | #6E8B5E | #8FAF7E | PASS |
| Ochre `--warn` | #B98A2F | #D4A94E | WARN, diverged |
| Ember `--fail` | #BC4034 | #E06456 | FAIL |

### Type roles

| Role | Face (fallback stack) | Use |
|---|---|---|
| Display serif | Tiempos-like → Charter, Georgia | Page titles, dashboard numbers, the wordmark — the editorial voice of Claude |
| UI grotesque | Styrene-like → Inter, system sans | Chrome, lists, chips, body UI at 14px; doc body at 16px |
| Mono | Berkeley/JetBrains Mono → ui-monospace | Paths, artifact names, diff, frontmatter |

Scale: 13 caption / 14 UI / 16 doc body / 22 section / 28 page title. Radius: 12 cards, 8 inputs, full-round chips. Spacing on a 4px grid.

### Signature element — the **Resolution bar**

A persistent strip under every artifact title: `source pill → mono path → precedence position → ⭐ Effective (or "Shadowed by <source>") → installed → Diff`. The bar may also state **installed** when this copy is the one `installed_plugins.json` declares, and **"a different copy is installed"** when it is not (record `0012`) — `effective` and `installed` are separate facts (§5), so the bar shows both rather than conflating them. It is the one thing no generic wiki has, and it answers the app's founding question — *is this the copy Claude actually loads?* — on every single page. Boldness is spent here; everything around it stays quiet.

The accepted aesthetic risk: serif display inside a developer tool. Justified because it mirrors Claude's own editorial identity and cleanly separates *content* (the documents) from *chrome* (the tool).

### Motion & floor

150 ms fades only; SSE update = one quiet toast; `prefers-reduced-motion` respected. Keyboard focus always visible (Clay ring). Light/dark follow the OS with a manual toggle. Responsive down to a narrow window (sidebar collapses to the palette).

## 10. Architecture (boxes, no code)

- **One process**: scanner → classifier → frontmatter parser → linker → shadow resolver → validator → in-memory index → HTTP + SSE → static SPA. Runtime: the Node/Bun intersection — **verified on both Node and Bun**, for the served app *and* the test suite (record `0005` set the contract, record `0019` verified it: identical artifact counts, an id-by-id identical FAIL list, `fs.watch` recursive firing under both, and 84/84 tests passing under each). Zero build step, zero dependencies. No `Bun.*` API.
- **API surface**: index (everything except bodies), artifact by id (with body), events (SSE), rescan (POST), open-in-editor (POST, restricted to paths inside registered sources).
- **Launch modes** (record `0023`): **library** (default, `sources.json`) and **workspace** (`--workspace <path>` / `DOTCLAUDE_WORKSPACE`, a project-local `workspace.json` per §2). The mode is resolved once at boot, named in the boot log, and carried in the index stats so every screen can state it. `--port <n>` / `PORT` overrides §13's 4114 so a workspace can run beside the library. npm's own `--workspace` is a monorepo flag, so the argument must follow `--`.
- **Persistence**: JSON snapshot of the last index for instant startup; truth is always the filesystem. **The snapshot is keyed per mode** (record `0023`) — the library's is `index.json`, a workspace's is derived from its file path — so neither mode can serve the other's cache while the startup rescan runs.
- **Trust boundary**: binds to localhost only; no auth, no telemetry, nothing leaves the machine.

## 11. Non-goals (v1)

Editing artifacts in-app · creating skills · running skills · syncing duplicates ("make identical") · multi-user/hosted mode · authentication · full Claude Code precedence emulation (declared via priorities instead) · storing manual validation verdicts.

## 12. Roadmap

| Version | Adds | Why it's staged here |
|---|---|---|
| v1.1 | Folder scope: Browse-sidebar checkboxes that narrow the browse list and search to chosen sources, remembered between visits (record `0017`) | Pure §7/§8 change — the index stays whole, so no cross-folder fact changes meaning. First feature through the spec-kit flow (`specs/002-folder-scope/`) |
| post-v1 | Workspace mode: `--workspace <path>` boots the index from a project-local `workspace.json` and reads nothing else, with the mode declared on screen (record `0023`, `specs/003-workspace-mode/`) | Not on the original roadmap. It is the one case where scope legitimately reaches the indexer — `0017` confined *filters* to the view, and a launch mode is not a filter, because the workspace **is** the corpus every number describes |
| v1.5 | Companion CLI: `validate` command emitting the checklist's exact output contract (`VERDICT:` last line) for CI gates — **shipped**, `specs/001-cli-validate/`, `npm run validate` | Reuses the validator unchanged; makes chips enforceable in PRs. Exit 0/1 gates on a deterministic zero only, so WARN never blocks (D10). Having no cache, it is also the instrument to trust when checking a claim: the server answers from a snapshot for the first seconds after boot |
| v2 | Remote git sources per the §2 contract; pull-to-refresh; stale chip | Indexer already treats every source as "a directory" |
| v3 | MCP server exposing the same index (search, get artifact, list duplicates) so Claude Code and the harness can query the library | Closes the loop back into agent workflows |

## 13. Assumptions you can override

All loops are closed by decision; these five are closed by *default* and safe to change: app name (**dotclaude**, tab label **Library**), port (4114), source priorities (project 100 > personal 50 > plugin 10), nested command names joined with `:`, and the auto-tag platform prefix list. Changing any of them touches config or one rule — no design rework.

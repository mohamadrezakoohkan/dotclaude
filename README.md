# dotclaude

**Index every AI-instruction artifact on your machine — skills, agents, commands, rules, `CLAUDE.md` — across unrelated repos, and browse them as a linked wiki. Local, read-only, zero dependencies.**

Artifacts accumulate in places that never see each other: one repo's `.claude/skills`, another's `.cursor/rules`, your personal `~/.claude`, plugin caches holding four versions of the same skill. Claude Code consumes them; nothing lets you *read* them.

dotclaude answers, for any artifact: **what is it, where does it live, what does it link to, is it the copy that actually loads, and is it well-written?**

It runs as one local process, reads the filesystem, and never writes to it.

---

## Two ways to run it

|  | Indexes | Configured by | Start with |
|---|---|---|---|
| **Library** (default) | every folder you registered, machine-wide | `sources.json` | `npm start` |
| **Workspace** | only the folders one project cares about | `<project>/.claude/workspace.json` | `npm start -- --workspace <project>` |

The library is the whole shelf; a workspace is one project and its dependencies. Everything below describes the library first — [workspace mode](#workspace-mode--one-project-instead-of-the-whole-machine) is a few lines of JSON on top of it.

---

## Run — bootstrapping

> **Using an AI agent?** Point it at **[`prompts/BOOTSTRAP.md`](prompts/BOOTSTRAP.md)** — *"Read `prompts/BOOTSTRAP.md` and get this project running."* It carries the same steps plus the six constraints an agent tends to violate here: installing dependencies that don't exist, trusting the API before the startup re-scan finishes, and writing probe files into an indexed folder among them.

### Requirements

**Node** (verified) or **Bun** — nothing else. There are no dependencies to install, no build step, and no `node_modules`.

```bash
node --version        # any current Node
```

### 1. Point it at your folders

```bash
cp sources.example.json sources.json
```

Then edit it. A **source** is any folder to scan — a repo, `~/.claude`, a plugins directory:

```json
{
  "sources": [
    { "name": "personal",  "type": "local", "path": "~/.claude",        "priority": 50  },
    { "name": "project-a", "type": "local", "path": "~/code/your-repo", "priority": 100 },
    { "name": "dotclaude", "type": "local", "path": ".",                "priority": 100 }
  ]
}
```

- **`name`** must be unique — it labels every artifact and drives the `source:` search filter.
- **`priority`** decides which copy of a same-named skill wins when two folders both define it. Higher wins.
- **`path`** accepts `~`, absolute, or relative. Nested sources are fine: the innermost folder owns a file, so a repo inside another repo does not get indexed twice.

Skipping this step is safe — without a `sources.json` the app boots on two built-in examples and shows a chip telling you where to put yours. If you only care about one project, skip it deliberately and use [workspace mode](#workspace-mode--one-project-instead-of-the-whole-machine) instead.

### 2. Start it

```bash
npm start
```

Open **http://127.0.0.1:4114**. It binds to localhost only.

The console reports what it found:

```
  personal                  327 artifacts    5768 files    245 ms
  project-a                  76 artifacts     167 files     37 ms
index: 403 artifacts {"agent":36,"skill":353,"memory":13,"command":1}
dotclaude on http://127.0.0.1:4114
```

**First-paint caveat.** Startup serves a cached snapshot instantly and re-scans behind it, so for the first few seconds the numbers may be from the previous run. Wait for this line before trusting them:

```
re-indexed (startup rescan): 403 artifacts in 2368 ms
```

For a number you can rely on immediately, use the CLI below — it has no cache.

## Workspace mode — one project instead of the whole machine

`sources.json` is the machine-wide library, and on a working machine that is a lot of folders. When you want the app pointed at **one project and the folders that project actually depends on**, put a `workspace.json` inside it and start dotclaude against that.

**1. Create the file** at `<project>/.claude/workspace.json`:

```bash
cp workspace.example.json ~/code/my-project/.claude/workspace.json
```

```json
{
  "name": "my-project",
  "sources": [
    { "name": "my-project",  "path": "..",                  "priority": 100 },
    { "name": "team-shared", "path": "~/code/team/.claude",  "priority": 100 },
    { "name": "personal",    "path": "~/.claude",            "priority": 50  }
  ]
}
```

Same fields as `sources.json` — one contract, not two. The difference: **relative paths resolve against this file's own directory**, so `".."` from `<project>/.claude/` means the project itself, and the file keeps working if the repo is cloned somewhere else.

**2. Start it** — from this repo, with any of these three:

```bash
npm start -- --workspace ~/code/my-project                                  # the project directory
npm start -- --workspace ~/code/my-project/.claude/workspace.json           # or the file
DOTCLAUDE_WORKSPACE=~/code/my-project npm start                             # or the environment
npm start -- --workspace ~/code/my-project --port 4115                      # beside a library instance
```

> **The `--` is not optional.** `--workspace` is also npm's own monorepo flag, so `npm start --workspace <path>` is swallowed by npm and dotclaude never starts. The `DOTCLAUDE_WORKSPACE` form can't be swallowed.

**3. Confirm you got it.** The console names the corpus before it counts anything:

```
workspace: my-project — /Users/you/code/my-project/.claude/workspace.json (sources.json not read)
  my-project         6 artifacts      17 files      6 ms
  team-shared        0 artifacts       1 files      1 ms
  personal         340 artifacts    5371 files    429 ms
index: 346 artifacts {"agent":8,"skill":336,"memory":2}
```

…and the header reads **Workspace · my-project** in place of *Library*. If it still says *Library*, the argument didn't arrive.

**What changes, and why the app says so.** A workspace genuinely narrows the index, so duplicate clusters, orphans and FAIL counts are true about *those* folders — not about your machine. That is why the Dashboard states it in words and why §5's chip reads `⭐ only copy in workspace`: a skill shadowed by a copy in an unlisted folder would otherwise look unique. Nothing is hidden from you silently. See [record `0023`](docs/decisions/0023-a-workspace-file-may-scope-the-index-at-launch.md) for the reasoning, and [`specs/003-workspace-mode/contracts/workspace-json.md`](specs/003-workspace-mode/contracts/workspace-json.md) for the file's full contract.

**Editing the mapping needs no restart.** Add or remove a source and the watcher re-reads the file, re-indexes, and re-registers the roots — same as `sources.json`. A broken workspace file is refused at startup (rather than quietly falling back to your machine-wide library) but never takes down a running server; it shows as a chip instead.

Each workspace keeps its own startup cache, so a workspace run never leaves the library showing the wrong numbers on its next boot.

### 3. Edit a skill and watch it update

Save any `SKILL.md` inside a registered folder. A file watcher re-indexes, the open page refreshes itself, and a quiet toast says *Library updated*. Editing `sources.json` works too — adding or removing a source re-registers the watcher live, no restart.

### Other entry points

```bash
npm test                        # 108 tests, zero framework
npm run validate                # quality gate over every artifact
npm run validate -- path/to/SKILL.md CLAUDE.md
```

`npm run validate` exits **0** when nothing failed and **1** on a real blocker, with `VERDICT: PASS` or `VERDICT: FAIL` as its last line — so it works as a CI gate:

```bash
npm run validate -- $(git diff --name-only origin/main...HEAD)
```

Files in that list which aren't artifacts are skipped, not failed, so passing a raw changed-file list is safe. A warning never gates — only a deterministic blocker does.

### Under Bun

```bash
bun src/server.js
bun test test/run.test.mjs
```

Both verified to produce identical output to Node, including an id-by-id identical validation result.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `0 artifacts` for a folder | The path doesn't exist, or holds no `SKILL.md` / `.claude/agents` / `.cursor/rules`. Missing paths show an error chip and never crash the app |
| Counts look stale | The startup re-scan hasn't finished — see the caveat above |
| Port in use | Another dotclaude is running. `npm start -- --port 4115`, or change `4114` in `src/config.js` |
| `npm start --workspace …` errors out before starting | npm claimed the flag. Use `npm start -- --workspace …` or `DOTCLAUDE_WORKSPACE=…` |
| A workspace shows `⭐ only copy in workspace` | Uniqueness is judged against the workspace's folders. Copies elsewhere on the machine aren't indexed — start without `--workspace` to see them |
| A skill shows `parse error` | Its frontmatter is malformed. It is still indexed, with the body shown raw — nothing is ever dropped |

---

## Documentation

The reasoning behind this project is committed alongside it. Three kinds, and they answer different questions:

| Read this | To learn |
|---|---|
| **[`docs/dotclaude-design-spec.md`](docs/dotclaude-design-spec.md)** | **What the product is and why.** Sections §1–§13: the decision log D1–D14, the sources model, the indexing pipeline, the knowledge graph, duplicates and shadowing, the 16 validators, search, screens, the design system, the architecture, non-goals, and the roadmap. Start here |
| **[`docs/decisions/`](docs/decisions/)** | **What changed since, and why.** One numbered record per decision, append-only. [`README.md`](docs/decisions/README.md) is the log's own map: status values, the follow-up ledger, and what `npm test` audits about records |
| **[`docs/plans/`](docs/plans/)** and **[`specs/`](specs/)** | **How each piece was built.** `docs/plans/` holds the v1 milestone plans; `specs/###-<slug>/` holds post-v1 features in spec → plan → tasks form |
| **[`prompts/BOOTSTRAP.md`](prompts/BOOTSTRAP.md)** | **How to hand this project to an AI agent.** A prompt written to be read by one: the three entry points, the six non-negotiables, verification after each step, and a table of what each chip and warning actually means |

### Conventions worth knowing before you read

- **The spec is the authority on the product.** It is never fragmented; post-v1 features extend it by citation and restate none of it.
- **The decision log is append-only.** A decision is reversed by writing a new record and marking the old one superseded — never by editing it. That is what makes the log trustworthy, and it is enforced: `npm test` asserts every accepted record that directs a spec edit is cited in the section it named.
- **Records carry their own reasoning, including the wrong turns.** Several say plainly that an earlier conclusion was mistaken and what the measurement actually showed. That is deliberate — a log that only records successes is a brochure.
- **Verdicts are honest about their confidence.** Only deterministic checks may fail an artifact; anything heuristic can warn at most. A guess never blocks you.

### Design notes

`docs/dotclaude-design-spec.md` §9 defines the design system — colour tokens, type roles, and one signature element, the **Resolution bar**, which answers "is this the copy that loads?" in a single strip under every artifact title. Token conformance is checked mechanically: a colour literal outside the token set fails the test suite.

---

## Architecture in one line

`scan → classify → parse frontmatter → link → resolve duplicates → validate → serve`, in one process, with the index in memory and a JSON snapshot for instant startup. Truth is always the filesystem.

The launch mode decides only *which folders* enter that pipeline — a workspace is a source list, so nothing downstream of the list knows modes exist.

## Non-goals

No writing, ever — no in-app editing, no "make identical", no stored verdicts. "Open in editor" hands off to your editor. Remote sources and an MCP server are on the roadmap; neither exists yet.

## License

[MIT](LICENSE). `"private": true` stays in `package.json` — this is an application, not an npm package, and that flag only prevents an accidental publish there.

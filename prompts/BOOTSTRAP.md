# BOOTSTRAP — a prompt for AI agents

**How to use this file.** Point an agent at it:

> Read `prompts/BOOTSTRAP.md` and get this project running.

Everything below is addressed to that agent. It is written as instructions, not as prose about instructions.

---

## What you are running

**dotclaude** indexes AI-instruction artifacts — skills, agents, commands, rules, `CLAUDE.md` — across unrelated folders on this machine and serves them as a linked wiki on `localhost`. One Node process. It reads the filesystem and never writes to it.

Three entry points, and that is all there is:

| Command | Does |
|---|---|
| `npm start` | The web app on `http://127.0.0.1:4114` |
| `npm test` | The whole suite, one file, `node:test` |
| `npm run validate` | Quality gate over the indexed artifacts; exits non-zero on a real blocker |

## Non-negotiables — read before doing anything

These are not style preferences. Each one has a decision record behind it, and violating one produces a wrong result rather than an ugly one.

1. **Never run `npm install`.** This project has **zero runtime dependencies** by design (spec §10). There is nothing to install, no lockfile, and no `node_modules`. If you find yourself adding a package, stop — that is a spec change and needs a decision record.
2. **Never `git push`, create a remote, or publish anything** without being asked in that specific turn. Records `0006`, `0021` and `0022` govern this. Prior permission to merge is never permission to push.
3. **Never edit a file in `docs/decisions/`.** The log is append-only. To change a decision, write a new record and mark the old one superseded, leaving its text unchanged.
4. **Never commit `sources.json`, and never bulk-edit it.** It maps a real machine and is untracked on purpose (`0021`), which also means `git checkout` cannot restore it and `git status` will not show it damaged. `sources.example.json` is the tracked one. If you rewrite files in bulk, iterate `git ls-files` rather than walking the filesystem — a walk reaches every ignored file invisibly.
5. **Never write test or probe files into a registered source folder.** They get indexed like real artifacts and shift the very counts you are measuring. Use `fs.mkdtemp` and delete in the same step.
6. **Do not use artifact counts as acceptance criteria.** The corpus is live directories on a working machine and drifts daily. `"625 artifacts"` is stale within days; `"identical before and after the change"` is not. Cite a count as evidence at a moment, never as a bar.

## Bootstrap

### 1. Check the runtime

```bash
node --version
```

Any current Node. Bun also works (`bun src/server.js`, `bun test test/run.test.mjs`) and is verified to produce identical results, per record `0019`.

**Do not install anything.** If `node` is missing, stop and say so.

### 2. Create the source config

```bash
cp sources.example.json sources.json
```

Edit it so the paths exist on this machine. A **source** is any folder to scan:

```json
{ "name": "personal", "type": "local", "path": "~/.claude", "priority": 50 }
```

- `name` must be unique — it labels every artifact and drives the `source:` search filter.
- `priority` decides which copy wins when two folders define the same skill. Higher wins.
- `path` takes `~`, absolute, or relative. Nested folders are fine: the innermost source owns a file, so a repo inside a repo is not indexed twice.

**Verify before continuing** — the paths must be real, or you will spend time debugging an empty index:

```bash
node -e 'const fs=require("fs"),os=require("os");
const c=JSON.parse(fs.readFileSync("sources.json","utf8"));
for(const s of c.sources){const p=s.path.replace(/^~/,os.homedir());
console.log(fs.existsSync(p)?"ok  ":"MISS", s.name, p)}'
```

A missing path is not fatal — the app boots and shows an error chip — but a run where every path misses will index nothing and look broken.

Skipping this step entirely is also safe: with no `sources.json` the app boots on two built-in examples and tells you where to put yours.

### 3. Start it

```bash
npm start
```

Expect, on stdout:

```
  personal                  327 artifacts    5768 files    245 ms
index: 403 artifacts {"agent":36,"skill":353,"memory":13,"command":1}
dotclaude on http://127.0.0.1:4114
re-indexed (startup rescan): 403 artifacts in 2368 ms
```

**Do not read the API before that last line appears.** Startup serves a cached snapshot instantly and re-scans behind it (spec §10 — the cache decides first-paint speed, never truth). A request made in the first seconds returns the *previous run's* numbers, including its validation verdicts. This has caused real misdiagnoses.

If you need a number you can trust immediately, use `npm run validate` — it has no cache and rebuilds every run.

### 4. Confirm it works

```bash
curl -s http://127.0.0.1:4114/api/index | head -c 200      # after the rescan line
npm test                                                    # expect: pass N, fail 0
npm run validate                                            # expect a VERDICT: line last
```

`npm run validate` exits **0** when nothing failed, **1** on a blocker or an unreadable path, **2** on misuse. Its last stdout line always matches `/^VERDICT: (PASS|FAIL)$/`. A non-zero exit here is **not** a bootstrap failure — it means some indexed artifact has a real problem, which is the tool working.

### 5. Confirm the live path

Save any `SKILL.md` inside a registered folder. Expect within a second or two:

```
watch: re-index: 1 event(s) absorbed
re-indexed (watcher): 404 artifacts in 2219 ms
```

Editing `sources.json` also works — adding or removing a source re-registers the watcher live, no restart (record `0009`).

## When something looks wrong

| Symptom | Meaning |
|---|---|
| `0 artifacts` for a source | The path does not exist, or holds no `SKILL.md` / `.claude/agents` / `.cursor/rules`. Missing paths chip and never crash |
| Counts differ between two reads | The startup re-scan finished between them. Compare only after the `re-indexed` line, and prefer `npm run validate` |
| `parse error` chip on an artifact | Its frontmatter is malformed. It is still indexed with the body shown raw — nothing is ever dropped (§3) |
| `beyond subset` chip | Valid YAML using more than the supported subset. Not a defect in the file (record `0015`) |
| Many `FAIL` verdicts | Expected on a real corpus. Only deterministic checks may fail; heuristics warn at most (D10) |
| Port in use | `4114`, set in `src/config.js` |
| `npm test` cannot find the file | It is `test/run.test.mjs`. One file, no framework |

## If you are going to change something

Read **`CLAUDE.md`** first — it is the working agreement and it outranks everything except an explicit instruction from the repo owner. In short:

- The loop is **spec → plan → implement → validate**, and the plan is approved before implementation begins.
- One branch per task, `feat/<topic>`. Never commit straight to `main`.
- A change to a spec §1 row, or any lasting constraint, is a **decision record** before it is code.
- `npm test` must stay green, including the process tests that audit the records themselves.

Read next, in this order:

1. **`README.md`** — orientation
2. **`docs/dotclaude-design-spec.md`** — what the product is and why; §1's decision table is the fastest way to understand the constraints
3. **`docs/decisions/README.md`** — how the log works, what `npm test` audits about it, and the follow-up ledger
4. **`specs/`** — post-v1 features in spec → plan → tasks form, if you are extending one

## Report back

State plainly: the artifact count **and** the moment it was taken, the test result, the `validate` exit code, and anything that did not match this document. If a step failed, say which and what the output was — do not report success for a partially working bootstrap.

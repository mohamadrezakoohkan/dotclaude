# Research: Workspace mode

Two questions were open before the design could be fixed. Both were settled by measurement, not by reading.

## 1. Does `--workspace` survive `npm start`?

**Question.** Reza's phrasing was "if argument workspace passed to npm start". `--workspace` is also npm's own flag for monorepo workspaces, so the name may never reach the script.

**Method.** A throwaway package in the session scratchpad (never inside a registered source, per `CLAUDE.md` → Validation) whose `start` script prints `process.argv.slice(2)`, run four ways under npm 11.16.0 / Node 26.3.1.

| Invocation | Result |
|---|---|
| `npm start -- --workspace /tmp/ws.json` | `["--workspace","/tmp/ws.json"]` — arrives intact |
| `npm start -- --workspace=/tmp/ws.json` | `["--workspace=/tmp/ws.json"]` — arrives intact |
| `npm start --workspace /tmp/ws.json` | **exit 1** — npm parses it as its own workspace flag and never runs the script |
| `DOTCLAUDE_WORKSPACE=… npm start` | reaches the process as an env var, no `--` needed |

**Conclusion.** Keep Reza's word (`--workspace`), support the `=` form, add `--ws` as an alias, and support `DOTCLAUDE_WORKSPACE` as the form that cannot be eaten. Document the `--` requirement in `README.md`, because the failure happens *before* our code runs and therefore cannot be explained by our code.

npm documents the separator as the way to pass `--`-prefixed flags "which would otherwise be parsed by npm":

- <https://docs.npmjs.com/cli/v11/commands/npm-run/>
- <https://docs.npmjs.com/cli/v9/commands/npm-run-script/>

## 2. What actually breaks if the snapshot is shared between modes?

**Question.** §10 serves the JSON snapshot immediately and rescans behind it. Does a second mode need its own snapshot, or is one enough?

**Method.** Read `src/snapshot.js` and the boot path in `src/server.js:270–305`.

**Finding.** The snapshot is one fixed file, `.dotclaude-cache/index.json`, written after every rebuild and adopted unconditionally at boot when its `version` matches. So a workspace run overwrites the library's cache, and the next library boot **paints the workspace's three sources as the whole library** until the startup rescan finishes — with correct-looking source pills and a plausible artifact count. Silent, brief, and exactly the class of wrongness `0015` and `0017` were written about.

**Conclusion.** FR-008: key the snapshot by mode — `index.json` for the library, `workspaces/<8 hex of the workspace file's absolute path>.json` for a workspace. Deriving the key from the absolute path also means two different workspaces keep separate caches, which costs nothing extra.

**Consequence for the governance suite.** A composed filename slips past the `0009 + 0012` watched-input test, which scans quoted `*.json` literals in `src/`. `docs/decisions/README.md` is explicit that the response is a tighter parse or a declared exemption, never a weaker assertion — so the parse is widened to see composed names, and the snapshot directory is declared not-an-input for the reason the existing `index.json` entry gives (watching what we write is a rebuild loop).

## Rejected without measurement

- **`node:util` `parseArgs`** — stdlib, so Principle IV permits it, but `src/cli.js` states the house position ("Zero dependencies, so no flag parser") and two argument styles in one repo is worse than a dozen lines of scanning.
- **A `--sources <file>` flag instead of a workspace file** — would satisfy "index only these", but the mapping then lives in shell history rather than in the project, and Reza asked for a file that a project carries.

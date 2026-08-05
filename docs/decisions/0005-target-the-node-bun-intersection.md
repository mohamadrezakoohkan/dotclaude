# 0005 — Target the Node/Bun intersection, verified on Node

- Status: Accepted — approved by Reza's standing in-session directive "`/decide-and-continue` until there is no more questions" (2026-07-29), not by a separate review
- Date: 2026-07-29
- Supersedes: the runtime clause of spec §10 ("Runtime: Bun (Node-compatible)")

## Context

§10 names Bun as the runtime. **Bun is not installed on this machine** (`bun -v` → not found); Node is, at v26.3.1. M0 was therefore written and verified on Node.

Leaving §10 as-is would keep an unverified runtime claim in the spec — every later session would read "Runtime: Bun" and reasonably assume it had been exercised. The M0 code uses only `node:http`, `node:fs/promises`, `node:path`, `node:os`, `node:url` and ESM, with no `Bun.*` API anywhere, so it should run unchanged under Bun. "Should" is the operative word: nothing has proven it.

Evidence: `docs/plans/walking-skeleton.md` → Runtime; `package.json` (`start` → `node src/server.js`, zero dependencies); startup verified at 317 artifacts in 273 ms.

## Decision

Target the Node/Bun intersection and state Node as the verified runtime, keeping Bun as a supported-but-untested target until someone runs it.

## Trade-off accepted

The spec loses Bun's speed as a stated advantage and gains an accurate claim — cheap here because the intersection forbids no capability v1 needs (zero build step and near-zero dependencies were the actual requirements, and both hold on Node).

## Consequences

- **Spec sections to update:** §10, runtime clause.
- **Files or areas affected:** none — `package.json` and `src/` already comply. This record makes the existing code's contract explicit rather than changing it.
- **Standing constraint for later milestones:** no `Bun.*` API, and no dependency that ships a native build step. M6's watcher is where this bites — `node:fs.watch` recursive is the intersection-safe choice, and `0002`'s cited Bun v1.3.14 watcher caveat becomes irrelevant on Node while remaining a reason not to assume Bun parity.
- **Follow-up task:** if Bun is ever installed, run `bun src/server.js` and either promote it to verified or record what broke.

# 0012 — Read `installed_plugins.json`, and extend §5's tiebreak past source name

- Status: Accepted — approved by Reza's standing instruction to finish M2–M7 deciding each call (2026-07-29)
- Date: 2026-07-29
- Supersedes: extends D8 and §5's winner rule. Closes both follow-ups of `0003`.

## Context

Two problems arrived at M3 together, and they turn out to share an answer.

**The app answers its own founding question wrongly.** dotclaude exists to answer *is this the copy Claude actually loads?* M0 opened `plugins/cache/…/ios/3.1.8/…` while `installed_plugins.json` said ios runs `3.3.0`, and M1 opened `shared/3.2.5` while that file said `3.3.1`. The plugin cache accumulates versions and never prunes — `shared` currently holds four.

**§5's tiebreak is degenerate within one source.** The rule is "highest source `priority`; tie → alphabetical source name". All 155 of M0's original id collisions were *intra*-source, where both copies have the same priority *and* the same source name, so neither clause decides anything. `0009` settled which source owns a file; it said nothing about ordering copies inside one.

D8 forbids the app hard-coding Claude Code's internal precedence: "you declare it". But `installed_plugins.json` **is a declaration** — Claude Code wrote it, and it names the exact `installPath`, `version` and `scope` per plugin. Reading a machine-written declaration is not the same as reimplementing resolution logic, which is what D8 guards against. It does extend D8's model from "priority in config" to "priority in config, plus the install manifest for plugin artifacts", so it needs recording.

The two problems meet here: which cached version is installed is *exactly* the fact that breaks an intra-source tie between four copies of one plugin skill.

Evidence: `~/.claude/plugins/installed_plugins.json` (`installPath`, `version`, `scope`, `lastUpdated`); `docs/plans/walking-skeleton.md` → Known-imperfect; `docs/plans/index-pipeline.md` → Results.

## Decision

Read `installed_plugins.json` to mark which plugin copy is the installed one, and extend §5's tiebreak to installed-first, then higher version, then newer mtime, then path.

## Trade-off accepted

dotclaude now reads a Claude Code internal file whose format could change without notice, and a missing or unparsable manifest silently costs the "installed" fact — accepted because the alternative is an app that confidently shows a stale copy while claiming to answer which copy loads, and because the manifest is treated as advisory: absent it, the older tiebreak chain still resolves.

## Consequences

- **Spec sections to update:** §1 row D8 (the model now includes the install manifest), §5 (the extended tiebreak chain), §9 (the Resolution bar may state "installed").
- **`installed` and `effective` are kept separate, deliberately.** `effective` is §5's declared-priority winner — dotclaude's own model. `installed` is a fact about what Claude Code has on disk. Collapsing them would hide disagreement between the two, and that disagreement is the interesting case: it is precisely how a stale copy gets noticed.
- **"tie — set priorities" still fires** whenever equal priorities forced a fallback, even when a fallback resolved it. The flag means "you have not declared this", not "this is unresolvable".
- **Files or areas affected:** a new `src/plugins.js`, `src/resolver.js`, the Resolution bar, and §5's Duplicates view ordering.
- **Follow-up task:** M6's watcher should treat `installed_plugins.json` as a watched input — a plugin update changes which copy is installed without changing any artifact.

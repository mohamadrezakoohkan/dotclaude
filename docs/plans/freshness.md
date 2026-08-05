# M6 — Freshness · `feat/freshness`

**Spec:** §3 (freshness), §10 (persistence, API surface, trust boundary), D2, D3, D11.

## Goal

Recursive watcher → ~500 ms debounce → one full re-index; SSE ping and refetch; the quiet "Library updated" toast; JSON snapshot for instant startup; Rescan endpoint; open-in-editor restricted to paths inside registered sources; localhost-only bind.

## Decisions taken here

1. **The watcher filters events to things that can change the index** — `.md`, `.mdc`, directories, and `installed_plugins.json` (`0012`'s follow-up: a plugin update changes which copy is installed without touching any artifact). The §3 ignore list applies to watch events too, otherwise a build directory rebuilds the index.
2. **A change arriving mid-rebuild queues exactly one more rebuild** rather than racing or being dropped. Full re-index is cheap enough (D3) that this is simpler than reconciling partial state.
3. **The snapshot is a cache, never an authority.** It carries a version that is bumped when the artifact shape changes, and is written to a temp file then renamed, so a crash cannot leave a half-parsed snapshot. A stale or corrupt one degrades to a full scan — D2 says truth is always the filesystem.
4. **open-in-editor takes an artifact id, never a path.** Accepting a caller-supplied path and then validating it would reintroduce the traversal the guard exists to prevent; taking an id means only indexed files are reachable by construction.

## Done when

A git branch switch produces **exactly one** re-index (from logs, not by feel); a file created inside a directory that did not exist when the watch started is detected; open-in-editor refuses a path outside every registered source; the server binds localhost only.

## Results

### Done when — all four verified from logs, not by feel

**1. A branch switch produces exactly one re-index.** Two switches on the watched `dotclaude` source, read from the server log:

```
re-indexed (startup rescan): 581 artifacts in 2327 ms
watch: re-index: 1 event(s) absorbed
re-indexed (watcher): 581 artifacts in 2629 ms     ← switch to main
watch: re-index: 1 event(s) absorbed
re-indexed (watcher): 581 artifacts in 2271 ms     ← switch back
```

**A first attempt produced zero re-indexes,** which was the honest answer rather than a failure: that switch changed only `.js` files, and `isRelevant` filters those out because no `.js` file can alter the index. The test only exercises §3's claim once the switch touches `.md`, so the plan doc was committed first and the switch repeated. Worth stating plainly — a code-only branch switch costs nothing, which is better than the spec promises.

Storm absorption was shown separately: creating one file fired **4 filesystem events, absorbed into 1 re-index**.

**2. A file created inside a directory that did not exist when watching started is detected** — the Bun v1.3.14 case `0002` cited, here on Node's recursive `fs.watch`. Creating `brand-new-dir/deeper/watch-probe/SKILL.md` two levels below anything that existed at watch time moved the index 582 → 583.

**3. open-in-editor refuses anything outside a registered source.** The endpoint takes an artifact **id**, never a path, so arbitrary files are unreachable by construction rather than by filtering. Over HTTP: `{"id":"/etc/passwd"}` → 404, `{"id":"../../../../etc/passwd"}` → 404, empty body → 404, `GET /api/rescan` → 404 (POST only). The guard itself is unit-tested against `/etc/passwd`, `~/.ssh/id_rsa`, a prefix-sharing sibling (`/repo-secrets` must not pass as inside `/repo`), and a traversal that `path.resolve` would otherwise collapse.

**4. Localhost only.** `lsof` reports `127.0.0.1:4114`; the LAN address refuses.

### SSE and the snapshot

The quiet toast reads **"Library updated"** verbatim (§3) and auto-hides. A rescan from the header button round-trips through `POST /api/rescan` → rebuild → SSE ping → client refetch, and the open page updates without losing its place.

Snapshot startup works: the server adopts `.dotclaude-cache/index.json` and serves immediately, then rescans in the background and pushes the SSE ping. Startup log shows `snapshot: 582 artifacts from <timestamp> — rescanning`. The snapshot carries a version so an old shape is ignored rather than deserialized, and is written to a temp file then renamed so a crash cannot leave a half-parsed file. D2 holds — it is a cache, and truth stays the filesystem.

### Note for later

§3's promise that "the debounce plus full-re-index model absorbs [storms] by design" is now measured rather than asserted: each full re-index costs ~2.3–2.8 s over 16 sources. That is fine for a watcher firing on artifact edits, but it is the number to revisit if D2's ~5k-artifact threshold is ever approached — at that point the debounce hides the cost rather than removing it.

57 assertions pass.

# Contract: `workspace.json`

The one new file shape this feature introduces. It is read, never written (D11).

## Location

Conventionally `<project>/.claude/workspace.json`. Nothing requires that — the app reads whatever path it is given — but the convention is what makes `--workspace <project>` work without naming the file.

## Shape

```json
{
  "name": "project-agent",
  "sources": [
    { "name": "project-agent",  "path": "..",                                   "priority": 100 },
    { "name": "team-shared", "path": "~/code/team/.claude",  "priority": 100 },
    { "name": "personal",         "path": "~/.claude",                             "priority": 50  }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `name` | no | The workspace's display name. Defaults to the basename of the directory holding the workspace file — or of its parent when that directory is `.claude`, so `<project>/.claude/workspace.json` defaults to the project's name |
| `sources` | **yes** | Array of §2 sources. Same contract, same validation, same defaults as `sources.json`: `type` defaults to `local`, `priority` to 50, names must be unique |
| `_comment` | no | Ignored, as in `sources.json` |

No field beyond these is read. An unknown key is ignored rather than rejected — the same posture §3 takes toward frontmatter it does not understand.

## Path resolution (FR-003)

| Written | Resolves to |
|---|---|
| `~/…` | home-relative, as everywhere in the app |
| `/…` | itself |
| `..` | the directory containing the workspace file, joined — so from `<project>/.claude/` this is `<project>` |
| `.` | the directory containing the workspace file — from `<project>/.claude/` this is the `.claude` directory itself |

This differs from `sources.json`, where a relative path resolves against the dotclaude repo. The base is the file's own directory precisely so that a workspace file can be committed inside a project and stay correct on another machine.

## Failure table (FR-005)

| Condition | At boot | At rescan / watch |
|---|---|---|
| File missing | exit ≠ 0, naming the path looked for | keep last good list, config chip |
| Not valid JSON | exit ≠ 0, with the parser's message | keep last good list, config chip |
| No `sources` array, or it yields no usable entry | exit ≠ 0 | keep last good list, config chip |
| A source entry is malformed (no name, no path, duplicate name) | boots; that entry is skipped and reported as a config error, per §2 | same |
| A source path does not exist | boots; source listed with an error chip, per §2 | same |

The asymmetry is deliberate and is the substance of `0023`'s failure-posture paragraph: at boot the alternative to exiting is indexing something **wider** than was asked for, and after boot the alternative to keeping is killing a server the reader is looking at.

## What this file cannot do

- It cannot enable or disable library sources — it replaces the list, it does not edit it.
- It cannot set the port; that is `--port` / `PORT` (FR-011), because it is a property of the run, not of the workspace.
- It cannot make the app write anything (D11), including itself.

# Overview

`rbagents-security` is a **dual-purpose** package: the same implementation is reachable as a
terminal command and as an MCP server. It serves one thing — the Roblox security set — and it serves
it read-only.

## The two surfaces

| Surface | Bin | Who uses it |
|---|---|---|
| CLI | `rbagents-security` | A person running it by hand or from a script |
| MCP server | `rbagents-security-server` | An MCP client, an editor, an agent, or a connector |

Both share one implementation and one tool list, so a result produced through one is
identical to the same result produced through the other. `npm test` pins that agreement.

## The one tool

| Tool | Parameters | Returns |
|---|---|---|
| `the Roblox security set` | `path` (string) | One file from `content/`, verbatim |

`path` is relative to the set root, so a caller writes `index/roblox-security-index.md`. An unknown path returns
`not found` as ordinary content — a lookup miss, not a server fault.

## Read-only, structurally

The server has no write path. No tool accepts a verb, no tool takes a credential, and no
tool opens a socket. The code that would write is absent rather than disabled, which is
what makes "pointing a repository at this server cannot mutate the set" a property of the
code rather than a configuration someone can change.

A `..` segment in a path is rejected **before** any filesystem call, and the resolved path
is confirmed to be inside `content/` afterwards. The second check is redundant by design:
if the first is ever weakened, the boundary still holds.

## What ships

* An MCP server over **stdio** and **streamable HTTP**, with a `/healthz` endpoint on the
  HTTP transport.
* A CLI with `help`, `version`, `tools`, and `serve`.
* A tool layer where each tool is its own file under `src/tools/`, declaring optional
  parameters with [zod](https://zod.dev).
* A test suite covering registration, the advertised schema, every file in the set, five
  traversal attempts that must report `not found` and leak nothing, and the structural
  claim that no tool takes a verb or a credential.

## Requirements

Node.js 20 or newer. Two dependencies (`@modelcontextprotocol/sdk`, `zod`), and **no
build step** — the package ships source and Node runs it directly.

## Related pages

* [`architecture.md`](architecture.md) — how the pieces fit together.
* [`../environments/setup.md`](../environments/setup.md) — installing and running it.
* [`../environments/env.md`](../environments/env.md) — environment variables.

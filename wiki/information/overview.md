# Overview

`@mcagents-mcp/template` is a **dual-purpose** package: the same implementation is
reachable as a terminal command and as an MCP server. It is also the template other
LXAgents MCP repositories are scaffolded from.

## The two surfaces

| Surface | Bin | Who uses it |
|---|---|---|
| CLI | `template` | A person running it by hand or from a script |
| MCP server | `template-server` | An MCP client, an editor, an agent, or a connector |

Both share one implementation and one tool list, so a result produced through one is
identical to the same result produced through the other. `npm test` pins that
agreement.

## What it ships

* An MCP server over **stdio** and **streamable HTTP**, with a `/healthz` endpoint on
  the HTTP transport.
* A CLI with `help`, `version`, `tools`, and `serve`.
* A tool layer where each tool is its own file under `src/tools/`, may declare
  parameters with [zod](https://zod.dev), and may require an API key.
* A test suite covering registration, advertised schemas, argument validation, and the
  API-key behaviour.

## The sample tools

Four tools ship with the template. They exist to demonstrate the four combinations of
*takes parameters* and *requires an API key*, and they are **deleted when a real project
is scaffolded from this template**.

| Tool | Parameters | API key | Returns |
|---|---|---|---|
| `get_server_time` | none | no | The current time as an ISO 8601 UTC timestamp |
| `get_secure_summary` | none | yes | A short authenticated status summary |
| `calculate_sum` | `a`, `b` (numbers) | no | The sum |
| `search_secure_data` | `query` (string) | yes | Matching records |

## Authentication

One key for the whole server, not one per tool: `API_KEY`. Tools that need it read it
when they are called and fail with a message naming the tool and the variable when it
is absent. Tools that do not need it work with no configuration at all.

Every tool is listed whether or not a key is set — only calling an authenticated one
fails. See [`../environments/env.md`](../environments/env.md).

## Requirements

Node.js 20 or newer. Two dependencies (`@modelcontextprotocol/sdk`, `zod`), and **no
build step** — the package ships source and Node runs it directly.

## Related pages

* [`architecture.md`](architecture.md) — how the pieces fit together.
* [`../environments/setup.md`](../environments/setup.md) — installing and running it.
* [`../environments/env.md`](../environments/env.md) — environment variables.

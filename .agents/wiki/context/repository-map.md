---
name: agent-wiki-context-repository-map
description: Orientation for template - what lives where, how to build and test it, the two surfaces, and the gotchas that bite first.
---

# Repository Map

Read this before touching anything in `template`.

## What this repository is

An MCP server and a CLI over one implementation, and the template every other LXAgents
MCP repository is scaffolded from. Node.js 20+, ESM (`"type": "module"`), **no build
step** - the published package ships `src/` and Node runs it directly.

* Remote: `LXAgents-MCP/template`, default branch `master`.
* Package: `@mcagents-mcp/template`.
* Bins: `template` (CLI) and `template-server` (MCP server).

## Layout

```
AGENTS.md                     entry point, connector bootstrap, trigger table
PROMPT.md                     scaffolding procedure - present only while this is a template
package.json                  both bins, no build step
src/
  index.js                    entry point; picks stdio or streamable HTTP, owns the HTTP server
  server.js                   builds the McpServer and registers every tool; exports listTools()
  cli.js                      the CLI: help, version, tools, serve
  version.js                  reads version out of package.json at import
  tools/
    get_server_time.js        sample: no parameters, no API key
    get_secure_summary.js     sample: no parameters, API key required
    calculate_sum.js          sample: zod parameters, no API key
    search_secure_data.js     sample: zod parameters, API key required
test/
  server.test.js              tool registration, schemas, API-key behaviour, surface parity
wiki/                         human documentation
.agents/                      this set - rules, agent wiki, memory, indexes
```

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs `@modelcontextprotocol/sdk` and `zod`. |
| `npm test` | `node --test`. The whole suite; there is no watch mode. |
| `npm run cli -- tools` | Lists registered tools through the CLI surface. |
| `npm start` | Serves over stdio. |
| `npm run start:http` | Serves over streamable HTTP on `PORT` (default 3000). |
| `npm run inspect` | MCP Inspector against the stdio server. |

## Environment variables

| Variable | Read by | Effect |
|---|---|---|
| `API_KEY` | tool handlers | The single server-wide key. Absent, the authenticated tools throw. |
| `MCP_TRANSPORT` | `src/index.js` | `stdio` (default) or `http`. |
| `PORT` | `src/index.js` | HTTP port, default `3000`. |

## The two surfaces

`src/server.js` holds the only tool list. `src/cli.js` imports `listTools()` from it
rather than keeping its own, and `test/server.test.js` asserts that what the CLI would
print matches what an MCP client receives from `tools/list`. Adding a tool in one place
therefore adds it in both, and there is no way to add it to only one without failing the
suite.

## Gotchas

* **stdout is the protocol.** On stdio, a `console.log` anywhere on the server path
  corrupts the JSON-RPC stream. Log to stderr. Only CLI commands print.
* **Tool schemas are raw shapes.** `server.tool()` wants `{ a: z.number() }`, not
  `z.object({ ... })`. Wrapping it silently produces a tool with no parameters.
* **The API key is read inside handlers**, never at import - see
  [`../../rules/secrets.md`](../../rules/secrets.md).
* **A fresh `McpServer` per HTTP request.** `src/index.js` builds and closes one per
  request because `McpServer` holds per-connection state. Do not hoist it to module
  scope.
* **The four tools in `src/tools/` are samples** and are deleted at scaffold time.
  Nothing outside that folder may depend on them - see
  [`../../rules/template-mode.md`](../../rules/template-mode.md).
* **`version.js` reads `package.json` at import** via a path relative to `src/`. Moving
  it breaks the version without failing a test.

## Where the conventions come from

Branching, commits, pull requests, the task workflow and the creators are **not** in
this repository. They are served by the `lxagents-agents-base` connector and read as
`agents://` resources. This repository carries only what is its own.

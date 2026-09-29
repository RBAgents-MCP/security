---
name: agent-wiki-context-repository-map
description: Orientation for rbagents-security - what lives where, how to build and test it, the two surfaces, and the gotchas that bite first.
---

# Repository Map

Read this before touching anything in `rbagents-security`.

## What this repository is

An MCP server and a CLI over one implementation, serving the Roblox security set read-only. Node.js 20+,
ESM (`"type": "module"`), **no build step** - the published package ships `src/` and Node
runs it directly.

* Remote: `RBAgents-MCP/security`, default branch `master`.
* Bins: `rbagents-security` (CLI) and `rbagents-security-server` (MCP server).

## Layout

```
AGENTS.md                     entry point, connector bootstrap, trigger table
package.json                  both bins, no build step
Dockerfile                    node:22-alpine, src/ and content/ only; written, never built
.dockerignore                 the build context; excludes test/, so the image cannot run its own suite
content/                      the published set - the product
  index/                      the routing index
src/
  index.js                    entry point; picks stdio or streamable HTTP, owns the HTTP server
  server.js                   builds the McpServer and registers every tool; exports listTools()
  content.js                  resolves a path inside content/, with the traversal defence
  cli.js                      the CLI: help, version, tools, serve
  version.js                  reads version out of package.json at import
  tools/
    the Roblox security set.js the only tool: read one file from the set by path
test/
  server.test.js              registration, schema, every file, traversal, surface parity - in memory
  http.test.js                the same guarantees over a real socket; starts the real process
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
| `npm run start:http` | Serves over streamable HTTP on `PORT` (default 3000). Equivalent to `node src/cli.js serve --http`, which is what makes it portable - `VAR=value cmd` is a shell feature and fails under `cmd.exe`. |
| `npm run inspect` | MCP Inspector against the stdio server. |
| `docker build -t <tag> .` | Builds the image. **Never run by this repository's own workflow**; the Dockerfile is written and reviewed as source only. |

## Environment variables

| Variable | Read by | Effect |
|---|---|---|
| `MCP_TRANSPORT` | `src/index.js` | `stdio` (default) or `http`. |
| `PORT` | `src/index.js` | HTTP port, default `3000`. |
| `HOST` | `src/index.js` | HTTP bind host, default `0.0.0.0` (all interfaces). |
| `MCP_ALLOWED_HOSTS` | `src/index.js` | Comma-separated `Host` allow-list. **Unset means off** - no list, every host accepted, and the startup line on stderr says so. |

There is no `API_KEY`. Nothing here reaches an external service.

## The two surfaces

`src/server.js` holds the only tool list. `src/cli.js` imports `listTools()` from it
rather than keeping its own, and `test/server.test.js` asserts that what the CLI would
print matches what an MCP client receives from `tools/list`. Adding a tool in one place
therefore adds it in both, and there is no way to add it to only one without failing the
suite.

## Gotchas

* **stdout is the protocol.** On stdio, a `console.log` anywhere on the server path
  corrupts the JSON-RPC stream. Log to stderr. Only CLI commands print. This holds on
  the **HTTP** branch too - it is one process serving both, so the HTTP startup line
  goes to stderr as well and `test/http.test.js` asserts stdout stays empty.
* **An unset `MCP_ALLOWED_HOSTS` is a decision, not an omission.** The safe-looking
  empty value is the unsafe one: unset installs no allow-list and accepts every `Host`.
  The startup line exists so that state is visible rather than inferred from silence.
* **`.gitattributes` is load-bearing for the Dockerfile.** `* text=auto eol=lf` - a CRLF
  after any Dockerfile instruction fails the build at line 2, and a CRLF `.dockerignore`
  silently stops matching. Do not delete it; do not let an editor reintroduce CRLF.
* **Tool schemas are raw shapes.** `server.tool()` wants `{ a: z.number() }`, not
  `z.object({ ... })`. Wrapping it silently produces a tool with no parameters.
* **Reject `..` before the filesystem call.** A check that runs after `fs` is checking a
  value the caller already influenced. `src/content.js` does both: the segment check
  first, the containment check after, and the second is redundant on purpose.
* **A fresh `McpServer` per HTTP request.** `src/index.js` builds and closes one per
  request because `McpServer` holds per-connection state. Do not hoist it to module
  scope.
* **`content/` is the product, not a source folder.** Every file in it is served
  verbatim on the next boot, with its frontmatter intact. `src/` is local; a change to
  `content/` changes what every consuming repository reads.
* **Do not add a write path.** The single-tool read-only surface is the property a
  consuming repository depends on. See
  [`../../rules/tool-authoring.md`](../../rules/tool-authoring.md).
* **`version.js` reads `package.json` at import** via a path relative to `src/`. Moving
  it breaks the version without failing a test.

## Where the conventions come from

Branching, commits, pull requests, the task workflow and the creators are **not** in
this repository. They are served by the `lxagents-agents-base` connector and read as
`agents://` resources. This repository carries only what is its own.

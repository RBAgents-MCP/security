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
content/                      the published set - the product, and the tool surface
  index/                      the routing index
src/
  index.js                    entry point; picks stdio or streamable HTTP, owns the HTTP server
  server.js                   builds the McpServer, registers every tool, exports listTools()
  cli.js                      the CLI: help, version, tools, serve
  version.js                  reads version out of package.json at import
  tools/
    from-content.js           builds one tool per markdown file in content/, at import
test/
  server.test.js              bijection, derivation, no-argument, served bytes, surface parity - in memory
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

`src/tools/from-content.js` holds the only tool list, and it is **derived from
`content/`** rather than written down. `src/server.js` freezes it and registers it;
`src/cli.js` imports `listTools()` rather than keeping its own. `test/server.test.js`
asserts that what the CLI would print matches what an MCP client receives from
`tools/list`, and that the tool list and the files on disk are a bijection in both
directions. Adding a markdown file to `content/` therefore adds a tool to both surfaces,
and there is no way to add a tool to one and not the other without failing the suite.

The three tools today: `roblox_security_index`, `trust_boundaries`,
`zero_trust_networking`.

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
* **No tool takes an argument.** That is the design, not an omission: with no `path`
  there is nothing for a caller to traverse with, and a call does no filesystem I/O
  because the set is read once at import. `test/server.test.js` asserts it. A tool that
  needs an argument has to stop being generated - see
  [`../../rules/tool-authoring.md`](../../rules/tool-authoring.md).
* **Tool names are basenames.** Folder dropped, `.md` dropped, lowercased, `-` to `_`.
  `NAME_OVERRIDES` in `src/tools/from-content.js` is the escape hatch and is currently
  empty. A name collision across folders is a startup error, not a silent shadow.
* **Frontmatter is read by hand, not by a YAML parser.** Only single-line scalar fields.
  A missing `description:` is a startup error, because a tool a client cannot route on
  is worse than no tool.
* **A fresh `McpServer` per HTTP request.** `src/index.js` builds and closes one per
  request because `McpServer` holds per-connection state. Do not hoist it to module
  scope.
* **`content/` is the product, not a source folder.** Every file in it is served
  verbatim on the next boot, with its frontmatter intact. `src/` is local; a change to
  `content/` changes what every consuming repository reads.
* **Do not add a write path.** The read-only surface is the property a consuming
  repository depends on. See [`../../rules/tool-authoring.md`](../../rules/tool-authoring.md).
* **`version.js` reads `package.json` at import** via a path relative to `src/`. Moving
  it breaks the version without failing a test.
* **`package-lock.json` drifts on `master`.** Its root entry still carries the template's
  name and bins, so any `npm install` rewrites four lines. Revert it before committing
  unless a dependency actually changed.

## Where the conventions come from

Branching, commits, pull requests, the task workflow and the creators are **not** in
this repository. They are served by the `lxagents-agents-base` connector and read as
`agents://` resources. This repository carries only what is its own.

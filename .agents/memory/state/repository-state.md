---
name: memory-state-repository-state
description: Current known state of rbagents-security - what exists after the template was turned into a read-only instruction server, and the next obvious step.
---

# Repository State

## What this repository is right now

`rbagents-security` is a working dual-purpose MCP server and CLI at version `0.1.0`. It serves
the Roblox security set read-only. It is no longer a template: `PROMPT.md` and `template-mode.md` are
gone, and `src/tools/` holds one real tool.

## Stack

Node.js 20+, ESM, no build step. Two runtime dependencies:
`@modelcontextprotocol/sdk` and `zod`. Tests are `node --test`, no framework.

## What exists

* **The set.** `content/` holds the 2 Roblox security conventions, copied verbatim
  from the workspace set with their frontmatter intact, plus an index at
  `content/index/roblox-security-index.md` routing them.
* **Tool layer.** `src/tools/` with one file per tool, each exporting `config` and
  `handler`. `src/server.js` imports them individually and registers each with
  `server.tool(name, description, schema?, handler)`; the old frozen `TOOLS` array is
  gone.
* **Traversal defence.** `src/content.js` rejects a `..` segment before any filesystem
  call, then confirms containment. The second check is redundant on purpose.
* **Read-only, structurally.** No tool accepts a verb, takes a credential, or opens a
  socket. The code that would write is absent rather than disabled.
* **Surface parity.** `src/cli.js` prints `listTools()` from `src/server.js`;
  `test/server.test.js` pins the CLI list against the MCP client's `tools/list`.
* **An HTTP transport, hardened.** `StreamableHTTPServerTransport` at `POST /mcp` plus
  `GET /healthz`, stateless, with `HOST` binding, an `MCP_ALLOWED_HOSTS` `Host`
  allow-list (off when unset, and it says so on stderr), a 4 MiB body cap, and a
  drain-before-close shutdown. `test/http.test.js` covers all of it over a real socket
  against the real process - see
  [`../tasks/http-transport-and-docker.md`](../tasks/http-transport-and-docker.md).
* **A container image.** `Dockerfile` and `.dockerignore`, `node:22-alpine`, `src/` and
  `content/` only, non-root. **Written and reviewed as source; never built or run.**
* **Instruction system.** Mode B - `AGENTS.md` plus `.agents/`, resolving the shared set
  through the `lxagents-agents-base` connector. Local rules: `repository`,
  `tool-authoring`, `secrets`. No overrides.
* **Documentation.** `wiki/information/` and `wiki/environments/`, all updated in the
  same commit as the code change they describe, plus the first changelog at
  `wiki/logs/0/1/0/`.

## What is not built

* **No container image has ever been built.** `Dockerfile` is source that has been read
  and reviewed, not a verified artifact. `EXPOSE`, both run forms, and `npm ci` inside
  the image are unproven.
* The HTTP transport has no authentication, and the `Host` allow-list guarding it is
  **off unless `MCP_ALLOWED_HOSTS` is set**. That is the intended default, not an
  oversight, and an operator who has not read the startup line will not know.
* No CI workflow, no linter, no formatter.
* `content/` is a copy. A change to the set belongs upstream in the workspace set first;
  this repository is a delivery surface for it, not its editor.
* The version is still `0.1.0` from the template and has not been bumped - that needs
  the owner.

## Shared set

Resolved through the `lxagents-agents-base` MCP connector. Nothing shared is vendored
here, and there are no overrides - see
[`../../index/root-index.md`](../../index/root-index.md).

## Next obvious step

Build the image, once, by hand. `Dockerfile` has been written and reviewed but never
executed, so `EXPOSE`, both run forms, and `npm ci --omit=dev` inside the container are
all unproven. That is the shortest outstanding gap between what this repository claims
and what it has actually run.

After that, add CI that runs `npm test` on push. The suite is the only thing holding the
two surfaces, both transports, and the traversal defence together, and nothing runs it
automatically.

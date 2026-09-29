---
name: memory-state-repository-state
description: Current known state of rbagents-security - a per-file tool surface generated from content/, served read-only over two transports, and the next obvious step.
---

# Repository State

## What this repository is right now

`rbagents-security` is a working dual-purpose MCP server and CLI at version `0.1.0`. It
serves the Roblox security set read-only, one tool per file. It is not a template:
`PROMPT.md` and `template-mode.md` are gone, and the tool surface is generated from
`content/` rather than written down.

## Stack

Node.js 20+, ESM, no build step. Two runtime dependencies:
`@modelcontextprotocol/sdk` and `zod`. Tests are `node --test`, no framework.

## What exists

* **The set.** `content/` holds the 2 Roblox security conventions, copied verbatim
  from the workspace set with their frontmatter intact, plus an index at
  `content/index/roblox-security-index.md` routing them.
* **A generated tool surface.** `src/tools/from-content.js` walks `content/` once at
  import and builds one tool per markdown file — `roblox_security_index`,
  `trust_boundaries`, `zero_trust_networking` — named after the file's basename, with
  the frontmatter `description:` as the tool description. `src/server.js` freezes the
  list as `TOOL_MODULES` and registers each with the three-argument form. **Adding a
  markdown file to the set is what adds a tool**; there is no per-tool source file.
* **No argument anywhere.** No tool declares an input schema, so there is no path for a
  caller to traverse with, and a call does no filesystem I/O — the set is read once at
  boot and a handler is a map lookup. `src/content.js` and its traversal guard are
  gone: the guard was careful work defending an argument that no longer exists, and a
  defence with no caller is worse than none.
* **Read-only, structurally.** No tool accepts a verb, takes a credential, or opens a
  socket. The code that would write is absent rather than disabled.
* **Surface parity.** `src/cli.js` prints `listTools()` from `src/server.js`;
  `test/server.test.js` pins the CLI list against the MCP client's `tools/list` and the
  tool list against the files on disk, in both directions.
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
  same commit as the code change they describe, plus changelogs at `wiki/logs/0/1/0/`
  and `wiki/logs/1/0/0/`.

## Test counts

**29 total: 13 in `server.test.js`, 16 in `http.test.js`.** Baseline before the per-file
change was also 29 — 12 and 16 — so the `server.test.js` count went **up** by one while
the surface went from one tool to three. Five path-based cases were deleted and six
broader ones added. See [`../tasks/per-file-tools.md`](../tasks/per-file-tools.md).

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
* `content/index/roblox-security-index.md` has no `author:` in its frontmatter — the
  only served file here without one. **Reported, not fixed**: the generator reads
  `description`, so it publishes, and the file belongs upstream.
* `zod` is still a direct dependency and nothing imports it any more, since the last
  schema went with the last path argument. Not removed here — see
  [`../tasks/per-file-tools.md`](../tasks/per-file-tools.md).
* `package-lock.json` still carries the template's root `name` and `bin` on `master`, so
  any `npm install` rewrites four lines. Pre-existing; reverted rather than committed.

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
two surfaces, both transports, and the file-to-tool bijection together, and nothing runs
it automatically.

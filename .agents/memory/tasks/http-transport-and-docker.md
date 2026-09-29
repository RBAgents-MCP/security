---
name: memory-tasks-http-transport-and-docker
description: Record of the HTTP transport hardening and container work on feat/http-transport-and-docker - what shipped, what was decided, and what is deliberately still unbuilt.
---

# Task — HTTP transport and Docker

**Branch:** `feat/http-transport-and-docker`, off `master`. Local commits only; nothing
pushed, no pull request opened, no version bumped.

## What shipped

Hardening of the HTTP transport this repository already had, plus a container image.

| | |
|---|---|
| **Transport kept** | `StreamableHTTPServerTransport` at `POST /mcp`, as it already was in `src/index.js`. Not replaced. |
| **`HOST`** | explicit bind, default `0.0.0.0`; `--host` on the CLI |
| **`MCP_ALLOWED_HOSTS`** | `Host` header allow-list, comma-separated, **off when unset**, port-agnostic, 403 on refusal, startup line either way |
| **Shutdown** | drain 500ms, then close what remains |
| **`start:http`** | routed through `node src/cli.js serve --http`, so it runs under `cmd.exe` |
| **`Dockerfile` / `.dockerignore`** | `node:22-alpine`, `src/` and `content/` only, non-root |
| **Tests** | `test/http.test.js`, 19 tests over a real socket |

## What was decided, and what it closed

* **SSE was not ported.** The requirement was written as SSE; the repository already had
  its current successor, and porting the deprecated `SSEServerTransport` would have
  replaced a current transport with a deprecated one and broken every documented client
  URL. `src/http.js` was not created.
* **`express` was not adopted.** Zero new dependencies, in a package whose stated virtue
  is having two. The SDK's `hostHeaderValidation` is express middleware —
  `(req, res, next)` returning `res.status(403).json()` — so the allow-list is
  hand-written against `req.headers.host`.
* **`hostHeaderValidation` is express-only, confirmed by reading the installed SDK** at
  `node_modules/@modelcontextprotocol/sdk/dist/esm/server/middleware/`. Q5's open
  unknown, resolved.
* **`StreamableHTTPClientTransport` exists and works** at
  `@modelcontextprotocol/sdk/client/streamableHttp.js`, against this stateless server.
  Q7's unverified symbol, confirmed by running it.

## The image has never been built

No `docker build`, no `docker run`, no Docker command of any kind was executed. The
`Dockerfile` and `.dockerignore` are written and reviewed as source. `EXPOSE`, both run
forms, and `npm ci --omit=dev` succeeding are unverified by a build. That qualifier is
stated in `wiki/environments/docker.md`, in the Dockerfile's own header, and here; it is
not to be dropped by anything written downstream.

## Measured, not assumed

The shutdown change was measured rather than reasoned about, with a request in flight
when the signal arrives:

| | in-flight request | close callback fires |
|---|---|---|
| `close()` alone | completes | ~5.5s, waiting out keep-alive |
| with the 500ms drain | cut off past the window | ~0.7s, bounded |

The trade is real and is stated in the source: a request still running when the window
closes is cut off. Every tool reads one file out of `content/` and returns it, so 500ms
is far more than a real call needs.

## Test counts

12 before, 28 after: the original 12 in `server.test.js` unchanged, 19 new in
`http.test.js`. Baseline was confirmed by running it — the plan recorded it as "unknown,
not run in this session" and expected 12.

## Environment note that will bite the next person

This checkout runs **Windows Node** (`node.exe`, v22) under WSL2 on a `/mnt/c`
filesystem. So `process.platform` is `win32`, not `linux` — the plan assumed otherwise.
Two consequences:

* `node` is not on `PATH` in a plain bash shell; npm finds it, bare `node` does not.
  Use the full path or an npm script.
* Node emulates signals on Windows by terminating the target unconditionally, so a
  handler registered in the child **never runs** there. The SIGTERM test asserts a clean
  exit and the drain log only off Windows; on Windows it asserts only that the process
  stopped. That branch is the one that actually executed here.

## Left alone, and why

* **`package-lock.json` is stale on `master`.** Its root entry still says
  `@mcagents-mcp/template` with the template's bin names, so `npm install` rewrites four
  lines. Confirmed this does **not** break the Dockerfile: `npm ci` succeeds against the
  mismatched lockfile, because npm validates dependencies, not the root `name`/`bin`.
  Cosmetic, pre-existing, out of plan scope — not fixed here.
* **Two broken links**, in `wiki/information/architecture.md` and
  `wiki/environments/env.md`, both pointing at `../../../.agents/rules/secrets.md` from
  two directories deep, which climbs one level too far. Pre-existing on `master`.
* **Several pages call the tool `the Roblox security set`** — `overview.md`, `setup.md`,
  `architecture.md`, `repository-map.md`. The actual tool name is
  `roblox_security_instruction`, which `test/server.test.js` pins. Pre-existing, and not
  a claim this change touched.
* **`architecture.md` said "Four source files"** when there are six. Pre-existing; fixed
  while the file was open, and called out as pre-existing in the commit rather than
  folded in silently.

## Still not built

* No version bump. `package.json` stays `0.1.0`; `AGENTS.md` § Version rule requires the
  owner.
* No changelog entry, because no version changed and
  `wiki/logs/0/1/0/CHANGELOG.md` is the current one. If the owner bumps, the entry and a
  `.agents/index/logs-index.md` update ride in that commit.
* No CI. `npm test` still runs only when a person runs it, and it is the only thing
  holding both transports to the same tool surface.

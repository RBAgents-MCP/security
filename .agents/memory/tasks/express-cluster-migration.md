---
name: memory-tasks-express-cluster-migration
description: Task record for replacing the node:http transport with an express application mapped strictly to POST /mcp, converging the hand-rolled Host guard on the SDK middleware, and for answering requests from cluster workers on one port.
---

# Task: express transport and cluster workers

Three branches, stacked. Local commits only; nothing is pushed from them. **No version
change** — the version needs the owner, and so does the release log.

## The plan

| # | Task | Branch | Scope |
|---|---|---|---|
| 1 | The record | `chore/express-cluster-plan` | This file. |
| 2 | express transport + guard | `feat/express-transport` | `node:http` → express at `/mcp`, and the hand-rolled `Host` guard → the SDK's middleware. |
| 3 | cluster workers | `feat/cluster-workers` | A `cluster` primary forking workers onto the one `PORT`. |

The working plan is untracked, under `.agents/plans/`, and is deleted or abandoned when
the work merges. Where the two disagree, this record wins.

## What this is

The repository serves `StreamableHTTPServerTransport` on `POST /mcp` from a
`node:http` server, with a hand-rolled `readBody` and a hand-rolled `rpcError`. It is
the **only one of the five** whose `Host` guard is not the SDK's `hostHeaderValidation`:
it carries its own `hostName()` and an `hosts.includes()` check, kept because the SDK
middleware reaches for `res.status()` and `res.json()` and a `node:http` response has
neither.

This task replaces the transport with an express application and a `cluster` primary,
and **converges the guard on the SDK's middleware**, which express then serves
natively.

## The one place behaviour changes

The owner chose convergence over byte-identical preservation, and the instruction that
came with it is explicit:

> if `MCP_ALLOWED_HOSTS` is unset or empty, the guard must be completely OFF and accept
> all requests.

**Kept.** Unset, empty, or separators-only → the middleware is **not mounted at all**
and every request is served. The startup line announces it either way.

**Changed.** The refusal body and two edge cases:

| Case | Today | After |
|---|---|---|
| host not on the list | 403 / `-32000` / `Host not allowed: evil.test` | 403 / `-32000` / `Invalid Host: evil.test` |
| `Host` header absent | 403 / `Host not allowed: (none)` | 403 / `Missing Host header` |
| unparseable `Host` | falls through to the not-allowed branch | 403 / `Invalid Host header: …` |

Status and JSON-RPC code are unchanged, so no client distinguishes success from
failure differently. `test/http.test.js:230` asserts the old message and is updated in
the same commit as the guard change it describes.

This is recorded here rather than left to the diff, because "the security logic was
preserved" would otherwise be a false claim.

## Baseline

`npm test` before any change: **29 tests, 29 pass, 0 fail** (Node 24.21.0, `node
--test`, no framework).

## What is preserved

| Property | What happens |
|---|---|
| Guard off when `MCP_ALLOWED_HOSTS` is unset/empty | Preserved — the owner's explicit instruction, and the security property the change turns on |
| `PORT` default 3000, `HOST` default 0.0.0.0, named bind | Preserved |
| Startup line incl. `allow-list is off - MCP_ALLOWED_HOSTS is unset` and `allow-list is a, b` | Preserved byte-for-byte; the suite asserts both |
| Stateless `McpServer` per request | Preserved |
| 4 MB body limit and the `-32700` collapse | Preserved, now declarative |
| 500 ms drain window and `draining for 500ms before closing` | Preserved, with its measured reasoning |
| `/healthz` guarded by the allow-list | Preserved |

`express@5.2.1` is already resolved in `package-lock.json` transitively through
`@modelcontextprotocol/sdk`, so promoting it changes no installed version. The reason
is recorded in `../decisions/express-for-http-transport.md`.

The `Dockerfile` is not modified. It already runs `npm ci`, exposes 3000, and already
documents `GET /healthz` and `POST /mcp`.

## Out of scope

The `Dockerfile`, the tool surface and `content/**`, the stdio transport, the version,
and the release log.

## Test counts

| Point | Tests | Pass | Fail |
|---|---|---|---|
| Baseline, before any change | 29 | 29 | 0 |

---

### Task 1 — `chore/express-cluster-plan`

Created this record with the confirmed task list, before any of the work. Registered in
[`.agents/index/memory-index.md`](../../index/memory-index.md) in this commit.

Task 2 branches from this branch and adds its own entry here in its own commit.

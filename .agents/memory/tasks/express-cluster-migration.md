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

**Written before any of the work, and kept as the before-picture.** For the state after
each task see [`../state/repository-state.md`](../state/repository-state.md).

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
| After task 2 — express | 37 | 37 | 0 |
| After task 3 — cluster | 45 | 45 | 0 |

---

### Task 1 — `chore/express-cluster-plan`

Created this record with the confirmed task list, before any of the work. Registered in
[`.agents/index/memory-index.md`](../../index/memory-index.md) in this commit.

---

### Task 2 — `feat/express-transport`

`node:http` → express at `POST /mcp`, and the hand-rolled guard → the SDK's.

**37 tests, 37 pass, 0 fail** (from 29). Eight new, one rewritten.

| What | Notes |
|---|---|
| `express@^5.2.1` added to `dependencies` | `npm ls express` before the change showed it already resolved through `@modelcontextprotocol/sdk`; after, one hoisted `5.2.1` serves both. The lockfile diff is the direct-dependency marking and one line, and **no installed version moved**. |
| The template's root `name`/`bin` in the lockfile | Reverted, as [`../state/repository-state.md`](../state/repository-state.md) says to. `npm install --package-lock-only` rewrites those four lines every time; they are not part of this change. |
| `src/app.js` | New. A pure factory: `POST /mcp`, `GET /healthz`, a 405 on any other method at `/mcp`, a 404 catch-all, and a four-argument error handler collapsing `entity.too.large` and `entity.parse.failed` into 400 / `-32700`. It does not listen. |
| `src/index.js` | The HTTP branch is now `createApp().listen(port, host, …)`. `readBody`, `rpcError` and `hostName()` are gone. The startup line, the `all interfaces` bind wording, the 500 ms drain window and its measured reasoning are byte-for-byte what they were. |
| `hostHeaderValidation` | Mounted natively, above the body parser and above every route, **only when the list is non-empty**. |
| `BODY_LIMIT_BYTES` | Exported and pinned to `4 * 1024 * 1024` by a test, so a limit that grew would fail rather than pass every boundary test. |
| `X-Powered-By` | Disabled, asserted on a served route, the 404 and the 405. |

#### What the guard convergence actually changed, re-measured here

`test/http.test.js` asserted `/Host not allowed/` and now asserts
`/Invalid Host: evil\.example\.com/`, the SDK's own message, in the same commit as the
guard change it describes. Status `403` and code `-32000` are unchanged.

Two edge cases the hand-rolled parser did not have separately are asserted now: an
unparseable `Host` is `Invalid Host header: …`, and a request with **no** `Host` is
`Missing Host header`.

The second one needed a raw socket, and the reason is worth carrying forward:
**over HTTP/1.1 that request never reaches the guard.** `node:http` synthesises a
`Host` for every HTTP/1.1 request, refuses an explicitly empty one by substituting the
address it dialled, and its own parser answers a Host-less HTTP/1.1 request with a
`400` before express runs. Only an HTTP/1.0 request line on a bare socket puts a
Host-less request in front of the middleware. Both shapes are asserted, separately, so
the suite does not imply a guarantee the HTTP/1.1 path does not have.

#### The guard being off, in all three forms

`absent`, `""` and `" , , "` are asserted **as three servers**, each one serving
`anything.example.com` and reaching the route table at `/mcp`, each one printing
`allow-list is off - MCP_ALLOWED_HOSTS is unset`. This was the one coverage gap the
plan assumed was already there; it was not, and the owner's explicit instruction is now
asserted in the form it was given.

#### Not done, and why

- **A test that occupies the port to force workers to fail** was not written. In this
  environment a child binds a port its parent already holds, successfully, while the
  parent keeps serving, so such a test would pass for the wrong reason. The failure it
  was meant to catch — a worker that cannot bind and what the primary does about it —
  is **uncovered**, and the only way to close it is a mechanism that does not exist
  here. Task 3 records it again against the cluster.
- **The Docker image was not built.** `Dockerfile` is untouched and still has never
  been built, so `npm ci` inside it remains unproven even though `npm ci` succeeds on
  the host.

---

### Task 3 — `feat/cluster-workers`

A `node:cluster` primary forking workers onto the one `PORT`.

**45 tests, 45 pass, 0 fail** (from 37). Eight new.

| What | Notes |
|---|---|
| `src/index.js` | `startPrimary()` and `startWorker()`. The primary forks and binds nothing; each worker runs the same `createApp().listen(port, host, …)` as before, so the shared handle and the round-robin scheduler do the distribution. |
| `workerCount()` | `MCP_CLUSTER_WORKERS` when it parses to an integer `>= 1`, otherwise `Math.max(1, availableParallelism())`. It returns the **source** as well, because the no-fork startup line names it and naming the variable when the number came from the CPU count would describe a variable nobody set. |
| `disconnect` | A worker exits `0` when its primary is gone. `SIGKILL` cannot be caught or forwarded, so the IPC channel closing is the only signal there is. |
| The drain window | Unchanged: 500 ms, `draining for 500ms before closing`, with the measured reasoning intact. A cluster changes how many requests are in flight, not how long one takes. |
| The primary's own line | `${SERVER_ID} ${version} SIGTERM, draining 2 worker(s)`. Distinct from the worker's line on purpose — the primary holds no listener, so it has no 500 ms window of its own to announce. |
| `cli.js --help` | `MCP_CLUSTER_WORKERS` added. `MCP_ALLOWED_HOSTS` is still missing from that block; it was missing before this task and adding it was not in scope. Reported below. |

#### The `/proc` worker-pid test

It works here, Linux-only with an explicit skip elsewhere, exactly as in the reference.
It reads `/proc/<pid>/task/<pid>/children` because the suite knows the primary's pid —
it spawned it — but not its workers', and the startup line is pinned as text by other
tests. Killing a worker with `child.kill(pid, …)` would silently kill the *primary*
instead, so it is `process.kill(workers[0], "SIGKILL")`.

#### The one test that could not be written here

**The port-occupier test does not work in this environment, and was not written.** The
intent is to hold the port in a parent and prove what a worker does when its bind fails.
It cannot be done here: a child process binds a port its parent already holds,
successfully, while the parent keeps serving. A test written that way would pass for the
wrong reason, so the failure it was meant to catch — what a worker does when it cannot
bind, and what the primary does about it — is **uncovered**. The primary's restart
counter and its give-up line (`a worker exited … N times, not restarting it`, then
`exit 1`) are therefore **untested**. Closing this needs a mechanism this environment
does not have, not more effort on the same idea.

#### Memory across many requests: measured, and not what the plan expected

`verification.md` asks that a worker not grow in memory across many requests. It does
grow, and it grew the same way before either commit:

| Build | Idle | 500 | 1000 | 2000 | 3000 |
|---|---|---|---|---|---|
| `node:http` baseline (`b5d5f6b`) | 90 MB | 117 MB | 183 MB | 205 MB | 241 MB |
| express + cluster | 98 MB | 122 MB | 188 MB | 210 MB | 258 MB |

The same shape on both, so it is a property of building a fresh `McpServer` per
request — the statelessness the plan requires — and not of express, and not of the
cluster. RSS is not a leak test: V8 grows its heap and collects lazily, and this
measurement has no forced collection in it. So this is **reported, not diagnosed**, no
test asserts it, and the verification item is recorded as **not met** rather than ticked.
Diagnosing it would mean a heap profile, which is a different piece of work and is not
this task's.

#### For the owner

- `MCP_CLUSTER_WORKERS=0` falls back to the CPU count rather than meaning "no workers".
  That follows the plan's `>= 1`; the reference implementation used `>= 0`, where `0`
  would have meant no fork. Both are defensible and they differ only at `0`, which is
  the one value nobody sets on purpose.
- `src/cli.js --help` lists every environment variable **except** `MCP_ALLOWED_HOSTS`.
  That gap predates this task and was not in scope to close; it is a one-line fix.

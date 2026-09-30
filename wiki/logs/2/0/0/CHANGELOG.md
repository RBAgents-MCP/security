# 2.0.0

**Released:** 2026-09-30

The HTTP transport becomes an express application, a `node:cluster` primary forks
workers that share the one `PORT`, and the hand-rolled `Host` guard is replaced by the
SDK's `hostHeaderValidation` middleware.

**This is a major version, and the guard is the reason.** This is the only repository of
the five that did not already use the SDK middleware, so it is the only one where
"preserve this exact security logic" and "converge on the SDK middleware" could not both
hold. The owner's instruction was explicit that unset or empty must mean the guard is
completely OFF; that property is kept exactly. What changes is the refusal body, and a
caller matching on the message text sees a different string.

## Security

- **The `MCP_ALLOWED_HOSTS` guard is now the SDK's `hostHeaderValidation`**, and the
  hand-rolled guard is gone.

  **Kept — the property that matters.** Unset, empty, or separators-only → the
  middleware is **not mounted at all**, every request is served, and the startup line
  still announces it either way, because silence is indistinguishable from a guard that
  is working. That is the owner's instruction on this point and it is honoured without
  qualification.

  **Changed — the refusal body and two edge cases:**

  | Case | Before | After |
  |---|---|---|
  | host not on the list | `Host not allowed: evil.test` | `Invalid Host: evil.test` |
  | header absent entirely | `Host not allowed: (none)` | `Missing Host header` |
  | unparseable header | fell through to the not-allowed branch | `Invalid Host header: …` |

  The status (`403`) and the JSON-RPC code (`-32000`) are unchanged, so no client
  distinguishes success from failure differently than before. A client that matched on
  the *message text* will not. The third row is a genuine improvement: an unparseable
  header used to fall through to the not-allowed branch and report a host that was
  never parsed, and now says what actually happened.

- The guard is mounted above the body parser and above every route, `/healthz`
  included.

## Added

- **Cluster workers.** The HTTP transport forks `MCP_CLUSTER_WORKERS` processes —
  `os.availableParallelism()` by default — each binding the same `PORT` through the
  cluster's shared handle, so the kernel's round-robin scheduler does the
  distribution. `MCP_CLUSTER_WORKERS=1` means no fork at all, which is what makes it
  bisectable against the previous commit. The primary binds nothing, so the startup line
  prints once per worker; it relays the signal and waits for the last worker, and
  workers exit on `disconnect`.

  **stdio never forks.** stdout is the JSON-RPC channel there, and a worker's copy of
  it would corrupt the stream.

## Changed

- **The transport is an express application.** `src/index.js` no longer builds a
  `node:http` server and no longer hand-parses request bodies. The application is
  `src/app.js`, and the MCP endpoint is strictly `POST /mcp`, with `GET /healthz`
  preserved.
- `express` is a direct dependency, pinned to the version the lockfile already resolved.
- Docs: `wiki/information/architecture.md`, `wiki/environments/env.md`,
  `wiki/environments/docker.md`, `wiki/environments/setup.md`, `README.md`, the
  repository rule, and the repository map.

## What did not change

- **The tool surface.** The three tools generated from `content/` at boot are the same
  three, with the same names and the same no-argument shape. This release is about the
  transport and the guard, not the surface.
- The 4 MB body limit and the existing JSON-RPC error shapes.
- The `Dockerfile`, which no commit in this migration modified. It already runs
  `npm ci`, exposes 3000, and already documents `GET /healthz` and `POST /mcp`, so
  nothing in it is made false by this change.

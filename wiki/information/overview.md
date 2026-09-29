# Overview

`rbagents-security` is a **dual-purpose** package: the same implementation is reachable as a
terminal command and as an MCP server. It serves one thing — the Roblox security set — and it serves
it read-only.

## The two surfaces

| Surface | Bin | Who uses it |
|---|---|---|
| CLI | `rbagents-security` | A person running it by hand or from a script |
| MCP server | `rbagents-security-server` | An MCP client, an editor, an agent, or a connector |

Both share one implementation and one tool list, so a result produced through one is
identical to the same result produced through the other. `npm test` pins that agreement.

## The three tools

One tool per file in the set, generated from `content/` at boot. **None takes an argument.**

| Tool | File | Returns |
|---|---|---|
| `roblox_security_index` | `index/roblox-security-index.md` | The router |
| `trust_boundaries` | `roblox/security/trust-boundaries.md` | The convention, verbatim |
| `zero_trust_networking` | `roblox/security/zero-trust-networking.md` | The convention, verbatim |

A caller reads the three names in `tools/list` and picks. Each tool serves its file whole,
frontmatter included, byte-identical to disk.

With a set this small the tool list *is* the manifest: a caller can see everything this
server offers without calling it, and there is no argument a caller could get wrong.

## Read-only, structurally

The server has no write path. No tool accepts a verb, no tool takes a credential, and no
tool opens a socket. The code that would write is absent rather than disabled, which is
what makes "pointing a repository at this server cannot mutate the set" a property of the
code rather than a configuration someone can change.

The read-only claim is now stronger than a guard: **there is no path argument, so there is
nothing to traverse with.** The whole set is read once at import, and a tool call is a
memory lookup — no filesystem I/O happens while a caller is on the line.

## What ships

* An MCP server over **stdio** and **streamable HTTP**, with a `/healthz` endpoint on the
  HTTP transport.
* A CLI with `help`, `version`, `tools`, and `serve`.
* A container image — the same `src/` and `content/` on a pinned Node runtime, running as
  a non-root user. See [`../environments/docker.md`](../environments/docker.md).
* A tool layer generated from `content/`: adding a markdown file to the set is what adds a
  tool, and a name that cannot be derived is a startup error rather than a broken tool.
* A test suite covering the file-to-tool bijection in both directions, the name derivation,
  that no tool declares an input schema, that the served text equals the text on disk, the
  structural claim that no tool takes a verb or a credential, and — over a real socket,
  against the real process — that a call cannot be steered, the 4 MiB body cap, the `Host`
  allow-list, and clean shutdown.

## Serving it over HTTP

The HTTP transport is unauthenticated by design, because there is nothing to
authenticate: the answer to any request is a file out of `content/`, and no tool holds a
credential or reaches a network.

That covers the **tools**. The **process** still listens, and the one guard in front of
it — `MCP_ALLOWED_HOSTS`, a `Host` header allow-list — is **off when unset** and says so
on stderr at startup. See [`../environments/env.md`](../environments/env.md).

## Requirements

Node.js 20 or newer. Two dependencies (`@modelcontextprotocol/sdk`, `zod`), and **no
build step** — the package ships source and Node runs it directly. The set's frontmatter
is read without a YAML dependency, so no parser is added to serve it.

## Related pages

* [`architecture.md`](architecture.md) — how the pieces fit together.
* [`../environments/setup.md`](../environments/setup.md) — installing and running it.
* [`../environments/env.md`](../environments/env.md) — environment variables.
* [`../environments/docker.md`](../environments/docker.md) — running it as an image.

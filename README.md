# rbagents-security

The Roblox security instruction set, served read-only over MCP.

- **Organization:** `RBAgents-MCP`
- **Repository:** `security`
- **Server ID:** `rbagents-security`
- **Package:** `@rbagents-mcp/security`
- **Dual-purpose:** a CLI (`rbagents-security`) and an MCP server
  (`rbagents-security-server`).

The set is two files: **client zero-trust** and **trust boundaries**. Written once and
served to every Roblox repository. One implementation behind two surfaces, so a result
produced through the CLI is identical to the same result produced through an MCP client.
Node.js 20+, ESM, no build step.

## The one tool

| Tool | Parameters | Returns |
|---|---|---|
| `roblox_security_instruction` | `path` (string) | One file from `content/`, verbatim |

Read `index/roblox-security-index.md` first. It routes the two files by the question you
are trying to answer.

There is no write path. No tool accepts a verb, no tool takes a credential, and no tool
reaches a network. The code that would write is absent rather than disabled, so pointing a
repository at this server cannot mutate the set.

## Why this exists separately

A repository whose whole scope is *do not trust the client* should not ship a tool that
summarises or searches an external service on a caller's behalf with a stored key. That is
the sharpest reason the four inherited sample tools are gone from this repository.

## Which servers a Roblox repository resolves

| Server | Holds | Required |
|---|---|---|
| `lxagents-agents-base` | Branch strategy, commit conventions, task workflow, pull requests | **Yes — every repository** |
| `rbagents-shared-instruction` | Roblox development conventions — Luau, Rojo, package architecture, data stores, auras, naming | Roblox repositories |
| `rbagents-security` (this one) | The two files below | Roblox repositories |
| `lxagents-security` | Language-agnostic web security — python, javascript/typescript, go | Only with a web backend |

The two Roblox security files are **also** served by `rbagents-shared-instruction`, because
they belong to the Roblox development set there. A repository can read them through either
server; the overlap is deliberate, so installing only the development set still gets the
security rules.

## The set

```
content/
  index/roblox-security-index.md              the router
  roblox/security/
    zero-trust-networking.md                  validate every payload, before the state change
    trust-boundaries.md                       what the client may ask for at all
```

## Quick start

```bash
npm install
npm test
npm run cli -- tools
npm start
```

No key. The server starts and answers with nothing set. There are four optional
environment variables — `MCP_TRANSPORT`, `PORT`, `HOST`, and `MCP_ALLOWED_HOSTS` — and
all four have a working default.

## Register it

| Transport | How |
|---|---|
| Local stdio | `command: node`, `args: ["src/index.js"]`, `cwd:` this checkout |
| Local HTTP | `npm run start:http`, then `http://localhost:3000/mcp` |
| Container | `docker build -t rbagents-security .` then `docker run --rm -p 3000:3000 -e MCP_TRANSPORT=http rbagents-security` — see [`wiki/environments/docker.md`](wiki/environments/docker.md) |
| Remote | Settings → Connectors → Add custom connector → `https://<host>/mcp` |

The `/mcp` path is not optional on either HTTP form.

## Security note — the one exception

> **No tool takes a credential, and no tool opens a socket.** That is what makes the set
> safe to serve to anyone who can reach the process: every answer comes out of
> `content/`, and there is no stored secret to obtain.
>
> **The process itself does listen,** on the HTTP transport. `MCP_ALLOWED_HOSTS` is a
> comma-separated allow-list of `Host` header values guarding that listener against DNS
> rebinding — a page in a browser being redirected at your loopback or container
> address. It is worth setting here, because a container binds every interface, which is
> precisely the deployment where the protection is off by default.
>
> **An empty value means the guard is off.** `MCP_ALLOWED_HOSTS` unset, set to `""`, or
> set to commas and spaces all mean the same thing: no allow-list is installed and every
> `Host` is accepted. That default is deliberate — a wrong list refuses every request,
> which reads as a broken deployment rather than a misconfigured one — so the server
> installs no list and says so on stderr at startup:
>
> ```text
> rbagents-security 0.1.0 serving over http on all interfaces:3000/mcp - Host allow-list is off - MCP_ALLOWED_HOSTS is unset
> ```
>
> If you see "allow-list is off" in a log, you are looking at a deployment with no
> rebinding protection, whatever the configuration appears to say. Full reference:
> [`wiki/environments/env.md`](wiki/environments/env.md).

## Documentation

- [`wiki/information/overview.md`](wiki/information/overview.md) — what this project is.
- [`wiki/information/architecture.md`](wiki/information/architecture.md) — how the pieces
  fit together.
- [`wiki/environments/setup.md`](wiki/environments/setup.md) — installing and running
  both modes.
- [`wiki/environments/env.md`](wiki/environments/env.md) — environment variables.
- [`wiki/environments/docker.md`](wiki/environments/docker.md) — running as a container
  image.

Full map: [`.agents/index/project-wiki-index.md`](.agents/index/project-wiki-index.md).

## Working with agents

Start at [`AGENTS.md`](AGENTS.md). Shared conventions — branching, commits, pull
requests, the task workflow — are served by the `lxagents-agents-base` MCP connector and
are not stored in this repository.

## Provenance

The two files under `content/roblox/security/` are copied verbatim from the workspace
`roblox` set with their frontmatter intact. A convention change belongs there first; this
repository is a delivery surface for it, not its editor.

## License

MIT — see [`LICENSE`](LICENSE).

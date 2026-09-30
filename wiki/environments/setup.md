# Local Setup

`rbagents-security` is **dual-purpose**. The same code is reachable two ways:

| Mode | What it is | Who uses it |
|---|---|---|
| **CLI mode** | A terminal command | A person running it by hand or from a script |
| **Server mode** | An MCP server over stdio or streamable HTTP | An MCP client, an editor, an agent, or a connector |

Both modes share one implementation, so a result produced in one is identical to the
same result produced in the other.

## Requirements

Node.js 20 or newer. There is no build step.

```bash
npm install
npm test
```

Three dependencies: `@modelcontextprotocol/sdk`, `express`, and `zod`.

## No authentication

Nothing here reaches an external service, so there is **no key to set**. There are
five environment variables, and all of them are optional — the server starts, lists its
three tools, and answers every request with none of them set. Full list:
[`env.md`](env.md).

Three of them are worth knowing about before you expose this over HTTP rather than
stdio: `HOST` decides which interface the listener binds, `MCP_ALLOWED_HOSTS` is a
`Host` header allow-list that is **off when unset**, and `MCP_CLUSTER_WORKERS` decides
how many processes serve HTTP — one per CPU by default, and `1` for none at all.

## CLI mode

### Install

```bash
# From a checkout, for development
npm install
npm link

# Or globally, from the registry
npm install -g @rbagents-mcp/security
```

Without installing anything:

```bash
node src/cli.js --help
npm run cli -- --help
```

### Use

```bash
rbagents-security --help
rbagents-security --version
rbagents-security tools
```

`tools` prints every registered tool with its description:

```text
roblox_security_index  Router for the Roblox security set — two files, on the client trust boundary. Read this first.
trust_boundaries       What the client may ask for versus what only the server may decide, where secrets may live, and the shape of an OnServerEvent handler.
zero_trust_networking  The client is untrusted — validate every RemoteEvent and RemoteFunction payload on the server before any state changes.
```

The list comes from `listTools()` in `src/server.js` — the same list the MCP server
registers — so the two surfaces cannot disagree. It is generated from `content/`, so it
has no arguments: a tool name is the whole call.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | The request was understood but could not be satisfied |
| `2` | The command line itself was wrong |

## Server mode

### Install

An MCP client spawns the server as a subprocess, so installing it means pointing the
client at it. Either bin works: `rbagents-security-server` is the server directly, and
`rbagents-security serve` reaches the same server through the CLI.

```json
{
  "mcpServers": {
    "rbagents-security": {
      "command": "node",
      "args": ["src/index.js"],
      "cwd": "/path/to/security"
    }
  }
}
```

Once the package is installed globally, the bin can be named directly instead:

```json
{
  "mcpServers": {
    "rbagents-security": {
      "command": "rbagents-security-server"
    }
  }
}
```

For a remote connector, point the client at `https://<host>/mcp`, including the
`/mcp` path.

### Run

```bash
# stdio
npm start
rbagents-security serve --stdio

# streamable HTTP
npm run start:http
rbagents-security serve --http --port 3000
```

Check it is up:

```bash
curl -s http://localhost:3000/healthz
```

### Inspect it

```bash
npm run inspect
```

This runs the MCP Inspector against the stdio server, listing every tool and letting
you call them.

### stdout belongs to the protocol

On the stdio transport, stdout **is** the JSON-RPC channel. Logging goes to stderr,
and `serve` prints nothing of its own. Only CLI commands write to stdout.

A `console.log` on the server path is a bug that corrupts the protocol stream.

## Container mode

The server also ships as a container image — the same `src/` and `content/`, on a
pinned Node runtime, as a non-root process.

```bash
docker build -t rbagents-security:2.0.0 .

# stdio
docker run --rm -i rbagents-security:2.0.0

# streamable HTTP
docker run --rm -p 3000:3000 -e MCP_TRANSPORT=http rbagents-security:2.0.0
curl -s http://localhost:3000/healthz
```

`-i` is required on the stdio form, and `-p` is what publishes the port on the HTTP
form — neither failure is loud. The image has never been built; [`docker.md`](docker.md)
carries the full detail and that caveat.

## Related pages

- [`env.md`](env.md) — every environment variable this project reads
- [`docker.md`](docker.md) — running the server as a container image
- [`../information/overview.md`](../information/overview.md) — what this project is
- [`../information/architecture.md`](../information/architecture.md) — how the pieces fit
- [`README.md`](../../README.md)

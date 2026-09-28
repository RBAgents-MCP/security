# Local Setup

`@mcagents-mcp/template` is **dual-purpose**. The same code is reachable two ways:

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

Two dependencies: `@modelcontextprotocol/sdk` and `zod`.

## Authentication

Tools that need authentication read one server-wide key from `API_KEY`:

```bash
export API_KEY="your-key-here"
```

Leave it unset and the server still starts and still lists every tool — only calling an
authenticated tool fails, with a message naming the tool and the variable. Full list of
variables: [`env.md`](env.md).

## CLI mode

### Install

```bash
# From a checkout, for development
npm install
npm link

# Or globally, from the registry
npm install -g @mcagents-mcp/template
```

Without installing anything:

```bash
node src/cli.js --help
npm run cli -- --help
```

### Use

```bash
template --help
template --version
template tools
```

`tools` prints every registered tool with its description:

```text
get_server_time     Return the server's current time as an ISO 8601 timestamp in UTC. …
get_secure_summary  Return a short authenticated status summary. …
calculate_sum       Add two numbers and return the sum. Requires no API key.
search_secure_data  Search the protected dataset and return matching records. …
```

The list comes from `listTools()` in `src/server.js` — the same list the MCP server
registers — so the two surfaces cannot disagree.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | The request was understood but could not be satisfied |
| `2` | The command line itself was wrong |

## Server mode

### Install

An MCP client spawns the server as a subprocess, so installing it means pointing the
client at it. Either bin works: `template-server` is the server directly, and
`template serve` reaches the same server through the CLI.

```json
{
  "mcpServers": {
    "template": {
      "command": "node",
      "args": ["src/index.js"],
      "cwd": "/path/to/template"
    }
  }
}
```

Once the package is installed globally, the bin can be named directly instead:

```json
{
  "mcpServers": {
    "template": {
      "command": "template-server"
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
template serve --stdio

# streamable HTTP
npm run start:http
template serve --http --port 3000
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

## Related pages

- [`env.md`](env.md) — every environment variable this project reads
- [`../information/overview.md`](../information/overview.md) — what this project is
- [`../information/architecture.md`](../information/architecture.md) — how the pieces fit
- [`README.md`](../../README.md)

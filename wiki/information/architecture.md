# Architecture

Four source files and a folder of tools. There is no framework, no build step, and no
code generation.

```
src/
  index.js     entry point: picks a transport, owns the HTTP server
  server.js    builds the McpServer, registers every tool, exports listTools()
  cli.js       the CLI: help, version, tools, serve
  version.js   reads the version out of package.json at import
  tools/       one file per tool
```

## Entry point and transports

`src/index.js` reads `MCP_TRANSPORT` and serves either way:

* **stdio** (default) — one `McpServer` connected to a `StdioServerTransport` for the
  life of the process.
* **streamable HTTP** — a plain `node:http` server exposing `GET /healthz` and
  `POST /mcp`.

The HTTP transport is **stateless**: a fresh `McpServer` and transport are built for
each request and closed when the response closes. That is deliberate — `McpServer`
holds per-connection state, so hoisting one to module scope would leak state between
unrelated callers.

### stdout belongs to the protocol

On stdio, stdout **is** the JSON-RPC channel. Server-side logging goes to stderr and
`serve` prints nothing of its own; only CLI commands write to stdout. A `console.log`
on the server path corrupts the stream, and the client reports a parse error that
points nowhere useful.

## The tool layer

Each tool is one file at `src/tools/{tool_name}.js`, exporting a `config` and a
`handler`:

```js
export const config = {
  name: "calculate_sum",
  description: "Add two numbers and return the sum. Requires no API key.",
  schema: {                              // optional
    a: z.number().describe("The first addend."),
    b: z.number().describe("The second addend."),
  },
};

export async function handler({ a, b }) {
  return { content: [{ type: "text", text: String(a + b) }] };
}

export default { config, handler };
```

`src/server.js` imports each module individually, collects them into one
`TOOL_MODULES` array, and registers each:

```js
server.tool(config.name, config.description, config.schema, handler);
```

A tool that declares no `schema` is registered with the three-argument form instead.

`schema` is a **zod raw shape** — a plain object of validators, not a `z.object(...)`.
The MCP SDK wraps it itself and converts it to the JSON Schema the client sees;
wrapping it first produces a tool that advertises no parameters and receives none.

## Authentication

There is one key for the whole server, `process.env.API_KEY`, and it is read **inside
the handler** of each tool that needs it:

```js
const apiKey = process.env.API_KEY;
if (!apiKey) throw new Error("search_secure_data requires an API key. Set …");
```

Reading it at call time rather than at import means a process that sets the key after
startup still works, and it keeps the stateless HTTP path correct — the module cache
outlives any single request.

Registration never depends on the key. Every tool is advertised whether or not one is
set, because a server that hides its authenticated tools reports "no such tool", which
is indistinguishable from the tool not existing.

Thrown errors become error results for the caller; the SDK does that conversion, so a
handler never hand-builds one.

## The parity guarantee

`src/server.js` holds the only tool list. `listTools()` derives name/description pairs
from the same `TOOL_MODULES` array used for registration, and `src/cli.js` prints that
rather than keeping a list of its own.

`test/server.test.js` asserts that what the CLI would print matches what an MCP client
receives from `tools/list`, so the two surfaces cannot drift apart without failing the
suite.

## Related pages

* [`overview.md`](overview.md) — what this project is.
* [`../environments/setup.md`](../environments/setup.md) — running it.

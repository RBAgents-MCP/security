# Architecture

Six source files and a folder of tools. There is no framework, no build step, and no
code generation.

```
src/
  index.js     entry point: picks a transport, owns the HTTP server
  server.js    builds the McpServer, registers every tool, exports listTools()
  content.js   resolves a path inside content/, with the traversal defence
  cli.js       the CLI: help, version, tools, serve
  version.js   reads the version out of package.json at import
  tools/       one file per tool
content/       the published set
Dockerfile     the same two, on a pinned runtime
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
unrelated callers. `test/http.test.js` asserts it with two simultaneous calls for
different paths, each getting its own answer.

Three guards sit in front of `/mcp`, all in `src/index.js`, all off by default:

* **`HOST`** — which interface the listener binds. `0.0.0.0` by default, so a
  container is reachable on every interface unless told otherwise. This is a
  deployment decision, not a security control.
* **`MCP_ALLOWED_HOSTS`** — a comma-separated `Host` header allow-list. **Unset means
  no list is installed**, and the startup line on stderr says so, because silence is
  indistinguishable from a guard that is working. Matching ignores the port, so one
  hostname survives a proxy, a load balancer, and a container port mapping.
* **A 4 MiB body cap** — the only bound on what an unauthenticated caller can make
  the process hold in memory.

On `SIGTERM` and `SIGINT` the listener drains for a short window and then closes what
is still open, because `close()` alone waits on open connections and a keep-alive
client would otherwise hold the process until the runtime killed it.

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
  name: "the Roblox security set",
  description: "Read one convention from the set by path, e.g. 'index/roblox-security-index.md'…",
  schema: {                              // optional
    path: z.string().describe("Path inside the set, e.g. 'index/roblox-security-index.md'. Never a leading slash, never '..'."),
  },
};

export async function handler({ path }) {
  const text = await readSetFile(path);
  if (text === null) return { content: [{ type: "text", text: `not found: ${path}` }] };
  return { content: [{ type: "text", text }] };
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

## Reading from the set

Every served file is resolved inside `src/content.js`, and the boundary is the constant
`CONTENT_DIR` rather than anything a caller passed in.

`readSetFile` rejects a `..` segment **before** it calls the filesystem. A path that
reaches `fs` with a `..` in it has already been resolved against the process working
directory, so a check that runs afterwards is checking a value the caller already
influenced. It then confirms the resolved path is still inside `CONTENT_DIR` — redundant
by design, so that weakening the first check cannot silently widen what is reachable.

An unreadable or unknown path returns `null`, which the tool turns into `not found` as
ordinary content. A traversal attempt and a typo are indistinguishable from outside,
which is the point. A thrown error would be distinguishable.

## Authentication

**No tool in this repository reads a credential, and no tool opens a socket.** That is
the reason the set is safe to serve to anyone who can reach the process: every answer
comes out of `content/`, nothing goes out to a network, and there is no stored secret
for a caller to obtain.

**The process does listen, on the HTTP transport.** Those are different claims and
neither implies the other. "No tool opens a socket" describes the code that answers a
request; it does not describe what the process does with a connection that arrives. If
you deploy this over HTTP, something is reachable, and the question worth asking is what
stands in front of it — a `Host` allow-list, a reverse proxy, a network boundary, or
nothing at all. `MCP_ALLOWED_HOSTS` being unset means the first of those is absent.

The template this repository was scaffolded from took one server-wide `API_KEY` and read
it inside the handler of each tool that needed it. That pattern is still recorded in
[`.agents/rules/secrets.md`](../../../.agents/rules/secrets.md) for a tool that does
need one — the requirement is to read it at call time rather than at import, and never to
make registration depend on it.

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
* [`../environments/docker.md`](../environments/docker.md) — running it as an image.

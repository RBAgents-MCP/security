# Architecture

Six source files, one of which generates the tool surface. There is no build step.

```
src/
  index.js     entry point: picks a transport, owns the HTTP server
  app.js       the express application, as a pure factory — builds, never listens
  server.js    builds the McpServer, registers every tool, exports listTools()
  cli.js       the CLI: help, version, tools, serve
  version.js   reads the version out of package.json at import
  tools/
    from-content.js  builds one tool per file in content/, at import
content/       the published set
Dockerfile     the same two, on a pinned runtime
```

`app.js` and `index.js` are split on purpose. `app.js` returns an express app and
nothing else — it does not listen. A file that both builds the app and binds a port
cannot be reasoned about without binding one, and `test/http.test.js` starts the real
entry point as a real child process precisely so the port and the process lifetime are
real.

## Entry point and transports

`src/index.js` reads `MCP_TRANSPORT` and serves either way:

* **stdio** (default) — one `McpServer` connected to a `StdioServerTransport` for the
  life of the process.
* **streamable HTTP** — an express application exposing `GET /healthz` and `POST /mcp`.

The HTTP transport is **stateless**: a fresh `McpServer` and transport are built for
each request and closed when the response closes. That is deliberate — `McpServer`
holds per-connection state, so hoisting one to module scope would leak state between
unrelated callers. `test/http.test.js` asserts it with two simultaneous calls for
different tools, each getting its own answer.

Three guards sit in front of `/mcp`, all in `src/app.js`, all off by default:

* **`HOST`** — which interface the listener binds. `0.0.0.0` by default, so a
  container is reachable on every interface unless told otherwise. This is a
  deployment decision, not a security control.
* **`MCP_ALLOWED_HOSTS`** — a comma-separated `Host` header allow-list. **Unset means
  no list is installed**, and the startup line on stderr says so, because silence is
  indistinguishable from a guard that is working. When a list *is* set the check is
  the MCP SDK's own `hostHeaderValidation` middleware, mounted natively by express
  above the body parser and above every route. Matching ignores the port, so one
  hostname survives a proxy, a load balancer, and a container port mapping. A refusal
  is `403` with `-32000` and the SDK's own message — `Invalid Host: <name>`, or
  `Missing Host header` when there is none.
* **A 4 MiB body cap** — the only bound on what an unauthenticated caller can make
  the process hold in memory. An oversized body and a malformed one are both answered
  `400` / `-32700`, which is deliberate: the hand-rolled reader that was replaced
  threw one failure for both, so a client was never taught to expect anything
  different for the second case. `X-Powered-By` is disabled for the same reason the
  allow-list exists: it hands an unauthenticated caller the framework and its version
  for free.

On `SIGTERM` and `SIGINT` the listener drains for a short window and then closes what
is still open, because `close()` alone waits on open connections and a keep-alive
client would otherwise hold the process until the runtime killed it.

### stdout belongs to the protocol

On stdio, stdout **is** the JSON-RPC channel. Server-side logging goes to stderr and
`serve` prints nothing of its own; only CLI commands write to stdout. A `console.log`
on the server path corrupts the stream, and the client reports a parse error that
points nowhere useful.

**This holds on the HTTP branch too, and that is worth being explicit about** — it is
the kind of rule someone later "fixes" on the grounds that HTTP does not use stdout for
anything. It does not, but `src/index.js` is **one process serving both transports**,
branching at line 34, not two entry points that could each make their own choice. The
same process, running the same request handler, would then write to stdout in one mode
and not the other. So the HTTP startup line and the shutdown line go to stderr too, and
`test/http.test.js` asserts stdout stays empty.

## The tool layer

The tool surface is **generated from `content/`**, not declared in code.
`src/tools/from-content.js` walks the set at import and builds one tool per markdown
file:

```js
files.set(name, path);
tools.push({
  config: { name, description: frontmatter.description },
  handler: async () => ({ content: [{ type: "text", text }] }),
});
```

The name is the file's own basename with `.md` dropped, lowercased, and kebab turned to
snake. The description is the file's frontmatter `description:` — the same text a client
would have read by opening the file, so a tool a caller cannot route on is a startup
error rather than a tool with an empty description.

`src/server.js` freezes that array as `TOOL_MODULES` and registers each entry with the
three-argument form:

```js
server.tool(config.name, config.description, handler);
```

There is no schema branch, because no tool declares a schema. That is the design, not an
omission: **there is no argument, so there is no path for a caller to traverse with.**
The three-argument form is what makes the tool layer boring, and a tool that grew an
argument would have to stop being generated to get it.

Two failures are startup errors rather than silent ones: a name that is not a usable MCP
tool name, and two files that derive the same name. The second would otherwise let one
file shadow another, and the error message says which two.

## Reading from the set

Everything is resolved **once, at import**, and a call is a map lookup. There is no
filesystem I/O on the read path, and no argument a caller could have reached the
filesystem with — so a malformed set fails the process at boot rather than surfacing as a
wrong answer to the first caller that needed the file.

`CONTENT_DIR` is resolved from `import.meta.url` inside `from-content.js`, so it does not
depend on the working directory the server happens to be started in.

The file is served whole, frontmatter included, byte-identical to what the set holds. The
frontmatter is part of the published text, not metadata to strip.

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

`src/tools/from-content.js` holds the only tool list, and it is derived from `content/`
rather than written down. `listTools()` derives name/description pairs from the same
`TOOL_MODULES` array used for registration, and `src/cli.js` prints that rather than
keeping a list of its own.

`test/server.test.js` asserts that what the CLI would print matches what an MCP client
receives from `tools/list`, and that the tool list and the files on disk are a bijection
in both directions — so neither surface can drift apart, and neither can the set, without
failing the suite.

## Related pages

* [`overview.md`](overview.md) — what this project is.
* [`../environments/setup.md`](../environments/setup.md) — running it.
* [`../environments/docker.md`](../environments/docker.md) — running it as an image.

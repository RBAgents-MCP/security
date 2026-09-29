# Environment Variables

Three variables, all optional. The server starts with none set and answers every
request.

| Variable | Default | Read by | Effect |
|---|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `src/index.js` | `stdio` or `http` (`streamable-http` is accepted too). |
| `PORT` | `3000` | `src/index.js` | The port the HTTP transport listens on. Ignored on stdio. |
| `HOST` | `0.0.0.0` | `src/index.js` | The interface the HTTP transport binds. Ignored on stdio. |

## There is no `API_KEY`

The template this repository was scaffolded from took one key for tools that reached an
external service. Nothing here reaches an external service, so there is no key, and no
tool reads a credential.

If a future tool needs one, the contract for that is
[`../../../.agents/rules/secrets.md`](../../../.agents/rules/secrets.md): check
`process.env` **inside the handler**, never at module scope, and never as a condition on
whether the tool is registered.

## `MCP_TRANSPORT` and `PORT`

```bash
# stdio (default)
npm start

# streamable HTTP on 3000
npm run start:http

# streamable HTTP on another port
MCP_TRANSPORT=http PORT=8080 node src/index.js

# streamable HTTP on loopback only
MCP_TRANSPORT=http HOST=127.0.0.1 node src/index.js

# the same, through the CLI
rbagents-security serve --http --port 8080 --host 127.0.0.1
```

The CLI's `serve` command sets these variables from its flags, so `--http`, `--stdio`,
`--port`, and `--host` are equivalent to exporting them.

## `HOST` is not a security control

`HOST` decides which interface the listener opens. It does not decide who may reach it,
and it is not authentication: a server bound to `0.0.0.0` inside a container is reachable
from outside that container unless something in front of it stops the traffic.

Binding to `127.0.0.1` is the right move when something proxies to this server, and it is
the only thing it does.

## Related pages

* [`setup.md`](setup.md) — installing and running both modes.
* [`../information/overview.md`](../information/overview.md) — what the project is.

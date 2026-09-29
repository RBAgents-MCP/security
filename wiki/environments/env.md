# Environment Variables

Four variables, all optional. The server starts with none set and answers every
request.

| Variable | Default | Read by | Effect |
|---|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `src/index.js` | `stdio` or `http` (`streamable-http` is accepted too). |
| `PORT` | `3000` | `src/index.js` | The port the HTTP transport listens on. Ignored on stdio. |
| `HOST` | `0.0.0.0` | `src/index.js` | The interface the HTTP transport binds. Ignored on stdio. |
| `MCP_ALLOWED_HOSTS` | unset | `src/app.js` | Comma-separated `Host` header allow-list. **Unset means the guard is off.** HTTP only. |

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

## `MCP_ALLOWED_HOSTS`

```bash
# refuse every request whose Host header is not one of these
MCP_TRANSPORT=http MCP_ALLOWED_HOSTS=security.example.com node src/index.js

# several hosts, in a container that also answers a health check on localhost
MCP_TRANSPORT=http MCP_ALLOWED_HOSTS=security.example.com,localhost,127.0.0.1 node src/index.js
```

### Why an empty value means the guard is off

**This is the part that gets misread.** The variable holds a *list*, so setting it to an
empty string looks like "allow nothing". It does not. An unset variable, an empty string,
and a string of nothing but commas all resolve to the same thing: **no allow-list is
installed and every `Host` is accepted.**

That default is deliberate. A wrong list refuses every request, and a server that
silently rejects all traffic looks like a broken deployment rather than a misconfigured
one. So the server does not guess at a list — it installs none, and it says so on stderr
at startup:

```text
rbagents-security 1.0.0 serving over http on all interfaces:3000/mcp - Host allow-list is off - MCP_ALLOWED_HOSTS is unset
```

Set the variable and that line changes to name the list instead. **If you see "allow-list
is off" in a log you are looking at a deployment with no rebinding protection**, whatever
the configuration file appears to say.

### Why it is needed at all

The attack is DNS rebinding. A page in a browser the user is already visiting can resolve
a hostname to a loopback or private address and make the browser talk to a server on the
user's own network, with the victim's cookies and origin privileges. The `Host` header is
the only part of the request that names the deployment, so validating it against a list
the operator wrote is what breaks the attack.

This matters here more than it would for an authenticated server. There is no credential
to steal from this process, so rebinding does not get anyone anything they did not already
have from reading a public instruction set — but the protection is cheap, it is off unless
asked for, and the deployment this project now ships (`Dockerfile`) binds every interface
by default, which is exactly the shape where the protection is worth turning on.

### Matching is port-agnostic

`MCP_ALLOWED_HOSTS=localhost` accepts `localhost:3000`, `localhost:8080`, and
`localhost`, because a proxy, a load balancer, and a container port mapping each present
a different port for the same server. Write hostnames without ports. An IPv6 literal keeps
its brackets: `[::1]`.

### What a refusal looks like

When a list is set, the check is the MCP SDK's own `hostHeaderValidation` middleware,
mounted by `src/app.js`. Every refusal is `403` with a JSON-RPC error of code `-32000`,
and the message is the SDK's:

| Case | Body |
|---|---|
| `Host` is not on the list | `Invalid Host: <name>` |
| No `Host` header at all | `Missing Host header` |
| `Host` cannot be parsed | `Invalid Host header: <value>` |

The status and the error code are what a client branches on, and they are the same
whatever the cause. Only the message distinguishes them.

### It guards the health check too

`/healthz` is behind the same check, which has an operational consequence: **if you set
an allow-list, an in-container health check must be allowed too.** A `HEALTHCHECK` hitting
`http://localhost:3000/healthz` sends `Host: localhost:3000`, so include `localhost` in the
list or the container reports itself unhealthy while serving correctly.

## Related pages

* [`setup.md`](setup.md) — installing and running both modes.
* [`docker.md`](docker.md) — running the server as a container image, where an unset
  allow-list matters most.
* [`../information/overview.md`](../information/overview.md) — what the project is.

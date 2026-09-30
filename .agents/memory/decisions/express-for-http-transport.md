---
name: memory-decisions-express-for-http-transport
description: Why the HTTP transport moved from node:http to express, and why the hand-rolled Host guard was replaced by the SDK's hostHeaderValidation rather than kept.
---

# Decision - express for the HTTP transport

## Context

The HTTP transport was a `node:http` server with three hand-written pieces around it: a
body reader that counted chunks and threw past a limit, a JSON-RPC error helper, and a
`Host` guard of its own.

That last one was the expensive one, and it is the reason this decision was sharpest
here. The MCP SDK ships `hostHeaderValidation` as express middleware - it refuses by
calling `res.status(code).json(body)` and hands on with `next()` - and a `node:http`
response has neither method. So this repository could not use it and carried a second
implementation instead: `hostName()` to strip the port, an `includes()` check, and a
hand-written 403. The sibling repositories solved the same problem with shims
(`RBAgents-MCP/shared-instruction` with a fake object, `LXAgents-MCP/security` with
methods grafted onto the real response). All three shims existed for one reason.

## Decision

**`src/app.js` builds the express application and returns it. It does not listen.**

`src/index.js` keeps the port, the interface, the transport switch, the startup lines
and the drain window. The split is not tidiness: a file that both builds the app and
binds a port cannot be reasoned about without opening one, and `test/http.test.js`
starts the server as a real child process precisely so that the port and the process
lifetime are real.

`express@^5.2.1` was **already resolved in `package-lock.json`**, transitively through
`@modelcontextprotocol/sdk`, and `npm ls express` after promoting it shows a single
hoisted `express@5.2.1` that both the SDK and this package resolve to. No installed
version moved. The lockfile diff is the direct-dependency marking and one line, which
is the check that would have caught a wrong claim here.

`hostHeaderValidation` is mounted natively:

```js
const hosts = allowedHosts();
if (hosts !== null) {
  app.use(hostHeaderValidation(hosts));
}
```

The hand-rolled parser is deleted, not deprecated. It existed only because there was no
`express`, and leaving it in place with no caller would make the next reader guess
whether it is load-bearing.

## The part that is a preservation, not a rewrite

**The guard is off when `MCP_ALLOWED_HOSTS` is unset, empty, or separators-only, and it
is not mounted at all in that state.** This is not a detail of the SDK's behaviour - it
is a decision about what "unset" means, and it is the decision the owner reaffirmed
while reviewing this migration.

An allow-list that silently refuses every request is a worse failure than an absent one.
A wrong list refuses every request, and a server that rejects all traffic looks like a
broken deployment rather than a misconfigured one. So the server does not guess at a
list: it installs none, and it says so on startup. A control that is off silently reads
as present.

An oversized body and a malformed one are both answered **400 / `-32700`**, because the
hand-rolled reader this replaced threw one failure for both. Splitting them would be a
behaviour change nobody asked for.

## The one behaviour change, stated plainly

The refusal **message** changes, and so do two edge cases the hand-rolled guard had
folded into one. Status (`403`) and JSON-RPC code (`-32000`) do not, so no client
distinguishes success from failure differently:

| Case | Before | After |
|---|---|---|
| host not on the list | `Host not allowed: evil.example.com` | `Invalid Host: evil.example.com` |
| `Host` header absent | `Host not allowed: (none)` | `Missing Host header` |
| `Host` unparseable | falls through to the not-allowed branch | `Invalid Host header: <value>` |

`test/http.test.js` asserted the old message and is updated in the same commit as the
guard change it describes, rather than trailing behind it.

One of those three is narrower than it looks. Over HTTP/1.1 a request with no `Host`
header never reaches the guard at all: Node's own parser requires the header and
answers with a `400` before express runs. The `Missing Host header` branch is reachable
only over HTTP/1.0, and `test/http.test.js` says so by driving it with a raw socket and
asserting the HTTP/1.1 shape separately.

## Consequences

- `X-Powered-By` is disabled, and this is a security control rather than an omission: it
  hands an unauthenticated caller the framework and its version.
- A 404 catches unknown paths and a 405 catches non-`POST` on `/mcp`, both in the
  JSON-RPC envelope, so a client never has to branch on content type to learn it was
  refused.
- The `Dockerfile` is untouched. `npm ci` installs the new dependency and the image
  already exposed the right port, so nothing there needed to change - which is also why
  the image is still marked as never having been built.
- `package-lock.json` still carries the template's root `name` and `bin` on `master`.
  Regenerating it rewrites those four lines as well, and they are still reverted
  before committing, exactly as before; the dependency marking is the only part of the
  diff that belongs in this change.

# Docker

The server runs as a container image. The image is the same code the npm package
ships — `src/` and `content/` and nothing else — on a pinned Node runtime.

> **This image has never been built.** It was written and reviewed as source. No
> `docker build`, `docker run`, or `docker compose` command was executed against it,
> and neither `EXPOSE` nor either run form below has been verified by a build. Treat
> both as written-and-untested until you have run them yourself.

## What a container is for here

`rbagents-security` is a read-only set of convention files. Nothing about serving
them needed a container. What a container adds:

* **A pinned runtime.** `node:22-alpine` instead of whatever `node` the host has.
  The set is read by agents that will not notice a difference, but a server that
  answers differently on two machines will be noticed immediately.
* **A clean dependency tree.** `@modelcontextprotocol/sdk` and `zod`, installed from
  `package-lock.json` at build time. The host's tree never enters the image.
* **A non-root process.** The image runs as the unprivileged `node` user.
* **A network boundary that did not exist before.** A container is the cheapest
  place to put an unauthenticated listener behind something.

That last one is the reason this page exists alongside the HTTP transport. The
listener is not new — `src/index.js` has served streamable HTTP all along — but a
container makes it *reachable*, and reachable is a different property from *bound*.

## Build

```bash
docker build -t rbagents-security:0.1.0 .
```

Tag with the version from `package.json`, not `latest`. This repository's rule is
that a version is changed only with the owner's approval, so the tag should track
that version rather than float.

## Run — stdio

```bash
docker run --rm -i rbagents-security:0.1.0
```

**`-i` is not optional.** Without it the container's stdin is closed, the server sees
EOF, and it exits at once with no error. It presents as a broken image rather than as
a missing flag.

## Run — streamable HTTP

```bash
docker run --rm -p 3000:3000 -e MCP_TRANSPORT=http rbagents-security:0.1.0
curl -s http://localhost:3000/healthz
```

Three things bite here, and every one of them fails quietly rather than loudly:

| | What goes wrong |
|---|---|
| **`-p` is missing** | `EXPOSE 3000` declares a port; it does not publish one. Nothing outside the container reaches `/healthz`, and `curl` hangs. |
| **`-e` is after the image name** | Docker accepts the flag and ignores it. The container serves stdio, `curl` hangs. This is the same shape of confusion as a missing `-i`. |
| **`/mcp` is missing from the client URL** | The SDK answers `http://host:3000/` with "Not found", and a client configured with the port alone reports an unreachable server. |

Transport selection here is an **environment variable**, not a second entry point —
the same `MCP_TRANSPORT` documented in [`env.md`](env.md). There is no separate HTTP
image; the two forms share every byte of payload and differ by one variable.

## The Host allow-list in a container

A container binds every interface, which is exactly the deployment where
[`MCP_ALLOWED_HOSTS`](env.md) is worth setting: the DNS-rebinding protection that
matters least on a loopback-only developer machine matters most here.

```bash
docker run --rm -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e MCP_ALLOWED_HOSTS=security.example.com \
  rbagents-security:0.1.0
```

**Unset means the guard is off** — that is the rule most likely to be misread, and it
is explained in full in [`env.md`](env.md).

One operational consequence worth knowing before you add a health check: **`/healthz`
is behind the same allow-list.** A `HEALTHCHECK` hitting
`http://localhost:3000/healthz` sends `Host: localhost:3000`, so include `localhost`
in the list or the container will report itself unhealthy while serving perfectly
well.

## What is in the image

| Path | Why |
|---|---|
| `src/` | the server and the CLI |
| `content/` | the set — this is the product |
| `package.json`, `package-lock.json` | `npm ci` installs from them |
| `node_modules/` | installed in the image, never copied from the host |

### The image cannot run its own suite

`.dockerignore` excludes `test/`, so **`npm test` cannot run inside the container.**
This is deliberate and not an oversight: the suite is a gate on the repository, not on
the artifact. Run it on the host before you build, not in the image.

### `.gitattributes` is load-bearing here

The repository carries one line, `* text=auto eol=lf`. It is not incidental to a
Dockerfile:

* A CRLF after any instruction in `Dockerfile` fails the build at line 2 with
  `` \r is not a valid separator ``. This project is developed on a Windows filesystem
  under WSL2, where CRLF creep through editor settings is a live risk, not a
  theoretical one.
* A `.dockerignore` with CRLF terminators **does not match the patterns it names**, so
  the build context stays larger than intended instead of failing loudly.
* `package-lock.json` is `COPY`ed and hashed; a line-ending change is a different
  hash.

Deleting that line would not obviously break anything, and the first symptom would be
a build failure that gets misdiagnosed as a bad `Dockerfile`. It stays.

## There is no compose file

A compose file encodes a *deployment* — a network, a volume, a proxy, a set of
environment values. This repository ships an *image*. Which of those a given consumer
needs depends on where they are putting it, and a file committed here would be one
opinion frozen into the repository for every consumer. Write your own.

## Related pages

* [`env.md`](env.md) — every environment variable this project reads.
* [`setup.md`](setup.md) — running it from a checkout.
* [`../information/architecture.md`](../information/architecture.md) — how the pieces fit.

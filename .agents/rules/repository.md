---
name: repository-rules
description: Rules specific to rbagents-security - the dual-surface contract, the stdout ban, the read-only surface, and what must not be introduced.
---

# Repository Rules

`rbagents-security` is a dual-purpose MCP server and CLI over one implementation, and it
serves the Roblox security set from `content/` read-only. Both facts constrain what may be changed
here.

## Mode and shared set

This repository is a **Mode B consumer**. The shared instruction set is resolved
through the `lxagents-agents-base` MCP connector and is never copied into this tree.
See the bootstrap block in [`../../AGENTS.md`](../../AGENTS.md).

## The two surfaces stay in step

The CLI (`rbagents-security`) and the MCP server (`rbagents-security-server`) are two doors onto one
implementation. A tool reachable from one is reachable from the other, with the same name
and the same description.

* Tools are derived in exactly one place: `src/tools/from-content.js`, from `content/`.
  `src/server.js` freezes that list and registers it; it does not declare it.
* `src/cli.js` never maintains its own list - it reads the declaration from
  `src/server.js`.
* `test/server.test.js` pins the agreement. A change that makes the two surfaces
  disagree fails the suite, and that failure is the point.

## Nothing writes to stdout except the CLI

On the stdio transport, stdout **is** the JSON-RPC channel. A stray `console.log` on
the server path corrupts the protocol stream and the client reports a parse error
that names nothing useful.

* Server-side logging goes to stderr.
* `serve` prints nothing of its own.
* Only CLI commands write to stdout.

## Where things go

| Thing | Path |
|---|---|
| The served set, and the source of the tool surface | `content/` |
| Where the tool surface is generated | `src/tools/from-content.js` |
| Where the surface is registered | `src/server.js` |
| CLI commands | `src/cli.js` |
| Transport and entry point | `src/index.js` |
| Tests | `test/{subject}.test.js` |
| The container image | `Dockerfile`, and `.dockerignore` for what it excludes |

## Commands

```bash
npm install       # no build step, Node 20+
npm test          # node --test
npm run cli -- tools
npm start         # stdio
npm run start:http
npm run inspect   # MCP Inspector against the stdio server

docker build -t rbagents-security:0.1.0 .
docker run --rm -i rbagents-security:0.1.0
docker run --rm -p 3000:3000 -e MCP_TRANSPORT=http rbagents-security:0.1.0
```

The image is **not built by this repository's own workflow**. `Dockerfile` and
`.dockerignore` are written and reviewed as source; `.dockerignore` excludes `test/`,
so `npm test` cannot run inside the image either way. Run the suite on the host.

## What must not be introduced

* A build step. This package ships source and is run directly by Node.
* A second source of truth for the tool list. The list is derived from `content/`;
  writing it down anywhere else is a second truth even when the two agree today.
* A per-tool file under `src/tools/`. The surface is generated. A hand-written tool
  would not be in `TOOL_MODULES`, and so would be invisible to `listTools()`, to the
  CLI, and to the bijection test - which is why none can be added without a decision
  that it should exist at all.
* Shared instruction content. If it can be read from `agents://`, it must not exist
  here as a file.
* A write path. No tool may take a verb, a credential, or reach a network. The
  read-only property is structural - the code that would write is absent - and it is
  the property a consuming repository depends on when it points at this server. The
  absence of an **argument** is the same claim one level up: no tool declares an input
  schema, so there is no path for a caller to traverse with.
* A write path through the container. `Dockerfile` is a **new distribution surface**
  for a repository whose defining property is that it is read-only, and it is the one
  place where this repository's code could be shipped somewhere other than an npm
  consumer. That has consequences the rest of this file does not cover: an image is
  built, tagged and pushed from outside this repository, and once it is published it
  is a version of the product that no pull request in this repository governs. Two
  rules follow. **Nothing may be pushed to a registry without the owner asking for
  it** - `AGENTS.md` gates publishing the same way it gates a pull request. And a
  change under `content/` is invisible to a published image until it is rebuilt, so
  the tag on an image must track the version in `package.json` rather than float on
  `latest`.
* An edit to a file under `content/`. Those files are copied from the upstream
  workspace set; the change belongs there, and this repository follows it.

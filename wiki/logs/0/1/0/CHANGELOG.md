# 0.1.0

**Released:** 2026-08-30

The tool layer becomes a directory of independent modules that may declare parameters and
may require an API key, and the repository adopts the LXAgents shared agent instruction
set.

## Added

- `src/tools/`, one file per tool. Each exports a `config` (name, description, optional
  zod schema) and a `handler`, so a tool can be read, reviewed, and deleted on its own.
- Four sample tools covering both axes of the new capability: `get_server_time` (no
  parameters, no key), `get_secure_summary` (no parameters, key required), `calculate_sum`
  (zod parameters, no key), and `search_secure_data` (zod parameters, key required). They
  are deleted when a project is scaffolded from this template.
- Optional parameters via [zod](https://zod.dev), declared as a raw shape and registered
  through `server.tool(name, description, schema, handler)`.
- Optional authentication against one server-wide key, `process.env.API_KEY`, read inside
  the handler so a key set after startup still works.
- `listTools()` in `src/server.js` — the single list both surfaces read.
- The agent instruction system: `AGENTS.md` rewritten as an entry point, plus `.agents/`
  with four local rules, six indexes, the repository map, and seed memory. Shared
  conventions resolve through the `lxagents-agents-base` MCP connector and are not stored
  here.
- Human documentation: `wiki/information/overview.md`,
  `wiki/information/architecture.md`, and `wiki/environments/env.md`.
- `zod` as a direct dependency. It was already resolving through the SDK, but the tools
  import it by name.

## Changed

- `src/cli.js` prints `listTools()` instead of keeping its own list, and computes the
  column width rather than assuming 16 characters, which the longer tool names exceed.
- `src/cli.js` help text gained an `Environment` section for `API_KEY`, `MCP_TRANSPORT`,
  and `PORT`.
- `PROMPT.md` Step 3 now resets the tool layer during scaffolding: delete the samples,
  create `src/tools/ping.js`, register only that, fix the test suite, and run it.
- `README.md` is an overview that points at the wiki rather than restating it, and names
  the organization correctly as `LXAgents-MCP`.
- `wiki/environments/setup.md` documents authentication and shows real `tools` output.
- The test suite grew from one test to ten: surface parity, advertised schemas, argument
  validation, the missing-key failure, the success path, and that the key is never echoed
  back to the caller.

## Removed

- The frozen `TOOLS` array in `src/server.js`, and the single inline `ping` tool it held.
- The "If the connector will not resolve" section of `AGENTS.md`, which told an agent to
  clone the shared instruction set into `./mcps/`. The current
  `agents://rules/mcp-connector.md` forbids cloning or vendoring the set as a workaround,
  and this repository declares no override of that rule.

## Security

- The API key is read from the environment at call time and never logged, never included
  in tool output, and never returned by `/healthz`. A test asserts it does not appear in
  any tool result.
- A missing key produces an error naming the tool and the variable, rather than a silent
  empty result. Tools stay listed when no key is set, so "not authenticated" remains
  distinguishable from "no such tool".

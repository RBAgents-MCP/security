---
name: tool-authoring
description: The contract for adding a tool - one file per tool under src/tools/, the config and handler exports, zod schemas, and registration.
---

# Tool Authoring

One tool is one file. This is what keeps the tool layer reviewable and stops
`src/server.js` growing into the array this layer replaced.

## The surface is read-only

This server has one tool and it is a read. Do not add a tool that takes a verb, a
credential, or a network call.

The property is **structural**: the code that would write is absent, not disabled behind
a check. That is stronger than a permission check on a general-purpose tool, and it is
what a consuming repository depends on when it points at this server — it cannot mutate
the set, because there is nothing here that mutates anything.

## File shape

A tool lives at `src/tools/{tool_name}.js`, where `{tool_name}` is the registered tool
name character for character. It exports two things and a default that pairs them:

```js
import { z } from "zod";

export const config = {
  name: "roblox_security_instruction",
  description: "Read one convention from the set by path, e.g. 'index/roblox-index.md'. Read-only - this tool cannot write.",
  schema: {
    path: z.string().describe("Path inside the set, e.g. 'roblox/language/luau-authoring.md'. Never a leading slash, never '..'."),
  },
};

export async function handler({ path }) {
  const text = await readSetFile(path);
  if (text === null) {
    return { content: [{ type: "text", text: `not found: ${path}` }] };
  }
  return { content: [{ type: "text", text }] };
}

export default { config, handler };
```

| Export | Required | What it is |
|---|---|---|
| `config.name` | yes | The registered tool name. Matches the filename. |
| `config.description` | yes | One line an agent can route on without calling the tool. |
| `config.schema` | no | A **zod raw shape** - a plain object of zod validators. Omit it entirely for a tool that takes no arguments. |
| `handler` | yes | `async (args) => ({ content: [...] })`. Receives the parsed arguments when a schema is declared, and nothing useful when it is not. |
| default | yes | `{ config, handler }`, so `src/server.js` imports one binding per tool. |

## The schema is a raw shape, not a z.object

`server.tool(name, description, schema, handler)` expects a `ZodRawShape`. Pass
`{ a: z.number() }`, never `z.object({ a: z.number() })` - wrapping it produces a tool
whose input schema has no properties and whose handler receives nothing.

Describe every field with `.describe()`. That text is what reaches the calling model as
the parameter's documentation; without it the caller is guessing.

## Registration

`src/server.js` imports each tool module individually and registers it:

```js
server.tool(config.name, config.description, config.schema, handler);
```

A tool with no `config.schema` is registered with the three-argument form instead. Both
forms are in `src/server.js` already - follow whichever matches the tool.

Adding a tool means two edits and nothing else: the new file, and its import plus its
entry in the `TOOL_MODULES` array. Do not add a registration path that bypasses that
array; `listTools()` and the CLI read it, and a tool registered outside it is invisible
to both.

## Authentication

No tool in this repository needs a credential. If one ever did, it checks **inside the
handler** — see [`secrets.md`](secrets.md). Never at module scope, and never as a
condition on whether the tool is registered.

## Paths into `content/`

A tool that reads from the set goes through `readSetFile` in `src/content.js`. Do not call
`fs` directly from a handler: the traversal defence lives in that one place, and a second
path to the filesystem is a second thing to get right.

Return `not found` as ordinary content for an unknown path. That is a lookup miss, not a
server fault, and a thrown error would be indistinguishable from a real failure.

## Errors

Throw a plain `Error` with a message that says what was missing and what to do about
it. The MCP SDK turns a thrown error into an error result for the caller, so there is
no need to hand-build one.

Do not return an error as ordinary text content. A caller cannot tell that apart from a
successful answer.

## Tests

Every tool gets coverage in `test/server.test.js`:

* it appears in `listTools()` and in the client's `tools/list`;
* a tool with a schema has its parameters present in the advertised input schema;
* a tool that requires the API key fails without it and succeeds with it.

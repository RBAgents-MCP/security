---
name: tool-authoring
description: The contract for adding a tool - it is generated from content/, so the real work is authoring a markdown file with a name and a description.
---

# Tool Authoring

**You do not author a tool. You author a markdown file under `content/`, and the tool
is generated from it.** Adding `content/roblox/security/example.md` adds the tool
`example`, registers it, advertises it, and puts it in the CLI's `tools` output — with
no code change and no second file to keep in step.

This rule used to describe hand-writing `src/tools/{name}.js`. It no longer applies to
this repository, and following it would produce a tool no client could find, because
`TOOL_MODULES` is generated rather than assembled.

## What the generator does

`src/tools/from-content.js` walks `content/` once, at import, and builds one tool per
`.md` file:

| Served file | Tool name |
|---|---|
| `index/roblox-security-index.md` | `roblox_security_index` |
| `roblox/security/trust-boundaries.md` | `trust_boundaries` |
| `roblox/security/zero-trust-networking.md` | `zero_trust_networking` |

The name is the **basename**, with `.md` dropped, lowercased, and `-` turned to `_`. The
folder is dropped, so a path's directories never reach the tool name. The description is
the file's frontmatter `description:`, verbatim — the same text a reader gets by opening
the file, which is what makes routing on it work.

## The surface is read-only, and so is the way in

Every tool here is a read. Do not add a file whose purpose is to take a verb, a
credential, or a network call.

The property is **structural**: the code that would write is absent, not disabled behind
a check. That is stronger than a permission check on a general-purpose tool, and it is
what a consuming repository depends on when it points at this server — it cannot mutate
the set, because there is nothing here that mutates anything.

The same is true of the *argument*. No tool declares an input schema, so there is no path
for a caller to traverse with, no verb for a caller to act on, and nothing to write. A
generated tool cannot grow an argument, because there is no per-tool code to grow it in.

## Adding a convention

1. Write the file under `content/`, with frontmatter carrying at least a `name:` and a
   `description:`. The set's own convention also expects `version:` and `author:`.
2. Give it a filename that survives derivation — a name that is a valid MCP tool name
   (`^[a-z][a-z0-9_]{0,63}$` once derived) does not need a rename.
3. Run `npm test` and `npm run cli -- tools`. The bijection test fails if the file did
   not become a tool, and so does the case where its name collides with an existing one.
4. Route to it from `content/index/roblox-security-index.md`, or it is reachable by name
   but a caller will not know that.

**A `description:` that a client cannot route on is a startup error, not a warning.** The
generator throws at import rather than publishing a tool with an empty description.

`content/` is a **delivery surface, not an editor** — see [`repository.md`](repository.md).
A change to a served file belongs upstream in the workspace set and is copied here.

## When a name does not derive cleanly

`NAME_OVERRIDES` in `src/tools/from-content.js` is the documented escape hatch, and it
is **currently empty** — every file in the set falls out of the rule. Two situations
call for it, and both are startup errors rather than silent behaviour:

* a filename that derives a name which is not a valid MCP tool name;
* two files in different folders with the same basename, where the second would silently
  shadow the first.

Adding a row is a deliberate act. The second case has a real instance in this
organisation — `RBAgents-MCP/shared-instruction` serves files of the same two names — and
a namespace prefix was considered and rejected; see
[`../memory/tasks/per-file-tools.md`](../memory/tasks/per-file-tools.md).

## If a tool ever needs an argument

It stops being generated. A per-tool file under `src/tools/`, imported individually into
`TOOL_MODULES` in `src/server.js`, comes back — and with it the four-argument
`server.tool(name, description, schema, handler)` form, where `schema` is a **zod raw
shape** (`{ a: z.number() }`, never `z.object({ ... })`; wrapping it produces a tool that
advertises no parameters and receives none).

That is a large enough change to be worth saying out loud before doing it. It gives back
everything this surface is for.

## Authentication

No tool in this repository needs a credential. If one ever did, it checks **inside the
handler** — see [`secrets.md`](secrets.md). Never at module scope, and never as a
condition on whether the tool is registered.

## Reading from the set

Do not call `fs` from anywhere that answers a call. The set is read once at import, and
a tool call is a map lookup. A second path to the filesystem at call time is a second
thing to get right, in a repository whose read-only property is the thing a consumer
depends on.

## Errors

Throw a plain `Error` with a message that says what was missing and what to do about
it. The MCP SDK turns a thrown error into an error result for the caller, so there is
no need to hand-build one.

Do not return an error as ordinary text content. A caller cannot tell that apart from a
successful answer.

## Tests

The generated surface is covered once, not per file:

* every file in `content/` is a tool, and every tool is a file in `content/` — asserted
  in both directions;
* every tool name is derived from its own filename and is a usable MCP tool name;
* no tool declares an input schema, and none requires an argument;
* every tool serves its file byte for byte, frontmatter included, and the total served
  text equals the total text on disk;
* the index routes every convention, which is what keeps the entry point complete.

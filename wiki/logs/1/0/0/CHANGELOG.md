# 1.0.0

**Released:** 2026-09-29

The tool surface becomes one tool per file in the set, generated from `content/` at boot.
**This is a breaking change to the published surface**: `roblox_security_instruction` is
removed, and a client that called it with a `path` argument has nothing to call. The three
tools that replace it are `roblox_security_index`, `trust_boundaries` and
`zero_trust_networking`.

It is a major version for a second reason. `0.1.0` was inherited from the template and
never described a decision this repository had made; this is the first version whose
surface was chosen rather than received.

## Changed

- **The surface is generated.** `src/tools/from-content.js` walks `content/` once, at
  import, and builds one tool per markdown file. The name is the file's basename with
  `.md` dropped, lowercased and `-` turned to `_`; the description is the file's
  frontmatter `description:`. `src/server.js` no longer declares the surface — it
  freezes the generated one as `TOOL_MODULES` and registers it.
- **Adding a markdown file to `content/` is what adds a tool.** There is no per-tool
  source file to write, and no second list to keep in step.
- The server `instructions` string now names tools that exist. It previously said
  *"Call roblox_security_instruction with a path to read one file"*.
- `src/server.js` registers with the three-argument `server.tool(name, description,
  handler)` form. The `if (config.schema) … else …` branch went with the last schema.

## Removed

- **`roblox_security_instruction`**, and its `path` argument. Not aliased, not
  deprecated: a caller must pick one of the three names.
- **`src/content.js`**, and with it the traversal guard. It rejected a `..` segment
  before any filesystem call and then confirmed containment — careful work defending an
  argument that no longer exists. With no argument there is nothing to traverse with, so
  the guard is not weakened by being removed; it is replaced by the absence of the thing
  it guarded. `CONTENT_DIR` moved to `src/tools/from-content.js`, the one module that
  needs it, resolved from `import.meta.url` rather than the working directory.

## Security

- **The read-only claim is now stronger than a guard.** No tool declares an input
  schema, so there is no path argument to validate, no filesystem I/O on the read path,
  and no request that can reach outside `content/` — the set is read once at boot and a
  call is a map lookup.
- A file that derives an invalid MCP tool name, or two files that derive the same one,
  is a **startup error** rather than a broken tool served until someone called it. The
  error names both files, because a silent shadow is the failure worth preventing.
- A served file with no frontmatter `description:` is a startup error. A tool a client
  cannot route on is worse than no tool.
- Nothing in the surface opens a socket or takes a credential, unchanged and now without
  an argument to carry one.

## Tests

- `test/server.test.js`: 12 → 13. Five cases that tested the removed path argument are
  gone — the single-tool assertion, the advertised `path` schema, the traversal payloads,
  the unknown path, and the set root. Six that test the new surface replace them: the
  file-to-tool bijection in both directions, the name derivation, unique names with a
  description, no input schema anywhere, frontmatter served intact, and total served text
  equal to total text on disk. The CLI-parity, write-verb, credential and no-key cases
  are kept. **The no-input-schema case is the replacement for the traversal test, not a
  weaker version of it.**
- `test/http.test.js`: 16, unchanged in count. It drove the removed tool by path and had
  to be rewritten. The traversal-over-the-wire case now asserts that a call cannot be
  steered by a tool name or an argument; the 4 MiB cap case sends an argument no tool
  declares, to show the cap fires in `readBody` before the tool layer is reached.
- 29 tests total, same as before: the surface grew from one tool to three while the
  suite stayed the same size.

## Fixed alongside, and worth naming

- **Three pages named the tool "the Roblox security set"** —
  `wiki/information/overview.md`, `wiki/environments/setup.md` and
  `wiki/information/architecture.md` — where the registered name was
  `roblox_security_instruction`. **These were wrong before this change**, and not about
  the same thing: they named a real tool and described it as a set. They are corrected
  here because the files were rewritten anyway, and the corrected text names
  `roblox_security_index` plus the two convention tools, because after this change there
  is no single tool to name at all.
- `wiki/information/architecture.md` described the tool layer as "one file per tool,
  importing them individually, with a schema branch". It now describes a generated
  surface and no schema.
- `.agents/rules/tool-authoring.md` told a contributor to hand-write a tool file and
  register it. It now says the opposite, and says why.

## Not changed, deliberately

- **`content/`** is a delivery surface, not an editor.
  `content/index/roblox-security-index.md` is missing the `author:` frontmatter field the
  other two files carry — the only served file here without one. The generator reads
  `description`, so it publishes; the defect is a break of the set's own convention, and
  the fix belongs where the set is authored. **Reported, not fixed here.**
- **`zod` remains a direct dependency** and nothing imports it, since the last schema went
  with the last path argument. Removing a dependency is a separate change from the tool
  surface, and the documentation still accurately says the package has two. Noted for the
  owner rather than bundled in.
- `wiki/logs/0/1/0/CHANGELOG.md` is **not corrected**, and neither is the `0.1.0` row in
  `.agents/index/logs-index.md`. That entry claims "zod schemas and an optional unified
  API key", neither of which was in this tree; history is not rewritten. This is the
  first changelog here that describes what the repository actually does.

## Notes for an operator

- A client configured against this server before the bump will show
  `roblox_security_instruction` as an unknown tool. Call one of the three names instead.
- Nothing else moved. The HTTP transport, the `Host` allow-list, the body cap, the
  container image, and the CLI are untouched by this change.

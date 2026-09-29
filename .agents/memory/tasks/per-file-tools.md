---
name: memory-tasks-per-file-tools
description: Record of the per-file tool surface on feat/per-file-tools - what shipped, the baseline and final counts, the decisions, and what was reported rather than fixed.
---

# Task — Per-file tool surface

**Branch:** `feat/per-file-tools`, off `master`. **Version:** `0.1.0` → `1.0.0`.
Local commits only; nothing pushed, no pull request opened, no merge.

## What shipped

The single `roblox_security_instruction`, which took a `path`, becomes three generated
tools, one per file in `content/`.

| Tool | Serves |
|---|---|
| `roblox_security_index` | `index/roblox-security-index.md` |
| `trust_boundaries` | `roblox/security/trust-boundaries.md` |
| `zero_trust_networking` | `roblox/security/zero-trust-networking.md` |

| | |
|---|---|
| **New** | `src/tools/from-content.js` — reads the set once at import, builds the surface |
| **Deleted** | `src/tools/roblox-security-instruction.js` |
| **Deleted** | `src/content.js`, and with it the traversal guard |
| **Changed** | `src/server.js` — reads the generated surface instead of declaring it |
| **Changed** | `test/server.test.js` 12 → 13, `test/http.test.js` 16 → 16 |

## The baseline, which the plan had recorded as unknown

```
baseline: 28 / 28 on master @ d950255
```

**The plan predicted 12.** It had read 12 out of `test/server.test.js` without running
it. The real baseline is **28**: 12 in `server.test.js` **and 16 in `test/http.test.js`**,
added by the merged HTTP transport work. Recorded here because a reviewer comparing
"before" and "after" numbers needs both halves.

## The final count, and why it is not a regression

```
final: 29 / 29  (13 in server.test.js, 16 in http.test.js)
```

The plan said *"the count after the rewrite will be lower, because four path-based cases
are deleted and replaced by four broader ones."* **It is one higher, not lower.** Five
cases were deleted rather than four, six added rather than four, and the net is +1:

* deleted — single-tool assertion, advertised `path` schema, traversal payloads, unknown
  path, set root (the plan's "traversal, unknown-path, set-root and path-schema" is four;
  `roblox_security_instruction is the only tool` is a fifth, listed separately in the same
  file);
* added — bijection, name derivation, no-input-schema, unique names with a description,
  frontmatter intact, total served text equal to text on disk.

Whole suite: 28 → 29, while the surface went from one tool to three. The two halves moved
in opposite directions and that is the point, not a discrepancy to be smoothed over.

## Decisions

* **`src/content.js` was deleted, not kept with a comment.** Nothing imported it once the
  path tool went. The guard was careful work — a `..` segment rejected before any
  filesystem call, then containment confirmed, the second check redundant on purpose — and
  all of it defended an argument that no longer exists. `CONTENT_DIR` moved to
  `src/tools/from-content.js`, resolved from `import.meta.url`. The alternative was leaving
  a defence whose load-bearingness no reader could determine, which is the failure
  `tool-surface-steps.md` S5 was written to prevent.

* **`NAME_OVERRIDES` is kept, empty.** No file in this set needs an override — `index/`,
  `roblox/` and `security/` are all dropped and all three names fall out of the rule. It
  is kept because the collision and validity errors name it as the remedy, so an empty
  table would make those messages point at nothing, and because the same module ships in
  four repositories and a fix wants one place to change.

* **Registration stayed on `server.tool(name, description, handler)`**, the three-argument
  form, rather than moving to the reference repository's `registerTool`. This repository's
  own documentation is written around `server.tool`, and the branch has no schemas, so
  the two are equivalent here. The schema branch is gone, with a comment saying a tool
  that grew an argument would have to stop being generated to get one.

* **The index router test was kept.** `roblox_security_index routes the two files` is what
  forces the index to stay complete as files are added, and with three tools the entry
  point is most of what a client learns.

## A deviation from the plan, and why

**`test/http.test.js` is not named in any task.** The plan's code work covers
`test/server.test.js` only, and the plan appears to predate the HTTP transport work — or
to have been written without it in view. But `test/http.test.js` drives
`roblox_security_instruction` by path in six places, so removing the tool breaks it, and
verification item 1 is `npm test` passing. Leaving it would have meant landing a red suite.

It is rewritten rather than deleted, because everything in it about the HTTP transport is
still true and worth keeping:

| Was | Now |
|---|---|
| traversal payloads over the wire | a call cannot be steered by a tool name or an argument |
| 4 MiB cap with a long `path` | the same cap, sending an argument **no tool declares** — the cap fires in `readBody`, before the tool layer |
| "serves the same single tool as stdio" | "serves the same tool surface as stdio", three names |
| `call(client, path)` | `call(client, name)`, arguments `{}` |

16 tests before, 16 after. The count is unchanged and the coverage is not reduced.

## Reported, not fixed

* **`content/index/roblox-security-index.md` has no `author:` frontmatter field** — the
  only served file here without one. The generator reads `description`, so it publishes
  and the build is clean; the defect is a break of the set's own convention, and
  `content/` is a delivery surface, not an editor. It belongs upstream, where the set is
  authored.
* **`zod` is now a direct dependency with no importer.** The last schema went with the
  last path argument. Not removed here: it is a separate change from the tool surface,
  it would move the lockfile, and `overview.md`'s "two dependencies" is still accurate
  while it is declared. **The owner's call.**
* **`package-lock.json` still carries the template's root `name` and `bin` on `master`**,
  so any `npm install` rewrites four lines. Pre-existing, recorded in the HTTP task
  record, and reverted rather than committed. Noted in the repository map as a gotcha.

## The duplication this change makes easier to miss

`content/roblox/security/trust-boundaries.md` and `zero-trust-networking.md` are
**byte-identical** to the files of the same names in `RBAgents-MCP/shared-instruction`.
After this change both repositories expose tools named `trust_boundaries` and
`zero_trust_networking`.

`agents://rules/duplicate-instruction-audit.md` covers a repository vendoring the
*shared* set. It does not cover two sibling repositories in the same org holding the same
content file as separate delivery surfaces. **That gap is the finding most worth raising
against the shared set**, and it is raised rather than fixed here.

A `roblox_security` namespace prefix was considered for the two convention names and
rejected: the derivation is basename-only and confirmed, and the two servers are never
connected to one client. But if the owner ever resolves the duplication in favour of one
server serving both files, the collision becomes real and the generator will throw at
boot rather than let one file shadow the other. That is the intended failure, and it is
worth knowing it is coming.

## The 3-tool argument, stated plainly

This is the smallest surface of the four repositories in the plan, and the argument for
per-file tools is **stronger** here, not weaker, because of it. A single path-taking tool
over three files means a caller must already know a path string. Three tools means the
caller sees every name in `tools/list` and picks — the whole set fits in one enumeration,
and the tool list genuinely is the manifest. There is no scale argument either way, which
makes this the cheapest of the four to do and the easiest to review.

## Still open

* The image has still never been built. Unchanged by this work.
* No CI. `npm test` runs only when a person runs it.
* `content/` is a copy; the missing `author:` and the duplication both belong upstream.

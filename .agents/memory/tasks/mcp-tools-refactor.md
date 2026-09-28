---
name: memory-tasks-mcp-tools-refactor
description: Task record for adopting the shared instruction set and refactoring the tool layer onto per-file modules with zod schemas and optional API keys.
---

# Task Record - MCP Tools Refactor

## Goal

Make `template` a credible starting point for a real MCP server: give the repository a
working agent instruction system, and replace the single hard-coded `TOOLS` array with a
tool layer where each tool is its own file, may declare `zod` parameters, and may require
an API key.

## Objective

Done when `.agents/` exists and routes, `src/tools/` holds four sample tools covering the
four capability combinations, both surfaces (server and CLI) list the same tools, the test
suite pins that agreement plus the API-key behaviour, and `PROMPT.md` tells a scaffolding
agent how to strip the samples back to a single `ping`.

## Detail

* Single unified API key for the whole server: `process.env.API_KEY`, read inside the
  handler, never at import time.
* Tools register through `server.tool(name, description, schema?, handler)`.
* The four samples are disposable by design - `PROMPT.md` deletes them at scaffold time.
* No pull request. The user instructed "only push, never create pr", so every branch in
  the stack is pushed and left for the user to open pull requests against if they choose.

## Decisions

| Decision | Value | Why |
|---|---|---|
| Mode | B - consumer | The `lxagents-agents-base` connector resolves in this session. |
| Branches | One per task, stacked | `agents://git/branching-strategy.md` and `agents://planning/task-workflow.md` §C. See the decision record below. |
| Version | `0.1.0` | User approved the bump; first changelog is `wiki/logs/0/1/0/`. |
| License | MIT, LXAgents-MCP, 2026 | Already present and correct; left untouched. |
| Local instructions | `tool-authoring`, `secrets`, `template-mode` | Selected by the user from the proposals. |
| Tool annotations | Dropped | `server.tool(name, description, schema, cb)` has no annotations slot; the required signature wins. |

The branch question is recorded separately in
[`../decisions/harness-branch-naming.md`](../decisions/harness-branch-naming.md), because
it recurs in every harness-run session and is otherwise re-litigated each time.

## Tasks

| # | Title | Scope (one line) | Repository | Branch | Files / areas | PR |
|---|---|---|---|---|---|---|
| 1 | Task record | The confirmed plan, written before the work | `template` | `chore/mcp-tools-refactor-plan` | `.agents/memory/` | #3 |
| 2 | Agent instruction system | Mode B adoption of the shared set | `template` | `docs/agents-setup` | `AGENTS.md`, `.agents/`, `wiki/`, `README.md` | #4 |
| 3 | Tool layer refactor | Per-file tools, zod, optional API key | `template` | `refactor/tool-layer` | `src/`, `test/`, `package.json`, `.agents/rules/`, `wiki/` | #5 |
| 4 | Scaffolding instructions | Teach `PROMPT.md` to strip the samples | `template` | `docs/scaffolding-prompt` | `PROMPT.md` | #6 |
| 5 | Release | Version, changelog, index rows, close-out | `template` | `chore/release` | `package.json`, `wiki/logs/` | #7 |

Branches stack in dependency order: task 1 from `master`, task `k` from task `k-1`'s
branch. Pull request `k` targets task `k-1`'s branch, and the numbers above were filled
by the release task once every one was open - task 5 is last and already contains every
branch below it, so writing them here rebases nothing.

### Why task 2 documents the repository before task 3 changes it

Task 2 writes the instruction and knowledge system against the repository **as it stands**
- one `ping` tool behind a frozen `TOOLS` array. Task 3 then changes that structure and
updates every page describing it **in the same commit**, per
`agents://rules/change-propagation.md`.

The alternative - documenting task 3's structure up front - would leave the `docs/agents-setup`
branch describing code that does not exist on it, and a stacked branch has to be correct on
its own, not only once the branch above it lands.

The two rules that govern the new structure, `tool-authoring` and `secrets`, are therefore
created in task 3 alongside the structure they govern, not in task 2.

### Task 1 - chore/mcp-tools-refactor-plan

Created this record with the confirmed plan before any other file was written, plus the
branch-naming decision record.

Captured the three decisions the user was asked for (version, instruction selection, and
- after a first attempt was rejected - branching), so a later session does not re-litigate
them.

Next task depends on: nothing.

### Task 2 - docs/agents-setup

Adopted the shared instruction set as a Mode B consumer, describing the repository as it
stood: one `ping` tool behind a frozen `TOOLS` array, one dependency, no authentication.

* `AGENTS.md` rewritten to the setup procedure's shape: bootstrap block verbatim,
  auto-activation contract, trigger table mirrored row-for-row with local rows appended,
  reading order, routing protocol, iron rule, placement, discovery gate, version rule,
  no-session-links.
* `.agents/rules/`: `repository` and `template-mode`. The two rules governing the new
  tool layer are deliberately **not** here - they arrive in task 3 with the structure
  they govern.
* `.agents/index/`: six indexes. No overrides; the table is present and empty.
  `logs-index.md` records that no release is logged rather than inventing a `0.0.0`
  directory.
* `.agents/wiki/context/repository-map.md`, `.agents/memory/state/repository-state.md`.
* `wiki/information/{overview,architecture}.md`, `wiki/environments/env.md`, and
  `README.md` rewritten as an overview.

**One deletion worth flagging.** The old `AGENTS.md` carried an "If the connector will
not resolve" section instructing an agent to `git clone` the shared set into `./mcps/`
and register it as a local stdio server. The current `agents://rules/mcp-connector.md`
says the opposite: do not clone, vendor, or paste the set in as a workaround. The shared
rule is authoritative and this is not a declared override, so the section is gone. The
`mcps/` line in `.gitignore` is harmless and was left alone.

**One record, not two.** `AGENTS-SETUP` §5.4 seeds `.agents/memory/tasks/agents-setup.md`.
This request is broader than setup, so the setup is task 2 of this record rather than a
second record of its own.

Verified: no `INDEX.md`; no local `git/`, `planning/`, `prompts/` or `creators/` folder;
frontmatter present and `name` unique across every local `.md`; no frontmatter under
`wiki/`; 63 relative links all resolve; `npm test` 1/1 (code untouched on this branch).

Next task depends on: the documentation written here, every page of which task 3 updates
in the same commit as the code change.

### Task 3 - refactor/tool-layer

Replaced the frozen `TOOLS` array with a tool layer where each tool is its own file
under `src/tools/`, exporting `config` and `handler`.

* Four samples cover the four combinations of *takes parameters* / *requires a key*:
  `get_server_time`, `get_secure_summary`, `calculate_sum`, `search_secure_data`.
* `src/server.js` imports each module individually and registers it with
  `server.tool(name, description, schema?, handler)`, choosing the three- or
  four-argument form on whether the tool declares a schema.
* `listTools()` is the single list both surfaces read; `src/cli.js` prints it instead of
  holding its own copy, and the column width is computed rather than hard-coded at 16,
  which the longer sample names now exceed.
* `API_KEY` is read inside the handlers, never at module scope, so a key set after
  startup still works and tests can set and unset it around a case.
* `zod` is now a direct dependency. It was already resolving as a transitive dependency
  of the SDK, but the tools import it by name and an undeclared import is a break
  waiting for the SDK to drop it. **The version stays `0.0.0` here** - the bump is task 5.
* Suite grew from 1 test to 10: surface parity, advertised schemas, argument validation,
  the missing-key failure, the success path, and that the key is never echoed back.

**Documentation moved in the same commit as the code**, per
`agents://rules/change-propagation.md`: `tool-authoring.md` and `secrets.md` added with
the structure they govern, their rows added to `agents-index.md` and their triggers to
`AGENTS.md`, and the repository map, state, both `wiki/information/` pages, `env.md`,
`setup.md` and `README.md` all rewritten for the new shape.

**One trade-off.** The old `registerTool` call carried `readOnlyHint`, `destructiveHint`,
`idempotentHint` and `openWorldHint`. The required
`server.tool(name, description, schema, handler)` signature has no annotations slot - its
four-argument form takes either a schema or annotations, not both - so the annotations
are gone. Restoring them means returning to `registerTool`.

Verified: `npm test` 10/10; `tools/list` over real stdio JSON-RPC returns all four; CLI
lists all four; version still reports `0.0.0`; 71 relative links resolve; nothing
unindexed.

Next task depends on: `src/tools/` holding exactly the four samples, which `PROMPT.md`
must now know how to remove.

### Task 4 - docs/scaffolding-prompt

Rewrote `PROMPT.md` Step 3 so a scaffolding agent leaves a clean project rather than one
carrying the template's demonstration code.

The three instructions the request named are step 3 of the new Step 3: delete the four
sample files, create `src/tools/ping.js` from a snippet given in full, and reduce
`src/server.js` to importing and registering `ping` alone. Five things were added
alongside them, because without them the reset leaves the project broken rather than
clean:

* **Update `test/server.test.js`.** The suite asserts the four sample names, their zod
  schemas and the `API_KEY` behaviour. Left alone it fails on the new project's first
  `npm test` - keep the parity test, keep a `ping` returns `pong` test, delete the rest.
* **Run `npm test` before continuing**, so that failure is caught at scaffold time.
* **Update the documentation that names the samples** - `README.md`, the two
  `wiki/information/` pages, `wiki/environments/setup.md` and `env.md`.
* **Update `.agents/`** - delete `template-mode.md` and its index row and trigger row,
  refresh the repository map and state, and drop this task record, which is the
  template's history and not the new project's.
* **Handle the decision record** - keep `harness-branch-naming.md` but strip its
  `History` section, which narrates template work; delete it outright if the shared set
  has absorbed the rule by then.

Verified by dry run against this branch: copied `src/` and `package.json` to a scratch
directory, applied steps 3a-3c exactly as written, and confirmed the CLI lists only
`ping` and a real stdio `tools/call` for `ping` returns `pong`. The `ping.js` snippet was
extracted from the file and executed rather than read.

Next task depends on: nothing.

### Task 5 - chore/release

Released `0.1.0`.

* `package.json` and `package-lock.json` bumped from `0.0.0` to `0.1.0`, on the user's
  explicit approval. `src/version.js` reads it at import, so the CLI's `--version` and
  the HTTP `/healthz` payload follow with no second edit.
* `wiki/logs/0/1/0/CHANGELOG.md` created with `Added`, `Changed`, `Removed` and
  `Security` sections. The `Security` section records that the key is never logged or
  echoed, and that tools stay listed when no key is set.
* `logs-index.md` moved from "no release logged yet" to the `0.1.0` row, and
  `repository-state.md` updated to match.
* `PR` column filled once all five pull requests were open: #3, #4, #5, #6, #7.

## Status

**Done.** Five tasks on five stacked branches, each pushed:

| # | Branch | Branched from |
|---|---|---|
| 1 | `chore/mcp-tools-refactor-plan` | `master` |
| 2 | `docs/agents-setup` | task 1 |
| 3 | `refactor/tool-layer` | task 2 |
| 4 | `docs/scaffolding-prompt` | task 3 |
| 5 | `chore/release` | task 4 |

One pull request per branch, task `k` targeting task `k-1`'s branch, merged in order
`1..5`. Pull request #3 is the record, so its body carries the whole chain as a table -
a reviewer opens one page and sees every part of the work.

Each pull request was re-targeted to `master` immediately before its own merge rather
than after: a forge only re-targets a stacked pull request automatically when its base
branch is deleted on merge, and where that setting is off, pull request `k` merges into
branch `k-1` and `master` silently stays behind.

A first attempt put all five tasks on a single harness-designated `claude/` branch. That
branch was deleted locally and on the remote and the work was re-done here - see
[`../decisions/harness-branch-naming.md`](../decisions/harness-branch-naming.md).

Open for the user: three discovery findings were reported rather than applied - two
`shared` and one `local`. None was written into either set.

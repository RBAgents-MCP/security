---
name: template-mode
description: Rules that apply only while this repository is still a template - PROMPT.md is the scaffolding authority and the sample tools are disposable.
---

# Template Mode

This repository is a template until `PROMPT.md` is deleted. While that file exists,
these rules apply on top of everything else.

## PROMPT.md is the scaffolding authority

A request to initialize, scaffold, or set up a new project from this template is
answered by reading [`../../PROMPT.md`](../../PROMPT.md) and following it, not by
improvising an equivalent. Its steps are ordered and its Step 3 is exhaustive.

Changing what a scaffolded project starts with means editing `PROMPT.md`. A change to
the template's own structure that Step 3 does not know about produces projects with
leftovers - the sample tools being the obvious case.

## The sample tools are disposable

`src/tools/` currently holds four samples that exist to demonstrate the four
combinations of *takes parameters* and *requires an API key*:

| Tool | Parameters | API key |
|---|---|---|
| `get_server_time` | no | no |
| `get_secure_summary` | no | yes |
| `calculate_sum` | yes (zod) | no |
| `search_secure_data` | yes (zod) | yes |

They are documentation that happens to run. Scaffolding deletes all four and replaces
them with a single `ping`.

The consequence for anything added here: **nothing outside `src/tools/` may depend on a
sample.** No shared helper that only the samples import, no test that survives their
deletion, no dependency in `package.json` that goes unused once they are gone. If a
sample needs a helper, the helper lives in the sample.

## Names in the template are placeholders

`template`, `Template`, and `@mcagents-mcp/template` are scaffolding targets, not
names to preserve. They appear in `package.json`, `src/server.js`, `src/cli.js`,
`README.md`, and `wiki/environments/setup.md`, and Step 3 of `PROMPT.md` replaces each
one. A new occurrence added anywhere else needs a matching line in Step 3.

## Leaving template mode

Scaffolding removes `PROMPT.md`, the "Project Scaffolding (Template Mode)" section of
`AGENTS.md`, and that section's trigger row. This file goes with them - a scaffolded
project is not a template, and a rule about template mode left behind is a rule that
can only mislead.

---
name: root-index
description: Router for template - every local index plus the shared router, and the override table. Lists indexes only, never leaf content.
---

# Root Index

This file lists **indexes only**. It carries no rules, no documentation, and no direct
links to leaf content. Read exactly one branch per task, plus
[`memory-index.md`](memory-index.md).

## Child Indexes

| Index | Scope | Load when |
|---|---|---|
| [`agents-index.md`](agents-index.md) | This repository's instruction set | You need a rule specific to this repository. |
| `agents://index/root-index.md` | The shared instruction set | You need a branching, commit, pull request, planning, or creator convention. |
| [`agent-wiki-index.md`](agent-wiki-index.md) | `.agents/wiki/` agent knowledge | You need orientation, an SOP, or a domain guideline written for agents. |
| [`project-wiki-index.md`](project-wiki-index.md) | `wiki/` human documentation | You need to read or write documentation a person will read. |
| [`memory-index.md`](memory-index.md) | `.agents/memory/` dynamic state | You need prior task state or must record progress. |
| [`logs-index.md`](logs-index.md) | `wiki/logs/` versioned change logs | You need release history or must record a change. |

## Shared overrides

No overrides — this repository uses the shared set unchanged.

| `name` | Local file | Replaces | Why |
|---|---|---|---|

## Maintenance

Adding, removing, or renaming any index updates this table **in the same commit**.
Adding or dropping an override updates the override table in the same commit.

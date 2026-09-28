---
name: agents-index
description: Index of this repository's own instruction files - the repository rules, tool authoring, secrets, and template mode.
---

# Agents Index

**Scope:** `.agents/rules/`
**Parent:** [`root-index.md`](root-index.md)

## Rules

| File | Purpose |
|---|---|
| [`../rules/repository.md`](../rules/repository.md) | The dual-surface contract, the stdout ban, where things go, and what must not be introduced. |
| [`../rules/tool-authoring.md`](../rules/tool-authoring.md) | How to add a tool: one file per tool, the `config`/`handler` exports, zod raw shapes, registration. |
| [`../rules/secrets.md`](../rules/secrets.md) | The one server-wide `API_KEY` — read it inside the handler, fail descriptively, never disclose it. |
| [`../rules/template-mode.md`](../rules/template-mode.md) | Rules that apply only while `PROMPT.md` exists and the sample tools are still disposable. |

This repository holds no `git/`, `planning/`, `prompts/`, or `creators/` folder. Those
are served by the `lxagents-agents-base` connector — route to
`agents://index/root-index.md` for them.

## Maintenance

Any file added to or removed from `.agents/rules/` is reflected here **in the same
commit**.

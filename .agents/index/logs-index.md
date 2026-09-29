---
name: logs-index
description: Release history of rbagents-security, newest version first - what changed in each version and where its changelog lives.
---

# Logs Index

**Scope:** `wiki/logs/`
**Parent:** [`project-wiki-index.md`](project-wiki-index.md)

## Versions

| Version | Changelog | Summary |
|---|---|---|
| `1.0.0` | [`../../wiki/logs/1/0/0/CHANGELOG.md`](../../wiki/logs/1/0/0/CHANGELOG.md) | One tool per file, generated from `content/`. `roblox_security_instruction` and its `path` argument removed, with the traversal guard they needed; the surface is now three tools that take no argument. |
| `0.1.0` | [`../../wiki/logs/0/1/0/CHANGELOG.md`](../../wiki/logs/0/1/0/CHANGELOG.md) | Per-file tool layer with zod schemas and an optional unified API key; agent instruction system adopted. Inherited from the template; the schemas and the key were not in this tree. |

## Maintenance

A new version directory is added here **in the same commit** that creates it. Newest
version first. Version directories are `wiki/logs/{Major}/{Minor}/{Patch}/`, and a
version is never bumped without explicit user approval — see
`agents://rules/versioning.md`.

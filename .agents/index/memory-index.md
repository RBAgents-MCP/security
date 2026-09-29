---
name: memory-index
description: Index of .agents/memory/ - repository state and decisions. Read every session so work continues rather than restarts.
---

# Memory Index

**Scope:** `.agents/memory/`
**Parent:** [`root-index.md`](root-index.md)

This index is the standing exception to the routing protocol: it is read **every
session**, because continuity depends on it. Load only the rows whose scope matches the
current request.

## State

| File | Purpose |
|---|---|
| [`../memory/state/repository-state.md`](../memory/state/repository-state.md) | Current known state: what exists, the stack, what is not built, and the next obvious step. |

## Decisions

| File | Purpose |
|---|---|
| [`../memory/decisions/harness-branch-naming.md`](../memory/decisions/harness-branch-naming.md) | Why a harness-designated branch never overrides the branching strategy. |
| [`../memory/decisions/express-for-http-transport.md`](../memory/decisions/express-for-http-transport.md) | Why the HTTP transport moved from `node:http` to express, and why the hand-rolled `Host` guard was deleted in favour of the SDK's middleware. |

## Tasks

| File | Purpose |
|---|---|
| [`../memory/tasks/per-file-tools.md`](../memory/tasks/per-file-tools.md) | The per-file tool surface: what shipped, the real baseline and final test counts, why `src/content.js` went, and what was reported rather than fixed. |
| [`../memory/tasks/http-transport-and-docker.md`](../memory/tasks/http-transport-and-docker.md) | HTTP transport hardening and the container image: what shipped, the decisions, and why the image is still unbuilt. |
| [`../memory/tasks/express-cluster-migration.md`](../memory/tasks/express-cluster-migration.md) | Express at `POST /mcp`, cluster workers, and the hand-rolled `Host` guard converging on the SDK middleware — with the one behaviour change it causes recorded. |

## Maintenance

Any file added to or removed from `.agents/memory/` is reflected here **in the same
commit**. Memory is written freely and needs no approval — see
`agents://rules/memory-policy.md`.

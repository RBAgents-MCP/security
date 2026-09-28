---
name: roblox-security-index
description: Router for the Roblox security set — two files, on the client trust boundary. Read this first.
version: 1.0.0
---

# Roblox Security Index

The set is two files, and they answer two different questions. Read this page
first, then read the one that matches what you are doing.

| Question | File |
|---|---|
| A payload arrived from the client. What do I check before I use it? | [`roblox/security/zero-trust-networking.md`](../roblox/security/zero-trust-networking.md) |
| What may the client ask for at all, and where does the line between the halves of the codebase go? | [`roblox/security/trust-boundaries.md`](../roblox/security/trust-boundaries.md) |

The first is the narrow one and the one you will reach for most. The second is
the wider one, and it is the reason the first exists: a payload should never
have arrived.

## The one idea both files share

**The client is an untrusted network peer that happens to render a UI.** It can
invoke a `RemoteEvent` directly, from an injected script, or from a modified
client. Every field of every payload is attacker-chosen, and nothing the client
sends is a fact until the server has checked it.

## Scope

- **Applies to:** Roblox repositories in this workspace. Only those.
- **Not the org set.** This is workspace-local content and is *not* part of the
  cached `lxagents-agents-base` set, so it carries **no set version** and is
  not covered by that set's drift check.
- **Not the language-agnostic security set.** `LXAgents-MCP/security` serves
  python, javascript/typescript, and go. This server serves Roblox only, and
  the two do not overlap.

## Which servers a Roblox repository resolves

| Server | Holds |
|---|---|
| `lxagents-agents-base` | Branch strategy, commit conventions, task workflow, pull requests. **Every repository resolves this one.** |
| `rbagents-shared-instruction` | The Roblox development conventions — Luau, Rojo, package architecture, data stores, auras, naming. |
| `rbagents-security` (this one) | The two files above. |
| `lxagents-security` | Language-agnostic web security, for a repository that also has a web backend. Optional. |

The first is required and the rest are scoped. A Roblox repository needs
`rbagents-security`; nothing else forces it.

The two Roblox security files are **also** served by `rbagents-shared-instruction`,
because they are part of the Roblox development set there. A repository can read
them with this connector or with that one — the overlap is deliberate, so a
repository that installs only the development set still gets the security rules
it needs.

## Provenance

Both files are copied verbatim from the workspace `roblox` set with their
frontmatter intact. A convention change belongs there first; this repository is
a delivery surface for it, not its editor.

---
name: roblox-security-trust-boundaries
description: What the client may ask for versus what only the server may decide, where secrets may live, and the shape of an OnServerEvent handler.
version: 1.0.0
author: RBZagan
---

# Trust Boundaries

Applies to every Roblox repository in this workspace. The client is an
untrusted network peer that happens to render a UI.

[`zero-trust-networking.md`](zero-trust-networking.md) covers how to *validate*
a payload once it has arrived. This file covers the wider question: what the
client is allowed to ask for at all, and where the line between the two halves
of the codebase goes.

## Remote communication rules

### Intents in, results never

**The client sends intents. The server produces results.**

A remote named `RequestCastSpell` asks the server to consider a cast. A remote
named `DealDamage` is the client telling the server what already happened, and
is a hole in the model.

| Send this — an intent | Never this — a result |
|---|---|
| `RequestCastSpell` | `DealDamage` |
| `RequestEquipItem` | `AddCurrency` |
| `RequestOpenChest` | `GrantItem` |
| `RequestMove` | `SetPosition` |

If the name of your remote is a past-tense verb describing a state change, the
boundary is in the wrong place. Rename it.

### Rate limiting and cooldowns live on the server

A cooldown tracked on the client is not a cooldown; it is a suggestion the
attacker declines to take. See step 5 in
[`zero-trust-networking.md`](zero-trust-networking.md).

## Client responsibilities

The client's job is **input and display**.

* Capture input, render UI, drive the camera, play local effects.
* It may predict a change locally to make the game feel responsive.
* **The predicted change is a visual only.** The state change itself waits for
  server confirmation. A prediction that never arrives is reverted, not left to
  stand because it looked right.
* It never decides currency, stats, damage, inventory, ownership, or progression.

## Secret management

**Never place sensitive configuration in `src/client/` or `src/shared/`.**

Everything in `src/client/` is decompilable by anyone running the game.
Everything in `src/shared/` replicates to every client. Neither is a place to
put a secret, and "the client never looks there" is not a control.

This includes exact drop rates and drop tables, the real value or formula behind
a randomised result, hidden server rules, and any key or credential of any kind.

Hidden by obscurity is not hidden. A value the server must send to the client
is a value the client has.

## Server responsibilities

### Authoritative state

Only the server mutates DataStore-backed data, currency, inventories, health,
and progression. A local change made for feel is reconciled to the server's
number, not the other way round.

### Independent validation

**If a client says "I hit the enemy," the server decides whether they did.**

The server calculates the distance, the aim, and the line of sight itself — a
raycast from the server's own copy of both characters' positions. It does not
replay the client's claim back to the client as a decision. A hit that the
server cannot confirm is a miss, whatever the client reported.

## Agent enforcement

### Character auras

Character auras in `RBAssets/` are **free** and are equipped **automatically by
Character ID**, on character spawn, by the server.

- **Do not trust the client to tell the server which aura it owns.** There is no
  client-supplied aura identifier to accept, and no lookup to perform.
- **Do not add a purchase check, an ownership check, or an unlock check** — not
  as a temporary measure, not as a future placeholder.
- A character ID that resolves to no aura equips nothing, silently. That is a
  normal outcome, not an error to surface and not a condition to fail on.

See [`../game-systems/character-auras.md`](../game-systems/character-auras.md).

### `OnServerEvent` structure

Every server handler for a client remote is written in this order. The early
steps return without doing anything; nothing expensive and nothing stateful
happens before them.

1. **Guard clauses** — shape, type, and cooldown checks. Return on any failure.
2. **Sanity and physics checks** — distance, magnitude, raycast, line of sight.
   Reject values the player could not legitimately produce.
3. **Game logic and state mutation** — resolve the target on the server, then
   apply the change.
4. **Replication to clients** — only after the change is committed, and only if
   the change is not already a replicated property.

```luau
remote.OnServerEvent:Connect(function(player: Player, payload: unknown)
	-- 1 — guard clauses
	if typeof(payload) ~= "table" then return end
	local spellId = payload.spellId
	if typeof(spellId) ~= "string" then return end
	if now - (lastCast[player] or 0) < COOLDOWN then return end

	-- 2 — sanity and physics
	local origin = characterRoot(player).Position
	local target = resolveTarget(spellId, player)
	if not target then return end
	if (target.PrimaryPart.Position - origin).Magnitude > MAX_RANGE then return end
	if not hasLineOfSight(origin, target) then return end

	-- 3 — game logic and state mutation
	lastCast[player] = now
	applySpell(player, target, spellId)

	-- 4 — replication
	remote:FireAllClients("SpellResolved", player, target, spellId)
end)
```

Steps 1 and 2 are the checks in
[`zero-trust-networking.md`](zero-trust-networking.md) steps 1–4, 5, and 3
respectively; step 3 is its "only then mutate." This ordering is the same rule
at two resolutions, not a second rule.

## Related

* [`zero-trust-networking.md`](zero-trust-networking.md) — the six-step payload
  validation this file leans on.
* [`../game-systems/character-auras.md`](../game-systems/character-auras.md) —
  the aura rule in full.
* [`../toolchain/rojo-guide.md`](../toolchain/rojo-guide.md) — which directory
  a value ends up in, and therefore whether the client can read it.

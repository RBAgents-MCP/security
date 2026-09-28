---
name: roblox-security-zero-trust-networking
description: The client is untrusted — validate every RemoteEvent and RemoteFunction payload on the server before any state changes.
version: 1.0.0
author: RBZagan
---

# Zero-Trust Networking

Applies to every Roblox repository in this workspace. The client is an
untrusted network peer that happens to render a UI.

## The rule

**Never trust a payload sent from the client.** Every value that arrived over a
`RemoteEvent` or a `RemoteFunction` is unvalidated until the server has checked
it, and the check happens before the state changes — not after.

A client can invoke a `RemoteEvent` directly, from an injected script, or from
a modified client. Treat every field of every payload as attacker-chosen.

## Validate before mutating

In this order, on the server, for every handler:

1. **Shape.** Is the payload a table of the expected type, with the expected
   keys? Reject anything else.
2. **Type.** Is each field the Luau type the handler needs? Use `typeof` on
   instances; check `typeof(x) == "number"` and that the number is finite.
3. **Range.** Are coordinate values inside the bounds the server expects? A
   position a player could never legitimately reach is a position the server
   will not write.
4. **Authority.** Does the payload name something the *sender* is entitled to
   act on? Resolve the target on the server from the sender's own state. Never
   take a target's identity from the payload.
5. **Cooldown.** Has this player done this recently enough? Track it server-side.
6. **State.** Is the transition legal from the current state? A purchase the
   player cannot afford, a jump they are not grounded for, an item already
   owned.

Only then mutate.

```luau
--!strict
local remote: RemoteEvent = ReplicatedStorage.Packages.Movement:WaitForChild("RequestMove")

local MAX_SPEED: number = 50
local COOLDOWN: number = 0.1
local lastMove: { [Player]: number } = {}

remote.OnServerEvent:Connect(function(player: Player, payload: unknown)
	-- 1 & 2 — shape and type. The client's claim is never a position.
	if typeof(payload) ~= "table" then
		return
	end
	local ok, x, z = pcall(function(): (number, number)
		return payload.x, payload.z
	end)
	if not ok or typeof(x) ~= "number" or typeof(z) ~= "number" then
		return
	end

	-- 3 — range. Bounds the server chose, not the client.
	if math.abs(x) > MAX_SPEED or math.abs(z) > MAX_SPEED then
		return
	end

	-- 5 — cooldown, tracked here and nowhere the client can reach.
	local now = os.clock()
	if now - (lastMove[player] or 0) < COOLDOWN then
		return
	end
	lastMove[player] = now

	-- 6 — the target came from the server's own record of this player.
	applyMove(player, x, z)
end)
```

## What this rules out

* Writing a client-supplied `CFrame` or `Vector3` straight to the server.
* Believing a client-supplied `Player`, ownership, balance, or inventory count.
* A `RemoteFunction` whose return value is treated as trustworthy by the other
  server. A `RemoteFunction` called from the server returns a client value.
* A rate limit enforced on the client.
* Validating after the mutation, on the assumption the bad value can be undone.
  It cannot always.

## Related

* [`trust-boundaries.md`](trust-boundaries.md) — the wider boundary this file
  sits inside: what the client may ask for at all, and the handler shape.
* [`../game-systems/data-store-management.md`](../game-systems/data-store-management.md) —
  the server is the only writer, so this rule is what keeps persisted data sound.
* [`../game-systems/character-auras.md`](../game-systems/character-auras.md) — the
  one system deliberately free of any client purchase check.

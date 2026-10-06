# 2.12 — Connection & Solo Update

## Fixes

- Solo practice defaults to **On-device**, running the existing Room authority, NPCs, combat, building, objectives, infection and round rotation inside a dedicated Web Worker. It avoids hosted HTTP/database latency without weakening real multiplayer. Select **Online squad** for a room friends can join. Leaving terminates the local worker; its altered map lasts only for that session.
- HTTP input previously sent at most 24 commands and acknowledged at most 12 newly queued movement steps per request. Slow round-trips could create a growing backlog. Lossless packed command arrays now fit larger batches (up to 64, still capped at 7,000 bytes). Legacy object commands remain accepted. Pending prediction is bounded at 90 steps (three seconds), and authority grants at most three seconds of real elapsed movement credit. The endpoint consumes up to 64 credited steps before returning its ack. Flooding cannot manufacture simulation time; life epochs still reject stale inputs.
- Eliminations choose a fixed camera shoulder once instead of selecting a different longest ray every frame. That same arm is terrain-clipped throughout the countdown. Look input is ignored while dead, and respawning clears stale controls and edge steering.
- Space jumps; holding it airborne requests jetpack thrust. F remains the dedicated thrust key. The touchscreen JET button is unchanged. Physics, equipment, fuel and death restrictions remain authoritative.
- Unlocked trackpad look handles compatibility mouse events as well as pointer events without applying duplicate movement.

## Verification and limits

Regression tests exercise a real 30 Hz room through the actual bounded input packet builder at 1.4-second round-trip latency for 30 simulated seconds, with no prediction-window stalls or positional replay corrections. This is a reproducible simulated latency test, not a claim about every internet connection. Other checks cover stable death-camera positions, Space release/death/equipment restrictions and balanced on-device squads. The existing suite checks two real WebSocket peers for movement, jetpacks, terrain edits, combat, death and respawn, plus 32 concurrent dedicated-server sockets and SQL-backed hosted modes.

Browser QA could not be rerun in this environment because the supported browser-control skill was unavailable. Physical Safari, Magic Keyboard/trackpad and mobile thermal performance require device testing. Safari's cursor-based fallback is not native unlimited relative mouse capture. Public multiplayer still uses HTTP polling; this patch does not provision a WebSocket host or eliminate latency, packet loss, database contention or the bounded pause after a prolonged outage. On-device play removes network dependency during an already-loaded match, but does not promise offline installation/cold startup. NPCs may still struggle with elaborate constructions.

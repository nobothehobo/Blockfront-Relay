# 2.14 — Terrain Tactics

## Navigation

- Bounded local A* validates the corridor between adjacent waypoints, not only standing space at the endpoint. Footprint sweeps reject blocked corners, insufficient step headroom and unsupported gaps. Ordinary one-block ascents and up-to-three-block drops remain available; no teleporting or collision bypass is added.
- Goal scoring includes elevation. A waypoint is consumed only when the bot is close horizontally and vertically. A nearby cached waypoint with newly blocked clearance invalidates the route.
- Steering uses a destination tile-center standing probe. Fractional positions straddling stairs previously caused a false obstruction and stopped carriers at trench exits.
- Deliberately blocked movement now participates in stalled-position recovery, including when the previous input was stopped. Escape candidates receive corridor/support checks. Existing varied lane preferences and bounded planning cadence remain.
- Reactive objective breaching skips usable stairs. Bots no longer excavate a stair riser just because it is a solid block on the way to the flag. Supported wall/tunnel breaches remain authoritative normal tool commands.

## Flag cooperation

Escorts orient their formation toward the route home rather than the carrier's aiming yaw. Turning to shoot no longer whips escort goals around. If the offset has no standing headroom/support, an escort follows the carrier's position instead—appropriate for narrow trenches and tunnels. Existing nearest-pair recovery/interception, defender allocation and carrier priorities remain intact. Bots still share paths when limited passages require it; this is not a guarantee of independent routes everywhere.

NPC automatic combat wall building stays disabled. Player building, class restrictions, health, accuracy variation and authoritative combat rules are unchanged.

## Verification and limits

New tests cover blocked corners, unsupported corridors, low-ceiling steps, two-high tunnel routing and newly blocked passages, stable/narrow escort formations, and a complete physical CTF steal-and-return through a stepped trench/tunnel. That traversal also checks the exit stair is preserved. Existing routing, movement, combat and multiplayer regression checks remain in the suite. The production hosted build and bundled on-device practice worker are checked before publication.

Browser QA is unavailable under the current managed testing capabilities. No fresh physical iPhone/iPad Safari test is claimed. Complex player-built traps, one-high crawlspaces and long underground maze planning remain limitations; this pass is bounded local navigation, not a global underground navigation mesh. Both on-device practice and online NPCs use the updated code. Start a fresh practice match after refreshing for consistent comparison.

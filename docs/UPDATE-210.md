# 2.10 — Squad & Handling

This update prioritizes combat handling, cooperative NPC decisions and walkable outdoor routes. All art, audio synthesis and implementation remain original.

## Weapons

Rifle, SMG, shotgun, marksman and launcher recover from recoil at distinct speeds. Aiming reduces weapon-only motion; the camera and authoritative shot direction are unchanged. Reload roll and pitch differ by weapon rather than sharing one tilt. Existing magazine, shell, pump, bolt and hand animation stages remain.

Short original mechanical sounds follow server-approved reload progress: opening, magazine seating or shell insertion, and closing. Pump and marksman bolt sounds accompany their firing cycles. Cues are checked during active frames without delayed timers; cancellation, switching, death and hidden/pause states discard stale stages. Reload duration, ammunition transfer and damage remain server-owned and unchanged. The shotgun reload is still an atomic magazine refill, not individually cancellable shell loading.

## Squads

CTF assignments use living NPCs, so another teammate takes defense when a defender falls. Larger squads dedicate a quarter of their NPCs to defense, with at least one for squads of two or more. The nearest two available attackers escort a friendly carrier; additional attackers cover the enemy approaches. Escorts prioritize opponents they can actually see near the carrier. Nearby teammates share recent last-seen locations for investigation, retaining the original timestamp rather than extending reports indefinitely. Reports alone never authorize firing.

Bots facing multiple visible opponents can move toward a nearby living teammate. Firearm bots use short bursts with pauses while retaining their aim error, health and weapon statistics. Nearby infected spread their approach at medium range while retaining melee-only combat. Moving objectives or blocked waypoints invalidate old routes before the old planning deadline; digging and jumping use the routed direction. Local pathfinding still has bounded search and cannot guarantee solving every player-built maze.

## Trench access

Outdoor maps now carve three-wide side stairs after both trench banks are finished. Each stair flight has the same floor across its width and rises no more than one voxel per step. The two ends of each trench have gradual entrances instead of abrupt dead ends. Vegetation generation reserves the access corridor. Bridges and continuous trench floors remain; city map generation is unchanged. Terrain edits continue to use authoritative deltas.

## Verification and limits

Release checks are recorded in the final release report. New regression checks cover multi-seed supported stairs, defender replacement, bounded escorts, report expiration/no blind firing, route invalidation, recoil profiles and reload cue cancellation. Browser verification uses actual Chromium WebGL/Web Audio and simulated phone/tablet input, separately from physical-device testing.

No hosting provider or capacity change is included. The public HTTP/SQL adapter retains its 16-participant ceiling and higher round-trip latency. Physical iPhone/iPad Safari, thermal behavior, subjective sound/weapon feel and long geographically separated matches still require human testing. This update does not claim those tests occurred.

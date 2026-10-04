# 2.10 — Squad & Handling

This update prioritizes combat handling, cooperative NPC decisions and walkable outdoor routes. All art, audio synthesis and implementation remain original.

## Weapons

Rifle, SMG, shotgun, marksman and launcher recover from recoil at distinct speeds. Aiming reduces weapon-only motion; the camera and authoritative shot direction are unchanged. Reload roll and pitch differ by weapon rather than sharing one tilt. Existing magazine, shell, pump, bolt and hand animation stages remain.

Short original mechanical sounds follow server-approved reload progress: opening, magazine seating or shell insertion, and closing. Pump and marksman bolt sounds accompany their firing cycles. Cues are checked during active frames without delayed timers; cancellation, switching, death and hidden/pause states discard stale stages. Reload duration, ammunition transfer and damage remain server-owned and unchanged. The shotgun reload is still an atomic magazine refill, not individually cancellable shell loading.

## Squads

CTF assignments use living NPCs, so another teammate takes defense when a defender falls. Larger squads dedicate a quarter of their NPCs to defense, with at least one for squads of two or more. The nearest two available attackers escort a friendly carrier; additional attackers cover the enemy approaches. Escorts prioritize opponents they can actually see near the carrier. Nearby teammates share recent last-seen locations for investigation, retaining the original timestamp rather than extending reports indefinitely. Reports alone never authorize firing.

Bots facing multiple visible opponents can move toward a nearby living teammate. Firearm bots use short bursts with pauses while retaining their aim error, health and weapon statistics. Nearby infected spread their approach at medium range while retaining melee-only combat. Moving objectives or blocked waypoints invalidate old routes before the old planning deadline; digging and jumping use the routed direction. A safely stopped movement command now retains its obstruction timer, allowing the NPC to progress to digging instead of being stranded forever. Local pathfinding still has bounded search and cannot guarantee solving every player-built maze.

## Trench access

Outdoor maps now carve three-wide side stairs after both trench banks are finished. Each stair flight has the same floor across its width and rises no more than one voxel per step. The two ends of each trench have gradual entrances instead of abrupt dead ends. Vegetation generation reserves the access corridor. Bridges and continuous trench floors remain; city map generation is unchanged. Terrain edits continue to use authoritative deltas.

## Verification and limits

`npm run check`, `npm test` (130 checks) and `npm run build:hosted` pass. New regression checks cover multi-seed supported side/end stairs, defender replacement, bounded escorts, report expiration/no blind firing, route invalidation, regrouping, burst pauses, opposite infected approach lanes, recoil profiles, reload cue cancellation and a stopped NPC actually digging through a wall through Room validation.

`test:browser` passes desktop pointer lock/movement/combat and phone landscape/portrait plus tablet touch controls with two peers over WebSockets. `BR_TRANSPORT=http test:banner` passes phone solo CTF with fifteen NPCs, a joining desktop friend replacing one NPC, keyboard/touch reload moving parts and all four map presets through the hosted adapter. `test:graphics` passes class/infected silhouettes, held weapon swaps, two-browser firing/impact/casing/smoke effects, mobile/tablet layouts and shadow/material shaders without WebGL errors; controlled-noon snow remains sRGB [171,176,174]. `test:audio` passes desktop/touch gesture unlock, actual sustained jet PCM, the new reload/action voices and node cleanup.

`test:polish` passes NPC gait, specialist loadout/resupply, replicated grenades and launcher crater/blast effects in two browsers. Its first run missed a transient grenade observation despite the server accepting the throw; an isolated rerun passed without changing production behavior. Short-lived effect checks on software rendering are distinct from physical-device timing.

A 1,800-tick local CTF simulation with one human and fifteen NPCs on each of the four map presets keeps every body finite. Container mean ticks range 0.366–0.427 ms, p95 0.997–1.349 ms. This is one minute of simulated time per map, not a prolonged internet match, mobile GPU FPS measurement or proof of capture balance. The compressed client is about 164 KB. Browser checks use actual software-rendered Chromium WebGL/Web Audio and simulated phone/tablet input, separately from physical-device testing.

No hosting provider or capacity change is included. The public HTTP/SQL adapter retains its 16-participant ceiling and higher round-trip latency. Physical iPhone/iPad Safari, thermal behavior, subjective sound/weapon feel and long geographically separated matches still require human testing. This update does not claim those tests occurred.

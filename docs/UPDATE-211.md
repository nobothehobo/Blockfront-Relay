# 2.11 — Branching Battlegrounds

This update changes how players approach objectives. The original straight central road is replaced with three branching approaches, offset base screens and a contested central landmark. All geometry is original and remains ordinary editable voxel terrain.

## Layouts

- **Copperwater Foundry:** northern and southern industrial flanks, a turning yard approach, covered central works and existing watch terraces.
- **Sunbreak Aqueduct:** separated river causeways, offset approaches around a central gatehouse and existing stone viaducts.
- **Rimewater Ridgeline:** raised flanking passes with gradual ramps, lower crossing routes, a central bastion and existing snowy bunkers.
- **Lumen Quay Afterdark:** alternate alley approaches, a staggered station courtyard, offset street screens and existing interiors/rooftop bridges.

Base screens block the previous spawn-to-spawn firing line. Routes reconnect at several places, so players can change their approach instead of committing to a single corridor. Buildings and hills provide intervening cover; outdoor trenches retain continuous floors, headroom and the three-wide access stairs introduced in 2.10. Frontline sector locations move into supported courtyards connected to the walking routes. Map size remains 320 × 320 blocks.

The corridors are accessible routes, not movement restrictions. Players can take other terrain, dig a breach, build an alternate crossing or fly over cover when jetpacks are enabled. Screens and landmarks use the existing chunk renderer, collision, authoritative edits and replication rather than extra client-only meshes.

## NPC navigation

Objective-driven NPCs select a strategic approach using their position, destination and individual lane preference. Sparse route corners guide the existing local pathfinder. Nearby combat and objectives can still use direct steering. NPCs return along their selected route; they continue to jump, dig and move under normal server validation. No teleport or position recovery shortcut is introduced.

## Existing rounds

Hosted rounds saved before this update keep their procedural baseline, terrain edits and session tokens for the remainder of the round. At the ordinary next-round restart, the server generates a fresh branching map, clears prior edits, increments spawn epochs and distributes the new map to connected clients. The terrain cache includes both seed and layout version. Create a new room to try the redesigned layouts immediately, or wait for the next round. Refresh/rejoin for the updated client.

## Verification and limits

`npm run check`, `npm test` (135 checks) and `npm run build:hosted` pass. Added checks verify supported routes and clear headroom across map families and varied seeds, blocked direct spawn sightlines, lane selection in both directions, reachable sector positions and a real autonomous foot-only NPC flag capture on each of the four presets. Capture tests advance normal Room simulation and assert that the bot is never relocated. Hosted migration tests verify preserved old-round edits/sessions and the new-round map/epoch transition.

`test:browser` passes desktop pointer lock, movement, firing, reload, jetpacks and two-browser synchronization over WebSockets, plus phone portrait/landscape and tablet touch movement, look, fire, build, dig, jump, reload and jet controls. `BR_TRANSPORT=http test:banner` passes phone solo CTF with fifteen NPCs, a desktop friend replacing an NPC, keyboard/touch reload animations and all four map presets through normal hosted endpoints. `test:night` passes two city peers, phone/tablet presets, emissive terrain shaders, bounded lighting, synchronized lamp destruction, late joins and the shared outdoor day/night cycle without runtime/WebGL errors. Map screenshots were inspected in actual rendered views.

Browser tests use software-rendered Chromium and simulated touch input. Physical iPhone/iPad Safari, longer competitive matches, subjective route balance and performance on real mobile hardware still need human testing. NPC local search remains bounded; player-built mazes can still require excavation. This update changes layout and navigation, not the hosting provider or public adapter's 16-player limit and higher latency.

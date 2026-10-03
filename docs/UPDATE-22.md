# 2.2 — Frontlines

## New gameplay

**Frontline Control** adds three sectors across the battlefield. Capture by staying within six blocks and four vertical blocks of the beacon for eight seconds. Up to two teammates accelerate capture; opponents contest and stop progress and income. Each held, uncontested sector earns a point each second. First to 300 wins, or the higher score at the timer; the usual intermission and new random map follow. Spawn-protected and eliminated players cannot capture. Existing deathmatch, relay and outbreak modes remain available.

**Supply stations** sit near both team bases. Stand within three blocks for three uninterrupted seconds to replenish class health, ammunition, blocks and grenades. Recent damage prevents resupply for four seconds, and each player has a 25-second cooldown. Enemy-team stations, zombies and eliminated players cannot use it. Supply HUD progress and pickup audio acknowledge completion. No keyboard interaction is required on phones.

NPCs pursue uncaptured sectors, spread choices by personality, defend when all sectors are owned, and return to their own supply station when badly hurt or out of reserve ammunition. Their existing sight, cover, routing and imperfect accuracy remain. These are lightweight tactical bots, not a full squad simulation.

The authoritative room owns capture, contests, score, cooldowns and resources. HTTP persistence includes sector state and its scoring clock. Both transports include sector and supply state; the minimap marks sectors and friendly supplies. Late arrivals see current ownership.

## Graphics

Original batched supply crates, voxel sector lettering, capture rings, team-colored beacons and animated progress indicators make strategic locations readable. Water has animated highlights and a stylized sky reflection in one draw call, without rendering a second scene. Soft character contact shadows use one instanced draw call; they can be toggled in graphics settings. Mobile preset disables contact shadows and water glints. Existing atmospheric sky, terrain corner shading, character animations, combat particles and original weapon models remain.

Daylight fill is brighter in shaded faces while direct sunlight is gentler, preserving terrain color. First-person weapons gain receiver detail and team accents; their solid pieces and hands are merged into one draw call, with only the muzzle flash separate. This offsets the extra objective models instead of making every detail another draw call.

This is a gameplay and readability upgrade, not photorealistic rendering or a copy of another game's art. Terrain shadow maps and physically accurate reflections are not implemented.

## Verification

Unit and authority checks cover capture, contests, scoring, round reset, supplies, life/team restrictions and cooldowns. Hosted persistence tests verify sector ownership and scores survive independent requests and reach two peers. Browser checks cover new Frontline room creation, two clients, visible HUD, NPCs, and shader/runtime errors. Existing desktop/mobile and lag-recovery checks continue to run.

Physical iOS installation, sustained cellular matches and real groups of 16 players still need field testing. The public service retains the HTTP/SQL transport; the dedicated Node WebSocket deployment is the stronger option for sustained FPS matches. Offline play, ranked matchmaking, accounts and advanced squad AI are not part of this pass.

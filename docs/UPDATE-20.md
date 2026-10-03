# 2.0 — Frontier Forces

An original class-based expansion with richer voxel combat feedback. All code, generated sounds, geometry and branding remain original; no commercial game's assets or maps are included.

| Class      | Health | Movement | Starting blocks / grenades | Primary        | Ability                                                    |
| ---------- | ------ | -------- | -------------------------- | -------------- | ---------------------------------------------------------- |
| Trailguard | 100    | Standard | 80 / 2                     | Rifle          | Rally: heal self 20 and nearby teammates 15; 22s cooldown  |
| Skirmisher | 90     | +12%     | 65 / 2                     | SMG            | Surge: +25% speed for 4s; 20s cooldown                     |
| Sapper     | 115    | −8%      | 140 / 3                    | Blast launcher | Resupply: +35 blocks and one grenade, capped; 30s cooldown |
| Surveyor   | 85     | Standard | 55 / 1                     | Marksman       | Focus: reduced spread for 5s; 20s cooldown                 |

Choose a class in the main menu or through the in-game badge/pause menu. Mid-match changes apply on your next respawn. All roles retain the building tools and full sandbox arsenal. Zombies retain their distinct melee-only rules and cannot use grenades, launchers or class abilities. NPCs use varied class loadouts and situational abilities/grenades through normal authoritative simulation.

## Explosives

G / FRAG throws a bouncing grenade with a 2.2-second fuse. Weapon 7 launches a slower visible projectile that explodes on impact or after 3.8 seconds. The launcher holds two rounds, has ten reserve rounds, a 1.1-second firing interval and 2.7-second reload. Grenades/launcher rounds are integrated by the server; players cannot submit an explosion location or damage amount.

Blast damage falls off within 5.5 blocks; terrain cover reduces damage to one quarter. Friendly teammates are protected, but self damage is possible. Spawn shields use the existing protection rules and drop when launching ordnance. Explosions carve a 3.1-block sphere, preserving bedrock, boundaries and objective foundations. A single edit batch replicates the crater; normal remeshing and minimap updates apply. Late joiners receive the altered world. Live projectiles and counters persist across hosted Worker requests, with a 128-projectile room limit.

## Presentation and performance

Authoritative hitscan results supply the endpoints for animated bullet streaks, including shotgun pellets. The streaks are visual feedback; they do not delay hitscan damage. Grenades and launcher rounds are actual authoritative projectiles. Instanced debris, smoke and ordnance share three draw calls, capped at 384 particles / 96 streaks / 128 projectiles; the low-effects preset reduces particle counts and pellet streaks. Camera shake, synthetic explosion audio, first-person muzzle flashes, launcher geometry, reload tilt, class kit silhouettes and terrain corner shading complement the existing procedural clouds, sun, haze and skinned character animations.

No expensive postprocessing or dynamic shadow maps are added. Effects remain optional in quality settings. Balance is an initial working version and needs human playtesting. NPC routing still uses bounded local planning and can struggle with complex player-built fortifications. Physical Safari and geographically separated internet sessions require device testing; emulated Chromium touch is not a substitute.

## Deployment

Run the usual build/tests, then redeploy the client and authoritative server together. Hosted persistence is format 5: old sessions reset once on upgrading, so reload and rejoin. Keep Node WebSockets as the recommended public multiplayer deployment; the hosted fallback remains limited to 16 players and roughly 10 Hz state updates. Classes and explosives do not increase advertised capacity.

# Sky, lighting and NPC polish — alpha 0.7

- Original procedural drifting cloud layers, a soft sun/halo, subtle distant horizon silhouettes and distinct desert, woodland and snow sky palettes. A small generated texture and two sky texture samples avoid heavy volumetric rendering.
- Warm directional light, cool sky fill, terrain-aware biome fill colors and ACES tone mapping. No imported skybox assets or expensive shadow maps.
- Remote humans and NPCs now have articulated legs, arms and head, with walking/running, airborne, aiming, reloading, zombie reaching and shot-recoil poses. Anatomy stays one skinned draw call; motion is cosmetic and does not change authoritative hitboxes. Aim pose comes from the server; gait comes from replicated velocity.
- Sight-based NPC target selection prioritizes actual visible threats rather than the nearest hidden enemy. Last-seen memory expires after 2.5 seconds; bots cannot fire at unseen targets.
- Bounded turn speed, reaction delay, steadier timed strafing, teammate-aware firing, retreat/cover selection when reloading or hurt, and infection-mode distance keeping.
- Local, bounded A* routes around obstacles and rejects unsafe drops. Routes are periodically rebuilt against current voxels. Digging, jumping and validated jetpack use remain fallbacks when an obstacle cannot be routed around.
- Relay carriers head home, defenders recover dropped objectives, and other scouts can escort a friendly carrier. All objectives still use the normal authoritative Room rules.

Rifle sway, damage, health and weapon fire rates were not strengthened. This is a lightweight tactical upgrade, not an aimbot or full global squad-navigation system. Complex player-built labyrinths remain a limitation.

Verification: 40 automated unit/network checks, both-transport two-client and simulated phone/tablet browser suites, elimination camera, and a real-NPC WebGL animation/sky fixture. Real iPhone/iPad Safari performance and geographically separated production multiplayer still require manual testing.

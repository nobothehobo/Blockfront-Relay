# 2.9 — Field Finish

This pass develops the readable, colorful voxel combat style requested from the later Jagex game while keeping Blockfront Relay's maps, names, models, sound synthesis and source original.

## Visible changes

- Terrain ambient occlusion samples the exposed side of each face, rather than the solid side. Material and four corner-occlusion values are part of the greedy merge key, preventing a wall's shading from spreading across an entire merged floor. Screen derivatives soften cube seams at distance; no fullscreen ambient-occlusion pass is added.
- Class models gain original collars, harness straps, earpieces and belt pouches within their existing single skinned body batch. Firearm poses brace the support arm. Remote held items are detailed, batched silhouettes of the actual selected weapon or tool; digging/building no longer makes the held equipment disappear. Zombie variants retain their distinct rigs.
- First-person receivers, sights, cooling ribs, scope housing and shotgun shell holders have more depth. A small tapered muzzle flare replaces the solid flash box, and block targeting outlines appear only while digging/building. A bounded weapon-only look sway and landing settle smooth presentation without modifying camera aim, player movement or server input. Aim/switch position transitions blend rather than snap.
- Shot-confirmation events include authoritative impact position, surface normal, material and player/terrain classification. Client tracers end at those confirmed positions, spawning material-colored chips/dust or nonviolent shield-colored hit chips. Range misses do not create fake sparks. Damage and hit detection remain server-owned; the added fields are compatible with previous clients.
- Original shell casings use a fixed reusable 64-slot pool, capped at sixteen on low effects. Explosion/rocket smoke uses one soft billboard batch instead of hard cube smoke. Existing debris, tracer and projectile batches remain capped. Smoke tint follows the sky; remote muzzle effects originate at the presented weapon.
- The default crosshair shows the projected weapon cone and tightens while aiming. Brief firing dilation is presentation only. Headshots and eliminations have distinct confirmation colors. Alternate crosshair choices remain available.

## Reference review

The [official Steam product page](https://store.steampowered.com/app/224540/) and [official later announcement archive](https://store.steampowered.com/oldnews/?appgroupname=Ace+of+Spades:+Battle+Builder&appids=224540&feed=steam_community_announcements&headlines=0) were checked again. The September 2014 notes document class/weapon presentation, prefab construction and map/menu refinements; December 2015 additions are later than the original 2013–2014 reference period. Previously reviewed official construction-trailer frames and the user's supplied examples support the visual direction. This is an original interpretation, not a claim of copying every historical detail or reproducing proprietary assets.

## Cost and compatibility

No map-generation, movement, damage balance, hosting provider or room-capacity change is included. The six-minute synchronized skies and permanent-night city from 2.8 remain. No new shadow maps, bloom, texture downloads or per-voxel meshes are introduced. Correct corner shading creates additional local quads around occluders; unobstructed planes still merge. Casings and smoke add at most two active batched draws.

The built client is approximately 163 KB gzipped. A warmed container benchmark over 25 central chunks measured mean/p95 mesh work of 1.31/1.80 ms for the foundry seed and 1.68/2.75 ms for the city. Meshed vertex counts were 19,956 and 9,956 respectively. The previous mesh measured 1.87/2.94 ms and 1.26/2.21 ms with 9,132 and 6,016 vertices. These are a small container CPU sample, not mobile GPU frame-rate claims; the existing chunk/draw-distance budgets still apply.

## Verification

`npm test` now has 120 checks, all passing. New tests cover exposed-side occlusion, affected corner/chunk boundaries, flat-face greedy merging, authoritative terrain/player/miss impact data, fixed casing pools and mobile caps, smoke limits, weapon sway/landing settling, and held-equipment replacement. `npm run check` and `npm run build:hosted` pass. The enhanced `test:graphics` passed on the final muzzle-flare build: two-peer firing/casing/impact/smoke feedback, visible rifle/tool swaps, class silhouettes, phone/tablet layouts and mobile limits, with no WebGL errors. A controlled-noon snow sample was sRGB [171, 176, 174], retaining highlight headroom. `test:polish` passed NPC gait, class actions, replicated grenades and launcher craters/effects. The standard `test:browser` passed desktop pointer lock/movement/firing/reload/jetpacks and phone landscape/portrait plus tablet touch movement/look/fire/jump/jet/build/dig/reload on both dedicated WebSockets and the local hosted HTTP/SQL adapter. Software-rendered checks are separate from physical-device or geographic internet validation.

Physical Safari hardware, prolonged iPhone thermal behavior, subjective weapon/sound feel and geographically separated matches still require human testing. The existing public HTTP/SQL transport has higher latency than a dedicated WebSocket host and remains capped at sixteen participants; graphics polish does not remove that hosting constraint.

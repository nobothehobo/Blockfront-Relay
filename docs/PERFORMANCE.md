# Performance notes — alpha 0.4

## 2.10 squad and handling budget

Weapon recovery, reload cue progress and class-specific tilts add no rendering passes or textures; the compressed client is about 164 KB. Recent squad reports expire using their original timestamp. Existing eight-candidate sight checks, roughly five-Hz NPC thinking and bounded local path planning remain. The new obstruction timer lets safely stopped NPCs reach normal validated digging instead of resetting their recovery indefinitely. A 1,800-tick local CTF run per map with one human/fifteen NPCs measured mean 0.366–0.427 ms and p95 0.997–1.349 ms, with all bodies finite. These are container simulation figures, not physical iOS or geographic network results. See UPDATE-210.md for release checks and limitations.

## 2.9 presentation budget

The client is approximately 163 KB gzipped. Exposed-face occlusion is computed while meshing and participates in greedy merging; unobstructed floors remain a single quad. The additional corner detail increases geometry near walls/overhangs, as quantified in UPDATE-29.md. Anti-aliased seams use derivatives in the existing terrain material. Bodies remain one skinned mesh each, under 6000 vertices. Held weapons/tools remain one solid batch per character. Casings use a reused 64-element pool, capped at sixteen on low effects; soft smoke is capped at 96 instances. Those effects add at most two active draws, without shadow maps or postprocess buffers. Physical-device performance remains unmeasured.

## 2.8 atmosphere budget

The complete compressed client is about 160 KB. Day/night is shader/uniform presentation from the existing room clock, without new network messages or a second simulation timer; snapshots include a small derived atmosphere description. Emissive terrain adds one float per meshed vertex, not independent voxel meshes. Stars/clouds use the existing sky draw, with three cloud-texture samples per fragment and procedural star hashing. High effects cap additional street lighting at two nearby shadowless point lights, refreshed at four Hz; mobile/low uses emissive materials only. The single sun/moon shadow map retains its previous bounded preset/refresh budgets. Color/vector temporaries are reused in frame updates. Physical mobile frame rate remains unmeasured.

A local 1,200-tick CTF workload with one human and fifteen NPCs on the new city measured a 0.411 ms mean and 1.064 ms p95 simulation tick. All sixteen bodies stayed finite. Initial city map JSON was 333,271 bytes and the measured snapshot was 13,309 bytes. These are container simulation/serialization figures, not D1 latency, network throughput, combat balance or phone GPU FPS; see the general limits below.

The previous client pulled its current predicted position 28% toward an old server snapshot. This created systematic backward corrections while moving. Prediction now replays unacknowledged fixed-step inputs, and spawn epochs reset the history. Remote players still interpolate; local movement no longer interpolates toward stale positions. Camera smoothing handles actual terrain/collision corrections separately.

The hosted adapter previously constructed generated terrain twice for each restored room and generated all three default worlds during every room-list request. It now copies a cached typed array, applies edit deltas, and reads room-list metadata directly. Round-map event logs store small markers rather than repeating full maps in the database. Nearby chunks build first, and player geometry batches static body parts.

## Reproducible checks

```sh
npm run build:hosted
npm test
npm run test:browser
BR_TRANSPORT=http npm run test:browser
node --import tsx scripts/benchmark.ts
```

On this development container, a 900-tick movement/jetpack workload measured:

| Players | Mean tick | p95 tick | Snapshot JSON |
| ------- | --------: | -------: | ------------: |
| 16      |   0.05 ms |  0.14 ms |   6,327 bytes |
| 32      |   0.08 ms |  0.29 ms |  12,211 bytes |

Generating a seed took 36–38 ms; copying cached terrain took 0.16–0.18 ms. Initial map JSON was about 213 KB for the measured seed. A 32-player snapshot at 10 Hz is approximately 122 KB/s downstream per client before framing/compression; production traffic varies with names, timers, edits and events. WebSocket input packets now contain new commands only, rather than repeatedly resending already delivered input.

These numbers measure the included movement workload and serialization, not a full 32-human combat match, real network bandwidth or physical mobile frame rates. The network test opens 32 actual WebSocket connections and verifies movement acknowledgments and snapshot delivery to each. Prediction tests inject 100/250 ms one-way delay plus jitter and verify no stale-snapshot pull on unchanged terrain.

## Practical limits

Use the Node WebSocket server for larger matches and the best latency. The hosted HTTP/D1 fallback still pays database and request round trips, performs a write for every accepted input request, and remains capped at 16 players. Prediction improves responsiveness but cannot eliminate delayed authoritative hits or SQL contention. Physical Safari thermal performance, cellular conditions, long matches and real 32-player combat remain field-testing tasks. No 60 FPS claim is made from software-rendered Chromium tests.

## Larger battlefield and minimap

Alpha 0.4 expands terrain to 320 × 56 × 320 cells (5.47 MiB per typed array). Greedy geometry builds only dirty chunks near the current view, up to two per frame, with a six-millisecond budget checked between chunks. Individual chunk work can exceed that budget. Distant chunks remain pending until approached. The minimap is a cached Canvas 2D image, rather than a second 3D scene; its terrain tiles have a three-millisecond incremental budget and markers draw at 10 Hz. Routine edits invalidate one tile instead of rescanning the whole map. Physical iOS performance still needs device testing.

## Fieldcraft graphics costs

2.6 uses Standard materials and nearby sun shadows on balanced/high presets. Desktop balanced uses a 1024px map refreshed at most every 180ms; desktop high uses 2048px/120ms. Touch balanced/high use 512px/300ms. Mobile preset has no sun shadow map, retains optional one-draw-call contact shadows, and omits beacon lights. High effects cap beacon illumination at the two nearest visible-range lights, without shadow maps. Equipment uses two batched draws for up to 32 entities. Anatomy stays one skinned draw per character, below 6000 vertices per original model. Shader/material errors and layouts are checked in actual Chromium WebGL; this is not a measured FPS result on hardware or Safari. The new compressed client is approximately 158 KB.

## 2.7 NPC squads

Hosted rooms remain capped at 16 total participants; the new 15-NPC option fills the unused slots instead of increasing that ceiling. Friends replace NPCs when a room is full. Dedicated rooms can request up to 31 NPCs at a 32-participant ceiling; the client offers up to 15. Keep the smaller solo preset on slower mobile devices.

A local CTF workload of one human and fifteen NPCs ran 1,200 ticks on each map preset. Mean simulation tick time ranged from 0.34–0.63 ms; p95 ranged from 1.01–2.24 ms. All bodies remained finite. This measures Room simulation in this container, not D1 latency, concurrent internet matches or mobile FPS. Bounded local planning and five-Hz thinking remain unchanged. Pose interpolation and contact shadows use the same presented positions; stalled snapshots no longer produce running-in-place gait.

# Performance notes — alpha 0.4

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

# Movement stability and voxel art update

Command-mode bodies now move only when executing acknowledged fixed-step commands. Previously, after 500 ms without arrivals, the server ran extra idle physics not represented by the sequence number; delayed jump/jetpack commands replayed from the wrong body. Missing input now freezes movement (not combat, respawns, or the round timer). This deliberately favors consistent replay over extrapolating a disconnected player. Dedicated WebSockets remain preferable to the database-backed HTTP fallback.

Physics coordinates, velocities and fuel retain full precision in snapshots. Command batches allow 64 steps, the pending limit is 120 and saved elapsed-time credit is bounded at two seconds. This improves high-RTT throughput without authorizing extra simulation time. Client simulation uses elapsed frame time rather than truncating every slow frame to 50 ms. Very long stalls still pause prediction at the pending limit; they cannot be made lag-free by smoothing.

Remote interpolation clears at every spawn epoch. Replacing the map immediately discards old chunk geometry, preventing stale surfaces from disagreeing with the collision map. Nearby block edits reprioritize rebuilding immediately.

Trenches have three-wide filled floors across low terrain, central-road tunnel bridges and regularly spaced side stairs. Trees stay clear of the trench/exit corridor. The initial battlefield dimensions remain 320 × 320 × 56.

Art uses a brighter original terrain palette, stronger directional lighting, per-cell tonal variation and subtle shader cube-edge shading with greedy meshes. Original observation galleries, broken pillars, more detailed batched field-kit player models and expanded weapon/hand silhouettes add structure without imported game assets or per-voxel meshes.

Automated checks cover all three biomes, stale-mesh removal, exact snapshot replay at 200/500/1300 ms RTT with jitter, a 1.5-second input stall, movement-time limits, two actual WebSocket peers and 32 simultaneous connections. Browser checks cover desktop and simulated phone/tablet touch controls on both transports. Physical Safari devices and geographically separated production peers still need manual validation.

The hosted map format advances to 4: existing hosted rooms reset once on upgrade because terrain generation changed; old edit journals must not apply to a different base map. Existing sessions must rejoin.

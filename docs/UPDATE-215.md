# 2.15 — Field Feel

This is a focused refinement pass across the existing systems, not a replacement game or a claim that every map, class or device is fully polished.

## Try the focused match

Refresh/rejoin. Open **Solo practice / NPC squad**, press **Recommended Foundry CTF setup**, choose a class, then deploy. The preset selects Copperwater Foundry, seven NPCs (4 vs 4 including you) and a five-minute round, without forcing the connection option. On-device is the default; Online squad remains available for friends. Existing custom map/count/duration controls remain.

Foundry now contains two covered depots with offset entrances connected to the north/south approaches, and three-wide stepped covered bypasses beneath both base approach screens. These are original, destructible voxel geometry. It is one focused map improvement, not a new family for each round. Terrain layout version 2 applies to new maps; previous hosted layouts and edits are restored using their original version until a round restart creates v2. Other map families retain their existing layouts.

## Combat presentation and audio

Firearm presentation has weapon-specific lateral/roll impulses and a damped settle. Existing magazines, shells, pumps, bolt actions and reload sound cues remain. These are cosmetic changes: server damage, fire rate, ammunition, spread, recoil-free input aim and reload permissions are unchanged. Aiming reduces motion.

Hit labels show only server-confirmed damage, aggregate nearby hits on the same target, distinguish headshots and eliminations, then expire. Predicted gunfire alone cannot generate a hit confirmation. Distant gunfire now pans with the listener's heading and attenuates with distance; intervening voxel cover reduces its volume and filters the sharp crack. Explosions receive positional pan and falloff. Sounds remain generated original audio; no copied samples are included.

## NPC tactics and class value

Nearby enemy gunfire gives bots a short-lived, imprecise investigation clue. Walls reduce hearing range, decisions are throttled, and heard positions never grant a visible aim target or permission to fire through terrain. Objective roles retain priority over unrelated sounds. Non-assault bots are more willing to disengage aim and seek cover when locally outnumbered; assault personalities remain more aggressive.

For stolen-flag recovery, one selected interceptor pursues while the second may cut toward the enemy return route. Invalid terrain falls back to pursuit. This is shared objective knowledge, not unseen combat-target tracking. Existing imperfect aim/reactions, escorts and digging remain; automatic combat walls stay disabled.

Trailguard NPCs can Rally an injured nearby teammate even if the healer is healthy. Actual teammate health restored by Rally or a medbox earns server-owned **HEAL** credit on the scoreboard, capped by the patient's missing health and reset each round. Self-healing does not count. No client-supplied healing credit is trusted. This pass makes support more visible; it does not comprehensively rebalance all five classes.

## Mobile and diagnostics

On touch controls, **GEAR** opens the grenade/ability/equipment drawer. A one-shot selection closes it while preserving the action pulse; weapons, SHOOT, aiming, jump, jet and build remain directly available. Class cooldown buttons retain their ability names. Desktop equipment controls and keyboard bindings remain unchanged.

Pause → **Performance & connection diagnostics** includes measured FPS, frame-time p95, mean main-thread CPU work, mean authoritative simulation/NPC decision time and draw calls alongside existing RTT, snapshot age, jitter, prediction queues and corrections. **Show live stats** is opt-in. **Copy report** copies text locally for bug reports; no telemetry is uploaded. If clipboard permission is unavailable, the text is selectable manually.

Timing windows are bounded. Frame time includes browser scheduling; CPU work is not a GPU timer. Server simulation measurements exclude source/map restoration and snapshot delivery, and the hosted HTTP authority measures its current request window. High RTT is not the same as slow rendering. Do not interpret a small simulation measurement as proof that the hosting/network cannot lag.

## Verification limits

Automated checks cover timing windows, hit aggregation/expiry, positional audio math, occluded hearing without hidden aiming, outnumbered responses, teammate healing credit, differentiated flag interceptions and physical Foundry bypass clearance. Existing authority, navigation, terrain persistence and real WebSocket multiplayer regression checks remain. Production builds and the bundled solo worker are checked before publication.

The supported managed browser-control capability is unavailable in this session; browser screenshots and physical iPhone/iPad Safari QA are not claimed. The phone equipment browser test was updated for the drawer but not executed here. Actual thumb comfort, perceived sound balance, animation feel and map pacing still need device playtesting. This update does not claim to resolve all connection or rubber-banding issues.

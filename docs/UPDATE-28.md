# 2.8 — Afterdark Update

## Play

Outdoor maps now move gradually through daylight, warm dusk, blue night and dawn over six minutes. The cycle uses the authoritative room clock: clients briefly interpolate between snapshots, not their own device clocks. Map rounds retain their existing five/eight/ten-minute timers and rotation. The environmental clock continues across rounds. When snapshots stop, sky extrapolation stops after two seconds alongside bounded prediction.

Select **Lumen Quay Afterdark** in **Solo practice → Map** or **Server browser → Create a match → Map layout**. Seed **7259** reproduces the preset. One of twelve seed residues generates this new family in random rotation; the previous three named presets are unchanged. The city stays at midnight deliberately, making its neon identity independent of when you join.

## Original map and lighting

- A 320 × 320 street grid with broad team lanes, 36 varied-height towers, open ground-level interiors, covered entrances, sidewalk cover, two stair-accessible skybridges and opposing outposts. Rooftops have cornices, utility housings and beacon tips. Towers do not yet have multi-storey interiors or rooftop stairwells; roof access uses jetpacks or player construction.
- Cyan/pink marquees, window patterns and amber lamps are original voxel geometry/materials. Small emissive team markers on helmets preserve identification under moonlight, using the existing character batch rather than extra lights. No branded lettering, ripped textures, copied map layouts, commercial models or reference assets are distributed.
- Emissive faces remain in greedy chunk meshes, including low quality. High effects add only the nearest two shadowless street lamps; deleting their anchor voxels extinguishes them on all high-effects clients. Low/mobile omits these extra lights. Existing class beacons retain their separate two-light cap.
- The procedural sky adds moon/stars and night-tinted clouds; sky, fog, water reflection, key light, hemisphere fill and exposure transition together. Night fill preserves character readability. Cube-edge contrast is slightly softer; sunset highlights do not require bloom or HDR postprocessing.
- A single bounded sun/moon shadow map keeps existing preset sizes and refresh intervals. Its light position updates with the cached depth refresh, avoiding a moving light against stale shadows. No extra shadow map or per-voxel draw is introduced.

## Reference review

The [official Steam listing](https://store.steampowered.com/app/224540/) documents the later Battle Builder edition's class-based construction/destruction and modes. The [official announcement archive](https://store.steampowered.com/oldnews/?appgroupname=Ace+of+Spades+Complete&appids=224540,231970&feed=steam_community_announcements&headlines=0) includes December 2015 class/equipment additions and rendering/performance fixes. This is later content, not proof of the 2013 launch roster.

Saved frames from the official Steam-hosted **How to Build your Battleground** trailer were visually reviewed again: dense urban silhouettes, colored signage against a dark environment and readable voxel edges informed this pass. Its precise release date remains unverified, and its editor footage is not multiplayer timing evidence. The separate 2013 YouTube trailer could not be fetched here. “Peak” visual quality is a subjective reference target, not a claim of matching every historical effect. The implementation and assets remain original.

## Verification and migration

`npm test` includes 114 checks. New coverage tests the complete cycle, phase continuity/repetition, city nighttime lock, authoritative late-join clock, open city lanes/doorways/bridge landings, batched emission attributes, lamp caps/removal, water phase, hosted clock persistence, edited city maps on late join and live pointer-lock input gating.

The hosted two-browser check reproduced a stale cached pointer-lock flag that could discard desktop clicks after joining. Mouse look, firing and wheel selection now consult the browser's live lock target; pause/unlock behavior remains unchanged. The browser check waits for initial map work to settle and checks firing/reloading against authoritative ammunition.

`npm run test:night` launches real WebGL desktop/mobile/tablet views and two authoritative WebSocket clients. It checks both clients' city phase, low-quality light/shadow limits, a real server explosion's replicated terrain removal, an extinguished lamp on an existing and late-joining high-effects client, and shared outdoor midnight/dawn/noon. Clock fast-forwarding is test-fixture-only; no production mutation endpoint is added. Screenshots are generated in `artifacts/`.

Verified during this pass: `npm run check`, `npm run build:hosted`, all 114 `npm test` checks, `test:night`, `test:graphics`, `test:polish`, and `test:banner` plus `test:browser` on both WebSockets and the local hosted HTTP/SQL adapter. Desktop checks cover pointer lock, movement, firing, reload and jetpacks. Phone landscape/portrait and tablet checks use touch movement/look, fire, jump, jetpack, placement and digging. The graphics suite's controlled-noon snow sample was sRGB [176, 181, 179], retaining surface highlight headroom; no shader/runtime errors were found. The NPC/ordnance suite checks gait settling, class actions, replicated grenades and launcher craters, and resumes through the real pause UI when changing browser pages.

Hosted save format is now 8. Existing format-7 outdoor rooms retain sessions, edits and match state. Format-7 rooms whose seed is newly reserved for the city reset on join to avoid restoring old terrain edits onto a different map baseline. Refresh/rejoin if an old session expires.

Physical Safari/iPhone/iPad GPU performance, prolonged thermal behavior and geographically separated full matches still need human playtesting. Software-rendered Chromium checks do not establish hardware FPS. This pass does not change hosting providers, the hosted 16-participant ceiling, or its higher-latency HTTP/SQL transport.

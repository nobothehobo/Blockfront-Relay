# 2.5 — Banner Patrol

## Play

Open the existing public game, reload, choose **Solo practice / NPC squad**, then **Capture the flag**. Choose a map, NPC count and round length and deploy. Seven NPCs plus you form balanced 4-v-4 teams. Friends can join the same named room from Server browser. This requires the game server; it is not an offline campaign or a private room.

## Changes

- Separate CTF mode and default Banner Patrol room on both transports. Enemy flags are picked up automatically nearby, dropped on death/disconnect, returned by teammates or after 25 seconds, and captured at home only while your own flag is home. Three captures win. Scores clear before the next warmup.
- CTF NPCs have stable defenders/raiders. Non-defenders escort friendly carriers, and the two closest living NPCs recover a dropped flag or intercept its carrier. Bots use ordinary validated inputs and existing imperfect aim, reaction times and collision-aware local routes. Friendly role labels and flag HUD/minimap state expose their work.
- Solo setup offers all six modes, three map presets or random maps, 3/5/7 NPCs and 5/8/10-minute rounds. An unused matching practice room can be reused; active human sessions are not silently joined. Room capacity grows to sixteen rooms, not sixteen guaranteed concurrent full matches.
- Outbreak practice infects NPCs first at round start so the human begins as a survivor. Joining an already-active outbreak still follows its normal infection rules.
- Empty, explicitly marked practice rooms expire after five idle minutes when another room is created, releasing capacity without deleting normal custom rooms or live human sessions. Hosted deletion checks the saved version to avoid racing a join.
- Original Foundry, Aqueduct and Ridgeline families vary buildings, river width, causeways, stone overlooks and elevation, not just palettes. New-round seeds avoid immediately repeating the same layout family. Maps retain the 320 × 320 size, continuous trenches and editable voxel structures.
- Rifle/SMG/marksman magazines move during reloads; hands, bolt handles and shotgun pumps animate. Shell/launcher-round presentation, open/load/close reload phases, weapon switching, sprint lowering and tool swings add handling feedback. These are cosmetic: server-owned ammo, reload times, hit detection and fire rate are unchanged. Shotgun reload is still a whole-magazine rule, not individually cancellable shells.

## Verification and limits

`npm test` covers CTF pickup, drop, return, blocked capture, victory/reset, NPC role assignments and a bot actually navigating out and back to capture. Hosted SQL tests verify two sessions see the same flag carrier and score, including late joins and disconnect drops. Map tests check deterministic/lossless generation, safe bases, distinct layouts and rotation. Animation tests check bounded poses and return-to-ready behavior.

`npm run test:banner` checks phone solo setup with seven NPCs, a desktop friend joining the same match, moving reload parts via keyboard and real emulated touch, and all three map presets. Run `BR_TRANSPORT=http npm run test:banner` for the local hosted adapter. The standard browser suite also verifies desktop/phone/tablet controls. Test fixtures never add production mutation endpoints.

Hosting is unchanged: the public game uses the existing authoritative HTTP/SQL adapter; a new paid service or persistent public WebSocket host is not provisioned. Format 7 resets old hosted rounds because map generation changed. Reload/rejoin to load the new client. Physical Safari, sustained full-room combat and navigation through arbitrary player-built mazes still need testing. Bots are bounded local agents, not coordinated campaign AI. Presets are procedural layouts, not fully authored commercial maps.

Release verification: 90 automated tests pass, including the real 32-WebSocket smoke test. Two-client CTF/setup/reload/map browser checks pass on Node WebSockets and the local hosted HTTP/SQL adapter. Standard desktop, phone landscape/portrait and tablet controls pass on both transports. The HTTP failure-recovery check passes with a timed-out request, oversized-packet recovery and 250ms injected latency. These are controlled local checks, not proof of a lag-free internet session or physical Safari testing.

# Verification

2.12 adds `tests/reliability.test.ts` for stable elimination framing, Space-held airborne thrust, on-device squad balance and actual bounded packets/replay through simulated 1.4-second RTT. The SQL-backed worker regression checks that a 42-command delayed batch is fully acknowledged against elapsed-time credit. After `npm run build:hosted`, run `node --import tsx tests/practice-bundle.ts` to execute the production practice asset in a Node background worker and verify welcome, 16-player CTF and packed movement acknowledgment. This is not browser or physical iPad verification. Browser QA was unavailable for this release in the current managed environment; the supported control-browser skill was absent.

2.11.1 adds touch-capable hardware keyboard regression checks and `test:keyboard`, which explicitly removes/rejects pointer lock in an iPad-sized browser while testing a desktop peer and hybrid input. The full unit/network/worker suite passes 137 checks. See [iPad keyboard controls and device limits](IPAD-KEYBOARD.md).

Branching Battlegrounds (2.11) passes 135 automated checks. `tests/layout.test.ts` checks supported/headroom-cleared routes across map families and varied seeds, obstructed spawn sightlines, NPC lane choice/reverse routing and an autonomous foot-only CTF capture on every map without relocation. Hosted migration checks verify preserved prior-round terrain edits and sessions, then the fresh layout/map/epoch on normal round restart. Current browser verification is recorded in [UPDATE-211.md](UPDATE-211.md).

Field Finish (2.9) has 120 automated checks, including correct exposed-face occlusion/greedy merging, authoritative terrain/player/miss impact metadata, capped reused casing pools, smoke limits, weapon sway/landing settling and visible held-item swaps. The NPC/two-browser ordnance suite passed with the new smoke shader. The enhanced graphics suite verifies accepted firing effects and rifle/tool swaps in two actual WebGL views. It uses persistent effect counters to check short-lived particles and corrects headless pointer-lock cursor warps through ordinary relative-look events, without assigning client simulation state. Final reruns for this release are recorded in UPDATE-29.md.

Automated checks are in `tests/`. Unit tests exercise the actual authoritative Room code, not duplicated gameplay implementations. Afterdark Update passes 114 automated checks. The new `npm run test:night` uses two actual WebGL clients plus a late join to verify shared city midnight, emitted terrain deltas, lamp removal, phone/tablet limits and shared outdoor midnight/dawn/noon, including water phase. The fixture fast-forwards room time only in tests. No debug mutation endpoint ships. Live pointer-lock gating also has a regression check, and the hosted banner suite verifies desktop firing/reloading after the first map has settled.

The existing graphics suite verifies snow highlight headroom at controlled noon, class/ infected rigs and shadow/touch presets. `npm run test:banner` and `BR_TRANSPORT=http npm run test:banner` now exercise all four map presets through ordinary production endpoints. Previous 2.7 elimination and NPC/ordnance polish verification is documented in UPDATE-27.md; actual 2.8 reruns are recorded in UPDATE-28.md.

2.7 adds settled-foot step navigation, jump throttling, presented-position contact shadows, 15-NPC team balance/slot replacement and hosted persistence checks. The graphics suite also checks unclipped snow-surface pixels and ammo/control separation at 1024 × 352 and 844 × 390. The banner suite fills 8-v-8 through ordinary solo UI and checks that a joining friend replaces an NPC on both transports.

2.6 adds `tests/fieldgear.test.ts` for server-owned deploy pulses, inventory, range/support/occupancy, life/infection/phase restrictions, medbox sight and health limits, mine arming/cover/team rules, timed charge damage/craters, lifecycle limits, Delver tunnel batches/cooldowns and protected foundations. Hosted tests verify gear/inventory/IDs across independent requests, both peers, late joins and previous-release rooms. `npm run test:graphics` renders all five class rigs and three infected variants, checks shader errors and shadow presets, verifies two-browser beacon and Bore replication, and checks touch gear plus phone/tablet layouts in a controlled authoritative fixture.

2.5 adds `tests/banner-patrol.test.ts` for CTF rules, squad role allocation, an autonomously navigating flag runner, distinct map families/rotation and bounded weapon-action poses. Hosted SQL tests cover carried/dropped flags, captures and late-join state across independent sessions. `npm run test:banner` and `BR_TRANSPORT=http npm run test:banner` exercise solo setup, fifteen NPCs, a desktop friend in the same room, keyboard/touch reloads and every map preset using normal production endpoints.

- Deterministic 320 × 320 map and lossless RLE, including edited map on late join.
- Minimap surface samples after destruction/placement, far-edge coordinates, live teammate filtering and clear larger-map bases.
- Movement/input validation, server-owned speed and rejection of nonfinite values.
- Hitscan, occlusion, friendly-fire protection, ammo, cooldowns, reload cancellation.
- Death, synchronized state, respawn and TDM scoring.
- Dig/build delta messages, resource accounting, range and player occupancy rejection.
- Relay theft, death drop, teammate return, capture and victory rules.
- Jet thrust, fuel depletion, recharge and disabled jetpacks.
- Zombie conversion, melee-only state, end conditions and human survival.
- Round timer, changed seed, identical fresh map snapshots, old-epoch rejection and compact hosted round markers.
- Exact movement replay at 200/500 ms round-trip latency plus jitter, bounded simulation time under flooding and brief batched fire taps.
- Thirty-two-player simulation and 32 real WebSocket-connection smoke tests.
- Hosted session auth, common state and concurrent CAS joins.
- Five class loadouts and respawn-only changes, server abilities/cooldowns, grenade bounce/fuse/inventory, launcher impact/ammo/rate, cover-aware blast damage and replicated crater batches, protected foundations and late joins. Hosted persistence tests verify class selection, active ordnance and explosion feedback across requests.
- NPC slot replacement, authority-driven movement/combat/reloading/respawning, occlusion, objectives, infection and shared hosted persistence.
- Local obstacle routes, safe-drop rejection, visible-target prioritization, last-seen memory expiration, retreating reloads, relay-carrier navigation and articulated pose math.
- Real WebSocket-client integration for movement, map edits/late joins, fuel, combat, death and respawn.
- Touch deadzone, bounded diagonal movement, forward-only sprint and aimed-look gain; elimination camera occlusion and visible player position.

`npm run test:elimination` starts an isolated authoritative Room/WebSocket fixture and applies real server damage to the browser player. It checks the third-person model, countdown, hidden crosshair and return to first person after server respawn. The controlled fixture exists only in `tests/` and adds no debug endpoints to production.

`npm run test:polish` runs an actual server-controlled NPC in a shared test courtyard. It verifies the WebGL skinned model, gait progression from authoritative movement and alternating legs, checks browser and shader errors, and saves sky/character screenshots for visual review. Headless pointer-lock camera input uses a standard relative mouse event. This fixture is not deployed. CI runs both additional browser checks.

Browser checks use real Chromium WebGL rendering, two browser pages and trusted emulated touch events. Desktop checks include pointer lock, keyboard movement, weapon selection, shooting, reload and jetpacks. Phone landscape (844 × 390), phone portrait (390 × 844), and tablet (1024 × 768) checks include joystick movement, touch camera, fire/build/dig/jump/reload/jet inputs, aim toggling, direct weapon selection, drag-to-fire aiming, simultaneous two-thumb movement/firing and control bounds. Minimap checks verify full terrain initialization, desktop M toggle, touch open/close, and compact/expanded map bounds in each viewport. iPad-sized checks launch an NPC practice match. Screenshots are inspected for layout defects. The same suite can run against the hosted HTTP adapter's local SQL-backed harness.

`npm run test:fieldwork` adds two real WebGL clients observing the same authoritative kit batch, desktop kit ghosts and scoped aiming, specialist weapon rejection, and native-touch kit selection/placement and class jetpacks on phone landscape/portrait and tablet sizes. Unit checks cover connected kit geometry, doors and solid ramps, rotations, atomic resource accounting, terrain/players/support/range/foundation rejection and late joins. Hosted checks cover specialist room creation and persistence. Browser test fixtures remain outside the deployed client/server endpoints.

`npm run test:audio` runs actual Web Audio graphs after desktop/touch gesture unlocking. It checks non-silent PCM output, sustained rather than restarted engines, the four-engine cap, live mute and one-shot node cleanup. Audio mixing unit tests cover life/fuel/equipment, pause/visibility, nearest remote players, distance falloff, stereo heading and server-owned thrust snapshots. The normal two-client browser suite also checks in-game thrust starts and stops on F. These checks validate synthesis and lifecycle, not subjective fidelity to another game's sound recordings.

Remaining validation:

- Physical iPhone and iPad Safari; verify multitouch, audio unlocking, notch safe areas and thermal behavior during a full match.
- Real Windows/macOS browsers and hardware GPUs; these have not been physically tested here.
- Internet play under cellular latency, packet loss and reconnections.
- Long sessions, many thousands of edits, and real 16/32-player internet load testing.
- Balance with human players, particularly mobile aiming, zombie climbing and jetpacks.
- Docker image and HTTPS reverse proxy on a real hosting account.

There is no claim of measured 60 FPS on physical mobile hardware. Greedy chunks, distance culling and capped pixel ratios are implemented; real-device performance remains to be measured. Gamepad and custom desktop bindings are future work.

The public test URL uses the hosted HTTP/SQL adapter. Controlled local tests of that adapter and the dedicated WebSocket server do not constitute verification of a live match across separate physical devices and internet connections.

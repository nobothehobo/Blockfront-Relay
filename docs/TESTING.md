# Verification

Automated checks are in `tests/`. Unit tests exercise the actual authoritative Room code, not duplicated gameplay implementations.

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
- Four class loadouts and respawn-only changes, server abilities/cooldowns, grenade bounce/fuse/inventory, launcher impact/ammo/rate, cover-aware blast damage and replicated crater batches, protected foundations and late joins. Hosted persistence tests verify class selection, active ordnance and explosion feedback across requests.
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

The published URL remains owner-private. Direct external test requests encountered a sign-in barrier; local transport and browser tests do not constitute verification of a live match on separate physical devices. Friends need site access, or a deployed public Node server, to join.

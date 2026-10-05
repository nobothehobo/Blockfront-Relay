# Blockfront Relay

An original, playable multiplayer voxel FPS. Built from scratch; no Ace of Spades code or assets are included. Temporary working title. **2.11.1 — iPad Keyboard Fix.**

**2.11.1:** keyboard movement on touch-capable devices, iPad trackpad aiming/firing without pointer lock, edge turning, arrow-key look and quick touch/keyboard switching. See [iPad keyboard controls and verification](docs/IPAD-KEYBOARD.md). Refresh/rejoin for the fix.

**2.11:** three branching approaches per map, offset base screens, original central landmarks, connected objective courtyards and NPC strategic lane routing. The direct base-to-base road is replaced with flanks and contested cover. Existing hosted matches preserve their terrain and sessions until the next round. See [changes and testing](docs/UPDATE-211.md). Refresh/rejoin to load the update.

**2.9:** corrected terrain corner occlusion, quieter anti-aliased voxel edges, more detailed class gear and first-person weapons, real held NPC weapons/tools, smoother weapon sway/landing, shell casings, softer explosion smoke and server-confirmed material-colored impact chips. The default crosshair responds to weapon spread and aiming; headshots and eliminations have distinct feedback. See [changes, references and verification](docs/UPDATE-29.md). Refresh/rejoin to load the update.

**2.8:** a synchronized six-minute day/night cycle with sunset, dawn, stars, moonlight and moving shadows; plus the original **Lumen Quay Afterdark** neon-city map. Choose it in Solo practice → Map or Server browser → Create a match → Map layout. Its streets, open buildings, signs, lamps, cover and skybridges are destructible; the city stays at night. All four map families work with existing modes and NPC options. See [changes, research and verification limits](docs/UPDATE-28.md). Refresh/rejoin after updating.

**2.7:** controlled snow highlights and biome exposure, smoother NPC poses and matching contact shadows, corrected step navigation and throttled jump fallback. Solo and custom rooms now offer up to 15 NPCs: 8 vs 8 including you. See [changes and verification](docs/UPDATE-27.md).

**2.6:** rebuilt original class and infected character models, physically based materials, improved sun/bounce lighting and nearby shadows, twilight Outbreak sky, and a fifth excavation role. Medboxes, light beacons, timed charges and proximity mines are playable server-authoritative class equipment. See [Fieldcraft details, controls and limits](docs/UPDATE-26.md).

**Public test:** [Play Blockfront Relay](https://blockfront-relay.nobothehobo.chatgpt.site).

**2.5:** cooperative NPC Capture the Flag, a configurable solo setup screen, three structurally different map families, and moving magazines/bolts/pumps and phased reload animations. See [release notes and limits](docs/UPDATE-25.md). Reload/rejoin after updating; old hosted rounds reset to use the new terrain baseline.

**2.4:** jitter-aware server-time interpolation, pause-menu connection diagnostics, dedicated-server bounded hitscan rewind, WebSocket heartbeats, server tick diagnostics, safer diagonal step climbing, and a bridge input fix. See [2.4 release notes and limits](docs/UPDATE-24.md). This starts the proposed 3.0 reliability pass; it does not provision a new public WebSocket host.

**2.3:** Stronghold Demolition, bounded authoritative structural collapse, Sapper terrain breaches, a bridge construction kit, precision headshots, four traversable foundry buildings, and optional desktop terrain shadows. See [2.3 release notes and limits](docs/UPDATE-23.md).

Source: [nobothehobo/Blockfront-Relay](https://github.com/nobothehobo/Blockfront-Relay).

## Play

**iPhone / iPad app:** open in Safari → Share → Add to Home Screen → launch **Blockfront** from its icon. Standalone launch removes Safari's browser bars and keeps controls within safe areas. Existing shortcuts may need to be removed and added again. See [Home Screen instructions and device-testing limits](docs/HOME-SCREEN.md).

Connection recovery now bounds input packet sizes and prediction, times out hung requests, and retries temporary failures. See [the verified freeze fix and transport limits](docs/CONNECTION-FIX.md).

The browser client has a main menu, server browser, custom rooms, settings, and a field manual. Choose a callsign and press **Play multiplayer**. Matches start with two players after an eight-second warmup. A lone player can explore, practice shooting, build, and dig while waiting.

- **Team deathmatch:** Azure vs Ember; 40 eliminations or five minutes.
- **Frontline Control:** capture three sectors, defend them with builds, and earn points toward 300. Team supply stations replenish health, ammo, blocks and grenades after a safe three-second dwell. Sector-aware NPCs, supply crates, capture beacons, animated reflective water and optional soft contact shadows are included. See [2.2 release notes](docs/UPDATE-22.md).
- **Capture the relay:** steal the enemy relay and bring it home while your own relay is home; three captures wins. Approach objectives to interact automatically. Dropped relays return after 25 seconds.
- **Capture the Flag — Banner Patrol:** classic three-capture rules with NPC defenders, raiders, carrier escorts and closest-pair flag recovery/interception. Your flag must be home to score. Carry/drop/return rules share the proven authoritative relay implementation.
- **Humans vs Zombies:** humans survive five minutes. One carrier per five players starts infected, with at least one carrier. Eliminated humans convert to zombies. Zombies have melee only, more health, regeneration, stronger jumps, wall scrambling, and faster digging.
- **Jetpacks:** configurable off / everyone / central pickup / relay and outbreak modes / Skirmisher class only. Fuel, gravity, momentum, collisions and fall damage are server controlled.

The north-up minimap shows terrain, your heading, living teammates, bases, relay objectives and jetpack pickups. It updates after terrain edits and round changes, without revealing enemy positions.

Audio uses original synthesized retro gun reports, mechanical reloads, crunchy block impacts and fuller explosions. Continuous jetpack thrust includes ignition/shutdown, fuel-dependent tone and nearby-player stereo engines. Loops respect mute, pause, life and fuel. See [audio design and limits](docs/AUDIO.md).

**Classes:** choose Trailguard (rifle + nearby healing), Skirmisher (SMG + speed burst), Sapper (blast launcher + building resupply), Surveyor (marksman + accuracy focus), or Delver (shotgun + tunnel boring). Each has distinct health, speed, block/grenade reserves and original field-kit silhouettes. Class changes apply on respawn; every role retains access to the sandbox arsenal. Grenades bounce and explode; launcher rounds detonate on impact. Both damage players and carve synchronized voxel craters. Animated bullet streaks follow authoritative hitscan endpoints; bounded instanced debris, smoke, muzzle flashes and explosion audio add feedback. Terrain gains baked corner shading. See [2.0 release notes](docs/UPDATE-20.md).

**2.1:** original cover walls (6 blocks), connected four-step ramps (30) and open-door shelters (50) can be placed as an atomic kit. Select Blocks, then B or the touch KIT button to cycle; green/red footprint ghosts show whether placement is valid. All cells are checked for resources, terrain, players, support, range and protected foundations before any are created. Server edit batches replicate to everyone and late joins. Custom rooms now offer **Specialist loadouts** and **Class jetpacks** by default; these do not change existing sandbox rooms. Only Sapper can use the launcher in specialist rooms, Skirmishers get class jetpacks, and Sappers dig faster. Weapon handling gains bounded cosmetic recoil, smoother aim transitions and an original marksman optic. See [Fieldwork and reference research](docs/UPDATE-21.md).

Maps span 320 × 320 blocks. **Copperwater Foundry**, **Sunbreak Aqueduct**, and **Rimewater Ridgeline** presets offer an industrial district, a broad river with causeways/viaducts, and elevated ridges with separated bunkers. Layout families also combine with woodland/desert/snow palettes and seeded variations. Every next round generates a fresh seed in a different layout family. Create a room with 5/8/10-minute rounds and 16/32 slots; 32 slots require the dedicated WebSocket server. Hosted rooms remain capped at 16 players.

Choose **Solo practice / NPC squad**, then select one of six modes, a map preset or random seed, 3/5/7/11/15 NPCs, and a 5/8/10-minute round. Seven, eleven or fifteen NPCs plus you create balanced 4-v-4, 6-v-6 or 8-v-8 matches. This is **server-backed practice, not offline play or a private campaign**; friends can join its named room from the browser. Custom rooms still allow 0/2/4/6/8/11/15 NPCs. Scouts use the same combat, damage, reload, respawn, objective and infection rules as players. NPCs yield full-room slots to humans and disappear after the last human leaves. They use bounded local obstacle routing, sight-based targets, short last-seen memory and cover-seeking retreats. In CTF, squads divide defense, raids, carrier escorts and nearby recovery/interception rather than all chasing one objective. They can still struggle with elaborate constructions.

Alpha 0.7 adds original drifting cloud layers, a soft sun and atmospheric horizon, biome-specific lighting and filmic tone mapping. Remote characters (including NPCs) use a single skinned anatomy mesh with articulated walking, airborne, aiming, reload, zombie-reaching and firing poses. Improved AI keeps the deliberately imperfect accuracy from alpha 0.5. See `docs/UPDATE-07.md` for details.

Alpha 0.5 increases NPC rifle aim sway slightly (yaw ±0.016 radians, pitch ±0.008) without reducing health, damage, fire rate or aggression. Zombie melee has no firearm sway. Eliminations show your original player model in a terrain-aware third-person camera during the three-second respawn countdown; first-person view returns automatically. Mobile controls include a joystick deadzone, forward-only sprint feedback, larger action targets and slower aimed camera movement (especially with the marksman weapon).

## Local run — Windows, macOS, Linux

Install Node.js 22.13+ (Node 24 recommended) and Git. In your shell:

```sh
git clone https://github.com/nobothehobo/Blockfront-Relay.git
cd Blockfront-Relay
npm ci
npm run build
npm start
```

Open **http://localhost:3000**. The same process serves the built game, REST room browser, and WebSockets. A second browser tab can join the same room.

For two devices on your home Wi-Fi, find the host computer's LAN IP, for example `192.168.1.25`, then open **http://192.168.1.25:3000** on the iPhone/iPad/second computer. Allow inbound TCP port 3000 through the computer firewall; disable guest-network device isolation. Keep the terminal running. Use Safari on iOS/iPadOS; landscape is recommended on phones.

For client development with hot reload, run `npm run dev` in one terminal and `npx vite --host 0.0.0.0` in another. Open port 4173. Vite proxies `/api` and `/ws` to port 3000. The production single-process instructions above do not require Vite.

## Deploy for internet multiplayer — recommended WebSocket server

The easiest portable deployment serves both client and server from one HTTPS origin.

```sh
docker build -t blockfront-relay .
docker run --restart unless-stopped -p 3000:3000 -e PORT=3000 blockfront-relay
```

Put an HTTPS reverse proxy in front of port 3000. A ready-to-run Caddy setup is included:

1. Point a domain's DNS A record to a small Linux VPS.
2. Install Docker with Compose. Copy the repository there.
3. Copy `.env.example` to `.env` and add `DOMAIN=game.yourdomain.com`. Set `ALLOWED_ORIGINS=https://game.yourdomain.com`.
4. Run `docker compose up -d --build`.
5. Allow inbound ports **80 and 443** on the VPS. Caddy obtains TLS certificates automatically. Open **https://game.yourdomain.com** on every device.

One Node process owns all its rooms. **Do not horizontally load-balance independent Node replicas** without routing every room's connections to its owner. Node rooms support up to 32 players, with a global cap of 128 connections and sixteen rooms per process. A 32-connection automated smoke test passes; benchmark your host before running several full rooms. Start with a modest VPS and inspect CPU and traffic. Billing and actual regional prices are not assumed.

Alternative: use a Docker-capable host that supports long-lived WebSockets. `render.yaml` is included. Create a Web Service from the new GitHub repository, use the Docker runtime, set `/api/health` as its health-check path, and use one instance. Render assigns `PORT`. A sleeping free service may disconnect players; use an always-on service for regular games. Confirm the provider's current plan terms before purchasing.

### Separate client and server domains

At client build time:

```sh
VITE_SERVER_URL=https://your-server.example npm run build
```

PowerShell:

```powershell
$env:VITE_SERVER_URL="https://your-server.example"
npm run build
```

Or enter the server's HTTPS URL under **About & connection → Server URL**, then **Connect**. This preference saves locally. The server needs `ALLOWED_ORIGINS` including the client origin. HTTPS clients require HTTPS/WSS servers; a plain HTTP endpoint will be blocked by browsers.

## Hosted browser edition

The Sites deployment includes a second server adapter, `worker/index.ts`, using a D1-backed optimistic compare-and-swap room transaction. This is **real shared, server-authoritative multiplayer**, using HTTP input/state exchange around 10 Hz. It is not peer-to-peer and does not rely on isolate-local room memory. The same room simulation handles both transports.

The hosted edition is a convenient small-match fallback. Database round trips add latency, every input transaction writes a room record, and contention grows with player count. **For the best FPS experience and larger matches (up to 32 players), deploy the Node WebSocket server.** Hosted transport is not claimed to have passed a 16-player internet load test. The linked test site is public; private Sites deployments require an explicit sharing change before friends can join.

Build the hosted artifact with `npm run build:hosted`. `.openai/hosting.json` declares a D1 `DB` binding; generated schema migrations are in `drizzle/`. Publication applies migrations before uploading `dist/server/index.js`. The Worker embeds the small client bundle, so external asset URLs are unnecessary. Production schema changes use `npm run db:generate`; never mutate deployed migrations.

## Controls

**iPad with Magic Keyboard / trackpad:** join, then click **KEYBOARD** or press WASD. Click the game and move the pointer to aim; a screen edge keeps turning. Click fires, Z aims, Enter also fires, arrow keys look, and P pauses. **TOUCH** restores finger controls; keyboard movement still works in Touch mode. Settings → Input selects Auto, Touch or Keyboard. Without pointer lock the system cursor remains visible.

| Action                      | Desktop                  | iPhone / iPad                                      |
| --------------------------- | ------------------------ | -------------------------------------------------- |
| Move / sprint               | WASD / Shift             | Floating left stick; push farther to sprint        |
| Look                        | Mouse with pointer lock  | Drag right side or SHOOT                           |
| Fire / use selected tool    | Left click               | Hold SHOOT / PLACE / DIG                           |
| Aim                         | Right click              | Tap AIM to toggle                                  |
| Jump / zombie wall scramble | Space                    | Hold JUMP                                          |
| Crouch                      | Hold C                   | Tap CROUCH to toggle                               |
| Reload                      | R                        | RELOAD                                             |
| Select weapon / tool        | 1–7 or mouse wheel       | Tap weapon name; choose from picker                |
| Throw grenade               | G                        | FRAG button                                        |
| Class ability               | V                        | Named ability button                               |
| Deploy class field gear     | K                        | Named gear button (MEDBOX / LUMEN / CHARGE / MINE) |
| Change class                | Class badge / pause menu | Class badge / pause menu                           |
| Dig                         | Hold Q                   | BUILD → hold DIG                                   |
| Build                       | Hold E                   | BUILD → hold PLACE; tap again for gun              |
| Cycle construction kit      | B (selects Blocks)       | With Blocks selected, tap KIT                      |
| Jetpack                     | Hold F                   | Hold JET                                           |
| Expand minimap              | M                        | Tap MAP; tap CLOSE MAP to dismiss                  |
| Scores                      | Hold Tab                 | Scores button                                      |
| Pause / release mouse       | Esc                      | Pause button                                       |
| Relay interaction / pickup  | Walk near it             | Walk near it                                       |

1 Rifle · 2 SMG · 3 Shotgun · 4 Marksman · 5 Spade / Delver bore drill · 6 Blocks · 7 Blast launcher. Digging yields blocks, up to 200; class loadouts determine starting reserves. Terrain edits reach six blocks; zombies dig seven blocks away. The bottom layer and a small spawn foundation are protected, including against explosions. Placement inside living players is rejected. Edits last until the next round, and late joiners receive the current edited map. Zombies cannot use explosives, field gear or class abilities.

Construction kits include a cover wall, ramp, shelter and eight-block bridge. Sapper's ability also breaches nearby terrain along the aim ray.

Settings save locally: quality preset, render distance, effects, FOV, master/effects volume, desktop/touch sensitivity, touch control scale, invert look and crosshair. Mobile preset uses contact shadows; balanced/high can enable nearby terrain/character sun shadows, including on touch devices. High effects allow at most two nearby beacon lights. Background music, controller support and custom keyboard bindings are not implemented.

## Source layout

```text
client/      Three.js renderer, greedy chunk meshing, UI, touch/desktop input, sound synthesis
server/      authoritative simulation and Node REST/WebSocket adapter
shared/      world generation, voxel DDA, movement/collisions, weapons, protocol types
worker/      hosted HTTP adapter and asset bundling declaration
assets/      asset attribution; graphics and audio are generated in code
db/          hosted schema definitions
drizzle/     immutable generated hosted migrations
docs/        architecture, protocol and testing notes
tests/       simulation, networking, hosted concurrency and browser checks
```

## Checks

```sh
npm run build:hosted
npm test
```

For local Chromium QA, download Playwright Chromium with `npx playwright install chromium`, or set `BR_BROWSER_PATH` to an existing Chromium executable. In constrained environments, `node scripts/prepare-browser.mjs` extracts the bundled npm Chromium runtime to `/tmp/br-browser/chromium`. Then:

```sh
npm run test:browser
BR_TRANSPORT=http npm run test:browser
npm run test:elimination
npm run test:polish
npm run test:graphics
npm run test:fieldwork
npm run test:audio
```

PowerShell users can set `$env:BR_BROWSER_PATH` and `$env:BR_TRANSPORT` instead. Tests start and stop their own server; no existing server is required. Browser QA uses two real browser pages, desktop keyboard/mouse and trusted emulated touch events. It saves screenshots under ignored `artifacts/`.

See [testing](docs/TESTING.md) for what has actually been verified and what needs device testing. Automated mobile Chromium emulation is **not actual Safari certification**. Real iPhone/iPad Safari testing, cellular latency, long sessions and internet load testing remain necessary.

## License and originality

MIT. Original map, UI, models, implementation and procedural audio. Three.js and the other packages retain their own licenses. No proprietary source, textures, maps, branding, models or sounds are incorporated. General voxel FPS mechanics are the inspiration.

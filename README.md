# Blockfront Relay

An original, playable multiplayer voxel FPS. Built from scratch; no Ace of Spades code or assets are included. Temporary working title. Alpha 0.5.

Source: [nobothehobo/Blockfront-Relay](https://github.com/nobothehobo/Blockfront-Relay).

## Play

The browser client has a main menu, server browser, custom rooms, settings, and a field manual. Choose a callsign and press **Play multiplayer**. Matches start with two players after an eight-second warmup. A lone player can explore, practice shooting, build, and dig while waiting.

- **Team deathmatch:** Azure vs Ember; 40 eliminations or five minutes.
- **Capture the relay:** steal the enemy relay and bring it home while your own relay is home; three captures wins. Approach objectives to interact automatically. Dropped relays return after 25 seconds.
- **Humans vs Zombies:** humans survive five minutes. One carrier per five players starts infected, with at least one carrier. Eliminated humans convert to zombies. Zombies have melee only, more health, regeneration, stronger jumps, wall scrambling, and faster digging.
- **Jetpacks:** configurable off / everyone / central pickup / relay and outbreak modes. Fuel, gravity, momentum, collisions and fall damage are server controlled.

The north-up minimap shows terrain, your heading, living teammates, bases, relay objectives and jetpack pickups. It updates after terrain edits and round changes, without revealing enemy positions.

Maps now span 320 × 320 blocks with woodland, desert and snow themes, trenches, outposts and original ruins. Every next round generates a fresh seed. Create a room with 5/8/10-minute rounds and 16/32 slots; 32 slots require the dedicated WebSocket server. Hosted rooms remain capped at 16.

Choose **Practice with NPCs** for a shared server match with four scouts, or select 0/2/4/6/8 NPCs when creating a room. Scouts use the same combat, damage, reload, respawn, objective and infection rules as players. Humans can join the same room; NPCs yield their slots when a room fills and disappear after the last human leaves. Scouts use bounded local obstacle routing, sight-based target selection, short last-seen memory, cover-seeking retreats while reloading, objective carrying/returning and teammate escorting. They remain lightweight bots, not a full squad-tactics system, and can struggle with elaborate constructions.

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

One Node process owns all its rooms. **Do not horizontally load-balance independent Node replicas** without routing every room's connections to its owner. Node rooms support up to 32 players, with a global cap of 128 connections and eight rooms per process. A 32-connection automated smoke test passes; benchmark your host before running several full rooms. Start with a modest VPS and inspect CPU and traffic. Billing and actual regional prices are not assumed.

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

The hosted edition is a convenient small-match fallback. Database round trips add latency, every input transaction writes a room record, and contention grows with player count. **For the best FPS experience and larger matches (up to 32 players), deploy the Node WebSocket server.** Hosted transport is not claimed to have passed a 16-player internet load test. Private Sites access requires the owning account; opening access for friends is a separate sharing configuration.

Build the hosted artifact with `npm run build:hosted`. `.openai/hosting.json` declares a D1 `DB` binding; generated schema migrations are in `drizzle/`. Publication applies migrations before uploading `dist/server/index.js`. The Worker embeds the small client bundle, so external asset URLs are unnecessary. Production schema changes use `npm run db:generate`; never mutate deployed migrations.

## Controls

| Action                      | Desktop                 | iPhone / iPad                               |
| --------------------------- | ----------------------- | ------------------------------------------- |
| Move / sprint               | WASD / Shift            | Floating left stick; push farther to sprint |
| Look                        | Mouse with pointer lock | Drag right side or SHOOT                    |
| Fire / use selected tool    | Left click              | Hold SHOOT / PLACE / DIG                    |
| Aim                         | Right click             | Tap AIM to toggle                           |
| Jump / zombie wall scramble | Space                   | Hold JUMP                                   |
| Crouch                      | Hold C                  | Tap CROUCH to toggle                        |
| Reload                      | R                       | RELOAD                                      |
| Select weapon / tool        | 1–6 or mouse wheel      | Tap weapon name; choose from picker         |
| Dig                         | Hold Q                  | BUILD → hold DIG                            |
| Build                       | Hold E                  | BUILD → hold PLACE; tap again for gun       |
| Jetpack                     | Hold F                  | Hold JET                                    |
| Expand minimap              | M                       | Tap MAP; tap CLOSE MAP to dismiss           |
| Scores                      | Hold Tab                | Expand minimap                              | M   | Tap MAP; tap CLOSE MAP to dismiss |
| Scores button               |
| Pause / release mouse       | Esc                     | Pause button                                |
| Relay interaction / pickup  | Walk near it            | Walk near it                                |

1 Rifle · 2 SMG · 3 Shotgun · 4 Marksman · 5 Spade · 6 Blocks. Digging yields blocks, up to 200; respawns start with 80. Terrain edits reach six blocks; zombies dig seven blocks away. The bottom layer and a small spawn foundation are protected. Placement inside living players is rejected. Edits last until the next round, and late joiners receive the current edited map.

Settings save locally: quality preset, render distance, effects, FOV, master/effects volume, desktop/touch sensitivity, touch control scale, invert look and crosshair. Dynamic shadows, background music, controller support and custom keyboard bindings are not implemented.

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
```

PowerShell users can set `$env:BR_BROWSER_PATH` and `$env:BR_TRANSPORT` instead. Tests start and stop their own server; no existing server is required. Browser QA uses two real browser pages, desktop keyboard/mouse and trusted emulated touch events. It saves screenshots under ignored `artifacts/`.

See [testing](docs/TESTING.md) for what has actually been verified and what needs device testing. Automated mobile Chromium emulation is **not actual Safari certification**. Real iPhone/iPad Safari testing, cellular latency, long sessions and internet load testing remain necessary.

## License and originality

MIT. Original map, UI, models, implementation and procedural audio. Three.js and the other packages retain their own licenses. No proprietary source, textures, maps, branding, models or sounds are incorporated. General voxel FPS mechanics are the inspiration.

# Architecture

## Simulation and authority

`server/room.ts` owns players, ammunition, health, cooldowns, spawn shields, resources, scores, objectives, infection state, fuel and map edits. Clients send bounded inputs, never positions, health, hits or desired edit coordinates. The server steps movement against its own voxels, casts hitscan rays, checks occlusion, validates range and placement occupancy, and broadcasts accepted results.

`shared/game.ts` contains deterministic seeded terrain, voxel representation, AABB collisions, DDA raycasting, weapon tuning and shared movement. Prediction reuses movement without granting client authority. Horizontal acceleration, gravity, fuel burn/recharge and collisions apply in both client prediction and server simulation. `shared/prediction.ts` replays unacknowledged 30 Hz commands from each authoritative body. Spawn epochs discard pre-death/previous-round inputs. Physical state is corrected directly; a small decaying camera offset smooths genuine corrections without dragging movement toward stale snapshots. There is no combat rewind/lag compensation. Local firing sound and recoil respond immediately; hit feedback and ammunition remain authoritative.

Node runs fixed 30 Hz simulation and roughly 10 Hz state snapshots. Inputs are sent around 20 Hz. Remote player samples interpolate with a latency-adjusted 110–300 ms visual delay. WebSockets send only new commands, avoiding redundant movement traffic. Snapshot numeric fields are rounded to three decimal places. Snapshot players include current fuel, life/team state, weapon, ammo and reload state. Shot/hit/kill/relay/infection events carry feedback. Block edits are individual delta messages. Join sends an RLE representation of the current map; round restart sends a fresh map. No full map is transmitted for routine edits.

## Map and rendering

The world is 320 × 56 × 320, 2.78 times the alpha 0.3 footprint, with hills, a river crossing, vegetation, two bastions, flanking trenches and original climbable terraces/ruined arches. Seeds select Copperwater Frontier, Sunbreak Escarpment or Rimewater Highlands palettes and vegetation. Each round derives a fresh reproducible seed and resets edits. Timed rounds default to five minutes; room creation offers five, eight or ten minutes. Material variation uses a small procedural shader alongside baked face shading; the sky uses a gradient and original stylized clouds. Solid cells occupy a 5,734,400-byte typed array per room. Edits maintain a compact index/value map for hosted serialization.

The client meshes up to 400 column chunks, each 16 × 56 × 16 voxels. Greedy meshing merges coplanar faces of the same material and removes interior faces. Chunk meshes share a material and use frustum/distance culling. Edits remesh the affected chunk and neighboring border chunks; up to two nearby dirty chunks are processed per frame with a six-millisecond work budget; distant dirty chunks wait until within render distance, with nearby chunks prioritized on join/respawn/round change. Geometry is disposed when replaced. There is no object per terrain voxel. Original player geometry has helmets, visors, equipment and boots. Static player parts merge into one vertex-colored mesh; only guns and thrust animate separately. Distant players are culled, and label-occlusion rays run only within label range.

Render presets cap device pixel ratio and drawing distance. High effects add short-lived tracer lines; low effects suppress them. There are no dynamic shadows. The browser bundle is approximately 136 KB compressed, excluding HTTP protocol overhead. There are no remote asset/font requests.

## Hosted adapter

The hosted Worker cannot rely on isolate-local rooms for shared multiplayer. `worker/index.ts` loads each room's last committed record from D1, copies cached seed terrain plus edits (bounded to three seed templates), advances elapsed authoritative simulation, applies the authenticated input, and conditionally updates the row with `WHERE version = previousVersion`. Failed updates retry; a player mutation cannot overwrite a concurrent successful mutation. Random session tokens remain server-side and are required for input/leave requests.

Room browsing reads metadata without constructing any worlds; existing default rooms no longer regenerate on every browse. The hosted client exchanges HTTP input/state around 10 Hz, at most one request in flight per client. A bounded event/edit log supplies incremental feedback. Clients that fall behind the log receive a complete map resync. Node supports configured rooms up to 32 players; hosted rooms stay capped at 16. Node is the primary low-latency server architecture. The hosted fallback costs a database write per successful input and is unsuitable for assuming cheap high-concurrency public FPS hosting.

## Security and deployment boundaries

- Input fields must be finite; speed, direction magnitudes and pitch are clamped.
- Fire rate, damage, inventory, ammo, reload, fuel and objectives are server owned.
- Client payloads are limited; malformed WebSocket input closes the connection.
- WebSocket rate limits, room limits, connection limits and slow-client backpressure are enforced.
- Lost inputs are neutralized. Node closes sessions idle for 60 seconds; hosted sessions expire after 20 seconds.
- Optional origin allowlist protects browser connections; HTTPS belongs at the reverse proxy.
- Spawn shields last three seconds and drop on firing or stealing a relay. Protected foundations cannot be dug away.

This is not commercial anti-cheat. It has no account system, bans, moderation dashboard, rewind/lag compensation, distributed matchmaking or volumetric DDoS protection. Node match state is in memory and resets on process restart. Hosted state survives worker eviction. Scale Node with room ownership/sticky routing, not arbitrary replica load balancing.

## NPC practice and mobile controls

Optional scouts run in `server/bots.ts`, selecting ordinary movement, aim, fire, reload, jump, jet and digging inputs. The normal Room code retains authority over every effect. Brains think around five times per second, aim imperfectly, follow objectives or opponents, prefer the central travel lane, and try to jump/dig when obstructed. This is simple navigation rather than a full navigation mesh; NPCs can still struggle with elaborate player-built structures. Bots count toward team balance and scoring, are labeled NPC in the client, yield full-room slots to human joiners, and are removed when the last human leaves. Hosted persistence keeps their brain state but public snapshots omit it. No autonomous empty-room NPC simulation remains.

Mobile uses a floating left stick and a larger right fire pad that also captures look drags. Aim/crouch toggle on taps, a named weapon picker replaces cycling, and building opens contextual dig/place buttons with a return-to-gun toggle. Touch pointer capture permits looking/firing while moving independently. Existing local sensitivity and control-scale preferences remain available.

The minimap caches a top-down 320 × 320 terrain image. A three-millisecond tile budget builds it incrementally; block edits dirty only one 16 × 16 tile. Player/objective overlays refresh at 10 Hz. The map uses authoritative terrain and predicted local heading; teammates only are shown. Hosted serialization format 3 resets older rooms on deployment because voxel indices changed with the larger dimensions; clients must reload and rejoin.

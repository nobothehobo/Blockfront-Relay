# Network protocol

Node REST:

- `GET /api/health`: readiness.
- `GET /api/rooms`: room descriptions and capacity.
- `POST /api/create`: `{ name, mode, jet, seed?, duration?, limit?, bots? }`, returns `{ id }`.
- `WS /ws?room=ID&name=NAME`: server assigns a random player ID.

Client WebSocket messages:

- `{ type: "input", epoch, commands: [{ seq, forward, strafe, yaw, pitch, jump, sprint, crouch, jet, fire, aim, reload, weapon, place, dig }] }`
- Commands represent fixed 1/30-second steps, with a contiguous sequence within each spawn epoch. At most 32 commands per packet. `lastSeq` acknowledges processed commands, not merely received packets. Movement credit is bounded by server elapsed time; flooding never grants extra speed. Legacy single-input packets remain accepted for tooling.
- `{ type: "ping", at }`

Server WebSocket messages:

- `welcome`: assigned player ID, room metadata, RLE map, map revision and current state.
- `state`: current players, flags, timer, phase, scores, human count, round and feedback events.
- `edit`: x/y/z, accepted voxel value and revision.
- `map`: seed, round and full map on round restart.
- `pong`: ping timestamp.

RLE maps are value/count pairs over x-fastest, then z, then y cells. Block zero is air. Zero y is immutable bedrock. Client inputs have no position, hit target or damage fields.

Hosted transport adds `POST /api/join`, `/api/input`, `/api/leave`. Join returns an opaque token, welcome and event cursor. Input includes the token, room ID, epoch, commands, last event cursor, round and map revision. HTTP resends unacknowledged commands; WebSockets send each command once over their ordered reliable stream. Responses carry the same semantic messages plus new cursor/revision; old cursors receive a full map resync. Tokens authorize only their corresponding player. Hosted round markers persist seed/round without embedding whole maps in the event log. Clients with an older round receive one current map. Database CAS serializes mutations, including joins and objective ownership changes.

The optional `bots` setting requests 0–8 NPC slots. Room descriptions report actual `bots` and configured `npcSlots`; player snapshots carry a `bot` flag. Bots use no client connections or session tokens and cannot be controlled by human input endpoints.

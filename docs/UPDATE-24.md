# 2.4 — Connection & Combat: first pass

This is the first reliability milestone toward the proposed 3.0 pass, not a complete new map/graphics/class overhaul.

## Shipped

- Remote characters interpolate on server snapshot timestamps. A 100–250ms adaptive buffer follows snapshot cadence and arrival jitter rather than inflating with round-trip ping. The render clock never moves backwards and does not extrapolate remote terrain collisions through an outage. Old/out-of-order snapshots are ignored.
- Pause → Connection diagnostics shows RTT, snapshot age, buffer, arrival jitter, gaps, pending inputs, prediction pauses, genuine correction counts, maximum correction, request failures and input bytes. These are session counters, not a claim of measured internet performance.
- Dedicated Node WebSocket rooms keep at most 12 historical player-pose frames. Hitscan firearms can test the rendered pose up to 200ms in the past. Server-owned ammo, rate limits, health and damage remain unchanged. Current voxel cover blocks shots; history cannot cross respawn epochs. Bots, melee and explosives do not rewind. Set `REWIND_ENABLED=false` to disable. A client timestamp is bounded, not trusted as permission for arbitrary history.
- WebSocket server heartbeat detects dead sockets. `/api/health` reports transport, rewind capability and a rolling 600-tick window of simulation cost, late ticks and queued commands. These are process diagnostics; they are not per-player private data.
- Bridge kit selection now survives input validation. Invalid kit IDs are still rejected.
- One movement tick cannot climb two steps by stepping on both horizontal axes. The camera eases legitimate one-block step-ups without changing collision authority.

## Hosting and limits

The public Sites URL still runs the existing authoritative HTTP/SQL adapter. It does not claim WebSocket transport or hitscan rewind. The Node server and Docker configuration support these changes; a new persistent public Node host has **not** been provisioned. No new paid service/account is assumed.

To test locally: `npm ci`, `npm run build`, `npm start`; open `http://localhost:3000` in two browsers. For public WebSockets use the README's Docker/Caddy or Docker-capable service instructions. Set `ALLOWED_ORIGINS` to the actual client origin, use HTTPS/WSS and one server instance. Inspect `/api/health` during tests. If using the existing Sites client with a separate Node server, enter its HTTPS URL in About & connection. Players must select the same server and room.

Remaining: provision a connected persistent host, sustained 16/32-player combat load tests, physical iPhone Safari/cellular/app-switch tests, authenticated session resumption, more comprehensive lag compensation, a polished authored map, and later animation/audio/class upgrades. Snapshot buffering cannot remove network outages or database contention. Reload/rejoin to load the new client.

import { Room, RoomOptions } from "../server/room.js";
import { World, W, D, mapTheme } from "../shared/game.js";
import { assets } from "./assets.generated.js";
// Sites-compatible authoritative fallback: SQL CAS serializes room mutations across isolates.
// The dedicated Node transport remains the primary 30 Hz WebSocket architecture.
type DB = {
  prepare: (sql: string) => {
    bind: (...args: any[]) => any;
    first: <T = any>() => Promise<T>;
    all: () => Promise<any>;
    run: () => Promise<any>;
  };
};
type Data = {
  format: number;
  options: RoomOptions;
  clock: number;
  room: any;
  players: any[];
  edits: [number, number][];
  sessions: Record<string, { id: string; seen: number }>;
  logs: any[];
  cursor: number;
};
const defaults = [
  ["valley", "Copperwater Skirmish", "tdm", "all"],
  ["relay", "Relay Runners", "relay", "pickup"],
  ["outbreak", "Nightfall Outbreak", "infection", "modes"],
  ["frontline", "Frontline Control", "frontline", "classes"],
] as const;
const terrainCache = new Map<number, Uint8Array>();
function restore(id: string, data: Data) {
  let seed = terrainCache.get(data.options.seed);
  const world = new World(data.options.seed, !seed);
  if (seed) world.blocks.set(seed);
  const r = new Room(id, data.options, world);
  if (!seed) {
    seed = r.world.blocks.slice();
    if (terrainCache.size >= 3)
      terrainCache.delete(terrainCache.keys().next().value!);
    terrainCache.set(data.options.seed, seed);
  }
  Object.assign(r, data.room);
  r.players = new Map(data.players.map((p) => [p.id, p]));
  for (const [i, v] of data.edits) {
    r.world.blocks[i] = v;
    r.world.edits.set(i, v);
  }
  return r;
}
function save(
  r: Room,
  sessions: Data["sessions"],
  logs: any[],
  cursor: number,
  clock: number,
): Data {
  return {
    format: 5,
    options: r.options,
    clock,
    room: {
      time: r.time,
      remaining: r.remaining,
      phase: r.phase,
      scores: r.scores,
      winner: r.winner,
      round: r.round,
      revision: r.revision,
      flags: r.flags,
      controlPoints: r.controlPoints,
      controlClock: r.controlClock,
      warmup: r.warmup,
      lastBroadcast: r.lastBroadcast,
      projectiles: r.projectiles,
      nextProjectile: r.nextProjectile,
    },
    players: [...r.players.values()],
    edits: [...r.world.edits],
    sessions,
    logs: logs.slice(-256),
    cursor,
  };
}
function fresh(id: string, options: RoomOptions) {
  const room = new Room(id, options);
  return save(room, {}, [], 0, Date.now());
}
const response = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
async function ensure(db: DB) {
  const existing = await db.prepare("SELECT id,data FROM game_rooms").all();
  const ids = new Set(existing.results.map((row: any) => row.id));
  for (const [id, name, mode, jet] of defaults) {
    if (ids.has(id)) continue;
    await db
      .prepare(
        "INSERT OR IGNORE INTO game_rooms(id,version,data,updated) VALUES(?,0,?,?)",
      )
      .bind(
        id,
        JSON.stringify(
          fresh(id, {
            name,
            mode,
            jet,
            seed: 7231,
            limit: 16,
            arsenal: mode === "frontline" ? "specialists" : "sandbox",
          }),
        ),
        Date.now(),
      )
      .run();
  }
}
export default {
  async fetch(request: Request, env: { DB?: DB }) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      const asset = assets[url.pathname === "/" ? "/index.html" : url.pathname];
      if (!asset) return new Response("Not found", { status: 404 });
      const body = asset.binary
        ? Uint8Array.from(atob(asset.body), (char) => char.charCodeAt(0))
        : asset.body;
      return new Response(body, {
        headers: {
          "Content-Type": asset.mime,
          "Cache-Control": url.pathname.startsWith("/assets/")
            ? "public,max-age=31536000,immutable"
            : "no-cache",
        },
      });
    }
    const db = env.DB;
    if (!db)
      return response(
        { error: "Multiplayer database binding unavailable" },
        503,
      );
    try {
      if (url.pathname === "/api/health")
        return response({ ok: true, transport: "http" });
      if (url.pathname === "/api/rooms") {
        await ensure(db);
        const rows = await db.prepare("SELECT id,data FROM game_rooms").all();
        return response(
          rows.results.map((row: any) => {
            const data = JSON.parse(row.data) as Data;
            return {
              id: row.id,
              name: data.options.name,
              mode: data.options.mode,
              jet: data.options.jet,
              arsenal: data.options.arsenal ?? "sandbox",
              seed: data.options.seed,
              map: mapTheme(data.options.seed).name,
              max: data.options.limit ?? 16,
              phase: data.room.phase,
              bots: data.players.filter((p: any) => p.bot).length,
              npcSlots: data.options.bots ?? 0,
              players:
                Object.values(data.sessions).filter(
                  (s) => Date.now() - s.seen < 20000,
                ).length + data.players.filter((p: any) => p.bot).length,
            };
          }),
        );
      }
      if (request.method !== "POST")
        return response({ error: "Use POST" }, 405);
      if (Number(request.headers.get("content-length")) > 8192)
        return response({ error: "Request too large" }, 413);
      const text = await request.text();
      if (text.length > 8192)
        return response({ error: "Request too large" }, 413);
      const body = JSON.parse(text);
      if (url.pathname === "/api/create") {
        const count = await db
          .prepare("SELECT COUNT(*) AS total FROM game_rooms")
          .first();
        if (count.total >= 8)
          return response({ error: "Room limit reached" }, 429);
        if (
          !["tdm", "relay", "infection", "frontline"].includes(body.mode) ||
          !["off", "all", "pickup", "modes", "classes"].includes(body.jet) ||
          (body.arsenal !== undefined &&
            !["sandbox", "specialists"].includes(body.arsenal))
        )
          return response({ error: "Invalid settings" }, 400);
        const id = crypto.randomUUID().slice(0, 8),
          options: RoomOptions = {
            name: String(body.name || "Custom match").slice(0, 30),
            mode: body.mode,
            jet: body.jet,
            arsenal: body.arsenal ?? "sandbox",
            seed: Number.isInteger(body.seed) ? body.seed : Date.now() >>> 0,
            limit: 16,
            bots: Math.max(0, Math.min(8, Number(body.bots) || 0)) | 0,
            duration: Math.max(
              120,
              Math.min(900, Number(body.duration) || 300),
            ),
          };
        await db
          .prepare(
            "INSERT INTO game_rooms(id,version,data,updated) VALUES(?,0,?,?)",
          )
          .bind(id, JSON.stringify(fresh(id, options)), Date.now())
          .run();
        return response({ id }, 201);
      }
      if (!["/api/join", "/api/input", "/api/leave"].includes(url.pathname))
        return response({ error: "Not found" }, 404);
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await db
          .prepare("SELECT version,data FROM game_rooms WHERE id=?")
          .bind(String(body.room))
          .first();
        if (!row) return response({ error: "Room not found" }, 404);
        const stored = JSON.parse(row.data) as Data;
        const data =
          stored.format === 5
            ? stored
            : fresh(String(body.room), { ...stored.options, limit: 16 });
        const r = restore(String(body.room), data),
          now = Date.now();
        let cursor = data.cursor;
        let logs = data.logs;
        const append = (msg: any) => {
          logs.push({ cursor: ++cursor, message: msg });
        };
        r.broadcast = (msg: any) => {
          if (msg.type === "state") {
            if (msg.events?.length)
              append({ type: "events", events: msg.events });
          } else if (msg.type === "map") {
            // Persist a small round marker; a map is sent once to each client needing it.
            append({
              type: "map",
              seed: msg.seed,
              round: msg.round,
              revision: msg.revision,
            });
          } else append(msg);
        };
        for (const [token, s] of Object.entries(data.sessions))
          if (now - s.seen > 20000) {
            r.remove(s.id);
            delete data.sessions[token];
          }
        // Stale inputs are neutralized before catch-up, so disconnecting cannot keep firing or flying.
        for (const s of Object.values(data.sessions))
          if (now - s.seen > 500) {
            const p = r.players.get(s.id);
            if (p)
              p.input = {
                ...p.input,
                forward: 0,
                strafe: 0,
                fire: false,
                place: false,
                dig: false,
                grenade: false,
                ability: false,
                jet: false,
                jump: false,
              };
          }
        let elapsed = Math.min(3, Math.max(0, (now - data.clock) / 1000));
        while (elapsed > 0) {
          const dt = Math.min(1 / 30, elapsed);
          r.tick(dt);
          elapsed -= dt;
        }
        let result: any;
        if (url.pathname === "/api/join") {
          if (
            r.players.size >= r.limit &&
            ![...r.players.values()].some((p) => p.bot)
          )
            return response({ error: "Room is full" }, 409);
          const token = crypto.randomUUID(),
            id = crypto.randomUUID();
          let welcome: any;
          r.add(
            id,
            String(body.name ?? "Builder"),
            {
              send: (raw) => {
                welcome = JSON.parse(raw);
              },
            },
            false,
            Number(body.classId ?? 0),
          );
          r.peers.clear();
          data.sessions[token] = { id, seen: now };
          result = { token, welcome, cursor };
        } else {
          const session = data.sessions[String(body.token)];
          if (!session) return response({ error: "Session expired" }, 401);
          if (url.pathname === "/api/leave") {
            r.remove(session.id);
            delete data.sessions[String(body.token)];
            result = { ok: true };
          } else {
            if (now - session.seen < 45)
              return response({ error: "Input rate exceeded" }, 429);
            session.seen = now;
            if (body.commands) {
              r.queueInputs(session.id, body.commands, body.epoch);
              const player = r.players.get(session.id);
              if (player) r.consumeMovement(player);
            } else r.input(session.id, body.input);
            if (r.events.length)
              append({ type: "events", events: r.events.splice(0) });
            const lastCursor = Number(body.cursor) || 0,
              revision = Number(body.revision) || 0;
            const messages = logs
              .filter((log) => log.cursor > lastCursor)
              .map((log) => log.message)
              .filter((msg) => msg.type !== "edit" || msg.revision > revision);
            const mapChanged =
              messages.some((msg) => msg.type === "map") ||
              (Number.isInteger(body.round) && body.round !== r.round);
            const incremental = messages.filter((msg) => msg.type !== "map");
            incremental.push({ type: "state", state: r.state(), events: [] });
            result = {
              messages: incremental,
              revision: r.revision,
              cursor,
              round: r.round,
              seed: r.options.seed,
            };
            if (
              mapChanged ||
              (lastCursor && logs.length && lastCursor < logs[0].cursor)
            ) {
              result.map = r.world.encode();
              result.messages = result.messages.filter(
                (m: any) => m.type !== "edit" && m.type !== "map",
              );
            }
          }
        }
        const saved = save(r, data.sessions, logs, cursor, now);
        const updated = await db
          .prepare(
            "UPDATE game_rooms SET data=?,version=version+1,updated=? WHERE id=? AND version=?",
          )
          .bind(JSON.stringify(saved), now, String(body.room), row.version)
          .run();
        if (updated.meta.changes === 1) return response(result);
      }
      return response({ error: "Room busy; retrying shortly" }, 409);
    } catch (error) {
      console.error("Game service failed", error);
      return response({ error: "Game service temporarily unavailable" }, 503);
    }
  },
};

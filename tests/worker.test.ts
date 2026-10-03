import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../worker/index.js";
import { emptyInput } from "../shared/game.js";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("drizzle/0000_blushing_zombie.sql", "utf8"));
  const DB: any = {
    prepare: (sql: string) => {
      const statement = db.prepare(sql);
      let args: any[] = [];
      const query: any = {
        bind: (...a: any[]) => {
          args = a;
          return query;
        },
        first: async () => statement.get(...args),
        all: async () => ({ results: statement.all(...args) }),
        run: async () => ({
          meta: { changes: Number(statement.run(...args).changes) },
        }),
      };
      return query;
    },
  };
  const call = async (path: string, body?: any) => {
    const request = new Request(
      "https://test.invalid" + path,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    const res = await worker.fetch(request, { DB });
    return { status: res.status, data: (await res.json()) as any };
  };
  return { db, call, DB };
}
test("hosted sessions persist selected classes, active grenades and replicated blast edits", async () => {
  const { call, db } = fixture();
  await call("/api/rooms");
  const a = await call("/api/join", {
    room: "valley",
    name: "Sapper",
    classId: 2,
  });
  const b = await call("/api/join", { room: "valley", name: "Observer" });
  const id = a.data.welcome.id;
  assert.equal(
    a.data.welcome.state.players.find((p: any) => p.id === id).classId,
    2,
  );
  const saved = JSON.parse(
    (db.prepare("SELECT data FROM game_rooms WHERE id=?").get("valley") as any)
      .data,
  );
  saved.room.phase = "active";
  saved.clock = Date.now() - 100;
  const p = saved.players.find((p: any) => p.id === id);
  saved.room.projectiles = [
    {
      id: 1,
      owner: id,
      team: p.team,
      kind: "grenade",
      x: 160.5,
      y: 2,
      z: 160.5,
      vx: 0,
      vy: 0,
      vz: 0,
      fuse: 0.01,
    },
  ];
  saved.room.nextProjectile = 1;
  saved.edits.push([160 + 320 * (160 + 320 * 2), 3]);
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(saved),
    "valley",
  );
  await new Promise((r) => setTimeout(r, 65));
  const poll = await call("/api/input", {
    room: "valley",
    token: b.data.token,
    commands: [],
    epoch: 1,
    round: 1,
    cursor: b.data.cursor,
  });
  assert.equal(poll.status, 200);
  assert.ok(poll.data.messages.some((m: any) => m.type === "edits"));
  assert.ok(
    poll.data.messages.some((m: any) =>
      m.events?.some((e: any) => e.kind === "explosion"),
    ),
  );
  const committed = JSON.parse(
    (db.prepare("SELECT data FROM game_rooms WHERE id=?").get("valley") as any)
      .data,
  );
  assert.equal(committed.room.projectiles.length, 0);
});
test("hosted transport shares authoritative state and never accepts another session token", async () => {
  const { call, db } = fixture();
  const list = await call("/api/rooms");
  assert.equal(list.data.length, 3);
  const a = await call("/api/join", { room: "valley", name: "A" }),
    b = await call("/api/join", { room: "valley", name: "B" });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.data.token, b.data.token);
  const wrong = await call("/api/input", {
    room: "valley",
    token: "forged",
    input: emptyInput(),
  });
  assert.equal(wrong.status, 401);
  await new Promise((r) => setTimeout(r, 65));
  const state = await call("/api/input", {
    room: "valley",
    token: a.data.token,
    input: { ...emptyInput(), seq: 1, forward: 1, yaw: -Math.PI / 2 },
    cursor: a.data.cursor,
  });
  assert.equal(state.status, 200);
  assert.equal(state.data.messages.at(-1).state.players.length, 2);
  const saved = JSON.parse(
    (db.prepare("SELECT data FROM game_rooms WHERE id=?").get("valley") as any)
      .data,
  );
  assert.equal(
    saved.players.find((p: any) => p.id === a.data.welcome.id).input.forward,
    1,
  );
  await new Promise((r) => setTimeout(r, 100));
  const movement = await call("/api/input", {
    room: "valley",
    token: b.data.token,
    input: { ...emptyInput(), seq: 1 },
    cursor: b.data.cursor,
  });
  const moved = movement.data.messages
    .at(-1)
    .state.players.find((p: any) => p.id === a.data.welcome.id);
  assert.ok(moved.x > a.data.welcome.state.players[0].x);
});
test("SQL compare-and-swap retries concurrent joins without losing players", async () => {
  const { call, db } = fixture();
  await call("/api/rooms");
  const joins = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      call("/api/join", { room: "relay", name: `Concurrent${i}` }),
    ),
  );
  assert.ok(joins.every((r) => r.status === 200));
  const stored = JSON.parse(
    (db.prepare("SELECT data FROM game_rooms WHERE id=?").get("relay") as any)
      .data,
  );
  assert.equal(stored.players.length, 4);
  assert.equal(new Set(stored.players.map((p: any) => p.id)).size, 4);
});
test("worker serves embedded client and rejects oversized / invalid settings", async () => {
  const { call, DB } = fixture();
  const page = await worker.fetch(new Request("https://test.invalid/"), { DB });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Blockfront Relay/);
  await call("/api/rooms");
  const invalid = await call("/api/create", {
    name: "X",
    mode: "cheat",
    jet: "all",
  });
  assert.equal(invalid.status, 400);
});
test("hosted round changes send each client a fresh map and persist compact round markers", async () => {
  const { call, db } = fixture();
  await call("/api/rooms");
  const a = await call("/api/join", { room: "valley", name: "A" });
  await call("/api/join", { room: "valley", name: "B" });
  const saved = JSON.parse(
    (db.prepare("SELECT data FROM game_rooms WHERE id=?").get("valley") as any)
      .data,
  );
  saved.room.phase = "finished";
  saved.room.remaining = 0.01;
  saved.clock = Date.now() - 150;
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(saved),
    "valley",
  );
  await new Promise((r) => setTimeout(r, 65));
  const result = await call("/api/input", {
    room: "valley",
    token: a.data.token,
    commands: [],
    epoch: 1,
    round: 1,
    cursor: a.data.cursor,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.round, 2);
  assert.notEqual(result.data.seed, 7231);
  assert.ok(result.data.map.length > 0);
  const next = result.data.messages.at(-1).state;
  assert.ok(next.players.every((p: any) => p.epoch > 1));
  const committed = JSON.parse(
    (db.prepare("SELECT data FROM game_rooms WHERE id=?").get("valley") as any)
      .data,
  );
  assert.ok(
    committed.logs
      .filter((l: any) => l.message.type === "map")
      .every((l: any) => !l.message.map),
  );
  await new Promise((r) => setTimeout(r, 65));
  const current = await call("/api/input", {
    room: "valley",
    token: a.data.token,
    commands: [],
    epoch: next.players.find((p: any) => p.id === a.data.welcome.id).epoch,
    round: 2,
    cursor: result.data.cursor,
  });
  assert.equal(current.status, 200);
  assert.equal(current.data.map, undefined);
});
test("hosted NPC rooms persist server bots and share them with another human session", async () => {
  const { call, db } = fixture();
  const created = await call("/api/create", {
    name: "NPC test",
    mode: "tdm",
    jet: "all",
    bots: 4,
  });
  assert.equal(created.status, 201);
  const room = created.data.id;
  const a = await call("/api/join", { room, name: "A" });
  const b = await call("/api/join", { room, name: "B" });
  assert.equal(
    a.data.welcome.state.players.filter((p: any) => p.bot).length,
    4,
  );
  assert.equal(b.data.welcome.state.players.length, 6);
  const before = a.data.welcome.state.players.find((p: any) => p.bot);
  await new Promise((r) => setTimeout(r, 250));
  const update = await call("/api/input", {
    room,
    token: a.data.token,
    commands: [],
    epoch: 1,
    round: 1,
    cursor: a.data.cursor,
  });
  assert.equal(update.status, 200);
  const state = update.data.messages.at(-1).state;
  const npc = state.players.find((p: any) => p.id === before.id);
  assert.ok(Math.hypot(npc.x - before.x, npc.z - before.z) > 0.01);
  assert.equal(state.players.filter((p: any) => p.bot).length, 4);
  assert.ok(state.players.every((p: any) => !("brain" in p)));
  await call("/api/leave", { room, token: a.data.token });
  await call("/api/leave", { room, token: b.data.token });
  const stored = JSON.parse(
    (db.prepare("SELECT data FROM game_rooms WHERE id=?").get(room) as any)
      .data,
  );
  assert.equal(stored.players.length, 0);
});

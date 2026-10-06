import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../worker/index.js";
import { emptyInput, demolitionCells, idx, World } from "../shared/game.js";
import { atmosphere } from "../shared/environment.js";
import { CITY_SEED } from "../shared/city.js";
import { packInput } from "../shared/prediction.js";
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
test("hosted input acknowledges a complete delayed packed batch without granting extra movement time", async () => {
  const { db, call } = fixture();
  const created = await call("/api/create", {
    name: "Batch",
    mode: "tdm",
    seed: 7231,
    jet: "all",
  });
  const room = created.data.id;
  const joined = await call("/api/join", { room, name: "Tester" });
  const id = joined.data.welcome.id;
  const row = db.prepare("SELECT data FROM game_rooms WHERE id=?");
  const stored = JSON.parse((row.get(room) as any).data);
  stored.players.find((v: any) => v.id === id).commandMode = true;
  stored.clock = Date.now() - 1500;
  stored.sessions[joined.data.token].seen = Date.now() - 1500;
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(stored),
    room,
  );
  const p = joined.data.welcome.state.players.find((v: any) => v.id === id);
  const commands = Array.from({ length: 42 }, (_, i) =>
    packInput({ ...emptyInput(), seq: i + 1, forward: 1 }),
  );
  const result = await call("/api/input", {
    room,
    token: joined.data.token,
    epoch: p.epoch,
    commands,
  });
  assert.equal(result.status, 200);
  const snapshot = result.data.messages
    .find((m: any) => m.type === "state")
    .state.players.find((v: any) => v.id === id);
  assert.equal(
    snapshot.lastSeq,
    42,
    "all credited commands acknowledged before response",
  );
  const persisted = JSON.parse((row.get(room) as any).data);
  const authority = persisted.players.find((v: any) => v.id === id);
  assert.ok(authority.movementCredit < 0.2, "consumed credit cannot be reused");
});
test("hosted outdoor rooms preserve prior-release sessions and share the day/night clock with late joins", async () => {
  const { db, call } = fixture();
  const created = await call("/api/create", {
    name: "Cycle",
    mode: "tdm",
    seed: 7231,
    jet: "all",
  });
  const room = created.data.id;
  const a = await call("/api/join", { room, name: "A" });
  const row = db.prepare("SELECT data FROM game_rooms WHERE id=?");
  const stored = JSON.parse((row.get(room) as any).data);
  stored.format = 7;
  delete stored.terrainVersion;
  stored.room.time = 180;
  stored.clock = Date.now() - 100;
  Object.values(stored.sessions).forEach((s: any) => {
    s.seen = Date.now() - 100;
  });
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(stored),
    room,
  );
  const p = a.data.welcome.state.players.find(
    (p: any) => p.id === a.data.welcome.id,
  );
  const poll = await call("/api/input", {
    room,
    token: a.data.token,
    epoch: p.epoch,
    round: 1,
    commands: [],
  });
  assert.equal(poll.status, 200);
  const first = poll.data.messages.find((m: any) => m.type === "state").state;
  assert.deepEqual(first.atmosphere, atmosphere(7231, first.time));
  assert.equal(first.atmosphere.day, 0);
  const b = await call("/api/join", { room, name: "Late" });
  assert.equal(b.status, 200);
  assert.equal(b.data.welcome.state.atmosphere.day, 0);
  assert.ok(Math.abs(first.time - b.data.welcome.state.time) < 1);
  assert.equal(JSON.parse((row.get(room) as any).data).format, 9);
  assert.equal(JSON.parse((row.get(room) as any).data).terrainVersion, 0);
});

test("2.10 hosted rounds retain terrain and sessions until the next round adopts branching layouts", async () => {
  const { db, call } = fixture();
  const created = await call("/api/create", {
    name: "Migration",
    mode: "ctf",
    seed: 7231,
    jet: "all",
  });
  const room = created.data.id;
  const a = await call("/api/join", { room, name: "A" });
  const b = await call("/api/join", { room, name: "B" });
  const row = db.prepare("SELECT data FROM game_rooms WHERE id=?");
  const legacy = JSON.parse((row.get(room) as any).data);
  legacy.format = 8;
  delete legacy.terrainVersion;
  legacy.room.phase = "active";
  legacy.edits = [[idx(74, 14, 165), 6]];
  legacy.room.revision = 1;
  legacy.clock = Date.now() - 100;
  for (const s of Object.values(legacy.sessions) as any[])
    s.seen = Date.now() - 100;
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(legacy),
    room,
  );
  const late = await call("/api/join", { room, name: "Late" });
  const old = new World(7231, false);
  old.decode(late.data.welcome.map);
  assert.equal(
    old.get(104, 15, 160),
    new World(7231, true, 0).get(104, 15, 160),
  );
  assert.equal(old.get(74, 14, 165), 6);
  assert.equal(late.data.welcome.state.revision, 1);
  assert.equal(late.data.welcome.state.players.length, 3);
  const stored = JSON.parse((row.get(room) as any).data);
  assert.equal(stored.terrainVersion, 0);
  stored.room.phase = "finished";
  stored.room.remaining = 0.01;
  stored.clock = Date.now() - 100;
  for (const s of Object.values(stored.sessions) as any[])
    s.seen = Date.now() - 100;
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(stored),
    room,
  );
  const player = stored.players.find((p: any) => p.id === a.data.welcome.id);
  const next = await call("/api/input", {
    room,
    token: a.data.token,
    epoch: player.epoch,
    round: 1,
    cursor: late.data.cursor,
    commands: [],
  });
  assert.equal(next.status, 200);
  assert.equal(next.data.round, 2);
  const updated = JSON.parse((row.get(room) as any).data);
  assert.equal(updated.terrainVersion, 1);
  assert.deepEqual(updated.edits, []);
  assert.equal(updated.sessions[a.data.token].id, player.id);
  assert.equal(updated.sessions[b.data.token].id, b.data.welcome.id);
  const state = next.data.messages.find((m: any) => m.type === "state").state;
  assert.ok(
    state.players.find((p: any) => p.id === player.id).epoch > player.epoch,
  );
  const nextWorld = new World(updated.options.seed, false);
  nextWorld.decode(next.data.map);
  assert.deepEqual(nextWorld.blocks, new World(updated.options.seed).blocks);
});

test("hosted city terrain edits and midnight survive restoration; old reserved-seed terrain resets safely", async () => {
  const { db, call } = fixture();
  const created = await call("/api/create", {
    name: "City",
    mode: "ctf",
    seed: CITY_SEED,
    jet: "all",
  });
  const room = created.data.id;
  await call("/api/join", { room, name: "A" });
  const row = db.prepare("SELECT data FROM game_rooms WHERE id=?");
  const saved = JSON.parse((row.get(room) as any).data);
  saved.edits.push([idx(48, 17, 148), 0]);
  saved.room.revision++;
  saved.room.time = 93;
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(saved),
    room,
  );
  const b = await call("/api/join", { room, name: "Late" });
  assert.equal(b.status, 200);
  assert.equal(b.data.welcome.state.atmosphere.phase, 0.75);
  const map = new World(CITY_SEED, false);
  map.decode(b.data.welcome.map);
  assert.equal(map.get(48, 17, 148), 0);
  assert.equal(map.get(160, 12, 160), 27, "new central station foundation");
  const previous = JSON.parse((row.get(room) as any).data);
  previous.format = 7;
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(previous),
    room,
  );
  const fresh = await call("/api/join", { room, name: "New" });
  assert.equal(fresh.status, 200);
  const rebuilt = new World(CITY_SEED, false);
  rebuilt.decode(fresh.data.welcome.map);
  assert.equal(rebuilt.get(48, 17, 148), 24);
  assert.equal(fresh.data.welcome.state.revision, 0);
  assert.equal(fresh.data.welcome.state.players.length, 1);
});
test("hosted Delver equipment and inventories persist across independent requests, both peers and late joins", async () => {
  const { db, call } = fixture();
  const created = await call("/api/create", {
    name: "Fieldcraft",
    mode: "tdm",
    jet: "all",
    seed: 7231,
  });
  const room = created.data.id;
  const a = await call("/api/join", { room, name: "Delver", classId: 4 });
  const b = await call("/api/join", { room, name: "Peer", classId: 0 });
  const row = db.prepare("SELECT data FROM game_rooms WHERE id=?");
  const stored = JSON.parse((row.get(room) as any).data);
  stored.room.phase = "active";
  stored.clock = Date.now() - 200;
  const p = stored.players.find((p: any) => p.id === a.data.welcome.id);
  const home = stored.room.flags[p.team].home;
  Object.assign(p, {
    ...home,
    y: home.y - 0.03,
    yaw: -Math.PI / 2,
    pitch: 0,
    ground: true,
    protected: 0,
  });
  Object.assign(
    stored.players.find((p: any) => p.id === b.data.welcome.id),
    { ...home, x: home.x + 15 },
  );
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(stored),
    room,
  );
  const submitted = await call("/api/input", {
    room,
    token: a.data.token,
    epoch: p.epoch,
    round: 1,
    commands: [
      {
        ...emptyInput(),
        seq: 1,
        yaw: -Math.PI / 2,
        weapon: 2,
        gear: true,
        classId: 4,
      },
    ],
  });
  assert.equal(submitted.status, 200);
  const poll = async (session: any) => {
    await new Promise((r) => setTimeout(r, 70));
    const result = await call("/api/input", {
      room,
      token: session.data.token,
      epoch: session.data.welcome.state.players.find(
        (v: any) => v.id === session.data.welcome.id,
      ).epoch,
      round: 1,
      commands: [],
    });
    assert.equal(result.status, 200);
    return result.data.messages.filter((m: any) => m.type === "state").at(-1)
      .state;
  };
  const first = await poll(a),
    second = await poll(b);
  assert.equal(first.fieldGear[0].kind, "beacon");
  assert.equal(second.fieldGear[0].id, first.fieldGear[0].id);
  assert.equal(second.players.find((v: any) => v.id === p.id).gearCharges, 2);
  const saved = JSON.parse((row.get(room) as any).data);
  assert.equal(saved.room.fieldGear.length, 1);
  assert.ok(saved.room.nextGear > first.fieldGear[0].id);
  const late = await call("/api/join", { room, name: "Late" });
  assert.equal(late.data.welcome.state.fieldGear[0].id, first.fieldGear[0].id);
  // A prior-release room remains compatible without granting unlimited inventory.
  const old = JSON.parse((row.get(room) as any).data);
  delete old.players.find((v: any) => v.id === b.data.welcome.id).gearCharges;
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(old),
    room,
  );
  assert.equal(
    (await poll(b)).players.find((v: any) => v.id === b.data.welcome.id)
      .gearCharges,
    2,
  );
});
test("expired empty practice rooms release capacity but active and normal rooms are preserved", async () => {
  const { db, call } = fixture();
  await call("/api/rooms");
  const options = { name: "Practice", mode: "ctf", jet: "all", practice: true };
  const idle = await call("/api/create", options);
  const active = await call("/api/create", options);
  await call("/api/join", { room: active.data.id, name: "Still here" });
  const normal = await call("/api/create", { ...options, practice: false });
  db.prepare("UPDATE game_rooms SET updated=?").run(Date.now() - 301000);
  assert.equal((await call("/api/create", options)).status, 201);
  const rooms = (await call("/api/rooms")).data;
  assert.ok(!rooms.some((r: any) => r.id === idle.data.id));
  assert.ok(rooms.some((r: any) => r.id === active.data.id && r.humans === 1));
  assert.ok(rooms.some((r: any) => r.id === normal.data.id));
});
test("hosted CTF carries, drops and captures persist and synchronize across two sessions", async () => {
  const { db, call } = fixture();
  await call("/api/rooms");
  const created = await call("/api/create", {
    name: "Solo CTF",
    mode: "ctf",
    jet: "off",
    bots: 3,
    seed: 7233,
    duration: 480,
  });
  assert.equal(created.status, 201);
  const room = created.data.id;
  const a = await call("/api/join", { room, name: "A" });
  const b = await call("/api/join", { room, name: "B" });
  const row = db.prepare("SELECT data FROM game_rooms WHERE id=?");
  const mutate = (fn: (stored: any) => void) => {
    const stored = JSON.parse((row.get(room) as any).data);
    stored.room.phase = "active";
    stored.clock = Date.now() - 200;
    for (const p of stored.players)
      Object.assign(p, { x: 40, y: 13.01, z: 170, vx: 0, vy: 0, vz: 0 });
    for (const session of Object.values(stored.sessions) as any[])
      session.seen = Date.now() - 100;
    fn(stored);
    db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
      JSON.stringify(stored),
      room,
    );
  };
  const poll = async (session: any) => {
    await new Promise((r) => setTimeout(r, 70));
    const response = await call("/api/input", {
      room,
      token: session.data.token,
      commands: [],
      epoch: 1,
      round: 1,
    });
    assert.equal(response.status, 200);
    return response.data.messages.filter((m: any) => m.type === "state").at(-1)
      .state;
  };
  mutate((stored) =>
    Object.assign(
      stored.players.find((p: any) => p.id === a.data.welcome.id),
      stored.room.flags[1].home,
    ),
  );
  assert.equal((await poll(a)).flags[1].carrier, a.data.welcome.id);
  assert.equal((await poll(b)).flags[1].carrier, a.data.welcome.id);
  const late = await call("/api/join", { room, name: "Late" });
  assert.equal(late.data.welcome.state.flags[1].carrier, a.data.welcome.id);
  mutate((stored) => {
    const player = stored.players.find((p: any) => p.id === a.data.welcome.id);
    Object.assign(player, stored.room.flags[0].home);
  });
  assert.equal((await poll(a)).scores[0], 1);
  assert.equal((await poll(b)).scores[0], 1);
  mutate((stored) => {
    stored.room.flags[1].carrier = a.data.welcome.id;
    stored.room.flags[1].pos = { x: 100, y: 13.01, z: 170 };
    Object.assign(
      stored.players.find((p: any) => p.id === a.data.welcome.id),
      stored.room.flags[1].pos,
    );
  });
  assert.equal(
    (await call("/api/leave", { room, token: a.data.token })).status,
    200,
  );
  assert.ok((await poll(b)).flags[1].dropped > 0);
  assert.equal((await poll(b)).flags[1].carrier, null);
  const rooms = await call("/api/rooms");
  assert.equal(rooms.data.find((r: any) => r.id === room).duration, 480);
});
test("hosted Demolition edits and collapse queue survive restoration without polluting another mode's terrain", async () => {
  const { db, call } = fixture();
  await call("/api/rooms");
  const a = await call("/api/join", { room: "demolition", name: "A" });
  const b = await call("/api/join", { room: "demolition", name: "B" });
  const row = db.prepare("SELECT data FROM game_rooms WHERE id=?");
  const stored = JSON.parse((row.get("demolition") as any).data);
  const [x, y, z] = demolitionCells(1)[0];
  stored.edits.push([idx(x, y, z), 0]);
  stored.room.collapseSeeds = [idx(250, 40, 220)];
  stored.clock = Date.now() - 200;
  stored.room.phase = "active";
  db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
    JSON.stringify(stored),
    "demolition",
  );
  for (const joined of [a, b]) {
    const result = await call("/api/input", {
      room: "demolition",
      token: joined.data.token,
      commands: [],
      epoch: 1,
    });
    assert.equal(result.status, 200);
    const state = result.data.messages.find(
      (m: any) => m.type === "state",
    ).state;
    assert.equal(state.demolition[1].remaining, state.demolition[1].total - 1);
  }
  const persisted = JSON.parse((row.get("demolition") as any).data);
  assert.ok(
    persisted.edits.some((e: number[]) => e[0] === idx(x, y, z) && e[1] === 0),
  );
  assert.deepEqual(persisted.room.collapseSeeds, []);
  const tdm = await call("/api/join", { room: "valley", name: "Other mode" });
  assert.equal(tdm.status, 200);
  // A mode's objective stamping must never become a globally cached base map.
  const { World } = await import("../shared/game.js");
  const terrain = new World(7231),
    received = new World(1, false);
  received.decode(tdm.data.welcome.map);
  assert.equal(received.get(x, y, z), terrain.get(x, y, z));
});
test("hosted Frontline ownership, progress and score survive independent requests and reach both peers", async () => {
  const { db, call } = fixture();
  await call("/api/rooms");
  const created = await call("/api/create", {
    name: "Sectors",
    mode: "frontline",
    jet: "off",
    seed: 7231,
  });
  const room = created.data.id;
  const a = await call("/api/join", { room, name: "A" });
  const b = await call("/api/join", { room, name: "B" });
  const statement = db.prepare("SELECT data FROM game_rooms WHERE id=?");
  for (let i = 0; i < 5; i++) {
    const stored = JSON.parse((statement.get(room) as any).data);
    stored.room.phase = "active";
    stored.clock = Date.now() - 2000;
    for (const session of Object.values(stored.sessions) as any[])
      session.seen = Date.now() - 100;
    const player = stored.players.find((p: any) => p.id === a.data.welcome.id);
    Object.assign(player, stored.room.controlPoints[0].pos, {
      protected: 0,
      commandMode: true,
      commands: [],
    });
    db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
      JSON.stringify(stored),
      room,
    );
    const result = await call("/api/input", {
      room,
      token: a.data.token,
      commands: [],
      epoch: player.epoch,
    });
    assert.equal(result.status, 200);
  }
  const persisted = JSON.parse((statement.get(room) as any).data);
  assert.equal(persisted.room.controlPoints[0].owner, 0);
  assert.ok(persisted.room.scores[0] > 0);
  for (const joined of [a, b]) {
    const data = JSON.parse((statement.get(room) as any).data);
    data.sessions[joined.data.token].seen -= 100;
    db.prepare("UPDATE game_rooms SET data=? WHERE id=?").run(
      JSON.stringify(data),
      room,
    );
    const state = (
      await call("/api/input", {
        room,
        token: joined.data.token,
        commands: [],
        epoch: 1,
      })
    ).data.messages.find((m: any) => m.type === "state").state;
    assert.equal(state.controlPoints[0].owner, 0);
    assert.ok(state.scores[0] > 0);
    assert.equal(state.supplyStations.length, 2);
  }
  db.close();
});
test("hosted creation persists specialist rules and class jetpacks and rejects invalid rules", async () => {
  const { call, db } = fixture();
  await call("/api/rooms");
  const created = await call("/api/create", {
    name: "Fieldwork",
    mode: "tdm",
    jet: "classes",
    arsenal: "specialists",
    seed: 23,
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  const a = await call("/api/join", { room: id, name: "Sapper", classId: 2 }),
    b = await call("/api/join", { room: id, name: "Skirmisher", classId: 1 });
  assert.equal(a.data.welcome.state.arsenal, "specialists");
  assert.equal(a.data.welcome.state.players[0].weapon, 2);
  assert.equal(a.data.welcome.state.players[0].jetpack, false);
  const skirmisher = b.data.welcome.state.players.find(
    (p: any) => p.classId === 1,
  );
  assert.equal(skirmisher.jetpack, true);
  assert.equal(
    (
      await call("/api/create", {
        mode: "tdm",
        jet: "classes",
        arsenal: "cheats",
      })
    ).status,
    400,
  );
  const saved = JSON.parse(
    (db.prepare("SELECT data FROM game_rooms WHERE id=?").get(id) as any).data,
  );
  assert.equal(saved.options.arsenal, "specialists");
});
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
  assert.equal(list.data.length, 6);
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

test("hosted eight-a-side practice persists fifteen NPCs and replaces one for a joining friend", async () => {
  const { call } = fixture();
  const created = await call("/api/create", {
    name: "8 vs 8",
    mode: "ctf",
    jet: "classes",
    seed: 7238,
    bots: 99,
    practice: true,
  });
  assert.equal(created.status, 201);
  const room = created.data.id;
  const a = await call("/api/join", { room, name: "A" });
  const state = a.data.welcome.state;
  assert.equal(state.players.filter((p: any) => p.bot).length, 15);
  assert.deepEqual(
    [0, 1].map(
      (team) => state.players.filter((p: any) => p.team === team).length,
    ),
    [8, 8],
  );
  const b = await call("/api/join", { room, name: "B" });
  assert.equal(b.status, 200);
  assert.equal(b.data.welcome.state.players.length, 16);
  assert.equal(
    b.data.welcome.state.players.filter((p: any) => p.bot).length,
    14,
  );
  const poll = await call("/api/input", {
    room,
    token: a.data.token,
    round: state.round,
    epoch: state.players.find((p: any) => p.id === a.data.welcome.id).epoch,
    commands: [],
  });
  assert.equal(poll.status, 200);
  assert.ok(
    poll.data.messages
      .at(-1)
      .state.players.some((p: any) => p.id === b.data.welcome.id),
  );
  assert.equal(poll.data.messages.at(-1).state.players.length, 16);
});

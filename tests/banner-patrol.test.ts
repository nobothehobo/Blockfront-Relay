import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { flagAssignment } from "../server/ctf-tactics.js";
import {
  World,
  W,
  D,
  idx,
  MAP_PRESETS,
  mapLayout,
  nextMapSeed,
  WEAPONS,
  collides,
} from "../shared/game.js";
import { weaponPose } from "../client/weapon-pose.js";

function fixture(bots = 0) {
  const world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  const r = new Room(
    "ctf-test",
    { name: "Banner Patrol", mode: "ctf", jet: "off", seed: 1, bots },
    world,
  );
  const packets: any[] = [];
  const a = r.add("a", "A", { send: (s) => packets.push(JSON.parse(s)) });
  const b = r.add("b", "B", { send: (s) => packets.push(JSON.parse(s)) });
  r.phase = "active";
  for (const p of r.players.values())
    Object.assign(p, { protected: 0, x: 100, y: 1.01, z: 100 });
  return { r, a, b, packets };
}
test("CTF pickup, death drop at time zero, teammate recovery, blocked capture and three-capture victory", () => {
  const { r, a, b } = fixture();
  assert.equal(r.target, 3);
  Object.assign(a, r.flags[1].home);
  r.objectives();
  assert.equal(r.flags[1].carrier, a.id);
  r.damage(a, 999, b);
  assert.ok(r.flags[1].dropped > 0);
  assert.equal(r.flags[1].carrier, null);
  Object.assign(b, r.flags[1].pos);
  r.objectives();
  assert.equal(r.flags[1].dropped, 0);
  a.dead = 0;
  a.health = 100;
  Object.assign(b, { x: 100, y: 1.01, z: 100 });
  for (let n = 0; n < 3; n++) {
    Object.assign(a, r.flags[1].home);
    r.objectives();
    assert.equal(r.flags[1].carrier, a.id);
    Object.assign(a, r.flags[0].home);
    r.flags[0].carrier = b.id;
    r.objectives();
    assert.equal(r.scores[0], n, "own flag must be home");
    r.flags[0].carrier = null;
    r.flags[0].pos = { ...r.flags[0].home };
    r.objectives();
    assert.equal(r.scores[0], n + 1);
  }
  assert.equal(r.phase, "finished");
  assert.match(r.winner, /Azure/);
  r.restart();
  assert.deepEqual(r.scores, [0, 0]);
  assert.ok(r.flags.every((f) => !f.carrier && !f.dropped));
});
test("CTF disconnect drops, timed recovery and late join state are authoritative", () => {
  const { r, a, b } = fixture();
  Object.assign(a, r.flags[1].home);
  r.objectives();
  Object.assign(a, { x: 90, y: 1.01, z: 80 });
  r.remove(a.id);
  assert.ok(r.flags[1].dropped > 0);
  assert.equal(r.flags[1].carrier, null);
  Object.assign(b, { x: 150, y: 1.01, z: 150 });
  let welcome: any;
  r.add("late", "Late", { send: (s) => (welcome = JSON.parse(s)) });
  assert.ok(welcome.state.flags[1].dropped > 0);
  r.time = 26;
  r.objectives();
  assert.deepEqual(r.flags[1].pos, r.flags[1].home);
  assert.equal(r.flags[1].dropped, 0);
});
test("NPC squad divides defense, raids, human-carrier escort and closest-pair recovery", () => {
  const { r, a } = fixture(7);
  const allies = [...r.players.values()]
    .filter((p) => p.bot && p.team === a.team)
    .sort((a, b) => a.id.localeCompare(b.id));
  assert.ok(allies.length >= 3);
  assert.equal(flagAssignment(allies[0], r.players, r.flags).role, "defender");
  assert.equal(flagAssignment(allies[2], r.players, r.flags).role, "raider");
  r.flags[1].carrier = a.id;
  assert.equal(flagAssignment(allies[1], r.players, r.flags).role, "escort");
  assert.equal(flagAssignment(allies[0], r.players, r.flags).role, "defender");
  r.flags[0].dropped = 1;
  r.flags[0].pos = { x: 110, y: 1.01, z: 100 };
  allies.forEach((p, i) => (p.x = 110 + i * 10));
  assert.equal(flagAssignment(allies[0], r.players, r.flags).role, "recover");
  assert.equal(flagAssignment(allies[1], r.players, r.flags).role, "recover");
  assert.equal(flagAssignment(allies[2], r.players, r.flags).role, "escort");
  r.tick();
  assert.ok(
    r
      .state()
      .players.filter((p) => p.bot)
      .every((p) => p.npcRole),
  );
});
test("NPC runner autonomously steals and captures using normal server movement", () => {
  const { r, a, b } = fixture(1);
  const bot = [...r.players.values()].find((p) => p.bot)!;
  bot.team = 0;
  for (const p of [a, b]) Object.assign(p, { x: 200, z: 200, protected: 1000 });
  r.flags = [0, 1].map((team) => ({
    team,
    home: { x: team ? 55 : 40, y: 1.01, z: 40 },
    pos: { x: team ? 55 : 40, y: 1.01, z: 40 },
    carrier: null,
    dropped: 0,
  }));
  Object.assign(bot, { x: 40, y: 1.01, z: 40, ground: true, protected: 0 });
  for (let n = 0; n < 900 && r.scores[0] === 0; n++) r.tick();
  assert.ok(
    r.scores[0] > 0,
    "runner must actually reach flag and bring it home",
  );
});
test("solo outbreak starts the human as a survivor against infected NPCs", () => {
  const room = new Room("outbreak-solo", {
    name: "Survival",
    mode: "infection",
    jet: "off",
    seed: 7238,
    bots: 3,
  });
  const human = room.add("human", "Survivor", { send: () => {} });
  room.start();
  assert.equal(human.zombie, false);
  assert.ok(
    [...room.players.values()].some((p) => p.bot && p.zombie && p.weapon === 4),
  );
});
test("four deterministic map families differ structurally and round rotation changes family", () => {
  assert.deepEqual(
    MAP_PRESETS.map((p) => mapLayout(p.seed)),
    [0, 1, 2, 3],
  );
  const worlds = MAP_PRESETS.map((p) => new World(p.seed));
  for (const [i, w] of worlds.entries()) {
    assert.deepEqual(w.blocks, new World(w.seed).blocks);
    const clone = new World(1, false);
    clone.decode(w.encode());
    assert.deepEqual(clone.blocks, w.blocks);
    for (const x of [40, 280])
      assert.equal(collides(w, x, 13.01, 160), false, `base clear ${i}`);
    let seed = w.seed;
    for (let round = 2; round < 12; round++) {
      const next = nextMapSeed(seed, round);
      assert.notEqual(mapLayout(next), mapLayout(seed));
      seed = next;
    }
  }
  assert.ok(
    worlds[0].get(134, 17, 140) !== worlds[1].get(134, 17, 140),
    "aqueduct deck is distinct",
  );
  for (const cx of [134, 186])
    for (let step = 0; step < 5; step++) {
      assert.ok(
        worlds[1].get(cx - 8 + step, 13 + step, 135),
        "supported aqueduct stair",
      );
      assert.equal(
        collides(worlds[1], cx - 7.5 + step, 14.01 + step, 135.5),
        false,
        "clear stair headroom",
      );
    }
  assert.ok(worlds[2].get(180, 19, 94), "ridgeline has elevated terrain");
  assert.notDeepEqual(worlds[0].blocks, worlds[1].blocks);
  assert.notDeepEqual(worlds[1].blocks, worlds[2].blocks);
});
test("weapon animation cycles magazines, shells, actions and switches without changing weapon data", () => {
  const before = JSON.stringify(WEAPONS);
  for (const n of [0, 1, 2, 3, 6]) {
    const duration = WEAPONS[n].reload;
    for (const progress of [0, 0.1, 0.45, 0.85, 1]) {
      const p = weaponPose(1000, n, 0, 0, false, duration * (1 - progress));
      assert.ok(
        Object.values(p)
          .filter((v) => typeof v === "number")
          .every(Number.isFinite),
      );
      assert.ok(Math.abs(p.y) <= 0.31);
      if (progress === 0.45 && n !== 2) assert.ok(p.magazine > 0.5);
      if (progress === 1) assert.equal(p.reloadPhase, "ready");
    }
  }
  assert.ok(weaponPose(250, 2, 0, 0, false, 0).bolt > 0.8);
  assert.ok(weaponPose(350, 3, 0, 0, false, 0).bolt > 0.8);
  assert.ok(weaponPose(140, 4, 0, 0, false, 0).pitch > 0.6);
  assert.equal(weaponPose(1000, 0, 0, 0, false, 0, 0).y, -0.3);
  assert.equal(weaponPose(1000, 0, 0, 0, false, 0, 300).y, 0);
  assert.equal(JSON.stringify(WEAPONS), before);
});

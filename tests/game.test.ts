import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import {
  World,
  emptyInput,
  move,
  idx,
  WEAPONS,
  ray,
  TICK,
  W,
  D,
} from "../shared/game.js";
function fixture(
  mode: "tdm" | "relay" | "infection" = "tdm",
  jet: "all" | "off" = "all",
) {
  const r = new Room("test", {
    name: "Test",
    mode,
    jet,
    seed: 7231,
    target: 3,
  });
  r.world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) r.world.blocks[idx(x, 0, z)] = 3;
  const packets: any[] = [];
  const peer = { send: (s: string) => packets.push(JSON.parse(s)) };
  const a = r.add("a", "Alice", peer),
    b = r.add("b", "Bob", peer);
  Object.assign(a, { x: 40, y: 1.01, z: 40, yaw: 0, pitch: 0, protected: 0 });
  Object.assign(b, {
    x: 40,
    y: 1.01,
    z: 35,
    yaw: Math.PI,
    pitch: 0,
    protected: 0,
  });
  r.phase = "active";
  return { r, a, b, packets };
}
test("deterministic seed, lossless compact map, late join receives edits", () => {
  const w = new World(95),
    clone = new World(95);
  assert.deepEqual(w.blocks, clone.blocks);
  w.set(41, 15, 41, 8);
  const packed = w.encode();
  const decoded = new World(0, false);
  decoded.decode(packed);
  assert.deepEqual(w.blocks, decoded.blocks);
  const { r } = fixture();
  r.world.set(42, 2, 42, 7);
  let welcome: any;
  r.add("c", "Late", { send: (s) => (welcome = JSON.parse(s)) });
  const late = new World(0, false);
  late.decode(welcome.map);
  assert.equal(late.get(42, 2, 42), 7);
});
test("movement speed is server-owned and malicious numeric values are rejected", () => {
  const { r, a } = fixture();
  r.input("a", { ...emptyInput(), seq: 1, forward: 100, yaw: 0 });
  assert.equal(a.input.forward, 1);
  const z = a.z;
  for (let n = 0; n < 30; n++) r.tick();
  assert.ok(z - a.z < 5.6);
  r.input("a", { ...emptyInput(), seq: 2, yaw: NaN });
  assert.equal(a.lastSeq, 1);
});
test("hitscan damage, ammunition, fire rate, death, TDM score and respawn", () => {
  const { r, a, b } = fixture();
  a.pitch = -0.12; // Torso aim; headshot behavior has its own authority test.
  a.input = { ...emptyInput(), fire: true };
  r.fire(a);
  assert.equal(b.health, 70);
  assert.equal(a.ammo[0], 23);
  r.fire(a);
  assert.equal(b.health, 70);
  for (let n = 0; n < 3; n++) {
    a.cooldown = 0;
    r.fire(a);
  }
  assert.equal(b.health, 0);
  assert.equal(b.dead, 3);
  assert.equal(a.kills, 1);
  assert.equal(r.scores[0], 1);
  a.input.fire = false;
  for (let n = 0; n < 92; n++) r.tick();
  assert.equal(b.dead, 0);
  assert.equal(b.health, 100);
});
test("terrain occludes combat and teammates cannot be damaged", () => {
  const { r, a, b } = fixture();
  for (let x = 39; x <= 41; x++)
    for (let y = 1; y <= 3; y++) r.world.set(x, y, 37, 3);
  r.fire(a);
  assert.equal(b.health, 100);
  for (let x = 39; x <= 41; x++)
    for (let y = 1; y <= 3; y++) r.world.set(x, y, 37, 0);
  a.cooldown = 0;
  b.team = a.team;
  r.fire(a);
  assert.equal(b.health, 100);
});
test("reload consumes reserve and weapon switch cancels reload", () => {
  const { r, a } = fixture();
  a.ammo[0] = 2;
  a.input = { ...emptyInput(), reload: true };
  r.tick();
  assert.ok(a.reload > 0);
  for (let n = 0; n < 55; n++) r.tick();
  assert.equal(a.ammo[0], 24);
  assert.equal(a.reserve[0], 122);
  a.ammo[0] = 0;
  r.tick();
  assert.ok(a.reload > 0);
  a.input.weapon = 1;
  r.tick();
  assert.equal(a.reload, 0);
  assert.equal(a.ammo[0], 0);
});
test("authoritative block edits are broadcast, constrained by range and inventory", () => {
  const { r, a, b, packets } = fixture();
  for (let x = 39; x <= 41; x++)
    for (let y = 1; y <= 3; y++) r.world.set(x, y, 37, 3);
  a.pitch = 0;
  a.yaw = 0;
  r.edit(a, false);
  assert.equal(r.world.get(40, 2, 37), 0);
  assert.equal(a.blocks, 81);
  assert.ok(packets.some((p) => p.type === "edit" && p.value === 0));
  a.editCooldown = 0;
  for (let x = 39; x <= 41; x++)
    for (let y = 1; y <= 3; y++) r.world.set(x, y, 37, 3);
  r.edit(a, true);
  assert.equal(r.world.get(40, 2, 38), 7);
  assert.equal(a.blocks, 80);
  a.editCooldown = 0;
  a.blocks = 0;
  r.edit(a, true);
  assert.equal(a.blocks, 0);
  a.editCooldown = 0;
  a.blocks = 80;
  r.world.set(40, 2, 38, 0);
  Object.assign(b, { x: 40.5, y: 1.01, z: 38.5 });
  r.edit(a, true);
  assert.equal(r.world.get(40, 2, 38), 0);
  a.editCooldown = 0;
  for (let x = 39; x <= 41; x++)
    for (let y = 1; y <= 3; y++) r.world.set(x, y, 37, 0);
  r.world.set(40, 2, 30, 3);
  r.edit(a, false);
  assert.equal(r.world.get(40, 2, 30), 3);
});
test("relay pickup, death drop, teammate return and capture are authoritative", () => {
  const { r, a, b } = fixture("relay");
  Object.assign(a, r.flags[1].home);
  r.objectives();
  assert.equal(r.flags[1].carrier, "a");
  r.damage(a, 999, b);
  assert.equal(r.flags[1].carrier, null);
  assert.ok(r.flags[1].dropped >= 0);
  a.dead = 0;
  a.health = 100;
  a.protected = 0;
  Object.assign(b, r.flags[1].pos);
  r.objectives();
  assert.equal(r.flags[1].dropped, 0);
  Object.assign(a, r.flags[1].home);
  r.objectives();
  assert.equal(r.flags[1].carrier, "a");
  Object.assign(a, r.flags[0].home);
  r.objectives();
  assert.equal(r.scores[0], 1);
  assert.equal(r.flags[1].carrier, null);
});
test("jetpack thrust, fuel depletion and recharge remain server controlled", () => {
  const { r, a } = fixture();
  a.input = { ...emptyInput(), jet: true };
  const y = a.y;
  for (let n = 0; n < 40; n++) r.tick();
  assert.ok(a.y > y + 3);
  assert.ok(a.fuel < 65);
  a.input.jet = false;
  const fuel = a.fuel;
  for (let n = 0; n < 30; n++) r.tick();
  assert.ok(a.fuel > fuel);
  const off = fixture("tdm", "off");
  off.a.input = { ...emptyInput(), jet: true };
  for (let n = 0; n < 40; n++) off.r.tick();
  assert.ok(off.a.y < 2);
});
test("zombie infection converts humans, respawns as melee, and ends round", () => {
  const { r, a, b, packets } = fixture("infection");
  a.zombie = true;
  a.team = 1;
  a.weapon = 4;
  b.team = 0;
  b.health = 30;
  Object.assign(a, { z: 38 });
  r.fire(a);
  assert.equal(b.zombie, true);
  assert.equal(b.team, 1);
  assert.equal(b.weapon, 4);
  assert.ok(b.dead > 0);
  r.tick();
  assert.equal(r.phase, "finished");
  assert.equal(r.winner, "Zombies win");
});
test("humans win by surviving timer; next round resets map", () => {
  const { r, a, b, packets } = fixture("infection");
  a.zombie = true;
  a.team = 1;
  b.team = 0;
  r.remaining = 0.01;
  r.world.set(45, 2, 45, 7);
  r.tick();
  assert.equal(r.winner, "Humans survived");
  r.remaining = 0.01;
  r.tick();
  assert.equal(r.phase, "waiting");
  assert.equal(r.round, 2);
  assert.notEqual(r.options.seed, 7231);
  const mapPacket = packets.find((p: any) => p.type === "map");
  assert.equal(mapPacket.seed, r.options.seed);
  const synced = new World(0, false);
  synced.decode(mapPacket.map);
  assert.deepEqual(synced.blocks, r.world.blocks);
  assert.equal(
    r.world.get(45, 2, 45),
    new World(r.options.seed).get(45, 2, 45),
  );
});
test("DDA supports exactly axis-aligned rays on voxel boundaries", () => {
  const w = new World(0, false);
  w.set(3, 3, 3, 3);
  const h = ray(w, { x: 3, y: 3, z: 7 }, { x: 0, y: 0, z: -1 }, 10);
  assert.ok(h);
  assert.equal(h.z, 3);
});
test("thirty-two players tick and receive state without exceeding configured capacity", () => {
  const r = new Room("load", {
    name: "Load",
    mode: "tdm",
    jet: "all",
    seed: 73,
  });
  let states = 0;
  for (let i = 0; i < 32; i++)
    r.add(String(i), `P${i}`, {
      send: (s) => {
        if (JSON.parse(s).type === "state") states++;
      },
    });
  assert.throws(() => r.add("33", "Too many", { send: () => {} }));
  const start = performance.now();
  for (let n = 0; n < 300; n++) r.tick();
  assert.ok(states > 100);
  assert.ok(performance.now() - start < 5000);
});

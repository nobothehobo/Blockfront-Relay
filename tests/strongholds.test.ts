import test from "node:test";
import assert from "node:assert/strict";
import { World, idx, emptyInput, demolitionCells } from "../shared/game.js";
import { Room } from "../server/room.js";
import { detachedComponent } from "../server/structures.js";
test("bounded collapse preserves anchored and uncertain components, removes detached ones to both peers", () => {
  const world = new World(1, false);
  for (let y = 0; y <= 6; y++) world.set(40, y, 40, 3);
  world.blocks[idx(40, 0, 40)] = 3;
  assert.deepEqual(detachedComponent(world, idx(40, 6, 40)), []);
  world.set(40, 3, 40, 0);
  assert.equal(detachedComponent(world, idx(40, 4, 40)).length, 3);
  assert.deepEqual(detachedComponent(world, idx(40, 4, 40), 1), []);
  const room = new Room("collapse", {
    name: "Collapse",
    mode: "tdm",
    jet: "off",
    seed: 1,
  });
  room.world = world;
  const packets: any[][] = [[], []];
  packets.forEach((p, i) =>
    room.peers.set(String(i), { send: (s) => p.push(JSON.parse(s)) }),
  );
  room.queueCollapse(40, 3, 40);
  while (room.collapseSeeds.length) room.collapse();
  assert.equal(world.get(40, 6, 40), 0);
  assert.equal(world.get(40, 2, 40), 3);
  assert.deepEqual(packets[0], packets[1]);
  assert.ok(packets[0].some((p) => p.type === "edits"));
  let welcome: any;
  room.add("late", "Late", { send: (s) => (welcome = JSON.parse(s)) });
  const late = new World(1, false);
  late.decode(welcome.map);
  assert.equal(late.get(40, 6, 40), 0);
});
test("Demolition strongholds score terrain loss, end at 85 percent loss and regenerate", () => {
  const r = new Room("demolition", {
    name: "Demo",
    mode: "demolition",
    jet: "off",
    seed: 7231,
  });
  r.add("a", "Azure", { send() {} });
  r.add("b", "Ember", { send() {} });
  r.start();
  assert.ok(r.demolitionStatus().every((s) => s.remaining === s.total));
  const cells = demolitionCells(1);
  for (const [x, y, z] of cells.slice(0, Math.ceil(cells.length * 0.86)))
    r.world.set(x, y, z, 0);
  r.tick();
  assert.equal(r.phase, "finished");
  assert.match(r.winner, /Azure/);
  assert.ok(r.scores[0] >= 85);
  r.restart();
  assert.ok(r.demolitionStatus().every((s) => s.remaining === s.total));
});
test("Sapper breach is range-limited, synchronized and cooldown-owned", () => {
  const r = new Room("breach", {
    name: "Breach",
    mode: "tdm",
    jet: "off",
    seed: 1,
  });
  r.world = new World(1, false);
  const packets: any[] = [];
  const p = r.add(
    "a",
    "Sapper",
    { send: (s) => packets.push(JSON.parse(s)) },
    false,
    2,
  );
  Object.assign(p, {
    x: 40.5,
    y: 1,
    z: 40.5,
    yaw: 0,
    pitch: 0,
    abilityCooldown: 0,
  });
  for (let x = 39; x <= 41; x++)
    for (let y = 1; y <= 3; y++)
      for (let z = 36; z <= 38; z++) r.world.set(x, y, z, 3);
  r.useAbility(p);
  assert.equal(r.world.get(40, 2, 38), 0);
  assert.ok(packets.some((p) => p.type === "edits"));
  r.world.set(40, 2, 38, 3);
  r.useAbility(p);
  assert.equal(r.world.get(40, 2, 38), 3);
});
test("precision head hits get server-owned bonus; body hits retain base damage", () => {
  const r = new Room("head", {
    name: "Head",
    mode: "tdm",
    jet: "off",
    seed: 1,
  });
  r.world = new World(1, false);
  const a = r.add("a", "A", { send() {} }),
    b = r.add("b", "B", { send() {} });
  r.start();
  Object.assign(a, {
    x: 40,
    y: 1,
    z: 40,
    yaw: 0,
    pitch: 0,
    weapon: 3,
    protected: 0,
    input: { ...emptyInput(), aim: true },
  });
  Object.assign(b, { x: 40, y: 1, z: 35, protected: 0 });
  r.fire(a);
  assert.equal(b.health, 0);
  r.spawn(b);
  Object.assign(b, { x: 40, y: 1, z: 35, protected: 0 });
  a.cooldown = 0;
  a.pitch = -0.12;
  r.fire(a);
  assert.equal(b.health, 28);
});

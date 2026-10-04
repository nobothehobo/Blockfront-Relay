import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { World, W, D, idx, emptyInput } from "../shared/game.js";
import { gearInfo } from "../shared/gear.js";

function fixture(role = 0) {
  const world = new World(0, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  const room = new Room(
    "gear",
    { name: "Gear", mode: "tdm", jet: "off", seed: 0 },
    world,
  );
  const packets: any[] = [];
  const p = room.add(
    "a",
    "A",
    { send: (s) => packets.push(JSON.parse(s)) },
    false,
    role,
  );
  const q = room.add("b", "B", { send: (s) => packets.push(JSON.parse(s)) });
  Object.assign(p, {
    x: 80.5,
    y: 0.98,
    z: 80.5,
    yaw: 0,
    pitch: 0,
    ground: true,
    protected: 0,
  });
  Object.assign(q, { x: 90.5, y: 0.98, z: 80.5, ground: true, protected: 0 });
  room.phase = "active";
  return { room, world, p, q, packets };
}
test("gear commands preserve brief taps, choose the server class and replicate inventory and objects", () => {
  for (let role = 0; role < 5; role++) {
    const { room, p, packets } = fixture(role);
    room.queueInputs(
      p.id,
      [
        { ...emptyInput(), seq: 1, gear: true },
        { ...emptyInput(), seq: 2, gear: false },
      ],
      p.epoch!,
    );
    for (let i = 0; i < 3; i++) room.tick();
    assert.equal(room.fieldGear.length, 1);
    assert.equal(room.fieldGear[0].kind, gearInfo(role).kind);
    assert.equal(p.gearCharges, gearInfo(role).charges - 1);
    assert.ok(p.gearCooldown! > 0);
    room.deployGear(p);
    assert.equal(room.fieldGear.length, 1, "cooldown rejects repeat placement");
    const peers = packets.filter((v) => v.type === "state");
    assert.ok(peers.length >= 2);
    assert.deepEqual(peers[0].state.fieldGear, peers[1].state.fieldGear);
    let welcome: any;
    room.add("late", "Late", { send: (s) => (welcome = JSON.parse(s)) });
    assert.equal(welcome.state.fieldGear[0].id, room.fieldGear[0].id);
  }
});
test("gear placement rejects air, walls, occupied cells, empty inventory, nonactive rounds and infected players", () => {
  const { room, world, p, q } = fixture();
  p.ground = false;
  room.deployGear(p);
  p.ground = true;
  p.zombie = true;
  room.deployGear(p);
  p.zombie = false;
  p.dead = 2;
  room.deployGear(p);
  p.dead = 0;
  room.phase = "finished";
  room.deployGear(p);
  room.phase = "active";
  p.gearCharges = 0;
  room.deployGear(p);
  p.gearCharges = 2;
  Object.assign(q, { x: p.x, z: p.z - 2 });
  room.deployGear(p);
  q.x += 10;
  world.set(80, 2, 79, 3);
  room.deployGear(p);
  world.set(80, 2, 79, 0);
  world.blocks[idx(80, 0, 78)] = 0;
  room.deployGear(p);
  world.blocks[idx(80, 0, 78)] = 3;
  assert.equal(room.fieldGear.length, 0);
  assert.equal(p.gearCharges, 2, "failed attempts do not consume inventory");
  room.deployGear(p);
  assert.equal(room.fieldGear.length, 1);
});
test("medboxes heal friendly living players up to class health, respect walls and are consumed", () => {
  const { room, world, p, q } = fixture();
  room.deployGear(p);
  const g = room.fieldGear[0];
  Object.assign(q, { x: g.x, y: g.y, z: g.z, health: 50 });
  q.team = 1 - p.team;
  room.updateGear(0.1);
  assert.equal(q.health, 50);
  q.team = p.team;
  q.zombie = true;
  room.updateGear(0.1);
  assert.equal(q.health, 50);
  q.zombie = false;
  q.dead = 1;
  room.updateGear(0.1);
  assert.equal(q.health, 50);
  q.dead = 0;
  q.x = g.x + 1.2;
  world.set(81, 1, 78, 3);
  room.updateGear(0.1);
  assert.equal(q.health, 50);
  world.set(81, 1, 78, 0);
  q.health = 90;
  room.updateGear(0.1);
  assert.equal(q.health, 100);
  assert.equal(room.fieldGear.length, 0);
});
test("mines arm before triggering, ignore friends and blocked enemies and cause authoritative damage", () => {
  const { room, world, p, q, packets } = fixture(3);
  room.deployGear(p);
  const g = room.fieldGear[0];
  Object.assign(q, { x: g.x + 1.2, y: g.y, z: g.z, team: 1 - p.team });
  room.updateGear(1);
  assert.equal(room.fieldGear.length, 1);
  q.team = p.team;
  room.updateGear(1.1);
  assert.equal(room.fieldGear.length, 1);
  q.team = 1 - p.team;
  world.set(81, 1, 78, 3);
  room.updateGear(0.1);
  assert.equal(room.fieldGear.length, 1);
  world.set(81, 1, 78, 0);
  room.updateGear(0.1);
  assert.equal(room.fieldGear.length, 0);
  assert.ok(q.health < 100);
  assert.ok(room.events.some((e) => e.kind === "explosion"));
});
test("timed charges replicate craters, preserve bedrock and cannot detonate again", () => {
  const { room, world, p, q } = fixture(2);
  room.deployGear(p);
  const g = room.fieldGear[0];
  p.z += 15;
  q.x += 20;
  world.set(80, 1, 77, 3);
  room.updateGear(2.9);
  assert.equal(world.get(80, 1, 77), 3);
  room.updateGear(0.11);
  assert.equal(world.get(80, 1, 77), 0);
  assert.equal(world.get(80, 0, 78), 3);
  assert.equal(room.fieldGear.length, 0);
  const revision = room.revision;
  room.updateGear(1);
  assert.equal(room.revision, revision);
  assert.equal(g.kind, "charge");
});
test("field gear expires, loses support and is bounded and removed when its owner disconnects", () => {
  const { room, world, p } = fixture(1);
  room.deployGear(p);
  const g = room.fieldGear[0];
  world.blocks[idx(Math.floor(g.x), 0, Math.floor(g.z))] = 0;
  room.updateGear(0.1);
  assert.equal(room.fieldGear.length, 0);
  world.blocks[idx(Math.floor(g.x), 0, Math.floor(g.z))] = 3;
  p.gearCooldown = 0;
  room.deployGear(p);
  room.updateGear(46);
  assert.equal(room.fieldGear.length, 0);
  p.gearCooldown = 0;
  room.deployGear(p);
  assert.equal(room.fieldGear.length, 1);
  room.fieldGear = Array.from({ length: 32 }, (_, i) => ({
    ...room.fieldGear[0],
    id: i,
  }));
  p.gearCooldown = 0;
  p.gearCharges = 3;
  room.deployGear(p);
  assert.equal(p.gearCharges, 3);
  room.remove(p.id);
  assert.equal(room.fieldGear.length, 0);
});
test("Delver bores a reachable two-high tunnel, replicates edits and obeys cooldown and infection rules", () => {
  const { room, world, p, packets } = fixture(4);
  for (let z = 76; z <= 78; z++)
    for (let x = 80; x <= 81; x++)
      for (let y = 1; y <= 2; y++) world.set(x, y, z, 3);
  world.set(80, 2, 74, 3);
  room.useAbility(p);
  assert.equal(room.revision, 12);
  assert.equal(p.blocks, 132);
  for (let z = 76; z <= 78; z++)
    for (let x = 80; x <= 81; x++)
      for (let y = 1; y <= 2; y++) assert.equal(world.get(x, y, z), 0);
  assert.equal(world.get(80, 2, 74), 3, "far terrain is preserved");
  assert.equal(world.get(80, 0, 78), 3);
  assert.equal(p.abilityCooldown, 12);
  assert.equal(
    packets.filter((v) => v.type === "edits" && v.edits.length === 12).length,
    2,
  );
  room.useAbility(p);
  assert.equal(room.revision, 12);
  p.abilityCooldown = 0;
  p.zombie = true;
  room.useAbility(p);
  assert.equal(room.revision, 12);
});
test("Delver boring preserves capture foundations and supply stations refill class gear", () => {
  const { room, world, p } = fixture(4);
  const home = room.base(0);
  Object.assign(p, {
    x: home.x,
    z: home.z + 3,
    y: 13.01,
    yaw: 0,
    abilityCooldown: 0,
  });
  for (let x = Math.floor(home.x); x <= Math.floor(home.x) + 1; x++)
    for (let y = 13; y <= 14; y++) world.set(x, y, Math.floor(home.z), 3);
  room.useAbility(p);
  assert.equal(room.revision, 0);
  p.gearCharges = 0;
  p.lastDamage = -10;
  room.time = 10;
  Object.assign(p, room.supplyStations.find((s) => s.team === p.team)!.pos);
  room.resupply(p, 3.1);
  assert.equal(p.gearCharges, 3);
});

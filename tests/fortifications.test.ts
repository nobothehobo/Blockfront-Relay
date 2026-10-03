import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { thinkBot } from "../server/bots.js";
import {
  World,
  W,
  D,
  idx,
  eye,
  emptyInput,
  direction,
  ray,
} from "../shared/game.js";
import {
  KITS,
  kitCells,
  buildQuarter,
  validateKit,
} from "../shared/fortifications.js";
import {
  CLASS_WEAPONS,
  allowedWeapon,
  classPrimary,
} from "../shared/classes.js";
import { sanitizeInput } from "../shared/prediction.js";
import { weaponPose } from "../client/weapon-pose.js";
function fixture(specialists = false) {
  const r = new Room("kits", {
    name: "Fieldwork",
    mode: "tdm",
    jet: "classes",
    seed: 7,
    arsenal: specialists ? "specialists" : "sandbox",
  });
  r.world = new World(0, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) r.world.blocks[idx(x, 0, z)] = 3;
  const aPackets: any[] = [],
    bPackets: any[] = [];
  const a = r.add(
    "a",
    "Builder",
    { send: (s) => aPackets.push(JSON.parse(s)) },
    false,
    2,
  );
  const b = r.add(
    "b",
    "Observer",
    { send: (s) => bPackets.push(JSON.parse(s)) },
    false,
    1,
  );
  Object.assign(a, {
    x: 40.5,
    y: 1.001,
    z: 40.5,
    yaw: 0,
    pitch: -0.5,
    ground: true,
    protected: 0,
  });
  Object.assign(b, { x: 48.5, y: 1.001, z: 40.5, ground: true, protected: 0 });
  r.phase = "active";
  aPackets.length = 0;
  bPackets.length = 0;
  return { r, a, b, aPackets, bPackets };
}
test("original kits have connected cells, open doors, solid steps and face the aimed direction", () => {
  const anchor = { x: 40, y: 1, z: 37 };
  for (let id = 1; id < KITS.length; id++)
    for (let q = 0; q < 4; q++) {
      const cells = kitCells(id, anchor, q),
        keys = new Set(cells.map((b) => `${b.x},${b.y},${b.z}`));
      assert.equal(keys.size, cells.length);
      const reached = new Set<string>(),
        todo = [cells[0]];
      while (todo.length) {
        const p = todo.pop()!,
          key = `${p.x},${p.y},${p.z}`;
        if (reached.has(key)) continue;
        reached.add(key);
        for (const [x, y, z] of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ])
          if (keys.has(`${p.x + x},${p.y + y},${p.z + z}`))
            todo.push({ x: p.x + x, y: p.y + y, z: p.z + z });
      }
      assert.equal(
        reached.size,
        cells.length,
        "no disconnected floating pieces",
      );
    }
  assert.equal(KITS[1].cells.length, 6);
  assert.equal(KITS[2].cells.length, 30);
  assert.ok(
    !KITS[3].cells.some(([x, y, z]) => x === 0 && y < 3 && z === 0),
    "doorway is open",
  );
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const cells = kitCells(2, { x: 40, y: 1, z: 40 }, buildQuarter(yaw)),
      far = cells.find((b) => b.y === 4)!,
      d = direction(yaw, 0);
    const centre = cells
      .filter((b) => b.y === 4)
      .reduce((v, b) => ({ x: v.x + b.x / 3, z: v.z + b.z / 3 }), {
        x: 0,
        z: 0,
      });
    assert.ok(
      (centre.x - 40) * d.x + (centre.z - 40) * d.z > 2.9,
      "ramp rises forward",
    );
    assert.equal(far.y, 4);
  }
});
test("whole-kit placement validates resources, support, range, occupancy, bounds and foundations", () => {
  const { r, a, b } = fixture(),
    cells = kitCells(1, { x: 40, y: 1, z: 37 }, 0),
    check = () => validateKit(r.world, cells, [a, b], eye(a), a.blocks);
  assert.equal(check().valid, true);
  a.blocks = 5;
  assert.equal(check().reason, "Not enough blocks");
  a.blocks = 140;
  b.x = 40.5;
  b.z = 37.5;
  assert.equal(check().reason, "Player in build area");
  b.dead = 3;
  assert.equal(check().valid, true);
  r.world.set(40, 1, 37, 3);
  assert.equal(check().reason, "Terrain blocks placement");
  r.world.set(40, 1, 37, 0);
  assert.equal(
    validateKit(
      r.world,
      kitCells(1, { x: 40, y: 6, z: 37 }, 0),
      [],
      eye(a),
      140,
    ).reason,
    "Needs terrain support",
  );
  assert.equal(
    validateKit(
      r.world,
      kitCells(1, { x: 80, y: 1, z: 37 }, 0),
      [],
      eye(a),
      140,
    ).reason,
    "Too far away",
  );
  assert.equal(
    validateKit(r.world, kitCells(1, { x: 0, y: 1, z: 37 }, 0), [], eye(a), 140)
      .reason,
    "Outside build area",
  );
  const base = r.base(0),
    protectedCells = kitCells(
      1,
      { x: Math.floor(base.x), y: 13, z: Math.floor(base.z) },
      0,
    );
  assert.equal(
    validateKit(r.world, protectedCells, [], { ...base, y: 14 }, 140).reason,
    "Protected foundation",
  );
});
test("server builds atomically, charges exact costs and sends identical deltas to both peers and late joins", () => {
  const { r, a, aPackets, bPackets } = fixture(),
    anchor = { x: 40, y: 1, z: 37 };
  a.input.buildKit = 1;
  const before = a.blocks;
  r.buildKit(a, anchor);
  assert.equal(a.blocks, before - 6);
  assert.equal(r.revision, 6);
  assert.deepEqual(aPackets[0], bPackets[0]);
  assert.equal(aPackets[0].type, "edits");
  assert.equal(aPackets[0].edits.length, 6);
  r.buildKit(a, { x: 43, y: 1, z: 37 });
  assert.equal(r.revision, 6, "cooldown blocks repeated kits");
  a.editCooldown = 0;
  r.buildKit(a, anchor);
  assert.equal(a.blocks, before - 6, "occupied kits do not partly charge");
  a.input.buildKit = 2;
  r.world.set(40, 3, 35, 3);
  r.buildKit(a, anchor);
  assert.equal(r.revision, 6, "blocked ramp creates no partial construction");
  let welcome: any;
  r.add("late", "Late", { send: (s) => (welcome = JSON.parse(s)) });
  const world = new World(0, false);
  world.decode(welcome.map);
  for (const [x, y, z, value] of aPackets[0].edits)
    assert.equal(world.get(x, y, z), value);
});
test("build inputs use the server ray and cannot place a kit without reachable terrain", () => {
  const { r, a } = fixture();
  a.input.buildKit = 1;
  const hit = ray(r.world, eye(a), direction(a.yaw, a.pitch), 6)!;
  assert.ok(hit);
  r.edit(a, true);
  assert.equal(r.revision, 6);
  assert.equal(r.world.get(hit.previous.x, hit.previous.y, hit.previous.z), 7);
  a.editCooldown = 0;
  a.pitch = 0.5;
  r.edit(a, true);
  assert.equal(r.revision, 6);
  for (const bad of [-1, 4, 1.5, "1", NaN, Infinity])
    assert.equal(
      sanitizeInput({ ...emptyInput(), buildKit: bad })!.buildKit,
      0,
    );
});
test("specialist rooms enforce weapons, spawn primaries and class-owned jetpacks while sandbox stays compatible", () => {
  const { r, a } = fixture(true);
  for (let id = 0; id < 4; id++) {
    a.nextClass = id;
    r.spawn(a);
    assert.equal(a.weapon, classPrimary(id, true));
    assert.equal(a.jetpack, id === 1);
    const original = a.weapon;
    r.input(a.id, {
      ...emptyInput(),
      seq: id * 2 + 1,
      classId: id,
      weapon: id === 2 ? 1 : 6,
      fire: true,
    });
    r.tick();
    assert.equal(a.weapon, original, "forbidden weapon rejected server-side");
    assert.equal(a.ammo[6], 2, "cannot fire unauthorized launcher");
    const allowed = CLASS_WEAPONS[id][0];
    r.input(a.id, {
      ...emptyInput(),
      seq: id * 2 + 2,
      classId: id,
      weapon: allowed,
    });
    r.tick();
    assert.equal(a.weapon, allowed);
    const chosen = thinkBot(a, r).weapon;
    assert.ok(allowedWeapon(id, chosen, true), "NPC respects specialist role");
  }
  a.zombie = true;
  r.spawn(a);
  assert.equal(a.jetpack, false);
  assert.equal(a.weapon, 4);
  r.options.arsenal = "sandbox";
  r.options.jet = "all";
  a.zombie = false;
  a.nextClass = 2;
  r.spawn(a);
  assert.equal(a.weapon, 6);
  assert.equal(a.jetpack, true);
});
test("weapon presentation is bounded, settles without firing and does not mutate simulation", () => {
  for (let weapon = 0; weapon < 7; weapon++) {
    const atShot = weaponPose(0, weapon, 12, 0, false, 0),
      settled = weaponPose(500, weapon, 0, 0, false, 0);
    assert.ok(Object.values(atShot).every(Number.isFinite));
    assert.ok(atShot.z <= 0.1);
    assert.equal(settled.z, 0);
    assert.equal(settled.pitch, 0);
  }
  assert.equal(weaponPose(500, 3, 0, 0, true, 0).x, -0.22);
});

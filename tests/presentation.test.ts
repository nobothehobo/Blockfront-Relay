import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { World, emptyInput } from "../shared/game.js";
import { Room } from "../server/room.js";
import { faceOcclusion } from "../client/voxel-shading.js";
import { meshChunk } from "../client/mesh.js";
import { CombatFX } from "../client/combat-fx.js";
import { ViewMotion, crosshairRadius } from "../client/view-motion.js";
import { createCharacter } from "../client/character.js";
import { setCharacterEquipment } from "../client/equipment.js";

test("exposed voxel faces stay bright; adjacent walls occlude only their neighboring corners", () => {
  const w = new World(1, false);
  w.set(25, 5, 25, 3);
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1])
      assert.equal(faceOcclusion(w, 25, 5, 25, axis, sign), 0);
  // The negative-z wall beside the top face affects its two negative-z corners.
  w.set(25, 6, 24, 3);
  let ao = faceOcclusion(w, 25, 5, 25, 1, 1);
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => (ao >>> (i * 2)) & 3),
    [1, 0, 0, 1],
  );
  w.set(24, 6, 25, 3);
  ao = faceOcclusion(w, 25, 5, 25, 1, 1);
  assert.equal(ao & 3, 3, "two touching walls fully occlude the shared corner");
  assert.equal((ao >>> 4) & 3, 0, "opposite corner stays unoccluded");
  w.set(25, 6, 24, 0);
  w.set(24, 6, 25, 0);
  assert.equal(
    faceOcclusion(w, 25, 5, 25, 1, 1),
    0,
    "terrain removal restores ambient light",
  );
});

test("flat terrain still merges to a single top quad and corner shading agrees across chunks", () => {
  const w = new World(1, false);
  for (let x = 16; x < 48; x++) for (let z = 16; z < 48; z++) w.set(x, 5, z, 1);
  const g = meshChunk(w, 1, 1),
    normals = g.getAttribute("normal");
  let topVertices = 0;
  for (let i = 0; i < normals.count; i++)
    if (normals.getY(i) === 1) topVertices++;
  assert.equal(topVertices, 4);
  w.set(31, 6, 25, 3);
  assert.notEqual(faceOcclusion(w, 32, 5, 25, 1, 1), 0);
  const neighbor = meshChunk(w, 2, 1);
  assert.ok(
    neighbor.getAttribute("position").count > g.getAttribute("position").count,
    "occlusion splits affected faces rather than stretching across a whole floor",
  );
  g.dispose();
  neighbor.dispose();
});

test("server confirms terrain, player and miss outcomes with the same authoritative trace", () => {
  const r = new Room("impact", {
    name: "Impact",
    mode: "tdm",
    jet: "off",
    seed: 7231,
  });
  r.world = new World(1, false);
  const p = r.add("a", "A", { send: () => {} });
  Object.assign(p, {
    x: 40.5,
    y: 1.01,
    z: 40.5,
    yaw: 0,
    pitch: 0,
    weapon: 0,
    protected: 0,
    input: { ...emptyInput(), aim: true },
  });
  for (let x = 39; x <= 41; x++)
    for (let y = 1; y <= 4; y++) r.world.set(x, y, 36, 3);
  r.events.length = 0;
  r.fire(p);
  const terrain = r.events.find((e) => e.kind === "shot");
  assert.equal(terrain.impacts.length, 1);
  assert.equal(terrain.impacts[0].kind, "terrain");
  assert.equal(terrain.impacts[0].block, 3);
  assert.deepEqual(terrain.impacts[0].normal, { x: 0, y: 0, z: 1 });
  assert.deepEqual(terrain.impacts[0].pos, terrain.traces[0]);
  const target = r.add("b", "B", { send: () => {} });
  Object.assign(target, {
    x: 40.5,
    y: 1.01,
    z: 38.5,
    team: 1 - p.team,
    protected: 0,
  });
  const health = target.health;
  p.cooldown = 0;
  r.events.length = 0;
  r.fire(p);
  assert.equal(
    r.events.find((e) => e.kind === "shot").impacts[0].kind,
    "player",
  );
  assert.ok(target.health < health);
  target.dead = 10;
  p.x = p.z = 160;
  p.pitch = 1.2;
  p.cooldown = 0;
  r.events.length = 0;
  r.fire(p);
  assert.equal(
    r.events.find((e) => e.kind === "shot").impacts.length,
    0,
    "misses have no invented impact",
  );
});

test("casings reuse a fixed pool, mobile caps effects, and missed tracers produce no endpoint spark", () => {
  const fx = new CombatFX(new THREE.Scene()),
    origin = { x: 10, y: 10, z: 10 },
    dir = { x: 0, y: 0, z: -1 };
  fx.quality = "low";
  for (let i = 0; i < 100; i++) fx.eject(origin, dir, 0);
  assert.equal(fx.casings.length, 16);
  assert.equal(fx.casingPool.length + fx.casings.length, 64);
  fx.update(1000, 1);
  assert.equal(fx.casings.length, 0);
  assert.equal(fx.casingPool.length, 64);
  fx.shot(origin, [{ x: 10, y: 10, z: 5 }]);
  fx.update(2000, 1);
  assert.equal(fx.particles.length, 0);
  fx.quality = "high";
  for (let i = 0; i < 100; i++) fx.eject(origin, dir, 2);
  assert.equal(fx.casings.length, 64);
  fx.explosion(origin, new THREE.Vector3(10, 10, 10));
  fx.update(2050, 0.05);
  assert.ok(fx.smoke.count > 0 && fx.smoke.count <= 96);
  fx.clear();
  assert.equal(fx.smoke.count, 0);
  assert.equal(fx.casingPool.length, 64);
});

test("weapon sway and landing settle, ignore initial spawns, and preserve the simulation aim", () => {
  const m = new ViewMotion();
  m.update(2, 0.1, -18, false, false, 0.016);
  assert.equal(m.landing, 0);
  assert.equal(m.lookX, 0);
  m.update(2.1, 0.15, 0, true, false, 0.016);
  assert.ok(m.landing > 0 && m.landing < 0.075);
  assert.ok(Math.abs(m.lookX) <= 0.035);
  for (let i = 0; i < 100; i++) m.update(2.1, 0.15, 0, true, false, 0.016);
  assert.ok(m.landing < 1e-6 && Math.abs(m.lookX) < 1e-6);
  assert.equal(m.yaw, 2.1);
  assert.equal(m.pitch, 0.15);
  m.reset();
  m.update(-2, 0, 0, true, false, 0.016);
  assert.equal(m.landing, 0);
  assert.ok(
    crosshairRadius(0.065, true, 80, 900, 1) <
      crosshairRadius(0.065, false, 80, 900, 1),
  );
});

test("held class equipment changes with the loadout and keeps one solid mesh", () => {
  const c = createCharacter({
    id: "test",
    team: 0,
    zombie: false,
    classId: 4,
    weapon: 2,
  });
  assert.equal(c.userData.gun.userData.weapon, 2);
  const first = c.userData.gun;
  setCharacterEquipment(c, 2, 0, 4);
  assert.equal(c.userData.gun, first);
  for (let n = 0; n < 7; n++) {
    setCharacterEquipment(c, n, 0, 4);
    const item = c.userData.gun as THREE.Mesh;
    assert.equal(item.userData.weapon, n);
    assert.equal(c.userData.rig.rightArm.children.length, 1);
    assert.ok(item.geometry.getAttribute("position").count < 1500);
  }
  assert.ok(c.userData.model.vertices < 6000);
});

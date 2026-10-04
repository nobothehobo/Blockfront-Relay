import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { CLASSES, validClass } from "../shared/classes.js";
import {
  World,
  emptyInput,
  move,
  idx,
  W,
  D,
  Projectile,
} from "../shared/game.js";
import { stepProjectile, blastCells } from "../server/explosives.js";
function fixture(classId = 0) {
  const r = new Room("v2", { name: "2.0", mode: "tdm", jet: "all", seed: 23 });
  r.world = new World(0, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) r.world.blocks[idx(x, 0, z)] = 3;
  const packets: any[] = [];
  const a = r.add(
    "a",
    "A",
    { send: (s) => packets.push(JSON.parse(s)) },
    false,
    classId,
  );
  const b = r.add("b", "B", { send: (s) => packets.push(JSON.parse(s)) });
  Object.assign(a, {
    x: 40.5,
    y: 1.01,
    z: 40.5,
    yaw: 0,
    pitch: 0,
    ground: true,
    protected: 0,
  });
  Object.assign(b, { x: 40.5, y: 1.01, z: 35.5, ground: true, protected: 0 });
  r.phase = "active";
  return { r, a, b, packets };
}
const grenade = (values: Partial<Projectile> = {}): Projectile => ({
  id: 1,
  owner: "a",
  team: 0,
  kind: "grenade",
  x: 40.5,
  y: 2,
  z: 35.5,
  vx: 0,
  vy: 0,
  vz: 0,
  fuse: 2.2,
  ...values,
});
test("five original classes spawn with server-owned stats and cannot change role until respawn", () => {
  for (let id = 0; id < CLASSES.length; id++) {
    const { r, a } = fixture(id),
      role = CLASSES[id];
    assert.equal(a.health, role.health);
    assert.equal(a.weapon, role.primary);
    assert.equal(a.blocks, role.blocks);
    assert.equal(a.grenades, role.grenades);
    r.tick();
    assert.equal(
      a.weapon,
      role.primary,
      "loadout survives before client input arrives",
    );
    r.input("a", {
      ...emptyInput(),
      seq: 1,
      classId: (id + 1) % CLASSES.length,
    });
    assert.equal(a.classId, id);
    assert.equal(a.nextClass, (id + 1) % CLASSES.length);
    r.spawn(a);
    assert.equal(a.classId, (id + 1) % CLASSES.length);
    r.input("a", { ...emptyInput(), seq: 2, classId: 999 });
    assert.equal(a.nextClass, (id + 1) % CLASSES.length);
  }
  for (const bad of [NaN, -1, CLASSES.length, 1.5, "2"])
    assert.equal(validClass(bad), false);
});
test("class abilities have authoritative cooldowns, limits and distinct effects", () => {
  const { r, a, b } = fixture();
  b.team = a.team;
  a.health = 50;
  b.health = 50;
  r.useAbility(a);
  assert.equal(a.health, 70);
  assert.equal(b.health, 65);
  r.useAbility(a);
  assert.equal(a.health, 70);
  assert.equal(a.abilityCooldown, 22);
  a.nextClass = 2;
  r.spawn(a);
  a.grenades = 0;
  a.blocks = 190;
  r.useAbility(a);
  assert.equal(a.blocks, 200);
  assert.equal(a.grenades, 1);
  a.nextClass = 1;
  r.spawn(a);
  r.useAbility(a);
  assert.equal(a.abilityTime, 4);
  const baseline = { ...a, abilityTime: 0 },
    boosted = { ...a };
  move(baseline, { ...emptyInput(), forward: 1 }, r.world, 1 / 30);
  move(boosted, { ...emptyInput(), forward: 1 }, r.world, 1 / 30);
  assert.ok(Math.abs(boosted.vz) > Math.abs(baseline.vz));
  a.nextClass = 3;
  r.spawn(a);
  r.useAbility(a);
  assert.equal(a.abilityTime, 5);
  a.zombie = true;
  a.abilityCooldown = 0;
  a.grenades = 2;
  r.useAbility(a);
  r.throwGrenade(a);
  assert.equal(r.projectiles.length, 0);
});
test("grenades bounce on terrain and detonate at a bounded fuse", () => {
  const { r } = fixture(),
    p = grenade({ y: 1.2, vy: -4 });
  assert.equal(stepProjectile(p, r.world, 0.1), false);
  assert.ok(p.vy > 0);
  assert.ok(p.y >= 1);
  let detonated = false;
  for (let i = 0; i < 70 && !detonated; i++)
    detonated = stepProjectile(p, r.world, 1 / 30);
  assert.ok(detonated);
  assert.ok(p.fuse <= 0);
});
test("grenade inventory and cooldown cannot be bypassed by repeated commands", () => {
  const { r, a } = fixture();
  r.throwGrenade(a);
  r.throwGrenade(a);
  assert.equal(r.projectiles.length, 1);
  assert.equal(a.grenades, 1);
  a.grenadeCooldown = 0;
  r.throwGrenade(a);
  a.grenadeCooldown = 0;
  r.throwGrenade(a);
  assert.equal(r.projectiles.length, 2);
  assert.equal(a.grenades, 0);
  assert.equal(r.state().projectiles.length, 2);
});
test("launcher consumes ammo, obeys fire rate, and detonates on a solid surface", () => {
  const { r, a } = fixture(2);
  r.fire(a);
  r.fire(a);
  assert.equal(a.ammo[6], 1);
  assert.equal(r.projectiles.length, 1);
  const p = r.projectiles[0];
  r.world.set(40, 2, 38, 3);
  let hit = false;
  for (let i = 0; i < 10 && !hit; i++) hit = stepProjectile(p, r.world, 1 / 30);
  assert.ok(hit);
  assert.ok(p.fuse > 0);
});
test("explosions damage enemies, respect cover and friendly protection, and replicate a terrain batch", () => {
  const { r, a, b, packets } = fixture();
  a.z = 29.5;
  const ally = r.add("ally", "Ally", { send: () => {} });
  Object.assign(ally, { team: a.team, x: b.x, y: b.y, z: b.z, protected: 0 });
  r.world.set(42, 2, 35, 3);
  r.world.set(43, 2, 35, 3);
  r.explode(grenade());
  assert.equal(b.dead, 3);
  assert.equal(ally.health, 100);
  assert.equal(a.health, 100);
  assert.equal(r.world.get(42, 2, 35), 0);
  assert.ok(packets.some((p) => p.type === "edits" && p.edits.length === 2));
  let welcome: any;
  r.add("late", "Late", { send: (s) => (welcome = JSON.parse(s)) });
  const w = new World(0, false);
  w.decode(welcome.map);
  assert.equal(w.get(42, 2, 35), 0);
  const covered = fixture();
  covered.a.z = 30.5;
  covered.b.z = 37.5;
  covered.r.world.set(40, 1, 36, 3);
  covered.r.explode(grenade());
  assert.ok(covered.b.health > 70);
  assert.equal(r.world.get(40, 0, 35), 3, "bedrock is preserved");
});
test("explosions cannot remove protected objective foundations", () => {
  const r = new Room("base", {
    name: "Base",
    mode: "relay",
    jet: "off",
    seed: 23,
  });
  const home = r.flags[0].home,
    edits = blastCells(r.world, { ...home, y: 13 });
  assert.ok(
    edits.every(
      ([x, y, z]) =>
        y >= 15 || Math.hypot(x + 0.5 - home.x, z + 0.5 - home.z) >= 3,
    ),
  );
});
test("launcher swept collision hits a player before passing through their body", () => {
  const { r, a, b } = fixture(2);
  r.fire(a);
  for (let n = 0; n < 10; n++) r.tick();
  assert.ok(b.health < 40, "direct impact applies blast damage");
  assert.equal(r.projectiles.length, 0);
});

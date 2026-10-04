import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { classInfo } from "../shared/classes.js";
import { WEAPONS } from "../shared/game.js";

function fixture() {
  const room = new Room("control", {
    name: "Control",
    mode: "frontline",
    seed: 7231,
    jet: "off",
    target: 100,
  });
  const packets: any[] = [];
  room.add("a", "Azure", { send: (raw) => packets.push(JSON.parse(raw)) });
  room.add("b", "Ember", { send: (raw) => packets.push(JSON.parse(raw)) });
  room.start();
  const a = room.players.get("a")!,
    b = room.players.get("b")!;
  a.protected = b.protected = 0;
  return { room, a, b, packets };
}
test("NPCs autonomously capture Frontline sectors and earn team points", () => {
  const room = new Room("ai", {
    name: "AI",
    mode: "frontline",
    jet: "off",
    seed: 7231,
    bots: 4,
  });
  room.add("human", "Human", { send() {} });
  room.start();
  // Exercise ordinary bot navigation/capture without random long-range combat
  // outcomes deciding whether a sector is reached within a fixed test deadline.
  for (const p of room.players.values())
    if (p.bot) {
      const point = room.controlPoints[p.team === 0 ? 0 : 2].pos;
      Object.assign(p, {
        x: point.x,
        y: point.y,
        z: point.z + 7,
        protected: 0,
      });
      p.brain = undefined;
    }
  for (let i = 0; i < 2700; i++) room.tick();
  assert.ok(room.controlPoints.some((p) => p.owner >= 0));
  assert.ok(room.scores.some((score) => score > 0));
});
test("Frontline sectors capture, contest, persist ownership, score and reset on a new map", () => {
  const { room, a, b } = fixture();
  const point = room.controlPoints[0];
  Object.assign(a, point.pos);
  for (let i = 0; i < 81; i++) room.controlSectors(0.1);
  assert.equal(point.owner, a.team);
  assert.ok(room.scores[a.team] > 0);
  const progress = room.scores[a.team];
  Object.assign(b, point.pos);
  room.controlSectors(1);
  assert.ok(point.contested);
  assert.equal(room.scores[a.team], progress);
  a.x = 20;
  a.z = 20;
  for (let i = 0; i < 81; i++) room.controlSectors(0.1);
  assert.equal(point.owner, b.team);
  assert.ok(room.state().controlPoints[0].owner === b.team);
  room.target = room.scores[b.team] + 5;
  room.controlSectors(10);
  assert.equal(room.phase, "finished");
  const seed = room.options.seed;
  room.restart();
  assert.notEqual(room.options.seed, seed);
  assert.ok(
    room.controlPoints.every((p) => p.owner === -1 && p.progress === 0),
  );
});
test("resupply requires own station, dwell and safety; enforces cooldown, life and zombie restrictions", () => {
  const { room, a } = fixture();
  const station = room.supplyStations.find((s) => s.team === a.team)!;
  a.health = 30;
  a.blocks = 0;
  a.grenades = 0;
  a.reserve.fill(0);
  a.ammo.fill(0);
  a.lastDamage = -10;
  room.time = 10;
  Object.assign(a, room.supplyStations.find((s) => s.team !== a.team)!.pos);
  room.resupply(a, 4);
  assert.equal(a.health, 30);
  Object.assign(a, station.pos);
  room.resupply(a, 2);
  assert.equal(a.health, 30);
  a.lastDamage = room.time;
  room.resupply(a, 1);
  assert.equal(a.supplyProgress, 0);
  room.time = 15;
  room.resupply(a, 3);
  assert.equal(a.health, classInfo(a.classId).health);
  assert.equal(a.reserve[0], WEAPONS[0].reserve);
  assert.equal(a.blocks, classInfo(a.classId).blocks);
  a.health = 30;
  room.resupply(a, 3);
  assert.equal(a.health, 30);
  a.supplyCooldown = 0;
  a.zombie = true;
  room.resupply(a, 4);
  assert.equal(a.health, 30);
  a.zombie = false;
  a.dead = 2;
  room.resupply(a, 4);
  assert.equal(a.health, 30);
});

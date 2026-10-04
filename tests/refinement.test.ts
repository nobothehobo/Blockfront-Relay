import test from "node:test";
import assert from "node:assert/strict";
import { World, W, D, idx, WEAPONS, collides } from "../shared/game.js";
import { Room } from "../server/room.js";
import { thinkBot } from "../server/bots.js";
import { flagAssignment } from "../server/ctf-tactics.js";
import { walkHeight } from "../server/navigation.js";
import { ReloadCues } from "../client/reload-cues.js";
import { weaponPose } from "../client/weapon-pose.js";

function arena(bots = 7) {
  const w = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) w.blocks[idx(x, 0, z)] = 3;
  const r = new Room(
    "refine",
    { name: "Refine", mode: "ctf", seed: 1, jet: "off", bots },
    w,
  );
  const human = r.add("human", "Human", { send: () => {} });
  r.phase = "active";
  for (const p of r.players.values())
    Object.assign(p, {
      x: 100.5,
      y: 1.01,
      z: 100.5,
      ground: true,
      protected: 0,
    });
  return {
    r,
    human,
    allies: [...r.players.values()]
      .filter((p) => p.bot && p.team === human.team)
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

test("three-wide trench access stays supported, clear and climbable across noisy hillside seeds", () => {
  for (const seed of [7230, 7231, 7232, 1, 19, 7280]) {
    const w = new World(seed);
    const phase =
      (((Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0) / 4294967296) * 6;
    for (const x0 of [Math.floor(W * 0.29), Math.floor(W * 0.7)]) {
      for (const z0 of [64, 96, 128, 192, 224]) {
        const entry =
          Math.min(
            ...[0, 1, 2].map(
              (dz) => x0 + Math.floor(Math.sin((z0 + dz) * 0.055 + phase) * 3),
            ),
          ) - 1;
        for (let dz = 0; dz < 3; dz++) {
          let y = 9.01;
          for (let step = 0; step < 24; step++) {
            const x = entry - step + 0.5,
              z = z0 + dz + 0.5;
            const next = walkHeight(w, x, z, y);
            assert.notEqual(next, null, `walkable ${seed}:${x},${z}`);
            assert.ok(Math.abs(next! - y) <= 1.001, "no multi-cube steps");
            assert.equal(collides(w, x, next!, z), false);
            y = next!;
          }
        }
      }
      for (const [entryZ, sign] of [
        [64, -1],
        [255, 1],
      ]) {
        const entryX = x0 + Math.floor(Math.sin(entryZ * 0.055 + phase) * 3);
        for (let dx = 0; dx < 3; dx++) {
          let y = 9.01;
          for (let step = 0; step < 24; step++) {
            const next = walkHeight(
              w,
              entryX + dx + 0.5,
              entryZ + sign * step + 0.5,
              y,
            );
            assert.notEqual(next, null, `trench end ${seed}:${entryZ}:${step}`);
            assert.ok(Math.abs(next! - y) <= 1.001);
            y = next!;
          }
        }
      }
    }
  }
});

test("living defenders replace casualties and only two nearby bots escort a human flag carrier", () => {
  const { r, human, allies } = arena(15);
  assert.ok(allies.length >= 7);
  allies.forEach((p, i) => (p.x = 101 + i * 4));
  r.flags[1 - human.team].carrier = human.id;
  const assignments = () =>
    allies
      .filter((p) => p.dead <= 0)
      .map((p) => [p.id, flagAssignment(p, r.players, r.flags).role]);
  assert.equal(assignments().filter(([, role]) => role === "escort").length, 2);
  assert.ok(assignments().some(([, role]) => role === "raider"));
  allies[0].dead = 3;
  assert.equal(flagAssignment(allies[1], r.players, r.flags).role, "defender");
  assert.equal(assignments().filter(([, role]) => role === "escort").length, 2);
});

test("NPC squad reports investigate a recent sighting without shooting through cover or extending its lifetime", () => {
  const { r, allies } = arena();
  const reporter = allies[0],
    listener = allies[1];
  for (const p of r.players.values()) if (p.team !== listener.team) p.dead = 10;
  r.options.mode = "tdm";
  r.time = 1;
  reporter.brain = {
    nextThink: 5,
    lastX: reporter.x,
    lastZ: reporter.z,
    stuck: 0,
    target: "seen",
    acquired: 0.5,
    lastSeen: { x: 110, y: 1.01, z: 90 },
    seenAt: 0.5,
  };
  const command = thinkBot(listener, r);
  assert.equal(command.fire, false);
  assert.deepEqual(listener.brain!.lastSeen, reporter.brain.lastSeen);
  assert.equal(listener.brain!.seenAt, 0.5);
  r.time = 4;
  thinkBot(listener, r);
  assert.equal(listener.brain!.lastSeen, undefined);
});

test("a moved objective invalidates a stale NPC route before its deferred planning deadline", () => {
  const { r, allies } = arena();
  const bot = allies.at(-1)!;
  for (const p of r.players.values()) if (p.team !== bot.team) p.dead = 10;
  bot.brain = {
    nextThink: 0,
    lastX: bot.x,
    lastZ: bot.z,
    stuck: 0,
    target: "",
    acquired: 0,
    nextPlan: 100,
    route: [{ x: 99.5, y: 1.01, z: 100.5 }],
    routeGoal: { x: 20, y: 1.01, z: 20 },
  };
  thinkBot(bot, r);
  assert.equal(bot.brain.route!.length, 0);
  assert.equal(bot.brain.nextPlan, 0);
});

test("weapon recoil recovery and reload poses differ, with reduced motion when aiming and no balance changes", () => {
  const before = JSON.stringify(WEAPONS);
  const rifle = weaponPose(100, 0, 0, 0, false, 0),
    smg = weaponPose(100, 1, 0, 0, false, 0),
    shotgun = weaponPose(100, 2, 0, 0, false, 0);
  assert.equal(smg.z, 0);
  assert.ok(shotgun.z > rifle.z);
  assert.ok(
    weaponPose(30, 0, 0, 0, true, 0).pitch <
      weaponPose(30, 0, 0, 0, false, 0).pitch,
  );
  assert.ok(
    weaponPose(1000, 0, 0, 0, false, WEAPONS[0].reload * 0.55).roll > 0,
  );
  assert.ok(
    weaponPose(1000, 1, 0, 0, false, WEAPONS[1].reload * 0.55).roll < 0,
  );
  assert.equal(JSON.stringify(WEAPONS), before);
});

test("reload cues follow accepted progress once, skip stale stages and reset on cancellation or weapon switch", () => {
  const cues = new ReloadCues(),
    duration = WEAPONS[0].reload;
  assert.equal(cues.update(0, duration), "reload-open");
  assert.equal(cues.update(0, duration), null);
  assert.equal(cues.update(0, duration * 0.53), "reload-seat");
  assert.equal(cues.update(0, duration * 0.6), null);
  assert.equal(cues.update(0, duration * 0.12), "reload-close");
  assert.equal(cues.update(0, 0), null);
  assert.equal(
    cues.update(0, duration * 0.4),
    null,
    "joining mid-reload skips earlier cues",
  );
  assert.equal(cues.update(2, WEAPONS[2].reload), "reload-open");
  assert.equal(cues.update(2, WEAPONS[2].reload * 0.77), "reload-shell");
  assert.equal(cues.update(2, 0), null);
});

test("isolated NPCs regroup toward living support when multiple opponents are visible", () => {
  const { r, human, allies } = arena();
  const bot = allies.at(-1)!;
  r.options.mode = "tdm";
  human.team = 1 - bot.team;
  Object.assign(human, { x: 100.5, z: 80.5 });
  for (const p of r.players.values()) {
    if (p === bot || p === human) continue;
    Object.assign(p, {
      x: p.team === bot.team ? 120.5 : 105.5,
      z: p.team === bot.team ? 100.5 : 80.5,
    });
  }
  const command = thinkBot(bot, r);
  const dx =
    -Math.sin(command.yaw) * command.forward +
    Math.cos(command.yaw) * command.strafe;
  assert.ok(
    dx > 0.5,
    "moves east toward support, rather than north into the enemies",
  );
});

test("SMG NPCs pause between bursts while retaining server weapon and health statistics", () => {
  const { r, human, allies } = arena();
  const bot = allies.at(-1)!;
  r.options.mode = "tdm";
  human.team = 1 - bot.team;
  Object.assign(human, { x: 100.5, z: 80.5 });
  for (const p of r.players.values()) if (p !== bot && p !== human) p.dead = 10;
  bot.classId = 1;
  bot.yaw = 0;
  thinkBot(bot, r);
  r.time = 0.6;
  assert.equal(thinkBot(bot, r).fire, true);
  r.time = 1.02;
  assert.equal(thinkBot(bot, r).fire, false);
  r.time = 1.4;
  assert.equal(thinkBot(bot, r).fire, true);
  assert.equal(bot.health, 100);
  assert.equal(WEAPONS[1].damage, 14);
});

test("NPCs blocked by an unwalkable wall progress from a safe stop to authoritative digging", () => {
  const { r, allies } = arena();
  const bot = allies.at(-1)!;
  r.options.mode = "tdm";
  for (const p of r.players.values()) if (p !== bot) p.dead = 100;
  for (let x = 85; x < 116; x++)
    for (let y = 1; y < 7; y++) r.world.set(x, y, 99, 3);
  bot.brain = {
    nextThink: 0,
    lastX: bot.x,
    lastZ: bot.z,
    stuck: 0,
    target: "remembered",
    acquired: 0,
    lastSeen: { x: 100.5, y: 1.01, z: 90.5 },
    seenAt: 0,
  };
  let dug = false;
  bot.yaw = 0;
  for (let i = 0; i < 100; i++) {
    r.tick();
    dug ||= bot.input.dig && bot.input.weapon === 4;
  }
  assert.equal(
    dug,
    true,
    "stopping before the wall must not erase the recovery timer",
  );
  assert.ok(
    [1, 2, 3].some((y) => r.world.get(100, y, 99) === 0),
    "Room actually accepts digging and removes an obstructing block",
  );
});

test("nearby infected take opposite approach lanes and remain melee-only", () => {
  const { r, human, allies } = arena();
  const [a, b] = allies;
  r.options.mode = "infection";
  human.team = 1 - a.team;
  human.z = 90.5;
  for (const p of r.players.values())
    if (p !== a && p !== b && p !== human) p.dead = 100;
  a.zombie = b.zombie = true;
  const first = thinkBot(a, r),
    second = thinkBot(b, r);
  const x = (input: typeof first) =>
    -Math.sin(input.yaw) * input.forward + Math.cos(input.yaw) * input.strafe;
  assert.ok(
    x(first) * x(second) < 0,
    "same-team NPC IDs must not all choose the same side",
  );
  assert.equal(first.weapon, 4);
  assert.equal(second.weapon, 4);
  assert.equal(first.fire, false);
  assert.equal(second.fire, false);
});

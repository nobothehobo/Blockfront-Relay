import test from "node:test";
import assert from "node:assert/strict";
import { Timings } from "../shared/timings.js";
import { CombatFeedback } from "../client/combat-feedback.js";
import { spatialVoice } from "../client/audio-mix.js";
import { World, W, D, idx, eye, collides } from "../shared/game.js";
import { LAYOUT_VERSION } from "../shared/layout.js";
import { Room } from "../server/room.js";
import { hearShot } from "../server/bot-awareness.js";
import { thinkBot } from "../server/bots.js";
import { flagAssignment } from "../server/ctf-tactics.js";
import { botProfile } from "../server/bot-profile.js";
import { canTraverse } from "../server/navigation.js";

function fixture() {
  const world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  const room = new Room(
    "feel",
    { name: "Feel", mode: "tdm", jet: "off", seed: 1, arsenal: "specialists" },
    world,
  );
  const human = room.add("human", "Human", { send: () => {} });
  const bot = room.add("npc-1", "NPC", { send: () => {} }, true, 0);
  Object.assign(human, { x: 80.5, y: 1.01, z: 80.5, protected: 0 });
  Object.assign(bot, {
    x: 80.5,
    y: 1.01,
    z: 100.5,
    protected: 0,
    ground: true,
  });
  room.time = 10;
  room.phase = "active";
  return { world, room, human, bot };
}
test("bounded performance windows reject invalid samples and distinguish mean from p95", () => {
  const t = new Timings(4);
  for (const n of [1, 2, 3, 4, 20, NaN, -1]) t.add(n);
  assert.deepEqual(t.summary(), { samples: 4, mean: 7.25, p95: 20 });
  t.reset();
  assert.equal(t.summary().samples, 0);
});
test("confirmed damage combines only nearby hits on the same target and expires", () => {
  const f = new CombatFeedback();
  assert.equal(f.label(0), "");
  f.confirm("a", 20, 10);
  f.confirm("a", 18, 50);
  assert.equal(f.label(50), "38 · HIT");
  f.highlight("head", 60);
  assert.equal(f.label(60), "38 · HEADSHOT");
  f.highlight("kill", 70);
  assert.equal(f.label(70), "ELIMINATED");
  f.highlight("head", 71);
  assert.equal(
    f.label(71),
    "ELIMINATED",
    "a late headshot event cannot overwrite the elimination",
  );
  f.confirm("b", 12, 90);
  assert.equal(f.label(90), "12 · HIT");
  assert.equal(f.label(600), "");
});
test("spatial voices have correct left/right heading, distance attenuation and cover muffling", () => {
  const listener = { x: 0, y: 1, z: 0 };
  assert.equal(spatialVoice(listener, { x: 10, y: 1, z: 0 }, 0).pan, 1);
  assert.equal(spatialVoice(listener, { x: -10, y: 1, z: 0 }, 0).pan, -1);
  assert.ok(spatialVoice(listener, { x: 10, y: 1, z: 0 }, Math.PI).pan < 0);
  assert.equal(spatialVoice(listener, { x: 60, y: 1, z: 0 }, 0).gain, 0);
  assert.ok(
    spatialVoice(listener, { x: 10, y: 1, z: 0 }, 0, 60, true).gain <
      spatialVoice(listener, { x: 10, y: 1, z: 0 }, 0).gain,
  );
});
test("hidden gunfire provides an expiring imprecise clue, never a firing target", () => {
  const { world, room, human, bot } = fixture();
  for (let x = 60; x < 100; x++)
    for (let y = 1; y < 6; y++) world.set(x, y, 90, 3);
  hearShot(room.players.values(), world, eye(human), human.team, room.time);
  assert.ok(bot.brain?.heard);
  const command = thinkBot(bot, room);
  assert.equal(command.fire, false);
  assert.equal(bot.brain?.aimPoint, undefined);
  assert.equal(bot.brain?.lastSeen, undefined);
  Object.assign(human, { x: 250, z: 250 });
  room.time += 5;
  thinkBot(bot, room);
  assert.ok(room.time - (bot.brain?.heardAt ?? 0) > 4);
  bot.brain!.heard = undefined;
  hearShot([bot], world, { x: 300, y: 2, z: 300 }, human.team, room.time);
  assert.equal(bot.brain!.heard, undefined);
});
test("outnumbered non-assault bots disengage aim rather than push alone", () => {
  const { room, human, bot } = fixture();
  let chosen = bot.id;
  for (let i = 0; i < 20; i++)
    if (botProfile(`npc-${i}`, 1).style !== "assault") {
      chosen = `npc-${i}`;
      break;
    }
  room.players.delete(bot.id);
  bot.id = chosen;
  room.players.set(chosen, bot);
  const second = room.add("second", "Second", { send: () => {} });
  Object.assign(second, {
    team: human.team,
    x: 85.5,
    y: 1.01,
    z: 80.5,
    protected: 0,
  });
  bot.brain = {
    nextThink: 0,
    lastX: bot.x,
    lastZ: bot.z,
    stuck: 0,
    target: human.id,
    acquired: 0,
    seenAt: room.time,
  };
  assert.equal(thinkBot(bot, room).aim, false);
});
test("full-health support NPC rallies an injured teammate and healing credit is capped and resets", () => {
  const { room, bot, human } = fixture();
  Object.assign(human, { team: bot.team, x: bot.x + 2, z: bot.z, health: 60 });
  assert.equal(thinkBot(bot, room).ability, true);
  room.useAbility(bot);
  assert.equal(human.health, 75);
  assert.equal(bot.healingGiven, 15);
  human.health = 99;
  bot.abilityCooldown = 0;
  room.useAbility(bot);
  assert.equal(human.health, 100);
  assert.equal(bot.healingGiven, 16);
  bot.abilityCooldown = 0;
  room.useAbility(bot);
  assert.equal(bot.healingGiven, 16);
  bot.health = 60;
  bot.abilityCooldown = 0;
  room.useAbility(bot);
  assert.equal(bot.health, 80);
  assert.equal(bot.healingGiven, 16, "self-healing earns no credit");
  room.restart();
  assert.equal(bot.healingGiven, 0);
});
test("authoritative simulation and NPC timing measurements are present in snapshots", () => {
  const { room } = fixture();
  room.tick();
  const metrics = room.state().diagnostics;
  assert.ok(Number.isFinite(metrics.tickMs));
  assert.ok(Number.isFinite(metrics.npcMs));
  assert.ok(metrics.tickMs >= metrics.npcMs);
  assert.equal(room.tickTimings.summary().samples, 1);
});
test("second flag interceptor blocks the return route instead of duplicating pursuit", () => {
  const { room, bot, human, world } = fixture();
  room.options.mode = "ctf";
  const other = room.add("npc-2", "Other", { send: () => {} }, true);
  Object.assign(other, { team: bot.team, x: bot.x + 4, z: bot.z, dead: 0 });
  room.flags[bot.team].carrier = human.id;
  const goals = [bot, other].map((p) =>
    flagAssignment(p, room.players, room.flags, world),
  );
  assert.equal(goals[0].role, "interceptor");
  assert.equal(goals[1].role, "interceptor");
  assert.notDeepEqual(goals[0].goal, goals[1].goal);
});
test("Foundry v2 has connected open depots and physically walkable covered bypass stairs; v1 remains unchanged", () => {
  assert.equal(LAYOUT_VERSION, 2);
  const world = new World(7231),
    old = new World(7231, true, 1);
  assert.equal(old.get(104, 9, 153), 3);
  assert.equal(world.get(104, 9, 153), 0);
  for (const [cx, cz] of [
    [104, 153],
    [216, 168],
  ]) {
    let previous = { x: cx - 7 + 0.5, y: 13.01, z: cz + 0.5 };
    for (let x = cx - 6; x <= cx + (cx === 104 ? 7 : 10); x++) {
      const p = {
        x: x + 0.5,
        y:
          9 +
          Math.max(0, cx === 104 ? Math.abs(x - cx) - 3 : cx - 3 - x) +
          0.01,
        z: cz + 0.5,
      };
      assert.equal(collides(world, p.x, p.y, p.z), false);
      assert.ok(canTraverse(world, previous, p), `stair ${x}`);
      previous = p;
    }
  }
  for (const [cx, cz] of [
    [132, 104],
    [188, 216],
  ]) {
    assert.equal(collides(world, cx + 0.5, 13.01, cz + 0.5), false);
    assert.equal(world.get(cx, 19, cz), 6);
    assert.equal(collides(world, cx - 3 + 0.5, 13.01, cz + 5 + 0.5), false);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { thinkBot } from "../server/bots.js";
import { botProfile } from "../server/bot-profile.js";
import { World, W, D, idx, eye, direction, rayBox } from "../shared/game.js";
function setup() {
  const world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  const room = new Room(
    "variety",
    { name: "Variety", mode: "tdm", jet: "off", seed: 1 },
    world,
  );
  const human = room.add("h", "Human", { send: () => {} });
  const bot = room.add("npc-1", "Bot", { send: () => {} }, true);
  Object.assign(human, {
    x: 80.5,
    y: 1.01,
    z: 70.5,
    ground: true,
    protected: 0,
  });
  Object.assign(bot, {
    x: 80.5,
    y: 1.01,
    z: 100.5,
    ground: true,
    yaw: 0,
    protected: 0,
  });
  room.phase = "active";
  return { room, human, bot, world };
}
test("bot skills, tactics, routes and reactions vary independently and stay deterministic", () => {
  const profiles = Array.from({ length: 100 }, (_, i) =>
    botProfile(`npc-${i + 1}`, 7233),
  );
  assert.deepEqual(botProfile("npc-1", 7233), botProfile("npc-1", 7233));
  assert.equal(new Set(profiles.map((v) => v.tier)).size, 3);
  assert.equal(new Set(profiles.map((v) => v.style)).size, 4);
  assert.equal(new Set(profiles.map((v) => v.lane)).size, 3);
  assert.ok(profiles.filter((v) => v.tier === "veteran").length < 40);
  assert.ok(profiles.every((v) => v.error >= 0.018 && v.reaction >= 0.28));
});
test("moving-target tracking produces genuine misses and different accuracy across bots", () => {
  const { room, human, bot } = setup();
  const rates: number[] = [];
  for (let n = 1; n <= 12; n++) {
    bot.id = `npc-${n}`;
    bot.brain = undefined;
    bot.yaw = 0;
    let shots = 0,
      hits = 0;
    for (let step = 0; step < 200; step++) {
      room.time = 10 + step * 0.2;
      human.x = 80.5 + Math.sin(step * 0.17) * 5;
      human.z = 40.5;
      const command = thinkBot(bot, room);
      bot.yaw = command.yaw;
      bot.input = command;
      if (!command.fire) continue;
      shots++;
      if (
        Number.isFinite(
          rayBox(
            eye(bot),
            direction(command.yaw, command.pitch),
            { x: human.x - 0.33, y: human.y, z: human.z - 0.33 },
            { x: human.x + 0.33, y: human.y + 1.75, z: human.z + 0.33 },
          ),
        )
      )
        hits++;
    }
    assert.ok(shots > 30, "still engages rather than disabling combat");
    rates.push(hits / shots);
  }
  assert.ok(
    rates.every((v) => v < 0.85),
    `no perfect tracking: ${rates}`,
  );
  assert.ok(
    Math.max(...rates) - Math.min(...rates) > 0.05,
    `varied accuracy: ${rates}`,
  );
});
test("occlusion does not update aim memory; reacquiring a target requires a fresh reaction", () => {
  const { room, human, bot, world } = setup();
  room.time = 1;
  thinkBot(bot, room);
  room.time = 2;
  thinkBot(bot, room);
  const seen = { ...bot.brain!.aimPoint! };
  for (let x = 70; x < 95; x++)
    for (let y = 1; y < 6; y++) world.set(x, y, 90, 3);
  room.time = 2.2;
  human.x += 3;
  assert.equal(thinkBot(bot, room).fire, false);
  assert.deepEqual(bot.brain!.aimPoint, seen);
  for (let x = 70; x < 95; x++)
    for (let y = 1; y < 6; y++) world.set(x, y, 90, 0);
  room.time = 2.4;
  assert.equal(thinkBot(bot, room).fire, false);
  assert.equal(bot.brain!.acquired, 2.4);
});
test("pressured bot builds replicated cover through normal authority and respects resource/cooldown limits", () => {
  const { room, human, bot } = setup();
  const edits: any[] = [];
  room.peers.set("observer", { send: (s) => edits.push(JSON.parse(s)) });
  room.time = 10;
  bot.health = 50;
  bot.brain = {
    nextThink: 0,
    lastX: bot.x,
    lastZ: bot.z,
    stuck: 0,
    target: human.id,
    acquired: 0,
    seenAt: 10,
  };
  const command = thinkBot(bot, room);
  assert.equal(command.place, true);
  assert.equal(command.weapon, 5);
  const blocks = bot.blocks;
  bot.input = command;
  bot.yaw = command.yaw;
  bot.pitch = command.pitch;
  room.edit(bot, true);
  assert.equal(bot.blocks, blocks - 6);
  assert.ok(edits.some((v) => v.type === "edits" && v.edits.length === 6));
  room.time += 0.2;
  assert.equal(thinkBot(bot, room).place, false);
  bot.zombie = true;
  bot.brain = undefined;
  room.time += 1;
  assert.equal(thinkBot(bot, room).place, false);
});
test("objective squad distributes its strategic approach lanes on generated terrain", () => {
  const room = new Room("lanes", {
    name: "Lanes",
    mode: "ctf",
    jet: "off",
    seed: 7233,
    bots: 15,
    limit: 16,
  });
  room.add("h", "Human", { send: () => {} });
  room.phase = "active";
  room.time = 10;
  for (const p of room.players.values()) if (p.bot) thinkBot(p, room);
  const lanes = [...room.players.values()]
    .filter((v) => v.bot && v.team === 1)
    .map((v) => v.brain?.approach?.lane)
    .filter((v) => v !== undefined);
  assert.ok(new Set(lanes).size >= 2, `approaches ${lanes}`);
});

import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { thinkBot } from "../server/bots.js";
import { breachInput } from "../server/breach.js";
import {
  World,
  W,
  D,
  idx,
  emptyInput,
  basePosition,
  collides,
} from "../shared/game.js";
import { allowedWeapon, CLASS_WEAPONS } from "../shared/classes.js";
function setup() {
  const world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  const room = new Room(
    "recovery",
    {
      name: "Recovery",
      mode: "ctf",
      jet: "classes",
      seed: 1,
      arsenal: "specialists",
    },
    world,
  );
  const human = room.add("human", "Human", { send: () => {} });
  const bot = room.add("npc-1", "Bot", { send: () => {} }, true, 4);
  Object.assign(bot, {
    x: 80.5,
    y: 1.01,
    z: 100.5,
    yaw: 0,
    ground: true,
    protected: 0,
  });
  Object.assign(human, { x: 180, y: 1.01, z: 200, ground: true });
  room.phase = "active";
  room.time = 10;
  return { room, bot, human, world };
}
test("each specialist owns only its firearms/tools and receives only its class jet perk", () => {
  const { room, bot } = setup();
  for (let c = 0; c < 5; c++) {
    bot.nextClass = c;
    room.spawn(bot);
    assert.equal(bot.jetpack, c === 1);
    for (let w = 0; w < 7; w++) {
      assert.equal(
        allowedWeapon(c, w, true),
        (CLASS_WEAPONS[c] as readonly number[]).includes(w),
      );
      if (!allowedWeapon(c, w, true)) {
        assert.equal(bot.ammo[w], 0);
        assert.equal(bot.reserve[w], 0);
      }
    }
    bot.bot = false;
    bot.input = { ...emptyInput(), weapon: c === 1 ? 3 : 1 };
    room.tick();
    assert.ok(allowedWeapon(c, bot.weapon, true));
  }
});
test("oscillating combat strafe triggers a bounded walkable escape instead of an endless dance", () => {
  const { room, bot, human } = setup();
  room.options.mode = "tdm";
  Object.assign(human, { x: 80.5, z: 80.5 });
  bot.input = { ...emptyInput(), strafe: 0.5 };
  bot.brain = {
    nextThink: 0,
    lastX: bot.x,
    lastZ: bot.z,
    stuck: 0,
    target: human.id,
    acquired: 0,
    seenAt: 10,
    stalledAt: { x: bot.x, y: bot.y, z: bot.z },
    stalledSince: 7,
  };
  const command = thinkBot(bot, room);
  assert.ok(bot.brain.escapeGoal);
  assert.ok(bot.brain.escapeUntil! > room.time);
  assert.ok(Math.hypot(command.forward, command.strafe) > 0.2);
});
test("objective Delver excavates both levels of a supported wall through replicated authority", () => {
  const { room, bot, world } = setup();
  room.flags[0].pos = { x: 80.5, y: 1.01, z: 80.5 };
  for (let y = 1; y < 5; y++) world.set(80, y, 99, 3);
  const edits: any[] = [];
  room.peers.set("observer", { send: (s) => edits.push(JSON.parse(s)) });
  let command = thinkBot(bot, room);
  assert.equal(command.dig, true);
  bot.yaw = command.yaw;
  bot.pitch = command.pitch;
  bot.input = command;
  room.edit(bot, false);
  assert.ok(
    !world.get(80, 1, 99) || !world.get(80, 2, 99),
    "first eye-height ray removes one of the passage cells",
  );
  room.time += 0.3;
  bot.editCooldown = 0;
  command = thinkBot(bot, room);
  bot.yaw = command.yaw;
  bot.pitch = command.pitch;
  bot.input = command;
  room.edit(bot, false);
  assert.equal(world.get(80, 1, 99), 0);
  assert.equal(world.get(80, 2, 99), 0);
  assert.equal(
    collides(world, 80.5, 1.01, 99.5),
    false,
    "passage admits a standing player",
  );
  assert.equal(world.get(80, 0, 99), 3, "floor retained");
  assert.ok(edits.filter((v) => v.type === "edit").length >= 2);
  const base = basePosition(0);
  Object.assign(bot, { x: base.x, y: 13.01, z: base.z + 1 });
  assert.equal(
    breachInput(world, bot, base),
    null,
    "protected foundation not targeted",
  );
});

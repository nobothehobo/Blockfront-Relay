import test from "node:test";
import assert from "node:assert/strict";
import { World, W, D, idx, collides, emptyInput } from "../shared/game.js";
import { Room } from "../server/room.js";
import { thinkBot } from "../server/bots.js";
import { planRoute, walkHeight } from "../server/navigation.js";
import { playerPose } from "../client/animation.js";
function setup() {
  const world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  const room = new Room(
    "ai",
    { name: "AI", mode: "tdm", jet: "off", seed: 1, bots: 1 },
    world,
  );
  const human = room.add("h", "Human", { send: () => {} });
  const bot = [...room.players.values()].find((p) => p.bot)!;
  Object.assign(bot, {
    x: 80.5,
    y: 1.01,
    z: 100.5,
    ground: true,
    protected: 0,
    yaw: 0,
  });
  Object.assign(human, {
    x: 80.5,
    y: 1.01,
    z: 80.5,
    ground: true,
    protected: 0,
  });
  room.phase = "active";
  return { room, world, human, bot };
}
test("local routing walks around a tall constructed wall without collision or unsafe drops", () => {
  const { world, bot, human } = setup();
  for (let x = 77; x <= 83; x++)
    for (let y = 1; y < 8; y++) world.set(x, y, 94, 3);
  const route = planRoute(world, bot, human, 512);
  assert.ok(
    route.some((p) => p.x < 77 || p.x > 84),
    "route flanks wall",
  );
  assert.ok(route.at(-1)!.z < 94, "route reaches other side");
  for (const p of route) assert.equal(collides(world, p.x, p.y, p.z), false);
  // Missing ground within three blocks is an unsafe drop, even with bedrock far below.
  assert.equal(walkHeight(world, 72.5, 72.5, 8), null);
});
test("NPC notices a visible opponent even if the nearest enemy is behind cover", () => {
  const { room, world, human, bot } = setup();
  Object.assign(human, { x: 80.5, z: 94.5 });
  for (let y = 1; y < 7; y++) world.set(80, y, 97, 3);
  const visible = room.add("visible", "Visible", { send: () => {} });
  visible.team = human.team;
  Object.assign(visible, { x: 89.5, y: 1.01, z: 98.5, dead: 0 });
  bot.brain = undefined;
  thinkBot(bot, room);
  assert.equal(bot.brain!.target, visible.id);
});
test("NPC remembers last sighting, not an enemy's unseen movement, then forgets", () => {
  const { room, world, human, bot } = setup();
  thinkBot(bot, room);
  const seen = { ...bot.brain!.lastSeen! };
  for (let x = 70; x < 100; x++)
    for (let y = 1; y < 8; y++) world.set(x, y, 90, 3);
  human.x = 91;
  room.time = 0.5;
  const hidden = thinkBot(bot, room);
  assert.equal(hidden.fire, false);
  assert.deepEqual(bot.brain!.lastSeen, seen);
  room.time = 3.5;
  thinkBot(bot, room);
  assert.equal(bot.brain!.lastSeen, undefined);
});
test("survivors retreat while reloading; carriers navigate home; zombies remain melee", () => {
  const { room, human, bot } = setup();
  bot.reload = 1;
  room.time = 1;
  thinkBot(bot, room);
  room.time = 1.5;
  const retreat = thinkBot(bot, room);
  const movementZ =
    -Math.cos(retreat.yaw) * retreat.forward -
    Math.sin(retreat.yaw) * retreat.strafe;
  assert.ok(movementZ > 0, "retreats away from opponent to the north");
  room.options.mode = "relay";
  room.flags[1 - bot.team].carrier = bot.id;
  bot.reload = 0;
  bot.brain = undefined;
  human.dead = 3;
  room.time = 2;
  const carrier = thinkBot(bot, room);
  const home = room.flags[bot.team].home;
  const dx =
    -Math.sin(carrier.yaw) * carrier.forward +
    Math.cos(carrier.yaw) * carrier.strafe;
  const dz =
    -Math.cos(carrier.yaw) * carrier.forward -
    Math.sin(carrier.yaw) * carrier.strafe;
  assert.ok(dx * (home.x - bot.x) + dz * (home.z - bot.z) > 0);
  bot.zombie = true;
  bot.brain = undefined;
  room.time = 3;
  assert.equal(thinkBot(bot, room).weapon, 4);
});
test("articulated animation alternates feet and supports grounded, aiming, reload, recoil and jump poses", () => {
  const a = playerPose(Math.PI / 2, 6, true, false, false, false, 1);
  const b = playerPose(Math.PI * 1.5, 6, true, false, false, false, 1);
  assert.ok(a.leftLeg > 0 && a.rightLeg < 0 && b.leftLeg < 0);
  const idle = playerPose(1, 0, true, false, false, false, 1);
  assert.equal(idle.leftLeg, 0);
  assert.equal(idle.bob, 0);
  const air = playerPose(1, 6, false, false, false, false, 1);
  assert.equal(air.bob, 0);
  assert.notEqual(air.leftLeg, air.rightLeg);
  assert.notEqual(
    playerPose(1, 2, true, false, true, false, 1).leftArm,
    a.leftArm,
  );
  assert.equal(playerPose(1, 2, true, false, true, true, 1).leftArm, 1.05);
  assert.ok(playerPose(1, 0, true, false, true, false, 0).recoil > 0);
  assert.ok(playerPose(1, 0, true, true, false, false, 1).rightArm > 0.5);
});

test("navigation recognizes one-block ascents from physics-settled feet", () => {
  const { world } = setup();
  for (let x = 40; x < 48; x++)
    for (let z = 40; z < 48; z++) {
      for (let y = 1; y < 13; y++) world.set(x, y, z, 3);
      if (x >= 43) world.set(x, 13, z, 3);
    }
  assert.equal(walkHeight(world, 43.5, 43.5, 12.987777777), 14.01);
  const route = planRoute(
    world,
    { x: 42.5, y: 12.987777777, z: 43.5 },
    { x: 45.5, y: 14.01, z: 43.5 },
  );
  assert.ok(route.some((p) => p.y === 14.01));
  assert.ok(route.at(-1)!.x >= 45);
});
test("stuck NPC jump is grounded and throttled across repeated think cycles", () => {
  const { room, world, human, bot } = setup();
  for (let x = 77; x < 84; x++)
    for (let y = 1; y < 5; y++) world.set(x, y, 99, 3);
  bot.brain = {
    nextThink: 0,
    lastX: bot.x,
    lastZ: bot.z,
    stuck: 1,
    target: human.id,
    acquired: 0,
    lastSeen: { x: human.x, y: human.y, z: human.z },
    seenAt: 1,
  };
  bot.input = { ...emptyInput(), forward: 1 };
  room.time = 1;
  assert.equal(thinkBot(bot, room).jump, true);
  room.time = 1.25;
  assert.equal(
    thinkBot(bot, room).jump,
    false,
    "held jump cannot immediately retrigger on landing",
  );
  room.time = 2.5;
  bot.ground = false;
  assert.equal(thinkBot(bot, room).jump, false, "no mid-air wall pogo");
});

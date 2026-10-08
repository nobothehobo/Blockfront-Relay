import test from "node:test";
import assert from "node:assert/strict";
import { World, Vec, collides, idx } from "../shared/game.js";
import { canTraverse, planRoute } from "../server/navigation.js";
import { flagAssignment } from "../server/ctf-tactics.js";
import { Room } from "../server/room.js";

function arena() {
  const world = new World(1, false);
  for (let x = 25; x < 60; x++)
    for (let z = 25; z < 60; z++) world.blocks[idx(x, 0, z)] = 3;
  return world;
}
test("corridor sweeps reject diagonal wall clipping and gaps between clear endpoints", () => {
  const world = arena();
  const from = { x: 40.5, y: 1.01, z: 40.5 };
  const to = { x: 41.5, y: 1.01, z: 41.5 };
  for (let y = 1; y < 4; y++) world.set(41, y, 40, 3);
  assert.equal(collides(world, to.x, to.y, to.z), false);
  assert.equal(canTraverse(world, from, to), false);
  for (let y = 1; y < 4; y++) world.set(41, y, 40, 0);
  assert.equal(
    canTraverse(world, { ...from, y: 8.01 }, { x: 42.5, y: 8.01, z: 40.5 }),
    false,
  );
});
test("low tunnel ceilings reject a step even when its destination has standing room", () => {
  const world = arena();
  world.set(40, 3, 40, 3);
  world.set(41, 1, 40, 3);
  const to = { x: 41.5, y: 2.01, z: 40.5 };
  assert.equal(collides(world, to.x, to.y, to.z), false);
  assert.equal(canTraverse(world, { x: 40.5, y: 1.01, z: 40.5 }, to), false);
  world.set(40, 3, 40, 0);
  assert.equal(canTraverse(world, { x: 40.5, y: 1.01, z: 40.5 }, to), true);
});
test("bounded planner uses a two-high tunnel and reacts when its passage is blocked", () => {
  const world = arena();
  for (let x = 39; x <= 49; x++)
    for (let z = 39; z <= 41; z++)
      for (let y = 1; y <= 5; y++) world.set(x, y, z, 3);
  for (let x = 40; x <= 48; x++)
    for (let y = 1; y <= 2; y++) world.set(x, y, 40, 0);
  const start = { x: 40.5, y: 1.01, z: 40.5 };
  const goal = { x: 48.5, y: 1.01, z: 40.5 };
  const route = planRoute(world, start, goal);
  assert.equal(route.at(-1)?.x, goal.x);
  let previous: Vec = start;
  for (const point of route) {
    assert.equal(point.y, 1.01);
    assert.ok(canTraverse(world, previous, point));
    previous = point;
  }
  world.set(44, 1, 40, 3);
  assert.ok(planRoute(world, start, goal).every((p) => p.x < 44));
});
test("CTF bot physically crosses a stepped trench and tunnel to steal and return a flag", () => {
  const world = arena();
  // Both bases are four blocks up. A staircase descends to an underground route.
  for (let x = 36; x <= 54; x++)
    for (let z = 37; z <= 43; z++)
      for (let y = 1; y <= 5; y++) world.set(x, y, z, 3);
  for (let x = 38; x <= 52; x++) {
    const floor = x < 41 ? 41 - x : x > 49 ? x - 49 : 0;
    for (let y = floor + 1; y <= (floor === 0 && x > 41 && x < 49 ? 2 : 7); y++)
      world.set(x, y, 40, 0);
  }
  const room = new Room(
    "trench",
    { name: "Trench", mode: "ctf", jet: "off", seed: 1, bots: 1 },
    world,
  );
  const human = room.add("human", "Observer", { send: () => {} });
  const bot = [...room.players.values()].find((p) => p.bot)!;
  Object.assign(human, { x: 200, y: 1, z: 200, protected: 1000 });
  Object.assign(bot, {
    team: 0,
    x: 38.5,
    y: 4.01,
    z: 40.5,
    ground: true,
    protected: 0,
  });
  room.flags = [0, 1].map((team) => ({
    team,
    home: { x: team ? 52.5 : 38.5, y: 4.01, z: 40.5 },
    pos: { x: team ? 52.5 : 38.5, y: 4.01, z: 40.5 },
    carrier: null,
    dropped: 0,
  }));
  room.phase = "active";
  for (let i = 0; i < 1800 && room.scores[0] === 0; i++) room.tick();
  assert.ok(
    room.scores[0] > 0,
    `bot failed traversal at ${bot.x},${bot.y},${bot.z}: ${JSON.stringify({ brain: bot.brain, input: bot.input, floor: [49, 50, 51, 52].map((x) => [x, world.get(x, 1, 40), world.get(x, 2, 40), world.get(x, 3, 40)]) })}`,
  );
  assert.equal(world.get(50, 1, 40), 3, "bot preserves the usable exit stair");
});
test("flag escorts keep stable formation despite aim changes and follow narrow passages", () => {
  const world = arena();
  const room = new Room(
    "escort",
    { name: "Escort", mode: "ctf", jet: "off", seed: 1, bots: 7 },
    world,
  );
  const carrier = room.add("human", "Carrier", { send: () => {} });
  Object.assign(carrier, { x: 40.5, y: 1.01, z: 40.5 });
  room.flags[1 - carrier.team].carrier = carrier.id;
  const escort = [...room.players.values()].find(
    (p) =>
      p.bot &&
      flagAssignment(p, room.players, room.flags, world).role === "escort",
  )!;
  const goal = flagAssignment(escort, room.players, room.flags, world).goal;
  carrier.yaw += Math.PI;
  assert.deepEqual(
    flagAssignment(escort, room.players, room.flags, world).goal,
    goal,
  );
  for (let y = 1; y < 7; y++)
    world.set(Math.floor(goal.x), y, Math.floor(goal.z), 3);
  assert.deepEqual(
    flagAssignment(escort, room.players, room.flags, world).goal,
    { x: carrier.x, y: carrier.y, z: carrier.z },
  );
});

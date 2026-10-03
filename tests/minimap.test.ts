import test from "node:test";
import assert from "node:assert/strict";
import { World, W, D, basePosition } from "../shared/game.js";
import { surfacePixel, friendlyDots } from "../client/minimap.js";
test("minimap surface reflects destruction, placement and far map edges", () => {
  const world = new World(7231, false);
  const x = W - 1,
    z = D - 1;
  world.set(x, 4, z, 1);
  const ground = surfacePixel(world, x, z);
  world.set(x, 16, z, 3);
  const roof = surfacePixel(world, x, z);
  assert.notDeepEqual(ground, roof);
  world.set(x, 16, z, 0);
  assert.deepEqual(surfacePixel(world, x, z), ground);
  world.set(x, 20, z, 2);
  assert.notDeepEqual(surfacePixel(world, x, z), ground);
  assert.equal(surfacePixel(world, x, z)[3], 255);
});
test("minimap reveals only living teammates, including teammate NPCs", () => {
  const local = { id: "me", x: 64, z: 160, team: 0, dead: 0 };
  const friend = { ...local, id: "friend" };
  const bot = { ...local, id: "npc" };
  assert.deepEqual(
    friendlyDots(
      [
        local,
        friend,
        bot,
        { ...local, id: "enemy", team: 1 },
        { ...local, id: "dead", dead: 2 },
      ],
      local,
    ),
    [friend, bot],
  );
});
test("larger battlefield preserves clear, spaced opposing bases", () => {
  assert.equal(W, 320);
  assert.equal(D, 320);
  for (const seed of [7231, 7232, 7233]) {
    const world = new World(seed);
    for (const team of [0, 1]) {
      const base = basePosition(team);
      assert.ok(world.get(base.x, 12, base.z) > 0);
      assert.equal(world.get(base.x, 13, base.z), 0);
      assert.ok(base.x > 30 && base.x < W - 30);
    }
    assert.ok(basePosition(1).x - basePosition(0).x > 190);
  }
});

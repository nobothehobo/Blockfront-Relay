import test from "node:test";
import assert from "node:assert/strict";
import { World, W, D } from "../shared/game.js";
import { Terrain } from "../client/mesh.js";
test("winding trenches have a continuous three-wide floor and headroom in every biome", () => {
  for (const seed of [7230, 7231, 7232, 1, 19]) {
    const world = new World(seed);
    // Match the deterministic route phase, not vegetation or terrain heights.
    const phase =
      (((Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0) / 4294967296) * 6;
    for (const x0 of [Math.floor(W * 0.29), Math.floor(W * 0.7)])
      for (let z = Math.floor(D * 0.2); z < D * 0.8; z++) {
        const x = x0 + Math.floor(Math.sin(z * 0.055 + phase) * 3);
        for (let xx = x; xx < x + 3; xx++) {
          assert.ok(world.get(xx, 8, z), `floor ${seed}:${xx},${z}`);
          assert.equal(world.get(xx, 9, z), 0, `headroom ${seed}:${xx},${z}`);
          assert.equal(world.get(xx, 10, z), 0);
        }
      }
  }
});
test("map replacement removes stale terrain geometry immediately", () => {
  const terrain = new Terrain(new World(1, false));
  terrain.prioritize(8, 8);
  terrain.update(1);
  assert.equal(terrain.chunks.size, 1);
  terrain.rebuild();
  assert.equal(terrain.chunks.size, 0);
  assert.equal(terrain.group.children.length, 0);
  assert.equal(terrain.dirty.size, 400);
});

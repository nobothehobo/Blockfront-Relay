import test from "node:test";
import assert from "node:assert/strict";
import {
  World,
  W,
  D,
  idx,
  TICK,
  emptyInput,
  move,
  type Body,
} from "../shared/game.js";
import { renderBody } from "../client/render-motion.js";

function setup() {
  const world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  const body: Body = {
    x: 80,
    y: 1.01,
    z: 80,
    vx: 0,
    vy: 0,
    vz: -5.1,
    yaw: 0,
    pitch: 0,
    ground: true,
    fuel: 100,
    crouch: false,
  };
  const input = { ...emptyInput(), forward: 1 };
  return { world, body, input };
}

test("render-time motion removes alternating camera stalls beside stationary NPCs without changing simulation", () => {
  const { world, body, input } = setup();
  let accumulator = 0,
    previous = body.z;
  const distances: number[] = [];
  for (let frame = 0; frame < 120; frame++) {
    accumulator += 1 / 120;
    while (accumulator >= TICK) {
      move(body, input, world, TICK);
      accumulator -= TICK;
    }
    const saved = JSON.stringify(body),
      rendered = renderBody(body, input, world, accumulator);
    assert.equal(JSON.stringify(body), saved);
    distances.push(previous - rendered.z);
    previous = rendered.z;
  }
  assert.ok(
    Math.min(...distances) > 0.03,
    "no zero-motion frames between 30 Hz ticks",
  );
  assert.ok(Math.max(...distances) - Math.min(...distances) < 0.01);
});

test("fractional presentation remains terrain-collision-aware and does not consume fuel or trigger a jump", () => {
  const { world, body, input } = setup();
  for (let x = 79; x <= 81; x++)
    for (let y = 1; y <= 4; y++) world.set(x, y, 79, 3);
  body.z = 80.31;
  const saved = JSON.stringify(body);
  const rendered = renderBody(
    body,
    { ...input, jump: true, jet: false },
    world,
    TICK,
  );
  assert.ok(rendered.z >= 80.3);
  assert.equal(JSON.stringify(body), saved);
  assert.ok(rendered.y <= body.y);
});

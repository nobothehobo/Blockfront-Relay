import test from "node:test";
import assert from "node:assert/strict";
import { World, ray } from "../shared/game.js";
import {
  stickInput,
  touchLookGain,
  pointerLockActive,
} from "../client/control-math.js";
import { eliminationCamera } from "../client/elimination.js";
test("desktop input uses the live pointer-lock target rather than a delayed cached flag", () => {
  const canvas = {} as Element,
    other = {} as Element;
  assert.equal(pointerLockActive(null, canvas), false);
  assert.equal(pointerLockActive(other, canvas), false);
  assert.equal(pointerLockActive(canvas, canvas), true);
});
test("touch stick filters drift, keeps diagonal speed bounded and sprints only forward", () => {
  assert.deepEqual(stickInput(0.06, 0.04), {
    strafe: 0,
    forward: -0,
    sprint: false,
  });
  assert.equal(stickInput(0, -1).sprint, true);
  assert.equal(stickInput(1, 0).sprint, false);
  assert.equal(stickInput(0, 1).sprint, false);
  assert.equal(stickInput(0, -1, true).sprint, false);
  assert.equal(stickInput(0, -1, false, true).sprint, false);
  const diagonal = stickInput(1, -1);
  assert.ok(Math.hypot(diagonal.forward, diagonal.strafe) <= 1);
  assert.ok(touchLookGain(true, 3) < touchLookGain(true, 0));
  assert.ok(touchLookGain(true, 0) < touchLookGain(false, 0));
});
test("elimination camera shows body from outside and stays on the visible side of terrain", () => {
  const world = new World(1, false),
    body = { x: 50.5, y: 13, z: 50.5 };
  for (let x = 44; x < 58; x++)
    for (let z = 44; z < 58; z++)
      for (let y = 1; y <= 12; y++) world.set(x, y, z, 3);
  for (let x = 44; x < 58; x++)
    for (let y = 13; y < 22; y++) world.set(x, y, 52, 3);
  for (const yaw of [0, 1, 2, 3, -1]) {
    const view = eliminationCamera(world, body, yaw, 2);
    const delta = {
      x: view.position.x - view.focus.x,
      y: view.position.y - view.focus.y,
      z: view.position.z - view.focus.z,
    };
    const length = Math.hypot(delta.x, delta.y, delta.z);
    assert.ok(length > 1.5);
    assert.equal(
      ray(
        world,
        view.focus,
        { x: delta.x / length, y: delta.y / length, z: delta.z / length },
        length,
      ),
      null,
    );
    assert.equal(
      world.get(view.position.x, view.position.y, view.position.z),
      0,
    );
  }
});

test("contact shadows follow presented player position instead of an ahead-of-render snapshot", async () => {
  const THREE = await import("three");
  const { ContactShadows } = await import("../client/contact-shadows.js");
  const world = new World(1, false);
  const shadows = new ContactShadows();
  const group = new THREE.Group();
  group.position.set(50.5, 1.01, 52.5);
  const player = { id: "npc", x: 60.5, y: 1.01, z: 52.5, dead: 0 } as any;
  shadows.update(
    world,
    [player],
    true,
    "viewer",
    new Map([[player.id, { group }]]),
  );
  const matrix = new THREE.Matrix4();
  shadows.mesh.getMatrixAt(0, matrix);
  const position = new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.equal(position.x, group.position.x);
  assert.equal(position.z, group.position.z);
  group.visible = false;
  shadows.update(
    world,
    [player],
    true,
    "viewer",
    new Map([[player.id, { group }]]),
  );
  assert.equal(shadows.mesh.count, 0);
  shadows.mesh.geometry.dispose();
  shadows.material.dispose();
});

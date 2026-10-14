import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { World } from "../shared/game.js";
import { CombatFX } from "../client/combat-fx.js";
import {
  attachmentWorld,
  firstPersonMounts,
  visualAimEnd,
  forwardTracer,
} from "../client/shot-origin.js";

test("muzzle captures follow current camera, aim, recoil and parent transforms without a render", () => {
  const camera = new THREE.PerspectiveCamera();
  const gun = new THREE.Group();
  camera.add(gun);
  camera.position.set(20, 10, 30);
  camera.rotation.set(0.2, 1.1, 0, "YXZ");
  gun.position.set(-0.22, 0.02, 0.04);
  gun.rotation.set(0.04, 0, 0.02);
  const mounts = firstPersonMounts(0);
  const captured = attachmentWorld(gun, mounts.muzzle);
  const expected = new THREE.Vector3(
    mounts.muzzle.x,
    mounts.muzzle.y,
    mounts.muzzle.z,
  )
    .applyMatrix4(gun.matrix)
    .applyMatrix4(camera.matrix);
  assert.ok(captured.distanceTo(expected) < 1e-9);
  const old = captured.clone();
  camera.position.x += 8;
  camera.rotation.y += 1;
  const next = attachmentWorld(gun, mounts.muzzle);
  assert.ok(next.distanceTo(old) > 6);
  assert.deepEqual(
    captured,
    old,
    "past shot origin is not attached to a moving camera",
  );
});
test("remote bone-mounted gun attachments refresh parent matrices and preserve distinct ejection port", () => {
  const player = new THREE.Group(),
    arm = new THREE.Bone(),
    gun = new THREE.Mesh();
  player.add(arm);
  arm.add(gun);
  player.position.set(10, 2, 12);
  arm.position.set(0.4, 1.35, -0.08);
  arm.rotation.x = 0.4;
  gun.position.set(-0.12, -0.21, -0.22);
  const muzzle = attachmentWorld(gun, { x: 0, y: 0.025, z: -0.55 });
  const port = attachmentWorld(gun, { x: 0.055, y: 0.01, z: -0.18 });
  assert.ok(muzzle.distanceTo(port) > 0.3);
  arm.rotation.x = -0.5;
  assert.ok(
    attachmentWorld(gun, { x: 0, y: 0.025, z: -0.55 }).distanceTo(muzzle) > 0.4,
  );
});
test("local cosmetic tracers are captured world-space values and do not invent confirmed impacts", () => {
  const fx = new CombatFX(new THREE.Scene());
  const start = new THREE.Vector3(0.23, 1.3, -1.045),
    end = { x: 0, y: 1.5, z: -80 };
  fx.shot(start, [end], [], false);
  const captured = fx.tracers[0].start.clone();
  start.x += 50;
  assert.deepEqual(fx.tracers[0].start, captured);
  assert.equal(fx.particles.length, 0, "no second flash at the player's eye");
  fx.update(1000, 1);
  assert.equal(
    fx.impactsPresented,
    0,
    "prediction alone cannot create a hit spark",
  );
  fx.impact({
    pos: end,
    normal: { x: 0, y: 0, z: 1 },
    block: 3,
    kind: "terrain",
  });
  assert.equal(fx.impactsPresented, 1);
});
test("casings are born at the actual port and eject sideways even while looking steeply up", () => {
  const fx = new CombatFX(new THREE.Scene());
  const port = { x: 12, y: 3, z: 8 };
  fx.eject(port, { x: 0, y: 0.999, z: -0.01 }, 0, true);
  assert.deepEqual(
    fx.casings[0].pos,
    new THREE.Vector3(port.x, port.y, port.z),
  );
  assert.ok(fx.casings[0].vel.x >= 2);
});
test("visual aim ray stops at terrain and close-wall shots never draw backwards from a clipping barrel", () => {
  const world = new World(1, false),
    eye = { x: 80.5, y: 2.5, z: 80.5 },
    dir = { x: 0, y: 0, z: -1 };
  const empty = visualAimEnd(world, eye, dir, 50);
  assert.equal(empty.z, 30.5);
  world.set(80, 2, 79, 3);
  const end = visualAimEnd(world, eye, dir, 150);
  assert.equal(end.z, 80);
  const start = { x: 80.73, y: 2.31, z: 79.455 };
  assert.equal(forwardTracer(start, end, dir), false);
  assert.equal(forwardTracer(start, { x: 80.5, y: 2.5, z: 20 }, dir), true);
});

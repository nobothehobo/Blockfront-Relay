import * as THREE from "three";
import { Vec, World, ray } from "../shared/game.js";
export function firstPersonMounts(weapon: number) {
  return {
    muzzle: {
      x: 0.23,
      y: weapon === 6 ? -0.22 : -0.19,
      z: weapon === 3 ? -1.18 : -1.045,
    },
    ejection: { x: 0.3, y: -0.205, z: -0.5 },
  };
}
// Capture a value, not a mutable reference to a moving camera/gun transform.
export function attachmentWorld(
  object: THREE.Object3D,
  point: Vec,
): THREE.Vector3 {
  object.updateWorldMatrix(true, false);
  return new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(
    object.matrixWorld,
  );
}
export function visualAimEnd(
  world: World,
  origin: Vec,
  dir: Vec,
  range: number,
): Vec {
  const hit = ray(world, origin, dir, range);
  const length = hit ? hit.distance : range;
  return {
    x: origin.x + dir.x * length,
    y: origin.y + dir.y * length,
    z: origin.z + dir.z * length,
  };
}
// A very close wall can lie behind a clipping first-person barrel. Do not draw
// a reverse-moving tracer back toward the player's face in that case.
export function forwardTracer(start: Vec, end: Vec, dir: Vec) {
  return (
    (end.x - start.x) * dir.x +
      (end.y - start.y) * dir.y +
      (end.z - start.z) * dir.z >
    0.05
  );
}

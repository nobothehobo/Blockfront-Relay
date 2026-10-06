import { World, Vec, ray } from "../shared/game.js";
// Choose a shoulder once per death, then clip that same arm against terrain.
export function eliminationCamera(
  world: World,
  body: Vec,
  yaw: number,
  _elapsed: number,
  lockedAngle?: number,
) {
  const focus = { x: body.x, y: body.y + 0.7, z: body.z };
  let best = { ...focus },
    bestLength = -1,
    bestAngle = yaw;
  const angles =
    lockedAngle === undefined
      ? [0.65, -0.65, Math.PI, 0].map((offset) => yaw + offset)
      : [lockedAngle];
  for (const angle of angles) {
    const delta = { x: Math.sin(angle) * 4, y: 2.6, z: Math.cos(angle) * 4 };
    const length = Math.hypot(delta.x, delta.y, delta.z);
    const direction = {
      x: delta.x / length,
      y: delta.y / length,
      z: delta.z / length,
    };
    let clear = length;
    for (const [x, y, z] of [
      [0, 0, 0],
      [0.18, 0, 0],
      [-0.18, 0, 0],
      [0, 0.18, 0],
      [0, 0, 0.18],
      [0, 0, -0.18],
    ]) {
      const hit = ray(
        world,
        { x: focus.x + x, y: focus.y + y, z: focus.z + z },
        direction,
        length,
      );
      if (hit) clear = Math.min(clear, Math.max(0, hit.distance - 0.3));
    }
    if (clear > bestLength) {
      bestLength = clear;
      bestAngle = angle;
      best = {
        x: focus.x + direction.x * clear,
        y: focus.y + direction.y * clear,
        z: focus.z + direction.z * clear,
      };
    }
  }
  return { position: best, focus, angle: bestAngle };
}

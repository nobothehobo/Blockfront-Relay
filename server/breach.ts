import {
  World,
  Player,
  Vec,
  eye,
  direction,
  ray,
  basePosition,
} from "../shared/game.js";
// Local, supported two-high breach. Does not excavate floors, protected bases,
// or grant edits directly: the returned tool input must pass Room validation.
export function breachInput(world: World, p: Player, goal: Vec) {
  const dx = goal.x - p.x,
    dz = goal.z - p.z;
  if (Math.hypot(dx, dz) < 2 || !p.ground) return null;
  const alongX = Math.abs(dx) > Math.abs(dz),
    sign = (alongX ? dx : dz) > 0 ? 1 : -1;
  const x = Math.floor(p.x) + (alongX ? sign : 0),
    z = Math.floor(p.z) + (alongX ? 0 : sign),
    y = Math.floor(p.y + 0.05);
  if (y <= 0 || !world.get(x, y - 1, z)) return null;
  if (
    [0, 1].some((team) => {
      const b = basePosition(team);
      return Math.hypot(x + 0.5 - b.x, z + 0.5 - b.z) < 3 && y < 15;
    })
  )
    return null;
  const cellY = world.get(x, y, z) ? y : world.get(x, y + 1, z) ? y + 1 : null;
  if (cellY === null) return null;
  const origin = eye(p),
    yaw = Math.atan2(-(x + 0.5 - origin.x), -(z + 0.5 - origin.z));
  const pitch = Math.atan2(
    cellY + 0.5 - origin.y,
    Math.hypot(x + 0.5 - origin.x, z + 0.5 - origin.z),
  );
  const hit = ray(world, origin, direction(yaw, pitch), 6);
  if (!hit || hit.y < y || hit.y > y + 1) return null;
  return { yaw, pitch };
}

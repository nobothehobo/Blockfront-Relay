import {
  World,
  Projectile,
  Vec,
  W,
  H,
  D,
  basePosition,
} from "../shared/game.js";
export function stepProjectile(p: Projectile, world: World, dt: number) {
  if (p.kind === "grenade") p.vy -= 14 * dt;
  for (const axis of ["x", "y", "z"] as const) {
    const velocity = axis === "x" ? "vx" : axis === "y" ? "vy" : "vz",
      old = p[axis];
    p[axis] += p[velocity] * dt;
    const hit = [
      [-0.14, 0, 0],
      [0.14, 0, 0],
      [0, -0.14, 0],
      [0, 0.14, 0],
      [0, 0, -0.14],
      [0, 0, 0.14],
    ].some(([x, y, z]) => world.get(p.x + x, p.y + y, p.z + z));
    if (hit) {
      p[axis] = old;
      if (p.kind === "rocket") return true;
      p[velocity] *= -0.45;
      if (axis === "y") {
        p.vx *= 0.8;
        p.vz *= 0.8;
      }
    }
  }
  p.fuse -= dt;
  return (
    p.fuse <= 0 ||
    p.y < 0.5 ||
    p.y > H + 20 ||
    p.x < 1 ||
    p.x > W - 1 ||
    p.z < 1 ||
    p.z > D - 1
  );
}
export function blastCells(
  world: World,
  center: Vec,
  radius = 3.1,
): [number, number, number, number][] {
  const edits: [number, number, number, number][] = [];
  for (let x = Math.floor(center.x - radius); x <= center.x + radius; x++)
    for (let z = Math.floor(center.z - radius); z <= center.z + radius; z++)
      for (let y = Math.floor(center.y - radius); y <= center.y + radius; y++) {
        if (
          x < 1 ||
          x >= W - 1 ||
          z < 1 ||
          z >= D - 1 ||
          y <= 0 ||
          y >= H - 1 ||
          !world.get(x, y, z)
        )
          continue;
        if (
          Math.hypot(
            x + 0.5 - center.x,
            y + 0.5 - center.y,
            z + 0.5 - center.z,
          ) > radius
        )
          continue;
        if (
          [0, 1].some((t) => {
            const b = basePosition(t);
            return y < 15 && Math.hypot(x + 0.5 - b.x, z + 0.5 - b.z) < 3;
          })
        )
          continue;
        edits.push([x, y, z, 0]);
      }
  return edits;
}

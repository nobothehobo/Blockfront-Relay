import { World, Vec, collides } from "../shared/game.js";
// Bounded local A*: one-block ascents, safe drops; no global navmesh or teleporting.
export function walkHeight(world: World, x: number, z: number, fromY: number) {
  for (
    let y = Math.floor(fromY + 0.05) + 1;
    y >= Math.floor(fromY + 0.05) - 3;
    y--
  )
    if (world.get(x, y - 1, z) && !collides(world, x, y + 0.01, z))
      return y + 0.01;
  return null;
}
// Validate the corridor, not only its endpoint. Raised sweeps allow ordinary
// steps but reject low-ceiling transitions and diagonal corner clipping.
export function canTraverse(world: World, from: Vec, to: Vec) {
  if (to.y - from.y > 1.05 || from.y - to.y > 3.05) return false;
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.25),
  );
  const y = Math.max(from.y, to.y);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    if (collides(world, x, y, z)) return false;
    // A straddled step may support either edge of the body's footprint.
    let supported = false;
    support: for (const ox of [-0.25, 0, 0.25])
      for (const oz of [-0.25, 0, 0.25])
        for (let depth = 0; depth <= 3; depth++)
          if (world.get(x + ox, Math.floor(y + 0.05) - 1 - depth, z + oz)) {
            supported = true;
            break support;
          }
    if (!supported) return false;
  }
  return true;
}
export function planRoute(
  world: World,
  from: Vec,
  goal: Vec,
  budget = 256,
): Vec[] {
  type Node = Vec & { cost: number; score: number; parent?: Node };
  const start: Node = {
    x: Math.floor(from.x) + 0.5,
    y: from.y,
    z: Math.floor(from.z) + 0.5,
    cost: 0,
    score: 0,
  };
  const distance = (n: Vec) =>
    Math.hypot(n.x - goal.x, n.z - goal.z) + Math.abs(n.y - goal.y) * 0.5;
  const key = (n: Vec) => `${n.x},${Math.floor(n.y)},${n.z}`;
  const open = [start],
    costs = new Map([[key(start), 0]]),
    closed = new Set<string>();
  let best = start;
  while (open.length && budget-- > 0) {
    let index = 0;
    for (let i = 1; i < open.length; i++)
      if (open[i].score < open[index].score) index = i;
    const node = open.splice(index, 1)[0],
      k = key(node);
    if (closed.has(k)) continue;
    closed.add(k);
    if (distance(node) < distance(best)) best = node;
    if (distance(node) < 1) {
      best = node;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = node.x + dx,
        z = node.z + dz;
      if (Math.abs(x - start.x) > 12 || Math.abs(z - start.z) > 12) continue;
      const y = walkHeight(world, x, z, node.y);
      if (y === null || !canTraverse(world, node, { x, y, z })) continue;
      const cost = node.cost + 1 + Math.abs(y - node.y) * 0.3;
      const next: Node = {
        x,
        y,
        z,
        cost,
        score: cost + distance({ x, y, z }),
        parent: node,
      };
      if (closed.has(key(next)) || cost >= (costs.get(key(next)) ?? Infinity))
        continue;
      costs.set(key(next), cost);
      open.push(next);
    }
  }
  const route: Vec[] = [];
  for (let n: Node | undefined = best; n?.parent; n = n.parent)
    route.push({ x: n.x, y: n.y, z: n.z });
  return route.reverse();
}

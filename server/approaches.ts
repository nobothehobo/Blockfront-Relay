import { Player, World, Vec } from "../shared/game.js";
import { battleRoutes, nearestRoutePoint } from "../shared/layout.js";
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

// Sparse strategic waypoints supplement, rather than replace, bounded local A*.
// Bots still submit ordinary inputs and collide/dig under Room authority.
export function approachWaypoint(
  p: Player,
  world: World,
  goal: Vec,
  preferred: number,
): Vec {
  if (!world.layoutVersion || distance(p, goal) < 30) {
    if (p.brain) p.brain.approach = undefined;
    return goal;
  }
  const routes = battleRoutes(world.seed);
  if (!p.brain) return goal;
  if (!p.brain.approach || distance(p.brain.approach.goal, goal) > 24) {
    let cost = Infinity,
      lane = 0;
    routes.forEach((route, i) => {
      const from = nearestRoutePoint(route, p),
        to = nearestRoutePoint(route, goal);
      const value =
        from.distance + to.distance * 0.15 + (i === preferred ? 0 : 5);
      if (value < cost) {
        cost = value;
        lane = i;
      }
    });
    p.brain.approach = { lane, goal: { ...goal } };
  }
  const route = routes[p.brain.approach.lane],
    from = nearestRoutePoint(route, p),
    to = nearestRoutePoint(route, goal);
  // Empty/custom test arenas and a completely excavated corridor do not inherit
  // a standing height from the generated battlefield plan.
  if (!world.get(from.point.x, Math.round(from.point.y) - 1, from.point.z))
    return goal;
  const sign = to.segment + to.t >= from.segment + from.t ? 1 : -1;
  if (from.distance > 5) return from.point;
  let i = from.segment + (sign > 0 ? 1 : 0);
  while (i >= 0 && i < route.points.length && distance(p, route.points[i]) < 3)
    i += sign;
  return route.points[i] ?? goal;
}

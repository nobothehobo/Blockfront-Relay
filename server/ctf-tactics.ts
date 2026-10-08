import { Player, Vec, World } from "../shared/game.js";
import { walkHeight } from "./navigation.js";
type Flag = {
  team: number;
  home: Vec;
  pos: Vec;
  carrier: string | null;
  dropped: number;
};
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
// Shared objective knowledge only; this never grants visibility, accuracy or damage.
export function flagAssignment(
  p: Player,
  players: Map<string, Player>,
  flags: Flag[],
  world?: World,
) {
  const own = flags[p.team],
    enemy = flags[1 - p.team];
  const squad = [...players.values()]
    .filter((v) => v.bot && v.team === p.team && v.dead <= 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const slot = squad.findIndex((v) => v.id === p.id);
  const defenders =
    squad.length >= 2 ? Math.max(1, Math.floor(squad.length / 4)) : 0;
  const role =
    slot < defenders
      ? "defender"
      : squad.length >= 3 && slot === 1
        ? "escort"
        : "raider";
  if (enemy.carrier === p.id) return { role: "carrier", goal: own.home };
  if (own.carrier || own.dropped) {
    const threat = own.carrier
      ? (players.get(own.carrier) ?? own.pos)
      : own.pos;
    const rescuers = squad
      .filter((v) => v.dead <= 0)
      .sort(
        (a, b) =>
          distance(a, threat) - distance(b, threat) || a.id.localeCompare(b.id),
      )
      .slice(0, 2);
    if (rescuers.some((v) => v.id === p.id))
      return {
        role: own.carrier ? "interceptor" : "recover",
        goal: { ...threat },
      };
  }
  const carrier = enemy.carrier ? players.get(enemy.carrier) : undefined;
  const escorts =
    carrier?.team === p.team
      ? squad
          .filter((v) => v.id !== carrier.id && squad.indexOf(v) >= defenders)
          .sort(
            (a, b) =>
              distance(a, carrier) - distance(b, carrier) ||
              a.id.localeCompare(b.id),
          )
          .slice(0, 2)
      : [];
  if (carrier?.team === p.team && escorts.some((v) => v.id === p.id)) {
    const side = escorts.findIndex((v) => v.id === p.id) === 0 ? 3 : -3;
    // Formation follows the route home, not every twitch of the carrier's aim.
    const heading = Math.atan2(
      -(own.home.x - carrier.x),
      -(own.home.z - carrier.z),
    );
    const candidate = {
      x: carrier.x + Math.cos(heading) * side + Math.sin(heading) * 2,
      y: carrier.y,
      z: carrier.z - Math.sin(heading) * side + Math.cos(heading) * 2,
    };
    const height = world
      ? walkHeight(world, candidate.x, candidate.z, carrier.y)
      : carrier.y;
    return {
      role: "escort",
      // A narrow trench/tunnel cannot hold a wide formation: follow the carrier.
      goal:
        height === null
          ? { x: carrier.x, y: carrier.y, z: carrier.z }
          : { ...candidate, y: height },
    };
  }
  if (role === "defender")
    return {
      role,
      goal: {
        ...own.home,
        x: own.home.x + (p.team === 0 ? 8 : -8),
        z: own.home.z + 4,
      },
    };
  // An escort becomes a raider until there is a friendly flag carrier to protect.
  // Extra attackers cover separate approach lanes rather than piling onto a carrier.
  return {
    role: "raider",
    goal:
      carrier?.team === p.team
        ? { ...enemy.home, z: enemy.home.z + (slot % 2 ? 8 : -8) }
        : enemy.pos,
  };
}

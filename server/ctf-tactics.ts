import { Player, Vec } from "../shared/game.js";
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
) {
  const own = flags[p.team],
    enemy = flags[1 - p.team];
  const squad = [...players.values()]
    .filter((v) => v.bot && v.team === p.team)
    .sort((a, b) => a.id.localeCompare(b.id));
  const slot = squad.findIndex((v) => v.id === p.id);
  const role =
    squad.length >= 2 && slot === 0
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
  if (carrier?.team === p.team && role !== "defender") {
    const side = slot % 2 ? 2.5 : -2.5;
    return {
      role: "escort",
      goal: {
        x: carrier.x + Math.cos(carrier.yaw) * side + Math.sin(carrier.yaw) * 2,
        y: carrier.y,
        z: carrier.z - Math.sin(carrier.yaw) * side + Math.cos(carrier.yaw) * 2,
      },
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
  return { role: "raider", goal: enemy.pos };
}

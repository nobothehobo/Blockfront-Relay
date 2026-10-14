import { Player, World, Vec, eye, ray } from "../shared/game.js";
import { botHash } from "./bot-profile.js";
// Sound is an imprecise clue, never an acquired/visible firing target.
export function hearShot(
  players: Iterable<Player>,
  world: World,
  origin: Vec,
  team: number,
  time: number,
) {
  for (const p of players) {
    if (!p.bot || p.team === team || p.dead > 0) continue;
    if (time - (p.brain?.heardAt ?? -10) < 0.3) continue;
    const o = eye(p),
      dx = origin.x - o.x,
      dy = origin.y - o.y,
      dz = origin.z - o.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > 55 || distance < 0.01) continue;
    const muffled = !!ray(
      world,
      o,
      { x: dx / distance, y: dy / distance, z: dz / distance },
      Math.max(0, distance - 0.5),
    );
    if (muffled && distance > 26) continue;
    const hash = botHash(p.id, Math.floor(time * 2));
    p.brain ??= {
      nextThink: 0,
      lastX: p.x,
      lastZ: p.z,
      stuck: 0,
      target: "",
      acquired: time,
    };
    p.brain.heard = {
      x: origin.x + ((hash % 7) - 3),
      y: origin.y - 1.55,
      z: origin.z + (((hash >>> 4) % 7) - 3),
    };
    p.brain.heardAt = time;
  }
}

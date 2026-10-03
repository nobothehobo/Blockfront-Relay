import { Vec } from "../shared/game.js";
export type JetVoice = { id: string; gain: number; pan: number; load: number };
export type JetPlayer = Vec & {
  id: string;
  dead: number;
  jetpack: boolean;
  fuel: number;
  thrusting?: boolean;
};
export function jetVoices(
  local: JetPlayer | null,
  jetHeld: boolean,
  players: JetPlayer[],
  yaw: number,
  paused: boolean,
  hidden: boolean,
): JetVoice[] {
  if (!local || local.dead > 0 || paused || hidden) return [];
  const voices: JetVoice[] = [];
  if (jetHeld && local.jetpack && local.fuel > 1)
    voices.push({
      id: local.id,
      gain: 1,
      pan: 0,
      load: Math.min(1, local.fuel / 30),
    });
  const nearby = players
    .filter(
      (p) =>
        p.id !== local.id &&
        p.dead <= 0 &&
        p.thrusting &&
        p.jetpack &&
        p.fuel > 1,
    )
    .map((p) => ({
      p,
      distance: Math.hypot(p.x - local.x, p.y - local.y, p.z - local.z),
    }))
    .filter((v) => v.distance < 40)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  for (const { p, distance } of nearby) {
    const dx = p.x - local.x,
      dz = p.z - local.z;
    voices.push({
      id: p.id,
      gain: 0.55 * (1 - distance / 40) ** 2,
      pan: (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(1, distance),
      load: Math.min(1, p.fuel / 30),
    });
  }
  return voices;
}

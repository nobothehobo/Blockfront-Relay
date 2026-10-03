// Cosmetic only: server-owned damage, spread and ammunition are unchanged.
export function weaponPose(
  ageMs: number,
  weapon: number,
  speed: number,
  timeMs: number,
  aim: boolean,
  reload: number,
) {
  const strength = [1, 0.65, 1.8, 1.55, 0, 0, 2.1][weapon] ?? 0;
  const kick = Math.max(0, 1 - Math.max(0, ageMs) / 180) * strength;
  const bob = Math.min(0.018, speed * 0.002);
  return {
    x: aim ? -0.22 : Math.cos(timeMs * 0.005) * bob * 0.5,
    y: reload > 0 ? -0.18 : Math.sin(timeMs * 0.01) * bob + kick * 0.008,
    z: kick * 0.045,
    pitch: kick * 0.065,
    roll:
      reload > 0
        ? Math.sin(reload * 4) * 0.18
        : Math.sin(timeMs * 0.005) * bob * 0.6,
  };
}

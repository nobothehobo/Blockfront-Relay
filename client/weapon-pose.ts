import { WEAPONS } from "../shared/game.js";
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  v = clamp(v);
  return v * v * (3 - 2 * v);
};
const pulse = (v: number, start: number, end: number) =>
  v > start && v < end ? Math.sin(((v - start) / (end - start)) * Math.PI) : 0;
// Cosmetic only. Reload timing, ammo and fire permission remain server-owned.
export function weaponPose(
  ageMs: number,
  weapon: number,
  speed: number,
  timeMs: number,
  aim: boolean,
  reload: number,
  switchAge = 1000,
  sprint = false,
) {
  const strength = [1, 0.65, 1.8, 1.55, 0, 0, 2.1][weapon] ?? 0;
  const age = Math.max(0, ageMs);
  const recovery = [160, 95, 250, 230, 180, 180, 300][weapon] ?? 180;
  const envelope = Math.max(0, 1 - age / recovery);
  const kick = envelope * envelope * strength * (aim ? 0.65 : 1);
  const bob = Math.min(0.018, speed * 0.002) * (aim ? 0.22 : 1);
  const reloading = reload > 0;
  const progress = reloading
    ? clamp(1 - reload / (WEAPONS[weapon]?.reload || 1))
    : 0;
  const tilt = reloading
    ? smooth(progress / 0.14) * (1 - smooth((progress - 0.84) / 0.16))
    : 0;
  const magazine = weapon === 2 ? 0 : tilt * pulse(progress, 0.12, 0.78);
  const shell =
    (weapon === 2 || weapon === 6) && reloading
      ? (weapon === 2
          ? Math.max(0, Math.sin(progress * Math.PI * 8))
          : pulse(progress, 0.18, 0.78)) * tilt
      : 0;
  const boltReload = pulse(progress, 0.77, 0.94) * tilt;
  const boltCycle =
    weapon === 3
      ? pulse(age / 1000, 0.18, 0.56)
      : weapon === 2
        ? pulse(age / 1000, 0.12, 0.42)
        : pulse(age / 1000, 0, 0.1);
  const swap = 1 - smooth(Math.max(0, switchAge) / 240);
  const run = sprint && !aim && !reloading ? Math.min(1, speed / 7) : 0;
  const reloadRoll = [0.32, -0.24, 0.2, 0.4, 0, 0, -0.18][weapon] ?? 0.32;
  const reloadPitch = [0.22, 0.16, 0.1, 0.28, 0, 0, 0.18][weapon] ?? 0.22;
  const toolSwing = weapon === 4 ? pulse(age / 1000, 0, 0.28) : 0;
  return {
    x: aim ? -0.22 : Math.cos(timeMs * 0.005) * bob * 0.5,
    y:
      Math.sin(timeMs * 0.01) * bob +
      kick * 0.008 -
      tilt * 0.12 -
      swap * 0.3 -
      run * 0.055,
    z: kick * 0.045 + swap * 0.06,
    pitch: kick * 0.065 - tilt * reloadPitch + run * 0.09 + toolSwing * 0.65,
    roll:
      Math.sin(timeMs * 0.005) * bob * 0.6 +
      tilt * reloadRoll -
      toolSwing * 0.3,
    magazine,
    shell,
    bolt: Math.max(boltCycle, boltReload),
    leftHand: Math.max(magazine, shell, boltReload),
    reloadPhase: reloading
      ? progress < 0.18
        ? "open"
        : progress < 0.75
          ? "load"
          : "close"
      : "ready",
  };
}

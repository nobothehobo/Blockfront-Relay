import { mapLayout } from "./game.js";

export const DAY_SECONDS = 360;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// All devices derive the sky from authoritative room time, never local wall time.
export function atmosphere(seed: number, seconds: number) {
  const locked = mapLayout(seed) === 3;
  const phase = locked ? 0.75 : (Math.max(0, seconds) / DAY_SECONDS + 0.25) % 1;
  const angle = phase * Math.PI * 2;
  const altitude = Math.sin(angle);
  const day = smooth(-0.12, 0.3, altitude);
  return {
    seconds: DAY_SECONDS,
    phase,
    day,
    night: 1 - day,
    twilight: Math.max(0, 1 - Math.abs(altitude) / 0.35),
    locked,
    sun: { x: Math.cos(angle) * 0.8, y: altitude, z: -0.6 },
  };
}

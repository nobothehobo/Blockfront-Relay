// Input capabilities are independent of the mobile graphics preset.
export function gameKey(code: string, key: string) {
  if (code && code !== "Unidentified") return code;
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[1-7]$/.test(key)) return `Digit${key}`;
  if (key === " ") return "Space";
  if (key === "Shift") return "ShiftLeft";
  return key;
}
export function hybridMovement(
  held: Set<string>,
  forward: number,
  strafe: number,
) {
  return {
    forward:
      held.has("KeyW") || held.has("KeyS")
        ? Number(held.has("KeyW")) - Number(held.has("KeyS"))
        : forward,
    strafe:
      held.has("KeyD") || held.has("KeyA")
        ? Number(held.has("KeyD")) - Number(held.has("KeyA"))
        : strafe,
  };
}
export function spaceThrust(
  held: Set<string>,
  ground: boolean,
  jetpack: boolean,
  dead: number,
) {
  return held.has("Space") && !ground && jetpack && dead <= 0;
}
// Safari can expose ordinary trackpad coordinates without relative pointer lock.
// Moving to an edge continues turning; entering/leaving UI never produces a jump.
export class TrackpadLook {
  private position: { x: number; y: number } | null = null;
  clear() {
    this.position = null;
  }
  sample(x: number, y: number) {
    const previous = this.position;
    this.position = { x, y };
    return previous
      ? {
          x: Math.max(-80, Math.min(80, x - previous.x)),
          y: Math.max(-80, Math.min(80, y - previous.y)),
        }
      : { x: 0, y: 0 };
  }
  edge(width: number, height: number) {
    if (!this.position) return { x: 0, y: 0 };
    const turn = (value: number, size: number) => {
      const margin = Math.min(36, size / 8);
      return value < margin
        ? -Math.min(1, (margin - value) / margin)
        : value > size - margin
          ? Math.min(1, (value - (size - margin)) / margin)
          : 0;
    };
    return {
      x: turn(this.position.x, width),
      y: turn(this.position.y, height),
    };
  }
}

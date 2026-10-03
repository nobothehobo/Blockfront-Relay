export function stickInput(
  x: number,
  y: number,
  aiming = false,
  crouching = false,
) {
  const length = Math.hypot(x, y);
  const magnitude = Math.min(1, Math.max(0, (length - 0.12) / 0.88));
  const factor = length > 0 ? magnitude / length : 0;
  return {
    strafe: x * factor,
    forward: -y * factor,
    sprint: -y * factor > 0.85 && !aiming && !crouching,
  };
}
export function touchLookGain(aiming: boolean, weapon: number) {
  return aiming ? (weapon === 3 ? 0.34 : 0.58) : 1;
}

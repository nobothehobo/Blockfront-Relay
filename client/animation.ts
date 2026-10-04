export function playerPose(
  phase: number,
  speed: number,
  grounded: boolean,
  zombie: boolean,
  aiming: boolean,
  reloading: boolean,
  shotAge: number,
) {
  const stride = grounded ? Math.min(1, speed / 6) : 0;
  const swing = Math.sin(phase) * stride;
  const recoil = Math.max(0, 1 - shotAge / 0.16) * 0.13;
  return {
    leftLeg: grounded ? swing * 0.65 : -0.2,
    rightLeg: grounded ? -swing * 0.65 : 0.25,
    leftArm: reloading
      ? 1.05
      : zombie
        ? 0.85 - swing * 0.14
        : aiming
          ? 0.5
          : -swing * 0.32,
    rightArm: reloading
      ? 0.8
      : zombie
        ? 0.85 + swing * 0.14
        : 0.35 + swing * 0.1 + recoil,
    bob: grounded ? Math.abs(Math.sin(phase)) * stride * 0.035 : 0,
    lean: zombie ? 0.16 + stride * 0.05 : grounded ? -stride * 0.06 : 0.05,
    recoil,
  };
}

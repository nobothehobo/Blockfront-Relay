const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
// Presentation only: never changes player/camera aim, collision, or server input.
export class ViewMotion {
  yaw = 0;
  pitch = 0;
  lookX = 0;
  lookY = 0;
  landing = 0;
  ground = true;
  vy = 0;
  initialized = false;
  reset() {
    this.initialized = false;
    this.lookX = this.lookY = this.landing = 0;
  }
  update(
    yaw: number,
    pitch: number,
    vy: number,
    ground: boolean,
    aim: boolean,
    dt: number,
  ) {
    if (!this.initialized) {
      this.yaw = yaw;
      this.pitch = pitch;
      this.ground = ground;
      this.vy = vy;
      this.initialized = true;
    }
    const blend = 1 - Math.exp(-Math.max(0, dt) * 18),
      gain = aim ? 0.35 : 1;
    const turn = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.lookX += (clamp(turn, -0.1, 0.1) * gain * 0.35 - this.lookX) * blend;
    this.lookY +=
      (clamp(pitch - this.pitch, -0.1, 0.1) * gain * 0.35 - this.lookY) * blend;
    if (ground && !this.ground && this.vy < -2)
      this.landing = Math.min(0.075, -this.vy * 0.004);
    this.landing *= Math.exp(-dt * 11);
    this.yaw = yaw;
    this.pitch = pitch;
    this.ground = ground;
    this.vy = vy;
    return this;
  }
}

// Actual weapon cone projected to pixels; recoil dilation is cosmetic only.
export function crosshairRadius(
  spread: number,
  aim: boolean,
  fov: number,
  height: number,
  shotAge: number,
  focused = false,
) {
  const cone = spread * (aim ? 0.3 : 1) * (focused ? 0.35 : 1);
  return clamp(
    2 +
      (Math.tan(cone) * height) / (2 * Math.tan((fov * Math.PI) / 360)) +
      Math.max(0, 1 - shotAge / 0.15) * 4,
    3,
    28,
  );
}

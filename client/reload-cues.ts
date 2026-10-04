import { WEAPONS } from "../shared/game.js";
// Driven by accepted server reload state, not setTimeout: cancelling, switching,
// death and hidden tabs cannot leave delayed reload sounds running afterward.
export class ReloadCues {
  weapon = -1;
  progress = -1;
  reset() {
    this.weapon = -1;
    this.progress = -1;
  }
  update(weapon: number, remaining: number): string | null {
    if (remaining <= 0 || !WEAPONS[weapon]?.reload) {
      this.reset();
      return null;
    }
    const progress = Math.max(
      0,
      Math.min(1, 1 - remaining / WEAPONS[weapon].reload),
    );
    if (this.weapon !== weapon) {
      this.reset();
      this.weapon = weapon;
    }
    const stages: [number, string][] =
      weapon === 2
        ? [
            [0, "reload-open"],
            [0.22, "reload-shell"],
            [0.42, "reload-shell"],
            [0.62, "reload-shell"],
            [0.86, "reload-close"],
          ]
        : [
            [0, "reload-open"],
            [0.46, weapon === 6 ? "reload-shell" : "reload-seat"],
            [0.86, "reload-close"],
          ];
    // First observation partway into a reload skips cues already in the past.
    const previous =
      this.progress < 0 && progress > 0.2 ? progress : this.progress;
    const crossed = stages.filter(([at]) => at > previous && at <= progress);
    this.progress = Math.max(this.progress, progress);
    return crossed.at(-1)?.[1] ?? null;
  }
}

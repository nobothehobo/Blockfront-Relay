import { Player } from "../shared/game.js";

export type HitPose = Pick<
  Player,
  "x" | "y" | "z" | "crouch" | "epoch" | "dead"
>;
export const MAX_REWIND = 0.2;
export class HitHistory {
  frames: { time: number; poses: Map<string, HitPose> }[] = [];
  record(time: number, players: Iterable<Player>) {
    this.frames.push({
      time,
      poses: new Map(
        [...players].map((p) => [
          p.id,
          {
            x: p.x,
            y: p.y,
            z: p.z,
            crouch: p.crouch,
            epoch: p.epoch,
            dead: p.dead,
          },
        ]),
      ),
    });
    while (
      this.frames.length > 12 ||
      (this.frames[0] && time - this.frames[0].time > 0.35)
    )
      this.frames.shift();
  }
  pose(player: Player, requested: number | undefined, now: number): HitPose {
    if (
      requested === undefined ||
      !Number.isFinite(requested) ||
      requested > now
    )
      return player;
    const time = Math.max(now - MAX_REWIND, requested);
    let a = this.frames[0],
      b = a;
    if (!a || time < a.time) return player;
    for (const frame of this.frames) {
      if (frame.time <= time) a = frame;
      if (frame.time >= time) {
        b = frame;
        break;
      }
      b = frame;
    }
    const pa = a.poses.get(player.id),
      pb = b.poses.get(player.id);
    // Respawns, infection conversions and death must never resurrect old hitboxes.
    if (
      !pa ||
      !pb ||
      pa.epoch !== player.epoch ||
      pb.epoch !== player.epoch ||
      pa.dead > 0 ||
      pb.dead > 0
    )
      return player;
    const t = Math.max(
      0,
      Math.min(1, (time - a.time) / (b.time - a.time || 1)),
    );
    return {
      ...pa,
      x: pa.x + (pb.x - pa.x) * t,
      y: pa.y + (pb.y - pa.y) * t,
      z: pa.z + (pb.z - pa.z) * t,
    };
  }
}

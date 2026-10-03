import { Body, Input, World, TICK, move } from "./game.js";
export type Command = Input;
export function sanitizeInput(raw: unknown): Input | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  for (const k of ["seq", "forward", "strafe", "yaw", "pitch", "weapon"])
    if (typeof r[k] !== "number" || !Number.isFinite(r[k])) return null;
  return {
    seq: Math.floor(r.seq),
    forward: Math.max(-1, Math.min(1, r.forward)),
    strafe: Math.max(-1, Math.min(1, r.strafe)),
    yaw: r.yaw % (Math.PI * 2),
    pitch: Math.max(-1.5, Math.min(1.5, r.pitch)),
    weapon: Math.max(0, Math.min(6, r.weapon | 0)),
    jump: r.jump === true,
    sprint: r.sprint === true,
    crouch: r.crouch === true,
    jet: r.jet === true,
    fire: r.fire === true,
    aim: r.aim === true,
    reload: r.reload === true,
    place: r.place === true,
    dig: r.dig === true,
    grenade: r.grenade === true,
    buildKit:
      Number.isInteger(r.buildKit) && r.buildKit >= 0 && r.buildKit < 4
        ? r.buildKit
        : 0,
    ability: r.ability === true,
    classId:
      Number.isInteger(r.classId) && r.classId >= 0 && r.classId < 4
        ? r.classId
        : undefined,
  };
}
// Both prediction and authoritative command execution use exactly one 30 Hz step.
export function replay<T extends Body>(
  authoritative: T,
  commands: Input[],
  world: World,
  zombie: boolean,
  jetpack: boolean,
): T {
  const body = { ...authoritative };
  for (const command of commands)
    move(body, command, world, TICK, zombie, jetpack);
  return body;
}

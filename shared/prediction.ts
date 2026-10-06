import { Body, Input, World, TICK, move } from "./game.js";
import { KITS } from "./fortifications.js";
import { validClass } from "./classes.js";
export type Command = Input;
const ACTIONS = [
  "jump",
  "sprint",
  "crouch",
  "jet",
  "fire",
  "aim",
  "reload",
  "place",
  "dig",
  "grenade",
  "gear",
  "ability",
] as const;
// Lossless wire format: fewer repeated keys, without rounding movement/aim.
export function packInput(command: Input): number[] {
  const flags = ACTIONS.reduce(
    (mask, key, i) => mask | (command[key] ? 1 << i : 0),
    0,
  );
  return [
    command.seq,
    command.forward,
    command.strafe,
    command.yaw,
    command.pitch,
    command.weapon,
    flags,
    command.buildKit ?? 0,
    command.classId ?? -1,
    command.viewTime ?? -1,
  ];
}
export function sanitizeInput(raw: unknown): Input | null {
  if (!raw || typeof raw !== "object") return null;
  let r = raw as any;
  if (Array.isArray(raw)) {
    if (
      raw.length !== 10 ||
      !Number.isInteger(raw[6]) ||
      raw[6] < 0 ||
      raw[6] > 4095
    )
      return null;
    r = {
      seq: raw[0],
      forward: raw[1],
      strafe: raw[2],
      yaw: raw[3],
      pitch: raw[4],
      weapon: raw[5],
      buildKit: raw[7],
      classId: raw[8],
      viewTime: raw[9],
    };
    ACTIONS.forEach((key, i) => {
      r[key] = !!(raw[6] & (1 << i));
    });
  }
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
    gear: r.gear === true,
    buildKit:
      Number.isInteger(r.buildKit) &&
      r.buildKit >= 0 &&
      r.buildKit < KITS.length
        ? r.buildKit
        : 0,
    ability: r.ability === true,
    viewTime:
      typeof r.viewTime === "number" &&
      Number.isFinite(r.viewTime) &&
      r.viewTime >= 0
        ? r.viewTime
        : undefined,
    classId: validClass(r.classId) ? r.classId : undefined,
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

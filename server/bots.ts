import {
  Player,
  Input,
  World,
  Vec,
  emptyInput,
  eye,
  direction,
  ray,
  WEAPONS,
  W,
  D,
} from "../shared/game.js";
export type BotBrain = {
  nextThink: number;
  lastX: number;
  lastZ: number;
  stuck: number;
  target: string;
  acquired: number;
};
type Arena = {
  time: number;
  phase: string;
  world: World;
  players: Map<string, Player>;
  options: { mode: string };
  flags: {
    team: number;
    home: Vec;
    pos: Vec;
    carrier: string | null;
    dropped: number;
  }[];
};
// Bots only choose normal inputs. Physics, shots, edits, resources and objectives use Room authority.
export function thinkBot(p: Player, arena: Arena): Input {
  const brain = (p.brain ??= {
    nextThink: 0,
    lastX: p.x,
    lastZ: p.z,
    stuck: 0,
    target: "",
    acquired: arena.time,
  });
  if (arena.time < brain.nextThink) return p.input;
  brain.nextThink = arena.time + 0.18;
  const enemies = [...arena.players.values()].filter(
    (v) => v.id !== p.id && v.team !== p.team && v.dead <= 0,
  );
  enemies.sort(
    (a, b) =>
      Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
  );
  const target = enemies[0];
  let goal: Vec = target ?? { x: W / 2 + 0.5, y: 13, z: D / 2 + 0.5 };
  if (arena.options.mode === "relay") {
    const own = arena.flags[p.team],
      enemy = arena.flags[1 - p.team];
    if (enemy.carrier === p.id) goal = own.home;
    else if (own.dropped && !own.carrier) goal = own.pos;
    else if (!enemy.carrier) goal = enemy.pos;
  }
  const moved = Math.hypot(p.x - brain.lastX, p.z - brain.lastZ);
  brain.stuck = p.input.forward !== 0 && moved < 0.12 ? brain.stuck + 0.18 : 0;
  brain.lastX = p.x;
  brain.lastZ = p.z;
  const distance = target
    ? Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z)
    : Infinity;
  const origin = eye(p);
  let visible = false;
  if (target) {
    const aim = eye(target);
    const length = Math.hypot(
      aim.x - origin.x,
      aim.y - origin.y,
      aim.z - origin.z,
    );
    visible = !ray(
      arena.world,
      origin,
      {
        x: (aim.x - origin.x) / length,
        y: (aim.y - origin.y) / length,
        z: (aim.z - origin.z) / length,
      },
      length - 0.5,
    );
  }
  if (brain.target !== target?.id) {
    brain.target = target?.id ?? "";
    brain.acquired = arena.time;
  }
  // Travel through the broad central lane before closing on obscured distant opponents.
  const navigation = { ...goal };
  if (
    !visible &&
    Math.hypot(goal.x - p.x, goal.z - p.z) > 55 &&
    Math.abs(p.z - (D / 2 + 0.5)) > 5
  )
    navigation.z = D / 2 + 0.5;
  let yaw = Math.atan2(-(navigation.x - p.x), -(navigation.z - p.z));
  let pitch = 0;
  const attack =
    !!target &&
    visible &&
    distance < (p.zombie ? 3.8 : 125) &&
    arena.time - brain.acquired > 0.35;
  if (attack) {
    yaw = Math.atan2(-(target!.x - p.x), -(target!.z - p.z));
    pitch = Math.atan2(
      eye(target!).y - origin.y - 0.15,
      Math.hypot(target!.x - p.x, target!.z - p.z),
    );
    // Human bots aim imperfectly; no hidden player damage or perfect-accuracy shortcuts.
    yaw += Math.sin(arena.time * 2.3 + p.id.length) * 0.012;
    pitch += Math.cos(arena.time * 1.7 + p.id.length) * 0.006;
  }
  const tool = brain.stuck > 0.8 && !attack;
  if (tool) pitch = -0.12;
  const weapon = p.zombie ? 4 : 0;
  const obstacle = ray(arena.world, origin, direction(yaw, 0), 1.8);
  const goalDistance = Math.hypot(goal.x - p.x, goal.z - p.z);
  return {
    ...emptyInput(),
    seq: p.lastSeq + 1,
    yaw,
    pitch,
    weapon,
    forward:
      goalDistance > 2 && !(attack && !p.zombie && distance < 30) ? 1 : 0,
    strafe:
      attack && !p.zombie ? Math.sin(arena.time * 0.8 + p.id.length) * 0.5 : 0,
    sprint: !attack,
    jump: !!obstacle || brain.stuck > 0.4,
    dig: tool,
    jet: p.jetpack && !!obstacle && brain.stuck > 0.4 && p.fuel > 30,
    aim: attack && !p.zombie,
    fire: attack && arena.phase === "active",
    reload:
      !p.zombie &&
      !p.reload &&
      p.ammo[weapon] < Math.max(1, WEAPONS[weapon].mag / 4) &&
      p.reserve[weapon] > 0,
  };
}

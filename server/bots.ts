import { classPrimary } from "../shared/classes.js";
import { Sector, SupplyStation } from "../shared/battlefield.js";
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
  basePosition,
} from "../shared/game.js";
import { planRoute, walkHeight } from "./navigation.js";
import { flagAssignment } from "./ctf-tactics.js";
export type BotBrain = NonNullable<Player["brain"]>;
type Arena = {
  time: number;
  phase: string;
  world: World;
  players: Map<string, Player>;
  options: { mode: string; arsenal?: "sandbox" | "specialists" };
  controlPoints?: Sector[];
  supplyStations?: SupplyStation[];
  flags: {
    team: number;
    home: Vec;
    pos: Vec;
    carrier: string | null;
    dropped: number;
  }[];
};
const horizontal = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
function canSee(world: World, from: Vec, to: Vec) {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  return (
    length < 0.01 ||
    !ray(
      world,
      from,
      {
        x: (to.x - from.x) / length,
        y: (to.y - from.y) / length,
        z: (to.z - from.z) / length,
      },
      length - 0.35,
    )
  );
}
// Ordinary inputs only: every action still passes through Room validation and physics.
export function thinkBot(p: Player, arena: Arena): Input {
  const brain: BotBrain = (p.brain ??= {
    nextThink: 0,
    lastX: p.x,
    lastZ: p.z,
    stuck: 0,
    target: "",
    acquired: arena.time,
  });
  if (arena.time < brain.nextThink) return p.input;
  const dt = 0.18;
  brain.nextThink = arena.time + dt;
  const personality =
    [...p.id].reduce((n, c) => Math.imul(n, 31) + c.charCodeAt(0), 17) >>> 0;
  const origin = eye(p);
  const candidates = [...arena.players.values()]
    .filter((v) => v.id !== p.id && v.team !== p.team && v.dead <= 0)
    .sort((a, b) => horizontal(a, p) - horizontal(b, p))
    .slice(0, 8);
  const visible = candidates.filter(
    (v) => horizontal(v, p) < 140 && canSee(arena.world, origin, eye(v)),
  );
  const target = visible.find((v) => v.id === brain.target) ?? visible[0];
  if (target) {
    if (brain.target !== target.id) {
      brain.target = target.id;
      brain.acquired = arena.time;
    }
    brain.lastSeen = { x: target.x, y: target.y, z: target.z };
    brain.seenAt = arena.time;
  } else if (arena.time - (brain.seenAt ?? -10) > 2.5) {
    brain.target = "";
    brain.lastSeen = undefined;
  }
  let goal: Vec = brain.lastSeen ?? basePosition(1 - p.team);
  if (!target && !brain.lastSeen && horizontal(goal, p) < 8)
    goal = {
      x: W / 2 + Math.sin(arena.time * 0.09 + personality) * 35,
      y: p.y,
      z: D / 2 + Math.cos(arena.time * 0.09 + personality) * 24,
    };
  let objective = false;
  if (arena.options.mode === "ctf") {
    const assignment = flagAssignment(p, arena.players, arena.flags);
    goal = assignment.goal;
    brain.role = assignment.role;
    objective = true;
  }
  if (arena.options.mode === "relay") {
    const own = arena.flags[p.team],
      enemy = arena.flags[1 - p.team];
    if (enemy.carrier === p.id) {
      goal = own.home;
      objective = true;
    } else if (own.dropped && !own.carrier) {
      goal = own.pos;
      objective = true;
    } else if (!enemy.carrier) {
      goal = enemy.pos;
      objective = true;
    } else if (enemy.carrier) {
      const carrier = arena.players.get(enemy.carrier);
      if (carrier && carrier.team === p.team) {
        goal = {
          x: carrier.x + (personality % 2 ? 3 : -3),
          y: carrier.y,
          z: carrier.z + 3,
        };
        objective = true;
      }
    }
  }
  if (arena.options.mode === "frontline" && arena.controlPoints?.length) {
    const available = arena.controlPoints.filter(
      (point) => point.owner !== p.team,
    );
    const point = [
      ...(available.length ? available : arena.controlPoints),
    ].sort((a, b) => horizontal(a.pos, p) - horizontal(b.pos, p))[0];
    goal = point.pos;
    objective = true;
  }
  if (arena.options.mode === "demolition") {
    const base = basePosition(1 - p.team);
    goal = {
      x: Math.floor(base.x) + (p.team === 0 ? -14 : 14),
      y: 13,
      z: base.z + 18,
    };
    objective = true;
  }
  if (
    !p.zombie &&
    (p.health < 40 ||
      !p.reserve[
        classPrimary(p.classId, arena.options.arsenal === "specialists")
      ]) &&
    !(p.supplyCooldown ?? 0)
  ) {
    const station = arena.supplyStations?.find((s) => s.team === p.team);
    if (station) {
      goal = station.pos;
      objective = true;
    }
  }
  const distance = target ? horizontal(target, p) : Infinity;
  const ready = !!target && arena.time - brain.acquired > 0.4;
  const primary = classPrimary(
    p.classId,
    arena.options.arsenal === "specialists",
  );
  const ammoLow =
    !p.zombie && p.ammo[primary] < Math.max(1, WEAPONS[primary].mag / 4);
  const retreat =
    !!target &&
    !p.zombie &&
    (p.health < 35 ||
      p.reload > 0 ||
      ammoLow ||
      (arena.options.mode === "infection" && target.zombie && distance < 12));
  if (retreat && target) {
    const length = Math.max(1, distance),
      dx = (p.x - target.x) / length,
      dz = (p.z - target.z) / length;
    let best = -Infinity;
    for (const offset of [-0.9, 0, 0.9]) {
      const angle = Math.atan2(dz, dx) + offset;
      const candidate = {
        x: p.x + Math.cos(angle) * 5,
        y: p.y,
        z: p.z + Math.sin(angle) * 5,
      };
      const height = walkHeight(arena.world, candidate.x, candidate.z, p.y);
      if (height === null) continue;
      candidate.y = height;
      const score =
        horizontal(candidate, target) +
        (canSee(arena.world, eye(target), { ...candidate, y: height + 1.55 })
          ? 0
          : 15);
      if (score > best) {
        best = score;
        goal = candidate;
      }
    }
  }
  const moved = Math.hypot(p.x - brain.lastX, p.z - brain.lastZ);
  brain.stuck =
    Math.abs(p.input.forward) + Math.abs(p.input.strafe) > 0.2 && moved < 0.12
      ? brain.stuck + dt
      : 0;
  brain.lastX = p.x;
  brain.lastZ = p.z;
  const desired = Math.atan2(-(goal.x - p.x), -(goal.z - p.z));
  const front = ray(
    arena.world,
    { ...origin, y: p.y + 0.65 },
    direction(desired, 0),
    1.6,
  );
  const nextFloor = walkHeight(
    arena.world,
    p.x - Math.sin(desired) * 1.2,
    p.z - Math.cos(desired) * 1.2,
    p.y,
  );
  if (
    (!!front ||
      nextFloor === null ||
      brain.stuck > 0.3 ||
      brain.route?.length) &&
    arena.time >= (brain.nextPlan ?? 0)
  ) {
    brain.route = planRoute(arena.world, p, goal);
    brain.routeGoal = { ...goal };
    brain.nextPlan = arena.time + 1.1 + (personality % 7) * 0.05;
  }
  if (brain.routeGoal && horizontal(brain.routeGoal, goal) > 6)
    brain.route = [];
  while (brain.route?.length && horizontal(brain.route[0], p) < 0.45)
    brain.route.shift();
  const navigation = brain.route?.[0] ?? goal;
  const navYaw = Math.atan2(-(navigation.x - p.x), -(navigation.z - p.z));
  const attack = ready && distance < (p.zombie ? 3.8 : 125);
  let aimYaw = navYaw,
    pitch = 0;
  if (target && ready) {
    aimYaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
    pitch = Math.atan2(eye(target).y - origin.y - 0.15, distance);
    // Retain imperfect aim: better decisions, not higher accuracy or hidden damage.
    if (!p.zombie) {
      aimYaw += Math.sin(arena.time * 2.3 + personality) * 0.016;
      pitch += Math.cos(arena.time * 1.7 + personality) * 0.008;
    }
  }
  const yaw =
    p.yaw + Math.max(-dt * 3.5, Math.min(dt * 3.5, wrap(aimYaw - p.yaw)));
  const tool = brain.stuck > 1.2 && !attack && !!front;
  if (tool) pitch = -0.35;
  const travel =
    horizontal(goal, p) > 2 &&
    (objective || !attack || retreat || p.zombie || distance > 30);
  let forward = 0,
    strafe = 0;
  if (travel) {
    const relative = wrap(navYaw - yaw);
    forward = Math.cos(relative);
    strafe = -Math.sin(relative);
  } else if (attack && !p.zombie) {
    if (arena.time >= (brain.nextStrafe ?? 0)) {
      brain.side = -(brain.side ?? (personality % 2 ? 1 : -1));
      brain.nextStrafe = arena.time + 1.3 + (personality % 5) * 0.15;
    }
    strafe = (brain.side ?? 1) * 0.55;
  }
  if (travel) {
    let awayX = 0,
      awayZ = 0;
    for (const other of arena.players.values()) {
      if (other.id === p.id || other.dead > 0 || Math.abs(other.y - p.y) > 1.5)
        continue;
      const dx = p.x - other.x,
        dz = p.z - other.z;
      const length = Math.hypot(dx, dz);
      if (length > 0.01 && length < 1.1) {
        awayX += (dx / length) * (1.1 - length) * 0.5;
        awayZ += (dz / length) * (1.1 - length) * 0.5;
      }
    }
    if (walkHeight(arena.world, p.x + awayX, p.z + awayZ, p.y) !== null) {
      forward += -Math.sin(yaw) * awayX - Math.cos(yaw) * awayZ;
      strafe += Math.cos(yaw) * awayX - Math.sin(yaw) * awayZ;
    }
  }
  const steerX = -Math.sin(yaw) * forward + Math.cos(yaw) * strafe;
  const steerZ = -Math.cos(yaw) * forward - Math.sin(yaw) * strafe;
  if (
    walkHeight(arena.world, p.x + steerX, p.z + steerZ, p.y) === null &&
    !brain.route?.length
  ) {
    forward = 0;
    strafe = 0;
  }
  const teammateBlocked =
    target &&
    [...arena.players.values()].some((v) => {
      if (v.id === p.id || v.team !== p.team || v.dead > 0) return false;
      const dx = target.x - p.x,
        dz = target.z - p.z,
        l = dx * dx + dz * dz;
      const along = ((v.x - p.x) * dx + (v.z - p.z) * dz) / Math.max(1, l);
      return (
        along > 0 &&
        along < 1 &&
        Math.hypot(v.x - p.x - dx * along, v.z - p.z - dz * along) < 0.65
      );
    });
  // Do not hold jump through landings: try once, then give walking/routing time.
  const moving = Math.hypot(forward, strafe) > 0.2;
  const jump =
    moving &&
    p.ground &&
    brain.stuck > 0.5 &&
    !!front &&
    arena.time >= (brain.nextJump ?? 0);
  if (jump) brain.nextJump = arena.time + 1.35;
  return {
    ...emptyInput(),
    seq: p.lastSeq + 1,
    yaw,
    pitch,
    weapon: p.zombie || tool ? 4 : primary,
    forward,
    strafe,
    sprint: !attack && !retreat,
    jump,
    dig: tool,
    jet: p.jetpack && !!front && brain.stuck > 0.8 && p.fuel > 30,
    aim: attack && !p.zombie && !retreat,
    grenade:
      attack &&
      !p.zombie &&
      distance > 12 &&
      distance < 28 &&
      !teammateBlocked &&
      (p.grenades ?? 0) > 0 &&
      (p.grenadeCooldown ?? 0) === 0 &&
      Math.floor(arena.time * 5 + personality) % 17 === 0,
    ability:
      !p.zombie &&
      (p.abilityCooldown ?? 0) === 0 &&
      (p.classId === 4
        ? tool
        : retreat || (attack && (p.classId !== 0 || p.health < 70))),
    gear:
      !p.zombie &&
      p.ground &&
      (p.gearCharges ?? 0) > 0 &&
      (p.gearCooldown ?? 0) === 0 &&
      Math.floor(arena.time * 5 + personality) % 23 === 0 &&
      (p.classId === 0
        ? p.health < 70
        : p.classId === 3
          ? !attack && distance > 8
          : p.classId === 2
            ? attack && distance > 12 && distance < 24
            : tool),
    fire:
      attack &&
      arena.phase === "active" &&
      !teammateBlocked &&
      Math.abs(wrap(aimYaw - yaw)) < 0.12,
    reload: !p.zombie && !p.reload && ammoLow && p.reserve[primary] > 0,
  };
}

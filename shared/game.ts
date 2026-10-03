import { classInfo } from "./classes.js";
export const W = 320,
  H = 56,
  D = 320,
  CHUNK = 16,
  TICK = 1 / 30;
export type Mode = "tdm" | "relay" | "infection";
export type JetMode = "off" | "all" | "pickup" | "modes";
export type Vec = { x: number; y: number; z: number };
export type Input = {
  seq: number;
  forward: number;
  strafe: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  jet: boolean;
  fire: boolean;
  aim: boolean;
  reload: boolean;
  weapon: number;
  place: boolean;
  dig: boolean;
  grenade?: boolean;
  ability?: boolean;
  classId?: number;
};
export const emptyInput = (): Input => ({
  seq: 0,
  forward: 0,
  strafe: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  sprint: false,
  crouch: false,
  jet: false,
  fire: false,
  aim: false,
  reload: false,
  weapon: 0,
  place: false,
  dig: false,
});
export const WEAPONS = [
  {
    name: "Rifle",
    damage: 30,
    interval: 0.24,
    mag: 24,
    reserve: 144,
    reload: 1.7,
    spread: 0.008,
    range: 150,
    pellets: 1,
  },
  {
    name: "SMG",
    damage: 14,
    interval: 0.09,
    mag: 32,
    reserve: 192,
    reload: 1.5,
    spread: 0.026,
    range: 65,
    pellets: 1,
  },
  {
    name: "Shotgun",
    damage: 16,
    interval: 0.85,
    mag: 6,
    reserve: 42,
    reload: 2.2,
    spread: 0.065,
    range: 35,
    pellets: 7,
  },
  {
    name: "Marksman",
    damage: 72,
    interval: 1.05,
    mag: 5,
    reserve: 35,
    reload: 2.4,
    spread: 0.003,
    range: 220,
    pellets: 1,
  },
  {
    name: "Spade",
    damage: 45,
    interval: 0.38,
    mag: 0,
    reserve: 0,
    reload: 0,
    spread: 0,
    range: 4,
    pellets: 1,
  },
  {
    name: "Blocks",
    damage: 0,
    interval: 0.22,
    mag: 0,
    reserve: 0,
    reload: 0,
    spread: 0,
    range: 6,
    pellets: 1,
  },
  {
    name: "Blast launcher",
    damage: 85,
    interval: 1.1,
    mag: 2,
    reserve: 10,
    reload: 2.7,
    spread: 0.012,
    range: 90,
    pellets: 1,
  },
];
export const isFirearm = (weapon: number) => weapon < 4 || weapon === 6;
export type Projectile = Vec & {
  id: number;
  owner: string;
  team: number;
  kind: "grenade" | "rocket";
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
};
export type Body = Vec & {
  vx: number;
  vy: number;
  vz: number;
  ground: boolean;
  fuel: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  classId?: number;
  abilityTime?: number;
};
export type Player = Body & {
  id: string;
  name: string;
  team: number;
  zombie: boolean;
  health: number;
  dead: number;
  kills: number;
  deaths: number;
  blocks: number;
  weapon: number;
  ammo: number[];
  reserve: number[];
  reload: number;
  cooldown: number;
  editCooldown: number;
  protected: number;
  jetpack: boolean;
  input: Input;
  lastSeq: number;
  lastDamage: number;
  nextClass?: number;
  grenades?: number;
  grenadeCooldown?: number;
  abilityCooldown?: number;
  bot?: boolean;
  brain?: {
    nextThink: number;
    lastX: number;
    lastZ: number;
    stuck: number;
    target: string;
    acquired: number;
    lastSeen?: Vec;
    seenAt?: number;
    nextPlan?: number;
    route?: Vec[];
    routeGoal?: Vec;
    side?: number;
    nextStrafe?: number;
  };
  pendingActions?: Partial<Input>;
  epoch?: number;
  commandMode?: boolean;
  commands?: Input[];
  commandSeq?: number;
  movementCredit?: number;
  lastCommandTime?: number;
};
export const palette = [
  0, 0x78ae42, 0x997044, 0x78828a, 0x77503b, 0x467f34, 0xead2a0, 0x259ca8,
  0xd95c39, 0xe4dba9, 0xd2ad53, 0xb58a56, 0xab8261, 0x7b9253, 0xe9f0ed,
  0x8d989c, 0x6d8396, 0x96c5b0, 0xc8cbd0, 0x414d5b, 0xad7149, 0x809881,
];
export const basePosition = (team: number): Vec => ({
  x: team === 0 ? Math.floor(W * 0.2) + 0.5 : W - Math.floor(W * 0.2) - 0.5,
  y: 13.01,
  z: D / 2 + 0.5,
});
export function mapTheme(seed: number) {
  const kind = ((seed % 3) + 3) % 3;
  return kind === 0
    ? {
        kind,
        name: "Sunbreak Escarpment",
        sky: 0xf0c899,
        fog: 0xe3bd91,
        grass: 10,
        earth: 11,
        rock: 12,
        leaf: 13,
        water: 0x399ead,
      }
    : kind === 2
      ? {
          kind,
          name: "Rimewater Highlands",
          sky: 0xb9ddf1,
          fog: 0xd1e6ee,
          grass: 14,
          earth: 15,
          rock: 16,
          leaf: 17,
          water: 0x438da8,
        }
      : {
          kind,
          name: "Copperwater Frontier",
          sky: 0x94ccec,
          fog: 0xb5d5da,
          grass: 1,
          earth: 2,
          rock: 3,
          leaf: 5,
          water: 0x318aa2,
        };
}
export const nextMapSeed = (seed: number, round: number) =>
  (Math.imul(seed ^ round, 1664525) + 1013904223) >>> 0;
export const idx = (x: number, y: number, z: number) => x + W * (z + D * y);
export class World {
  blocks = new Uint8Array(W * H * D);
  edits = new Map<number, number>();
  constructor(
    public seed = 7231,
    generate = true,
  ) {
    if (generate) this.generate();
  }
  get(x: number, y: number, z: number) {
    return x < 0 || z < 0 || x >= W || z >= D || y < 0
      ? 3
      : y >= H
        ? 0
        : this.blocks[idx(x | 0, y | 0, z | 0)];
  }
  set(x: number, y: number, z: number, v: number) {
    if (x < 0 || x >= W || y <= 0 || y >= H || z < 0 || z >= D) return false;
    const i = idx(x, y, z);
    this.blocks[i] = v;
    this.edits.set(i, v);
    return true;
  }
  generate() {
    let n = this.seed >>> 0;
    const rnd = () => {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      return n / 4294967296;
    };
    const phase = rnd() * 6,
      theme = mapTheme(this.seed);
    const center = D / 2;
    const raw = (x: number, y: number, z: number, v: number) => {
      if (x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D)
        this.blocks[idx(x, y, z)] = v;
    };
    const fill = (
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      v: number,
    ) => {
      for (let xx = x; xx < x + sx; xx++)
        for (let zz = z; zz < z + sz; zz++)
          for (let yy = y; yy < y + sy; yy++) raw(xx, yy, zz, v);
    };
    const heights = new Uint8Array(W * D);
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++) {
        let height = Math.floor(
          12 +
            4.8 *
              Math.sin((x * 0.044 * 192) / W + phase) *
              Math.cos((z * 0.051 * 192) / D) +
            3.1 * Math.sin((z * 0.083 * 192) / D + (x * 0.025 * 192) / W),
        );
        const river = center + Math.sin(x * 0.039) * 7;
        if (Math.abs(z - river) < 5 && x > W * 0.25 && x < W * 0.75) height = 5;
        for (const team of [0, 1]) {
          const b = basePosition(team);
          const distance = Math.hypot(x - b.x, z - b.z);
          if (distance < 22) height = 12;
        }
        // A gentle central crossing and two flanking routes keep objectives reachable on foot.
        if (Math.abs(z - center) < 4) height = 12;
        heights[x + W * z] = height;
        for (let y = 0; y <= height; y++)
          raw(
            x,
            y,
            z,
            y === 0
              ? 3
              : y === height
                ? theme.grass
                : y > height - 3
                  ? theme.earth
                  : theme.rock,
          );
      }
    for (const team of [0, 1]) {
      const b = basePosition(team),
        bx = Math.floor(b.x),
        bz = Math.floor(b.z);
      // Original open-front outposts with parapets and corner watch posts.
      for (let x = bx - 8; x <= bx + 8; x++)
        for (let z = bz - 10; z <= bz + 10; z++)
          if (
            (x === bx - 8 || x === bx + 8 || z === bz - 10 || z === bz + 10) &&
            Math.abs(z - bz) > 3
          )
            fill(x, 13, z, 1, 4, 1, 6);
      for (const zz of [bz - 10, bz + 8]) {
        fill(bx - 7, 13, zz, 4, 7, 3, theme.rock);
        fill(bx - 7, 20, zz, 4, 1, 3, 6);
        for (let h = 0; h < 7; h++) fill(bx - 3 + h, 13 + h, zz, 1, 1, 3, 6);
      }
    }
    // A bridge courtyard, ruined arches and climbable observation terraces, all destructible.
    const landmark = (x: number, z: number) => {
      let floor = heights[x + W * z] + 1;
      for (let dx = -12; dx <= 12; dx++)
        for (let dz = -12; dz <= 12; dz++)
          floor = Math.max(floor, heights[x + dx + W * (z + dz)] + 1);
      fill(x - 12, 1, z - 12, 25, floor - 1, 25, theme.rock);
      for (let step = 0; step < 8; step++)
        fill(
          x - 12 + step,
          floor + step,
          z - 12 + step,
          25 - 2 * step,
          1,
          25 - 2 * step,
          theme.kind === 0 ? 10 : theme.rock,
        );
      fill(x - 3, floor + 8, z - 3, 7, 1, 7, 6);
      for (const dx of [-8, 8]) {
        fill(x + dx, floor, z - 10, 2, 13, 2, 6);
        fill(x + dx, floor, z + 8, 2, 13, 2, 6);
        fill(x + dx, floor + 12, z - 8, 2, 2, 16, 6);
      }
      // Open galleries and irregular broken pillars frame the observation terraces.
      // Broad silhouettes remain readable at mobile draw distances.
      for (const side of [-1, 1]) {
        for (let along = -18; along <= 18; along += 6) {
          const px = x + along,
            pz = z + side * 19;
          fill(px - 1, 1, pz - 1, 3, floor, 3, theme.rock);
          const intact = (along + side + this.seed) % 3 !== 0;
          fill(px, floor + 1, pz, 1, intact ? 7 : 3, 1, 6);
          fill(px - 1, floor + (intact ? 8 : 4), pz - 1, 3, 1, 3, 6);
          if (intact && along < 18)
            fill(px, floor + 9, pz, 7, 1, 1, theme.rock);
        }
      }
    };
    landmark(W / 2, Math.floor(D * 0.22));
    landmark(W / 2, Math.floor(D * 0.78));
    // Extra flanking shelters make the larger perimeter useful for maneuvering.
    for (const [x, z] of [
      [Math.floor(W * 0.32), Math.floor(D * 0.32)],
      [Math.floor(W * 0.68), Math.floor(D * 0.68)],
    ]) {
      const floor = heights[x + W * z] + 1;
      for (let dx = -6; dx <= 6; dx++)
        for (let dz = -6; dz <= 6; dz++) {
          fill(x + dx, 1, z + dz, 1, floor - 1, 1, theme.rock);
          if ((Math.abs(dx) === 6 || Math.abs(dz) === 6) && Math.abs(dz) > 1)
            fill(x + dx, floor, z + dz, 1, 3, 1, 6);
        }
    }
    // Continuous three-wide trenches: cut AND fill, including low river crossings.
    for (const x0 of [Math.floor(W * 0.29), Math.floor(W * 0.7)])
      for (let z = Math.floor(D * 0.2); z < D * 0.8; z++) {
        const x = x0 + Math.floor(Math.sin(z * 0.055 + phase) * 3);
        for (let xx = x - 1; xx <= x + 3; xx++) {
          fill(xx, 1, z, 1, 8, 1, theme.earth);
          if (xx >= x && xx < x + 3) {
            for (let y = 9; y < H; y++) raw(xx, y, z, 0);
            // Restore the main road as a bridge, with a clear tunnel beneath it.
            if (Math.abs(z - center) < 4) raw(xx, 12, z, 6);
          } else if (Math.abs(z - center) >= 4) {
            fill(xx, 9, z, 1, 2, 1, theme.earth);
            raw(xx, 11, z, theme.grass);
          }
        }
        // Regular side stairs provide exits without requiring a jetpack.
        if (z % 32 < 3 && Math.abs(z - center) > 16) {
          for (let step = 0; step < 14; step++) {
            const xx = x - 1 - step;
            const floor = Math.min(8 + step, Math.max(8, heights[xx + W * z]));
            fill(xx, 1, z, 1, floor, 1, theme.earth);
            for (let y = floor + 1; y < H; y++) raw(xx, y, z, 0);
          }
        }
      }
    for (let t = 0; t < Math.floor((W * D) / 194); t++) {
      const x = 5 + Math.floor(rnd() * (W - 10)),
        z = 5 + Math.floor(rnd() * (D - 10));
      if (
        Math.abs(x - Math.floor(W * 0.29)) < 21 ||
        Math.abs(x - Math.floor(W * 0.7)) < 21 ||
        Math.abs(z - center) < 14 ||
        (Math.abs(x - W / 2) < 18 && Math.abs(z - D / 2) > D * 0.2) ||
        [0, 1].some((team) => {
          const b = basePosition(team);
          return Math.hypot(x - b.x, z - b.z) < 24;
        })
      )
        continue;
      const y = heights[x + W * z];
      if (y < 8) continue;
      if (theme.kind === 0 && rnd() < 0.6) {
        const height = 3 + Math.floor(rnd() * 7);
        fill(x, y + 1, z, 2, height, 2, 13);
        fill(x - 2, y + 3, z, 2, 1, 1, 13);
        continue;
      }
      const trunk = 5 + Math.floor(rnd() * 4);
      fill(x, y + 1, z, 1, trunk, 1, 4);
      for (let h = 0; h < 5; h++) {
        const radius =
          theme.kind === 2
            ? Math.max(1, 4 - Math.floor(h * 0.7))
            : h < 3
              ? 3
              : 2;
        for (let dx = -radius; dx <= radius; dx++)
          for (let dz = -radius; dz <= radius; dz++)
            if (Math.abs(dx) + Math.abs(dz) <= radius + 1)
              raw(
                x + dx,
                y + trunk - 2 + h,
                z + dz,
                theme.kind === 2 && h === 4 ? 14 : theme.leaf,
              );
      }
    }
  }
  encode() {
    const runs: number[] = [];
    let last = this.blocks[0],
      count = 0;
    for (const v of this.blocks) {
      if (v === last && count < 65535) count++;
      else {
        runs.push(last, count);
        last = v;
        count = 1;
      }
    }
    runs.push(last, count);
    return runs;
  }
  decode(runs: number[]) {
    let i = 0;
    for (let j = 0; j < runs.length; j += 2) {
      this.blocks.fill(runs[j], i, i + runs[j + 1]);
      i += runs[j + 1];
    }
  }
}
export function direction(yaw: number, pitch: number): Vec {
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}
export const eye = (p: Body): Vec => ({
  x: p.x,
  y: p.y + (p.crouch ? 1.0 : 1.55),
  z: p.z,
});
export function collides(
  w: World,
  x: number,
  y: number,
  z: number,
  height = 1.75,
) {
  for (let xx = Math.floor(x - 0.29); xx <= Math.floor(x + 0.29); xx++)
    for (let zz = Math.floor(z - 0.29); zz <= Math.floor(z + 0.29); zz++)
      for (
        let yy = Math.floor(y + 0.02);
        yy <= Math.floor(y + height - 0.02);
        yy++
      )
        if (w.get(xx, yy, zz)) return true;
  return false;
}
export function move(
  p: Body,
  i: Input,
  w: World,
  dt: number,
  zombie = false,
  hasJet = true,
) {
  p.yaw = i.yaw;
  p.pitch = i.pitch;
  const crouch = i.crouch && !zombie;
  if (!crouch && p.crouch && collides(w, p.x, p.y, p.z)) {
  } else p.crouch = crouch;
  const h = p.crouch ? 1.15 : 1.75;
  let f = i.forward,
    s = i.strafe,
    l = Math.hypot(f, s);
  if (l > 1) {
    f /= l;
    s /= l;
  }
  const speed =
    (zombie ? 6.4 : 5.1) *
    (zombie ? 1 : classInfo(p.classId).speed) *
    (!zombie && p.classId === 1 && (p.abilityTime ?? 0) > 0 ? 1.25 : 1) *
    (i.sprint ? 1.4 : 1) *
    (p.crouch ? 0.5 : 1) *
    (i.aim ? 0.65 : 1);
  p.abilityTime = Math.max(0, (p.abilityTime ?? 0) - dt);
  const tx = (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) * speed,
    tz = (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) * speed;
  const a = Math.min(1, dt * (p.ground ? 18 : 6));
  p.vx += (tx - p.vx) * a;
  p.vz += (tz - p.vz) * a;
  if (i.jump && p.ground) {
    p.vy = zombie ? 9 : 7.2;
    p.ground = false;
  }
  if (i.jet && hasJet && p.fuel > 0) {
    p.vy = Math.min(9, p.vy + 27 * dt);
    p.fuel = Math.max(0, p.fuel - 30 * dt);
  } else p.fuel = Math.min(100, p.fuel + (p.ground ? 23 : 10) * dt);
  p.vy = Math.max(-28, p.vy - 20 * dt);
  for (const axis of ["x", "z"] as const) {
    const step = p[axis === "x" ? "vx" : "vz"] * dt;
    p[axis] += step;
    if (collides(w, p.x, p.y, p.z, h)) {
      if (p.ground && !collides(w, p.x, p.y + 1, p.z, h)) {
        p.y += 1;
      } else {
        p[axis] -= step;
        p[axis === "x" ? "vx" : "vz"] = 0;
        if (zombie && i.jump) p.vy = Math.max(p.vy, 7);
      }
    }
  }
  const step = p.vy * dt;
  p.y += step;
  p.ground = false;
  if (collides(w, p.x, p.y, p.z, h)) {
    p.y -= step;
    if (p.vy < 0) p.ground = true;
    p.vy = 0;
  }
}
// Exact voxel DDA; the previous empty cell is the placement target.
export function ray(w: World, o: Vec, d: Vec, max: number) {
  let x = Math.floor(o.x),
    y = Math.floor(o.y),
    z = Math.floor(o.z),
    previous = { x, y, z };
  const sx = d.x >= 0 ? 1 : -1,
    sy = d.y >= 0 ? 1 : -1,
    sz = d.z >= 0 ? 1 : -1;
  const dx = Math.abs(1 / d.x),
    dy = Math.abs(1 / d.y),
    dz = Math.abs(1 / d.z);
  let tx = d.x ? ((d.x >= 0 ? x + 1 : x) - o.x) / d.x : Infinity,
    ty = d.y ? ((d.y >= 0 ? y + 1 : y) - o.y) / d.y : Infinity,
    tz = d.z ? ((d.z >= 0 ? z + 1 : z) - o.z) / d.z : Infinity;
  let distance = 0;
  while (distance <= max) {
    if (w.get(x, y, z)) return { x, y, z, previous, distance };
    previous = { x, y, z };
    if (tx < ty && tx < tz) {
      x += sx;
      distance = tx;
      tx += dx;
    } else if (ty < tz) {
      y += sy;
      distance = ty;
      ty += dy;
    } else {
      z += sz;
      distance = tz;
      tz += dz;
    }
  }
  return null;
}
export function rayBox(o: Vec, d: Vec, min: Vec, max: Vec) {
  let near = 0,
    far = Infinity;
  for (const a of ["x", "y", "z"] as const) {
    if (Math.abs(d[a]) < 1e-8) {
      if (o[a] < min[a] || o[a] > max[a]) return Infinity;
      continue;
    }
    let t1 = (min[a] - o[a]) / d[a],
      t2 = (max[a] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) return Infinity;
  }
  return near;
}

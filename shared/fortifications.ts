import { World, Vec, W, H, D, basePosition } from "./game.js";
type Cell = [number, number, number];
const cover: Cell[] = [],
  ramp: Cell[] = [],
  shelter: Cell[] = [],
  bridge: Cell[] = [];
for (let z = 0; z < 8; z++) {
  for (let x = -1; x <= 2; x++) bridge.push([x, 0, z]);
  bridge.push([-1, 1, z], [2, 1, z]);
}
for (let x = -1; x <= 1; x++) for (let y = 0; y < 2; y++) cover.push([x, y, 0]);
for (let z = 0; z < 4; z++)
  for (let x = -1; x <= 1; x++)
    for (let y = 0; y <= z; y++) ramp.push([x, y, z]);
for (let x = -2; x <= 2; x++)
  for (let z = 0; z < 4; z++)
    for (let y = 0; y < 4; y++) {
      const doorway = z === 0 && Math.abs(x) <= 1 && y < 3;
      const window =
        (Math.abs(x) === 2 && z === 2 && y === 2) ||
        (z === 3 && x === 0 && y === 2);
      if (
        (Math.abs(x) === 2 || z === 0 || z === 3 || y === 3) &&
        !doorway &&
        !window
      )
        shelter.push([x, y, z]);
    }
export const KITS = [
  {
    name: "Single block",
    cells: [[0, 0, 0]] as Cell[],
    description: "Precise terrain building",
  },
  {
    name: "Field cover",
    cells: cover,
    description: "Three-wide, two-high cover wall",
  },
  {
    name: "Assault ramp",
    cells: ramp,
    description: "Four-step, three-wide access ramp",
  },
  {
    name: "Field shelter",
    cells: shelter,
    description: "Open doorway, firing ports and a roof",
  },
  {
    name: "Span bridge",
    cells: bridge,
    description: "Eight-block crossing with protective rails",
  },
] as const;
export const kitCells = (id: number, anchor: Vec, quarter: number): Vec[] => {
  const q = ((quarter % 4) + 4) % 4;
  return KITS[id].cells.map(([x, y, z]) => ({
    x: anchor.x + (q === 0 ? x : q === 1 ? -z : q === 2 ? -x : z),
    y: anchor.y + y,
    z: anchor.z + (q === 0 ? z : q === 1 ? x : q === 2 ? -z : -x),
  }));
};
export const buildQuarter = (yaw: number) =>
  Math.round(-yaw / (Math.PI / 2)) + 2;
export function validateKit(
  world: World,
  cells: Vec[],
  players: ({ dead: number; crouch?: boolean } & Vec)[],
  origin: Vec,
  blocks: number,
) {
  const fail = (reason: string) => ({
    valid: false,
    reason,
    cost: cells.length,
  });
  if (blocks < cells.length) return fail("Not enough blocks");
  for (const b of cells) {
    if (
      b.x < 1 ||
      b.x >= W - 1 ||
      b.z < 1 ||
      b.z >= D - 1 ||
      b.y <= 0 ||
      b.y >= H - 1
    )
      return fail("Outside build area");
    if (
      Math.hypot(
        b.x + 0.5 - origin.x,
        b.y + 0.5 - origin.y,
        b.z + 0.5 - origin.z,
      ) > 12
    )
      return fail("Too far away");
    if (world.get(b.x, b.y, b.z)) return fail("Terrain blocks placement");
    if (
      [0, 1].some((t) => {
        const base = basePosition(t);
        return (
          b.y < 15 && Math.hypot(b.x + 0.5 - base.x, b.z + 0.5 - base.z) < 3
        );
      })
    )
      return fail("Protected foundation");
    if (
      players.some(
        (v) =>
          v.dead <= 0 &&
          b.x + 1 > v.x - 0.33 &&
          b.x < v.x + 0.33 &&
          b.z + 1 > v.z - 0.33 &&
          b.z < v.z + 0.33 &&
          b.y + 1 > v.y &&
          b.y < v.y + (v.crouch ? 1.15 : 1.75),
      )
    )
      return fail("Player in build area");
  }
  if (
    !cells.some((b) =>
      [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ].some(([x, y, z]) => world.get(b.x + x, b.y + y, b.z + z)),
    )
  )
    return fail("Needs terrain support");
  return { valid: true, reason: "Ready to build", cost: cells.length };
}

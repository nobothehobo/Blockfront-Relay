import { W, D, H, idx, mapLayout, basePosition, Vec } from "./game.js";

export const LAYOUT_VERSION = 1;
export type BattleRoute = { name: string; points: Vec[] };
const routeCache = new Map<number, Int16Array>();
export function sectorSites(seed: number): [number, number][] {
  const layout = mapLayout(seed);
  return layout === 3
    ? [
        [112, 140],
        [160, 180],
        [208, 176],
      ]
    : layout === 2
      ? [
          [112, 138],
          [160, 144],
          [208, 180],
        ]
      : layout === 1
        ? [
            [118, 135],
            [160, 144],
            [216, 184],
          ]
        : [
            [112, 136],
            [160, 144],
            [208, 184],
          ];
}

// Original battlefield plans. Route geometry is shared with NPC strategic steering;
// these are traversable approaches, not invisible restrictions on human movement.
export function battleRoutes(seed: number): BattleRoute[] {
  const layout = mapLayout(seed);
  const p = (x: number, z: number, y = 13): Vec => ({
    x: x + 0.5,
    y: y + 0.01,
    z: z + 0.5,
  });
  const start = basePosition(0),
    end = basePosition(1);
  const north =
    layout === 3
      ? [
          start,
          p(64, 140),
          p(112, 140),
          p(112, 112),
          p(208, 112),
          p(208, 140),
          p(255, 140),
          end,
        ]
      : layout === 2
        ? [
            start,
            p(84, 138),
            p(112, 138),
            p(120, 128),
            p(132, 122, 18),
            p(188, 122, 18),
            p(188, 132),
            p(188, 140),
            p(236, 140),
            end,
          ]
        : layout === 1
          ? [
              start,
              p(82, 135),
              p(118, 135),
              p(142, 122),
              p(178, 122),
              p(202, 135),
              p(236, 135),
              end,
            ]
          : [
              start,
              p(84, 136),
              p(112, 136),
              p(124, 112),
              p(196, 112),
              p(188, 140),
              p(236, 140),
              end,
            ];
  const south = north.map((v) => ({ ...v, z: D - v.z }));
  // Identical base endpoints avoid tiny discontinuities where routes meet.
  south[0] = start;
  south[south.length - 1] = end;
  const middle =
    layout === 3
      ? [
          start,
          p(80, 160),
          p(96, 140),
          p(128, 140),
          p(148, 180),
          p(176, 180),
          p(208, 176),
          p(232, 176),
          end,
        ]
      : [
          start,
          p(84, 160),
          p(104, 184),
          p(128, 184),
          p(144, 144),
          p(176, 144),
          p(192, 184),
          p(216, 184),
          p(236, 160),
          end,
        ];
  return [
    {
      name:
        layout === 3
          ? "North alleys"
          : layout === 2
            ? "High pass"
            : layout === 1
              ? "North causeway"
              : "Foundry north",
      points: north,
    },
    { name: "Broken center", points: middle },
    {
      name:
        layout === 3
          ? "South alleys"
          : layout === 2
            ? "South ridge"
            : layout === 1
              ? "South causeway"
              : "Foundry south",
      points: south,
    },
  ];
}

// One bounded generation-time field, cached by seed. Values are standing heights.
export function routeField(seed: number) {
  const cached = routeCache.get(seed);
  if (cached) return cached;
  const field = new Int16Array(W * D),
    nearest = new Float32Array(W * D).fill(Infinity);
  for (const route of battleRoutes(seed))
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.ceil(length * 2);
      for (let step = 0; step <= steps; step++) {
        const t = step / steps,
          x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t,
          y = a.y + (b.y - a.y) * t;
        for (let xx = Math.floor(x) - 4; xx <= Math.floor(x) + 4; xx++)
          for (let zz = Math.floor(z) - 4; zz <= Math.floor(z) + 4; zz++) {
            if (xx < 1 || xx >= W - 1 || zz < 1 || zz >= D - 1) continue;
            const distance = Math.hypot(xx + 0.5 - x, zz + 0.5 - z),
              k = xx + W * zz;
            if (distance > 3.6 || distance >= nearest[k]) continue;
            nearest[k] = distance;
            field[k] = Math.round(y);
          }
      }
    }
  if (routeCache.size >= 8) routeCache.delete(routeCache.keys().next().value!);
  routeCache.set(seed, field);
  return field;
}

// Generation only. Runtime edits continue to go through Room's validation/deltas.
export function applyBattleLayout(blocks: Uint8Array, seed: number) {
  const layout = mapLayout(seed),
    field = routeField(seed);
  const set = (x: number, y: number, z: number, v: number) => {
    if (x >= 0 && x < W && z >= 0 && z < D && y > 0 && y < H)
      blocks[idx(x, y, z)] = v;
  };
  const fill = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    v: number,
  ) => {
    for (let xx = x; xx < x + w; xx++)
      for (let zz = z; zz < z + d; zz++)
        for (let yy = y; yy < y + h; yy++) set(xx, yy, zz, v);
  };
  // Offset entrances on north/south faces; there is no direct east-west firing tunnel.
  const width = layout === 3 ? 23 : layout === 1 ? 21 : 17,
    depth = layout === 3 ? 23 : layout === 2 ? 25 : 19;
  const left = 160 - Math.floor(width / 2),
    front = 160 - Math.floor(depth / 2),
    height = layout === 2 ? 11 : 9;
  const wall = layout === 3 ? 27 : layout === 2 ? 15 : 3,
    trim = layout === 3 ? 22 : 6;
  fill(left, 1, front, width, 12, depth, wall);
  fill(left, 13, front, width, height, depth, wall);
  fill(left + 1, 13, front + 1, width - 2, height - 1, depth - 2, 0);
  fill(left + 2, 13, front, 3, 3, 1, 0);
  fill(left + width - 5, 13, front + depth - 1, 3, 3, 1, 0);
  fill(left, 13 + height, front, width, 1, depth, trim);
  for (const dx of [0, width - 1])
    for (const dz of [0, depth - 1])
      fill(left + dx, 14 + height, front + dz, 1, 2, 1, trim);
  if (layout === 3) {
    fill(156, 23, 159, 9, 6, 2, 28);
    for (let x = 157; x < 164; x++) set(x, 24 + (x % 3), 159, x % 2 ? 23 : 24);
  }
  // Destructible, substantial base approach screens: attackers have to choose a
  // side, climb or breach instead of seeing the opposing flag from spawn.
  for (const x of layout === 3 ? [96, 224] : [104, 216]) {
    fill(x - 2, 1, 147, 5, 12, 27, wall);
    fill(x - 2, 13, 147, 5, 7, 27, wall);
    fill(x - 2, 20, 147, 5, 1, 27, trim);
    // Small recesses offer firing cover without perforating the whole screen.
    fill(x - 3, 13, 150, 1, 2, 5, trim);
    fill(x + 3, 13, 166, 1, 2, 5, trim);
  }
  // Carve last, so vegetation, foundations and decorative walls cannot close the
  // planned pedestrian routes. Covered interiors/viaduct roofs stay overhead.
  const phase =
    (((Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0) / 4294967296) * 6;
  for (let z = 1; z < D - 1; z++)
    for (let x = 1; x < W - 1; x++) {
      const feet = field[x + W * z];
      if (!feet) continue;
      const trench =
        layout !== 3 &&
        z >= 64 &&
        z < 256 &&
        [Math.floor(W * 0.29), Math.floor(W * 0.7)].some((x0) => {
          const tx = x0 + Math.floor(Math.sin(z * 0.055 + phase) * 3);
          return x >= tx && x < tx + 3;
        });
      for (let y = 1; y < feet; y++)
        if (!trench || y <= 8 || y === feet - 1) set(x, y, z, wall);
      for (let y = feet; y < feet + 3; y++) set(x, y, z, 0);
      set(x, feet - 1, z, layout === 3 ? 26 : layout === 2 ? 15 : 6);
    }
  // A low, wide pocket surrounds the central landmark for close fights and builds.
  // Unlike the route field this does not flatten the whole battlefield.
  for (const z of [front - 7, front + depth + 6]) {
    fill(152, 1, z - 2, 17, 12, 5, wall);
    fill(152, 13, z - 2, 17, 3, 5, 0);
  }
  // Foot-accessible objective courts, connected to the same strategic lanes.
  for (const [cx, cz] of sectorSites(seed)) {
    const feet = field[cx + W * cz];
    for (let x = cx - 7; x <= cx + 7; x++)
      for (let z = cz - 7; z <= cz + 7; z++) {
        if (Math.hypot(x - cx, z - cz) > 7) continue;
        for (let y = 1; y < feet; y++) set(x, y, z, wall);
        for (let y = feet; y < feet + 3; y++) set(x, y, z, 0);
        set(x, feet - 1, z, layout === 3 ? 26 : 6);
      }
  }
}

export function nearestRoutePoint(route: BattleRoute, position: Vec) {
  let best = { segment: 0, t: 0, distance: Infinity, point: route.points[0] };
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((position.x - a.x) * dx + (position.z - a.z) * dz) /
          (dx * dx + dz * dz),
      ),
    );
    const point = {
      x: a.x + dx * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + dz * t,
    };
    const distance = Math.hypot(position.x - point.x, position.z - point.z);
    if (distance < best.distance) best = { segment: i - 1, t, distance, point };
  }
  return best;
}

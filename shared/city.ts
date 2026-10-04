import { W, H, D, idx, basePosition } from "./game.js";

export const CITY_SEED = 7259;
export const citySeed = (seed: number) => (seed >>> 0) % 12 === 11;
export const CITY_LIGHTS = [48, 112, 208, 272].flatMap(x =>
  [148, 172].map(z => ({ x, y: 17, z })));
// An original destructible street grid, not a reconstruction of a reference map.
export function generateCity(blocks: Uint8Array, seed: number) {
  const set = (x: number, y: number, z: number, value: number) => {
    if (x >= 0 && x < W && z >= 0 && z < D && y >= 0 && y < H)
      blocks[idx(x, y, z)] = value;
  };
  const fill = (x: number, y: number, z: number, w: number, h: number, d: number, value: number) => {
    for (let xx = x; xx < x + w; xx++) for (let zz = z; zz < z + d; zz++)
      for (let yy = y; yy < y + h; yy++) set(xx, yy, zz, value);
  };
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    fill(x, 0, z, 1, 12, 1, 3);
    const road = Math.abs(z - 160) < 9 || [64, 160, 255].some(cx => Math.abs(x - cx) < 6);
    set(x, 12, z, road ? 26 : 27);
    if (Math.abs(z - 160) === 8) set(x, 12, z, 22);
    if (z === 160 && x % 12 < 5) set(x, 12, z, 30);
  }
  for (const cx of [40, 88, 136, 184, 232, 280]) for (const cz of [48, 96, 128, 192, 224, 272]) {
    const height = 12 + ((cx * 7 + cz * 13 + seed) % 5) * 4;
    const wall = (cx + cz) % 3 ? 27 : 29;
    for (let x = cx - 9; x <= cx + 9; x++) for (let z = cz - 9; z <= cz + 9; z++) {
      for (let y = 13; y <= 13 + height; y++) {
        const edge = Math.abs(x - cx) === 9 || Math.abs(z - cz) === 9;
        const door = Math.abs(z - cz) === 9 && Math.abs(x - cx) <= 2 && y < 17;
        const window = y % 5 >= 1 && y % 5 <= 3 && (Math.abs(x - cx) % 4 <= 1 || Math.abs(z - cz) % 4 <= 1);
        if (y === 13 + height) set(x, y, z, 27);
        else if (edge && !door) set(x, y, z, window ? ((x + z + seed) % 4 ? 28 : 25) : wall);
      }
    }
    for (const z of [cz - 9, cz + 9]) {
      fill(cx - 9, 18, z, 19, 1, 1, cz < 160 ? 22 : 23);
      fill(cx - 9, 13 + height, z, 19, 1, 1, cz < 160 ? 22 : 23);
    }
    // A covered entrance and abstract voxel marquees frame the pedestrian route.
    const front = cz < 160 ? cz + 10 : cz - 10;
    fill(cx - 4, 17, front, 9, 1, 2, 27);
    fill(cx - 3, 19, front, 7, 5, 1, 28);
    for (let i = 0; i < 5; i++) {
      set(cx - 2 + i, 20 + (i % 3), front, (cz < 160 ? 22 : 23));
      set(cx - 2 + i, 22, front, 24);
    }
  }
  for (const x of [116, 204]) {
    fill(x - 2, 13, 147, 3, 8, 3, 27);
    fill(x - 2, 13, 170, 3, 8, 3, 27);
    fill(x - 2, 21, 147, 3, 1, 26, 27);
    // Leave the stair landing open: a continuous rail here would make a two-block
    // obstacle exactly where the stairs reach the deck.
    fill(x - 2, 22, 150, 1, 1, 23, 22);
    // Supported staircase from the sidewalk to each skybridge.
    for (let step = 0; step < 9; step++) fill(x - 11 + step, 13, 147, 1, step + 1, 3, 27);
  }
  for (const lamp of CITY_LIGHTS) {
    fill(lamp.x, 13, lamp.z, 1, 4, 1, 27);
    fill(lamp.x - 1, 17, lamp.z - 1, 3, 1, 3, 24);
  }
  for (const team of [0, 1]) {
    const b = basePosition(team), x = Math.floor(b.x), z = Math.floor(b.z);
    fill(x - 8, 12, z - 6, 17, 1, 13, 27);
    for (const side of [-1, 1]) {
      fill(x - 8, 13, z + side * 6, 17, 2, 1, 27);
      fill(x - 8, 15, z + side * 6, 17, 1, 1, team === 0 ? 22 : 23);
    }
    // Spawn and supply areas deliberately have no roofs or decorative obstacles.
    for (let xx = x - 5; xx <= x + 5; xx++) for (let zz = z - 3; zz <= z + 9; zz++)
      fill(xx, 13, zz, 1, 6, 1, 0);
  }
}

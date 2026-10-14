import { W, H, D, idx } from "./game.js";
// Original Foundry fieldworks. Generation only; every cell remains editable.
export function foundryFieldworks(blocks: Uint8Array) {
  const set = (x: number, y: number, z: number, v: number) => {
    if (x > 0 && x < W - 1 && z > 0 && z < D - 1 && y > 0 && y < H)
      blocks[idx(x, y, z)] = v;
  };
  const column = (x: number, z: number, feet: number, headroom = 3) => {
    for (let y = 1; y < feet; y++) set(x, y, z, 3);
    for (let y = feet; y < feet + headroom; y++) set(x, y, z, 0);
    set(x, feet - 1, z, 6);
  };
  // Two recognizable covered depots, with offset doors and accessible flanks.
  for (const [cx, cz] of [
    [132, 104],
    [188, 216],
  ]) {
    for (let x = cx - 5; x <= cx + 5; x++)
      for (let z = cz - 5; z <= cz + 5; z++) {
        column(x, z, 13, 7);
        if (Math.abs(x - cx) === 5 || Math.abs(z - cz) === 5)
          for (let y = 13; y < 19; y++) set(x, y, z, y === 17 ? 6 : 3);
        set(x, 19, z, 6);
      }
    for (const [doorX, doorZ] of [
      [cx - 3, cz + 5],
      [cx + 3, cz - 5],
    ])
      for (let x = doorX - 1; x <= doorX + 1; x++)
        for (let y = 13; y < 17; y++) set(x, y, doorZ, 0);
    // Link the near entrance back to the existing northern/southern route.
    const joinZ = cz < 160 ? 112 : 208;
    const doorZ = cz < 160 ? cz + 5 : cz - 5;
    const doorX = cz < 160 ? cx - 3 : cx + 3;
    for (let z = Math.min(joinZ, doorZ); z <= Math.max(joinZ, doorZ); z++)
      for (let x = doorX - 1; x <= doorX + 1; x++) column(x, z, 13, 4);
  }
  // Three-wide stepped bypasses under the approach screens. Players can breach
  // walls above or use the covered route; floor/ceiling clearance is intentional.
  for (const [cx, cz] of [
    [104, 153],
    [216, 168],
  ])
    for (let x = cx - 7; x <= cx + (cx === 104 ? 7 : 10); x++) {
      // West screen uses two ramps; east screen connects at trench height to
      // the existing winding trench instead of filling its foot/head space.
      const feet =
        9 + Math.max(0, cx === 104 ? Math.abs(x - cx) - 3 : cx - 3 - x);
      for (let z = cz - 1; z <= cz + 1; z++) column(x, z, feet);
    }
}

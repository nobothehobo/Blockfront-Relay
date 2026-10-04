import { World, W, H, D, idx } from "../shared/game.js";
const steps = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export function neighboringCells(x: number, y: number, z: number) {
  return steps
    .filter(
      ([a, b, c]) =>
        x + a > 0 &&
        x + a < W - 1 &&
        y + b > 0 &&
        y + b < H &&
        z + c > 0 &&
        z + c < D - 1,
    )
    .map(([a, b, c]) => idx(x + a, y + b, z + c));
}
export function coordinates(i: number) {
  return [i % W, Math.floor(i / (W * D)), Math.floor(i / W) % D] as const;
}
// Conservative bounded connectivity: uncertain/large components remain intact.
// No per-voxel physics and no whole-world flood fill during a frame.
export function detachedComponent(
  world: World,
  seed: number,
  budget = 2048,
): number[] {
  if (!world.blocks[seed]) return [];
  const queue = [seed],
    seen = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (cursor >= budget) return [];
    const [x, y, z] = coordinates(queue[cursor]);
    if (y <= 1 || x <= 1 || z <= 1 || x >= W - 2 || z >= D - 2) return [];
    for (const n of neighboringCells(x, y, z))
      if (world.blocks[n] && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return queue;
}

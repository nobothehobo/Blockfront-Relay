import { World } from "../shared/game.js";

// Sample air beside the exposed face. Sampling the solid side darkens even a
// featureless floor and can turn a greedy quad into an enormous false gradient.
export function faceOcclusion(
  world: World,
  x: number,
  y: number,
  z: number,
  axis: number,
  sign: number,
) {
  const cell = [x, y, z],
    u = (axis + 1) % 3,
    v = (axis + 2) % 3;
  cell[axis] += sign;
  const occupied = (du: number, dv: number) => {
    cell[u] += du;
    cell[v] += dv;
    const solid = world.get(cell[0], cell[1], cell[2]) ? 1 : 0;
    cell[u] -= du;
    cell[v] -= dv;
    return solid;
  };
  let packed = 0;
  for (let corner = 0; corner < 4; corner++) {
    const su = corner === 1 || corner === 2 ? 1 : -1;
    const sv = corner >= 2 ? 1 : -1;
    const a = occupied(su, 0),
      b = occupied(0, sv);
    const shade = a && b ? 3 : a + b + occupied(su, sv);
    packed |= shade << (corner * 2);
  }
  return packed;
}

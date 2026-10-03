import { World, W, D, H, Vec, basePosition } from "./game.js";
export type Sector = {
  name: string;
  pos: Vec;
  owner: number;
  progress: number;
  capturing: number;
  contested: boolean;
};
export type SupplyStation = { team: number; pos: Vec };
export function sectors(world: World): Sector[] {
  return [
    [W * 0.32, D * 0.38],
    [W * 0.5, D * 0.5],
    [W * 0.68, D * 0.62],
  ].map(([x, z], index) => {
    x = Math.floor(x) + 0.5;
    z = Math.floor(z) + 0.5;
    let y = H - 3;
    while (y > 1 && !world.get(Math.floor(x), y - 1, Math.floor(z))) y--;
    return {
      name: ["A", "B", "C"][index],
      pos: { x, y, z },
      owner: -1,
      progress: 0,
      capturing: -1,
      contested: false,
    };
  });
}
export const supplies = (): SupplyStation[] =>
  [0, 1].map((team) => {
    const b = basePosition(team);
    return { team, pos: { ...b, z: b.z + 7 } };
  });

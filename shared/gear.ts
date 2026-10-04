import type { Vec } from "./game.js";
export type GearKind = "medbox" | "beacon" | "charge" | "mine";
export type FieldGear = Vec & {
  id: number;
  owner: string;
  team: number;
  kind: GearKind;
  life: number;
  armed: number;
};
export const GEAR = [
  {
    kind: "medbox",
    name: "Medbox",
    charges: 2,
    description: "An injured teammate collects 30 health",
  },
  {
    kind: "beacon",
    name: "Lumen",
    charges: 3,
    description: "A short-lived light for tunnels and defenses",
  },
  {
    kind: "charge",
    name: "Charge",
    charges: 2,
    description: "A visible demolition charge with a 3-second fuse",
  },
  {
    kind: "mine",
    name: "Mine",
    charges: 2,
    description:
      "Arms after 2 seconds; trips on nearby enemies with clear sight",
  },
  {
    kind: "beacon",
    name: "Lumen",
    charges: 3,
    description: "Illuminate a newly drilled route",
  },
] as const;
export const gearInfo = (id?: number) => GEAR[id ?? 0] ?? GEAR[0];

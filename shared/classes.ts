// Original roles. Base rifle remains compatible with existing sandbox rooms/tools.
export const CLASSES = [
  {
    name: "Trailguard",
    primary: 0,
    health: 100,
    speed: 1,
    blocks: 80,
    grenades: 2,
    ability: "Rally",
    cooldown: 22,
    description: "Rifle · restore nearby teammates' health",
  },
  {
    name: "Skirmisher",
    primary: 1,
    health: 90,
    speed: 1.12,
    blocks: 65,
    grenades: 2,
    ability: "Surge",
    cooldown: 20,
    description: "SMG · faster movement and a short speed burst",
  },
  {
    name: "Sapper",
    primary: 6,
    health: 115,
    speed: 0.92,
    blocks: 140,
    grenades: 3,
    ability: "Resupply",
    cooldown: 30,
    description: "Shotgun / launcher · breach terrain and replenish supplies",
  },
  {
    name: "Surveyor",
    primary: 3,
    health: 85,
    speed: 1,
    blocks: 55,
    grenades: 1,
    ability: "Focus",
    cooldown: 20,
    description: "Marksman · temporarily steadier firearm accuracy",
  },
  {
    name: "Delver",
    primary: 2,
    health: 105,
    speed: 1.04,
    blocks: 120,
    grenades: 2,
    ability: "Bore",
    cooldown: 12,
    description: "Shotgun · fast digging, short tunnel drill and lumen beacons",
  },
] as const;
export const validClass = (value: unknown) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < CLASSES.length;
export const classInfo = (id?: number) => CLASSES[validClass(id) ? id! : 0];
export const CLASS_WEAPONS = [
  [0, 2, 4, 5],
  [1, 4, 5],
  [2, 4, 5, 6],
  [3, 0, 4, 5],
  [2, 4, 5],
] as const;
export const allowedWeapon = (
  id: number | undefined,
  weapon: number,
  specialists: boolean,
) =>
  !specialists ||
  (CLASS_WEAPONS[validClass(id) ? id! : 0] as readonly number[]).includes(
    weapon,
  );
export const classPrimary = (id: number | undefined, specialists: boolean) =>
  specialists && id === 2 ? 2 : classInfo(id).primary;

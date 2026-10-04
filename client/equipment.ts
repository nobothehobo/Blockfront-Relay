import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Part = [number, number, number, number, number, number, number];
// Original silhouettes in arm-local coordinates. One solid draw per held item.
export function createEquipment(weapon: number, team: number, role = 0) {
  const steel = 0x52656c,
    dark = 0x233740,
    wood = 0x947351;
  const accent = team === 0 ? 0x4fc7bf : 0xe89660;
  const parts: Part[] = [];
  const add = (...p: Part) => parts.push(p);
  if (weapon < 4) {
    const length = [0.34, 0.24, 0.4, 0.4][weapon];
    add(0.12, 0.13, length, 0, 0, -0.13, dark);
    add(0.09, 0.13, 0.2, 0, -0.015, 0.12, wood);
    add(0.05, 0.06, weapon === 3 ? 0.42 : 0.24, 0, 0.025, -0.38, steel);
    add(0.065, 0.085, 0.055, 0, 0.025, weapon === 3 ? -0.6 : -0.5, dark);
    add(0.07, 0.16, 0.065, 0, -0.12, -0.07, wood);
    add(0.09, 0.07, 0.17, 0, -0.055, -0.31, wood);
    add(0.13, 0.018, 0.04, 0, 0.035, -0.15, accent);
    add(0.025, 0.05, 0.025, 0, 0.08, -0.44, dark);
    add(0.06, 0.028, 0.025, 0, 0.08, -0.1, dark);
    if (weapon === 2) add(0.045, 0.045, 0.34, 0, -0.05, -0.32, steel);
    else add(0.06, weapon === 1 ? 0.21 : 0.14, 0.075, 0, -0.12, -0.2, dark);
    if (weapon === 3) {
      add(0.08, 0.08, 0.23, 0, 0.12, -0.2, dark);
      add(0.06, 0.045, 0.015, 0, 0.12, -0.325, 0x75b8bd);
    }
    if (weapon === 1) add(0.06, 0.055, 0.16, 0, -0.05, -0.32, dark);
  } else if (weapon === 6) {
    add(0.2, 0.2, 0.53, 0, 0, -0.17, 0x607366);
    add(0.22, 0.22, 0.06, 0, 0, -0.46, dark);
    add(0.14, 0.14, 0.01, 0, 0, -0.495, 0x15252d);
    add(0.06, 0.17, 0.06, 0, -0.15, -0.06, wood);
    add(0.22, 0.02, 0.04, 0, 0, -0.28, accent);
    add(0.025, 0.075, 0.11, 0, 0.13, -0.15, dark);
  } else if (weapon === 4 && role === 4) {
    add(0.16, 0.15, 0.28, 0, 0, -0.17, 0xc49550);
    add(0.06, 0.19, 0.07, 0, -0.12, -0.05, dark);
    add(0.085, 0.085, 0.21, 0, 0, -0.4, steel);
    add(0.13, 0.025, 0.035, 0, 0, -0.52, 0xb4c6c2);
  } else if (weapon === 4) {
    add(0.035, 0.45, 0.035, 0, -0.03, -0.16, wood);
    add(0.2, 0.17, 0.035, 0, 0.24, -0.16, steel);
    add(0.14, 0.035, 0.045, 0, 0.33, -0.16, dark);
  } else add(0.2, 0.2, 0.2, 0, 0, -0.23, accent);
  const geometries = parts.map(([w, h, d, x, y, z, hex]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const c = new THREE.Color(hex),
      colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const geometry = mergeGeometries(geometries)!;
  geometries.forEach((g) => g.dispose());
  const item = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.16,
    }),
  );
  item.position.set(-0.12, -0.21, -0.22);
  item.castShadow = true;
  item.userData.weapon = weapon;
  item.userData.parts = parts.length;
  item.userData.muzzle = new THREE.Vector3(
    0,
    0.025,
    weapon === 3 ? -0.65 : weapon === 6 ? -0.51 : -0.55,
  );
  return item;
}

export function setCharacterEquipment(
  group: THREE.Group,
  weapon: number,
  team: number,
  role: number,
) {
  const old = group.userData.gun as THREE.Mesh | undefined;
  if (old?.userData.weapon === weapon) return;
  if (old) {
    old.removeFromParent();
    old.geometry.dispose();
    (old.material as THREE.Material).dispose();
  }
  const item = createEquipment(weapon, team, role);
  group.userData.rig.rightArm.add(item);
  group.userData.gun = item;
}

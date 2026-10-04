import * as THREE from "three";
import type { FieldGear } from "../shared/gear.js";

// Two batched draw calls for all field equipment; only two nearby beacon lights.
export class GearView {
  solid = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.2 }),
    192,
  );
  glow = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    96,
  );
  lights = Array.from(
    { length: 2 },
    () => new THREE.PointLight(0xffd994, 0, 12, 2),
  );
  dummy = new THREE.Object3D();
  color = new THREE.Color();
  constructor(scene: THREE.Scene) {
    for (const mesh of [this.solid, this.glow]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    this.solid.castShadow = this.solid.receiveShadow = true;
    this.lights.forEach((l) => scene.add(l));
  }
  update(
    gear: FieldGear[],
    camera: THREE.Vector3,
    highEffects: boolean,
    time: number,
  ) {
    let n = 0,
      e = 0;
    const piece = (
      g: FieldGear,
      w: number,
      h: number,
      d: number,
      y: number,
      color: number,
      glow = false,
      x = 0,
    ) => {
      const mesh = glow ? this.glow : this.solid;
      this.dummy.position.set(g.x + x, g.y + y, g.z);
      this.dummy.scale.set(w, h, d);
      this.dummy.updateMatrix();
      const index = glow ? e++ : n++;
      mesh.setMatrixAt(index, this.dummy.matrix);
      mesh.setColorAt(index, this.color.setHex(color));
    };
    for (const g of gear.slice(0, 32)) {
      if (Math.hypot(g.x - camera.x, g.z - camera.z) > 100) continue;
      const team = g.team === 0 ? 0x48c5c0 : 0xe69954;
      if (g.kind === "medbox") {
        piece(g, 0.56, 0.27, 0.4, 0.135, 0x405850);
        piece(g, 0.57, 0.04, 0.42, 0.29, team);
        piece(g, 0.07, 0.012, 0.22, 0.32, 0xf3dfb0, true);
        piece(g, 0.22, 0.012, 0.07, 0.32, 0xf3dfb0, true);
      } else if (g.kind === "beacon") {
        piece(g, 0.32, 0.12, 0.32, 0.06, 0x354b52);
        piece(g, 0.12, 0.37, 0.12, 0.28, team);
        piece(g, 0.22, 0.24, 0.22, 0.48, 0xffd78b, true);
        piece(g, 0.3, 0.04, 0.3, 0.62, 0x354b52);
      } else {
        piece(g, g.kind === "mine" ? 0.48 : 0.44, 0.13, 0.4, 0.065, 0x424f50);
        piece(g, 0.26, 0.06, 0.29, 0.16, team);
        piece(
          g,
          0.07,
          0.028,
          0.07,
          0.21,
          g.armed > 0 ? 0xe2d083 : Math.sin(time * 9) > 0 ? 0xff865d : 0x773f30,
          true,
        );
        if (g.kind === "charge") {
          piece(g, 0.07, 0.23, 0.3, 0.115, 0xb37f55, false, -0.17);
          piece(g, 0.07, 0.23, 0.3, 0.115, 0xb37f55, false, 0.17);
        }
      }
    }
    for (const [mesh, count] of [
      [this.solid, n],
      [this.glow, e],
    ] as const) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const distance2 = (g: FieldGear) =>
      (g.x - camera.x) ** 2 + (g.y - camera.y) ** 2 + (g.z - camera.z) ** 2;
    const beacons = highEffects
      ? gear
          .filter(
            (g) =>
              g.kind === "beacon" &&
              Math.hypot(g.x - camera.x, g.y - camera.y, g.z - camera.z) < 22,
          )
          .sort((a, b) => distance2(a) - distance2(b))
          .slice(0, 2)
      : [];
    this.lights.forEach((light, i) => {
      const g = beacons[i];
      light.visible = highEffects;
      light.intensity = g ? 10 : 0;
      if (g) light.position.set(g.x, g.y + 0.8, g.z);
    });
  }
}

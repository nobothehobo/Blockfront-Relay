import * as THREE from "three";
import { World, Player, eye, ray, direction } from "../shared/game.js";
import {
  KITS,
  kitCells,
  buildQuarter,
  validateKit,
} from "../shared/fortifications.js";

// One bounded draw call, shared validation for a useful ghost; server validates again.
export class FortificationView {
  mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.97, 0.97, 0.97),
    new THREE.MeshBasicMaterial({
      color: 0x7ef9cb,
      transparent: true,
      opacity: 0.33,
      depthWrite: false,
    }),
    Math.max(...KITS.map((k) => k.cells.length)),
  );
  dummy = new THREE.Object3D();
  lastUpdate = -1000;
  reason = "Aim at terrain";
  constructor(scene: THREE.Scene) {
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }
  update(
    now: number,
    world: World,
    p: Player | null,
    players: Player[],
    kit: number,
    yaw: number,
    pitch: number,
  ) {
    if (!p || p.dead > 0 || p.zombie || p.weapon !== 5 || kit === 0) {
      this.mesh.count = 0;
      this.reason = "Aim at terrain";
      return;
    }
    if (now - this.lastUpdate < 65) return;
    this.lastUpdate = now;
    const origin = eye(p),
      hit = ray(world, origin, direction(yaw, pitch), 6);
    if (!hit) {
      this.mesh.count = 0;
      this.reason = "Aim at terrain within 6 blocks";
      return;
    }
    const cells = kitCells(kit, hit.previous, buildQuarter(yaw)),
      result = validateKit(
        world,
        cells,
        players.map((v) => (v.id === p.id ? p : v)),
        origin,
        p.blocks,
      );
    this.reason = result.reason;
    (this.mesh.material as THREE.MeshBasicMaterial).color.setHex(
      result.valid ? 0x7ef9cb : 0xff7964,
    );
    for (let i = 0; i < cells.length; i++) {
      const b = cells[i];
      this.dummy.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = cells.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

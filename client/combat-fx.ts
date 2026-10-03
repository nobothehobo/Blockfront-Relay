import * as THREE from "three";
import { Projectile, Vec } from "../shared/game.js";
type Particle = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  total: number;
  size: number;
  smoke: boolean;
  color: THREE.Color;
};
type Tracer = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  age: number;
  length: number;
};
export class CombatFX {
  particles: Particle[] = [];
  tracers: Tracer[] = [];
  projectiles: Projectile[] = [];
  snapshotAt = 0;
  cubes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
    384,
  );
  streaks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.025, 0.025, 1),
    new THREE.MeshBasicMaterial({ color: 0xffdf94 }),
    96,
  );
  ordnance = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
    128,
  );
  dummy = new THREE.Object3D();
  color = new THREE.Color();
  fogColor = new THREE.Color(0xbacbd1);
  shake = 0;
  quality: "low" | "high" = "high";
  constructor(scene: THREE.Scene) {
    for (const mesh of [this.cubes, this.streaks, this.ordnance]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
  }
  clear() {
    this.particles = [];
    this.tracers = [];
    this.projectiles = [];
    this.shake = 0;
  }
  particle(
    pos: Vec,
    vel: Vec,
    size: number,
    life: number,
    color: number,
    smoke = false,
  ) {
    if (this.particles.length >= (this.quality === "high" ? 384 : 96))
      this.particles.shift();
    this.particles.push({
      pos: new THREE.Vector3(pos.x, pos.y, pos.z),
      vel: new THREE.Vector3(vel.x, vel.y, vel.z),
      size,
      life,
      total: life,
      smoke,
      color: new THREE.Color(color),
    });
  }
  shot(origin: Vec, ends: Vec[]) {
    this.particle(origin, { x: 0, y: 0, z: 0 }, 0.2, 0.055, 0xffd181);
    for (const end of ends.slice(0, this.quality === "high" ? 7 : 2)) {
      if (this.tracers.length >= 96) this.tracers.shift();
      const start = new THREE.Vector3(origin.x, origin.y, origin.z),
        finish = new THREE.Vector3(end.x, end.y, end.z);
      this.tracers.push({
        start,
        end: finish,
        age: 0,
        length: start.distanceTo(finish),
      });
    }
  }
  explosion(pos: Vec, camera: THREE.Vector3) {
    this.particle(pos, { x: 0, y: 0.6, z: 0 }, 1.6, 0.2, 0xffd17e);
    for (let n = 0; n < (this.quality === "high" ? 48 : 16); n++) {
      const smoke = n % 3 === 0;
      this.particle(
        pos,
        {
          x: (Math.random() - 0.5) * (smoke ? 3 : 12),
          y: Math.random() * (smoke ? 3 : 9),
          z: (Math.random() - 0.5) * (smoke ? 3 : 12),
        },
        smoke ? 0.8 : 0.12 + Math.random() * 0.13,
        smoke ? 1.8 : 0.7 + Math.random() * 0.6,
        smoke ? 0x6b7172 : n % 2 ? 0xe4b477 : 0xffa550,
        smoke,
      );
    }
    this.shake = Math.max(
      this.shake,
      Math.max(
        0,
        1 - camera.distanceTo(new THREE.Vector3(pos.x, pos.y, pos.z)) / 22,
      ) * 0.16,
    );
  }
  sync(projectiles: Projectile[], now: number) {
    this.projectiles = projectiles;
    this.snapshotAt = now;
  }
  update(now: number, dt: number) {
    this.shake *= Math.exp(-dt * 7);
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i],
        progress = 1 - p.life / p.total;
      if (!p.smoke) p.vel.y -= 12 * dt;
      p.pos.addScaledVector(p.vel, dt);
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(progress * 2, progress * 3, 0);
      this.dummy.scale.setScalar(
        p.size * (p.smoke ? 1 + progress * 2 : 1) * Math.min(1, p.life / 0.16),
      );
      this.dummy.updateMatrix();
      this.cubes.setMatrixAt(i, this.dummy.matrix);
      this.color
        .copy(p.color)
        .lerp(this.fogColor, p.smoke ? progress * 0.7 : progress * 0.25);
      this.cubes.setColorAt(i, this.color);
    }
    this.cubes.count = this.particles.length;
    this.cubes.instanceMatrix.needsUpdate = true;
    if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
    this.tracers = this.tracers.filter((t) => {
      t.age += dt;
      if (t.age * 180 > t.length + 3) {
        this.particle(t.end, { x: 0, y: 1, z: 0 }, 0.08, 0.16, 0xffd391);
        return false;
      }
      return true;
    });
    for (let i = 0; i < this.tracers.length; i++) {
      const t = this.tracers[i],
        head = Math.min(t.length, t.age * 180),
        tail = Math.max(0, head - 2.5),
        d = t.end.clone().sub(t.start).normalize();
      this.dummy.position.copy(t.start).addScaledVector(d, (head + tail) / 2);
      this.dummy.lookAt(t.end);
      this.dummy.scale.set(1, 1, Math.max(0.04, head - tail));
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(i, this.dummy.matrix);
    }
    this.streaks.count = this.tracers.length;
    this.streaks.instanceMatrix.needsUpdate = true;
    const age = Math.min(0.25, Math.max(0, (now - this.snapshotAt) / 1000));
    this.ordnance.count = Math.min(128, this.projectiles.length);
    for (let i = 0; i < this.ordnance.count; i++) {
      const p = this.projectiles[i];
      this.dummy.position.set(
        p.x + p.vx * age,
        p.y + p.vy * age - (p.kind === "grenade" ? 7 * age * age : 0),
        p.z + p.vz * age,
      );
      if (p.kind === "rocket")
        this.dummy.lookAt(
          this.dummy.position.clone().add(new THREE.Vector3(p.vx, p.vy, p.vz)),
        );
      else this.dummy.rotation.set(now * 0.004, now * 0.003, 0);
      this.dummy.scale.set(0.2, 0.2, p.kind === "rocket" ? 0.6 : 0.2);
      this.dummy.updateMatrix();
      this.ordnance.setMatrixAt(i, this.dummy.matrix);
      this.ordnance.setColorAt(
        i,
        this.color.setHex(
          p.kind === "rocket" ? 0xffbb6b : p.team === 0 ? 0x45c1be : 0xe99056,
        ),
      );
      if (
        p.kind === "rocket" &&
        Math.floor(now / 90) !== Math.floor((now - dt * 1000) / 90)
      )
        this.particle(
          this.dummy.position,
          { x: 0, y: 0.4, z: 0 },
          0.18,
          0.45,
          0xc4c4b0,
          true,
        );
    }
    this.ordnance.instanceMatrix.needsUpdate = true;
    if (this.ordnance.instanceColor)
      this.ordnance.instanceColor.needsUpdate = true;
  }
}

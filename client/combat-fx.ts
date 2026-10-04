import * as THREE from "three";
import { Projectile, Vec, ShotImpact, palette } from "../shared/game.js";
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
  impact?: ShotImpact;
};
type Casing = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotation: THREE.Vector3;
  life: number;
  shell: boolean;
};
export class CombatFX {
  particles: Particle[] = [];
  tracers: Tracer[] = [];
  projectiles: Projectile[] = [];
  snapshotAt = 0;
  impactsPresented = 0;
  ejections = 0;
  lastImpact: ShotImpact | null = null;
  casings: Casing[] = [];
  casingPool: Casing[] = Array.from({ length: 64 }, () => ({
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    rotation: new THREE.Vector3(),
    life: 0,
    shell: false,
  }));
  brass = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xc69d5c,
      roughness: 0.48,
      metalness: 0.45,
    }),
    64,
  );
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
  // A single billboard batch gives smoke soft volume; hard debris stays cubic.
  smoke = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `varying vec2 puff; varying vec3 tint; void main(){puff=uv; tint=instanceColor; vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.); center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz)); gl_Position=projectionMatrix*center;}`,
      fragmentShader: `varying vec2 puff; varying vec3 tint; void main(){float r=length(puff-.5); float a=(1.-smoothstep(.12,.5,r))*.52; if(a<.015) discard; vec3 c=tint*(.88+(1.-puff.y)*.16); gl_FragColor=vec4(c,a);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }`,
    }),
    96,
  );
  dummy = new THREE.Object3D();
  color = new THREE.Color();
  direction = new THREE.Vector3();
  fogColor = new THREE.Color(0xbacbd1);
  shake = 0;
  quality: "low" | "high" = "high";
  constructor(scene: THREE.Scene) {
    this.smoke.setColorAt(0, this.color);
    for (const mesh of [
      this.cubes,
      this.streaks,
      this.ordnance,
      this.brass,
      this.smoke,
    ]) {
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
    this.impactsPresented = this.ejections = 0;
    this.lastImpact = null;
    for (const casing of this.casings) this.casingPool.push(casing);
    this.casings.length = 0;
    this.brass.count = 0;
    this.smoke.count =
      this.cubes.count =
      this.streaks.count =
      this.ordnance.count =
        0;
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
  eject(origin: Vec, dir: Vec, weapon: number) {
    if (weapon < 0 || weapon > 3) return;
    this.ejections++;
    if (this.casings.length >= (this.quality === "high" ? 64 : 16))
      this.casingPool.push(this.casings.shift()!);
    const c = this.casingPool.pop()!;
    const sideX = -dir.z,
      sideZ = dir.x;
    c.pos.set(
      origin.x + dir.x * 0.5 + sideX * 0.18,
      origin.y + dir.y * 0.5 - 0.18,
      origin.z + dir.z * 0.5 + sideZ * 0.18,
    );
    c.vel.set(
      sideX * (2 + Math.random()) + dir.x * 0.4,
      1.4 + Math.random() * 0.6,
      sideZ * (2 + Math.random()) + dir.z * 0.4,
    );
    c.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    c.life = this.quality === "low" ? 0.42 : 0.7;
    c.shell = weapon === 2;
    this.casings.push(c);
  }
  impact(hit: ShotImpact) {
    this.impactsPresented++;
    this.lastImpact = hit;
    const color =
      hit.kind === "player" ? 0xc4edf0 : (palette[hit.block] ?? 0x939a94);
    const count = this.quality === "high" ? 6 : 2;
    for (let i = 0; i < count; i++)
      this.particle(
        {
          x: hit.pos.x + hit.normal.x * 0.035,
          y: hit.pos.y + hit.normal.y * 0.035,
          z: hit.pos.z + hit.normal.z * 0.035,
        },
        {
          x: hit.normal.x * (1 + Math.random() * 2) + (Math.random() - 0.5),
          y: hit.normal.y * 2 + Math.random() * 1.4,
          z: hit.normal.z * (1 + Math.random() * 2) + (Math.random() - 0.5),
        },
        hit.kind === "player" ? 0.045 : 0.06 + Math.random() * 0.04,
        0.18 + Math.random() * 0.16,
        color,
      );
    if (hit.kind === "terrain" && this.quality === "high")
      this.particle(
        hit.pos,
        { x: hit.normal.x * 0.2, y: 0.25, z: hit.normal.z * 0.2 },
        0.15,
        0.3,
        color,
        true,
      );
  }
  shot(origin: Vec, ends: Vec[], impacts: ShotImpact[] = []) {
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
        impact: impacts.find(
          (h) =>
            Math.hypot(h.pos.x - end.x, h.pos.y - end.y, h.pos.z - end.z) <
            0.001,
        ),
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
    let solids = 0,
      puffs = 0;
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
      this.color
        .copy(p.color)
        .lerp(this.fogColor, p.smoke ? progress * 0.7 : progress * 0.25);
      if (p.smoke) {
        if (puffs < 96) {
          this.smoke.setMatrixAt(puffs, this.dummy.matrix);
          this.smoke.setColorAt(puffs++, this.color);
        }
      } else {
        this.cubes.setMatrixAt(solids, this.dummy.matrix);
        this.cubes.setColorAt(solids++, this.color);
      }
    }
    this.cubes.count = solids;
    this.smoke.count = puffs;
    this.smoke.instanceMatrix.needsUpdate = true;
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
    this.cubes.instanceMatrix.needsUpdate = true;
    if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
    this.tracers = this.tracers.filter((t) => {
      t.age += dt;
      if (t.age * 180 > t.length + 3) {
        if (t.impact) this.impact(t.impact);
        return false;
      }
      return true;
    });
    for (let i = 0; i < this.tracers.length; i++) {
      const t = this.tracers[i],
        head = Math.min(t.length, t.age * 180),
        tail = Math.max(0, head - 2.5),
        d = this.direction.copy(t.end).sub(t.start).normalize();
      this.dummy.position.copy(t.start).addScaledVector(d, (head + tail) / 2);
      this.dummy.lookAt(t.end);
      this.dummy.scale.set(1, 1, Math.max(0.04, head - tail));
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(i, this.dummy.matrix);
    }
    this.streaks.count = this.tracers.length;
    this.streaks.instanceMatrix.needsUpdate = true;
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.casings.splice(i, 1);
        this.casingPool.push(c);
        continue;
      }
      c.vel.y -= 14 * dt;
      c.pos.addScaledVector(c.vel, dt);
      c.rotation.x += dt * 12;
      c.rotation.z += dt * 8;
    }
    this.casings.forEach((c, i) => {
      this.dummy.position.copy(c.pos);
      this.dummy.rotation.set(c.rotation.x, c.rotation.y, c.rotation.z);
      this.dummy.scale.set(
        c.shell ? 0.045 : 0.025,
        c.shell ? 0.045 : 0.025,
        c.shell ? 0.1 : 0.065,
      );
      this.dummy.updateMatrix();
      this.brass.setMatrixAt(i, this.dummy.matrix);
    });
    this.brass.count = this.casings.length;
    this.brass.instanceMatrix.needsUpdate = true;
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

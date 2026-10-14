import * as THREE from "three";
import { H, W, D, World, ray } from "../shared/game.js";
import type { Vec } from "../shared/game.js";

export function raysEnabled(preset: string, effects: string, enabled: boolean) {
  return enabled && preset !== "mobile" && effects !== "low";
}

// Five short voxel traces, at most 6.25 Hz. Stop at the real terrain bounds so
// the world's synthetic collision boundary doesn't hide sunlight at map edges.
export function sunlightVisibility(world: World, origin: Vec, sun: Vec) {
  if (sun.y <= 0.04) return 0;
  let visible = 0;
  for (const [dx, dz] of [
    [0, 0],
    [-0.018, 0],
    [0.018, 0],
    [0, -0.018],
    [0, 0.018],
  ]) {
    const x = sun.x + dx,
      y = sun.y,
      z = sun.z + dz;
    const length = Math.hypot(x, y, z);
    const direction = { x: x / length, y: y / length, z: z / length };
    const exit = Math.min(
      160,
      Math.max(0, (H - origin.y) / direction.y),
      direction.x > 0
        ? (W - origin.x) / direction.x
        : direction.x < 0
          ? -origin.x / direction.x
          : Infinity,
      direction.z > 0
        ? (D - origin.z) / direction.z
        : direction.z < 0
          ? -origin.z / direction.z
          : Infinity,
    );
    if (!ray(world, origin, direction, Math.max(0, exit - 0.001))) visible++;
  }
  return visible / 5;
}

// A restrained lens/shaft overlay, not an expensive volumetric raymarch.
// One quad, no render target, depth copy, bloom or additional shadow map.
export class SunRays {
  material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      sunScreen: { value: new THREE.Vector2(0.5, 0.5) },
      aspect: { value: 1 },
      strength: { value: 0 },
      time: { value: 0 },
      tint: { value: new THREE.Color(0xffd19a) },
    },
    vertexShader: `varying vec2 screenUv;
      void main(){screenUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader: `uniform vec2 sunScreen; uniform float aspect; uniform float strength; uniform float time;
      uniform vec3 tint; varying vec2 screenUv;
      void main(){
        vec2 p=(screenUv-sunScreen)*vec2(aspect,1.0);
        float distance=length(p), angle=atan(p.y,p.x);
        float beams=pow(.5+.5*sin(angle*31.0+sin(angle*7.0+time*.025)*2.1),10.0);
        beams+=pow(.5+.5*sin(angle*17.0-1.4),18.0)*.35;
        float envelope=exp(-distance*2.8)*smoothstep(.025,.14,distance)*(1.0-smoothstep(.75,1.6,distance));
        float halo=exp(-distance*14.0)*.22;
        float alpha=clamp((beams*envelope+halo)*strength*.055,0.0,.075);
        gl_FragColor=vec4(tint,alpha);
        #include <colorspace_fragment>
      }`,
  });
  mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
  visibility = 0;
  nextCheck = 0;
  private targetVisibility = 0;
  private wasEnabled = false;
  private seed = -1;
  private lastEye = new THREE.Vector3(Infinity, Infinity, Infinity);
  private sunDirection = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private projected = new THREE.Vector3();
  constructor() {
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1200;
    this.mesh.visible = false;
  }
  update(
    world: World,
    camera: THREE.PerspectiveCamera,
    sun: Vec,
    day: number,
    enabled: boolean,
    now: number,
    dt: number,
  ) {
    const u = this.material.uniforms;
    if (!enabled || day < 0.01 || sun.y <= 0.04) {
      this.mesh.visible = false;
      u.strength.value = 0;
      this.wasEnabled = false;
      this.visibility = this.targetVisibility = 0;
      return;
    }
    camera.updateWorldMatrix(true, false);
    this.sunDirection.set(sun.x, sun.y, sun.z).normalize();
    camera.getWorldDirection(this.forward);
    if (this.forward.dot(this.sunDirection) <= 0.05) {
      this.mesh.visible = false;
      u.strength.value = 0;
      this.wasEnabled = false;
      return;
    }
    this.projected
      .copy(camera.position)
      .addScaledVector(this.sunDirection, 180)
      .project(camera);
    const edge = Math.max(
      Math.abs(this.projected.x),
      Math.abs(this.projected.y),
    );
    if (edge > 1.8) {
      this.mesh.visible = false;
      u.strength.value = 0;
      this.wasEnabled = false;
      return;
    }
    const reset =
      !this.wasEnabled ||
      this.seed !== world.seed ||
      this.lastEye.distanceToSquared(camera.position) > 9;
    if (reset || now >= this.nextCheck) {
      this.targetVisibility = sunlightVisibility(
        world,
        camera.position,
        this.sunDirection,
      );
      if (reset) this.visibility = this.targetVisibility;
      this.lastEye.copy(camera.position);
      this.nextCheck = now + 160;
      this.seed = world.seed;
    }
    this.wasEnabled = true;
    this.visibility +=
      (this.targetVisibility - this.visibility) *
      (1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * 12));
    const viewportFade = 1 - THREE.MathUtils.smoothstep(edge, 1, 1.8);
    const elevationFade = THREE.MathUtils.smoothstep(sun.y, 0.04, 0.22);
    u.strength.value = this.visibility * day * viewportFade * elevationFade;
    u.sunScreen.value.set(
      this.projected.x * 0.5 + 0.5,
      this.projected.y * 0.5 + 0.5,
    );
    u.aspect.value = camera.aspect;
    u.time.value = now / 1000;
    this.mesh.visible = u.strength.value > 0.005;
  }
}

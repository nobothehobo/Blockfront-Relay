import * as THREE from "three";
import { CITY_LIGHTS, CITY_NEON_LIGHTS, citySeed } from "../shared/city.js";
import { World } from "../shared/game.js";

// Fixed light budget: two warm lamps and two colored signs, all shadowless.
export class NeonView {
  lights = [0, 1].map(() => new THREE.PointLight(0xffc98c, 0, 22, 2));
  signLights = [0, 1].map(() => new THREE.PointLight(0xffffff, 0, 24, 2));
  glowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { tint: { value: new THREE.Color(0xffc482) } },
    vertexShader: `varying vec2 glowUv;
      void main(){glowUv=uv;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
      center.xy+=position.xy;gl_Position=projectionMatrix*center;}`,
    fragmentShader: `uniform vec3 tint; varying vec2 glowUv;
      void main(){vec2 p=glowUv-.5;float radius=length(p);
      float glow=exp(-radius*radius*30.0)*(1.0-smoothstep(.32,.5,radius));
      float cross=exp(-abs(p.x)*80.0)*exp(-abs(p.y)*10.0)+exp(-abs(p.y)*80.0)*exp(-abs(p.x)*10.0);
      gl_FragColor=vec4(tint,min(.28,glow*.20+cross*.035));
      #include <colorspace_fragment>
      }`,
  });
  glows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    this.glowMaterial,
    CITY_LIGHTS.length,
  );
  private matrix = new THREE.Matrix4();
  nextUpdate = 0;
  constructor(scene: THREE.Scene) {
    [...this.lights, ...this.signLights].forEach((light) => scene.add(light));
    this.glows.count = 0;
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 20;
    this.glows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.glows);
  }
  update(world: World, position: THREE.Vector3, effects: boolean, now: number) {
    const enabled = citySeed(world.seed) && effects;
    for (const light of [...this.lights, ...this.signLights])
      light.visible = enabled;
    this.glows.visible = enabled;
    if (!enabled) {
      this.glows.count = 0;
      this.nextUpdate = 0;
      return;
    }
    if (now < this.nextUpdate) return;
    this.nextUpdate = now + 250;
    const intact = CITY_LIGHTS.filter((p) => world.get(p.x, p.y, p.z) === 24);
    this.glows.count = 0;
    for (const p of intact) {
      if (Math.hypot(p.x - position.x, p.z - position.z) > 52) continue;
      this.matrix.makeTranslation(p.x + 0.5, p.y + 0.5, p.z + 0.5);
      this.glows.setMatrixAt(this.glows.count++, this.matrix);
    }
    this.glows.instanceMatrix.needsUpdate = true;
    const near = intact
      .sort(
        (a, b) =>
          (a.x - position.x) ** 2 +
          (a.z - position.z) ** 2 -
          ((b.x - position.x) ** 2 + (b.z - position.z) ** 2),
      )
      .slice(0, 2);
    const signs = CITY_NEON_LIGHTS.filter(
      (p) => world.get(p.x, p.y, p.z) === p.block,
    )
      .sort(
        (a, b) =>
          Math.hypot(a.x - position.x, a.y - position.y, a.z - position.z) -
          Math.hypot(b.x - position.x, b.y - position.y, b.z - position.z),
      )
      .slice(0, 2);
    this.signLights.forEach((light, i) => {
      const p = signs[i];
      light.intensity =
        p &&
        Math.hypot(p.x - position.x, p.y - position.y, p.z - position.z) < 32
          ? 65
          : 0;
      if (p) {
        light.color.setHex(p.color);
        light.position.set(p.x + 0.5, p.y + 0.5, p.z + 0.5 + p.facing * 0.8);
      }
    });
    this.lights.forEach((light, i) => {
      const p = near[i];
      light.intensity =
        p && Math.hypot(p.x - position.x, p.z - position.z) < 22 ? 42 : 0;
      if (p) light.position.set(p.x + 0.5, p.y - 0.4, p.z + 0.5);
    });
  }
}

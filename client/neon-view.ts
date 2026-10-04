import * as THREE from "three";
import { CITY_LIGHTS, citySeed } from "../shared/city.js";
import { World } from "../shared/game.js";

// Emissive voxels work on all presets. Only two nearby, shadowless lamps add light.
export class NeonView {
  lights = [0, 1].map(() => new THREE.PointLight(0xffc98c, 0, 14, 2));
  nextUpdate = 0;
  constructor(scene: THREE.Scene) { this.lights.forEach(light => scene.add(light)); }
  update(world: World, position: THREE.Vector3, effects: boolean, now: number) {
    const enabled = citySeed(world.seed) && effects;
    for (const light of this.lights) light.visible = enabled;
    if (!enabled || now < this.nextUpdate) return;
    this.nextUpdate = now + 250;
    const near = CITY_LIGHTS.filter(p => world.get(p.x, p.y, p.z) === 24)
      .sort((a, b) => (a.x-position.x)**2+(a.z-position.z)**2 - ((b.x-position.x)**2+(b.z-position.z)**2))
      .slice(0, 2);
    this.lights.forEach((light, i) => {
      const p = near[i];
      light.intensity = p && Math.hypot(p.x-position.x, p.z-position.z) < 22 ? 18 : 0;
      if (p) light.position.set(p.x + .5, p.y - .4, p.z + .5);
    });
  }
}

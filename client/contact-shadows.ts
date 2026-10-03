import * as THREE from "three";
import { World, Player } from "../shared/game.js";
export class ContactShadows {
  material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec2 point; void main(){point=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 point; void main(){float alpha=(1.0-smoothstep(.0,.5,length(point-.5)))*.3;gl_FragColor=vec4(.025,.055,.065,alpha);}`,
  });
  mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    this.material,
    32,
  );
  transform = new THREE.Object3D();
  constructor() {
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }
  update(world: World, players: Player[], enabled: boolean, localId: string) {
    this.mesh.visible = enabled;
    if (!enabled) return;
    let count = 0;
    for (const p of players) {
      if (p.id === localId || p.dead > 0 || count >= 32) continue;
      let y = Math.floor(p.y - 0.02);
      while (
        y > 0 &&
        p.y - y < 10 &&
        !world.get(Math.floor(p.x), y, Math.floor(p.z))
      )
        y--;
      if (p.y - y >= 10) continue;
      this.transform.position.set(p.x, y + 1.015, p.z);
      this.transform.rotation.set(-Math.PI / 2, 0, 0);
      this.transform.scale.setScalar(Math.max(0.35, 1 - (p.y - y - 1) * 0.08));
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(count++, this.transform.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

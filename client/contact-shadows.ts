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
  update(
    world: World,
    players: Player[],
    enabled: boolean,
    localId: string,
    presented?: ReadonlyMap<string, { group: THREE.Object3D }>,
  ) {
    this.mesh.visible = enabled;
    if (!enabled) return;
    let count = 0;
    for (const p of players) {
      if (p.id === localId || p.dead > 0 || count >= 32) continue;
      const group = presented?.get(p.id)?.group;
      if (group && !group.visible) continue;
      const body = group?.position ?? p;
      let y = Math.floor(body.y - 0.02);
      while (
        y > 0 &&
        body.y - y < 10 &&
        !world.get(Math.floor(body.x), y, Math.floor(body.z))
      )
        y--;
      if (body.y - y >= 10) continue;
      this.transform.position.set(body.x, y + 1.015, body.z);
      this.transform.rotation.set(-Math.PI / 2, 0, 0);
      this.transform.scale.setScalar(
        Math.max(0.35, 1 - (body.y - y - 1) * 0.08),
      );
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(count++, this.transform.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

import * as THREE from "three";
import { createCharacter } from "./character.js";
import { classInfo } from "../shared/classes.js";

// Match the trigger hand to the actual grip, then point the support arm at the
// fore-end. Equipment defaults are for the match animation, not this still pose.
export function poseMenuSoldier(actor: THREE.Group) {
  const rig = actor.userData.rig;
  const gun = actor.userData.gun as THREE.Mesh;
  const hand = new THREE.Vector3(0, -0.63, 0.02);
  const grip = new THREE.Vector3(0, -0.12, -0.07);
  const forwardGrip = new THREE.Vector3(0, -0.055, -0.31);
  const shoulder = rig.rightArm.position.clone().add(rig.torso.position);
  const target = new THREE.Vector3(0.22, 1, -0.57);
  rig.rightArm.quaternion.setFromUnitVectors(
    hand.clone().normalize(),
    target.sub(shoulder).normalize(),
  );
  const orientation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.1, 1.7, 0),
  );
  gun.quaternion.copy(rig.rightArm.quaternion).invert().multiply(orientation);
  gun.position.copy(hand).sub(grip.clone().applyQuaternion(gun.quaternion));
  actor.updateMatrixWorld(true);
  const support = actor.worldToLocal(gun.localToWorld(forwardGrip));
  const leftShoulder = rig.leftArm.position.clone().add(rig.torso.position);
  rig.leftArm.quaternion.setFromUnitVectors(
    hand.clone().normalize(),
    support.sub(leftShoulder).normalize(),
  );
}

// A display-only field soldier uses the real class model, outside match state.
export class MenuScene {
  readonly group = new THREE.Group();
  private actor: THREE.Group | null = null;
  private role = -1;
  private readonly reducedMotion = matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  constructor(camera: THREE.PerspectiveCamera) {
    camera.add(this.group);
    const concrete = new THREE.MeshStandardMaterial({
      color: 0x69715b,
      roughness: 1,
    });
    const edge = new THREE.MeshStandardMaterial({
      color: 0x394838,
      roughness: 0.95,
    });
    for (const [w, h, d, y, material] of [
      [1.9, 0.15, 1.35, -0.17, edge],
      [1.7, 0.12, 1.15, -0.035, concrete],
    ] as const) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      block.position.y = y;
      this.group.add(block);
    }
  }

  update(
    camera: THREE.PerspectiveCamera,
    classId: number,
    now: number,
    visible: boolean,
  ) {
    this.group.visible = visible && camera.aspect > 1;
    if (!this.group.visible) return;
    if (this.role !== classId) {
      this.actor?.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
        }
        if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      });
      this.actor?.removeFromParent();
      this.actor = createCharacter({
        id: "menu-soldier",
        team: 0,
        zombie: false,
        classId,
        weapon: classInfo(classId).primary,
      });
      this.actor.rotation.y = Math.PI + 0.28;
      this.actor.traverse((object) => {
        if (object instanceof THREE.Mesh)
          object.castShadow = object.receiveShadow = false;
      });
      const rig = this.actor.userData.rig;
      poseMenuSoldier(this.actor);
      rig.leftLeg.rotation.z = 0.035;
      rig.rightLeg.rotation.z = -0.035;
      this.group.add(this.actor);
      this.role = classId;
    }
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 7;
    this.group.position.set(
      halfHeight * camera.aspect * 0.49,
      -halfHeight * 0.62,
      -7,
    );
    this.group.scale.setScalar(halfHeight * 0.57);
    if (this.actor && !this.reducedMotion) {
      this.actor.rotation.y = Math.PI + 0.28 + Math.sin(now * 0.00025) * 0.075;
      this.actor.userData.rig.torso.rotation.x = Math.sin(now * 0.0012) * 0.008;
      this.actor.userData.rig.head.rotation.y = Math.sin(now * 0.00045) * 0.04;
    }
  }
}

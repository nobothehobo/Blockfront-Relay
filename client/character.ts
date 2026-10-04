import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
type Appearance = {
  id: string;
  team: number;
  zombie: boolean;
  classId?: number;
};
export const zombieVariant = (id: string) =>
  [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % 3;
// Original cube-built anatomy. Explicit bone ownership keeps equipment on its limb.
export function createCharacter(p: Appearance) {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const team = p.team === 0 ? 0x319d9d : 0xc9653d;
  const dark = 0x283a42,
    cream = 0xcbbb8f,
    skin = 0xbd9674;
  let pieces = 0;
  const part = (
    bone: number,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    hex: number,
    glow = 0,
  ) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    const count = g.attributes.position.count,
      color = new THREE.Color(hex);
    const colors = new Float32Array(count * 3),
      indexes = new Uint16Array(count * 4),
      weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      colors.set([color.r, color.g, color.b], i * 3);
      indexes[i * 4] = bone;
      weights[i * 4] = 1;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indexes, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    g.setAttribute(
      "emission",
      new THREE.Float32BufferAttribute(new Float32Array(count).fill(glow), 1),
    );
    geometries.push(g);
    pieces++;
  };
  const root = new THREE.Bone(),
    torso = new THREE.Bone(),
    head = new THREE.Bone(),
    leftLeg = new THREE.Bone(),
    rightLeg = new THREE.Bone(),
    leftArm = new THREE.Bone(),
    rightArm = new THREE.Bone();
  torso.position.y = 0.95;
  root.add(torso);
  head.position.y = 0.5;
  torso.add(head);
  leftLeg.position.set(-0.18, 0.74, 0);
  rightLeg.position.set(0.18, 0.74, 0);
  root.add(leftLeg, rightLeg);
  leftArm.position.set(-0.4, 0.4, -0.08);
  rightArm.position.set(0.4, 0.4, -0.08);
  torso.add(leftArm, rightArm);
  const bones = [root, torso, head, leftLeg, rightLeg, leftArm, rightArm];
  const role = p.classId ?? 0,
    variant = zombieVariant(p.id);
  if (p.zombie) {
    const flesh = [0x99a773, 0x849b86, 0xafad7f][variant],
      cloth = [0x4a5f50, 0x5c5960, 0x465b67][variant];
    part(1, variant === 1 ? 0.71 : 0.57, 0.62, 0.4, 0, 1.04, 0.04, cloth);
    // Root-owned hips keep the waist connected while the torso hunches.
    part(0, variant === 1 ? 0.61 : 0.53, 0.2, 0.32, 0, 0.73, 0.015, cloth);
    part(2, 0.45, 0.43, 0.42, 0.035, 1.66, -0.035, flesh);
    part(2, 0.35, 0.17, 0.43, 0.06, 1.47, -0.09, 0x6c7460);
    part(2, 0.3, 0.12, 0.025, 0.035, 1.52, -0.325, 0x292b30);
    for (const x of [-0.1, 0.035, 0.15])
      part(2, 0.055, 0.045, 0.033, x, 1.55, -0.345, 0xd5ca9e);
    part(2, 0.07, 0.045, 0.033, -0.09, 1.71, -0.264, 0xf3cb57, 0.75);
    part(2, 0.08, 0.035, 0.033, 0.15, 1.69, -0.264, 0xf3cb57, 0.75);
    part(2, 0.17, 0.055, 0.025, -0.1, 1.76, -0.27, 0x526252);
    part(2, 0.19, 0.05, 0.025, 0.15, 1.75, -0.27, 0x526252);
    // Uneven hair, torn sleeves and exposed forearms distinguish infected silhouettes.
    for (const x of [-0.16, 0, 0.16])
      part(
        2,
        0.13,
        0.11 + (x === 0 ? 0.06 : 0),
        0.3,
        x,
        1.87,
        0.04,
        variant === 1 ? 0x53504c : 0x3b5148,
      );
    for (const [x, bone] of [
      [-0.4, 5],
      [0.4, 6],
    ]) {
      part(bone, 0.23, 0.29, 0.23, x, 1.18, -0.07, cloth);
      part(bone, 0.17, 0.4, 0.19, x, 0.89, -0.1, flesh);
      part(bone, 0.22, 0.14, 0.2, x, 0.66, -0.12, flesh);
      for (const offset of [-0.07, 0, 0.07])
        part(bone, 0.034, 0.15, 0.04, x + offset, 0.55, -0.2, 0xc5b894);
    }
    for (const [x, bone] of [
      [-0.18, 3],
      [0.18, 4],
    ]) {
      part(bone, 0.22, 0.49, 0.24, x, 0.44, 0, cloth);
      part(bone, 0.17, 0.23, 0.2, x, 0.16, 0.01, flesh);
      part(bone, 0.22, 0.1, 0.34, x, 0.06, -0.08, 0x717d66);
    }
    for (let i = 0; i < 4; i++)
      part(
        1,
        0.27,
        0.055,
        0.035,
        0.04,
        0.98 + i * 0.08,
        -0.19,
        i % 2 ? flesh : 0x747d66,
      );
    part(1, 0.11, 0.22, 0.035, -0.19, 1.07, -0.19, team);
    if (variant === 1) {
      part(1, 0.8, 0.16, 0.42, 0, 1.35, 0.04, 0x72816b);
      part(2, 0.18, 0.13, 0.1, 0.13, 1.6, -0.22, flesh);
    }
  } else {
    const vest = role === 2 ? 0x42515b : role === 3 ? 0x50614b : team;
    part(
      1,
      role === 2 ? 0.7 : role === 1 ? 0.53 : 0.62,
      0.65,
      0.4,
      0,
      1.05,
      0,
      vest,
    );
    part(2, 0.41, 0.37, 0.38, 0, 1.63, 0, skin);
    // Visor sits in front of the face rather than intersecting it (no flicker).
    part(2, 0.39, 0.095, 0.025, 0, 1.69, -0.204, 0x172f38);
    for (const x of [-0.105, 0.105])
      part(2, 0.075, 0.04, 0.018, x, 1.7, -0.223, 0xb8d0c1);
    part(2, 0.17, 0.045, 0.025, 0, 1.56, -0.2, 0x977058);
    part(
      2,
      role === 3 ? 0.48 : 0.46,
      role === 3 ? 0.1 : 0.16,
      0.43,
      0,
      1.87,
      0,
      role === 4 ? 0xc49e50 : team,
    );
    part(2, 0.49, 0.045, 0.49, 0, 1.79, -0.02, role === 4 ? 0x846c43 : dark);
    part(2, 0.08, 0.055, 0.44, 0, 1.97, 0, cream);
    // Small original team markers remain readable under moonlight. They reuse
    // the batched emissive model shader, not lights or extra scene meshes.
    for (const x of [-0.244, 0.244])
      part(2, 0.025, 0.055, 0.28, x, 1.87, -0.015, team, 0.22);
    part(1, 0.64, 0.1, 0.42, 0, 0.79, 0, dark);
    part(1, 0.3, 0.32, 0.04, 0, 1.13, -0.222, dark);
    for (const [x, bone] of [
      [-0.18, 3],
      [0.18, 4],
    ]) {
      part(bone, 0.22, 0.53, 0.25, x, 0.4, 0, role === 4 ? 0x4e666b : 0x34494d);
      part(bone, 0.24, 0.13, 0.32, x, 0.09, -0.065, dark);
      part(bone, 0.23, 0.14, 0.27, x, 0.44, -0.02, team);
      part(1, 0.14, 0.17, 0.06, x, 0.95, -0.25, cream);
    }
    for (const [x, bone] of [
      [-0.4, 5],
      [0.4, 6],
    ]) {
      part(bone, 0.19, 0.38, 0.24, x, 1.15, -0.04, team);
      part(bone, 0.16, 0.24, 0.19, x, 0.86, -0.06, skin);
      part(bone, 0.2, 0.13, 0.22, x, 0.72, -0.06, dark);
      part(
        bone,
        0.22,
        role === 2 ? 0.23 : 0.12,
        0.27,
        x,
        1.31,
        -0.04,
        role === 2 ? 0x8b927c : cream,
      );
    }
    part(1, 0.4, 0.4, 0.2, 0, 1.08, 0.3, dark);
    if (role === 0) {
      part(1, 0.48, 0.4, 0.1, 0, 1.12, -0.28, 0x698385);
      part(1, 0.24, 0.25, 0.07, -0.27, 0.89, 0.25, cream);
      part(1, 0.1, 0.12, 0.025, -0.27, 0.9, 0.3, team);
      part(1, 0.035, 0.48, 0.035, 0.22, 1.56, 0.33, dark);
    } else if (role === 1) {
      for (const x of [-0.18, 0.18]) {
        part(1, 0.2, 0.52, 0.24, x, 1.08, 0.38, 0x6a7e86);
        part(1, 0.14, 0.1, 0.23, x, 0.78, 0.38, dark);
        part(1, 0.18, 0.1, 0.25, x, 1.32, 0.38, cream);
      }
      for (const x of [-0.25, 0.25])
        part(2, 0.08, 0.2, 0.25, x, 1.67, 0.02, dark);
      part(1, 0.03, 0.44, 0.03, 0.26, 1.4, 0.35, cream);
    } else if (role === 2) {
      part(1, 0.51, 0.52, 0.29, 0, 1.07, 0.43, 0x716c51);
      for (const x of [-0.16, 0, 0.16])
        part(1, 0.085, 0.4, 0.08, x, 1.12, 0.62, 0xb8a57b);
      part(1, 0.37, 0.1, 0.05, 0, 1.3, -0.24, team);
      part(5, 0.26, 0.26, 0.15, -0.41, 0.93, -0.2, dark);
    } else if (role === 3) {
      part(2, 0.52, 0.045, 0.5, 0, 1.94, 0, 0x667459);
      part(1, 0.56, 0.34, 0.44, 0, 1.29, 0.02, 0x596951);
      for (let i = 0; i < 10; i++)
        part(
          1,
          0.1,
          0.08,
          0.035,
          ((i % 4) - 0.5) * 0.11 - 0.1,
          1.2 + Math.floor(i / 4) * 0.09,
          -0.225,
          i % 2 ? 0x87916a : 0x394e44,
        );
      part(1, 0.2, 0.4, 0.18, 0.19, 1.11, 0.36, 0x596951);
    } else {
      part(2, 0.14, 0.13, 0.08, 0, 1.85, -0.25, cream);
      part(2, 0.09, 0.08, 0.035, 0, 1.85, -0.304, 0xffdd92, 1);
      for (const x of [-0.24, 0.24])
        part(1, 0.13, 0.24, 0.1, x, 0.88, -0.22, 0xaa8b50);
      part(1, 0.33, 0.42, 0.23, 0, 1.13, 0.42, 0x685d49);
      part(1, 0.06, 0.7, 0.06, 0.24, 1.12, 0.37, dark);
      part(1, 0.34, 0.08, 0.08, 0.18, 1.47, 0.37, 0xb6b2a2);
    }
  }
  const geometry = mergeGeometries(geometries)!;
  geometries.forEach((g) => g.dispose());
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.05,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute float emission; varying float selfLight;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nselfLight=emission;",
    );
    shader.fragmentShader =
      "varying float selfLight;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance += selfLight * vColor.rgb * 1.5;",
    );
  };
  const body = new THREE.SkinnedMesh(geometry, material);
  body.castShadow = body.receiveShadow = true;
  body.add(root);
  group.add(body);
  group.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones));
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.2);
  if (!p.zombie) {
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(
        role === 2 ? 0.18 : 0.1,
        role === 2 ? 0.17 : 0.12,
        role === 3 ? 0.83 : role === 4 ? 0.54 : 0.62,
      ),
      new THREE.MeshStandardMaterial({
        color: dark,
        roughness: 0.7,
        metalness: 0.3,
      }),
    );
    gun.position.set(-0.04, -0.21, -0.27);
    gun.castShadow = true;
    rightArm.add(gun);
    group.userData.gun = gun;
  }
  group.userData.rig = {
    root,
    torso,
    head,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    phase: 0,
  };
  group.userData.model = {
    role,
    zombie: p.zombie,
    variant: p.zombie ? variant : null,
    pieces,
    vertices: geometry.attributes.position.count,
  };
  group.userData.flames = [-0.18, 0.18].map((x) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.34, 0.09),
      new THREE.MeshBasicMaterial({ color: 0xffc369 }),
    );
    m.position.set(x, 0.66, 0.37);
    m.visible = false;
    group.add(m);
    return m;
  });
  return group;
}

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { World, W } from "../shared/game.js";
import { CITY_SEED, CITY_LIGHTS } from "../shared/city.js";
import { voxelPixels, voxelTexture } from "../client/voxel-texture.js";
import { meshChunk, Terrain } from "../client/mesh.js";
import {
  SunRays,
  sunlightVisibility,
  raysEnabled,
} from "../client/sun-rays.js";
import { createCharacter } from "../client/character.js";
import { createEquipment } from "../client/equipment.js";
import { pixelFinish } from "../client/pixel-finish.js";
import { NeonView } from "../client/neon-view.js";
import { WaterSurface } from "../client/battlefield-view.js";
import { sceneLighting, shadowQuality } from "../client/lighting.js";

test("original material tiles are deterministic, compact and preserve neon brightness", () => {
  const a = voxelPixels(),
    b = voxelPixels();
  assert.deepEqual(a.pixels, b.pixels);
  assert.equal(a.width, 64);
  assert.equal(a.height, 128);
  assert.equal(a.pixels.byteLength, 32768);
  const tile = (kind: number) =>
    Array.from(
      { length: 256 },
      (_, i) =>
        a.pixels[
          ((kind % 4) * 16 +
            (i % 16) +
            a.width * (Math.floor(kind / 4) * 16 + Math.floor(i / 16))) *
            4
        ],
    );
  for (const [first, second] of [
    [1, 3],
    [3, 4],
    [4, 14],
    [14, 27],
  ])
    assert.notDeepEqual(tile(first), tile(second));
  for (const kind of [22, 23, 24, 25])
    assert.ok(tile(kind).every((v) => v === 128));
  const texture = voxelTexture();
  assert.equal(texture.magFilter, THREE.NearestFilter);
  assert.equal(texture.minFilter, THREE.NearestFilter);
  assert.equal(texture.generateMipmaps, false);
  texture.dispose();
});

test("voxel textures retain one merged top face and distinct material IDs at chunk edges", () => {
  const world = new World(1, false);
  for (let x = 16; x < 48; x++)
    for (let z = 16; z < 48; z++) world.set(x, 5, z, 1);
  const geometry = meshChunk(world, 1, 1),
    surface = geometry.getAttribute("surface"),
    normal = geometry.getAttribute("normal");
  assert.equal(surface.count, geometry.getAttribute("position").count);
  let top = 0;
  for (let i = 0; i < normal.count; i++)
    if (normal.getY(i) === 1) {
      top++;
      assert.equal(surface.getX(i), 1);
    }
  assert.equal(
    top,
    4,
    "texture repeats in the shader rather than splitting the merged floor",
  );
  world.set(33, 6, 25, 4);
  world.set(36, 6, 25, 27);
  const neighbor = meshChunk(world, 2, 1);
  const ids = new Set(neighbor.getAttribute("surface").array);
  assert.ok(ids.has(1) && ids.has(4) && ids.has(27));
  geometry.dispose();
  neighbor.dispose();
});

test("sun shafts disappear under a roof, respond to digging and ignore synthetic map boundaries", () => {
  const world = new World(1, false),
    origin = { x: 20.5, y: 5.5, z: 20.5 },
    sun = { x: 0, y: 1, z: 0 };
  assert.equal(sunlightVisibility(world, origin, sun), 1);
  for (let x = 18; x <= 22; x++)
    for (let z = 18; z <= 22; z++) world.set(x, 7, z, 3);
  assert.equal(sunlightVisibility(world, origin, sun), 0);
  world.set(20, 7, 20, 0);
  assert.equal(sunlightVisibility(world, origin, sun), 1);
  assert.equal(sunlightVisibility(world, origin, { x: 0, y: -1, z: 0 }), 0);
  assert.equal(
    sunlightVisibility(
      world,
      { x: W - 0.2, y: 20, z: 150 },
      { x: 1, y: 0.2, z: 0 },
    ),
    1,
  );
});

test("sun rays track camera/FOV, fade after roof edits, reset on teleport, and disable on mobile/night", () => {
  const world = new World(1, false),
    view = new SunRays(),
    camera = new THREE.PerspectiveCamera(80, 2, 0.07, 360);
  const sun = new THREE.Vector3(0, 0.5, -1).normalize();
  camera.position.set(20.5, 5.5, 20.5);
  camera.lookAt(camera.position.clone().add(sun));
  view.update(world, camera, sun, 1, true, 0, 0.016);
  assert.equal(view.mesh.visible, true);
  assert.ok(
    view.material.uniforms.sunScreen.value.distanceTo(
      new THREE.Vector2(0.5, 0.5),
    ) < 1e-6,
  );
  assert.equal(view.material.uniforms.aspect.value, 2);
  assert.equal(view.mesh.geometry.getAttribute("position").count, 4);
  for (let x = 18; x <= 22; x++)
    for (let z = 14; z <= 24; z++) world.set(x, 7, z, 3);
  for (let t = 200; t <= 1200; t += 100)
    view.update(world, camera, sun, 1, true, t, 0.1);
  assert.ok(view.material.uniforms.strength.value < 0.005);
  camera.position.set(45.5, 5.5, 45.5);
  view.update(world, camera, sun, 1, true, 1201, 0.016);
  assert.equal(
    view.visibility,
    1,
    "teleport doesn't drag old occlusion into a new spawn",
  );
  camera.lookAt(camera.position.clone().sub(sun));
  view.update(world, camera, sun, 1, true, 1202, 0.016);
  assert.equal(view.mesh.visible, false, "no backwards sun projection");
  camera.lookAt(camera.position.clone().add(sun));
  view.update(world, camera, sun, 0, true, 1300, 0.016);
  assert.equal(view.mesh.visible, false);
  for (const [preset, effects, enabled] of [
    ["mobile", "high", true],
    ["balanced", "low", true],
    ["high", "high", false],
  ] as const) {
    view.update(
      world,
      camera,
      sun,
      1,
      raysEnabled(preset, effects, enabled),
      1400,
      0.016,
    );
    assert.equal(view.mesh.visible, false);
    assert.equal(view.material.uniforms.strength.value, 0);
  }
  assert.equal(raysEnabled("balanced", "high", true), true);
  view.mesh.geometry.dispose();
  view.material.dispose();
});

test("material hooks retain skinning/emission, shared detail toggles, and correct program cache variants", () => {
  const shaderFor = (material: THREE.Material) => {
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
    material.onBeforeCompile(shader as any, {} as THREE.WebGLRenderer);
    return shader;
  };
  const terrain = new Terrain(new World(1, false)),
    ts = shaderFor(terrain.material);
  assert.match(ts.vertexShader, /voxelSurface = surface/);
  assert.equal((ts.uniforms as any).voxelDetail, terrain.textureStrength);
  terrain.textureStrength.value = 0;
  assert.equal(
    (ts.uniforms as any).voxelDetail.value,
    0,
    "settings update the compiled uniform without remeshing",
  );
  const character = createCharacter({ id: "grain", team: 0, zombie: true });
  const body = character.children.find(
    (c) => c instanceof THREE.SkinnedMesh,
  ) as THREE.SkinnedMesh;
  const cs = shaderFor(body.material as THREE.Material);
  assert.match(cs.vertexShader, /#include <skinning_vertex>/);
  assert.match(cs.vertexShader, /selfLight=emission/);
  assert.match(cs.fragmentShader, /totalEmissiveRadiance/);
  assert.match(cs.fragmentShader, /finishGrain/);
  const weapon = createEquipment(0, 0),
    ws = shaderFor(weapon.material as THREE.Material);
  assert.match(ws.fragmentShader, /finishGrain/);
  const first = pixelFinish(new THREE.MeshStandardMaterial(), 32),
    second = pixelFinish(new THREE.MeshStandardMaterial(), 48);
  assert.notEqual(
    first.customProgramCacheKey(),
    second.customProgramCacheKey(),
  );
  character.traverse((c) => {
    if (c instanceof THREE.SkinnedMesh) c.skeleton.dispose();
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
  });
  weapon.geometry.dispose();
  (weapon.material as THREE.Material).dispose();
  terrain.material.dispose();
  terrain.texture.dispose();
  first.dispose();
  second.dispose();
});

test("night lamp glows are one bounded batch, depth-tested, and follow destruction/low effects", () => {
  const view = new NeonView(new THREE.Scene()),
    world = new World(CITY_SEED),
    p = CITY_LIGHTS[0],
    eye = new THREE.Vector3(p.x, 14, p.z);
  view.update(world, eye, true, 0);
  assert.ok(view.glows.count > 0 && view.glows.count <= CITY_LIGHTS.length);
  assert.equal(view.glowMaterial.depthTest, true);
  assert.ok(view.lights.every((l) => !l.castShadow));
  const before = view.glows.count;
  world.set(p.x, p.y, p.z, 0);
  view.update(world, eye, true, 251);
  assert.equal(view.glows.count, before - 1);
  view.update(world, eye, false, 252);
  assert.equal(view.glows.count, 0);
  assert.equal(view.glows.visible, false);
  view.glows.geometry.dispose();
  view.glowMaterial.dispose();
});

test("water shares the authoritative sun phase and lighting keeps highlight headroom", () => {
  const water = new WaterSurface(),
    sun = new THREE.Vector3(0, 1, -1).normalize(),
    sky = new THREE.Color(0x2875b3);
  water.atmosphere(1, sky, sun);
  assert.ok(water.material.uniforms.sunDirection.value.distanceTo(sun) < 1e-6);
  water.update(10, false);
  assert.equal(water.material.uniforms.detail.value, 0);
  assert.equal(water.mesh.children.length, 0);
  for (const kind of [0, 1, 2, 3])
    assert.ok(sceneLighting(kind, false).exposure <= 0.95);
  assert.ok(
    sceneLighting(2, false).exposure < sceneLighting(1, false).exposure,
  );
  assert.equal(shadowQuality("mobile", true, true).enabled, false);
  assert.equal(shadowQuality("balanced", true, true).size, 512);
  water.mesh.geometry.dispose();
  water.material.dispose();
});

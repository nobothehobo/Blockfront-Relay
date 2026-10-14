// Export the real material hooks with Three's shader chunks for native GLSL QA.
// This checks compilation/linking without a browser; it isn't a Safari playtest.
import * as THREE from "three";
import { writeFile } from "node:fs/promises";
import { World } from "../shared/game.js";
import { Terrain } from "../client/mesh.js";
import { Sky } from "../client/sky.js";
import { SunRays } from "../client/sun-rays.js";
import { WaterSurface } from "../client/battlefield-view.js";
import { NeonView } from "../client/neon-view.js";
import { createCharacter } from "../client/character.js";
import { createEquipment } from "../client/equipment.js";
import { pixelFinish } from "../client/pixel-finish.js";

const chunks = THREE.ShaderChunk as Record<string, string>;
const include = (s: string): string =>
  s.replace(/#include +<([\w\d_]+)>/g, (_, name) => {
    if (!chunks[name]) throw new Error(`Unknown shader chunk: ${name}`);
    return include(chunks[name]);
  });
function expand(s: string) {
  s = include(s).replace(/\bNUM_[A-Z_]+\b|\bUNION_CLIPPING_PLANES\b/g, (name) =>
    String(
      (
        {
          NUM_DIR_LIGHTS: 2,
          NUM_HEMI_LIGHTS: 1,
          NUM_POINT_LIGHTS: 4,
          NUM_DIR_LIGHT_SHADOWS: 1,
        } as Record<string, number>
      )[name] ?? 0,
    ),
  );
  return s.replace(
    /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g,
    (_, start, end, snippet) =>
      Array.from({ length: Number(end) - Number(start) }, (_, j) =>
        snippet
          .replace(/\[\s*i\s*\]/g, `[ ${j + Number(start)} ]`)
          .replace(/UNROLLED_LOOP_INDEX/g, String(j + Number(start))),
      ).join("\n"),
  );
}
function fixture(
  name: string,
  material: THREE.Material,
  defines: string[] = [],
) {
  const custom = material instanceof THREE.ShaderMaterial;
  const shader = custom
    ? {
        vertexShader: material.vertexShader,
        fragmentShader: material.fragmentShader,
        uniforms: material.uniforms,
      }
    : { ...THREE.ShaderLib.standard, uniforms: {} };
  material.onBeforeCompile(shader as any, {} as THREE.WebGLRenderer);
  const common = `precision highp float; precision highp int; precision highp sampler2D;
    precision highp sampler2DArray; precision highp sampler2DShadow;
    ${defines.map((d) => `#define ${d}`).join("\n")}`;
  const vertex = `#version 300 es
    #define attribute in
    #define varying out
    #define texture2D texture
    ${common}
    uniform mat4 modelMatrix, modelViewMatrix, projectionMatrix, viewMatrix;
    uniform mat3 normalMatrix; uniform vec3 cameraPosition; uniform bool isOrthographic;
    in vec3 position, normal; in vec2 uv;
    #ifdef USE_COLOR
    in vec3 color;
    #endif
    #ifdef USE_SKINNING
    in vec4 skinIndex, skinWeight;
    #endif
    #ifdef USE_INSTANCING
    in mat4 instanceMatrix;
    #endif
    ${expand(shader.vertexShader)}`;
  const fragment = `#version 300 es
    #define varying in
    #define texture2D texture
    #define textureCube texture
    #define texture2DGradEXT textureGrad
    #define gl_FragColor pc_fragColor
    layout(location=0) out highp vec4 pc_fragColor;
    ${common}
    uniform mat4 viewMatrix; uniform vec3 cameraPosition; uniform bool isOrthographic;
    ${material.toneMapped ? `#define TONE_MAPPING\n${chunks.tonemapping_pars_fragment}\nvec3 toneMapping(vec3 color){return ACESFilmicToneMapping(color);}` : ""}
    ${chunks.colorspace_pars_fragment}
    vec4 linearToOutputTexel(vec4 value){return sRGBTransferOETF(value);}
    float luminance(vec3 rgb){return dot(rgb,vec3(.2126,.7152,.0722));}
    ${expand(shader.fragmentShader)}`;
  return { name, vertex, fragment };
}
const terrain = new Terrain(new World(1, false));
const body = createCharacter({
  id: "shader",
  team: 0,
  zombie: true,
}).children.find((c) => c instanceof THREE.SkinnedMesh) as THREE.SkinnedMesh;
const equipment = createEquipment(0, 0).material as THREE.Material;
const standard = ["USE_COLOR", "USE_FOG"];
const shadow = ["USE_SHADOWMAP", "SHADOWMAP_TYPE_PCF_SOFT"];
const shaders = [
  fixture("terrain-mobile", terrain.material, standard),
  fixture("terrain-shadows", terrain.material, [...standard, ...shadow]),
  fixture("character-skinned", body.material as THREE.Material, [
    ...standard,
    ...shadow,
    "USE_SKINNING",
  ]),
  fixture("equipment", equipment, [...standard, ...shadow]),
  fixture(
    "first-person-solid",
    pixelFinish(
      new THREE.MeshStandardMaterial({ vertexColors: true }),
      48,
      0.16,
    ),
    standard,
  ),
  fixture(
    "first-person-moving",
    pixelFinish(new THREE.MeshStandardMaterial(), 48, 0.16),
  ),
  fixture("sky", new Sky().material),
  fixture("water", new WaterSurface().material),
  fixture("sun-rays", new SunRays().material),
  fixture("city-glows", new NeonView(new THREE.Scene()).glowMaterial, [
    "USE_INSTANCING",
  ]),
];
await writeFile(
  process.argv[2] ?? "/tmp/blockfront-shaders.json",
  JSON.stringify(shaders),
);
console.log(`Exported ${shaders.length} material shader pairs`);

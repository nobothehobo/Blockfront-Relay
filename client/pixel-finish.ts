import * as THREE from "three";

// Model-local micro pixels stay attached to articulated limbs and moving weapon
// parts. One hash in the existing material, no additional meshes or textures.
export function pixelFinish(
  material: THREE.MeshStandardMaterial,
  scale = 32,
  amount = 0.14,
) {
  const previous = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader =
      "varying vec3 finishPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nfinishPosition=position;",
    );
    shader.fragmentShader =
      "varying vec3 finishPosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec3 finishCell=floor(finishPosition*${scale.toFixed(1)});
      float finishGrain=fract(sin(dot(finishCell,vec3(12.9898,78.233,37.719)))*43758.5453);
      vec3 finishPixel=fwidth(finishPosition*${scale.toFixed(1)});
      float finishFade=1.0-smoothstep(.6,2.0,max(max(finishPixel.x,finishPixel.y),finishPixel.z));
      diffuseColor.rgb *= 1.0+(finishGrain-.5)*${amount.toFixed(3)}*finishFade;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor*(1.0+(finishGrain-.5)*.22*finishFade),.35,1.0);`,
    );
  };
  material.customProgramCacheKey = () => `${cacheKey}:pixel:${scale}:${amount}`;
  return material;
}

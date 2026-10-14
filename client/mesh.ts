import * as THREE from "three";
import { World, W, H, D, CHUNK, palette } from "../shared/game.js";
import { faceOcclusion } from "./voxel-shading.js";
import { voxelTexture } from "./voxel-texture.js";
// Greedy merge adjacent coplanar faces with identical material; one mesh per column chunk.
export function meshChunk(world: World, cx: number, cz: number) {
  const dims = [CHUNK, H, CHUNK],
    off = [cx * CHUNK, 0, cz * CHUNK],
    positions: number[] = [],
    normals: number[] = [],
    emissions: number[] = [],
    surfaces: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const color = new THREE.Color();
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3,
      v = (axis + 2) % 3,
      x = [0, 0, 0],
      q = [0, 0, 0];
    q[axis] = 1;
    const mask = new Int32Array(dims[u] * dims[v]);
    for (x[axis] = -1; x[axis] < dims[axis];) {
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++)
        for (x[u] = 0; x[u] < dims[u]; x[u]++) {
          const a = world.get(x[0] + off[0], x[1] + off[1], x[2] + off[2]),
            b = world.get(
              x[0] + off[0] + q[0],
              x[1] + off[1] + q[1],
              x[2] + off[2] + q[2],
            );
          const face =
            a && !b && x[axis] >= 0
              ? a
              : !a && b && x[axis] < dims[axis] - 1
                ? -b
                : 0;
          if (!face) mask[n++] = 0;
          else {
            const sign = face > 0 ? 1 : -1;
            const ao = faceOcclusion(
              world,
              x[0] + off[0] + (axis === 0 && sign < 0 ? 1 : 0),
              x[1] + (axis === 1 && sign < 0 ? 1 : 0),
              x[2] + off[2] + (axis === 2 && sign < 0 ? 1 : 0),
              axis,
              sign,
            );
            mask[n++] = sign * (Math.abs(face) | (ao << 8));
          }
        }
      x[axis]++;
      n = 0;
      for (let j = 0; j < dims[v]; j++)
        for (let i = 0; i < dims[u];) {
          const m = mask[n];
          if (!m) {
            i++;
            n++;
            continue;
          }
          let width = 1;
          while (i + width < dims[u] && mask[n + width] === m) width++;
          let height = 1;
          outer: for (; j + height < dims[v]; height++)
            for (let k = 0; k < width; k++)
              if (mask[n + k + height * dims[u]] !== m) break outer;
          x[u] = i;
          x[v] = j;
          const du = [0, 0, 0],
            dv = [0, 0, 0];
          du[u] = width;
          dv[v] = height;
          const start = positions.length / 3;
          const pts = [
            x.slice(),
            x.map((a, k) => a + du[k]),
            x.map((a, k) => a + du[k] + dv[k]),
            x.map((a, k) => a + dv[k]),
          ];
          const block = Math.abs(m) & 255,
            ao = Math.abs(m) >>> 8;
          color.setHex(palette[block]);
          const shade =
            axis === 1 ? (m > 0 ? 1 : 0.66) : axis === 0 ? 0.94 : 0.97;
          for (let corner = 0; corner < pts.length; corner++) {
            const pt = pts[corner];
            const occlusion = (ao >>> (corner * 2)) & 3;
            const cornerShade = shade * (0.92 - occlusion * 0.1);
            positions.push(pt[0] + off[0], pt[1] + off[1], pt[2] + off[2]);
            emissions.push(block >= 22 && block <= 25 ? 0.85 : 0);
            surfaces.push(block);
            const normal = [0, 0, 0];
            normal[axis] = m > 0 ? 1 : -1;
            normals.push(...normal);
            colors.push(
              color.r * cornerShade,
              color.g * cornerShade,
              color.b * cornerShade,
            );
          }
          if (m > 0)
            indices.push(
              start,
              start + 1,
              start + 2,
              start,
              start + 2,
              start + 3,
            );
          else
            indices.push(
              start,
              start + 2,
              start + 1,
              start,
              start + 3,
              start + 2,
            );
          for (let jj = 0; jj < height; jj++)
            for (let ii = 0; ii < width; ii++) mask[n + ii + jj * dims[u]] = 0;
          i += width;
          n += width;
        }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "emission",
    new THREE.Float32BufferAttribute(emissions, 1),
  );
  geometry.setIndex(indices);
  geometry.setAttribute(
    "surface",
    new THREE.Float32BufferAttribute(surfaces, 1),
  );
  geometry.computeBoundingSphere();
  return geometry;
}
export class Terrain {
  readonly texture = voxelTexture();
  readonly textureStrength = { value: 1 };
  group = new THREE.Group();
  chunks = new Map<string, THREE.Mesh>();
  dirty = new Set<string>();
  view = { x: W / 2, z: D / 2, d: 160 };
  lastCenter = "";
  material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  constructor(public world: World) {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.voxelTexture = { value: this.texture };
      shader.uniforms.voxelDetail = this.textureStrength;
      shader.uniforms.soilTint = { value: new THREE.Color(palette[2]) };
      shader.uniforms.grassTint = { value: new THREE.Color(palette[1]) };
      shader.uniforms.grassAltTint = { value: new THREE.Color(palette[13]) };
      shader.vertexShader =
        "attribute float emission; attribute float surface; varying float voxelSurface; varying float voxelEmission; varying vec3 voxelPosition; varying vec3 voxelNormal;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvoxelPosition = position - normal * 0.001; voxelNormal = normal; voxelEmission = emission; voxelSurface = surface;",
      );
      shader.fragmentShader =
        "uniform sampler2D voxelTexture; uniform float voxelDetail; uniform vec3 soilTint; uniform vec3 grassTint; uniform vec3 grassAltTint; varying float voxelSurface; varying float voxelEmission; varying vec3 voxelPosition; varying vec3 voxelNormal;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 cell = floor(voxelPosition);
        float grain = fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
        // Subtle cube-edge shading survives greedy merging without extra geometry.
        vec3 f = fract(voxelPosition);
        vec3 edge = min(f,1.0-f) + abs(voxelNormal);
        vec3 pixel = fwidth(voxelPosition);
        float footprint = max(max(pixel.x,pixel.y),pixel.z);
        float detail = 1.0-smoothstep(.12,.6,footprint);
        vec2 tilePoint = abs(voxelNormal.y)>.5 ? voxelPosition.xz : abs(voxelNormal.x)>.5 ? voxelPosition.zy : voxelPosition.xy;
        float kind=floor(voxelSurface+.5);
        float soil=0.0;
        if ((kind==1.0 || kind==13.0) && abs(voxelNormal.y)<.5) {
          soil=(1.0-smoothstep(.79,.90,f.y+grain*.045))*voxelDetail;
          vec3 grassColor=kind==1.0?grassTint:grassAltTint;
          diffuseColor.rgb *= mix(vec3(1.0),soilTint/max(grassColor,vec3(.01)),soil);
          kind=mix(kind,2.0,step(.5,soil));
        }
        vec2 tile=vec2(mod(kind,4.0),floor(kind/4.0));
        vec2 texel=(floor(fract(tilePoint)*16.0)+.5)/16.0;
        float pattern=texture2D(voxelTexture,(tile+texel)/vec2(4.0,8.0)).r;
        float textureFade=(1.0-smoothstep(.035,.2,footprint))*voxelDetail;
        diffuseColor.rgb *= mix(1.0,.65+pattern*.70,textureFade);
        float seam = 1.0-smoothstep(0.015,0.055+footprint*.45,min(min(edge.x,edge.y),edge.z));
        float bevel = smoothstep(.035,.065,min(min(edge.x,edge.y),edge.z))*(1.0-smoothstep(.065,.1,min(min(edge.x,edge.y),edge.z)));
        // Screen derivatives fade fine edges at distance; no postprocess or extra faces.
        diffuseColor.rgb *= (1.0 + (grain-.5)*.13*detail) * (1.0-seam*.09*detail+bevel*.025*detail);
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor*mix(1.0,.82+pattern*.35,textureFade),.72,1.0);",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += voxelEmission * vColor.rgb * 1.8;",
      );
    };
    this.rebuild();
  }
  rebuild() {
    // World replacement invalidates every mesh, not just its eventual rebuild.
    for (const mesh of this.chunks.values()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.chunks.clear();
    this.dirty.clear();
    this.lastCenter = "";
    for (let cx = 0; cx < W / CHUNK; cx++)
      for (let cz = 0; cz < D / CHUNK; cz++) this.dirty.add(`${cx},${cz}`);
  }
  prioritize(x: number, z: number) {
    this.view.x = x;
    this.view.z = z;
    const distance = (key: string) => {
      const [cx, cz] = key.split(",").map(Number);
      return Math.hypot(cx * CHUNK + CHUNK / 2 - x, cz * CHUNK + CHUNK / 2 - z);
    };
    this.dirty = new Set(
      [...this.dirty].sort((a, b) => distance(a) - distance(b)),
    );
  }
  edit(x: number, y: number, z: number, value: number, prioritize = true) {
    this.world.set(x, y, z, value);
    for (const [xx, zz] of [
      [x, z],
      [x - 1, z],
      [x + 1, z],
      [x, z - 1],
      [x, z + 1],
      [x - 1, z - 1],
      [x - 1, z + 1],
      [x + 1, z - 1],
      [x + 1, z + 1],
    ])
      if (xx >= 0 && xx < W && zz >= 0 && zz < D)
        this.dirty.add(`${Math.floor(xx / CHUNK)},${Math.floor(zz / CHUNK)}`);
    if (prioritize) this.prioritize(this.view.x, this.view.z);
  }
  update(count = 2) {
    const start = performance.now();
    for (const key of this.dirty) {
      const [cx, cz] = key.split(",").map(Number);
      if (
        Math.hypot(
          cx * CHUNK + CHUNK / 2 - this.view.x,
          cz * CHUNK + CHUNK / 2 - this.view.z,
        ) >
        this.view.d + CHUNK
      )
        continue;
      const geometry = meshChunk(this.world, cx, cz);
      const old = this.chunks.get(key);
      if (old) {
        old.geometry.dispose();
        old.geometry = geometry;
      } else {
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
        this.chunks.set(key, mesh);
        this.group.add(mesh);
      }
      this.dirty.delete(key);
      if (--count <= 0 || performance.now() - start > 6) break;
    }
  }
  distance(x: number, z: number, d: number) {
    const center = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    if (center !== this.lastCenter) {
      this.lastCenter = center;
      if (this.dirty.size) this.prioritize(x, z);
    }
    this.view = { x, z, d };
    for (const [key, mesh] of this.chunks) {
      const [cx, cz] = key.split(",").map(Number);
      mesh.visible = Math.hypot(cx * 16 + 8 - x, cz * 16 + 8 - z) < d + 14;
    }
  }
}

import * as THREE from "three";
import { World, W, H, D, CHUNK, palette } from "../shared/game.js";
// Greedy merge adjacent coplanar faces with identical material; one mesh per column chunk.
export function meshChunk(world: World, cx: number, cz: number) {
  const dims = [CHUNK, H, CHUNK],
    off = [cx * CHUNK, 0, cz * CHUNK],
    positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const color = new THREE.Color();
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3,
      v = (axis + 2) % 3,
      x = [0, 0, 0],
      q = [0, 0, 0];
    q[axis] = 1;
    const mask = new Int16Array(dims[u] * dims[v]);
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
          mask[n++] =
            a && !b && x[axis] >= 0
              ? a
              : !a && b && x[axis] < dims[axis] - 1
                ? -b
                : 0;
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
          color.setHex(palette[Math.abs(m)]);
          const shade =
            axis === 1 ? (m > 0 ? 1 : 0.52) : axis === 0 ? 0.78 : 0.88;
          for (let corner = 0; corner < pts.length; corner++) {
            const pt = pts[corner],
              sample = pt.map((a, k) => a + off[k]);
            sample[axis] += m > 0 ? 0 : -1;
            const su = corner === 1 || corner === 2 ? 1 : -1,
              sv = corner >= 2 ? 1 : -1;
            sample[u] += su > 0 ? -1 : 0;
            sample[v] += sv > 0 ? -1 : 0;
            const occupied = (a: number, b: number) => {
              const cell = sample.slice();
              cell[u] += a;
              cell[v] += b;
              return world.get(cell[0], cell[1], cell[2]) ? 1 : 0;
            };
            const occlusion =
              occupied(su, 0) + occupied(0, sv) + occupied(su, sv);
            const cornerShade = shade * (1 - occlusion * 0.085);
            positions.push(pt[0] + off[0], pt[1] + off[1], pt[2] + off[2]);
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
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
export class Terrain {
  group = new THREE.Group();
  chunks = new Map<string, THREE.Mesh>();
  dirty = new Set<string>();
  view = { x: W / 2, z: D / 2, d: 160 };
  lastCenter = "";
  material = new THREE.MeshLambertMaterial({ vertexColors: true });
  constructor(public world: World) {
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying vec3 voxelPosition; varying vec3 voxelNormal;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvoxelPosition = position - normal * 0.001; voxelNormal = normal;",
      );
      shader.fragmentShader =
        "varying vec3 voxelPosition; varying vec3 voxelNormal;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 cell = floor(voxelPosition);
        float grain = fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
        // Subtle cube-edge shading survives greedy merging without extra geometry.
        vec3 f = fract(voxelPosition);
        vec3 edge = min(f,1.0-f) + abs(voxelNormal);
        float seam = smoothstep(0.0,0.035, min(min(edge.x,edge.y),edge.z));
        diffuseColor.rgb *= (0.88 + grain * 0.20) * mix(0.92,1.0,seam);
      `,
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

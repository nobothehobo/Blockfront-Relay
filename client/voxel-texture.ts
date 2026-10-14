import * as THREE from "three";
// Original 16px tiles: grayscale albedo detail layered over our own block palette.
// One 64x128 texture covers all material IDs; no downloaded art or extra meshes.
export const TILE_SIZE = 16,
  ATLAS_COLUMNS = 4,
  ATLAS_ROWS = 8;
function hash(x: number, y: number, kind: number) {
  let n = Math.imul(x + y * 97 + kind * 571 + 19, 1597334677);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n >>> 0) / 4294967296;
}
export function voxelPixels() {
  const width = TILE_SIZE * ATLAS_COLUMNS,
    height = TILE_SIZE * ATLAS_ROWS;
  const pixels = new Uint8Array(width * height * 4);
  for (let kind = 0; kind < 32; kind++)
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) {
        const noise = hash(x, y, kind),
          patch = hash(Math.floor(x / 3), Math.floor(y / 3), kind);
        let value = 128 + (noise - 0.5) * 42;
        if ([1, 5, 13, 17, 21].includes(kind))
          value = 108 + patch * 58 + (noise > 0.84 ? 22 : 0);
        else if (kind === 4)
          value =
            120 +
            Math.sin(x * 1.2 + Math.sin(y * 0.45)) * 22 +
            (noise - 0.5) * 18;
        else if ([3, 15, 16].includes(kind))
          value =
            98 + patch * 60 + (noise - 0.5) * 22 - (noise < 0.08 ? 18 : 0);
        else if ([12, 18, 27].includes(kind)) {
          const mortar = y === 0 || y === 8 || (x + (y < 8 ? 0 : 8)) % 16 === 0;
          value = mortar ? 74 : 118 + patch * 27 + (noise > 0.94 ? 18 : 0);
        } else if ([6, 9, 10, 11, 14].includes(kind))
          value = 131 + (noise - 0.5) * 30 - (noise < 0.045 ? 32 : 0);
        else if ([7, 8, 19, 20, 26, 28, 29, 30].includes(kind))
          value =
            128 + (noise - 0.5) * 20 + (y === 2 ? 14 : 0) - (y === 13 ? 12 : 0);
        if (kind >= 22 && kind <= 25) value = 128; // Neon remains smooth and readable.
        const i =
          ((kind % 4) * 16 + x + width * (Math.floor(kind / 4) * 16 + y)) * 4;
        pixels[i] =
          pixels[i + 1] =
          pixels[i + 2] =
            Math.max(0, Math.min(255, Math.round(value)));
        pixels[i + 3] = 255;
      }
  return { pixels, width, height };
}
export function voxelTexture() {
  const { pixels, width, height } = voxelPixels();
  const texture = new THREE.DataTexture(
    pixels,
    width,
    height,
    THREE.RGBAFormat,
  );
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

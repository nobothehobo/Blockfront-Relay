// Shadow costs stay bounded independently of map size and player count.
export function shadowQuality(
  preset: string,
  touch: boolean,
  enabled: boolean,
) {
  return {
    enabled: enabled && preset !== "mobile",
    size: touch ? 512 : preset === "high" ? 2048 : 1024,
    radius: touch ? 32 : preset === "high" ? 56 : 44,
    interval: touch ? 300 : preset === "high" ? 120 : 180,
  };
}

// Exposure and fill are matched to terrain albedo, including the bright snow biome.
export function sceneLighting(kind: number, outbreak: boolean) {
  return outbreak
    ? { exposure: 0.92, sun: 1.5, ambient: 0.62, bounce: 0.27 }
    : kind === 2
      ? { exposure: 0.88, sun: 1.6, ambient: 0.7, bounce: 0.32 }
      : { exposure: 0.95, sun: 2.05, ambient: 0.7, bounce: 0.36 };
}

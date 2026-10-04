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
    ? { exposure: 0.94, sun: 1.4, ambient: 0.65, bounce: 0.25 }
    : kind === 2
      ? { exposure: 0.9, sun: 1.65, ambient: 0.75, bounce: 0.35 }
      : { exposure: 0.98, sun: 1.9, ambient: 0.8, bounce: 0.45 };
}

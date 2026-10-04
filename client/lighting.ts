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

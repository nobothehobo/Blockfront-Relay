// Native media reads a local Blob, avoiding cross-build music API requests.
// Cache one compressed Blob per song; never decode entire songs to PCM buffers.
export function localMusicSource(
  recordings: Record<string, string>,
  makeUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
) {
  const cache = new Map<string, string>();
  return (track: string) => {
    const existing = cache.get(track);
    if (existing) return existing;
    const data = recordings[track + ".mp3"];
    if (!data?.startsWith("data:")) throw Error(`Music not packaged: ${track}`);
    const comma = data.indexOf(",");
    if (!data.slice(0, comma).endsWith(";base64"))
      throw Error("Invalid packaged music");
    const bytes = Uint8Array.from(atob(data.slice(comma + 1)), (char) =>
      char.charCodeAt(0),
    );
    const url = makeUrl(new Blob([bytes], { type: "audio/mpeg" }));
    cache.set(track, url);
    return url;
  };
}

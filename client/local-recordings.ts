// Decode packaged data directly: no CDN/API request can select another build.
export function localRecordingFetch(
  recordings: Record<string, string>,
): typeof fetch {
  return (async (request: RequestInfo | URL) => {
    const url = request instanceof Request ? request.url : String(request);
    const name = url.split("/").at(-1)?.split("?")[0] ?? "";
    const encoded = recordings[name];
    if (!encoded?.startsWith("data:"))
      throw Error(`Recording not packaged: ${name}`);
    const comma = encoded.indexOf(",");
    if (!encoded.slice(0, comma).endsWith(";base64"))
      throw Error("Invalid packaged audio");
    const bytes = Uint8Array.from(atob(encoded.slice(comma + 1)), (char) =>
      char.charCodeAt(0),
    );
    return new Response(bytes, { headers: { "Content-Type": "audio/wav" } });
  }) as typeof fetch;
}

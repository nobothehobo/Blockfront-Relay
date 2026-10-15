export type StepSurface = "grass" | "stone" | "wood" | "snow";
export const SAMPLE_FILES = [
  ...[
    "rifle",
    "smg",
    "shotgun",
    "marksman",
    "step-grass",
    "step-stone",
    "step-wood",
    "step-snow",
    "pickup",
    "death",
    "fall",
  ].flatMap((kind) => [`${kind}-1`, `${kind}-2`]),
  ...["rifle", "smg", "marksman"].flatMap((weapon) =>
    ["open", "seat", "close"].map((stage) => `${weapon}-reload-${stage}`),
  ),
  ...["shotgun", "launcher"].flatMap((weapon) =>
    ["open", "shell", "close"].map((stage) => `${weapon}-reload-${stage}`),
  ),
  "shotgun-action",
  "marksman-action",
  "launcher-1",
  "launcher-2",
  "explosion-1",
  "explosion-2",
  "jet-start",
  "jet-loop",
  "jet-stop",
];
export function footSurface(block: number): StepSurface {
  if (block === 4 || block === 20) return "wood";
  if (block === 14) return "snow";
  if ([1, 2, 5, 6, 9, 10, 11, 13, 17, 21].includes(block)) return "grass";
  return "stone";
}
export function sampleCue(
  kind: string,
  weapon: number,
  surface: StepSurface,
  variant: number,
) {
  const alternate = Math.abs(variant % 2) + 1;
  if (kind === "shot" && weapon >= 0 && weapon <= 3)
    return `${["rifle", "smg", "shotgun", "marksman"][weapon]}-${alternate}`;
  if (kind === "shot" && weapon === 6) return `launcher-${alternate}`;
  if (kind === "explosion") return `explosion-${alternate}`;
  const prefix = ["rifle", "smg", "shotgun", "marksman", "", "", "launcher"][
    weapon
  ];
  if (
    prefix &&
    ["reload-open", "reload-seat", "reload-shell", "reload-close"].includes(
      kind,
    )
  ) {
    const stage =
      (weapon === 2 || weapon === 6) && kind === "reload-seat"
        ? "reload-shell"
        : kind;
    const cue = `${prefix}-${stage}`;
    return SAMPLE_FILES.includes(cue) ? cue : null;
  }
  if (kind === "action" && (weapon === 2 || weapon === 3))
    return `${prefix}-action`;
  if (kind === "step") return `step-${surface}-${alternate}`;
  if (["pickup", "death", "fall"].includes(kind)) return `${kind}-${alternate}`;
  if (["jet-start", "jet-loop", "jet-stop"].includes(kind)) return kind;
  return null;
}

export class SampleBank {
  readonly buffers = new Map<string, AudioBuffer>();
  readonly failures = new Set<string>();
  readonly errors = new Map<string, string>();
  private loading: Promise<void> | null = null;
  private retryAt = 0;
  constructor(private readonly fetchFile: typeof fetch = fetch) {}
  load(context: AudioContext, retry = false): Promise<void> {
    if (this.loading) return this.loading;
    retry ||= Date.now() >= this.retryAt;
    const files = SAMPLE_FILES.filter(
      (name) => !this.buffers.has(name) && (retry || !this.failures.has(name)),
    );
    if (!files.length) return Promise.resolve();
    this.loading = (async () => {
      for (let offset = 0; offset < files.length; offset += 5) {
        await Promise.allSettled(
          files.slice(offset, offset + 5).map(async (name) => {
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 12000);
              let bytes: ArrayBuffer;
              try {
                const response = await this.fetchFile(
                  `/api/sfx/${name}.wav?v=221`,
                  {
                    signal: controller.signal,
                  },
                );
                if (!response.ok) throw Error(`HTTP ${response.status}`);
                bytes = await response.arrayBuffer();
              } finally {
                clearTimeout(timeout);
              }
              // All shipped effects are PCM16 WAV: parse explicitly instead of
              // depending on platform decodeAudioData codec/sample-rate behavior.
              const buffer = decodePcmWav(context, bytes);
              this.buffers.set(name, buffer);
              this.failures.delete(name);
              this.errors.delete(name);
            } catch (error) {
              this.failures.add(name);
              this.errors.set(
                name,
                error instanceof Error ? error.message : String(error),
              );
            }
          }),
        );
      }
    })().finally(() => {
      this.loading = null;
      this.retryAt = Date.now() + 10000;
    });
    return this.loading;
  }
  get status() {
    return {
      ready: this.buffers.size,
      total: SAMPLE_FILES.length,
      failed: this.failures.size,
      loading: !!this.loading,
      errors: [...this.errors].slice(0, 3),
    };
  }
}

export function decodePcmWav(context: AudioContext, bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  const tag = (at: number) =>
    String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (bytes.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE")
    throw Error("Invalid WAV response");
  let rate = 0,
    channels = 0,
    dataAt = -1,
    size = 0;
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const length = view.getUint32(at + 4, true),
      end = at + 8 + length;
    if (end > bytes.byteLength) throw Error("Truncated WAV");
    if (tag(at) === "fmt ") {
      if (
        length < 16 ||
        view.getUint16(at + 8, true) !== 1 ||
        view.getUint16(at + 22, true) !== 16
      )
        throw Error("Expected PCM16 WAV");
      channels = view.getUint16(at + 10, true);
      rate = view.getUint32(at + 12, true);
    }
    if (tag(at) === "data") {
      dataAt = at + 8;
      size = length;
    }
    at = end + (length % 2);
  }
  if (
    channels !== 1 ||
    rate < 8000 ||
    rate > 96000 ||
    dataAt < 0 ||
    !size ||
    size % 2 ||
    size / 2 > rate * 10
  )
    throw Error("Invalid PCM sample");
  const buffer = context.createBuffer(1, size / 2, rate),
    output = buffer.getChannelData(0);
  for (let i = 0; i < output.length; i++)
    output[i] = view.getInt16(dataAt + i * 2, true) / 32768;
  return buffer;
}

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
  private loading: Promise<void> | null = null;
  constructor(private readonly fetchFile: typeof fetch = fetch) {}
  load(context: AudioContext, retry = false): Promise<void> {
    if (this.loading) return this.loading;
    const files = SAMPLE_FILES.filter(
      (name) => !this.buffers.has(name) && (retry || !this.failures.has(name)),
    );
    if (!files.length) return Promise.resolve();
    this.loading = (async () => {
      for (let offset = 0; offset < files.length; offset += 5) {
        await Promise.allSettled(
          files.slice(offset, offset + 5).map(async (name) => {
            try {
              const response = await this.fetchFile(`/sfx/${name}.wav?v=219`, {
                signal: AbortSignal.timeout(12000),
              });
              if (!response.ok) throw Error("Sound asset unavailable");
              const buffer = await context.decodeAudioData(
                await response.arrayBuffer(),
              );
              this.buffers.set(name, buffer);
              this.failures.delete(name);
            } catch {
              this.failures.add(name);
            }
          }),
        );
      }
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }
  get status() {
    return {
      ready: this.buffers.size,
      total: SAMPLE_FILES.length,
      failed: this.failures.size,
      loading: !!this.loading,
    };
  }
}

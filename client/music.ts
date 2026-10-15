export type MusicMode = "menu" | "game";
export const MUSIC_PLAYLISTS = {
  menu: ["a-night-of-dizzy-spells", "underclocked"],
  game: ["chibi-ninja", "jumpshot"],
} as const;
export function musicGain(
  master: number,
  volume: number,
  enabled: boolean,
  mode: MusicMode,
  ducked: boolean,
  paused: boolean,
) {
  const clamp = (n: number) =>
    Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  return enabled
    ? clamp(master) *
        clamp(volume) *
        (mode === "game" ? 0.65 : 1) *
        (ducked ? 0.3 : paused ? 0.55 : 1)
    : 0;
}
type Voice = {
  mode: MusicMode;
  audio: HTMLAudioElement;
  gain: GainNode | null;
  target: number;
  pending: boolean;
  primed?: boolean;
  index: number;
  error?: string;
  stopTimer?: ReturnType<typeof setTimeout>;
};

// Stream one element per mode; do not decode whole songs into large mobile buffers.
export class Music {
  private context: AudioContext | null = null;
  private mode: MusicMode = "menu";
  private hidden = false;
  private master = 0.55;
  private volume = 0.14;
  private enabled = true;
  private ducked = false;
  private paused = false;
  private readonly voices: Voice[];

  constructor(makeAudio = () => new Audio()) {
    this.voices = (["menu", "game"] as const).map((mode) => {
      const audio = makeAudio();
      audio.preload = "none";
      audio.loop = false;
      audio.src = `/api/audio/${MUSIC_PLAYLISTS[mode][0]}.mp3?v=221`;
      const voice: Voice = {
        mode,
        audio,
        gain: null,
        target: 0,
        pending: false,
        index: 0,
      };
      audio.onended = () => {
        voice.index = (voice.index + 1) % MUSIC_PLAYLISTS[mode].length;
        audio.src = `/api/audio/${MUSIC_PLAYLISTS[mode][voice.index]}.mp3?v=221`;
        voice.pending = false;
        voice.error = undefined;
        if (voice.target > 0) this.play(voice);
      };
      return voice;
    });
  }

  configure(master: number, volume: number, enabled: boolean) {
    this.master = master;
    this.volume = volume;
    this.enabled = enabled;
    this.mix();
  }

  // Call inside a trusted gesture. Prime both elements for Safari, silently
  // parking the inactive one after it starts; later transitions can resume it.
  unlock(context: AudioContext) {
    const fresh = !this.context;
    if (fresh) {
      this.context = context;
      for (const voice of this.voices) {
        voice.gain = context.createGain();
        voice.gain.gain.value = 0;
        context.createMediaElementSource(voice.audio).connect(voice.gain);
        voice.gain.connect(context.destination);
      }
    }
    this.mix();
    if (
      !this.hidden &&
      musicGain(
        this.master,
        this.volume,
        this.enabled,
        this.mode,
        false,
        false,
      ) > 0
    ) {
      for (const voice of this.voices)
        if (!voice.primed || voice.mode === this.mode) this.play(voice);
    }
  }

  update(mode: MusicMode, hidden: boolean, ducked: boolean, paused: boolean) {
    if (
      this.mode === mode &&
      this.hidden === hidden &&
      this.ducked === ducked &&
      this.paused === paused
    )
      return;
    this.mode = mode;
    this.hidden = hidden;
    this.ducked = ducked;
    this.paused = paused;
    this.mix();
  }

  private play(voice: Voice) {
    if (!voice.audio.paused || voice.pending) return;
    voice.pending = true;
    voice.error = undefined;
    void voice.audio
      .play()
      .then(() => {
        voice.pending = false;
        voice.primed = true;
        if (voice.target === 0) voice.audio.pause();
      })
      .catch((error) => {
        // Autoplay denial or unavailable music must never prevent a match.
        voice.pending = false;
        voice.error =
          error instanceof Error ? error.name : "Playback unavailable";
      });
  }

  private mix() {
    if (!this.context) return;
    for (const voice of this.voices) {
      const target =
        !this.hidden && voice.mode === this.mode
          ? musicGain(
              this.master,
              this.volume,
              this.enabled,
              this.mode,
              this.ducked,
              this.paused,
            )
          : 0;
      if (target !== voice.target) {
        voice.target = target;
        const param = voice.gain!.gain,
          now = this.context.currentTime;
        param.cancelScheduledValues(now);
        param.setTargetAtTime(target, now, target < param.value ? 0.18 : 0.6);
      }
      if (target > 0) {
        clearTimeout(voice.stopTimer);
        voice.stopTimer = undefined;
        this.play(voice);
      } else if (this.hidden) {
        clearTimeout(voice.stopTimer);
        voice.stopTimer = undefined;
        voice.gain!.gain.cancelScheduledValues(this.context.currentTime);
        voice.gain!.gain.value = 0;
        voice.audio.pause();
      } else if (!voice.audio.paused && !voice.stopTimer) {
        voice.stopTimer = setTimeout(() => {
          voice.stopTimer = undefined;
          if (voice.target === 0) voice.audio.pause();
        }, 1200);
      }
    }
  }
  get diagnostics() {
    const voice = this.voices.find((v) => v.mode === this.mode)!;
    const status = !this.enabled
      ? "off"
      : !this.master || !this.volume
        ? "muted"
        : !this.context || this.context.state !== "running"
          ? "locked"
          : voice.error
            ? "retry"
            : voice.pending
              ? "loading"
              : voice.audio.paused
                ? "ready"
                : "playing";
    return {
      status,
      track: MUSIC_PLAYLISTS[this.mode][voice.index],
      mode: this.mode,
      error: voice.error ?? null,
    };
  }
}

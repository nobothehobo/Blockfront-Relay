export type MusicMode = "menu" | "game";
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
  stopTimer?: ReturnType<typeof setTimeout>;
};

// Stream two small files; do not decode whole songs into large mobile buffers.
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
    this.voices = (
      [
        ["menu", "/music/neon.mp3"],
        ["game", "/music/machina.mp3"],
      ] as const
    ).map(([mode, url]) => {
      const audio = makeAudio();
      audio.preload = "none";
      audio.loop = true;
      audio.src = url;
      return { mode, audio, gain: null, target: 0, pending: false };
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
    void voice.audio
      .play()
      .then(() => {
        voice.pending = false;
        voice.primed = true;
        if (voice.target === 0) voice.audio.pause();
      })
      .catch(() => {
        // Autoplay denial or unavailable music must never prevent a match.
        voice.pending = false;
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
}

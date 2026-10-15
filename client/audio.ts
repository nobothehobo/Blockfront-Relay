// Licensed recorded effects with procedural fallback; see assets/sfx/ATTRIBUTION.md.
import { JetVoice } from "./audio-mix.js";
import { SampleBank, sampleCue, type StepSurface } from "./sampled-audio.js";
import { requestPlaybackSession } from "./audio-session.js";
type Engine = {
  noise: AudioBufferSourceNode;
  tone: OscillatorNode | null;
  sampled: boolean;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
};
export class Sound {
  ctx: AudioContext | null = null;
  master = 0.55;
  effects = 0.75;
  private bus: GainNode | null = null;
  private noiseBuffers = new Map<number, AudioBuffer>();
  private shots = new Set<AudioScheduledSourceNode>();
  private sampleVolumes = new Map<AudioScheduledSourceNode, number>();
  private engines = new Map<string, Engine>();
  private starts = 0;
  private readonly samples: SampleBank;
  private sampleVariant = 0;
  private recordedStarts = 0;
  private fallbackStarts = 0;
  private lastCue = "none";
  private echo: DelayNode | null = null;
  private session = "not-requested";
  private resumeError = "";
  constructor(
    fetchFile: typeof fetch = fetch,
    private readonly delivery = "network",
  ) {
    this.samples = new SampleBank(fetchFile);
  }
  unlock() {
    this.session = requestPlaybackSession(navigator as any);
    if (!this.ctx) {
      const Context = window.AudioContext || (window as any).webkitAudioContext;
      if (!Context) return;
      const c: AudioContext = (this.ctx = new Context()),
        compressor = c.createDynamicsCompressor();
      this.bus = c.createGain();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.12;
      this.bus.connect(compressor);
      compressor.connect(c.destination);
      this.echo = c.createDelay(0.5);
      const echoGain = c.createGain();
      this.echo.delayTime.value = 0.14;
      echoGain.gain.value = 0.13;
      this.echo.connect(echoGain);
      echoGain.connect(this.bus);
    }
    void this.ctx!.resume()
      .then(() => {
        this.resumeError = "";
      })
      .catch((error) => {
        this.resumeError =
          error instanceof Error ? error.message : "Audio resume failed";
      });
    this.syncVolume();
    void this.samples.load(this.ctx!);
  }
  private syncVolume() {
    if (this.ctx && this.bus)
      this.bus.gain.setTargetAtTime(
        Math.max(0, Math.min(1, this.master)) *
          Math.max(0, Math.min(1, this.effects)),
        this.ctx.currentTime,
        0.015,
      );
  }
  private noise(seconds: number) {
    const c = this.ctx!;
    let buffer = this.noiseBuffers.get(seconds);
    if (!buffer) {
      buffer = c.createBuffer(
        1,
        Math.ceil(c.sampleRate * seconds),
        c.sampleRate,
      );
      const data = buffer.getChannelData(0);
      let seed = 0x345abc;
      for (let i = 0; i < data.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        data[i] =
          ((seed >>> 0) / 2147483648 - 1) *
          (0.85 + 0.15 * Math.sin((i / c.sampleRate) * Math.PI * 2 * 36));
      }
      this.noiseBuffers.set(seconds, buffer);
    }
    return buffer;
  }
  private burst(
    volume: number,
    duration: number,
    frequency: number,
    delay = 0,
    highpass = false,
    pan = 0,
  ) {
    if (this.shots.size >= 32) return;
    const c = this.ctx!,
      t = c.currentTime + delay,
      s = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      g = c.createGain(),
      p = c.createStereoPanner();
    s.buffer = this.noise(1);
    filter.type = highpass ? "highpass" : "lowpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.65;
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.00001, t + duration);
    s.connect(filter);
    filter.connect(g);
    g.connect(p);
    p.connect(this.bus!);
    this.shots.add(s);
    s.onended = () => {
      this.shots.delete(s);
      s.disconnect();
      filter.disconnect();
      g.disconnect();
      p.disconnect();
    };
    s.start(t);
    s.stop(t + duration);
  }
  private tone(
    volume: number,
    duration: number,
    from: number,
    to: number,
    type: OscillatorType = "triangle",
    delay = 0,
    pan = 0,
  ) {
    if (this.shots.size >= 32) return;
    const c = this.ctx!,
      t = c.currentTime + delay,
      o = c.createOscillator(),
      g = c.createGain(),
      p = c.createStereoPanner();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.00001, t + duration);
    p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(g);
    g.connect(p);
    p.connect(this.bus!);
    this.shots.add(o);
    o.onended = () => {
      this.shots.delete(o);
      o.disconnect();
      g.disconnect();
      p.disconnect();
    };
    o.start(t);
    o.stop(t + duration);
  }
  play(
    kind: string,
    volume = 1,
    weapon = 0,
    pan = 0,
    muffled = false,
    surface: StepSurface = "stone",
  ) {
    if (
      !this.ctx ||
      this.ctx.state !== "running" ||
      !this.master ||
      !this.effects
    )
      return;
    this.syncVolume();
    const v = Math.max(0, Math.min(1, volume));
    if (this.playSample(kind, v, weapon, pan, muffled, surface)) return;
    if (sampleCue(kind, weapon, surface, 0)) {
      this.fallbackStarts++;
      this.lastCue = `fallback: ${kind}`;
    }
    if (kind === "shot") {
      const profiles = [
        { crack: 2600, body: 125, tail: 0.2, gain: 0.24 },
        { crack: 3400, body: 175, tail: 0.1, gain: 0.16 },
        { crack: 1800, body: 85, tail: 0.28, gain: 0.32 },
        { crack: 2900, body: 105, tail: 0.3, gain: 0.27 },
      ];
      if (weapon === 6) {
        this.burst(v * 0.25, 0.24, 550, 0, false, pan);
        this.tone(v * 0.13, 0.2, 130, 45, "sine", 0, pan);
        return;
      }
      const p = profiles[weapon] ?? profiles[0];
      this.burst(v * p.gain, 0.055, muffled ? 650 : p.crack, 0, false, pan);
      this.burst(v * 0.15, p.tail, 680, 0, false, pan);
      this.tone(v * 0.1, p.tail, p.body, 45, "sine", 0, pan);
      this.burst(v * 0.035, 0.035, 1900, 0.06, true, pan);
      return;
    }
    if (kind === "explosion") {
      this.burst(v * 0.42, 0.75, 280, 0, false, pan);
      this.burst(v * 0.18, 0.1, 1500, 0, false, pan);
      this.tone(v * 0.2, 0.6, 70, 24, "sine", 0, pan);
      return;
    }
    if (kind === "throw") {
      this.burst(v * 0.07, 0.055, 1900, 0, true, pan);
      this.burst(v * 0.08, 0.12, 750, 0.035, false, pan);
      return;
    }
    if (kind === "impact") {
      this.burst(v * 0.12, 0.07, 2400, 0, false, pan);
      this.tone(v * 0.035, 0.07, 220, 85, "triangle", 0, pan);
      return;
    }
    if (
      [
        "reload-open",
        "reload-seat",
        "reload-shell",
        "reload-close",
        "action",
      ].includes(kind)
    ) {
      const frequency =
        kind === "reload-open"
          ? 1200
          : kind === "reload-shell"
            ? 2100
            : kind === "reload-seat"
              ? 1600
              : 2900;
      this.burst(
        v * 0.09,
        kind === "reload-close" ? 0.07 : 0.045,
        frequency,
        0,
        true,
        pan,
      );
      this.tone(
        v * 0.025,
        0.045,
        weapon === 2 ? 145 : 210,
        85,
        "triangle",
        0,
        pan,
      );
      return;
    }
    if (kind === "reload") {
      for (const [delay, freq] of [
        [0, 1500],
        [0.11, 2700],
        [0.24, 1900],
      ]) {
        this.burst(v * 0.14, 0.055, freq, delay, true, pan);
        this.tone(v * 0.035, 0.035, 180, 85, "triangle", delay, pan);
      }
      return;
    }
    if (
      kind === "dig" ||
      kind === "place" ||
      kind === "step" ||
      kind === "jump"
    ) {
      const step = kind === "step",
        jump = kind === "jump",
        dig = kind === "dig";
      this.burst(
        v * (step ? 0.25 : 0.16),
        step ? 0.085 : 0.12,
        step ? 650 : dig ? 1800 : 900,
        0,
        false,
        pan,
      );
      this.tone(
        v * (step ? 0.045 : 0.075),
        0.1,
        jump ? 125 : dig ? 170 : 110,
        45,
        "triangle",
        0,
        pan,
      );
      return;
    }
    if (kind === "damage") {
      this.burst(v * 0.18, 0.16, 800, 0, false, pan);
      this.tone(v * 0.1, 0.15, 150, 55, "sine", 0, pan);
      return;
    }
    if (kind === "infection") {
      this.burst(v * 0.11, 0.5, 450);
      this.tone(v * 0.075, 0.5, 210, 65, "triangle");
      return;
    }
    if (kind === "death" || kind === "fall") {
      this.burst(v * 0.15, 0.2, 400, 0, false, pan);
      return;
    }
    const pitches: Record<string, number> = {
      hit: 750,
      kill: 1050,
      objective: 660,
      pickup: 820,
      ui: 450,
    };
    this.tone(
      v * 0.055,
      kind === "objective" ? 0.16 : 0.06,
      pitches[kind] ?? 450,
      (pitches[kind] ?? 450) * 1.12,
    );
    if (kind === "objective" || kind === "kill" || kind === "pickup")
      this.tone(
        v * 0.06,
        0.14,
        (pitches[kind] ?? 450) * 1.5,
        (pitches[kind] ?? 450) * 1.5,
        "triangle",
        0.09,
      );
  }
  private playSample(
    kind: string,
    volume: number,
    weapon: number,
    pan: number,
    muffled: boolean,
    surface: StepSurface = "stone",
  ) {
    const name = sampleCue(kind, weapon, surface, this.sampleVariant++);
    const buffer = name ? this.samples.buffers.get(name) : null;
    if (!buffer || !this.ctx || !this.bus) return false;
    const priority = volume * (kind === "step" ? 0.3 : 1);
    if (this.shots.size >= 32) {
      // Long recorded tails can fill the budget in NPC fights. A quiet remote
      // tail must not suppress the local weapon/reload/death sound entirely.
      const quietest = [...this.sampleVolumes].sort((a, b) => a[1] - b[1])[0];
      if (!quietest || quietest[1] > priority) return true;
      this.sampleVolumes.delete(quietest[0]);
      this.shots.delete(quietest[0]);
      quietest[0].stop();
    }
    const c = this.ctx,
      source = c.createBufferSource(),
      gain = c.createGain(),
      panner = c.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value =
      kind === "step" ? 0.97 + (this.sampleVariant % 3) * 0.03 : 1;
    const level =
      kind === "shot"
        ? [0.72, 0.52, 0.86, 0.8, 0, 0, 0.75][weapon]
        : kind === "explosion"
          ? 0.7
          : kind.startsWith("reload-") || kind === "action"
            ? 0.32
            : kind === "step"
              ? 0.35
              : kind === "death"
                ? 0.5
                : kind === "fall"
                  ? 0.22
                  : 0.26;
    gain.gain.value = volume * level;
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    let filter: BiquadFilterNode | null = null;
    if (muffled) {
      filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 750;
      source.connect(filter);
      filter.connect(gain);
    } else source.connect(gain);
    gain.connect(panner);
    panner.connect(this.bus);
    if ((kind === "shot" || kind === "explosion") && this.echo)
      panner.connect(this.echo);
    this.shots.add(source);
    this.sampleVolumes.set(source, priority);
    source.onended = () => {
      this.shots.delete(source);
      this.sampleVolumes.delete(source);
      source.disconnect();
      filter?.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    source.start();
    this.recordedStarts++;
    this.lastCue = name!;
    return true;
  }
  async preview(kind: string, weapon: number) {
    if (!this.ctx) throw Error("Audio unavailable. Tap again to unlock.");
    await this.ctx.resume();
    await this.samples.load(this.ctx, true);
    const cue = sampleCue(kind, weapon, "stone", this.sampleVariant);
    if (!cue || !this.samples.buffers.has(cue))
      throw Error(
        `Recording unavailable: ${cue ?? kind}. ${cue ? (this.samples.errors.get(cue) ?? "") : ""}`,
      );
    if (!this.master || !this.effects)
      throw Error("Master or sound-effects volume is muted.");
    if (this.ctx.state !== "running")
      throw Error("Audio is suspended. Tap Test sound again.");
    this.play(kind, 0.85, weapon);
    return `Played recording: ${cue}.`;
  }
  async prepare() {
    if (!this.ctx || !this.master || !this.effects) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.samples.load(this.ctx),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, 5000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  async repairSession() {
    this.session = requestPlaybackSession(navigator as any, true);
    if (this.ctx) await this.ctx.resume();
    await this.reloadSamples();
  }
  reloadSamples() {
    if (this.ctx) return this.samples.load(this.ctx, true);
    return Promise.resolve();
  }
  updateJets(voices: JetVoice[]) {
    this.syncVolume();
    if (
      !this.ctx ||
      this.ctx.state !== "running" ||
      !this.master ||
      !this.effects
    ) {
      this.stopJets();
      return;
    }
    const c = this.ctx,
      t = c.currentTime,
      active = new Set(voices.slice(0, 4).map((v) => v.id));
    for (const id of this.engines.keys()) if (!active.has(id)) this.stopJet(id);
    for (const v of voices.slice(0, 4)) {
      let e = this.engines.get(v.id);
      const jetBuffer = this.samples.buffers.get("jet-loop");
      if (e && jetBuffer && !e.sampled) {
        this.stopJet(v.id, false);
        e = undefined;
      }
      if (!e) {
        const noise = c.createBufferSource(),
          tone = jetBuffer ? null : c.createOscillator(),
          filter = c.createBiquadFilter(),
          gain = c.createGain(),
          pan = c.createStereoPanner();
        noise.buffer = jetBuffer ?? this.noise(2);
        noise.loop = true;
        filter.type = "lowpass";
        filter.frequency.value = 850;
        if (tone) {
          tone.type = "triangle";
          tone.frequency.value = 78;
        }
        gain.gain.value = 0;
        noise.connect(filter);
        tone?.connect(filter);
        filter.connect(gain);
        gain.connect(pan);
        pan.connect(this.bus!);
        e = { noise, tone, filter, gain, pan, sampled: !!jetBuffer };
        this.engines.set(v.id, e);
        this.starts++;
        noise.onended = () => {
          noise.disconnect();
          tone?.disconnect();
          filter.disconnect();
          gain.disconnect();
          pan.disconnect();
        };
        noise.start();
        tone?.start();
        if (!this.playSample("jet-start", 0.4 * v.gain, 0, v.pan, false)) {
          this.burst(0.055 * v.gain, 0.1, 1800, 0, false, v.pan);
          this.tone(0.035 * v.gain, 0.14, 50, 95, "sine", 0, v.pan);
        }
      }
      e.gain.gain.setTargetAtTime(
        (e.sampled ? 0.36 : 0.15) * Math.max(0, Math.min(1, v.gain)),
        t,
        0.045,
      );
      e.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, v.pan)), t, 0.06);
      e.filter.frequency.setTargetAtTime(
        e.sampled
          ? 1500 + Math.max(0, Math.min(1, v.load)) * 2500
          : 650 + Math.max(0, Math.min(1, v.load)) * 450,
        t,
        0.08,
      );
      if (e.sampled)
        e.noise.playbackRate.setTargetAtTime(
          0.92 + Math.max(0, Math.min(1, v.load)) * 0.16,
          t,
          0.08,
        );
      e.tone?.frequency.setTargetAtTime(
        70 + Math.max(0, Math.min(1, v.load)) * 25,
        t,
        0.08,
      );
    }
  }
  private stopJet(id: string, emit = true) {
    const e = this.engines.get(id);
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    e.gain.gain.cancelScheduledValues(t);
    e.gain.gain.setTargetAtTime(0, t, 0.015);
    const end = this.ctx.state === "running" ? t + 0.08 : t;
    e.noise.stop(end);
    e.tone?.stop(end);
    this.engines.delete(id);
    if (emit && this.ctx.state === "running" && this.master && this.effects)
      if (!this.playSample("jet-stop", 0.3, 0, e.pan.pan.value, false))
        this.burst(0.025, 0.07, 350, 0, false, e.pan.pan.value);
  }
  stopJets() {
    for (const id of this.engines.keys()) this.stopJet(id, false);
  }
  get diagnostics() {
    return {
      state: this.ctx?.state ?? "locked",
      delivery: this.delivery,
      session: this.session,
      resumeError: this.resumeError,
      engines: this.engines.size,
      starts: this.starts,
      voices: this.shots.size,
      cachedBuffers: this.noiseBuffers.size,
      samples: this.samples.status,
      recordedStarts: this.recordedStarts,
      fallbackStarts: this.fallbackStarts,
      lastCue: this.lastCue,
    };
  }
}

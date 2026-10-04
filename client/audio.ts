// Original procedural audio: no samples or assets from another game.
import { JetVoice } from "./audio-mix.js";
type Engine = {
  noise: AudioBufferSourceNode;
  tone: OscillatorNode;
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
  private engines = new Map<string, Engine>();
  private starts = 0;
  unlock() {
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
    }
    void this.ctx!.resume().catch(() => {});
    this.syncVolume();
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
  play(kind: string, volume = 1, weapon = 0, pan = 0) {
    if (
      !this.ctx ||
      this.ctx.state !== "running" ||
      !this.master ||
      !this.effects
    )
      return;
    this.syncVolume();
    const v = Math.max(0, Math.min(1, volume));
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
      this.burst(v * p.gain, 0.055, p.crack, 0, false, pan);
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
      if (!e) {
        const noise = c.createBufferSource(),
          tone = c.createOscillator(),
          filter = c.createBiquadFilter(),
          gain = c.createGain(),
          pan = c.createStereoPanner();
        noise.buffer = this.noise(2);
        noise.loop = true;
        filter.type = "lowpass";
        filter.frequency.value = 850;
        tone.type = "triangle";
        tone.frequency.value = 78;
        gain.gain.value = 0;
        noise.connect(filter);
        tone.connect(filter);
        filter.connect(gain);
        gain.connect(pan);
        pan.connect(this.bus!);
        e = { noise, tone, filter, gain, pan };
        this.engines.set(v.id, e);
        this.starts++;
        noise.onended = () => {
          noise.disconnect();
          tone.disconnect();
          filter.disconnect();
          gain.disconnect();
          pan.disconnect();
        };
        noise.start();
        tone.start();
        this.burst(0.055 * v.gain, 0.1, 1800, 0, false, v.pan);
        this.tone(0.035 * v.gain, 0.14, 50, 95, "sine", 0, v.pan);
      }
      e.gain.gain.setTargetAtTime(
        0.15 * Math.max(0, Math.min(1, v.gain)),
        t,
        0.045,
      );
      e.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, v.pan)), t, 0.06);
      e.filter.frequency.setTargetAtTime(
        650 + Math.max(0, Math.min(1, v.load)) * 450,
        t,
        0.08,
      );
      e.tone.frequency.setTargetAtTime(
        70 + Math.max(0, Math.min(1, v.load)) * 25,
        t,
        0.08,
      );
    }
  }
  private stopJet(id: string) {
    const e = this.engines.get(id);
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    e.gain.gain.cancelScheduledValues(t);
    e.gain.gain.setTargetAtTime(0, t, 0.015);
    const end = this.ctx.state === "running" ? t + 0.08 : t;
    e.noise.stop(end);
    e.tone.stop(end);
    this.engines.delete(id);
    if (this.ctx.state === "running" && this.master && this.effects)
      this.burst(0.025, 0.07, 350, 0, false, e.pan.pan.value);
  }
  stopJets() {
    for (const id of this.engines.keys()) this.stopJet(id);
  }
  get diagnostics() {
    return {
      state: this.ctx?.state ?? "locked",
      engines: this.engines.size,
      starts: this.starts,
      voices: this.shots.size,
      cachedBuffers: this.noiseBuffers.size,
    };
  }
}

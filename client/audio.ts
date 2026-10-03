// All sounds are original procedural synthesis. No downloaded sound assets.
export class Sound {
  ctx: AudioContext | null = null;
  master = 0.55;
  effects = 0.75;
  lastStep = 0;
  unlock() {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
  }
  play(kind: string, volume = 1) {
    if (
      !this.ctx ||
      this.ctx.state !== "running" ||
      !this.master ||
      !this.effects
    )
      return;
    const c = this.ctx,
      t = c.currentTime,
      g = c.createGain();
    g.connect(c.destination);
    const gain = this.master * this.effects * volume * 0.15;
    const duration =
      kind === "jet"
        ? 0.13
        : kind === "infection"
          ? 0.55
          : kind === "reload"
            ? 0.12
            : 0.09;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    if (["shot", "dig", "step", "damage", "jet"].includes(kind)) {
      const buffer = c.createBuffer(
          1,
          Math.ceil(c.sampleRate * duration),
          c.sampleRate,
        ),
        a = buffer.getChannelData(0);
      for (let i = 0; i < a.length; i++)
        a[i] = (Math.random() * 2 - 1) * (1 - i / a.length);
      const s = c.createBufferSource(),
        filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value =
        kind === "shot"
          ? 2200
          : kind === "jet"
            ? 600
            : kind === "step"
              ? 300
              : 1100;
      s.buffer = buffer;
      s.connect(filter);
      filter.connect(g);
      s.start(t);
      s.stop(t + duration);
    } else {
      const o = c.createOscillator();
      o.type = kind === "infection" ? "sawtooth" : "square";
      const f: Record<string, number> = {
        hit: 780,
        kill: 1040,
        reload: 180,
        place: 340,
        jump: 400,
        objective: 880,
        ui: 520,
        infection: 130,
      };
      o.frequency.setValueAtTime(f[kind] ?? 500, t);
      o.frequency.exponentialRampToValueAtTime(
        (f[kind] ?? 500) * (kind === "infection" ? 0.4 : 1.4),
        t + duration,
      );
      o.connect(g);
      o.start(t);
      o.stop(t + duration);
    }
  }
}

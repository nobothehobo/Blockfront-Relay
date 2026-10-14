// Bounded rolling measurements, in milliseconds. Runtime diagnostics only.
export class Timings {
  private values: number[] = [];
  private cursor = 0;
  constructor(private capacity = 180) {}
  add(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    if (this.values.length < this.capacity) this.values.push(ms);
    else {
      this.values[this.cursor] = ms;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
  }
  reset() {
    this.values = [];
    this.cursor = 0;
  }
  summary() {
    const sorted = [...this.values].sort((a, b) => a - b);
    return {
      samples: sorted.length,
      mean: sorted.length
        ? sorted.reduce((a, b) => a + b, 0) / sorted.length
        : 0,
      p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
    };
  }
}

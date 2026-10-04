// Arrival timing, not RTT, determines how much remote motion to buffer.
export class SnapshotClock {
  offset = 0;
  interval = 100;
  jitter = 0;
  delay = 120;
  lastArrival = -1;
  latest = 0;
  rendered = 0;
  gaps = 0;
  samples = 0;
  reset() {
    Object.assign(this, new SnapshotClock());
  }
  observe(serverMs: number, now: number) {
    if (!Number.isFinite(serverMs) || (this.samples && serverMs <= this.latest))
      return false;
    if (this.samples) {
      const arrivalGap = now - this.lastArrival;
      const serverGap = serverMs - this.latest;
      if (arrivalGap > 500) this.gaps++;
      this.interval += (Math.min(300, serverGap) - this.interval) * 0.1;
      this.jitter +=
        (Math.min(300, Math.abs(arrivalGap - serverGap)) - this.jitter) * 0.2;
      // Slow adjustment avoids rewinding the render clock after a delayed packet.
      this.offset += (now - serverMs - this.offset) * 0.1;
    } else this.offset = now - serverMs;
    this.delay = Math.max(
      100,
      Math.min(250, this.interval + 20 + this.jitter * 2),
    );
    this.latest = serverMs;
    this.lastArrival = now;
    this.samples++;
    return true;
  }
  renderTime(now: number) {
    // Never extrapolate terrain collisions or interpolate backwards through jitter.
    this.rendered = Math.max(
      this.rendered,
      Math.min(this.latest, now - this.offset - this.delay),
    );
    return this.rendered;
  }
}

export class ConnectionStats {
  corrections = 0;
  hardCorrections = 0;
  maxCorrection = 0;
  lastCorrection = 0;
  totalCorrection = 0;
  predictionStops = 0;
  failures = 0;
  bytesSent = 0;
  observeCorrection(distance: number, hard: boolean) {
    if (distance < 0.001) return;
    this.corrections++;
    this.hardCorrections += Number(hard);
    this.lastCorrection = distance;
    this.maxCorrection = Math.max(this.maxCorrection, distance);
    this.totalCorrection += distance;
  }
  reset() {
    Object.assign(this, new ConnectionStats());
  }
}

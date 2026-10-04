import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotClock, ConnectionStats } from "../client/net-timing.js";
import { sanitizeInput } from "../shared/prediction.js";
import { emptyInput } from "../shared/game.js";

test("snapshot clock follows server time, buffers jitter and never renders backwards or beyond latest state", () => {
  const clock = new SnapshotClock();
  let previous = 0;
  for (let n = 1; n <= 40; n++) {
    const at = n * 100 + 10000 + (n % 3) * 40;
    assert.ok(clock.observe(n * 100, at));
    const render = clock.renderTime(at);
    assert.ok(render >= previous && render <= n * 100);
    previous = render;
  }
  assert.ok(clock.jitter > 10);
  assert.ok(clock.delay >= 100 && clock.delay <= 250);
  assert.equal(clock.observe(100, 15000), false, "old snapshots are rejected");
  assert.equal(
    clock.renderTime(90000),
    4000,
    "outage freezes instead of predicting remote collisions",
  );
  clock.reset();
  assert.ok(clock.observe(0, 100));
  assert.equal(clock.samples, 1);
});
test("stable snapshot buffering does not inflate with high RTT", () => {
  const low = new SnapshotClock(),
    high = new SnapshotClock();
  for (let n = 1; n < 30; n++) {
    low.observe(n * 100, n * 100 + 30);
    high.observe(n * 100, n * 100 + 600);
  }
  assert.equal(low.delay, high.delay);
  assert.equal(low.delay, 120);
});
test("connection metrics distinguish real corrections and hard relocations", () => {
  const stats = new ConnectionStats();
  stats.observeCorrection(0.00001, false);
  stats.observeCorrection(0.2, false);
  stats.observeCorrection(3, true);
  assert.equal(stats.corrections, 2);
  assert.equal(stats.hardCorrections, 1);
  assert.equal(stats.maxCorrection, 3);
  stats.reset();
  assert.equal(stats.corrections, 0);
});
test("bridge selection survives the wire sanitizer; invalid kit and view times are rejected", () => {
  assert.equal(sanitizeInput({ ...emptyInput(), buildKit: 4 })?.buildKit, 4);
  assert.equal(sanitizeInput({ ...emptyInput(), buildKit: 5 })?.buildKit, 0);
  assert.equal(
    sanitizeInput({ ...emptyInput(), viewTime: NaN })?.viewTime,
    undefined,
  );
  assert.equal(
    sanitizeInput({ ...emptyInput(), viewTime: -1 })?.viewTime,
    undefined,
  );
  assert.equal(
    sanitizeInput({ ...emptyInput(), viewTime: 1.2 })?.viewTime,
    1.2,
  );
});

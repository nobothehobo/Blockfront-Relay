import test from "node:test";
import assert from "node:assert/strict";
import { jetVoices, JetPlayer } from "../client/audio-mix.js";
import { Room } from "../server/room.js";
const player = (id: string, x = 0): JetPlayer => ({
  id,
  x,
  y: 10,
  z: 0,
  dead: 0,
  jetpack: true,
  fuel: 90,
  thrusting: true,
});
test("jet mix follows local fuel and life and silences pause, hidden tabs and disabled packs", () => {
  const p = player("me");
  assert.equal(jetVoices(p, true, [], 0, false, false)[0].gain, 1);
  for (const changed of [
    { fuel: 0 },
    { fuel: 1 },
    { dead: 3 },
    { jetpack: false },
  ])
    assert.deepEqual(
      jetVoices({ ...p, ...changed }, true, [], 0, false, false),
      [],
    );
  assert.deepEqual(jetVoices(p, false, [], 0, false, false), []);
  assert.deepEqual(
    jetVoices(p, true, [player("other", 2)], 0, true, false),
    [],
  );
  assert.deepEqual(
    jetVoices(p, true, [player("other", 2)], 0, false, true),
    [],
  );
  assert.deepEqual(jetVoices(null, true, [], 0, false, false), []);
});
test("only three nearest live remote engines are audible, with heading-relative pan and falloff", () => {
  const p = player("me"),
    others = [
      player("far", 41),
      player("left", -5),
      player("right", 8),
      player("third", 12),
      player("fourth", 14),
      { ...player("dead", 1), dead: 3 },
      { ...player("off", 1), thrusting: false },
    ];
  const mix = jetVoices(p, true, [p, ...others], 0, false, false);
  assert.deepEqual(
    mix.map((v) => v.id),
    ["me", "left", "right", "third"],
  );
  assert.ok(mix[1].pan < 0 && mix[2].pan > 0);
  assert.ok(mix[1].gain > mix[2].gain);
  assert.ok(
    jetVoices(p, false, [player("right", 8)], Math.PI, false, false)[0].pan < 0,
  );
});
test("remote thrust snapshots derive from server-owned life, equipment, fuel and accepted input", () => {
  const r = new Room("sound", {
    name: "Sound",
    mode: "tdm",
    jet: "classes",
    seed: 7,
  });
  const p = r.add("a", "A", { send: () => {} }, false, 1);
  p.input.jet = true;
  const thrust = () => r.state().players[0].thrusting;
  assert.equal(thrust(), true);
  p.fuel = 0;
  assert.equal(thrust(), false);
  p.fuel = 50;
  p.jetpack = false;
  assert.equal(thrust(), false);
  p.jetpack = true;
  p.dead = 3;
  assert.equal(thrust(), false);
  p.dead = 0;
  p.input.jet = false;
  assert.equal(thrust(), false);
});

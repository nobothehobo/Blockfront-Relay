import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { World, emptyInput } from "../shared/game.js";
function setup(rewind = true) {
  const room = new Room(
    "rewind",
    { name: "Rewind", mode: "tdm", jet: "off", seed: 1, rewind },
    new World(1, false),
  );
  const a = room.add("a", "A", { send() {} }),
    b = room.add("b", "B", { send() {} });
  room.phase = "active";
  Object.assign(a, {
    x: 40,
    y: 1,
    z: 40,
    yaw: 0,
    pitch: -0.12,
    weapon: 3,
    protected: 0,
    input: { ...emptyInput(), aim: true, viewTime: 0.8 },
  });
  Object.assign(b, { x: 40, y: 1, z: 35, protected: 0 });
  room.hitHistory.record(0.8, room.players.values());
  b.x = 43;
  room.hitHistory.record(1, room.players.values());
  room.time = 1;
  return { room, a, b };
}
test("dedicated hitscan hits the recent rendered pose while damage and ammo remain authoritative", () => {
  const { room, a, b } = setup();
  const ammo = a.ammo[3];
  room.fire(a);
  assert.equal(b.health, 28);
  assert.equal(a.ammo[3], ammo - 1);
  room.fire(a);
  assert.equal(b.health, 28, "rewind never bypasses fire cooldown");
});
test("hosted/disabled rewind uses current positions", () => {
  const { room, a, b } = setup(false);
  room.fire(a);
  assert.equal(b.health, 100);
});
test("rewind keeps current terrain cover and spawn protection", () => {
  const { room, a, b } = setup();
  for (let x = 39; x <= 41; x++)
    for (let y = 1; y <= 3; y++) room.world.set(x, y, 37, 3);
  room.fire(a);
  assert.equal(b.health, 100, "newly built cover blocks historical hitboxes");
  for (let x = 39; x <= 41; x++)
    for (let y = 1; y <= 3; y++) room.world.set(x, y, 37, 0);
  a.cooldown = 0;
  b.protected = 2;
  room.fire(a);
  assert.equal(b.health, 100);
});
test("history clamps excessive rewind, rejects future times and never crosses a respawn epoch", () => {
  const { room, a, b } = setup();
  a.input.viewTime = 2;
  room.fire(a);
  assert.equal(b.health, 100);
  a.cooldown = 0;
  a.input.viewTime = 0.8;
  b.epoch!++;
  room.fire(a);
  assert.equal(b.health, 100);
  const history = room.hitHistory;
  b.epoch!--;
  history.frames[0].poses.get(b.id)!.x = 43;
  history.frames.unshift({
    time: 0.5,
    poses: new Map([[b.id, { ...b, x: 40 }]]),
  });
  a.cooldown = 0;
  a.input.viewTime = 0.5;
  room.fire(a);
  assert.equal(b.health, 100, "cannot reach beyond 200ms");
  for (let n = 0; n < 100; n++)
    history.record(2 + n / 30, room.players.values());
  assert.ok(history.frames.length <= 12);
});

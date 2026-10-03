import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import {
  World,
  W,
  D,
  TICK,
  idx,
  emptyInput,
  move,
  Input,
} from "../shared/game.js";
import { replay } from "../shared/prediction.js";
function setup() {
  const world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  const room = new Room(
    "latency",
    { name: "Latency", mode: "tdm", jet: "all", seed: 1 },
    world,
  );
  const player = room.add("a", "A", { send: () => {} });
  room.add("b", "B", { send: () => {} });
  Object.assign(player, {
    x: 80,
    y: 1.01,
    z: 80,
    ground: true,
    vx: 0,
    vy: 0,
    vz: 0,
    commandMode: true,
  });
  room.phase = "active";
  room.remaining = 300;
  return { room, player, world };
}
for (const latency of [100, 250, 650])
  test(`acknowledged replay prevents stale-snapshot pull at ${latency} ms one-way latency with jitter`, () => {
    const { room, player, world } = setup();
    let local = { ...player },
      pending: Input[] = [],
      maxError = 0;
    const messages: { at: number; kind: "input" | "state"; value: any }[] = [];
    let random = 17;
    const delay = () => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return Math.round((latency + (random % 40)) / 1000 / TICK);
    };
    let lastInput = 0,
      lastState = 0;
    for (let frame = 0; frame < 300; frame++) {
      const command = {
        ...emptyInput(),
        seq: frame + 1,
        forward: frame < 220 ? 1 : 0,
        strafe: frame >= 90 && frame < 180 ? 0.5 : 0,
        yaw: 0.15,
        jump: frame === 70,
        jet: frame >= 140 && frame < 165,
      };
      pending.push(command);
      move(local, command, world, TICK, false, true);
      if (frame % 2 === 0) {
        lastInput = Math.max(lastInput, frame + delay());
        messages.push({
          at: lastInput,
          kind: "input",
          value: pending.slice(0, 64),
        });
      }
      for (const m of messages.filter(
        (m) => m.kind === "input" && m.at <= frame,
      )) {
        room.queueInputs("a", m.value, player.epoch!);
        messages.splice(messages.indexOf(m), 1);
      }
      room.tick();
      if (frame % 3 === 0) {
        lastState = Math.max(lastState, frame + delay());
        const snapshot = room.state().players.find((p) => p.id === "a")!;
        messages.push({ at: lastState, kind: "state", value: snapshot });
      }
      for (const m of messages.filter(
        (m) => m.kind === "state" && m.at <= frame,
      )) {
        pending = pending.filter((c) => c.seq > m.value.lastSeq);
        const corrected = replay(m.value, pending, world, false, true);
        maxError = Math.max(
          maxError,
          Math.hypot(
            corrected.x - local.x,
            corrected.y - local.y,
            corrected.z - local.z,
          ),
        );
        local = corrected;
        messages.splice(messages.indexOf(m), 1);
      }
    }
    assert.ok(maxError < 1e-8, `Prediction correction ${maxError}`);
    assert.ok(player.lastSeq > 265);
  });
test("a stalled transport does not mutate the acknowledged movement body", () => {
  const { room, player } = setup();
  room.queueInputs(
    "a",
    [{ ...emptyInput(), seq: 1, jump: true }],
    player.epoch!,
  );
  room.tick();
  const body = [
    player.x,
    player.y,
    player.z,
    player.vx,
    player.vy,
    player.vz,
    player.fuel,
  ];
  for (let n = 0; n < 45; n++) room.tick();
  assert.deepEqual(
    [
      player.x,
      player.y,
      player.z,
      player.vx,
      player.vy,
      player.vz,
      player.fuel,
    ],
    body,
  );
});
test("input flooding cannot create extra simulation time, and old spawn commands are rejected", () => {
  const { room, player } = setup();
  for (let frame = 0; frame < 30; frame++) {
    const seq = player.commandSeq ?? 0;
    room.queueInputs(
      "a",
      Array.from({ length: 16 }, (_, n) => ({
        ...emptyInput(),
        seq: seq + n + 1,
        forward: 1,
        sprint: true,
      })),
      player.epoch!,
    );
    room.tick();
  }
  assert.ok(80 - player.z < 7.2);
  assert.ok(player.lastSeq <= 30);
  const epoch = player.epoch!;
  room.spawn(player);
  room.queueInputs("a", [{ ...emptyInput(), seq: 1, forward: 1 }], epoch);
  assert.equal(player.commands?.length, 0);
});
test("brief fire taps survive a batched command followed by a released button", () => {
  const { room, player } = setup();
  player.protected = 0;
  const ammo = player.ammo[0];
  room.queueInputs(
    "a",
    [
      { ...emptyInput(), seq: 1, fire: true },
      { ...emptyInput(), seq: 2, fire: false },
    ],
    player.epoch!,
  );
  player.movementCredit = TICK * 2;
  room.tick();
  assert.equal(player.ammo[0], ammo - 1);
  for (let n = 0; n < 15; n++) room.tick();
  assert.equal(player.ammo[0], ammo - 1);
});

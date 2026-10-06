import test from "node:test";
import assert from "node:assert/strict";
import {
  World,
  W,
  D,
  idx,
  emptyInput,
  TICK,
  move,
  Input,
} from "../shared/game.js";
import { PracticeSession } from "../server/practice.js";
import { eliminationCamera } from "../client/elimination.js";
import { spaceThrust } from "../client/hybrid-input.js";
import { inputPacket, MAX_PENDING_INPUTS } from "../client/network.js";
import { replay } from "../shared/prediction.js";

function flat() {
  const world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  return world;
}
test("keyboard Space thrust starts only airborne with a jetpack and stops on release/death", () => {
  const held = new Set(["Space"]);
  assert.equal(spaceThrust(held, true, true, 0), false);
  assert.equal(spaceThrust(held, false, true, 0), true);
  assert.equal(spaceThrust(held, false, false, 0), false);
  assert.equal(spaceThrust(held, false, true, 3), false);
  held.clear();
  assert.equal(spaceThrust(held, false, true, 0), false);
});
test("death camera keeps one shoulder throughout the countdown, even when other arms open", () => {
  const world = flat(),
    body = { x: 50.5, y: 1.01, z: 50.5 };
  const initial = eliminationCamera(world, body, 0, 0);
  for (let frame = 0; frame < 180; frame++) {
    const view = eliminationCamera(world, body, 0, frame / 60, initial.angle);
    assert.deepEqual(view.position, initial.position);
    assert.equal(view.angle, initial.angle);
  }
  world.set(53, 3, 53, 3);
  const clipped = eliminationCamera(world, body, 0, 2, initial.angle);
  assert.equal(clipped.angle, initial.angle);
});
test("on-device practice spawns balanced 8v8 teams and publishes authoritative state without HTTP", () => {
  const messages: any[] = [];
  const session = new PracticeSession(
    { name: "Local", mode: "ctf", jet: "all", seed: 1, bots: 15, limit: 16 },
    "Tester",
    1,
    (m) => messages.push(m),
    flat(),
  );
  assert.equal(session.room.players.size, 16);
  assert.deepEqual(
    [0, 1].map(
      (team) =>
        [...session.room.players.values()].filter((p) => p.team === team)
          .length,
    ),
    [8, 8],
  );
  assert.equal(messages[0].type, "welcome");
  assert.equal(messages[0].id, session.playerId);
  for (let i = 0; i < 12; i++) session.tick();
  assert.ok(messages.some((m) => m.type === "state"));
  assert.equal(session.room.flags.length, 2);
});
test("actual bounded HTTP packets sustain movement at 1.4 second RTT without backlog freeze", () => {
  const world = flat();
  const session = new PracticeSession(
    { name: "Latency", mode: "tdm", jet: "all", seed: 1, bots: 0 },
    "Tester",
    0,
    () => {},
    world,
  );
  const room = session.room,
    p = room.players.get(session.playerId)!;
  room.add("other", "Other", { send: () => {} });
  room.phase = "active";
  Object.assign(p, {
    x: 80,
    y: 1.01,
    z: 80,
    ground: true,
    vx: 0,
    vy: 0,
    vz: 0,
    commandMode: true,
  });
  let local = { ...p },
    pending: Input[] = [],
    seq = 0,
    blocked = 0,
    maximum = 0,
    maxError = 0;
  type Flight = {
    requestAt: number;
    responseAt: number;
    commands: Input[];
    snapshot?: any;
  };
  let flight: Flight | null = null;
  for (let frame = 0; frame < 900; frame++) {
    const delivery = flight as Flight | null;
    if (delivery?.requestAt === frame) {
      session.input(delivery.commands, p.epoch!);
      room.consumeMovement(p, 64);
    }
    session.tick();
    if (delivery?.requestAt === frame)
      delivery.snapshot = {
        ...room.state().players.find((v) => v.id === p.id)!,
      };
    if (delivery?.responseAt === frame) {
      pending = pending.filter((c) => c.seq > delivery.snapshot.lastSeq);
      const corrected = replay(delivery.snapshot, pending, world, false, true);
      maxError = Math.max(
        maxError,
        Math.hypot(
          local.x - corrected.x,
          local.y - corrected.y,
          local.z - corrected.z,
        ),
      );
      local = corrected;
      flight = null;
    }
    if (pending.length < MAX_PENDING_INPUTS) {
      const command = {
        ...emptyInput(),
        seq: ++seq,
        forward: 1,
        yaw: 0.12345678901234567,
        pitch: -0.12345678901234567,
      };
      pending.push(command);
      move(local, command, world, TICK, false, true);
    } else blocked++;
    maximum = Math.max(maximum, pending.length);
    if (!flight) {
      const commands = JSON.parse(
        inputPacket({ epoch: p.epoch }, pending).body,
      ).commands;
      flight = { requestAt: frame + 21, responseAt: frame + 42, commands };
    }
  }
  assert.equal(
    blocked,
    0,
    `max ${maximum}, seq ${seq}, acknowledged ${p.lastSeq}`,
  );
  assert.ok(maximum < MAX_PENDING_INPUTS);
  assert.ok(maxError < 0.001, `movement corrections: ${maxError}`);
  const oldEpoch = p.epoch!;
  room.spawn(p);
  session.input([{ ...emptyInput(), seq: 1, forward: 1 }], oldEpoch);
  assert.equal(p.commands!.length, 0, "old-life input rejected");
});

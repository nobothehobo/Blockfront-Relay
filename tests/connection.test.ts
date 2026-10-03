import assert from "node:assert/strict";
import { test } from "node:test";
import { inputPacket, requestJson, ApiError } from "../client/network.js";
import { emptyInput } from "../shared/game.js";
import { sanitizeInput } from "../shared/prediction.js";

test("movement packets fit both 8 KiB transports and preserve commands, action pulses and sequence order", () => {
  const pending = Array.from({ length: 120 }, (_, i) => ({
    ...emptyInput(),
    seq: i + 1,
    forward: 0.12345678901234567,
    yaw: Math.PI,
    pitch: -0.12345678901234567,
    grenade: i === 2,
    ability: false,
    buildKit: 3,
    classId: 2,
  }));
  const metadata = {
    room: "test-room",
    token: "test-session",
    epoch: 2,
    cursor: 100,
    round: 10,
    revision: 500,
  };
  assert.ok(
    JSON.stringify({ ...metadata, commands: pending.slice(0, 64) }).length >
      8192,
    "reproduces original oversized request",
  );
  while (pending.length) {
    const packet = inputPacket(metadata, pending);
    assert.ok(new TextEncoder().encode(packet.body).byteLength <= 7000);
    const wire = JSON.parse(packet.body).commands;
    assert.ok(wire.length > 0 && wire.length <= 24);
    for (let i = 0; i < wire.length; i++)
      assert.deepEqual(sanitizeInput(wire[i]), sanitizeInput(pending[i]));
    assert.equal(packet.lastSeq, pending[wire.length - 1].seq);
    pending.splice(0, wire.length);
  }
});

test("HTTP timeout releases a hung fetch and errors retain status for recovery", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Timed out", "AbortError")),
        );
      });
    await assert.rejects(requestJson("https://test.invalid", undefined, 20), {
      name: "AbortError",
    });
    globalThis.fetch = async () =>
      new Response('{"error":"Session expired"}', { status: 401 });
    await assert.rejects(
      requestJson("https://test.invalid"),
      (error: any) => error instanceof ApiError && error.status === 401,
    );
    globalThis.fetch = async () => new Response('{"ok":true}');
    assert.deepEqual(await requestJson("https://test.invalid"), { ok: true });
  } finally {
    globalThis.fetch = original;
  }
});

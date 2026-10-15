import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SAMPLE_FILES,
  SampleBank,
  sampleCue,
  footSurface,
  decodePcmWav,
} from "../client/sampled-audio.js";
import { insideCharacter } from "../client/nearby-presentation.js";
import { Sound } from "../client/audio.js";

test("every recorded cue maps to a valid shipped PCM file and individual source/license credit", async () => {
  const manifest = JSON.parse(
    await readFile("assets/sfx/manifest.json", "utf8"),
  );
  for (const name of SAMPLE_FILES) {
    const bytes = await readFile(`client/public/sfx/${name}.wav`);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
    assert.equal(bytes.readUInt16LE(20), 1);
    assert.equal(bytes.readUInt16LE(22), 1);
    assert.equal(bytes.readUInt32LE(24), 32000);
    assert.equal(bytes.readUInt16LE(34), 16);
    const credit = manifest.find((row: any) => row.file === name + ".wav");
    assert.ok(credit?.creator && credit?.sourcePage && credit?.licenseUrl);
    assert.equal(credit.bytes, bytes.length);
  }
  for (let weapon = 0; weapon < 4; weapon++)
    for (let variant = 0; variant < 2; variant++)
      assert.ok(
        SAMPLE_FILES.includes(sampleCue("shot", weapon, "stone", variant)!),
      );
  assert.equal(sampleCue("shot", 6, "stone", 0), "launcher-1");
  for (const weapon of [0, 1, 2, 3, 6]) {
    for (const kind of [
      "reload-open",
      weapon === 2 || weapon === 6 ? "reload-shell" : "reload-seat",
      "reload-close",
    ]) {
      assert.ok(SAMPLE_FILES.includes(sampleCue(kind, weapon, "stone", 0)!));
    }
  }
  assert.equal(sampleCue("explosion", 0, "stone", 1), "explosion-2");
  assert.equal(sampleCue("action", 2, "stone", 0), "shotgun-action");
  assert.equal(sampleCue("action", 3, "stone", 0), "marksman-action");
  assert.equal(footSurface(14), "snow");
  assert.equal(footSurface(4), "wood");
});

test("sound downloads reuse decoded buffers, contain failures, and retry only missing clips", async () => {
  const wav = await readFile("client/public/sfx/rifle-1.wav");
  let calls = 0,
    fail = true;
  const bank = new SampleBank((async (url: string) => {
    calls++;
    if (url.includes("rifle-1") && fail)
      return new Response("missing", { status: 404 });
    return new Response(wav);
  }) as typeof fetch);
  const context = {
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
  } as unknown as AudioContext;
  const pending = bank.load(context);
  assert.equal(bank.load(context), pending);
  await pending;
  assert.equal(bank.status.ready, SAMPLE_FILES.length - 1);
  assert.equal(bank.status.failed, 1);
  await bank.load(context);
  assert.equal(calls, SAMPLE_FILES.length);
  fail = false;
  await bank.load(context, true);
  assert.equal(calls, SAMPLE_FILES.length + 1);
  assert.equal(bank.status.ready, SAMPLE_FILES.length);
  assert.equal(bank.status.failed, 0);
});

test("PCM reader decodes every shipped recording into audible normalized samples without a browser codec", async () => {
  const context = {
    createBuffer: (_channels: number, length: number, rate: number) => {
      const samples = new Float32Array(length);
      return { sampleRate: rate, getChannelData: () => samples };
    },
  } as unknown as AudioContext;
  for (const name of SAMPLE_FILES) {
    const bytes = await readFile(`client/public/sfx/${name}.wav`);
    const buffer = decodePcmWav(
      context,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    assert.equal(buffer.sampleRate, 32000);
    const values = buffer.getChannelData(0);
    assert.ok(
      values.some((value) => Math.abs(value) > 0.1),
      name + " must not decode silently",
    );
    assert.ok(
      values.every((value) => Number.isFinite(value) && Math.abs(value) <= 1),
    );
  }
  assert.throws(() => decodePcmWav(context, new ArrayBuffer(48)), /WAV/);
});

test("nearby body suppression has stable entry/exit thresholds and preserves different-height players", () => {
  const feet = { x: 10, y: 10, z: 10 };
  assert.equal(insideCharacter({ x: 10.4, y: 11.6, z: 10 }, feet, false), true);
  assert.equal(
    insideCharacter({ x: 10.7, y: 11.6, z: 10 }, feet, false),
    false,
  );
  assert.equal(insideCharacter({ x: 10.7, y: 11.6, z: 10 }, feet, true), true);
  assert.equal(insideCharacter({ x: 10.9, y: 11.6, z: 10 }, feet, true), false);
  assert.equal(insideCharacter({ x: 10, y: 14, z: 10 }, feet, true), false);
});

test("sound preview waits for its recording and reports a missing sample instead of playing fallback", async () => {
  const sound = new Sound();
  sound.ctx = {
    resume: async () => {},
    state: "running",
  } as unknown as AudioContext;
  let release!: () => void,
    played = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bank = (sound as any).samples;
  bank.load = async () => {
    await gate;
    bank.buffers.set("rifle-1", {});
  };
  sound.play = () => {
    played = true;
  };
  const preview = sound.preview("shot", 0);
  await Promise.resolve();
  assert.equal(played, false);
  release();
  assert.equal(await preview, "Played recording: rifle-1.");
  assert.equal(played, true);
  bank.load = async () => {};
  await assert.rejects(sound.preview("death", 0), /Recording unavailable/);
});

test("live sound graph uses recorded gun/footstep/death buffers and one reused sampled jet loop", () => {
  const sources: any[] = [];
  const param = () => ({
    value: 0,
    setTargetAtTime(n: number) {
      this.value = n;
    },
    cancelScheduledValues() {},
  });
  const node = () => ({ connect() {}, disconnect() {} });
  const sound = new Sound();
  const context = {
    state: "running",
    currentTime: 0,
    createGain: () => ({ ...node(), gain: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createBiquadFilter: () => ({ ...node(), frequency: param() }),
    createOscillator: () => {
      throw Error("Recorded sounds should not use a synthesized oscillator");
    },
    createBufferSource: () => {
      const source: any = {
        ...node(),
        loop: false,
        buffer: null,
        playbackRate: param(),
        start() {
          sources.push(source);
        },
        stop() {
          source.onended?.();
        },
      };
      return source;
    },
  } as unknown as AudioContext;
  sound.ctx = context;
  (sound as any).bus = { ...node(), gain: param() };
  for (const name of SAMPLE_FILES)
    (sound as any).samples.buffers.set(name, { name });
  sound.play("shot", 1, 0);
  sound.play("step", 0.4, 0, 0, false, "snow");
  sound.play("death", 0.8);
  assert.ok(sources[0].buffer.name.startsWith("rifle-"));
  assert.ok(sources[1].buffer.name.startsWith("step-snow-"));
  assert.ok(sources[2].buffer.name.startsWith("death-"));
  for (const weapon of [0, 1, 2, 3, 6]) {
    const cue = weapon === 2 || weapon === 6 ? "reload-shell" : "reload-seat";
    sound.play(cue, 0.8, weapon);
    assert.ok(sources.at(-1).buffer.name.includes(cue));
    assert.ok(Number.isFinite(sources.at(-1).playbackRate.value));
  }
  sound.play("shot", 0.8, 6);
  assert.ok(sources.at(-1).buffer.name.startsWith("launcher-"));
  sound.play("explosion", 0.8);
  assert.ok(sources.at(-1).buffer.name.startsWith("explosion-"));
  const voices = [{ id: "local", gain: 1, pan: 0, load: 0.8 }];
  for (let i = 0; i < 30; i++) sound.updateJets(voices);
  assert.equal(sources.filter((s) => s.loop).length, 1);
  assert.equal(sources.find((s) => s.loop).buffer.name, "jet-loop");
  sound.stopJets();
  assert.equal(sound.diagnostics.engines, 0);
  for (let i = 0; i < 40; i++) sound.play("shot", 0.05, 1);
  assert.ok(sound.diagnostics.voices <= 32);
  const beforeLocal = sources.length;
  sound.play("shot", 1, 0);
  assert.equal(
    sources.length,
    beforeLocal + 1,
    "local shot steals a quiet remote tail at the voice limit",
  );
  assert.ok(sources.at(-1).buffer.name.startsWith("rifle-"));
  assert.ok(sound.diagnostics.voices <= 32);
  const count = sources.length;
  sound.master = 0;
  sound.play("shot", 1, 0);
  assert.equal(sources.length, count);
});

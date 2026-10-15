import test from "node:test";
import assert from "node:assert/strict";
import { requestPlaybackSession } from "../client/audio-session.js";
import { Sound } from "../client/audio.js";

test("Safari playback category is feature-detected and repair refreshes the session", () => {
  assert.equal(requestPlaybackSession({}), "unsupported");
  const changes: string[] = [];
  const session = {
    get type() {
      return changes.at(-1) ?? "ambient";
    },
    set type(type: string) {
      changes.push(type);
    },
  };
  assert.equal(requestPlaybackSession({ audioSession: session }), "playback");
  assert.equal(
    requestPlaybackSession({ audioSession: session }, true),
    "playback",
  );
  assert.deepEqual(changes, ["playback", "auto", "playback"]);
  const blocked = {
    get audioSession(): any {
      throw Error("Not supported");
    },
  };
  assert.equal(requestPlaybackSession(blocked), "unavailable");
});

test("match audio preparation waits for recordings but skips download gates when muted", async () => {
  const sound = new Sound();
  sound.ctx = {} as AudioContext;
  let done = false,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  (sound as any).samples.load = () => gate;
  const preparing = sound.prepare().then(() => {
    done = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  release();
  await preparing;
  assert.equal(done, true);
  sound.master = 0;
  (sound as any).samples.load = () => {
    throw Error("Muted preparation must not wait");
  };
  await sound.prepare();
});

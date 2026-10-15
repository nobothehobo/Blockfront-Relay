import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Music, musicGain, MUSIC_PLAYLISTS } from "../client/music.js";
import { assetRange } from "../shared/asset-range.js";

function harness() {
  const audio: {
    paused: boolean;
    plays: number;
    preload: string;
    src: string;
    loop: boolean;
    play(): Promise<void>;
    pause(): void;
  }[] = [];
  const gains: number[] = [];
  const music = new Music(() => {
    const element = {
      paused: true,
      plays: 0,
      preload: "",
      src: "",
      loop: false,
      play() {
        this.paused = false;
        this.plays++;
        return Promise.resolve();
      },
      pause() {
        this.paused = true;
      },
    };
    audio.push(element);
    return element as unknown as HTMLAudioElement;
  });
  const context = {
    currentTime: 0,
    state: "running",
    destination: {},
    createGain() {
      const index = gains.push(0) - 1;
      return {
        connect() {},
        gain: {
          get value() {
            return gains[index];
          },
          set value(n: number) {
            gains[index] = n;
          },
          cancelScheduledValues() {},
          setTargetAtTime(n: number) {
            gains[index] = n;
          },
        },
      };
    },
    createMediaElementSource() {
      return { connect() {} };
    },
  } as unknown as AudioContext;
  return { music, audio, gains, context };
}

test("quiet music mix obeys master mute, independent level, gameplay reduction and combat ducking", () => {
  assert.equal(musicGain(0, 1, true, "menu", false, false), 0);
  assert.equal(musicGain(1, 1, false, "game", false, false), 0);
  assert.equal(musicGain(NaN, 1, true, "menu", false, false), 0);
  assert.equal(musicGain(5, 5, true, "menu", false, false), 1);
  const menu = musicGain(0.55, 0.14, true, "menu", false, false);
  const game = musicGain(0.55, 0.14, true, "game", false, false);
  assert.ok(menu < 0.08 && game < menu);
  assert.ok(musicGain(0.55, 0.14, true, "game", true, false) < game / 2);
});

test("no song plays or preloads before a gesture; Safari priming parks the inactive track", async () => {
  const h = harness();
  h.music.configure(0.55, 0.14, true);
  h.music.update("menu", false, false, false);
  assert.ok(h.audio.every((a) => a.plays === 0 && a.preload === "none"));
  h.music.unlock(h.context);
  await Promise.resolve();
  assert.equal(h.audio[0].paused, false);
  assert.equal(h.audio[1].paused, true);
  assert.ok(h.gains[0] > 0 && h.gains[1] === 0);
  h.music.update("menu", true, false, false);
});

test("music follows join/leave transitions, master mute and tab hiding without restarting songs", async () => {
  const h = harness();
  h.music.unlock(h.context);
  await Promise.resolve();
  h.music.update("game", false, false, false);
  await Promise.resolve();
  assert.equal(h.gains[0], 0);
  assert.ok(h.gains[1] > 0);
  assert.equal(h.audio[1].paused, false);
  h.music.update("menu", false, false, false);
  assert.ok(h.gains[0] > 0 && h.gains[1] === 0);
  h.music.configure(0, 0.14, true);
  assert.deepEqual(h.gains, [0, 0]);
  h.music.update("menu", true, false, false);
  assert.ok(h.audio.every((a) => a.paused));
  h.music.configure(0.55, 0.14, true);
  h.music.update("game", false, false, false);
  await Promise.resolve();
  assert.equal(h.audio[1].paused, false);
  h.music.update("game", true, false, false);
});

test("a saved music-off preference stays silent when audio is unlocked", () => {
  const h = harness();
  h.music.configure(0.55, 0.14, false);
  h.music.unlock(h.context);
  h.music.update("game", false, false, false);
  assert.ok(h.audio.every((a) => a.plays === 0));
  assert.deepEqual(h.gains, [0, 0]);
});

test("autoplay rejection is contained and can be retried at the next gesture", async () => {
  const h = harness();
  h.audio[0].play = () => {
    h.audio[0].plays++;
    return Promise.reject(new Error("NotAllowedError"));
  };
  h.music.unlock(h.context);
  await new Promise((resolve) => setImmediate(resolve));
  const attempts = h.audio[0].plays;
  h.audio[0].play = function () {
    this.paused = false;
    this.plays++;
    return Promise.resolve();
  };
  h.music.unlock(h.context);
  await Promise.resolve();
  assert.ok(h.audio[0].plays > attempts);
  assert.equal(h.audio[0].paused, false);
  h.music.update("menu", true, false, false);
});

test("native media byte ranges handle metadata probes, open ranges and suffix requests", () => {
  assert.equal(assetRange(null, 100), null);
  assert.deepEqual(assetRange("bytes=0-1", 100), { start: 0, end: 1 });
  assert.deepEqual(assetRange("bytes=70-", 100), { start: 70, end: 99 });
  assert.deepEqual(assetRange("bytes=-8", 100), { start: 92, end: 99 });
  assert.deepEqual(assetRange("bytes=0-999", 100), { start: 0, end: 99 });
});

test("invalid media ranges cannot produce negative or out-of-bounds slices", () => {
  for (const range of [
    "bytes=100-",
    "bytes=80-70",
    "bytes=-0",
    "bytes=-",
    "bytes=0-1,4-5",
    "bytes=9007199254740999-",
    "items=0-1",
  ])
    assert.equal(assetRange(range, 100), "invalid");
});

test("approved action playlists advance and wrap around", async () => {
  const h = harness();
  h.music.unlock(h.context);
  await Promise.resolve();
  for (const mode of ["menu", "game"] as const) {
    h.music.update(mode, false, false, false);
    const element = h.audio[
      mode === "menu" ? 0 : 1
    ] as unknown as HTMLAudioElement;
    for (let n = 1; n <= MUSIC_PLAYLISTS[mode].length * 2; n++) {
      element.onended?.call(element, new Event("ended"));
      await Promise.resolve();
      assert.ok(
        element.src.includes(
          "/api/audio/" +
            MUSIC_PLAYLISTS[mode][n % MUSIC_PLAYLISTS[mode].length] +
            ".mp3",
        ),
      );
    }
  }
  h.music.update("game", true, false, false);
});

test("active synthwave cues retain source hashes and visible title/artist/license credits", async () => {
  const rows = JSON.parse(
    await readFile("assets/music/synthwave-manifest.json", "utf8"),
  );
  assert.deepEqual(
    new Set(Object.values(MUSIC_PLAYLISTS).flat()),
    new Set(
      rows.map((row: { file: string }) =>
        row.file.split("/").at(-1)!.replace(".mp3", ""),
      ),
    ),
  );
  const html = await readFile("client/index.html", "utf8");
  const credits = await readFile("client/public/music/ATTRIBUTION.txt", "utf8");
  for (const row of rows) {
    const bytes = await readFile(row.file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256);
    assert.equal(bytes.length, row.bytes);
    assert.ok(html.includes(row.title) && html.includes(row.artist));
    assert.ok(credits.includes(row.title) && credits.includes(row.licenseUrl));
  }
});

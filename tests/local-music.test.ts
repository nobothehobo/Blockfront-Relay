import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localMusicSource } from "../client/local-music.js";

test("approved MP3s become cached native-media Blob URLs with exact bytes and no music API request", async () => {
  const recordings: Record<string, string> = {},
    blobs: Blob[] = [];
  for (const name of ["edm-detection-mode", "exit-the-premises"])
    recordings[name + ".mp3"] =
      "data:audio/mpeg;base64," +
      (await readFile(`client/public/music/${name}.mp3`)).toString("base64");
  const source = localMusicSource(recordings, (blob) => {
    blobs.push(blob);
    return `blob:test-${blobs.length}`;
  });
  assert.equal(source("edm-detection-mode"), "blob:test-1");
  assert.equal(source("edm-detection-mode"), "blob:test-1");
  assert.equal(source("exit-the-premises"), "blob:test-2");
  assert.equal(blobs.length, 2);
  for (const [index, name] of [
    "edm-detection-mode",
    "exit-the-premises",
  ].entries()) {
    assert.equal(blobs[index].type, "audio/mpeg");
    assert.deepEqual(
      Buffer.from(await blobs[index].arrayBuffer()),
      await readFile(`client/public/music/${name}.mp3`),
    );
  }
  assert.throws(() => source("chibi-ninja"), /not packaged/);
});

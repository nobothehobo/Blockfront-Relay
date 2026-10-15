import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localMusicSource } from "../client/local-music.js";

test("active MP3s become cached native-media Blob URLs with exact bytes and no music API request", async () => {
  const rows = JSON.parse(
    await readFile("assets/music/synthwave-manifest.json", "utf8"),
  );
  const tracks: string[] = rows.map((row: { file: string }) =>
    row.file.split("/").at(-1)!.replace(".mp3", ""),
  );
  const recordings: Record<string, string> = {},
    blobs: Blob[] = [];
  for (const name of tracks)
    recordings[name + ".mp3"] =
      "data:audio/mpeg;base64," +
      (await readFile(`client/public/music/${name}.mp3`)).toString("base64");
  const source = localMusicSource(recordings, (blob) => {
    blobs.push(blob);
    return `blob:test-${blobs.length}`;
  });
  for (const [index, name] of tracks.entries()) {
    assert.equal(source(name), `blob:test-${index + 1}`);
    assert.equal(source(name), `blob:test-${index + 1}`);
    assert.equal(blobs[index].type, "audio/mpeg");
    assert.deepEqual(
      Buffer.from(await blobs[index].arrayBuffer()),
      await readFile(`client/public/music/${name}.mp3`),
    );
  }
  assert.equal(blobs.length, tracks.length);
  assert.throws(() => source("edm-detection-mode"), /not packaged/);
});

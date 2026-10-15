import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localRecordingFetch } from "../client/local-recordings.js";
import { SampleBank, SAMPLE_FILES } from "../client/sampled-audio.js";

test("every recorded effect can load locally with no API or static-file request", async () => {
  const recordings: Record<string, string> = {};
  for (const name of SAMPLE_FILES)
    recordings[name + ".wav"] =
      "data:audio/wav;base64," +
      (await readFile(`client/public/sfx/${name}.wav`)).toString("base64");
  const fetchLocal = localRecordingFetch(recordings);
  const bank = new SampleBank(fetchLocal);
  const context = {
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
  } as unknown as AudioContext;
  await bank.load(context);
  assert.equal(bank.status.ready, 46);
  assert.equal(bank.status.failed, 0);
  for (const name of ["rifle-1", "jet-loop", "death-1"]) {
    const response = await fetchLocal(`/api/sfx/${name}.wav?v=anything`);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(`client/public/sfx/${name}.wav`),
    );
  }
  await assert.rejects(fetchLocal("/api/sfx/missing.wav"), /not packaged/);
});

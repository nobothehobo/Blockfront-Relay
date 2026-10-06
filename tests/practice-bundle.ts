// Node worker integration for the production worker asset (not a browser test).
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { emptyInput } from "../shared/game.js";
import { packInput } from "../shared/prediction.js";

const asset = (await readdir("dist/client/assets")).find((file) =>
  /^practice-worker-.*\.js$/.test(file),
);
assert.ok(asset, "production practice worker bundled");
const worker = new Worker(
  `
  const {parentPort,workerData}=require('node:worker_threads');
  globalThis.postMessage=(data)=>parentPort.postMessage(data);
  import(workerData.url).then(()=>parentPort.on('message',(data)=>globalThis.onmessage({data}))).then(()=>parentPort.postMessage({type:'ready'}));
`,
  {
    eval: true,
    workerData: {
      url: pathToFileURL(resolve("dist/client/assets", asset)).href,
    },
  },
);
let timer: ReturnType<typeof setTimeout>;
try {
  await new Promise<void>((resolve, reject) => {
    timer = setTimeout(
      () => reject(Error("Practice worker did not acknowledge movement")),
      15000,
    );
    worker.on("error", reject);
    worker.on("message", (message) => {
      if (message.type === "ready")
        worker.postMessage({
          type: "start",
          options: {
            name: "Local",
            mode: "ctf",
            jet: "all",
            seed: 7233,
            bots: 15,
            limit: 16,
            practice: true,
          },
          name: "Test",
          classId: 0,
        });
      if (message.type === "error") reject(Error(message.message));
      if (message.type === "welcome") {
        assert.equal(message.state.players.length, 16);
        const player = message.state.players.find(
          (p: any) => p.id === message.id,
        );
        worker.postMessage({
          type: "input",
          epoch: player.epoch,
          commands: [packInput({ ...emptyInput(), seq: 1, forward: 1 })],
        });
      }
      if (message.type === "state") {
        const player = message.state.players.find(
          (p: any) => p.id === "practice-player",
        );
        if (player.lastSeq >= 1) {
          clearTimeout(timer);
          resolve();
        }
      }
    });
  });
  console.log(
    "Production on-device worker started 16-player CTF, decoded packed input and acknowledged movement",
  );
} finally {
  clearTimeout(timer!);
  await worker.terminate();
}

import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const port = String(18000 + (process.pid % 9000));
const base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, [path.resolve("dist/desktop/server.cjs")], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: port },
  stdio: ["ignore", "ignore", "pipe"],
});
let errors = "";
server.stderr.on("data", data => { errors += String(data); });
try {
  let good = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) break;
    try {
      const result = await fetch(base + "/api/health", {
        signal: AbortSignal.timeout(500),
      });
      if (result.ok && (await result.json()).transport === "ws") {
        good = true;
        break;
      }
    } catch {}
    await sleep(100);
  }
  assert.ok(good, "Bundled game server didn't start: " + errors);
  const rooms = await (await fetch(base + "/api/rooms")).json();
  assert.ok(Array.isArray(rooms) && rooms.length >= 6);
  const response = await fetch(base + "/");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Blockfront Relay/);
  console.log("Desktop server smoke: health, rooms and real game client OK.");
} finally {
  server.kill();
}

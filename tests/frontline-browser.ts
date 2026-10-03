// Test-only local authority fixture; no teleport or debug endpoint is deployed.
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { WebSocketServer } from "ws";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
const room = new Room("frontline", {
  name: "Frontline test",
  mode: "frontline",
  jet: "off",
  seed: 7231,
});
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/health" || req.url === "/api/rooms") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        req.url === "/api/health" ? { transport: "ws" } : [room.list()],
      ),
    );
    return;
  }
  const file = req.url === "/" ? "/index.html" : req.url!;
  if (!/^\/(index\.html|assets\/[\w.-]+)$/.test(file)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  res.end(await readFile(`dist/client${file}`));
});
const sockets = new WebSocketServer({ server });
let joins = 0;
sockets.on("connection", (ws) => {
  const id = ++joins === 1 ? "a" : "b";
  room.add(id, id, { send: (raw) => ws.send(raw) });
  ws.on("message", (raw) => {
    const data = JSON.parse(String(raw));
    if (data.type === "input") room.queueInputs(id, data.commands, data.epoch);
    if (data.type === "ping")
      ws.send(JSON.stringify({ type: "pong", at: data.at }));
  });
  ws.on("close", () => room.remove(id));
  if (joins === 2) {
    room.start();
    for (const [index, p] of [...room.players.values()].entries()) {
      const point = room.controlPoints[1].pos;
      Object.assign(p, point, {
        x: point.x + (index ? 2 : -2),
        z: point.z + 3,
        y: point.y + 0.01,
        protected: 0,
        yaw: index ? 0.588 : -0.588,
        pitch: -0.1,
      });
    }
  }
});
const tick = setInterval(() => room.tick(), 1000 / 30);
await new Promise<void>((resolve) => server.listen(3104, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath:
    process.env.BR_BROWSER_PATH ??
    (existsSync("/tmp/br-browser/chromium")
      ? "/tmp/br-browser/chromium"
      : undefined),
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const a = await context.newPage(),
    b = await context.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error" && /shader|WebGLProgram/i.test(m.text()))
        errors.push(m.text());
    });
    await p.goto("http://127.0.0.1:3104");
    await p.waitForFunction(() =>
      document
        .querySelector("#status")
        ?.textContent?.includes("rooms available"),
    );
    await p.locator("#play").click();
    await p.waitForFunction(() => (window as any).BR.connected);
  }
  await a.waitForFunction(
    () => (window as any).BR.state.controlPoints[1].contested,
  );
  assert.match(await a.locator("#objective-hud").innerText(), /CONTESTED/);
  room.spawn(room.players.get("b")!);
  for (const p of [a, b])
    await p.waitForFunction(
      () => (window as any).BR.state.controlPoints[1].owner === 0,
      undefined,
      { timeout: 20000 },
    );
  assert.match(await a.locator("#mode-label").innerText(), /Frontline/i);
  await a.waitForFunction(
    () => (window as any).BR.state.scores[0] > 0,
    undefined,
    { timeout: 5000 },
  );
  assert.ok(room.scores[0] > 0);
  await mkdir("artifacts", { recursive: true });
  await a.screenshot({ path: "artifacts/frontline-sector.png" });
  const player = room.players.get("a")!;
  room.spawn(player);
  Object.assign(player, room.supplyStations[0].pos, {
    health: 40,
    lastDamage: -10,
    protected: 0,
  });
  player.reserve.fill(0);
  await a.waitForFunction(
    () => {
      const p = (window as any).BR.state.players.find(
        (p: any) => p.id === (window as any).BR.player.id,
      );
      return p.health === 100 && p.reserve[0] > 0;
    },
    undefined,
    { timeout: 15000 },
  );
  await a.screenshot({ path: "artifacts/frontline-supply.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS two browser clients: contested sector, capture, replicated ownership, score, supply completion and new WebGL shaders",
  );
} finally {
  await browser.close();
  clearInterval(tick);
  sockets.close();
  server.close();
}

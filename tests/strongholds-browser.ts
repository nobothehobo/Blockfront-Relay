// Local fixture only: authoritative mutation access is never served in production.
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { WebSocketServer } from "ws";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { demolitionCells, World } from "../shared/game.js";
const room = new Room("demo", {
  name: "Strongholds test",
  mode: "demolition",
  jet: "classes",
  arsenal: "specialists",
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
  const path = req.url === "/" ? "/index.html" : req.url!;
  if (!/^\/(index\.html|assets\/[\w.-]+)$/.test(path)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    path.endsWith(".js")
      ? "text/javascript"
      : path.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  res.end(await readFile(`dist/client${path}`));
});
let count = 0;
const sockets = new WebSocketServer({ server });
sockets.on("connection", (ws) => {
  const id = String(++count);
  room.add(id, id, { send: (raw) => ws.send(raw) });
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "input") room.queueInputs(id, m.commands, m.epoch);
    if (m.type === "ping") ws.send(JSON.stringify({ type: "pong", at: m.at }));
  });
  ws.on("close", () => room.remove(id));
  if (count === 2) {
    room.start();
    for (const [i, p] of [...room.players.values()].entries()) {
      let y = 50;
      while (y > 1 && !room.world.get(241.5 + i * 2, y - 1, 189.5)) y--;
      Object.assign(p, {
        x: 241.5 + i * 2,
        y: y + 0.01,
        z: 189.5,
        yaw: 0,
        pitch: 0,
        protected: 0,
      });
    }
  }
});
const tick = setInterval(() => room.tick(), 1000 / 30);
await new Promise<void>((r) => server.listen(3105, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: process.env.BR_BROWSER_PATH,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ],
});
try {
  const desktop = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }),
    phone = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
  const a = await desktop.newPage(),
    b = await phone.newPage(),
    errors: string[] = [];
  for (const page of [a, b]) {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /shader|WebGLProgram/.test(m.text()))
        errors.push(m.text());
    });
    await page.goto("http://127.0.0.1:3105");
    await page.waitForFunction(() =>
      document
        .querySelector("#status")
        ?.textContent?.includes("rooms available"),
    );
    await page.locator("#play").click();
    await page.waitForFunction(() => (window as any).BR.connected);
  }
  await a.waitForFunction(() => (window as any).BR.state.phase === "active");
  assert.match(await b.locator("#mode-label").innerText(), /Demolition/i);
  await mkdir("artifacts", { recursive: true });
  await a.waitForTimeout(6000);
  await a.screenshot({ path: "artifacts/strongholds-desktop.png" });
  await b.screenshot({ path: "artifacts/strongholds-phone.png" });
  // Create a disconnected chunk then run the same server collapse path used by digging.
  for (let y = 25; y <= 27; y++) room.world.set(240, y, 188, 6);
  room.broadcast({
    type: "edits",
    edits: [25, 26, 27].map((y) => [240, y, 188, 6]),
    revision: ++room.revision,
  });
  for (const page of [a, b])
    await page.waitForFunction(
      () =>
        (window as any).BR.construction.edits.find(
          (e: number[]) => e[0] === 240 + 320 * (188 + 320 * 27),
        )?.[1] === 6,
    );
  room.queueCollapse(240, 24, 188);
  for (const page of [a, b])
    await page.waitForFunction(
      () =>
        (window as any).BR.construction.edits.find(
          (e: number[]) => e[0] === 240 + 320 * (188 + 320 * 27),
        )?.[1] === 0,
    );
  const edits = demolitionCells(1)
    .slice(0, Math.ceil(demolitionCells(1).length * 0.86))
    .map(([x, y, z]) => [x, y, z, 0]);
  for (const [x, y, z] of edits) room.world.set(x, y, z, 0);
  room.broadcast({ type: "edits", edits, revision: ++room.revision });
  for (const page of [a, b])
    await page.waitForFunction(
      () => (window as any).BR.state.phase === "finished",
    );
  assert.match(room.winner, /Azure/);
  assert.deepEqual(errors, []);
  console.log(
    "PASS desktop + phone peers: Demolition HUD, replicated collapse, victory, terrain lighting shaders",
  );
} finally {
  await browser.close();
  clearInterval(tick);
  sockets.close();
  server.close();
}

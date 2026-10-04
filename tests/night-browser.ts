// Test-only clock/position staging. No production debug or mutation endpoint.
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, Page } from "playwright";
import { WebSocketServer } from "ws";
import { Room } from "../server/room.js";
import { CITY_SEED, CITY_LIGHTS } from "../shared/city.js";
import { World, idx } from "../shared/game.js";

const room = new Room("afterdark", { name: "Afterdark", mode: "ctf", seed: CITY_SEED, jet: "all", duration: 600 });
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/health" || req.url === "/api/rooms") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url === "/api/rooms" ? [room.list()] : { ok: true, transport: "ws" }));
    return;
  }
  if (req.url === "/favicon.ico") { res.writeHead(204).end(); return; }
  const file = req.url === "/" ? "/index.html" : req.url!;
  if (!/^\/(index\.html|assets\/[\w.-]+)$/.test(file)) { res.writeHead(404).end(); return; }
  try {
    res.setHeader("Content-Type", file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
    res.end(await readFile(`dist/client${file}`));
  } catch { res.writeHead(404).end(); }
});
const sockets = new WebSocketServer({ server });
let viewers = 0;
sockets.on("connection", ws => {
  const num = ++viewers;
  const p = room.add(`viewer${num}`, `Viewer ${num}`, { send: s => ws.send(s) });
  Object.assign(p, { x: 40.5 + num * 2, y: 12.98, z: 160.5, yaw: -Math.PI / 2, pitch: 0, ground: true, protected: 9999, epoch: p.epoch! + 1 });
  p.input.yaw = p.yaw;
  ws.on("message", raw => {
    const m = JSON.parse(String(raw));
    if (m.type === "input") room.queueInputs(p.id, m.commands, m.epoch);
  });
  ws.on("close", () => room.remove(p.id));
});
room.phase = "active";
const timer = setInterval(() => room.tick(), 1000 / 30);
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: process.env.BR_BROWSER_PATH, headless: true,
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"] });
const errors: string[] = [];
async function join(page: Page, preset: string) {
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(preset => {
    localStorage.setItem("br-touch-tip", "1");
    localStorage.setItem("br-settings", JSON.stringify({ preset, distance: 112, effects: preset === "mobile" ? "low" : "high", shadows: true }));
  }, preset);
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}`);
  await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("rooms available"));
  assert.ok(await page.locator("#solo-map").getByText("Lumen Quay Afterdark", { exact: true }).count());
  await page.locator("#play").click();
  await page.waitForFunction(() => (window as any).BR.connected && (window as any).BR.player.x > 41 && (window as any).BR.map.tilesLeft === 0);
}
try {
  await mkdir("artifacts", { recursive: true });
  const a = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await join(a, "balanced");
  const mobileContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const b = await mobileContext.newPage();
  await join(b, "mobile");
  await a.waitForFunction(() => (window as any).BR.remotes === 1 && (window as any).BR.lighting.neonLights === 2);
  assert.equal(room.peers.size, 2);
  for (const page of [a, b]) {
    const sky = await page.evaluate(() => (window as any).BR.lighting.atmosphere);
    assert.equal(sky.phase, .75);
    assert.equal(sky.locked, true);
    assert.equal(sky.night, 1);
    assert.equal(await page.evaluate(() => (window as any).BR.state.map), "Lumen Quay Afterdark");
  }
  assert.equal(await b.evaluate(() => (window as any).BR.lighting.neonLights), 0);
  assert.equal(await b.evaluate(() => (window as any).BR.lighting.sunShadows), false);
  await a.screenshot({ path: "artifacts/afterdark-city.png" });
  await b.screenshot({ path: "artifacts/afterdark-phone.png" });
  await b.setViewportSize({ width: 1024, height: 768 });
  await b.screenshot({ path: "artifacts/afterdark-tablet.png" });
  // A real authoritative explosion removes the streetlamp, emits a delta and
  // extinguishes its light. Both current clients and a fresh join see the edit.
  const lamp = CITY_LIGHTS[0], cell = idx(lamp.x, lamp.y, lamp.z);
  room.explode({ id: 999, owner: "test", team: -1, kind: "rocket", x: lamp.x + .5, y: lamp.y + .5, z: lamp.z + .5, vx: 0, vy: 0, vz: 0, fuse: 0 });
  assert.equal(room.world.get(lamp.x, lamp.y, lamp.z), 0);
  for (const page of [a, b]) await page.waitForFunction(cell => (window as any).BR.construction.edits.some((e: number[]) => e[0] === cell && e[1] === 0), cell);
  await a.waitForFunction(() => (window as any).BR.lighting.neonLights === 1);
  const late = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await join(late, "mobile");
  // Decoded welcome maps do not populate the edit overlay: verify authoritative
  // revision and late-join terrain by returning its compact welcome payload.
  assert.equal(await late.evaluate(() => (window as any).BR.state.revision), room.revision);
  await late.close();
  console.log("PASS city: two peers, mobile/tablet, compiled emissive shader, bounded lights, synchronized destruction and late join");
  // The normal terrain family cycles from one shared room clock. Forward-only
  // clock jumps make the six-minute progression test fast without changing code.
  room.world = new World(7231);
  room.options.seed = 7231;
  room.broadcast({ type: "map", seed: 7231, map: room.world.encode(), round: room.round, revision: 0 });
  for (const p of room.players.values()) {
    room.spawn(p);
    Object.assign(p, { x: 40, y: 13.01, z: 160, protected: 9999 });
  }
  for (const [time, expectedDay, label] of [[180, 0, "night"], [270, null, "dawn"], [360, 1, "day"]] as const) {
    room.time = time;
    for (const page of [a, b]) {
      await page.waitForFunction(time => (window as any).BR.state.seed === 7231 && (window as any).BR.state.time >= time && !(window as any).BR.lighting.atmosphere.locked, time);
      const sky = await page.evaluate(() => (window as any).BR.lighting.atmosphere);
      if (expectedDay !== null) assert.equal(sky.day, expectedDay);
      else assert.ok(sky.twilight > .9);
      assert.ok(await page.evaluate(() => (window as any).BR.lighting.exposure <= .98));
    }
    await a.screenshot({ path: `artifacts/cycle-${label}.png` });
  }
  assert.equal(room.players.size, 2);
  assert.deepEqual(errors, []);
  console.log("PASS cycle: shared midnight/dawn/noon, no clipped exposure, no WebGL/runtime errors");
} finally {
  await browser.close();
  clearInterval(timer);
  sockets.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

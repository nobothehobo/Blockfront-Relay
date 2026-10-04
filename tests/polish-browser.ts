// Real authoritative NPC simulation viewed in WebGL; fixture is not shipped to players.
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { WebSocketServer } from "ws";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { idx, H } from "../shared/game.js";
const room = new Room("polish", {
  name: "Polish test",
  mode: "tdm",
  jet: "off",
  seed: 7231,
  bots: 1,
});
// Clear a test courtyard before welcome encoding, so both peers share the same terrain.
for (let x = 148; x <= 174; x++)
  for (let z = 144; z <= 177; z++)
    for (let y = 1; y < H; y++)
      room.world.blocks[idx(x, y, z)] = y < 12 ? 3 : y === 12 ? 1 : 0;
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, transport: "ws" }));
    return;
  }
  if (req.url === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }
  if (req.url === "/api/rooms") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify([room.list()]));
    return;
  }
  const file = req.url === "/" ? "/index.html" : req.url!;
  if (!/^\/(index\.html|assets\/[\w.-]+)$/.test(file)) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "application/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(await readFile(`dist/client${file}`));
  } catch {
    res.writeHead(404).end();
  }
});
const sockets = new WebSocketServer({ server });
let viewers = 0;
sockets.on("connection", (ws, request) => {
  const number = ++viewers;
  const player = room.add(
    number === 1 ? "viewer" : `viewer${number}`,
    "Viewer",
    { send: (s) => ws.send(s) },
    false,
    Number(
      new URL(request.url!, "http://local").searchParams.get("class") ?? 0,
    ),
  );
  Object.assign(player, {
    x: number === 1 ? 160.5 : 164.5,
    y: 13.01,
    z: 165.5,
    yaw: 0,
    pitch: 0,
    ground: true,
    protected: 999,
    epoch: player.epoch! + 1,
  });
  player.input.yaw = 0;
  player.input.pitch = 0;
  const bot = [...room.players.values()].find((p) => p.bot)!;
  Object.assign(bot, {
    x: 160.5,
    y: 13.01,
    z: 154.5,
    ground: true,
    team: 1 - player.team,
    yaw: Math.PI,
    protected: 999,
  });
  room.phase = "active";
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "input") room.queueInputs(player.id, m.commands, m.epoch);
  });
  ws.on("close", () => room.remove(player.id));
});
let ticks = setInterval(() => room.tick(), 1000 / 30);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath:
    process.env.BR_BROWSER_PATH ??
    (existsSync("/tmp/br-browser/chromium")
      ? "/tmp/br-browser/chromium"
      : undefined),
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1366, height: 768 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}`);
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await page.locator("#class-open").click();
  await page.locator('[data-class-id="2"]').click();
  await page.locator("#class-close").click();
  await page.locator("#play").click();
  await page.waitForFunction(() => (window as any).BR.player?.x > 150);
  assert.equal(room.players.get("viewer")!.classId, 2);
  await page.waitForFunction(() => (window as any).BR.player.weapon === 6);
  if (!(await page.evaluate(() => document.pointerLockElement)))
    await page.locator("#game").click();
  await page.waitForFunction(() => document.pointerLockElement?.id === "game");
  await page.waitForFunction(() =>
    (window as any).BR.animation.some(
      (p: any) => p.bot && p.visible && p.skinned && Math.abs(p.leftLeg) > 0.05,
    ),
  );
  const a = await page.evaluate(() =>
    (window as any).BR.animation.find((p: any) => p.bot),
  );
  await page.waitForTimeout(600);
  const b = await page.evaluate(() =>
    (window as any).BR.animation.find((p: any) => p.bot),
  );
  assert.notEqual(
    a.phase,
    b.phase,
    "gait advances from authoritative movement",
  );
  assert.ok(Math.abs(b.leftLeg + b.rightLeg) < 1e-6, "feet alternate");
  // Network silence must not keep animating the last known walking velocity.
  clearInterval(ticks);
  await page.waitForFunction(
    () => (window as any).BR.network.snapshotAge > 1200,
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const stoppedPhase = await page.evaluate(
    () => (window as any).BR.animation.find((p: any) => p.bot).phase,
  );
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(
      () => (window as any).BR.animation.find((p: any) => p.bot).phase,
    ),
    stoppedPhase,
    "NPC gait freezes when no new positions are presented",
  );
  ticks = setInterval(() => room.tick(), 1000 / 30);
  await page.waitForFunction(() => (window as any).BR.map.tilesLeft === 0);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/sky-npc.png" });
  const bot = [...room.players.values()].find((p) => p.bot)!;
  bot.cooldown = 999;
  const observer = await browser.newPage({
    viewport: { width: 1024, height: 768 },
  });
  observer.on("pageerror", (e) => errors.push(e.message));
  await observer.goto(`http://127.0.0.1:${(server.address() as any).port}`);
  await observer.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await observer.locator("#play").click();
  await observer.waitForFunction(() => (window as any).BR.connected);
  await page.bringToFront();
  // Opening a second page can release the first page's pointer lock. Resume
  // through the actual pause UI before testing its class keyboard action.
  if (await page.locator("#pause").isVisible())
    await page.locator("#resume").click();
  if (!(await page.evaluate(() => document.pointerLockElement)))
    await page.locator("#game").click();
  await page.waitForFunction(() => document.pointerLockElement?.id === "game");
  room.players.get("viewer")!.blocks = 100;
  await page.keyboard.press("KeyV");
  await page.waitForFunction(
    () =>
      (window as any).BR.state.players.find((p: any) => p.id === "viewer")
        ?.abilityCooldown > 0,
  );
  assert.equal(room.players.get("viewer")!.blocks, 135);
  await page.keyboard.press("KeyG");
  await observer.waitForFunction(() =>
    (window as any).BR.state.projectiles.some((p: any) => p.kind === "grenade"),
  );
  await observer.waitForFunction(
    () => (window as any).BR.combat.projectiles > 0,
  );
  assert.equal(room.players.get("viewer")!.grenades, 2);
  // A newly built barrier is replicated before a real launcher shot removes it.
  for (let x = 158; x <= 162; x++)
    for (let y = 13; y <= 16; y++) {
      room.world.set(x, y, 158, 3);
      room.broadcast({ type: "edit", x, y, z: 158, value: 3 });
    }
  const revision = room.revision;
  await page.evaluate(() => {
    const p = (window as any).BR.player;
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        movementX: p.yaw / 0.002,
        movementY: p.pitch / 0.002,
        bubbles: true,
      }),
    );
  });
  await page.waitForFunction(
    () =>
      Math.abs((window as any).BR.player.pitch) < 0.02 &&
      Math.abs((window as any).BR.player.yaw) < 0.02,
  );
  // Headless pointer-lock cursor warps can inject look deltas; use ordinary mouse events for this fixed shot.
  await page.evaluate(() =>
    window.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, bubbles: true }),
    ),
  );
  await page.waitForTimeout(140);
  await page.evaluate(() =>
    window.dispatchEvent(
      new MouseEvent("mouseup", { button: 0, bubbles: true }),
    ),
  );
  for (let n = 0; n < 100 && room.revision <= revision; n++)
    await page.waitForTimeout(30);
  assert.ok(room.revision > revision, "launcher crater is authoritative");
  await page.waitForFunction(() => (window as any).BR.combat.particles > 15);
  await observer.waitForFunction(
    () => (window as any).BR.combat.particles > 15,
  );
  assert.equal(room.players.get("viewer")!.ammo[6], 1);
  await page.screenshot({ path: "artifacts/v2-launcher-blast.png" });
  await observer.close();
  // Dispatch a standard relative mouse event: headless OS cursors can remain clamped in pointer lock.
  await page.evaluate(() =>
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        movementY: -230,
        movementX: 0,
        bubbles: true,
      }),
    ),
  );
  await page.waitForFunction(() => (window as any).BR.player.pitch > 0.2);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "artifacts/sky-upward.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS 2.0 polish: class selection, Sapper loadout, resupply, grenade replicated to two browsers, launcher crater/blast effects in both browsers, NPC gait and sky; no browser errors",
  );
} finally {
  await browser.close();
  clearInterval(ticks);
  for (const ws of sockets.clients) ws.close();
  sockets.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

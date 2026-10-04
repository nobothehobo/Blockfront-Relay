// Real WebGL plus two authoritative peers. Courtyard/staging exist only in this test.
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { WebSocketServer } from "ws";
import { chromium, Page } from "playwright";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { idx, H } from "../shared/game.js";
import { zombieVariant } from "../client/character.js";
const room = new Room("fieldcraft", {
  name: "Fieldcraft",
  mode: "tdm",
  jet: "all",
  seed: 7231,
  limit: 16,
});
for (let x = 148; x <= 176; x++)
  for (let z = 144; z <= 185; z++)
    for (let y = 1; y < H; y++)
      room.world.blocks[idx(x, y, z)] = y < 12 ? 3 : y === 12 ? 1 : 0;
for (let role = 0; role < 5; role++) {
  const p = room.add(
    `role${role}`,
    `Class ${role}`,
    { send: () => {} },
    false,
    role,
  );
  Object.assign(p, {
    x: 154.5 + role * 3,
    y: 12.98,
    z: 164.5,
    yaw: Math.PI,
    ground: true,
    protected: 999,
  });
  p.input.yaw = Math.PI;
}
for (let variant = 0; variant < 3; variant++) {
  let id = `infected${variant}`;
  while (zombieVariant(id) !== variant) id += "x";
  const p = room.add(id, `Infected ${variant}`, { send: () => {} });
  Object.assign(p, {
    x: 155.5 + variant * 5,
    y: 12.98,
    z: 157.5,
    yaw: Math.PI,
    ground: true,
    protected: 999,
    zombie: true,
  });
  p.input.yaw = Math.PI;
}
room.phase = "active";
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/health" || req.url === "/api/rooms") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        req.url === "/api/rooms"
          ? [room.list()]
          : { ok: true, transport: "ws" },
      ),
    );
    return;
  }
  if (req.url === "/favicon.ico") {
    res.writeHead(204).end();
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
sockets.on("connection", (ws, req) => {
  const num = ++viewers,
    role = Number(
      new URL(req.url!, "http://local").searchParams.get("class") ?? 0,
    );
  const p = room.add(
    `viewer${num}`,
    `Viewer ${num}`,
    { send: (s) => ws.send(s) },
    false,
    role,
  );
  Object.assign(p, {
    x: num === 1 ? 160.5 : 166.5 + num * 2,
    y: 12.98,
    z: 175.5,
    yaw: 0,
    pitch: 0,
    ground: true,
    protected: 999,
    epoch: p.epoch! + 1,
  });
  p.input.yaw = 0;
  p.input.pitch = 0;
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "input") room.queueInputs(p.id, m.commands, m.epoch);
  });
  ws.on("close", () => room.remove(p.id));
});
const timer = setInterval(() => room.tick(), 1000 / 30);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath: process.env.BR_BROWSER_PATH,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ],
});
const errors: string[] = [];
async function faceNorth(page: Page) {
  // Headless pointer-lock cursor warps can inject a look delta when another page opens.
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
      Math.abs((window as any).BR.player.yaw) < 0.03 &&
      Math.abs((window as any).BR.player.pitch) < 0.03,
  );
}
async function join(page: Page, role: number, preset = "balanced") {
  console.log(`Joining visual test role ${role}`);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript((preset) => {
    localStorage.setItem("br-touch-tip", "1");
    localStorage.setItem(
      "br-settings",
      JSON.stringify({
        preset,
        distance: preset === "mobile" ? 32 : 112,
        effects: preset === "mobile" ? "low" : "high",
        shadows: true,
      }),
    );
  }, preset);
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}`);
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await page.locator("#class-open").click();
  await page.locator(`[data-class-id="${role}"]`).click();
  await page.locator("#class-close").click();
  await page.locator("#play").click();
  await page.waitForFunction(
    () => (window as any).BR.connected && (window as any).BR.player.x > 150,
  );
  await page.waitForFunction(
    () =>
      (window as any).BR.animation.length >= 8 &&
      (window as any).BR.map.tilesLeft === 0,
  );
}
try {
  await mkdir("artifacts", { recursive: true });
  const a = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await join(a, 4);
  const models = await a.evaluate(() =>
    (window as any).BR.animation.map((p: any) => p.model),
  );
  assert.deepEqual(
    [
      ...new Set(models.filter((p: any) => !p.zombie).map((p: any) => p.role)),
    ].sort(),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual(
    models
      .filter((p: any) => p.zombie)
      .map((p: any) => p.variant)
      .sort(),
    [0, 1, 2],
  );
  assert.ok(models.every((p: any) => p.vertices < 6000));
  assert.ok(
    await a.evaluate(() =>
      (window as any).BR.animation.every((p: any) => p.skinned),
    ),
  );
  assert.equal(
    await a.evaluate(() => (window as any).BR.lighting.shadowSize),
    1024,
  );
  assert.ok(await a.evaluate(() => (window as any).BR.lighting.sunShadows));
  await a.screenshot({ path: "artifacts/fieldcraft-classes.png" });
  const b = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await join(b, 0, "mobile");
  await a.bringToFront();
  await a.locator("#game").click();
  await a.waitForFunction(() => document.pointerLockElement?.id === "game");
  await faceNorth(a);
  await a.keyboard.press("KeyK");
  await b.waitForFunction(() =>
    (window as any).BR.state.fieldGear.some((g: any) => g.kind === "beacon"),
  );
  await a.waitForFunction(() => (window as any).BR.lighting.beaconLights === 1);
  assert.equal(room.players.get("viewer1")!.gearCharges, 2);
  assert.ok(
    await b.evaluate(() => (window as any).BR.lighting.gearInstances > 0),
  );
  await a.keyboard.press("Digit5");
  await a.waitForFunction(() =>
    (window as any).BR.weaponAnimation.parts.some(
      (p: any) => p.kind === "drill",
    ),
  );
  for (let z = 170; z <= 172; z++)
    for (let x = 160; x <= 161; x++)
      for (let y = 13; y <= 14; y++) {
        room.world.set(x, y, z, 3);
        room.broadcast({ type: "edit", x, y, z, value: 3 });
      }
  const revision = room.revision;
  await faceNorth(a);
  await a.keyboard.press("KeyV");
  await b.waitForFunction(
    ({ revision }) => (window as any).BR.state.revision > revision,
    { revision },
  );
  assert.equal(room.revision - revision, 12);
  await a.screenshot({ path: "artifacts/fieldcraft-drill.png" });
  await a.keyboard.press("Escape");
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await join(phone, 1, "mobile");
  // Select the mobile preset through the actual settings UI.
  await phone.locator("#pause-button").tap();
  await phone.locator("#pause-settings").tap();
  const quality = phone
    .locator("#settings-fields label")
    .filter({ hasText: "Quality preset" })
    .locator("select");
  await quality.selectOption("balanced");
  assert.equal(
    await phone.evaluate(() => (window as any).BR.lighting.shadowSize),
    512,
  );
  assert.ok(await phone.evaluate(() => (window as any).BR.lighting.sunShadows));
  await quality.selectOption("mobile");
  await phone.locator('[data-close="settings"]').tap();
  await phone.locator("#resume").tap();
  assert.equal(
    await phone.evaluate(() => (window as any).BR.lighting.sunShadows),
    false,
  );
  assert.equal(
    await phone.evaluate(() => (window as any).BR.lighting.beaconLights),
    0,
  );
  const gearRect = await phone.locator("#gear-button").boundingBox();
  assert.ok(gearRect && gearRect.x >= 0 && gearRect.y + gearRect.height < 844);
  const fireRect = await phone.locator('[data-action="fire"]').boundingBox();
  assert.ok(fireRect);
  assert.ok(
    gearRect!.x + gearRect!.width <= fireRect!.x ||
      gearRect!.y + gearRect!.height <= fireRect!.y ||
      gearRect!.y >= fireRect!.y + fireRect!.height,
    "gear leaves fire pad accessible",
  );
  const phoneId = await phone.evaluate(() => (window as any).BR.player.id);
  await phone.locator("#gear-button").tap();
  await b.waitForFunction(
    (owner) =>
      (window as any).BR.state.fieldGear.some((g: any) => g.owner === owner),
    phoneId,
  );
  await phone.screenshot({ path: "artifacts/fieldcraft-phone.png" });
  await phone.setViewportSize({ width: 1024, height: 768 });
  await phone.screenshot({ path: "artifacts/fieldcraft-tablet.png" });
  await phone.close();
  await b.close();
  // Zoom in using real movement to inspect original faces, equipment and silhouettes.
  await a.bringToFront();
  await a.locator("#resume").click();
  await a.locator("#game").click();
  await a.keyboard.down("KeyW");
  await a.waitForTimeout(800);
  await a.keyboard.up("KeyW");
  await a.screenshot({ path: "artifacts/fieldcraft-close.png" });
  const viewer = room.players.get("viewer1")!;
  room.spawn(viewer);
  Object.assign(viewer, {
    x: 160.5,
    y: 12.98,
    z: 161.5,
    yaw: 0,
    pitch: 0,
    ground: true,
    protected: 999,
  });
  viewer.input.yaw = 0;
  await a.waitForFunction(() => (window as any).BR.player.z < 163);
  await a.waitForTimeout(600);
  await a.screenshot({ path: "artifacts/fieldcraft-zombies.png" });
  room.options.mode = "infection";
  await a.waitForFunction(() => (window as any).BR.state.mode === "infection");
  room.broadcast({
    type: "map",
    seed: room.world.seed,
    map: room.world.encode(),
    revision: room.revision,
  });
  await a.waitForFunction(() => (window as any).BR.lighting.sun < 2);
  await a.waitForFunction(
    () =>
      (window as any).BR.map.tilesLeft === 0 && (window as any).BR.chunks > 100,
  );
  await a.screenshot({ path: "artifacts/fieldcraft-outbreak.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS Fieldcraft: five skinned class silhouettes, three infected variants, sun shadows/material shaders, two-browser beacon and Bore replication, keyboard drill, touch gear, phone/tablet layouts and mobile shadow preset; no WebGL errors",
  );
} finally {
  await browser.close();
  clearInterval(timer);
  for (const ws of sockets.clients) ws.close();
  sockets.close();
  server.close();
}

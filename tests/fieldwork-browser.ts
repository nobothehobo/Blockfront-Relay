import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { WebSocketServer } from "ws";
import { chromium, Page } from "playwright";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { idx, H } from "../shared/game.js";
const room = new Room("fieldwork", {
  name: "Fieldwork",
  mode: "tdm",
  jet: "classes",
  arsenal: "specialists",
  seed: 7231,
});
for (let x = 148; x <= 180; x++)
  for (let z = 144; z <= 177; z++)
    for (let y = 1; y < H; y++)
      room.world.blocks[idx(x, y, z)] = y < 12 ? 3 : y === 12 ? 1 : 0;
const server = http.createServer(async (req, res) => {
  const send = (o: unknown) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(o));
  };
  if (req.url === "/api/health") return send({ ok: true, transport: "ws" });
  if (req.url === "/api/rooms") return send([room.list()]);
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
sockets.on("connection", (ws, request) => {
  const number = ++viewers,
    p = room.add(
      `viewer${number}`,
      `Viewer ${number}`,
      { send: (s) => ws.send(s) },
      false,
      Number(
        new URL(request.url!, "http://local").searchParams.get("class") ?? 0,
      ),
    );
  Object.assign(p, {
    x: 160.5 + (number - 1) * 4,
    y: 13.001,
    z: 165.5,
    yaw: 0,
    pitch: -0.55,
    ground: true,
    protected: 999,
    epoch: p.epoch! + 1,
  });
  p.input.yaw = 0;
  p.input.pitch = -0.55;
  room.phase = "active";
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "input") room.queueInputs(p.id, m.commands, m.epoch);
  });
  ws.on("close", () => room.remove(p.id));
});
const ticks = setInterval(() => room.tick(), 1000 / 30);
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
const errors: string[] = [],
  url = `http://127.0.0.1:${(server.address() as any).port}`;
async function join(p: Page, classId: number, touch = false) {
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await p.locator("#class-open").click();
  await p.locator(`[data-class-id="${classId}"]`).click();
  await p.locator("#class-close").click();
  await p.locator("#play").click();
  await p.waitForFunction(
    () => (window as any).BR.connected && (window as any).BR.player.y > 13,
  );
  if (!touch && !(await p.evaluate(() => document.pointerLockElement)))
    await p.locator("#game").click();
}
async function aim(p: Page, yaw = 0, pitch = -0.55) {
  await p.evaluate(
    ({ yaw, pitch }) => {
      const at = (window as any).BR.player;
      document.dispatchEvent(
        new MouseEvent("mousemove", {
          movementX: (at.yaw - yaw) / 0.002,
          movementY: (at.pitch - pitch) / 0.002,
          bubbles: true,
        }),
      );
    },
    { yaw, pitch },
  );
}
try {
  await mkdir("artifacts", { recursive: true });
  const a = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await join(a, 3);
  const b = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await join(b, 0);
  await a.bringToFront();
  if (!(await a.evaluate(() => document.pointerLockElement)))
    await a.locator("#game").click();
  await a.keyboard.press("Digit7");
  assert.equal(
    await a.evaluate(() => (window as any).BR.input.weapon),
    3,
    "specialist cannot select a launcher",
  );
  await aim(a, 0, 0);
  await a.evaluate(() =>
    window.dispatchEvent(
      new MouseEvent("mousedown", { button: 2, bubbles: true }),
    ),
  );
  await a.waitForFunction(
    () => !document.querySelector("#scope")?.classList.contains("hidden"),
  );
  await a.screenshot({ path: "artifacts/field-optic.png" });
  await a.evaluate(() =>
    window.dispatchEvent(
      new MouseEvent("mouseup", { button: 2, bubbles: true }),
    ),
  );
  await a.keyboard.press("KeyB");
  await aim(a);
  await a.waitForFunction(
    () =>
      (window as any).BR.construction.ghosts === 6 &&
      (window as any).BR.construction.reason === "Ready to build",
  );
  const before = room.revision,
    blocks = room.players.get("viewer1")!.blocks;
  await a.screenshot({ path: "artifacts/field-cover-preview.png" });
  await a.evaluate(() =>
    window.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, bubbles: true }),
    ),
  );
  await a.waitForTimeout(120);
  await a.evaluate(() =>
    window.dispatchEvent(
      new MouseEvent("mouseup", { button: 0, bubbles: true }),
    ),
  );
  await b.waitForFunction(
    () => (window as any).BR.construction.edits.length === 6,
  );
  assert.equal(room.revision, before + 6);
  assert.equal(room.players.get("viewer1")!.blocks, blocks - 6);
  const aEdits = await a.evaluate(() => (window as any).BR.construction.edits),
    bEdits = await b.evaluate(() => (window as any).BR.construction.edits);
  assert.deepEqual(
    aEdits,
    bEdits,
    "both rendered worlds receive the same six edits",
  );
  for (const viewport of [
    { name: "phone-landscape", width: 844, height: 390 },
    { name: "phone-portrait", width: 390, height: 844 },
    { name: "tablet", width: 1024, height: 768 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const p = await context.newPage();
    await join(p, 1, true);
    const id = await p.evaluate(() => (window as any).BR.player.id);
    assert.equal(room.players.get(id)!.jetpack, true);
    await p.locator("#switch-weapon").tap();
    assert.equal(await p.locator('[data-weapon="6"]').isDisabled(), true);
    await p.locator('[data-weapon="5"]').tap();
    await p.locator("#kit-button").tap();
    await p.waitForFunction(
      () =>
        (window as any).BR.input.buildKit === 1 &&
        (window as any).BR.construction.ghosts === 6,
    );
    const bounds = await p.locator("#construction-panel").boundingBox();
    assert.ok(
      bounds &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width &&
        bounds.y + bounds.height <= viewport.height,
    );
    // Trusted touch look, not keyboard input: pitch down a little farther for the kit.
    const cdp = await context.newCDPSession(p),
      x = viewport.width * 0.5,
      y = viewport.height * 0.42;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x, y: y + 12 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await p.waitForFunction(() => (window as any).BR.player.pitch < -0.56);
    await p.waitForFunction(
      () => (window as any).BR.construction.reason === "Ready to build",
    );
    const revision = room.revision;
    await p.locator('[data-action="fire"]').tap();
    await p.waitForFunction(
      (previous) => (window as any).BR.state.revision > previous,
      revision,
    );
    assert.equal(
      room.revision,
      revision + 6,
      "touch PLACE constructs one whole cover kit",
    );
    await p.locator("#kit-button").tap();
    await p.locator("#kit-button").tap();
    assert.equal(await p.evaluate(() => (window as any).BR.input.buildKit), 3);
    await p.screenshot({ path: `artifacts/fieldwork-${viewport.name}.png` });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS fieldwork: class restrictions, scoped aiming, desktop kit ghost and atomic replication to two WebGL clients; native-touch kit cycling/placement and class jetpacks at phone landscape, portrait and tablet sizes; no browser errors",
  );
} finally {
  await browser.close();
  clearInterval(ticks);
  for (const ws of sockets.clients) ws.close();
  sockets.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

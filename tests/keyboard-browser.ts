// Real UI/input with pointer lock missing or rejected; no production test endpoints.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const port = 3108;
const server = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    process.env.BR_TRANSPORT === "http"
      ? "tests/hosted-shim.ts"
      : "dist/node/index.js",
  ],
  {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stderr.on("data", (d) => process.stderr.write(d));
await new Promise<void>((resolve, reject) => {
  server.stdout.on("data", (d) => {
    if (String(d).includes("listening")) resolve();
  });
  server.on("exit", (code) => reject(Error(`Server exited ${code}`)));
});
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
const errors: string[] = [];
await mkdir("artifacts", { recursive: true });
try {
  const tablet = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1",
  });
  await tablet.addInitScript(() => {
    Object.defineProperty(Element.prototype, "requestPointerLock", {
      value: undefined,
      configurable: true,
    });
    localStorage.setItem("br-touch-tip", "1");
  });
  const a = await tablet.newPage();
  a.setDefaultTimeout(30000);
  a.on("pageerror", (e) => errors.push(e.message));
  await a.goto(`http://127.0.0.1:${port}`);
  await a.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await a.locator("#name").fill("Magic Keyboard");
  await a.locator("#play").tap();
  await a.waitForFunction(
    () =>
      (window as any).BR.connected && (window as any).BR.map.tilesLeft === 0,
  );
  assert.ok(await a.locator("#touch").isVisible());
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const b = await desktop.newPage();
  b.setDefaultTimeout(30000);
  b.on("pageerror", (e) => errors.push(e.message));
  await b.goto(`http://127.0.0.1:${port}`);
  await b.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await b.locator("#name").fill("Desktop peer");
  await b.locator("#play").click();
  await b.waitForFunction(
    () => (window as any).BR.connected && (window as any).BR.remotes === 1,
  );
  await a.bringToFront();
  console.log(
    "Checking hardware movement on a touch-capable iPad viewport with pointer lock unavailable",
  );
  const before = await a.evaluate(() => (window as any).BR.player);
  await a.keyboard.down("KeyW");
  await a.waitForTimeout(850);
  await a.keyboard.up("KeyW");
  const after = await a.evaluate(() => (window as any).BR.player);
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.5);
  await b.waitForFunction(
    ({ id, x, z }) => {
      const p = (window as any).BR.state.players.find((p: any) => p.id === id);
      return p && Math.hypot(p.x - x, p.z - z) > 0.3;
    },
    { id: after.id, x: before.x, z: before.z },
  );
  assert.equal(
    await a.evaluate(() => (window as any).BR.controls.hardware),
    true,
  );
  assert.equal(await a.locator("#touch").isVisible(), false);
  assert.equal(
    await a.evaluate(() => (window as any).BR.controls.locked),
    false,
  );
  await a.mouse.move(512, 384);
  await a.mouse.click(512, 384);
  await a.waitForFunction(
    () =>
      (window as any).BR.state.players.find(
        (p: any) => p.name === "Magic Keyboard",
      ).ammo[0] < 24,
  );
  const angle = await a.evaluate(() => (window as any).BR.player.yaw);
  await a.mouse.move(600, 404, { steps: 4 });
  assert.ok(
    Math.abs((await a.evaluate(() => (window as any).BR.player.yaw)) - angle) >
      0.08,
    "ordinary cursor movement aims",
  );
  await a.mouse.move(3, 384);
  const edge = await a.evaluate(() => (window as any).BR.player.yaw);
  await a
    .waitForFunction(
      (before) => Math.abs((window as any).BR.player.yaw - before) > 0.15,
      edge,
    )
    .catch(async (error) => {
      console.log(
        "Edge diagnostics",
        await a.evaluate(() => ({
          controls: (window as any).BR.controls,
          player: (window as any).BR.player,
          target: document.elementFromPoint(3, 384)?.id,
          focus: document.hasFocus(),
          hidden: document.hidden,
        })),
      );
      throw error;
    });
  await a.mouse.move(512, 384);
  await a.keyboard.down("KeyZ");
  await a.waitForFunction(
    () =>
      (window as any).BR.state.players.find(
        (p: any) => p.name === "Magic Keyboard",
      ).aim,
  );
  await a.keyboard.up("KeyZ");
  await a.keyboard.press("KeyR");
  await a.waitForFunction(
    () =>
      (window as any).BR.state.players.find(
        (p: any) => p.name === "Magic Keyboard",
      ).reload > 0,
  );
  await a.waitForFunction(
    () =>
      (window as any).BR.state.players.find(
        (p: any) => p.name === "Magic Keyboard",
      ).ammo[0] === 24,
  );
  const y = await a.evaluate(() => (window as any).BR.player.y);
  await a.keyboard.down("Space");
  await a.waitForTimeout(250);
  await a.keyboard.up("Space");
  assert.ok((await a.evaluate(() => (window as any).BR.player.y)) > y + 0.3);
  await a.keyboard.down("KeyF");
  await a.waitForFunction(
    () =>
      (window as any).BR.state.players.find(
        (p: any) => p.name === "Magic Keyboard",
      ).fuel < 99,
  );
  await a.keyboard.up("KeyF");
  const arrow = await a.evaluate(() => (window as any).BR.player.yaw);
  await a.keyboard.down("ArrowRight");
  await a.waitForTimeout(200);
  await a.keyboard.up("ArrowRight");
  assert.ok(
    Math.abs((await a.evaluate(() => (window as any).BR.player.yaw)) - arrow) >
      0.1,
  );
  assert.equal(await a.evaluate(() => scrollY), 0);
  console.log(
    "Checking UI exclusion, pause cleanup and touchscreen restoration",
  );
  await a.locator("#pause-button").click();
  assert.ok(await a.locator("#pause").isVisible());
  const paused = await a.evaluate(() => (window as any).BR.player.yaw);
  await a.mouse.move(3, 400);
  await a.waitForTimeout(200);
  assert.ok(
    Math.abs((await a.evaluate(() => (window as any).BR.player.yaw)) - paused) <
      0.005,
    "pause permits only server angle quantization",
  );
  await a.locator("#resume").click();
  assert.equal(
    await a.evaluate(() => (window as any).BR.controls.fallback),
    true,
  );
  await a.keyboard.press("KeyP");
  assert.ok(await a.locator("#pause").isVisible());
  await a.locator("#resume").click();
  await a.locator("#input-toggle").click();
  assert.ok(await a.locator("#touch").isVisible());
  assert.equal(
    await a.evaluate(() => (window as any).BR.controls.mode),
    "touch",
  );
  // Forced touch mode still accepts physical keys, preserving keyboard + finger play.
  await a.keyboard.down("KeyW");
  await a.waitForFunction(() => (window as any).BR.input.forward === 1);
  await a.keyboard.up("KeyW");
  assert.ok(await a.locator("#touch").isVisible());
  await a.screenshot({ path: "artifacts/ipad-keyboard-touch.png" });
  await a.locator("#input-toggle").click();
  // A browser exposing an API that rejects must take the same working fallback.
  await a.evaluate(
    'Object.defineProperty(Element.prototype, "requestPointerLock", {value: function () { return Promise.reject(new Error("Unavailable")); }, configurable: true})',
  );
  await a.mouse.click(512, 384);
  await a.waitForTimeout(100);
  assert.equal(
    await a.evaluate(() => (window as any).BR.controls.fallback),
    true,
  );
  assert.equal(await a.evaluate(() => !!document.pointerLockElement), false);
  await a.screenshot({ path: "artifacts/ipad-keyboard-trackpad.png" });
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${process.env.BR_TRANSPORT ?? "ws"}: touch-capable keyboard movement replicates to a desktop peer; missing/rejected pointer lock fallback look/edge turn, fire/aim/reload/jump/jet, arrow look, pause and hybrid touch restoration`,
  );
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

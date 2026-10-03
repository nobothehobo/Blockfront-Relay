import { chromium, Page } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { once } from "node:events";
const port = 3101;
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
const errors: string[] = [];
function watch(p: Page) {
  p.on("pageerror", (e) => errors.push(e.message));
}
const url = `http://127.0.0.1:${port}`;
await mkdir("artifacts", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const a = await context.newPage();
  watch(a);
  await a.goto(url);
  await a.waitForFunction(() => !!(window as any).BR);
  await a.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  assert.equal(await a.title(), "Blockfront Relay");
  await a.waitForFunction(() => (window as any).BR.chunks > 80);
  await a.screenshot({ path: "artifacts/menu-desktop.png" });
  await a.locator("#name").fill("DesktopA");
  await a.locator("#play").click();
  await a.waitForFunction(() => (window as any).BR.connected);
  if (!(await a.evaluate(() => document.pointerLockElement)))
    await a.locator("#game").click();
  await a.waitForFunction(() => document.pointerLockElement?.id === "game");
  await a.waitForFunction(() => (window as any).BR.map.tilesLeft === 0);
  assert.deepEqual(
    await a.evaluate(() => [
      (window as any).BR.map.width,
      (window as any).BR.map.depth,
    ]),
    [320, 320],
  );
  await a.keyboard.press("KeyM");
  assert.ok(await a.evaluate(() => (window as any).BR.map.expanded));
  await a.keyboard.press("KeyM");
  assert.equal(await a.evaluate(() => (window as any).BR.map.expanded), false);
  const initial = await a.evaluate(() => (window as any).BR.player);
  await a.keyboard.down("KeyW");
  await a.waitForTimeout(800);
  await a.keyboard.up("KeyW");
  const after = await a.evaluate(() => (window as any).BR.player);
  assert.ok(
    Math.hypot(after.x - initial.x, after.z - initial.z) > 0.5,
    "Desktop moves",
  );
  await a.keyboard.press("Digit2");
  await a.waitForFunction(() => (window as any).BR.player.weapon === 1);
  const ammoBefore = await a.evaluate(
    () =>
      (window as any).BR.state.players.find((p: any) => p.name === "DesktopA")
        .ammo[1],
  );
  await a.mouse.down();
  await a.waitForTimeout(400);
  await a.mouse.up();
  await a.waitForFunction(
    ({ before }) =>
      (window as any).BR.state.players.find((p: any) => p.name === "DesktopA")
        .ammo[1] < before,
    { before: ammoBefore },
  );
  const ammoAfter = await a.evaluate(
    () =>
      (window as any).BR.state.players.find((p: any) => p.name === "DesktopA")
        .ammo[1],
  );
  assert.ok(ammoAfter < ammoBefore, "Firing consumes authoritative ammo");
  await a.keyboard.press("KeyR");
  await a.waitForFunction(() =>
    document.querySelector("#reload-note")?.textContent?.includes("RELOADING"),
  );
  await a.keyboard.down("KeyF");
  await a.waitForFunction(() => (window as any).BR.audio.engines > 0);
  await a.waitForTimeout(700);
  await a.keyboard.up("KeyF");
  await a.waitForFunction(() => (window as any).BR.audio.engines === 0);
  assert.ok(
    await a.evaluate(() => (window as any).BR.player.fuel < 95),
    "Jetpack fuel consumed",
  );
  const b = await context.newPage();
  watch(b);
  await b.goto(url);
  await b.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await b.locator("#name").fill("DesktopB");
  await b.locator("#play").click();
  await b.waitForFunction(
    () => (window as any).BR.connected && (window as any).BR.remotes === 1,
  );
  await a.waitForFunction(() => (window as any).BR.remotes === 1);
  assert.equal(
    await b.evaluate(() => (window as any).BR.state.players.length),
    2,
  );
  if (!(await b.evaluate(() => document.pointerLockElement)))
    await b.locator("#game").click();
  const bInitial = await b.evaluate(() => (window as any).BR.player.x);
  await b.keyboard.down("KeyW");
  await b.waitForTimeout(700);
  await b.keyboard.up("KeyW");
  const bId = await b.evaluate(() => (window as any).BR.player.id);
  await a.waitForFunction(
    ({ id, x }) =>
      Math.abs(
        (window as any).BR.state.players.find((p: any) => p.id === id).x - x,
      ) > 0.3,
    { id: bId, x: bInitial },
  );
  await b.screenshot({ path: "artifacts/match-desktop.png" });
  console.log(
    "PASS desktop: launch, pointer lock, movement, switching, firing, reload, jetpack and two-browser remote synchronization",
  );
  await context.close();
  for (const viewport of [
    { width: 844, height: 390, name: "iphone-landscape" },
    { width: 390, height: 844, name: "iphone-portrait" },
    { width: 1024, height: 768, name: "ipad" },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const p = await context.newPage();
    watch(p);
    await p.goto(url);
    await p.waitForFunction(() =>
      document
        .querySelector("#status")
        ?.textContent?.includes("rooms available"),
    );
    // Isolate phone controls from prior clients' warmup/round-start loadout resets.
    if (viewport.name === "ipad") await p.locator("#practice").tap();
    else {
      await p.locator("#browse").tap();
      await p.locator("#room-name").fill(`Touch ${viewport.name}`);
      await p.locator("#arsenal").selectOption("sandbox");
      await p.locator("#jet-mode").selectOption("all");
      await p.locator("#create").tap();
    }
    await p.waitForFunction(() => (window as any).BR.connected);
    assert.ok(await p.locator("#touch").isVisible());
    await p.waitForFunction(
      () =>
        (window as any).BR.map.tilesLeft === 0 &&
        (window as any).BR.map.draws > 0,
    );
    const compact = await p.locator("#minimap").boundingBox();
    assert.ok(
      compact &&
        compact.x >= 0 &&
        compact.y >= 0 &&
        compact.x + compact.width <= viewport.width &&
        compact.y + compact.height <= viewport.height,
      "Compact map fits screen",
    );
    await p.locator("#minimap-toggle").tap();
    assert.ok(await p.evaluate(() => (window as any).BR.map.expanded));
    const expanded = await p.locator("#minimap").boundingBox();
    assert.ok(
      expanded &&
        expanded.x >= 0 &&
        expanded.y >= 0 &&
        expanded.x + expanded.width <= viewport.width &&
        expanded.y + expanded.height <= viewport.height,
      "Expanded map fits screen",
    );
    await p.screenshot({ path: `artifacts/${viewport.name}-map.png` });
    await p.locator("#minimap-toggle").tap();
    if (viewport.name === "ipad")
      await p.waitForFunction(
        () =>
          (window as any).BR.state.players.filter((p: any) => p.bot).length ===
            4 && (window as any).BR.state.phase === "active",
      );
    const controls = await p
      .locator("#touch-actions button, #tactical-controls button")
      .evaluateAll((buttons) =>
        buttons.map((b) => {
          const r = b.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            text: b.textContent,
          };
        }),
      );
    for (const c of controls)
      assert.ok(
        c.x >= 0 &&
          c.y >= 0 &&
          c.x + c.w <= viewport.width &&
          c.y + c.h <= viewport.height,
        `${viewport.name} ${c.text} stays on screen`,
      );
    const joy = await p.locator("#joystick").boundingBox();
    assert.ok(joy);
    const cdp = await context.newCDPSession(p);
    const start = await p.evaluate(() => (window as any).BR.player);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: joy.x + joy.width / 2, y: joy.y + 15 }],
    });
    await p.waitForTimeout(750);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const moved = await p.evaluate(() => (window as any).BR.player);
    assert.ok(
      Math.hypot(moved.x - start.x, moved.z - start.z) > 0.3,
      "Touch joystick moves without keyboard",
    );
    const yaw = await p.evaluate(() => (window as any).BR.player.yaw);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 2, x: viewport.width * 0.65, y: viewport.height * 0.4 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { id: 2, x: viewport.width * 0.75, y: viewport.height * 0.43 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await p.waitForTimeout(100);
    assert.notEqual(
      await p.evaluate(() => (window as any).BR.player.yaw),
      yaw,
      "Touch look rotates camera",
    );
    await p.locator('[data-action="aim"]').tap();
    assert.equal(
      await p.evaluate(() => (window as any).BR.input.aim),
      true,
      "Aim stays on after a tap",
    );
    await p.locator('[data-action="aim"]').tap();
    assert.equal(await p.evaluate(() => (window as any).BR.input.aim), false);
    await p.locator("#switch-weapon").tap();
    await p.locator('[data-weapon="1"]').tap();
    await p.waitForFunction(() => (window as any).BR.player.weapon === 1);
    for (const action of [
      "fire",
      "jump",
      "jet",
      "place",
      "dig",
      "reload",
      "grenade",
      "ability",
    ]) {
      if (action === "place") await p.locator("#build-mode").tap();
      const button = p.locator(`[data-action=${action}]`);
      const r = await button.boundingBox();
      assert.ok(r);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ id: 3, x: r.x + r.width / 2, y: r.y + r.height / 2 }],
      });
      await p.waitForTimeout(120);
      if (
        !(await p.evaluate(
          (action) => (window as any).BR.input[action],
          action,
        ))
      ) {
        await p.screenshot({
          path: `artifacts/${viewport.name}-${action}-failure.png`,
        });
        console.log(
          "Touch diagnostic",
          action,
          await p.evaluate(() => ({
            player: (window as any).BR.player,
            input: (window as any).BR.input,
          })),
        );
      }
      assert.equal(
        await p.evaluate((action) => (window as any).BR.input[action], action),
        true,
        `Touch ${action} sends input`,
      );
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    await p.locator("#build-mode").tap();
    const fireRect = await p.locator('[data-action="fire"]').boundingBox();
    assert.ok(fireRect);
    const lookBefore = await p.evaluate(() => (window as any).BR.player.yaw);
    const firePoint = {
      id: 4,
      x: fireRect.x + fireRect.width / 2,
      y: fireRect.y + fireRect.height / 2,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        firePoint,
        { id: 5, x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { ...firePoint, x: firePoint.x - 35, y: firePoint.y - 18 },
        { id: 5, x: joy.x + joy.width / 2, y: joy.y + 15 },
      ],
    });
    await p.waitForTimeout(80);
    assert.ok(
      await p.evaluate(
        () =>
          (window as any).BR.input.fire && (window as any).BR.input.forward > 0,
      ),
      "Two thumbs move, aim and fire together",
    );
    assert.notEqual(
      await p.evaluate(() => (window as any).BR.player.yaw),
      lookBefore,
      "Dragging fire also aims",
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal(
      await p.evaluate(() => (window as any).BR.input.fire),
      false,
      "Release stops firing",
    );
    await p.screenshot({ path: `artifacts/${viewport.name}.png` });
    console.log(
      `PASS ${viewport.name}: touch joystick, look, fire, jump, jet, build, dig and reload; all controls within viewport`,
    );
    await context.close();
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

// Production transports; no debug mutation endpoint is added to the game.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { MAP_PRESETS } from "../shared/game.js";
const port = 3106;
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
try {
  const errors: string[] = [];
  const phone = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const a = await phone.newPage();
  a.setDefaultTimeout(30000);
  console.log("Opening phone solo setup");
  a.on("pageerror", (e) => errors.push(e.message));
  await a.goto(`http://127.0.0.1:${port}`);
  await a.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await a.locator("#name").fill("Solo captain");
  await a.locator("#practice").tap();
  assert.equal(
    await a.locator("#solo-map option").count(),
    MAP_PRESETS.length + 1,
  );
  await a.locator("#solo-mode").selectOption("ctf");
  await a.locator("#solo-map").selectOption("7233");
  await a.locator("#solo-bots").selectOption("15");
  await a.locator("#solo-duration").selectOption("480");
  await a.locator("#solo-start").tap();
  console.log("Waiting for CTF warmup");
  await a.waitForFunction(
    () =>
      (window as any).BR.connected &&
      (window as any).BR.state.phase === "active",
  );
  assert.equal(await a.locator("#solo-setup").isVisible(), false);
  assert.equal(
    await a.evaluate(() => (window as any).BR.state.players.length),
    16,
  );
  assert.equal(await a.evaluate(() => (window as any).BR.state.mode), "ctf");
  await a.waitForFunction(() =>
    (window as any).BR.state.players.some((p: any) => p.npcRole === "defender"),
  );
  assert.match(await a.locator("#mode-label").innerText(), /flag/i);
  const rooms: any[] = await (
    await fetch(`http://127.0.0.1:${port}/api/rooms`)
  ).json();
  const solo = rooms.find((r) => r.name.startsWith("Solo CTF"));
  assert.equal(solo.seed, 7233);
  assert.equal(solo.duration, 480);
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const b = await desktop.newPage();
  b.setDefaultTimeout(30000);
  console.log("Joining a friend to the same room");
  b.on("pageerror", (e) => errors.push(e.message));
  await b.goto(`http://127.0.0.1:${port}`);
  await b.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await b.locator("#name").fill("Friend");
  await b.locator("#browse").click();
  await b
    .locator("#rooms")
    .getByText(solo.name, { exact: true })
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Join", exact: true })
    .click();
  await b.waitForFunction(() => (window as any).BR.connected);
  for (const page of [a, b])
    await page.waitForFunction(
      () =>
        (window as any).BR.state.players.some(
          (p: any) => p.name === "Friend",
        ) &&
        (window as any).BR.state.players.some(
          (p: any) => p.name === "Solo captain",
        ),
    );
  for (const page of [a, b]) {
    assert.equal(
      await page.evaluate(() => (window as any).BR.state.players.length),
      16,
    );
    assert.equal(
      await page.evaluate(
        () => (window as any).BR.state.players.filter((p: any) => p.bot).length,
      ),
      14,
    );
  }
  // A software GPU can finish joining before the initial chunks/minimap have
  // settled. Start the animation check on a live acknowledged input stream.
  await b.waitForFunction(
    () =>
      (window as any).BR.map.tilesLeft === 0 &&
      (window as any).BR.network.pending < 12 &&
      (window as any).BR.network.snapshotAge < 600,
  );
  await b.bringToFront();
  if (await b.locator("#pause").isVisible()) await b.locator("#resume").click();
  if (!(await b.evaluate(() => document.pointerLockElement)))
    await b.locator("#game").click();
  await b.waitForFunction(() => !!document.pointerLockElement);
  await b.evaluate(() => {
    (window as any).__fireEvents = [];
    for (const kind of ["mousedown", "mouseup", "blur", "visibilitychange"])
      window.addEventListener(kind, (e) =>
        queueMicrotask(() =>
          (window as any).__fireEvents.push({
            kind: e.type,
            target: (e.target as HTMLElement).id,
            fire: (window as any).BR.input.fire,
            focus: document.hasFocus(),
            visible: !document.hidden,
            lock: document.pointerLockElement?.id,
          }),
        ),
      );
  });
  await b.mouse.down();
  try {
    await b
      .waitForFunction(
        () =>
          (window as any).BR.state.players.find((p: any) => p.name === "Friend")
            .ammo[0] < 24,
      )
      .catch(async (error) => {
        console.log(
          "Firing diagnostics",
          await b.evaluate(() => ({
            input: (window as any).BR.input,
            player: (window as any).BR.player,
            network: (window as any).BR.network,
            phase: (window as any).BR.state.phase,
            authority: (window as any).BR.state.players.find(
              (p: any) => p.name === "Friend",
            ),
            events: (window as any).__fireEvents,
            paused: !document
              .querySelector("#pause")
              ?.classList.contains("hidden"),
          })),
        );
        await b.screenshot({ path: "artifacts/banner-fire-failure.png" });
        throw error;
      });
  } finally {
    await b.mouse.up();
  }
  await b.keyboard.press("KeyR");
  console.log("Checking animated reloads");
  await b.waitForFunction(
    () => (window as any).BR.weaponAnimation.pose?.magazine > 0.5,
  );
  const animation = await b.evaluate(() => (window as any).BR.weaponAnimation);
  assert.ok(
    animation.parts.some(
      (p: any) => p.kind === "magazine" && p.position[1] < -0.3,
    ),
  );
  await b.waitForFunction(
    () =>
      (window as any).BR.state.players.find((p: any) => p.name === "Friend")
        .reload === 0 &&
      (window as any).BR.state.players.find((p: any) => p.name === "Friend")
        .ammo[0] === 24,
  );
  const cdp = await phone.newCDPSession(a);
  const fire = (await a.locator('[data-action="fire"]').boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 }],
  });
  await a.waitForTimeout(250);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await a.waitForFunction(
    () =>
      (window as any).BR.state.players.find(
        (p: any) => p.name === "Solo captain",
      ).ammo[0] < 24,
  );
  await a.locator('[data-action="reload"]').tap();
  await a.waitForFunction(
    () => (window as any).BR.weaponAnimation.pose?.magazine > 0.5,
  );
  await mkdir("artifacts", { recursive: true });
  await a.screenshot({ path: "artifacts/banner-phone-reload.png" });
  await b.screenshot({ path: "artifacts/banner-desktop.png" });
  // Exercise all map presets through the normal room API and join UI.
  await b.keyboard.press("Escape");
  await b.locator("#leave").click();
  for (const preset of MAP_PRESETS) {
    console.log(`Checking map ${preset.name}`);
    const created = (await (
      await fetch(`http://127.0.0.1:${port}/api/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: preset.name,
          mode: "tdm",
          jet: "all",
          bots: 3,
          seed: preset.seed,
        }),
      })
    ).json()) as any;
    assert.ok(created.id);
    await b.locator("#browse").click();
    await b
      .locator("#rooms")
      .getByText(preset.name, { exact: true })
      .locator("..")
      .locator("..")
      .getByRole("button", { name: "Join", exact: true })
      .click();
    await b
      .waitForFunction(
        (seed) =>
          (window as any).BR.connected &&
          (window as any).BR.state.seed === seed &&
          (window as any).BR.state.phase === "active" &&
          (window as any).BR.map.tilesLeft === 0,
        preset.seed,
      )
      .catch(async (error) => {
        console.log(
          "Map join diagnostics",
          await b.evaluate(() => ({
            connected: (window as any).BR.connected,
            state: (window as any).BR.state && {
              seed: (window as any).BR.state.seed,
              phase: (window as any).BR.state.phase,
              players: (window as any).BR.state.players.map((p: any) => ({
                name: p.name,
                bot: p.bot,
              })),
            },
            network: (window as any).BR.network,
            status: document.querySelector("#status")?.textContent,
          })),
          await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json(),
        );
        throw error;
      });
    assert.equal(
      await b.evaluate(
        () => (window as any).BR.state.players.filter((p: any) => p.bot).length,
      ),
      3,
    );
    await b.screenshot({ path: `artifacts/map-${preset.seed}.png` });
    await b.keyboard.press("Escape");
    await b.locator("#leave").click();
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${process.env.BR_TRANSPORT ?? "ws"}: phone solo CTF setup, fifteen cooperating bots, friend joins same match, keyboard/touch reload moving parts, four map presets`,
  );
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const server = spawn(
  process.execPath,
  ["--import", "tsx", "tests/hosted-shim.ts"],
  {
    env: { ...process.env, PORT: "3102" },
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
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const a = await context.newPage(),
    b = await context.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  let calls = 0,
    largest = 0;
  await a.route("**/api/input", async (route) => {
    largest = Math.max(
      largest,
      Buffer.byteLength(route.request().postData() ?? ""),
    );
    calls++;
    if (calls === 1)
      return route.fulfill({
        status: 413,
        contentType: "application/json",
        body: '{"error":"Request too large"}',
      });
    if (calls === 2) {
      // Request hangs beyond the client's timeout; then the transport recovers.
      await new Promise((resolve) => setTimeout(resolve, 6000));
      await route
        .fulfill({ status: 503, body: "temporary outage" })
        .catch(() => {});
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue().catch(() => {});
  });
  for (const p of [a, b]) {
    await p.goto("http://127.0.0.1:3102");
    await p.waitForFunction(() =>
      document
        .querySelector("#status")
        ?.textContent?.includes("rooms available"),
    );
    await p.locator("#play").tap();
    await p.waitForFunction(() => (window as any).BR.connected);
  }
  await a.waitForFunction(() => (window as any).BR.remotes === 1);
  await a.waitForFunction(
    () => (window as any).BR.network.acknowledged > 5,
    undefined,
    { timeout: 25000 },
  );
  const before = await a.evaluate(
    () => (window as any).BR.network.acknowledged,
  );
  await a.waitForFunction(
    (seq) => (window as any).BR.network.acknowledged > seq + 20,
    before,
    { timeout: 10000 },
  );
  for (let i = 0; i < 8; i++) {
    const check = await a.evaluate(() => ({
      connected: (window as any).BR.connected,
      pending: (window as any).BR.network.pending,
    }));
    assert.ok(check.connected);
    assert.ok(
      check.pending <= 30,
      "prediction cannot grow into seconds of queued movement",
    );
    await a.waitForTimeout(250);
  }
  assert.ok(largest <= 7000, `Largest packet ${largest} bytes`);
  const diagnostics = await a.evaluate(() => (window as any).BR.network);
  assert.ok(
    diagnostics.failures >= 2,
    "diagnostics count HTTP errors/timeouts",
  );
  assert.ok(
    diagnostics.predictionStops >= 1,
    "outage fills bounded queue without losing telemetry",
  );
  assert.ok(diagnostics.buffer >= 100 && diagnostics.buffer <= 250);
  assert.equal(
    diagnostics.lagCompensation,
    false,
    "HTTP does not advertise unavailable rewind",
  );
  const joystick = await a.locator("#joystick").boundingBox();
  assert.ok(joystick);
  const cdp = await context.newCDPSession(a);
  const initial = await a.evaluate(() => (window as any).BR.player);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        id: 1,
        x: joystick.x + joystick.width / 2,
        y: joystick.y + joystick.height / 2,
      },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { id: 1, x: joystick.x + joystick.width / 2, y: joystick.y + 15 },
    ],
  });
  await a.waitForTimeout(900);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await b.waitForFunction(
    (start) => {
      const remote = (window as any).BR.state.players.find(
        (p: any) => p.id === start.id,
      );
      return remote && Math.hypot(remote.x - start.x, remote.z - start.z) > 0.3;
    },
    initial,
    { timeout: 10000 },
  );
  await a.waitForFunction(
    () => {
      const local = (window as any).BR.player;
      const authoritative = (window as any).BR.state.players.find(
        (p: any) => p.id === local.id,
      );
      return (
        Math.hypot(local.x - authoritative.x, local.z - authoritative.z) < 1
      );
    },
    undefined,
    { timeout: 10000 },
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS two HTTP clients: 413 recovery, hung-request timeout, 250ms latency, bounded prediction, advancing acknowledgements; maximum packet ${largest} bytes`,
  );
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

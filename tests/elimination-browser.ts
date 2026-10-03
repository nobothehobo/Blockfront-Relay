// A controlled authoritative server fixture, never shipped in the production server.
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { WebSocketServer } from "ws";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
const room = new Room("view-test", {
  name: "View test",
  mode: "tdm",
  jet: "all",
  seed: 7231,
});
const server = http.createServer(async (req, res) => {
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
let damageTimer: ReturnType<typeof setTimeout> | undefined;
sockets.on("connection", (ws, req) => {
  const player = room.add(
    "viewer",
    new URL(req.url!, "http://localhost").searchParams.get("name") ?? "Viewer",
    { send: (s) => ws.send(s) },
  );
  ws.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === "input") {
      if (message.inputs)
        room.queueInputs(player.id, message.inputs, message.epoch);
      else room.input(player.id, message.input);
    }
  });
  // Damage comes from real server gameplay logic, not a forged client snapshot.
  damageTimer = setTimeout(() => {
    player.protected = 0;
    room.damage(player, 999, player);
  }, 4000);
  ws.on("close", () => room.remove(player.id));
});
const ticks = setInterval(() => room.tick(), 1000 / 30);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as any).port;
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
    viewport: { width: 1024, height: 768 },
    isMobile: true,
    hasTouch: true,
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("rooms available"),
  );
  await page.locator("#play").tap();
  await page.waitForFunction(() => (window as any).BR.connected);
  await page.waitForFunction(
    () =>
      (window as any).BR.elimination.active &&
      (window as any).BR.elimination.modelVisible,
  );
  assert.ok(await page.evaluate(() => (window as any).BR.player.dead > 0));
  assert.equal(await page.locator("#crosshair").isVisible(), false);
  assert.ok(await page.locator("#banner").textContent());
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/elimination.png" });
  await page.waitForFunction(
    () =>
      (window as any).BR.player.dead === 0 &&
      !(window as any).BR.elimination.active,
  );
  assert.equal(await page.locator("#crosshair").isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS elimination: authoritative damage, third-person player model, countdown, respawn cleanup and first-person return",
  );
} finally {
  await browser.close();
  clearInterval(ticks);
  if (damageTimer) clearTimeout(damageTimer);
  for (const ws of sockets.clients) ws.close();
  sockets.close();
  server.close();
}

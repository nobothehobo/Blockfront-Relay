// Real browser Web Audio graph and PCM output; test-only page is not deployed.
import http from "node:http";
import { existsSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
const bundle = await build({
  entryPoints: ["client/audio.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const server = http.createServer((req, res) => {
  if (req.url === "/sound.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles![0].text);
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<button id="start">Enable audio</button><script type="module">import {Sound} from "/sound.js";window.sound=new Sound();document.querySelector("button").onclick=()=>window.sound.unlock();</script>',
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath:
    process.env.BR_BROWSER_PATH ??
    (existsSync("/tmp/br-browser/chromium")
      ? "/tmp/br-browser/chromium"
      : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
        hasTouch: mobile,
        isMobile: mobile,
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1000, height: 700 },
      }),
      p = await context.newPage(),
      errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${(server.address() as any).port}`);
    await p.waitForFunction(() => !!(window as any).sound);
    if (mobile) await p.locator("#start").tap();
    else await p.locator("#start").click();
    await p.waitForFunction(
      () => (window as any).sound.diagnostics.state === "running",
    );
    await p.evaluate(() => {
      const s = (window as any).sound,
        a = s.ctx.createAnalyser();
      a.fftSize = 2048;
      (s as any).bus.connect(a);
      (window as any).analyser = a;
      s.updateJets([{ id: "local", gain: 1, pan: 0, load: 1 }]);
    });
    await p.waitForTimeout(150);
    const energy = await p.evaluate(() => {
      const a = (window as any).analyser,
        pcm = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(pcm);
      return pcm.reduce((v, n) => v + n * n, 0) / pcm.length;
    });
    assert.ok(energy > 0.000001, "continuous engine produces non-silent PCM");
    await p.evaluate(() => {
      for (let i = 0; i < 200; i++)
        (window as any).sound.updateJets([
          { id: "local", gain: 1, pan: 0, load: 0.2 },
        ]);
    });
    assert.equal(
      await p.evaluate(() => (window as any).sound.diagnostics.starts),
      1,
      "frames reuse one engine",
    );
    await p.evaluate(() =>
      (window as any).sound.updateJets(
        Array.from({ length: 8 }, (_, i) => ({
          id: String(i),
          gain: 0.3,
          pan: 0,
          load: 1,
        })),
      ),
    );
    assert.equal(
      await p.evaluate(() => (window as any).sound.diagnostics.engines),
      4,
      "engine budget enforced",
    );
    await p.evaluate(() => {
      const s = (window as any).sound;
      s.master = 0;
      s.updateJets([{ id: "0", gain: 1, pan: 0, load: 1 }]);
    });
    assert.equal(
      await p.evaluate(() => (window as any).sound.diagnostics.engines),
      0,
      "mute stops loops",
    );
    await p.waitForTimeout(300);
    await p.evaluate(() => {
      const s = (window as any).sound;
      s.master = 0.55;
      for (let weapon = 0; weapon < 4; weapon++) s.play("shot", 1, weapon);
      for (const kind of [
        "impact",
        "throw",
        "reload",
        "place",
        "dig",
        "step",
        "jump",
        "explosion",
        "damage",
        "hit",
        "kill",
        "ui",
        "infection",
        "objective",
      ])
        s.play(kind);
    });
    assert.ok(
      await p.evaluate(() => (window as any).sound.diagnostics.voices <= 32),
    );
    await p.waitForTimeout(1000);
    assert.equal(
      await p.evaluate(() => (window as any).sound.diagnostics.voices),
      0,
      "one-shots release their nodes",
    );
    assert.equal(
      await p.evaluate(() => (window as any).sound.diagnostics.cachedBuffers),
      2,
      "noise buffers reused",
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS ${mobile ? "touch" : "desktop"} audio: gesture unlock, non-silent sustained thrust, stable/capped engines, mute and voice cleanup`,
    );
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import worker from "../worker/index.js";

test("hosted Home Screen manifest and PNG icons preserve installation metadata and bytes", async () => {
  const res = await worker.fetch(
    new Request("https://game.test/manifest.webmanifest"),
    {},
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type")!, /application\/manifest\+json/);
  const manifest = (await res.json()) as any;
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  for (const icon of [
    ...manifest.icons,
    { src: "/icons/apple-touch-icon.png", sizes: "180x180" },
  ]) {
    const response = await worker.fetch(
      new Request(`https://game.test${icon.src}`),
      {},
    );
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(
      bytes,
      await readFile(`client/public${icon.src.split("?")[0]}`),
    );
    assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split("x")[0]));
  }
  const html = await (
    await worker.fetch(new Request("https://game.test/"), {})
  ).text();
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /viewport-fit=cover/);
});

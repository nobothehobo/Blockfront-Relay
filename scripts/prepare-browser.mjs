import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, chmod } from "node:fs/promises";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";
import tar from "tar-fs";
const dir = process.env.BR_BROWSER_DIR ?? "/tmp/br-browser";
await mkdir(dir, { recursive: true });
const base = new URL(
  "../node_modules/@sparticuz/chromium/bin/",
  import.meta.url,
);
await pipeline(
  createReadStream(new URL("chromium.br", base)),
  createBrotliDecompress(),
  createWriteStream(dir + "/chromium"),
);
await chmod(dir + "/chromium", 0o755);
for (const name of ["swiftshader", "fonts"]) {
  await pipeline(
    createReadStream(new URL(name + ".tar.br", base)),
    createBrotliDecompress(),
    tar.extract(name === "fonts" ? dir + "/fonts" : dir, { chown: false }),
  );
}
console.log(dir + "/chromium");

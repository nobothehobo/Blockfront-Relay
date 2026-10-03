import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
const assets = {};
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(file);
    else {
      const key =
        "/" + path.relative("dist/client", file).replaceAll("\\", "/");
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
        }[path.extname(file)] ?? "text/plain";
      assets[key] = { mime, body: await readFile(file, "utf8") };
    }
  }
}
await scan("dist/client");
await writeFile(
  "worker/assets.generated.js",
  "export const assets=" + JSON.stringify(assets) + ";",
);
await mkdir("dist/server", { recursive: true });
await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "dist/server/index.js",
  minify: true,
  platform: "browser",
});
await mkdir("dist/.openai", { recursive: true });
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Built authoritative hosted game worker");

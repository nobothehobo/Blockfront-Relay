import { build } from "esbuild";
await build({
  entryPoints: ["server/node.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  outfile: "dist/node/index.js",
  sourcemap: true,
});
console.log("Built production Node server");

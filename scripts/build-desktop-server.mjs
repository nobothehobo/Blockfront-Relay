import { build } from "esbuild";

// Retain the authoritative Node WebSocket simulation, bundle ws into one file.
await build({
  entryPoints: ["server/node.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  packages: "bundle",
  external: ["bufferutil", "utf-8-validate"],
  outfile: "dist/desktop/server.cjs",
});
console.log("Desktop authoritative server bundle created.");

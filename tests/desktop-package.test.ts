import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desktop = JSON.parse(readFileSync("desktop/package.json", "utf8"));
const root = JSON.parse(readFileSync("package.json", "utf8"));
const wrapper = readFileSync("desktop/main.cjs", "utf8");
const workflow = readFileSync(".github/workflows/gamejolt-desktop.yml", "utf8");

test("desktop version and supported updating installers", () => {
  assert.equal(desktop.version, root.version);
  assert.deepEqual(desktop.build.win.target, ["nsis"]);
  assert.deepEqual(desktop.build.linux.target, ["AppImage"]);
  assert.ok(desktop.dependencies["electron-updater"]);
  assert.equal(desktop.build.publish[0].provider, "github");
});
test("LAN hosting is opt-in and the page has no Node privilege", () => {
  assert.match(wrapper, /lan \? "0\.0\.0\.0" : "127\.0\.0\.1"/);
  assert.match(wrapper, /contextIsolation: true, sandbox: true/);
  assert.match(wrapper, /nodeIntegration: false/);
  assert.match(wrapper, /autoUpdater\.autoInstallOnAppQuit = true/);
  assert.doesNotMatch(wrapper, /quitAndInstall\(/);
});
test("public desktop release requires signing secrets and update manifests", () => {
  assert.match(workflow, /WIN_CSC_LINK/);
  assert.match(workflow, /WIN_CSC_KEY_PASSWORD/);
  assert.match(workflow, /test -f release\/latest\.yml/);
  assert.match(workflow, /test -f release\/latest-linux\.yml/);
});

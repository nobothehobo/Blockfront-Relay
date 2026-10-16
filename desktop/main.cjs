"use strict";

// The full Blockfront Relay browser client is rendered locally inside Electron.
// The authoritative server is bundled and spawned separately. No page gets Node APIs.
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { networkInterfaces } = require("node:os");
const path = require("node:path");

const PORT = 30740;
const URL_LOCAL = "http://127.0.0.1:" + PORT;
let win = null;
let server = null;
let lanEnabled = false;
let switching = false;
let quitting = false;
let updateReadyVersion = null;

const gameRoot = () => app.isPackaged
  ? path.join(process.resourcesPath, "game")
  : path.resolve(__dirname, "..");

const gameServer = () => app.isPackaged
  ? path.join(gameRoot(), "server.cjs")
  : path.join(gameRoot(), "dist", "desktop", "server.cjs");

function lanURLs() {
  const urls = new Set();
  for (const entries of Object.values(networkInterfaces()))
    for (const entry of entries || [])
      if (entry.family === "IPv4" && !entry.internal)
        urls.add("http://" + entry.address + ":" + PORT);
  return [...urls];
}

async function portAvailable() {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(PORT, "0.0.0.0", () => probe.close(resolve));
  });
}

async function waitForReady(proc) {
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null || proc.signalCode !== null)
      throw Error("The local game server unexpectedly stopped.");
    try {
      const response = await fetch(URL_LOCAL + "/api/health", {
        signal: AbortSignal.timeout(600),
      });
      if (response.ok && (await response.json()).transport === "ws") return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw Error("The game server did not become ready.");
}

async function startServer(lan) {
  await portAvailable();
  // Never pass Electron renderer privileges or app update credentials to the game server.
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.GH_TOKEN;
  delete environment.GITHUB_TOKEN;
  delete environment.CSC_LINK;
  delete environment.CSC_KEY_PASSWORD;
  Object.assign(environment, {
    ELECTRON_RUN_AS_NODE: "1",
    HOST: lan ? "0.0.0.0" : "127.0.0.1",
    PORT: String(PORT),
    BLOCKFRONT_SAME_ORIGIN: "true",
    BLOCKFRONT_ASSET_ROOT: path.join(gameRoot(), "dist", "client"),
    ALLOWED_ORIGINS: "",
  });
  const proc = spawn(process.execPath, [gameServer()], {
    cwd: gameRoot(),
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
    env: environment,
  });
  server = proc;
  let errors = "";
  proc.stderr.on("data", (chunk) => {
    errors = (errors + String(chunk)).slice(-1200);
    console.error(String(chunk));
  });
  proc.on("exit", (code) => {
    if (server !== proc || quitting || switching) return;
    server = null;
    dialog.showErrorBox("Game server stopped", "Server exited: " + code + "\n" + errors);
  });
  try {
    await waitForReady(proc);
  } catch (error) {
    server = null;
    proc.kill();
    throw new Error(String(error) + "\n" + errors);
  }
  lanEnabled = lan;
}

async function stopServer() {
  const proc = server;
  server = null;
  if (!proc || proc.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2500);
    proc.once("exit", () => { clearTimeout(timeout); resolve(); });
    proc.kill();
  });
}

async function toggleLan(enabled) {
  if (switching) return;
  if (enabled) {
    const answer = await dialog.showMessageBox(win, {
      type: "warning",
      title: "Allow LAN players?",
      message: "Other devices on this network will be able to connect.",
      detail: "Only enable this on a trusted network. This is not a password-protected lobby or internet relay. Changing modes disconnects current players.",
      buttons: ["Cancel", "Enable LAN hosting"],
      defaultId: 0,
      cancelId: 0,
    });
    if (answer.response !== 1) { makeMenu(); return; }
  }
  switching = true;
  try {
    await stopServer();
    await startServer(enabled);
    await win.loadURL(URL_LOCAL);
    if (enabled)
      await dialog.showMessageBox(win, {
        type: "info", title: "LAN game addresses",
        message: "Open the address below on other devices using the same network:",
        detail: lanURLs().join("\n") || "No reachable IPv4 network address found.",
      });
  } catch (error) {
    dialog.showErrorBox("Hosting unavailable", String(error));
    try {
      await stopServer();
      await startServer(false);
      await win.loadURL(URL_LOCAL);
    } catch (retryError) {
      dialog.showErrorBox("Game server failed to restart", String(retryError));
    }
  } finally {
    switching = false;
    makeMenu();
  }
}

function makeMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Game", submenu: [
      { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => win?.reload() },
      { role: "quit" },
    ] },
    { label: "Hosting", submenu: [
      { label: "Allow other devices on my LAN", type: "checkbox",
        checked: lanEnabled, enabled: !switching,
        click: item => { void toggleLan(item.checked); } },
      { label: "Show connection address", click: () => dialog.showMessageBox(win, {
        type: "info", message: lanEnabled ? "LAN addresses" : "Local game",
        detail: lanEnabled ? lanURLs().join("\n") : URL_LOCAL + "\nEnable LAN hosting to share on your Wi-Fi.",
      }) },
    ] },
    { label: "Updates", submenu: [
      { label: updateReadyVersion ? "Version " + updateReadyVersion + " ready — installs on exit" : "Updates install when you exit", enabled: false },
      { label: "Check for updates", click: () => { void checkUpdates(); } },
      { label: "Release page", click: () => { void shell.openExternal("https://github.com/nobothehobo/Blockfront-Relay/releases"); } },
    ] },
    { label: "Help", submenu: [
      { label: "Source and credits", click: () => {
        void shell.openExternal("https://github.com/nobothehobo/Blockfront-Relay");
      } },
    ] },
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 520,
    backgroundColor: "#10212b", show: false, title: "Blockfront Relay",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, devTools: false, webviewTag: false,
    },
  });
  const content = win.webContents;
  content.session.setPermissionRequestHandler((sender, permission, callback) => {
    callback(sender === content && permission === "pointerLock" &&
      sender.getURL().startsWith(URL_LOCAL + "/"));
  });
  content.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  content.on("will-navigate", (event, url) => {
    try { if (new URL(url).origin === URL_LOCAL) return; } catch {}
    event.preventDefault();
  });
  win.once("ready-to-show", () => win?.show());
  void win.loadURL(URL_LOCAL);
}

// Signed Windows NSIS / Linux AppImage / signed macOS can receive updates from
// published GitHub Releases. The updater downloads during play but installs
// ONLY when the user closes the game; no mid-match restarts.
let checking = false;
async function checkUpdates(showError = false) {
  if (!app.isPackaged) return;
  if (process.platform === "linux" && !process.env.APPIMAGE) return;
  if (checking) return;
  checking = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.warn("Update check failed:", error);
    if (showError && win) void dialog.showMessageBox(win, {
      type: "info", message: "Couldn't check for updates",
      detail: "Your installed version is unchanged. Check your internet connection or the release page.",
    });
  } finally {
    checking = false;
  }
}

function setupUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on("update-available", info =>
    console.log("Downloading Blockfront version", info.version));
  autoUpdater.on("update-downloaded", info => {
    updateReadyVersion = info.version;
    console.log("Update staged for normal exit:", info.version);
    makeMenu(); // Never steal focus from a live match with a modal update prompt.
    if (win && !win.isDestroyed()) win.setTitle("Blockfront Relay — update ready");
  });
  autoUpdater.on("error", error => console.warn("Updater:", error));
  setTimeout(() => { void checkUpdates(); }, 12000).unref();
  setInterval(() => { void checkUpdates(); }, 6 * 60 * 60 * 1000).unref();
}

app.whenReady().then(async () => {
  try {
    await startServer(false);
    makeMenu();
    createWindow();
    setupUpdater();
  } catch (error) {
    dialog.showErrorBox("Blockfront Relay couldn't launch", String(error));
    app.quit();
  }
});
app.on("before-quit", () => {
  quitting = true;
  if (server) server.kill();
  server = null;
});
app.on("window-all-closed", () => app.quit());

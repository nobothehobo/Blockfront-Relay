import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { replay } from "../shared/prediction.js";
import { SnapshotClock, ConnectionStats } from "./net-timing.js";
import {
  inputPacket,
  MAX_PENDING_INPUTS,
  requestJson,
  ApiError,
} from "./network.js";
import "./style.css";
import {
  World,
  Player,
  Body,
  Input,
  emptyInput,
  move,
  eye,
  direction,
  ray,
  WEAPONS,
  TICK,
  W,
  D,
  mapTheme,
  isFirearm,
  palette,
  mapLayout,
  MAP_PRESETS,
} from "../shared/game.js";
import { MiniMap } from "./minimap.js";
import { stickInput, touchLookGain } from "./control-math.js";
import { eliminationCamera } from "./elimination.js";
import { Terrain } from "./mesh.js";
import { Sound } from "./audio.js";
import { jetVoices } from "./audio-mix.js";
import { Sky } from "./sky.js";
import { playerPose } from "./animation.js";
import { createCharacter } from "./character.js";
import { CombatFX } from "./combat-fx.js";
import {
  CLASSES,
  classInfo,
  validClass,
  allowedWeapon,
} from "../shared/classes.js";
import { KITS } from "../shared/fortifications.js";
import { FortificationView } from "./fortification-view.js";
import { weaponPose } from "./weapon-pose.js";
import { BattlefieldView, WaterSurface } from "./battlefield-view.js";
import { ContactShadows } from "./contact-shadows.js";
import { shadowQuality, sceneLighting } from "./lighting.js";
import { GearView } from "./gear-view.js";
import { gearInfo } from "../shared/gear.js";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const show = (id: string, on = true) => $(id).classList.toggle("hidden", !on);
const sound = new Sound();
const touch =
  matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle("touch", touch);
const standaloneQuery = matchMedia("(display-mode: standalone)");
const updateAppMode = () => {
  const standalone =
    standaloneQuery.matches ||
    matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  document.body.classList.toggle("standalone", standalone);
  $("install-tip").hidden = !touch || standalone;
};
standaloneQuery.addEventListener("change", updateAppMode);
updateAppMode();
type Settings = {
  preset: string;
  distance: number;
  effects: string;
  shadows: boolean;
  fov: number;
  master: number;
  volume: number;
  mouse: number;
  mobile: number;
  scale: number;
  invert: boolean;
  crosshair: string;
};
const defaults: Settings = {
  preset: touch ? "mobile" : "balanced",
  distance: touch ? 80 : 112,
  effects: touch ? "low" : "high",
  shadows: true,
  fov: 80,
  master: 0.55,
  volume: 0.75,
  mouse: 1,
  mobile: 1,
  scale: 1,
  invert: false,
  crosshair: "+",
};
let settings: Settings = { ...defaults };
try {
  settings = {
    ...defaults,
    ...JSON.parse(localStorage.getItem("br-settings") ?? "{}"),
  };
} catch {}
const input = emptyInput();
let selectedClass = Number(localStorage.getItem("br-class") ?? 0);
if (!validClass(selectedClass)) selectedClass = 0;
input.classId = selectedClass;
const pulses: Partial<Record<keyof Input, boolean>> = {};
let yaw = 0,
  pitch = 0,
  seq = 0,
  connected = false,
  joining = false,
  paused = false,
  id = "",
  roomId = "",
  state: any = null,
  local: Player | null = null,
  lastNet = 0,
  ping = 0,
  lastShot = 0,
  hitUntil = 0,
  damageUntil = 0,
  stepAt = 0,
  mouseLocked = false,
  firstState = true,
  networkMode = "ws",
  httpToken = "",
  httpBusy = false,
  httpCursor = 0;
let pendingInputs: Input[] = [];
const snapshotClock = new SnapshotClock(),
  connectionStats = new ConnectionStats();
let predictionBlocked = false;
let lastNetworkUi = -1000;
let predictionEpoch = 0;
const renderCorrection = new THREE.Vector3();
let lastPing = 0;
let nextShotFeedback = 0;
let predictedShotTimes: number[] = [];
let sentCommand = 0;
let lastStateAt = performance.now(),
  retryAt = 0,
  networkFailures = 0;
let serverUrl =
  localStorage.getItem("br-server") ??
  (import.meta as any).env.VITE_SERVER_URL ??
  "";
$("server-url").setAttribute("value", serverUrl);
const base = () => serverUrl.replace(/\/$/, "");
const api = (path: string, options?: RequestInit) =>
  requestJson(base() + path, options);
const world = new World(),
  terrain = new Terrain(world);
terrain.prioritize(W / 2, D / 2);
terrain.update(4);
const minimap = new MiniMap(
  world,
  $<HTMLCanvasElement>("minimap-canvas"),
  $("minimap"),
  $<HTMLButtonElement>("minimap-toggle"),
);
const canvas = $<HTMLCanvasElement>("game");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !touch,
  powerPreference: "high-performance",
});
renderer.setClearColor(0xa9c3bd);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = shadowQuality(
  settings.preset,
  touch,
  settings.shadows,
).enabled;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
const combatFX = new CombatFX(scene);
const fortifications = new FortificationView(scene);
const fieldGear = new GearView(scene);
scene.fog = new THREE.Fog(0xa9c3bd, 30, 100);
scene.add(terrain.group);
const ambient = new THREE.HemisphereLight(0xe4efff, 0x899a6c, 0.85);
scene.add(ambient);
const bounce = new THREE.DirectionalLight(0xbdd8e3, 0.45);
bounce.position.set(35, 20, 45);
scene.add(bounce);
const sun = new THREE.DirectionalLight(0xffe8bf, 2.8);
sun.position.set(-48, 64, -60);
sun.castShadow = true;
sun.shadow.mapSize.set(512, 512);
sun.shadow.camera.left = sun.shadow.camera.bottom = -32;
sun.shadow.camera.right = sun.shadow.camera.top = 32;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);
let lastShadow = 0;
const camera = new THREE.PerspectiveCamera(
  settings.fov,
  innerWidth / innerHeight,
  0.07,
  360,
);
camera.rotation.order = "YXZ";
scene.add(camera);
const water = new WaterSurface();
scene.add(water.mesh);
const battlefield = new BattlefieldView();
scene.add(battlefield.group);
const contactShadows = new ContactShadows();
scene.add(contactShadows.mesh);
const sky = new Sky();
scene.add(sky.mesh);
function applyTheme(mode = state?.mode) {
  const outbreak = mode === "infection";
  const theme = mapTheme(world.seed);
  scene.background = new THREE.Color(theme.sky);
  sky.theme(world.seed, outbreak);
  (scene.fog as THREE.Fog).color.copy(sky.material.uniforms.horizon.value);
  water.theme(theme.water);
  water.mesh.scale.y = mapLayout(world.seed) === 1 ? 1.8 : 1;
  sun.color.setHex(
    outbreak ? 0xc7d8e5 : theme.kind === 0 ? 0xffdfad : 0xfff0d5,
  );
  const lighting = sceneLighting(theme.kind, outbreak);
  renderer.toneMappingExposure = lighting.exposure;
  sun.intensity = lighting.sun;
  ambient.intensity = lighting.ambient;
  bounce.intensity = lighting.bounce;
  ambient.groundColor.setHex(
    theme.kind === 2 ? 0x9aa6bc : theme.kind === 0 ? 0x9f8666 : 0x899a6c,
  );
}
applyTheme();
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
const mat = (color: number) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.18 });
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
  parent: THREE.Object3D,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function setWeaponModel(n: number) {
  weaponGroup.userData.dynamic = [];
  const moving = (mesh: THREE.Mesh, kind: string) => {
    if (kind === "fixed") return mesh;
    mesh.userData.kind = kind;
    mesh.userData.home = mesh.position.clone();
    weaponGroup.userData.dynamic.push(mesh);
    return mesh;
  };
  weaponGroup.userData.flash = null;
  while (weaponGroup.children.length) {
    const child = weaponGroup.children[0] as THREE.Mesh;
    child.geometry.dispose();
    (child.material as THREE.Material).dispose();
    weaponGroup.remove(child);
  }
  if (n === 6) {
    box(0.23, 0.23, 0.72, 0.23, -0.22, -0.58, 0x546458, weaponGroup);
    box(0.28, 0.28, 0.08, 0.23, -0.22, -0.98, 0x223a3e, weaponGroup);
    box(0.16, 0.16, 0.015, 0.23, -0.22, -1.025, 0x121f25, weaponGroup);
    box(0.1, 0.22, 0.12, 0.23, -0.38, -0.37, 0x8a6848, weaponGroup);
    box(0.27, 0.045, 0.12, 0.23, -0.22, -0.68, 0xdfb86b, weaponGroup);
    box(0.06, 0.08, 0.09, 0.23, -0.07, -0.62, 0x172e34, weaponGroup);
  } else if (isFirearm(n)) {
    box(
      0.12,
      0.12,
      n === 2 ? 0.6 : 0.48,
      0.23,
      -0.22,
      -0.5,
      0x33444b,
      weaponGroup,
    );
    box(
      0.065,
      0.07,
      n === 3 ? 0.64 : 0.33,
      0.23,
      -0.19,
      -0.82,
      0x8baba6,
      weaponGroup,
    );
    box(0.08, 0.21, 0.12, 0.23, -0.31, -0.4, 0x865d41, weaponGroup);
    box(0.11, 0.13, 0.24, 0.23, -0.23, -0.22, 0x796342, weaponGroup);
    moving(
      box(
        0.1,
        0.09,
        n === 2 ? 0.27 : 0.2,
        0.23,
        -0.25,
        -0.67,
        0x796342,
        weaponGroup,
      ),
      n === 2 ? "pump" : "fixed",
    );
    if (n !== 2)
      moving(
        box(0.075, 0.2, 0.11, 0.23, -0.36, -0.55, 0x263b43, weaponGroup),
        "magazine",
      );
    if (n === 1)
      box(0.055, 0.18, 0.065, 0.23, -0.34, -0.69, 0x263b43, weaponGroup);
    box(
      0.1,
      0.055,
      0.07,
      0.23,
      -0.185,
      n === 3 ? -1.14 : -1.0,
      0x26333a,
      weaponGroup,
    );
    if (n === 3)
      box(0.08, 0.08, 0.25, 0.23, -0.11, -0.49, 0x142b32, weaponGroup);
    else box(0.04, 0.05, 0.04, 0.23, -0.14, -0.68, 0x132c34, weaponGroup);
  } else if (n === 4 && local?.classId === 4 && !local.zombie) {
    box(0.22, 0.2, 0.43, 0.26, -0.2, -0.58, 0xe3ac59, weaponGroup);
    box(0.1, 0.23, 0.1, 0.26, -0.37, -0.4, 0x30434c, weaponGroup);
    box(0.24, 0.035, 0.13, 0.26, -0.12, -0.56, 0x33454d, weaponGroup);
    moving(
      box(0.13, 0.13, 0.28, 0.26, -0.2, -0.91, 0x91a7a9, weaponGroup),
      "drill",
    );
    moving(
      box(0.19, 0.045, 0.07, 0.26, -0.2, -1.04, 0xb9ccca, weaponGroup),
      "drill",
    );
  } else if (n === 4) {
    box(0.045, 0.5, 0.045, 0.26, -0.3, -0.54, 0x896745, weaponGroup);
    box(0.24, 0.22, 0.045, 0.26, -0.01, -0.54, 0x91a6a3, weaponGroup);
  } else box(0.23, 0.23, 0.23, 0.26, -0.25, -0.55, 0x57caba, weaponGroup);
  box(0.13, 0.15, 0.25, 0.23, -0.39, -0.28, 0xd6b183, weaponGroup);
  box(0.15, 0.11, 0.18, 0.23, -0.4, -0.14, 0x416b63, weaponGroup);
  if (isFirearm(n)) {
    moving(
      box(0.12, 0.12, 0.14, 0.2, -0.32, -0.66, 0xd6b183, weaponGroup),
      "hand",
    );
    moving(
      box(0.15, 0.14, 0.24, 0.14, -0.4, -0.55, 0x416b63, weaponGroup),
      "hand",
    );
    moving(
      box(0.015, 0.04, 0.13, 0.3, -0.2, -0.55, 0x9baeb0, weaponGroup),
      "bolt",
    );
    if (n === 2 || n === 6)
      moving(
        box(0.055, 0.055, 0.15, 0.14, -0.4, -0.55, 0xdfb86b, weaponGroup),
        "shell",
      );
    box(
      0.14,
      0.025,
      0.06,
      0.23,
      -0.275,
      -0.43,
      local?.team === 1 ? 0xff9d59 : 0x57ded0,
      weaponGroup,
    );
    const flash = box(
      0.17,
      0.17,
      0.12,
      0.23,
      n === 6 ? -0.22 : -0.185,
      n === 3 ? -1.47 : n === 6 ? -1.1 : -1.12,
      0xffdc80,
      weaponGroup,
    );
    (flash.material as THREE.Material).dispose();
    (flash as THREE.Mesh).material = new THREE.MeshBasicMaterial({
      color: 0xffde88,
      transparent: true,
      opacity: 0.85,
    });
    flash.visible = false;
    weaponGroup.userData.flash = flash;
  }
  // Batch all solid weapon/hand pieces; preserve the separately animated flash.
  const parts = weaponGroup.children.filter(
    (child) =>
      child !== weaponGroup.userData.flash &&
      (!child.userData.kind || child.userData.kind === "fixed"),
  ) as THREE.Mesh[];
  const geometries = parts.map((mesh) => {
    mesh.updateMatrix();
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    const color = (mesh.material as THREE.MeshLambertMaterial).color;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3)
      colors.set([color.r, color.g, color.b], i);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  const geometry = mergeGeometries(geometries)!;
  geometries.forEach((g) => g.dispose());
  parts.forEach((mesh) => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    weaponGroup.remove(mesh);
  });
  weaponGroup.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.75,
        metalness: 0.18,
      }),
    ),
  );
}
setWeaponModel(0);
let modelWeapon = 0;
let modelClass = -1;
let weaponSwitchedAt = 0;
let presentedPose: ReturnType<typeof weaponPose> | null = null;
let jumpFeedback = false;
const remote = new Map<
  string,
  { group: THREE.Group; samples: any[]; target: any; label: HTMLElement }
>();
function makePlayer(p: any) {
  const g = createCharacter(p);
  scene.add(g);
  const label = document.createElement("div");
  label.style.cssText =
    "position:absolute;pointer-events:none;color:#fff;background:#102a3380;padding:2px 5px;border-radius:3px;font-size:11px;white-space:nowrap;z-index:2";
  label.textContent = p.name + (p.bot ? " [NPC]" : "");
  document.body.append(label);
  return { group: g, samples: [] as any[], target: p, label };
}
function disposePlayer(r: { group: THREE.Group; label: HTMLElement }) {
  scene.remove(r.group);
  r.group.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      if (c instanceof THREE.SkinnedMesh) c.skeleton.dispose();
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
  });
  r.label.remove();
}
let eliminated: ReturnType<typeof makePlayer> | null = null;
let eliminatedAt = 0;
function clearElimination() {
  if (eliminated) disposePlayer(eliminated);
  eliminated = null;
  show("crosshair", true);
}
const flagMeshes = [0, 1].map((t) => {
  const g = new THREE.Group();
  box(0.09, 2.0, 0.09, 0, 1, 0, 0xece6ca, g);
  box(0.68, 0.55, 0.17, 0.25, 1.65, 0, t === 0 ? 0x57ded0 : 0xff9d59, g);
  scene.add(g);
  return g;
});
const beacon = new THREE.Group();
box(0.7, 0.5, 0.7, 0, 0, 0, 0x324c54, beacon);
box(0.35, 0.7, 0.35, 0, 0.6, 0, 0xffd671, beacon);
beacon.position.set(W / 2 + 0.5, 13.5, D / 2 + 0.5);
scene.add(beacon);
const outline = new THREE.Mesh(
  new THREE.BoxGeometry(1.015, 1.015, 1.015),
  new THREE.MeshBasicMaterial({
    color: 0xf9eabb,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
  }),
);
scene.add(outline);
outline.visible = false;
function applySettings() {
  localStorage.setItem("br-settings", JSON.stringify(settings));
  sound.master = settings.master;
  sound.effects = settings.volume;
  renderer.setPixelRatio(
    Math.min(
      devicePixelRatio,
      settings.preset === "mobile"
        ? 1
        : settings.preset === "balanced"
          ? 1.5
          : 2,
    ),
  );
  renderer.setSize(innerWidth, innerHeight);
  camera.fov = settings.fov;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.shadowMap.enabled = shadowQuality(
    settings.preset,
    touch,
    settings.shadows,
  ).enabled;
  const shadow = shadowQuality(settings.preset, touch, settings.shadows);
  if (sun.shadow.mapSize.x !== shadow.size) {
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(shadow.size, shadow.size);
  }
  sun.shadow.camera.left = sun.shadow.camera.bottom = -shadow.radius;
  sun.shadow.camera.right = sun.shadow.camera.top = shadow.radius;
  sun.shadow.camera.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;
  (scene.fog as THREE.Fog).near = settings.distance * 0.45;
  (scene.fog as THREE.Fog).far = settings.distance + 12;
  document.documentElement.style.setProperty(
    "--touch-scale",
    String(
      innerWidth < 650 && innerHeight > innerWidth
        ? Math.min(settings.scale, 1.1)
        : settings.scale,
    ),
  );
  $("crosshair").textContent = settings.crosshair;
}
function settingsUi() {
  const container = $("settings-fields");
  container.replaceChildren();
  const fields: [keyof Settings, string, number?, number?, number?][] = [
    ["preset", "Quality preset"],
    ["distance", "Render distance", 32, 192, 4],
    ["effects", "Effects quality"],
    ["shadows", "Shadows (mobile: contact only)"],
    ["fov", "Field of view", 60, 105, 1],
    ["master", "Master volume", 0, 1, 0.05],
    ["volume", "Effects volume", 0, 1, 0.05],
    ["mouse", "Mouse sensitivity", 0.2, 3, 0.1],
    ["mobile", "Touch sensitivity", 0.2, 3, 0.1],
    ["scale", "Touch control scale", 0.8, 1.3, 0.05],
    ["invert", "Invert look"],
    ["crosshair", "Crosshair"],
  ];
  for (const [key, labelText, min, max, step] of fields) {
    const label = document.createElement("label");
    label.textContent = labelText;
    let field: HTMLInputElement | HTMLSelectElement;
    if (min !== undefined) {
      field = document.createElement("input");
      field.type = "range";
      field.min = String(min);
      field.max = String(max);
      field.step = String(step);
      field.value = String(settings[key]);
    } else if (key === "invert" || key === "shadows") {
      field = document.createElement("input");
      field.type = "checkbox";
      field.checked = settings[key];
    } else {
      field = document.createElement("select");
      for (const value of key === "preset"
        ? ["mobile", "balanced", "high"]
        : key === "effects"
          ? ["low", "high"]
          : ["+", "·", "⊙"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        field.append(option);
      }
      field.value = String(settings[key]);
    }
    const val = document.createElement("span");
    val.className = "setting-value";
    val.textContent = String(settings[key]);
    field.oninput = () => {
      (settings as any)[key] =
        key === "invert" || key === "shadows"
          ? (field as HTMLInputElement).checked
          : min !== undefined
            ? Number(field.value)
            : field.value;
      if (key === "preset") {
        settings.distance =
          field.value === "mobile"
            ? 80
            : field.value === "balanced"
              ? 112
              : 176;
        settings.effects = field.value === "mobile" ? "low" : "high";
        settings.shadows = true;
      }
      val.textContent = String(settings[key]);
      applySettings();
    };
    label.append(field, val);
    container.append(label);
  }
}
applySettings();
settingsUi();
window.addEventListener("resize", applySettings);
let ws: WebSocket | null = null,
  rooms: any[] = [];
const nameInput = $<HTMLInputElement>("name");
nameInput.value =
  localStorage.getItem("br-name") ??
  `Builder${Math.floor(Math.random() * 1000)}`;
let serverCapabilities: any = {};
async function refreshRooms() {
  try {
    const start = performance.now();
    rooms = await api("/api/rooms");
    ping = Math.round(performance.now() - start);
    $("status").textContent =
      `${rooms.length} rooms available · ${rooms.reduce((n, r) => n + r.players, 0)} players online`;
    $("rooms").replaceChildren();
    for (const r of rooms) {
      const row = document.createElement("div");
      row.className = "room";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = r.name;
      const meta = document.createElement("small");
      meta.textContent = `${r.bots ? `${r.bots} NPCs · ` : ""}${r.mode === "ctf" ? "Capture the flag" : r.mode === "demolition" ? "Stronghold Demolition" : r.mode === "frontline" ? "Frontline Control" : r.mode === "tdm" ? "Team deathmatch" : r.mode === "relay" ? "Capture the relay" : "Humans vs Zombies"} · ${r.players}/${r.max} players\n${r.map} · ${r.arsenal === "specialists" ? "Specialists" : "Sandbox"} · Jetpacks ${r.jet}`;
      meta.style.whiteSpace = "pre-line";
      info.append(title, meta);
      const joinButton = document.createElement("button");
      joinButton.textContent = "Join";
      joinButton.disabled = r.players >= r.max && !r.bots;
      joinButton.onclick = () => join(r.id);
      row.append(info, joinButton);
      $("rooms").append(row);
    }
    try {
      serverCapabilities = await api("/api/health");
    } catch {}
    networkMode = serverCapabilities.transport === "http" ? "http" : "ws";
    $("transport-note").textContent =
      networkMode === "http"
        ? "Hosted rooms use the authoritative HTTP transport. A dedicated WebSocket server offers smoother matches."
        : "Dedicated authoritative WebSocket multiplayer.";
  } catch (e) {
    $("status").textContent =
      `Server unavailable: ${(e as Error).message}. Set a running server URL under About & connection.`;
    $("rooms").textContent =
      "Cannot reach server. Check the connection in the main menu.";
  }
}
function message(msg: any) {
  if (msg.type === "welcome") {
    snapshotClock.reset();
    connectionStats.reset();
    predictionBlocked = false;
    lastStateAt = performance.now();
    combatFX.clear();
    id = msg.id;
    roomId = msg.room.id;
    world.seed = msg.seed ?? msg.room?.seed ?? world.seed;
    applyTheme(msg.state?.mode ?? msg.room?.mode);
    world.decode(msg.map);
    terrain.rebuild();
    minimap.reset();
    firstState = true;
    connected = true;
    joining = false;
    show("menu", false);
    show("browser", false);
    show("solo-setup", false);
    show("hud");
    show("touch", touch);
    if (touch && !localStorage.getItem("br-touch-tip")) {
      show("touch-tip");
      localStorage.setItem("br-touch-tip", "1");
      setTimeout(() => show("touch-tip", false), 10000);
    }
    $("vignette").style.background = "none";
    handleState(msg.state);
    sound.play("ui");
  } else if (msg.type === "state") {
    handleState(msg.state);
    for (const e of msg.events ?? []) handleEvent(e);
  } else if (msg.type === "events") {
    for (const e of msg.events ?? []) handleEvent(e);
  } else if (msg.type === "edit") {
    terrain.edit(msg.x, msg.y, msg.z, msg.value);
    minimap.edit(msg.x, msg.z);
  } else if (msg.type === "edits") {
    for (const [x, y, z, value] of msg.edits) {
      terrain.edit(x, y, z, value, false);
      minimap.edit(x, z);
    }
    terrain.prioritize(local?.x ?? W / 2, local?.z ?? D / 2);
  } else if (msg.type === "map") {
    combatFX.clear();
    world.seed = msg.seed ?? msg.room?.seed ?? world.seed;
    applyTheme(msg.state?.mode ?? msg.room?.mode);
    world.decode(msg.map);
    terrain.rebuild();
    minimap.reset();
    if (local) terrain.prioritize(local.x, local.z);
  } else if (msg.type === "pong") {
    ping = Math.round(performance.now() - msg.at);
  } else if (msg.type === "error") disconnect(msg.message ?? "Server error");
}
function disconnect(reason = "Disconnected. Join a room to reconnect.") {
  battlefield.group.visible = false;
  sound.stopJets();
  combatFX.clear();
  clearElimination();
  connected = false;
  joining = false;
  local = null;
  state = null;
  ws?.close();
  ws = null;
  httpToken = "";
  retryAt = 0;
  networkFailures = 0;
  for (const r of remote.values()) disposePlayer(r);
  remote.clear();
  show("hud", false);
  show("touch", false);
  show("pause", false);
  show("scoreboard", false);
  show("menu");
  $("vignette").style.background = "";
  $("status").textContent = reason;
  document.exitPointerLock?.();
  paused = false;
  resetInput();
}
async function join(room: string) {
  if (joining) return;
  joining = true;
  sound.unlock();
  localStorage.setItem("br-name", nameInput.value);
  $("status").textContent = "Joining…";
  seq = 0;
  input.seq = 0;
  roomId = room;
  firstState = true;
  resetInput();
  if (networkMode === "http") {
    try {
      const data = await api("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room,
          name: nameInput.value,
          classId: selectedClass,
        }),
      });
      httpToken = data.token;
      httpCursor = data.cursor ?? 0;
      (world as any).revision = data.welcome.revision;
      message(data.welcome);
    } catch (e) {
      joining = false;
      $("status").textContent = (e as Error).message;
    }
    return;
  }
  const url = new URL(base() || location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = new URLSearchParams({
    room,
    name: nameInput.value,
    class: String(selectedClass),
  }).toString();
  ws = new WebSocket(url);
  const socket = ws;
  socket.onmessage = (e) => {
    if (ws !== socket) return;
    try {
      message(JSON.parse(e.data));
    } catch (err) {
      console.error(err);
      disconnect("Received invalid game data.");
    }
  };
  socket.onopen = () => {
    if (!touch) canvas.requestPointerLock?.();
  };
  socket.onerror = () => {
    if (!connected) {
      joining = false;
      $("status").textContent =
        "Could not connect to multiplayer. Check the server address.";
    }
  };
  socket.onclose = () => {
    if (ws === socket)
      disconnect("Connection closed. Join a room to reconnect.");
  };
  setTimeout(() => {
    if (joining && ws === socket) {
      socket.close();
      joining = false;
      $("status").textContent = "Connection timed out.";
    }
  }, 10000);
}
function handleState(next: any) {
  if (!snapshotClock.observe(next.time * 1000, performance.now())) return;
  lastStateAt = performance.now();
  state = next;
  combatFX.sync(next.projectiles ?? [], performance.now());
  const p = next.players.find((p: any) => p.id === id);
  if (!p) return;
  if (p.dead > 0 && !eliminated) {
    eliminated = makePlayer({ ...(local ?? p), x: p.x, y: p.y, z: p.z });
    eliminated.group.position.set(p.x, p.y + 0.28, p.z);
    eliminated.group.rotation.set(0, local?.yaw ?? p.yaw, -1.25);
    eliminated.label.style.display = "none";
    eliminatedAt = performance.now();
    resetInput();
  } else if (p.dead <= 0 && eliminated) clearElimination();
  const reset = !local || firstState || predictionEpoch !== p.epoch;
  if (reset) {
    local = { ...p };
    pendingInputs = [];
    seq = 0;
    sentCommand = 0;
    predictedShotTimes = [];
    nextShotFeedback = 0;
    predictionEpoch = p.epoch;
    renderCorrection.set(0, 0, 0);
    yaw = p.yaw;
    pitch = p.pitch;
    firstState = false;
    chooseWeapon(p.weapon);
    terrain.prioritize(p.x, p.z);
    terrain.update(9);
  } else {
    pendingInputs = pendingInputs.filter((command) => command.seq > p.lastSeq);
    const predicted =
      p.dead > 0
        ? { ...p }
        : replay(p, pendingInputs, world, p.zombie, p.jetpack);
    const correction = new THREE.Vector3(
      local!.x - predicted.x,
      local!.y - predicted.y,
      local!.z - predicted.z,
    );
    connectionStats.observeCorrection(
      correction.length(),
      correction.length() >= 2,
    );
    if (correction.length() < 2 && local!.dead === p.dead)
      renderCorrection.add(correction).clampLength(0, 1.5);
    else renderCorrection.set(0, 0, 0);
    Object.assign(local!, predicted);
    if (touch) local!.weapon = p.zombie ? 4 : input.weapon;
  }
  const alive = new Set<string>();
  for (const rp of next.players) {
    if (rp.id === id) continue;
    alive.add(rp.id);
    let r = remote.get(rp.id);
    if (
      r &&
      (r.target.zombie !== rp.zombie || r.target.classId !== rp.classId)
    ) {
      disposePlayer(r);
      remote.delete(rp.id);
      r = undefined;
    }
    if (!r) {
      r = makePlayer(rp);
      remote.set(rp.id, r);
    }
    // Never interpolate through a respawn or a round's spawn relocation.
    if (r.target.epoch !== rp.epoch) {
      r.samples.length = 0;
      r.group.userData.rig.phase = 0;
      r.group.userData.rig.leftLeg.rotation.x = 0;
      r.group.userData.rig.rightLeg.rotation.x = 0;
    }
    r.target = rp;
    r.samples.push({ ...rp, at: next.time * 1000 });
    if (r.samples.length > 16) r.samples.shift();
  }
  for (const [key, r] of remote)
    if (!alive.has(key)) {
      disposePlayer(r);
      remote.delete(key);
    }
  updateHud();
}
function handleEvent(e: any) {
  if (e.kind === "shot") {
    const shooter = remote.get(e.id);
    if (shooter) shooter.group.userData.shotAt = performance.now();
    if (e.id === id) {
      predictedShotTimes = predictedShotTimes.filter(
        (at) => performance.now() - at < 1500,
      );
      if (predictedShotTimes.length) predictedShotTimes.shift();
      else {
        sound.play("shot", 1, e.weapon);
        lastShot = performance.now();
      }
    } else if (
      local &&
      e.origin &&
      Math.hypot(local.x - e.origin.x, local.z - e.origin.z) < 40
    )
      sound.play("shot", 0.25, e.weapon);
    if (isFirearm(e.weapon) && e.origin)
      combatFX.shot(e.origin, e.traces ?? []);
    if (local && e.traces?.length) {
      const distance = Math.min(
        ...e.traces.map((p: any) =>
          Math.hypot(p.x - local!.x, p.y - local!.y - 1.5, p.z - local!.z),
        ),
      );
      if (distance < 10) sound.play("impact", 0.3 * (1 - distance / 10));
    }
  }
  if (e.kind === "launch" && local) {
    predictedShotTimes = predictedShotTimes.filter(
      (at) => performance.now() - at < 1500,
    );
    const distance = e.projectile
      ? Math.hypot(
          local.x - e.projectile.x,
          local.y - e.projectile.y,
          local.z - e.projectile.z,
        )
      : 0;
    if (e.projectile?.kind === "grenade") {
      if (distance < 25)
        sound.play("throw", e.id === id ? 0.7 : 0.25 * (1 - distance / 25));
    } else {
      if (e.id !== id && distance < 60)
        sound.play("shot", 0.45 * (1 - distance / 60), 6);
      if (e.id === id && !predictedShotTimes.length) {
        sound.play("shot", 0.8, 6);
        lastShot = performance.now();
      } else if (e.id === id) predictedShotTimes.shift();
    }
  }
  if (e.kind === "explosion") {
    combatFX.explosion(e.pos, camera.position);
    const distance = camera.position.distanceTo(
      new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z),
    );
    if (distance < 100)
      sound.play("explosion", Math.max(0.1, 1 - distance / 100));
  }
  if (e.kind === "gear" && e.id === id) sound.play("place", 0.7);
  if (e.kind === "collapse")
    for (const b of e.debris ?? []) {
      combatFX.particle(
        { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 },
        { x: (Math.random() - 0.5) * 2, y: -2, z: (Math.random() - 0.5) * 2 },
        0.4,
        1,
        palette[b.color] ?? 0x78828a,
      );
    }
  if (e.kind === "breach" && e.pos) {
    if (e.tool === "bore") {
      for (let i = 0; i < 12; i++)
        combatFX.particle(
          { x: e.pos.x + 0.5, y: e.pos.y + 0.3, z: e.pos.z + 0.5 },
          {
            x: (Math.random() - 0.5) * 3,
            y: Math.random() * 2,
            z: (Math.random() - 0.5) * 3,
          },
          0.12,
          0.6,
          0xafb6a4,
        );
    } else combatFX.explosion(e.pos, camera.position);
    sound.play("dig", 0.6);
  }
  if (e.kind === "ability" && e.pos)
    combatFX.particle(e.pos, { x: 0, y: 0.7, z: 0 }, 0.35, 0.4, 0x68d3c7);
  if (e.kind === "hit") {
    if (e.id === id) {
      sound.play("hit");
      hitUntil = performance.now() + 150;
    }
    if (e.target === id) {
      sound.play("damage");
      damageUntil = performance.now() + 220;
    }
  }
  if (e.kind === "headshot" && e.id === id) {
    hitUntil = performance.now() + 220;
    sound.play("hit", 0.6);
  }
  if (e.id === id && ["dig", "place", "reload", "pickup"].includes(e.kind))
    sound.play(e.kind);
  if (e.kind === "kill" && e.id === id) sound.play("kill");
  if (
    ["join", "kill", "objective", "infection", "victory", "pickup"].includes(
      e.kind,
    ) &&
    e.text
  ) {
    const p = document.createElement("p");
    p.textContent = e.text;
    $("feed").prepend(p);
    while ($("feed").children.length > 5) $("feed").lastChild?.remove();
    setTimeout(() => p.remove(), 6500);
    if (["objective", "infection"].includes(e.kind)) sound.play(e.kind);
  }
}
function updateHud() {
  if (!local || !state) return;
  const p = local;
  const mode = state.mode;
  $("mode-label").textContent =
    mode === "tdm"
      ? "Team deathmatch"
      : mode === "relay"
        ? "Capture the relay"
        : mode === "ctf"
          ? "Capture the flag"
          : mode === "demolition"
            ? "Stronghold Demolition"
            : mode === "frontline"
              ? "Frontline Control"
              : "Humans vs Zombies";
  $("scores").textContent =
    mode === "infection"
      ? `${state.humans} HUMANS`
      : `${state.scores[0]} : ${state.scores[1]}`;
  const t = Math.max(0, Math.ceil(state.remaining));
  $("timer").textContent = `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`;
  $("match-note").textContent =
    state.phase === "waiting"
      ? state.players.length < 2
        ? "Waiting for a second player"
        : `Round starts in ${Math.ceil(state.warmup)}`
      : mode === "infection"
        ? `${state.players.length - state.humans} infected · Round ${state.round}`
        : mode === "relay"
          ? "First to 3 relays"
          : mode === "ctf"
            ? "First to 3 flags · Your flag must be home to score"
            : mode === "demolition"
              ? `Round ${state.round} · Destroy 85% of the enemy stronghold`
              : `Round ${state.round} · ${state.map} · First to ${state.target ?? 40}`;
  $("team-label").textContent = p.zombie
    ? "ZOMBIE"
    : mode === "infection"
      ? "HUMAN"
      : p.team === 0
        ? "AZURE"
        : "EMBER";
  $("team-label").style.color = p.zombie
    ? "#b6e475"
    : p.team === 0
      ? "#57ded0"
      : "#ff9d59";
  $("health").textContent = String(Math.ceil(p.health));
  $("health-bar").style.width =
    `${(p.health / (p.zombie ? 150 : classInfo(p.classId).health)) * 100}%`;
  $("class-hud").textContent = p.zombie
    ? "INFECTED"
    : `${classInfo(p.classId).name.toUpperCase()} ▾`;
  $("grenade-button").textContent = `FRAG ${p.grenades ?? 0}`;
  $("ability-button").textContent =
    (p.abilityCooldown ?? 0) > 0
      ? `${Math.ceil(p.abilityCooldown ?? 0)}s`
      : classInfo(p.classId).ability.toUpperCase();
  $<HTMLButtonElement>("grenade-button").disabled =
    p.zombie || p.dead > 0 || !(p.grenades ?? 0);
  $<HTMLButtonElement>("ability-button").disabled =
    p.zombie || p.dead > 0 || (p.abilityCooldown ?? 0) > 0;
  $("gear-button").textContent =
    `${gearInfo(p.classId).name.toUpperCase()} ${p.gearCharges ?? 0}`;
  $<HTMLButtonElement>("gear-button").disabled =
    p.zombie || p.dead > 0 || !p.gearCharges || (p.gearCooldown ?? 0) > 0;
  $("blocks").textContent = `${p.blocks} blocks`;
  $("fuel-label").style.opacity = p.jetpack ? "1" : ".45";
  $("fuel").textContent = p.jetpack ? `${Math.round(p.fuel)}%` : "NO PACK";
  $("fuel-bar").style.width = p.jetpack ? `${p.fuel}%` : "0%";
  $("weapon-name").textContent =
    p.weapon === 4 && p.classId === 4 && !p.zombie
      ? "BORE DRILL"
      : WEAPONS[p.weapon].name.toUpperCase();
  $("ammo").textContent = isFirearm(p.weapon)
    ? String(p.ammo[p.weapon])
    : p.weapon === 5
      ? String(p.blocks)
      : "∞";
  $("reserve").textContent = isFirearm(p.weapon)
    ? `/ ${p.reserve[p.weapon]}`
    : p.weapon === 5
      ? "BLOCKS"
      : "TOOL";
  $("reload-note").textContent =
    p.reload > 0
      ? `RELOADING ${p.reload.toFixed(1)}s`
      : p.protected > 0
        ? "SPAWN SHIELD"
        : "";
  updateNetwork();
  let banner = "";
  if (state.phase === "finished")
    banner = `${state.winner} · Next round in ${Math.ceil(state.remaining)}s`;
  else if (p.dead > 0)
    banner = `${p.zombie ? "Infected · " : ""}Respawn in ${Math.ceil(p.dead)}s`;
  show("banner", !!banner);
  $("banner").textContent = banner;
  $("objective-hud").textContent =
    mode === "demolition"
      ? (state.demolition ?? [])
          .map(
            (s: any) =>
              `${s.team === p.team ? "DEFEND" : "BREACH"}: ${Math.round((s.remaining / s.total) * 100)}% intact`,
          )
          .join(" · ")
      : mode === "frontline"
        ? (state.controlPoints ?? [])
            .map(
              (point: any) =>
                `${point.name}: ${point.contested ? "CONTESTED" : point.progress > 0 ? `${Math.round(point.progress * 100)}%` : point.owner < 0 ? "neutral" : point.owner === 0 ? "Azure" : "Ember"}`,
            )
            .join(" · ")
        : mode === "relay" || mode === "ctf"
          ? state.flags
              .map(
                (f: any) =>
                  `${f.team === 0 ? "Azure" : "Ember"} ${mode === "ctf" ? "flag" : "relay"}: ${f.carrier ? (f.carrier === id ? "YOU HAVE IT" : "carried") : f.dropped ? "dropped" : "home"}`,
              )
              .join(" · ")
          : mode === "infection"
            ? p.zombie
              ? "Infect humans · Hold jump to climb"
              : "Survive · Build defenses"
            : state.jet === "pickup"
              ? "Jetpack beacon at the central bridge"
              : "";
  if ((p.supplyProgress ?? 0) > 0)
    $("objective-hud").textContent +=
      ` · Resupplying ${Math.round(((p.supplyProgress ?? 0) / 3) * 100)}%`;
  if (touch) {
    $<HTMLButtonElement>("build-mode").disabled = p.zombie;
    const aimButton = document.querySelector<HTMLButtonElement>(
      '[data-action="aim"]',
    )!;
    aimButton.disabled = p.zombie;
    const jetButton = document.querySelector<HTMLButtonElement>(
      '[data-action="jet"]',
    )!;
    jetButton.disabled = !p.jetpack;
    jetButton.style.opacity = p.jetpack ? "1" : ".35";
    for (const b of document.querySelectorAll<HTMLButtonElement>(
      "[data-weapon]",
    ))
      b.disabled = p.zombie
        ? Number(b.dataset.weapon) !== 4
        : !allowedWeapon(
            p.classId,
            Number(b.dataset.weapon),
            state.arsenal === "specialists",
          );
  }
  $("score-rows").replaceChildren();
  const header = document.createElement("div");
  header.className = "score-row";
  for (const text of ["PLAYER", "KILLS", "DEATHS"]) {
    const s = document.createElement("span");
    s.textContent = text;
    header.append(s);
  }
  $("score-rows").append(header);
  for (const rp of [...state.players].sort(
    (a: any, b: any) => b.kills - a.kills,
  )) {
    const row = document.createElement("div");
    row.className = `score-row ${rp.team === 0 ? "azure" : "ember"}`;
    for (const text of [
      `${rp.name}${rp.id === id ? " (you)" : ""}${rp.zombie ? " [Z]" : ""}${rp.bot ? " [NPC]" : ""}`,
      rp.kills,
      rp.deaths,
    ]) {
      const s = document.createElement("span");
      s.textContent = String(text);
      row.append(s);
    }
    $("score-rows").append(row);
  }
}
const held = new Set<string>();
function resetInput() {
  held.clear();
  for (const key of Object.keys(pulses)) delete pulses[key as keyof Input];
  for (const key of [
    "fire",
    "aim",
    "jump",
    "sprint",
    "crouch",
    "jet",
    "reload",
    "place",
    "dig",
    "grenade",
    "ability",
    "gear",
  ])
    (input as any)[key] = false;
  input.forward = 0;
  input.strafe = 0;
  joyF = 0;
  joyS = 0;
  joystick.classList.remove("sprinting");
  joystick.querySelector("small")!.textContent = "MOVE";
  show("weapon-picker", false);
  for (const b of document.querySelectorAll("[aria-pressed]"))
    b.setAttribute("aria-pressed", "false");
  $("stick").style.transform = "translate(-50%,-50%)";
  for (const b of document.querySelectorAll(".held"))
    b.classList.remove("held");
}
function setPause(on: boolean) {
  paused = on;
  show("pause", on);
  if (on) {
    sound.stopJets();
    resetInput();
    document.exitPointerLock?.();
  } else if (!touch) canvas.requestPointerLock?.();
  show("touch", touch && connected && !on);
}
document.addEventListener("pointerlockchange", () => {
  mouseLocked = document.pointerLockElement === canvas;
  if (!mouseLocked && connected && !touch && !paused) setPause(true);
});
canvas.addEventListener("click", () => {
  if (connected && !paused && !touch) canvas.requestPointerLock?.();
});
document.addEventListener("mousemove", (e) => {
  if (mouseLocked && !paused) {
    yaw -= e.movementX * 0.002 * settings.mouse;
    pitch = Math.max(
      -1.5,
      Math.min(
        1.5,
        pitch -
          e.movementY * 0.002 * settings.mouse * (settings.invert ? -1 : 1),
      ),
    );
  }
});
const binding: Record<string, keyof Input> = {
  Space: "jump",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  KeyC: "crouch",
  KeyF: "jet",
  KeyR: "reload",
  KeyG: "grenade",
  KeyV: "ability",
  KeyK: "gear",
  KeyE: "place",
  KeyQ: "dig",
};
window.addEventListener("keydown", (e) => {
  if (
    !connected ||
    ["INPUT", "SELECT"].includes((e.target as HTMLElement).tagName)
  )
    return;
  if (e.code === "KeyM") {
    e.preventDefault();
    minimap.toggle();
    return;
  }
  if (e.code === "Escape") {
    setPause(!paused);
    return;
  }
  if (e.code === "Tab") {
    e.preventDefault();
    show("scoreboard");
    return;
  }
  if (paused) return;
  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
  held.add(e.code);
  if (binding[e.code]) {
    (input as any)[binding[e.code]] = true;
    pulses[binding[e.code]] = true;
  }
  if (e.code === "KeyB" && !e.repeat) cycleKit();
  if (/^Digit[1-7]$/.test(e.code)) chooseWeapon(Number(e.code.slice(-1)) - 1);
});
window.addEventListener("keyup", (e) => {
  held.delete(e.code);
  if (binding[e.code]) (input as any)[binding[e.code]] = false;
  if (e.code === "Tab") show("scoreboard", false);
});
window.addEventListener("mousedown", (e) => {
  if (connected && mouseLocked && !paused) {
    if (e.button === 0) {
      input.fire = true;
      pulses.fire = true;
    }
    if (e.button === 2) input.aim = true;
  }
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0) input.fire = false;
  if (e.button === 2) input.aim = false;
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener(
  "wheel",
  (e) => {
    if (connected && !paused && mouseLocked) {
      e.preventDefault();
      for (let n = 1; n <= 7; n++) {
        const candidate = (input.weapon + n * (e.deltaY > 0 ? 1 : 6)) % 7;
        if (
          local?.zombie
            ? candidate === 4
            : allowedWeapon(
                local?.classId,
                candidate,
                state?.arsenal === "specialists",
              )
        ) {
          chooseWeapon(candidate);
          break;
        }
      }
    }
  },
  { passive: false },
);
window.addEventListener("blur", resetInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    resetInput();
    if (connected) setPause(true);
  }
});
let joyF = 0,
  joyS = 0,
  joyPointer = -1,
  lookPointer = -1,
  lastLook = { x: 0, y: 0 };
const joystick = $("joystick");
const moveZone = $("move-zone");
moveZone.addEventListener("pointerdown", (e) => {
  if (joyPointer !== -1) return;
  e.preventDefault();
  joyPointer = e.pointerId;
  moveZone.setPointerCapture(e.pointerId);
  const bounds = moveZone.getBoundingClientRect();
  const size = joystick.getBoundingClientRect().width;
  joystick.style.left = `${Math.max(size / 2, Math.min(bounds.width - size / 2, e.clientX - bounds.left)) - size / 2}px`;
  joystick.style.top = `${Math.max(size / 2, Math.min(bounds.height - size / 2, e.clientY - bounds.top)) - size / 2}px`;
  joystick.style.bottom = "auto";
  joyUpdate(e);
});
function joyUpdate(e: PointerEvent) {
  const r = joystick.getBoundingClientRect(),
    radius = r.width * 0.38;
  let x = (e.clientX - r.left - r.width / 2) / radius,
    y = (e.clientY - r.top - r.height / 2) / radius;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  const movement = stickInput(x, y, input.aim, input.crouch);
  joyS = movement.strafe;
  joyF = movement.forward;
  input.sprint = movement.sprint;
  joystick.classList.toggle("sprinting", movement.sprint);
  joystick.querySelector("small")!.textContent = movement.sprint
    ? "SPRINT"
    : "MOVE";
  $("stick").style.transform =
    `translate(calc(-50% + ${x * radius}px),calc(-50% + ${y * radius}px))`;
}
moveZone.addEventListener("pointermove", (e) => {
  if (e.pointerId === joyPointer) joyUpdate(e);
});
for (const kind of ["pointerup", "pointercancel", "lostpointercapture"])
  moveZone.addEventListener(kind, (e) => {
    if ((e as PointerEvent).pointerId === joyPointer) {
      joyPointer = -1;
      joystick.style.left = "";
      joystick.style.top = "";
      joystick.style.bottom = "";
      joyF = 0;
      joyS = 0;
      input.sprint = false;
      joystick.classList.remove("sprinting");
      joystick.querySelector("small")!.textContent = "MOVE";
      $("stick").style.transform = "translate(-50%,-50%)";
    }
  });
function touchLook(dx: number, dy: number) {
  const gain = touchLookGain(input.aim, input.weapon);
  yaw -= dx * 0.004 * settings.mobile * gain;
  pitch = Math.max(
    -1.5,
    Math.min(
      1.5,
      pitch - dy * 0.004 * settings.mobile * gain * (settings.invert ? -1 : 1),
    ),
  );
}
const lookZone = $("look-zone");
lookZone.addEventListener("pointerdown", (e) => {
  if (lookPointer !== -1) return;
  e.preventDefault();
  lookPointer = e.pointerId;
  lastLook = { x: e.clientX, y: e.clientY };
  lookZone.setPointerCapture(e.pointerId);
});
lookZone.addEventListener("pointermove", (e) => {
  if (e.pointerId !== lookPointer) return;
  touchLook(e.clientX - lastLook.x, e.clientY - lastLook.y);
  lastLook = { x: e.clientX, y: e.clientY };
});
for (const kind of ["pointerup", "pointercancel", "lostpointercapture"])
  lookZone.addEventListener(kind, (e) => {
    if ((e as PointerEvent).pointerId === lookPointer) lookPointer = -1;
  });
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-action]",
)) {
  const action = button.dataset.action as keyof Input;
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    sound.unlock();
    if (action === "crouch" || action === "aim") {
      (input as any)[action] = !(input as any)[action];
      if (input.aim || input.crouch) {
        input.sprint = false;
        joystick.classList.remove("sprinting");
        joystick.querySelector("small")!.textContent = "MOVE";
      }
      button.classList.toggle("held", (input as any)[action]);
      button.setAttribute("aria-pressed", String((input as any)[action]));
    } else {
      (input as any)[action] = true;
      pulses[action] = true;
      button.classList.add("held");
    }
  });
  for (const kind of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(kind, (e) => {
      if (action === "crouch" || action === "aim") return;
      e.preventDefault();
      (input as any)[action] = false;
      button.classList.remove("held");
    });
}
let lastGun = 0;
function chooseWeapon(weapon: number) {
  if (
    !local?.zombie &&
    !allowedWeapon(local?.classId, weapon, state?.arsenal === "specialists")
  )
    return;
  input.weapon = local?.zombie ? 4 : weapon;
  if (isFirearm(input.weapon)) lastGun = input.weapon;
  if (local) {
    local.weapon = input.weapon;
    updateHud();
  }
  if (!isFirearm(input.weapon)) {
    input.aim = false;
    const button = document.querySelector<HTMLButtonElement>(
      '[data-action="aim"]',
    )!;
    button.classList.remove("held");
    button.setAttribute("aria-pressed", "false");
  }
  const tools = !isFirearm(input.weapon) && !local?.zombie;
  show("touch-tools", tools);
  $("build-mode").classList.toggle("held", tools);
  $("build-mode").setAttribute("aria-pressed", String(tools));
  $("switch-weapon").textContent =
    WEAPONS[input.weapon].name.toUpperCase() + " ▾";
  const fire = $<HTMLButtonElement>(
    "touch-actions",
  ).querySelector<HTMLButtonElement>('[data-action="fire"]')!;
  fire.textContent =
    input.weapon === 5 ? "PLACE" : input.weapon === 4 ? "DIG" : "SHOOT";
  show("weapon-picker", false);
  $("switch-weapon").setAttribute("aria-expanded", "false");
  sound.play("ui");
}
function cycleKit() {
  if (!connected || paused || local?.zombie || local?.dead) return;
  input.buildKit = ((input.buildKit ?? 0) + 1) % KITS.length;
  chooseWeapon(5);
}
$("kit-button").onclick = cycleKit;
$("switch-weapon").onclick = () => {
  const open = $("weapon-picker").classList.contains("hidden");
  show("weapon-picker", open);
  $("switch-weapon").setAttribute("aria-expanded", String(open));
};
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-weapon]",
))
  button.onclick = () => chooseWeapon(Number(button.dataset.weapon));
$("build-mode").onclick = () =>
  chooseWeapon(!isFirearm(input.weapon) ? lastGun : 5);
const fireButton = document.querySelector<HTMLButtonElement>(
  '[data-action="fire"]',
)!;
let firePointer = -1,
  fireLook = { x: 0, y: 0 };
fireButton.addEventListener("pointerdown", (e) => {
  if (firePointer < 0) {
    firePointer = e.pointerId;
    fireLook = { x: e.clientX, y: e.clientY };
  }
});
fireButton.addEventListener("pointermove", (e) => {
  if (e.pointerId === firePointer) {
    touchLook(e.clientX - fireLook.x, e.clientY - fireLook.y);
    fireLook = { x: e.clientX, y: e.clientY };
  }
});
for (const kind of ["pointerup", "pointercancel", "lostpointercapture"])
  fireButton.addEventListener(kind, (e) => {
    if ((e as PointerEvent).pointerId === firePointer) firePointer = -1;
  });
for (const preset of MAP_PRESETS) {
  for (const selectId of ["solo-map", "map-preset"]) {
    const option = document.createElement("option");
    option.value = String(preset.seed);
    option.textContent = preset.name;
    $(selectId).append(option);
  }
}
$("map-preset").onchange = () => {
  $<HTMLInputElement>("seed").value = $<HTMLSelectElement>("map-preset").value;
};
$("practice").onclick = () => show("solo-setup");
$("solo-start").onclick = async () => {
  const button = $<HTMLButtonElement>("solo-start");
  button.disabled = true;
  try {
    const mode = $<HTMLSelectElement>("solo-mode").value;
    const bots = Number($<HTMLSelectElement>("solo-bots").value);
    const map = $<HTMLSelectElement>("solo-map").value;
    const seed = map ? Number(map) : Date.now() >>> 0;
    const duration = Number($<HTMLSelectElement>("solo-duration").value);
    const name = `Solo ${mode.toUpperCase()} ${seed}`.slice(0, 30);
    await refreshRooms();
    const existing = rooms.find(
      (r) =>
        r.name === name &&
        r.mode === mode &&
        r.npcSlots === bots &&
        r.humans === 0 &&
        r.seed === seed &&
        r.duration === duration,
    );
    const room =
      existing ??
      (await api("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mode,
          jet: "all",
          bots,
          seed,
          limit: 16,
          duration,
          arsenal: "sandbox",
          practice: true,
        }),
      }));
    await refreshRooms();
    await join(room.id);
    if (connected) show("solo-setup", false);
  } catch (e) {
    $("solo-status").textContent = (e as Error).message;
  } finally {
    button.disabled = false;
  }
};
$("play").onclick = () => join(rooms[0]?.id ?? "valley");
$("browse").onclick = () => {
  show("browser");
  void refreshRooms();
};
$("settings-open").onclick = () => show("settings");
$("controls-open").onclick = () => show("controls");
$("pause-settings").onclick = () => show("settings");
function openClasses() {
  if (connected) setPause(true);
  show("class-menu");
}
$("class-open").onclick = openClasses;
$("class-hud").onclick = openClasses;
$("pause-class").onclick = openClasses;
for (let i = 0; i < CLASSES.length; i++) {
  const role = CLASSES[i],
    button = document.createElement("button");
  button.dataset.classId = String(i);
  button.innerHTML = `<strong>${role.name}</strong><span>${role.description}</span><small>${role.health} HP · ${role.blocks} blocks · ${role.grenades} grenades · ${role.ability}<br>${gearInfo(i).charges} ${gearInfo(i).name} · ${gearInfo(i).description}</small>`;
  button.onclick = () => {
    selectedClass = i;
    input.classId = i;
    localStorage.setItem("br-class", String(i));
    $("class-open").textContent = `Class: ${role.name} ▾`;
    $("class-choice-note").textContent = connected
      ? `${role.name} queued for your next respawn.`
      : `${role.name} selected.`;
    for (const b of document.querySelectorAll("[data-class-id]"))
      b.classList.toggle(
        "selected",
        (b as HTMLElement).dataset.classId === String(i),
      );
  };
  $("class-cards").append(button);
}
$("class-open").textContent = `Class: ${classInfo(selectedClass).name} ▾`;
document
  .querySelector(`[data-class-id="${selectedClass}"]`)
  ?.classList.add("selected");
$("class-close").onclick = () => {
  show("class-menu", false);
  if (connected) setPause(false);
};
$("score-button").onclick = () => show("scoreboard");
$("pause-button").onclick = () => setPause(true);
$("resume").onclick = () => setPause(false);
$("leave").onclick = () => {
  if (httpToken)
    void api("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomId, token: httpToken }),
    }).catch(() => {});
  disconnect("You left the match.");
  void refreshRooms();
};
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-close]",
))
  button.onclick = () => show(button.dataset.close!, false);
$("connect-server").onclick = () => {
  const value = $<HTMLInputElement>("server-url").value.trim();
  try {
    if (value && !["http:", "https:"].includes(new URL(value).protocol))
      throw Error();
    serverUrl = value;
    localStorage.setItem("br-server", serverUrl);
    void refreshRooms();
  } catch {
    $("status").textContent = "Enter an http:// or https:// server URL.";
  }
};
$("create").onclick = async () => {
  const button = $<HTMLButtonElement>("create");
  button.disabled = true;
  try {
    const r = await api("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $<HTMLInputElement>("room-name").value,
        mode: $<HTMLSelectElement>("mode").value,
        jet: $<HTMLSelectElement>("jet-mode").value,
        arsenal: $<HTMLSelectElement>("arsenal").value,
        seed: $<HTMLInputElement>("seed").value
          ? Number($<HTMLInputElement>("seed").value)
          : undefined,
        duration: Number($<HTMLSelectElement>("round-duration").value),
        limit: Number($<HTMLSelectElement>("capacity").value),
        bots: Number($<HTMLSelectElement>("npc-count").value),
      }),
    });
    await refreshRooms();
    await join(r.id);
  } catch (e) {
    $("status").textContent = (e as Error).message;
    show("browser", false);
  } finally {
    button.disabled = false;
  }
};
function updateNetwork() {
  if (performance.now() - lastNetworkUi < 250) return;
  lastNetworkUi = performance.now();
  const age = Math.max(0, performance.now() - lastStateAt);
  $("network").textContent =
    age > 1500 || networkFailures
      ? "Recovering connection…"
      : predictionBlocked
        ? "Waiting for server…"
        : `${ping} ms · ${networkMode === "http" ? "HTTP" : "WS"}`;
  $("connection-details").textContent =
    `${networkMode.toUpperCase()} · RTT ${ping} ms · snapshot age ${Math.round(age)} ms\n` +
    `Motion buffer ${Math.round(snapshotClock.delay)} ms · jitter ${Math.round(snapshotClock.jitter)} ms · gaps ${snapshotClock.gaps}\n` +
    `Queued inputs ${pendingInputs.length}/${MAX_PENDING_INPUTS} · prediction pauses ${connectionStats.predictionStops}\n` +
    `Corrections ${connectionStats.corrections} (${connectionStats.hardCorrections} hard) · max ${connectionStats.maxCorrection.toFixed(2)} blocks\n` +
    `Request failures ${connectionStats.failures} · sent ${(connectionStats.bytesSent / 1024).toFixed(1)} KiB\n` +
    (state?.lagCompensation
      ? "Hitscan rewind: up to 200 ms"
      : "Hitscan rewind: not enabled on this host");
}
async function sendInput() {
  if (!connected || performance.now() < retryAt) return;
  const commands =
    networkMode === "ws"
      ? pendingInputs.filter((c) => c.seq > sentCommand)
      : pendingInputs;
  if (networkMode === "ws") {
    if (ws?.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 8192) return;
      const packet = inputPacket(
        { type: "input", epoch: predictionEpoch },
        commands,
      );
      ws.send(packet.body);
      connectionStats.bytesSent += new TextEncoder().encode(
        packet.body,
      ).byteLength;
      if (packet.lastSeq !== undefined) sentCommand = packet.lastSeq;
      if (performance.now() - lastPing > 2000) {
        lastPing = performance.now();
        ws.send(JSON.stringify({ type: "ping", at: lastPing }));
      }
    }
  } else if (!httpBusy) {
    httpBusy = true;
    const activeToken = httpToken;
    const start = performance.now();
    try {
      const packet = inputPacket(
        {
          room: roomId,
          token: httpToken,
          epoch: predictionEpoch,
          revision: (world as any).revision ?? 0,
          cursor: httpCursor,
          round: state?.round,
        },
        commands,
      );
      connectionStats.bytesSent += new TextEncoder().encode(
        packet.body,
      ).byteLength;
      const result = await api("/api/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: packet.body,
      });
      if (httpToken !== activeToken || !connected) return;
      ping = Math.round(performance.now() - start);
      networkFailures = 0;
      retryAt = 0;
      if (result.map) {
        world.seed = result.seed ?? world.seed;
        applyTheme();
        world.decode(result.map);
        terrain.rebuild();
        minimap.reset();
      }
      for (const msg of result.messages) message(msg);
      (world as any).revision = result.revision;
      httpCursor = result.cursor;
    } catch (e) {
      if (httpToken !== activeToken || !connected) return;
      if (e instanceof ApiError && e.status === 401) {
        const previousRoom = roomId;
        disconnect("Session expired. Reconnecting…");
        void join(previousRoom);
      } else {
        networkFailures++;
        connectionStats.failures++;
        retryAt =
          performance.now() +
          Math.min(2000, 150 * 2 ** Math.min(networkFailures, 4));
        $("network").textContent = "Recovering connection…";
      }
    } finally {
      httpBusy = false;
    }
  }
}
let lastFrame = performance.now(),
  simulationFrame = lastFrame,
  accumulator = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!connected || !local) simulationFrame = now;
  terrain.update(2);
  if (connected && local) {
    if (now - lastStateAt > 15000) {
      disconnect("Connection lost. Check your internet and join again.");
      return;
    }
    input.forward = paused
      ? 0
      : touch
        ? joyF
        : (held.has("KeyW") ? 1 : 0) - (held.has("KeyS") ? 1 : 0);
    input.strafe = paused
      ? 0
      : touch
        ? joyS
        : (held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0);
    input.yaw = yaw;
    input.pitch = pitch;
    if (touch && (input.aim || input.crouch)) input.sprint = false;
    if ((input.jump || pulses.jump) && local.ground && !jumpFeedback)
      sound.play("jump");
    jumpFeedback = input.jump;
    if (
      !paused &&
      local.dead <= 0 &&
      (input.fire || pulses.fire) &&
      isFirearm(input.weapon) &&
      !local.reload &&
      local.ammo[input.weapon] > 0 &&
      now >= nextShotFeedback
    ) {
      // Immediate cosmetic response; hits, damage and ammo remain authoritative.
      sound.play("shot", 1, input.weapon);
      lastShot = now;
      predictedShotTimes.push(now);
      nextShotFeedback = now + WEAPONS[input.weapon].interval * 1000;
    }
    // Keep 30 Hz simulation at 15–30 FPS too; bound hidden-tab catch-up to 250 ms.
    accumulator += Math.min(0.25, Math.max(0, (now - simulationFrame) / 1000));
    simulationFrame = now;
    while (accumulator >= TICK) {
      if (pendingInputs.length < MAX_PENDING_INPUTS) {
        const command = { ...input, seq: ++seq };
        if (state?.lagCompensation && snapshotClock.samples > 1)
          command.viewTime = snapshotClock.renderTime(now) / 1000;
        for (const [key, on] of Object.entries(pulses))
          if (on) (command as any)[key] = true;
        pendingInputs.push(command);
        input.seq = seq;
        for (const key of Object.keys(pulses))
          delete pulses[key as keyof Input];
        if (local.dead <= 0) {
          const oldY = local.y;
          move(local, command, world, TICK, local.zombie, local.jetpack);
          const rise = local.y - oldY;
          if (rise > 0.5 && rise <= 1.05 && !command.jump && !command.jet)
            renderCorrection.y = Math.max(-1, renderCorrection.y - rise);
        }
      }
      accumulator -= TICK;
    }
    const blocked = pendingInputs.length >= MAX_PENDING_INPUTS;
    if (blocked && !predictionBlocked) connectionStats.predictionStops++;
    predictionBlocked = blocked;
    updateNetwork();
    const ep = eye(local);
    renderCorrection.multiplyScalar(Math.exp(-dt * 12));
    camera.position.set(
      ep.x + renderCorrection.x,
      ep.y + renderCorrection.y,
      ep.z + renderCorrection.z,
    );
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    if (local.dead > 0 && eliminated) {
      const view = eliminationCamera(
        world,
        eliminated.target,
        eliminated.target.yaw,
        (now - eliminatedAt) / 1000,
      );
      camera.position.set(view.position.x, view.position.y, view.position.z);
      camera.lookAt(view.focus.x, view.focus.y, view.focus.z);
    }
    const scoped =
      input.aim && local.dead <= 0 && local.weapon === 3 && local.reload <= 0;
    show("scope", scoped);
    show("crosshair", local.dead <= 0 && !scoped);
    const targetFov =
      settings.fov -
      (input.aim && local.dead <= 0
        ? scoped
          ? Math.min(52, settings.fov - 22)
          : 14
        : 0);
    camera.fov = THREE.MathUtils.lerp(
      camera.fov,
      targetFov,
      1 - Math.exp(-dt * 16),
    );
    camera.updateProjectionMatrix();
    weaponGroup.visible = local.dead <= 0 && !scoped;
    const pose = weaponPose(
      now - lastShot,
      local.weapon,
      Math.hypot(local.vx, local.vz),
      now,
      input.aim,
      Math.max(0, local.reload - (now - lastStateAt) / 1000),
      now - weaponSwitchedAt,
      input.sprint,
    );
    presentedPose = pose;
    weaponGroup.position.set(pose.x, pose.y, pose.z);
    weaponGroup.rotation.set(pose.pitch, 0, pose.roll);
    if (modelWeapon !== local.weapon || modelClass !== local.classId) {
      modelClass = local.classId ?? 0;
      modelWeapon = local.weapon;
      weaponSwitchedAt = now;
      setWeaponModel(modelWeapon);
    }
    for (const part of weaponGroup.userData.dynamic as THREE.Mesh[]) {
      part.position.copy(part.userData.home);
      part.rotation.set(0, 0, 0);
      const kind = part.userData.kind;
      if (kind === "drill")
        part.rotation.z = input.fire || input.dig ? now * 0.024 : 0;
      if (kind === "magazine") {
        part.position.y -= pose.magazine * 0.23;
        part.position.x -= pose.magazine * 0.08;
        part.rotation.z = -pose.magazine * 0.25;
      }
      if (kind === "bolt" || kind === "pump")
        part.position.z += pose.bolt * (kind === "pump" ? 0.12 : 0.055);
      if (kind === "hand") {
        part.position.y -= pose.leftHand * 0.16;
        part.position.z +=
          pose.leftHand * 0.08 + (local.weapon === 2 ? pose.bolt * 0.12 : 0);
      }
      if (kind === "shell") {
        part.visible = local.reload > 0;
        part.position.y += pose.shell * 0.12;
      }
    }
    if (weaponGroup.userData.flash)
      weaponGroup.userData.flash.visible =
        now - lastShot < 65 && local.reload <= 0;
    if (
      local.dead <= 0 &&
      !paused &&
      local.ground &&
      Math.hypot(local.vx, local.vz) > 1 &&
      now - stepAt > 370
    ) {
      sound.play("step", 0.3);
      stepAt = now;
    }
    const hit = ray(world, ep, direction(yaw, pitch), 6);
    const kit = input.buildKit ?? 0;
    fortifications.update(now, world, local, state.players, kit, yaw, pitch);
    const building = local.weapon === 5 && !local.zombie && local.dead <= 0;
    show("construction-panel", building);
    $("kit-button").textContent = `KIT: ${KITS[kit].name.toUpperCase()} ▾`;
    $("kit-hint").textContent = kit
      ? `${KITS[kit].cells.length} blocks · ${fortifications.reason}`
      : "1 block · Tap KIT / B to cycle";
    outline.visible = !!hit && local.dead <= 0 && !(building && kit > 0);
    if (hit) {
      const target = building ? hit.previous : hit;
      outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    }
    terrain.distance(local.x, local.z, settings.distance);
    if (
      renderer.shadowMap.enabled &&
      now - lastShadow >
        shadowQuality(settings.preset, touch, settings.shadows).interval
    ) {
      lastShadow = now;
      const x = Math.floor(local.x / 8) * 8,
        z = Math.floor(local.z / 8) * 8;
      sun.target.position.set(x, local.y, z);
      sun.position.set(x - 48, local.y + 64, z - 60);
      sun.target.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
    }
    if (now - lastNet > (networkMode === "http" ? 100 : 50)) {
      lastNet = now;
      void sendInput();
    }
    show("hitmarker", now < hitUntil);
    $("vignette").style.background =
      now < damageUntil
        ? "radial-gradient(ellipse,transparent 30%,#d7464b66)"
        : "none";
    const renderAt = snapshotClock.renderTime(now);
    for (const r of remote.values()) {
      while (r.samples.length > 2 && r.samples[1].at < renderAt)
        r.samples.shift();
      const a = r.samples[0] ?? r.target,
        b = r.samples[1] ?? a,
        t = Math.max(0, Math.min(1, (renderAt - a.at) / (b.at - a.at || 1)));
      const oldX = r.group.position.x,
        oldZ = r.group.position.z;
      r.group.position.set(
        THREE.MathUtils.lerp(a.x, b.x, t),
        THREE.MathUtils.lerp(a.y, b.y, t),
        THREE.MathUtils.lerp(a.z, b.z, t),
      );
      const diff = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
      r.group.rotation.y = a.yaw + diff * t;
      r.group.scale.y = r.target.crouch ? 0.68 : 1;
      const rig = r.group.userData.rig;
      // Animate distance actually presented, not stale velocity during a stalled snapshot.
      const distanceMoved = Math.hypot(
        r.group.position.x - oldX,
        r.group.position.z - oldZ,
      );
      const speed =
        distanceMoved < 1
          ? Math.min(12, distanceMoved / Math.max(dt, 0.001))
          : 0;
      rig.phase += dt * speed * 2.1;
      const pose = playerPose(
        rig.phase,
        speed,
        (t < 0.5 ? a : b).ground,
        r.target.zombie,
        (t < 0.5 ? a : b).aim,
        (t < 0.5 ? a : b).reload > 0,
        (now - (r.group.userData.shotAt ?? -10000)) / 1000,
      );
      const blend = 1 - Math.exp(-dt * 18);
      rig.leftLeg.rotation.x = THREE.MathUtils.lerp(
        rig.leftLeg.rotation.x,
        pose.leftLeg,
        blend,
      );
      rig.rightLeg.rotation.x = THREE.MathUtils.lerp(
        rig.rightLeg.rotation.x,
        pose.rightLeg,
        blend,
      );
      const lookPitch = THREE.MathUtils.lerp(a.pitch, b.pitch, t);
      rig.leftArm.rotation.x = THREE.MathUtils.lerp(
        rig.leftArm.rotation.x,
        pose.leftArm + lookPitch * 0.5,
        blend,
      );
      rig.rightArm.rotation.x = THREE.MathUtils.lerp(
        rig.rightArm.rotation.x,
        pose.rightArm + lookPitch * 0.5,
        blend,
      );
      rig.head.rotation.x = lookPitch * 0.5;
      rig.root.position.y = THREE.MathUtils.lerp(
        rig.root.position.y,
        pose.bob,
        blend,
      );
      rig.torso.rotation.x = THREE.MathUtils.lerp(
        rig.torso.rotation.x,
        pose.lean,
        blend,
      );
      r.group.visible =
        r.target.dead <= 0 &&
        r.group.position.distanceTo(camera.position) < settings.distance;
      if (r.group.userData.gun) {
        r.group.userData.gun.visible = isFirearm(r.target.weapon);
        r.group.userData.gun.rotation.x = lookPitch * 0.5 - 0.35;
      }
      for (const flame of r.group.userData.flames ?? [])
        flame.visible = r.target.jetpack && a.fuel > b.fuel && r.target.vy > 0;
      const pp = r.group.position
        .clone()
        .add(new THREE.Vector3(0, 2.2, 0))
        .project(camera);
      const distance = r.group.position.distanceTo(camera.position),
        occluded =
          distance >= 35 ||
          ray(
            world,
            camera.position,
            r.group.position
              .clone()
              .add(new THREE.Vector3(0, 1.5, 0))
              .sub(camera.position)
              .normalize(),
            distance - 1,
          );
      r.label.style.display =
        r.group.visible && pp.z < 1 && pp.z > -1 && distance < 35 && !occluded
          ? "block"
          : "none";
      r.label.style.left = `${(pp.x * 0.5 + 0.5) * innerWidth}px`;
      r.label.style.top = `${(-pp.y * 0.5 + 0.5) * innerHeight}px`;
      r.label.style.transform = "translate(-50%,-100%)";
      r.label.textContent =
        r.target.name +
        (r.target.bot
          ? ` [NPC${r.target.team === local.team && r.target.npcRole ? ` · ${r.target.npcRole}` : ""}]`
          : "");
    }
    for (let n = 0; n < 2; n++) {
      const f = state.flags[n];
      flagMeshes[n].visible = state.mode === "relay" || state.mode === "ctf";
      flagMeshes[n].position.set(f.pos.x, f.pos.y, f.pos.z);
      flagMeshes[n].rotation.y = Math.sin(now * 0.0015 + n) * 0.12;
    }
    beacon.visible = state.jet === "pickup";
    beacon.rotation.y = now * 0.001;
  } else {
    camera.position.set(
      W / 2 + 18 + Math.sin(now * 0.00008) * 9,
      42,
      D / 2 + 39,
    );
    camera.lookAt(W / 2 - 1, 14, D / 2 - 6);
    weaponGroup.visible = false;
    show("scope", false);
    show("construction-panel", false);
    fortifications.mesh.count = 0;
    outline.visible = false;
    flagMeshes.forEach((f) => (f.visible = false));
    terrain.distance(W / 2, D / 2, 160);
  }
  combatFX.quality = settings.effects === "low" ? "low" : "high";
  combatFX.update(now, dt);
  if (connected && local && local.dead <= 0) {
    camera.position.x += Math.sin(now * 0.049) * combatFX.shake;
    camera.position.y += Math.cos(now * 0.053) * combatFX.shake;
  }
  sky.update(camera, now / 1000);
  water.update(now / 1000, settings.effects !== "low");
  fieldGear.update(
    connected ? (state?.fieldGear ?? []) : [],
    camera.position,
    settings.effects === "high",
    now / 1000,
  );
  contactShadows.update(
    world,
    connected ? (state?.players ?? []) : [],
    settings.shadows,
    id,
    remote,
  );
  if (connected && state && local) battlefield.update(state, local, now / 1000);
  sound.updateJets(
    jetVoices(
      connected ? local : null,
      input.jet,
      state?.players ?? [],
      yaw,
      paused,
      document.hidden,
    ),
  );
  if (connected && local && state)
    minimap.update(now, state, { ...local, yaw });
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
void refreshRooms();
setInterval(() => {
  if (!connected && !joining) void refreshRooms();
}, 10000);
// Read-only diagnostics used by browser QA; no production gameplay commands or state authority.
(window as any).BR = {
  get connected() {
    return connected;
  },
  get player() {
    return (
      local && {
        id: local.id,
        x: local.x,
        y: local.y,
        z: local.z,
        health: local.health,
        weapon: local.weapon,
        blocks: local.blocks,
        fuel: local.fuel,
        dead: local.dead,
        zombie: local.zombie,
        yaw,
        pitch,
      }
    );
  },
  get state() {
    return state;
  },
  get input() {
    return { ...input };
  },
  get map() {
    return {
      width: W,
      depth: D,
      tilesLeft: minimap.dirty.size,
      draws: minimap.draws,
      teammates: minimap.friendCount,
      expanded: minimap.expanded,
    };
  },
  get chunks() {
    return terrain.chunks.size;
  },
  get elimination() {
    return {
      active: !!eliminated,
      modelVisible: eliminated?.group.visible ?? false,
      camera: camera.position.toArray(),
    };
  },
  get network() {
    return {
      ping,
      transport: networkMode,
      pending: pendingInputs.length,
      acknowledged: state?.players.find((p: any) => p.id === id)?.lastSeq,
      snapshotAge: Math.max(0, performance.now() - lastStateAt),
      buffer: snapshotClock.delay,
      jitter: snapshotClock.jitter,
      lagCompensation: state?.lagCompensation ?? false,
      ...connectionStats,
    };
  },
  get lighting() {
    return {
      sunShadows: renderer.shadowMap.enabled,
      shadowSize: sun.shadow.mapSize.x,
      exposure: renderer.toneMappingExposure,
      sun: sun.intensity,
      ambient: ambient.intensity,
      gearInstances: fieldGear.solid.count,
      beaconLights: fieldGear.lights.filter((l) => l.intensity > 0).length,
    };
  },
  get drawCalls() {
    return renderer.info.render.calls;
  },
  get triangles() {
    return renderer.info.render.triangles;
  },
  get remotes() {
    return remote.size;
  },
  get combat() {
    return {
      particles: combatFX.particles.length,
      tracers: combatFX.tracers.length,
      projectiles: combatFX.projectiles.length,
    };
  },
  get weaponAnimation() {
    return {
      weapon: modelWeapon,
      pose: presentedPose,
      parts: (weaponGroup.userData.dynamic ?? []).map((p: THREE.Mesh) => ({
        kind: p.userData.kind,
        position: p.position.toArray(),
      })),
    };
  },
  get audio() {
    return sound.diagnostics;
  },
  get construction() {
    return {
      kit: input.buildKit ?? 0,
      ghosts: fortifications.mesh.count,
      reason: fortifications.reason,
      edits: [...world.edits],
    };
  },
  get animation() {
    return [...remote.values()].map((r) => ({
      id: r.target.id,
      bot: r.target.bot,
      model: r.group.userData.model,
      visible: r.group.visible,
      phase: r.group.userData.rig.phase,
      leftLeg: r.group.userData.rig.leftLeg.rotation.x,
      rightLeg: r.group.userData.rig.rightLeg.rotation.x,
      rightArm: r.group.userData.rig.rightArm.rotation.x,
      skinned: r.group.children.some((c) => c instanceof THREE.SkinnedMesh),
    }));
  },
};

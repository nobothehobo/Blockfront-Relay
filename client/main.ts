import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { replay } from "../shared/prediction.js";
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
} from "../shared/game.js";
import { MiniMap } from "./minimap.js";
import { stickInput, touchLookGain } from "./control-math.js";
import { eliminationCamera } from "./elimination.js";
import { Terrain } from "./mesh.js";
import { Sound } from "./audio.js";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const show = (id: string, on = true) => $(id).classList.toggle("hidden", !on);
const sound = new Sound();
const touch =
  matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle("touch", touch);
type Settings = {
  preset: string;
  distance: number;
  effects: string;
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
  jetSoundAt = 0,
  mouseLocked = false,
  firstState = true,
  networkMode = "ws",
  httpToken = "",
  httpBusy = false,
  httpCursor = 0;
let pendingInputs: Input[] = [];
let predictionEpoch = 0;
const renderCorrection = new THREE.Vector3();
let lastPing = 0;
let nextShotFeedback = 0;
let predictedShotTimes: number[] = [];
let sentCommand = 0;
let serverUrl =
  localStorage.getItem("br-server") ??
  (import.meta as any).env.VITE_SERVER_URL ??
  "";
$("server-url").setAttribute("value", serverUrl);
const base = () => serverUrl.replace(/\/$/, "");
const api = async (path: string, options?: RequestInit) => {
  const r = await fetch(base() + path, options);
  if (!r.ok) {
    const data = await r
      .json()
      .catch(() => ({ error: `Server error ${r.status}` }));
    throw Error(data.error ?? `Server error ${r.status}`);
  }
  return r.json();
};
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
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa9c3bd, 30, 100);
scene.add(terrain.group);
scene.add(new THREE.HemisphereLight(0xe8f4d7, 0x53646e, 2.0));
const sun = new THREE.DirectionalLight(0xffdeb0, 2.2);
sun.position.set(-30, 70, 15);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(
  settings.fov,
  innerWidth / innerHeight,
  0.07,
  360,
);
camera.rotation.order = "YXZ";
scene.add(camera);
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(W * 0.5, 28),
  new THREE.MeshLambertMaterial({
    color: 0x398f9a,
    transparent: true,
    opacity: 0.76,
    side: THREE.DoubleSide,
  }),
);
water.rotation.x = -Math.PI / 2;
water.position.set(W / 2, 6.8, D / 2);
scene.add(water);
const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
  },
  vertexShader:
    "varying vec3 skyDirection; void main(){ skyDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 skyDirection;
    void main(){vec3 d=normalize(skyDirection); float h=smoothstep(0.0,0.7,d.y);
    vec3 color=mix(horizon,top,h);
    vec2 tile=floor(d.xz*80.0)/80.0;
    float cloud=smoothstep(0.53,0.87,sin(tile.x*21.0+sin(tile.y*13.0))*sin(tile.y*28.0));
    cloud*=smoothstep(0.10,0.23,d.y)*(1.0-smoothstep(0.40,0.55,d.y));
    gl_FragColor=vec4(mix(color,vec3(0.96,0.96,0.88),cloud*0.40),1.0);
    #include <colorspace_fragment>
    }`,
});
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(300, 20, 12),
  skyMaterial,
);
skyDome.frustumCulled = false;
skyDome.renderOrder = -100;
scene.add(skyDome);
function applyTheme() {
  const theme = mapTheme(world.seed);
  scene.background = new THREE.Color(theme.sky);
  skyMaterial.uniforms.top.value.setHex(theme.sky);
  skyMaterial.uniforms.horizon.value.setHex(theme.fog);
  (scene.fog as THREE.Fog).color.setHex(theme.fog);
  (water.material as THREE.MeshLambertMaterial).color.setHex(theme.water);
  sun.color.setHex(theme.kind === 0 ? 0xffdfad : 0xfff0d5);
}
applyTheme();
const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(4, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xfff5cf, fog: false }),
);
sunDisc.position.set(-95, 155, -130);
scene.add(sunDisc);
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
const mat = (color: number) => new THREE.MeshLambertMaterial({ color });
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
  while (weaponGroup.children.length) {
    const child = weaponGroup.children[0] as THREE.Mesh;
    child.geometry.dispose();
    (child.material as THREE.Material).dispose();
    weaponGroup.remove(child);
  }
  if (n < 4) {
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
    if (n === 3)
      box(0.08, 0.08, 0.25, 0.23, -0.11, -0.49, 0x142b32, weaponGroup);
    else box(0.04, 0.05, 0.04, 0.23, -0.14, -0.68, 0x132c34, weaponGroup);
  } else if (n === 4) {
    box(0.045, 0.5, 0.045, 0.26, -0.3, -0.54, 0x896745, weaponGroup);
    box(0.24, 0.22, 0.045, 0.26, -0.01, -0.54, 0x91a6a3, weaponGroup);
  } else box(0.23, 0.23, 0.23, 0.26, -0.25, -0.55, 0x57caba, weaponGroup);
  box(0.13, 0.15, 0.25, 0.23, -0.39, -0.28, 0xd6b183, weaponGroup);
}
setWeaponModel(0);
let modelWeapon = 0;
let jumpFeedback = false;
const remote = new Map<
  string,
  { group: THREE.Group; samples: any[]; target: any; label: HTMLElement }
>();
function makePlayer(p: any) {
  const g = new THREE.Group();
  const color = p.zombie ? 0x80bd50 : p.team === 0 ? 0x4ab7b9 : 0xe77548;
  box(0.62, 0.65, 0.38, 0, 1.06, 0, color, g);
  box(0.43, 0.42, 0.4, 0, 1.61, 0, p.zombie ? 0xb2ce75 : 0xd7b38c, g);
  box(0.45, 0.12, 0.43, 0, 1.85, 0, color, g);
  box(0.2, 0.6, 0.23, -0.18, 0.38, 0, 0x334b52, g);
  box(0.2, 0.6, 0.23, 0.18, 0.38, 0, 0x334b52, g);
  box(0.17, 0.58, 0.2, -0.4, 1.05, -0.08, color, g);
  box(0.17, 0.58, 0.2, 0.4, 1.05, -0.08, color, g);
  if (!p.zombie)
    g.userData.gun = box(0.1, 0.1, 0.5, 0.36, 1.12, -0.33, 0x34434a, g);
  box(0.4, 0.45, 0.16, 0, 1.05, 0.29, 0x46585d, g);
  box(0.44, 0.15, 0.42, 0, 1.69, -0.01, 0x243638, g);
  box(0.46, 0.08, 0.44, 0, 1.9, 0, color, g);
  for (const x of [-0.18, 0.18]) {
    box(0.19, 0.12, 0.3, x, 0.1, -0.05, 0x293236, g);
    box(0.08, 0.43, 0.025, x, 1.09, -0.205, 0x52624b, g);
    box(0.15, 0.16, 0.035, x, 1.04, -0.235, 0x7b805c, g);
  }
  // Batch static anatomy into one draw call; gun and thrust stay independently animated.
  const parts = g.children.filter((c) => c !== g.userData.gun) as THREE.Mesh[];
  const geometries = parts.map((m) => {
    const geometry = m.geometry.toNonIndexed();
    geometry.translate(m.position.x, m.position.y, m.position.z);
    const color = (m.material as THREE.MeshLambertMaterial).color;
    const values = new Float32Array(
      geometry.getAttribute("position").count * 3,
    );
    for (let i = 0; i < values.length; i += 3)
      values.set([color.r, color.g, color.b], i);
    geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
    g.remove(m);
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
    return geometry;
  });
  const merged = mergeGeometries(geometries)!;
  geometries.forEach((g) => g.dispose());
  g.add(
    new THREE.Mesh(
      merged,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    ),
  );
  g.userData.flames = [-0.13, 0.13].map((x) => {
    const flame = box(0.09, 0.35, 0.09, x, 0.7, 0.3, 0xffbe55, g);
    (flame.material as THREE.Material).dispose();
    flame.material = new THREE.MeshLambertMaterial({
      color: 0xffbe55,
      emissive: 0xff9400,
      emissiveIntensity: 2,
    });
    flame.visible = false;
    return flame;
  });
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
    } else if (key === "invert") {
      field = document.createElement("input");
      field.type = "checkbox";
      field.checked = settings.invert;
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
        key === "invert"
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
      meta.textContent = `${r.bots ? `${r.bots} NPCs · ` : ""}${r.mode === "tdm" ? "Team deathmatch" : r.mode === "relay" ? "Capture the relay" : "Humans vs Zombies"} · ${r.players}/${r.max} players\n${r.map} · Jetpacks ${r.jet}`;
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
    id = msg.id;
    roomId = msg.room.id;
    world.seed = msg.seed ?? msg.room?.seed ?? world.seed;
    applyTheme();
    world.decode(msg.map);
    terrain.rebuild();
    minimap.reset();
    firstState = true;
    connected = true;
    joining = false;
    show("menu", false);
    show("browser", false);
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
  } else if (msg.type === "map") {
    world.seed = msg.seed ?? msg.room?.seed ?? world.seed;
    applyTheme();
    world.decode(msg.map);
    terrain.rebuild();
    minimap.reset();
    if (local) terrain.prioritize(local.x, local.z);
  } else if (msg.type === "pong") {
    ping = Math.round(performance.now() - msg.at);
  } else if (msg.type === "error") disconnect(msg.message ?? "Server error");
}
function disconnect(reason = "Disconnected. Join a room to reconnect.") {
  clearElimination();
  connected = false;
  joining = false;
  local = null;
  state = null;
  ws?.close();
  ws = null;
  httpToken = "";
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
        body: JSON.stringify({ room, name: nameInput.value }),
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
  url.search = new URLSearchParams({ room, name: nameInput.value }).toString();
  ws = new WebSocket(url);
  const socket = ws;
  socket.onmessage = (e) => {
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
  state = next;
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
    if (touch) chooseWeapon(p.weapon);
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
    if (r && r.target.zombie !== rp.zombie) {
      disposePlayer(r);
      remote.delete(rp.id);
      r = undefined;
    }
    if (!r) {
      r = makePlayer(rp);
      remote.set(rp.id, r);
    }
    r.target = rp;
    r.samples.push({ at: performance.now(), ...rp });
    if (r.samples.length > 8) r.samples.shift();
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
    if (e.id === id) {
      predictedShotTimes = predictedShotTimes.filter(
        (at) => performance.now() - at < 1500,
      );
      if (predictedShotTimes.length) predictedShotTimes.shift();
      else {
        sound.play("shot");
        lastShot = performance.now();
      }
    } else if (
      local &&
      e.origin &&
      Math.hypot(local.x - e.origin.x, local.z - e.origin.z) < 40
    )
      sound.play("shot", 0.25);
    if (settings.effects === "high" && e.weapon < 4) {
      const o = e.origin,
        d = e.dir;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(o.x, o.y, o.z),
        new THREE.Vector3(o.x + d.x * 15, o.y + d.y * 15, o.z + d.z * 15),
      ]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0xffdb93,
          transparent: true,
          opacity: 0.5,
        }),
      );
      scene.add(line);
      setTimeout(() => {
        scene.remove(line);
        geometry.dispose();
        (line.material as THREE.Material).dispose();
      }, 65);
    }
  }
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
          : `Round ${state.round} · ${state.map} · First to 40`;
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
  $("health-bar").style.width = `${(p.health / (p.zombie ? 150 : 100)) * 100}%`;
  $("blocks").textContent = `${p.blocks} blocks`;
  $("fuel-label").style.opacity = p.jetpack ? "1" : ".45";
  $("fuel").textContent = p.jetpack ? `${Math.round(p.fuel)}%` : "NO PACK";
  $("fuel-bar").style.width = p.jetpack ? `${p.fuel}%` : "0%";
  $("weapon-name").textContent = WEAPONS[p.weapon].name.toUpperCase();
  $("ammo").textContent =
    p.weapon < 4
      ? String(p.ammo[p.weapon])
      : p.weapon === 5
        ? String(p.blocks)
        : "∞";
  $("reserve").textContent =
    p.weapon < 4
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
  $("network").textContent =
    `${ping} ms · ${networkMode === "http" ? "HTTP" : "WS"}`;
  let banner = "";
  if (state.phase === "finished")
    banner = `${state.winner} · Next round in ${Math.ceil(state.remaining)}s`;
  else if (p.dead > 0)
    banner = `${p.zombie ? "Infected · " : ""}Respawn in ${Math.ceil(p.dead)}s`;
  show("banner", !!banner);
  $("banner").textContent = banner;
  $("objective-hud").textContent =
    mode === "relay"
      ? state.flags
          .map(
            (f: any) =>
              `${f.team === 0 ? "Azure" : "Ember"} relay: ${f.carrier ? (f.carrier === id ? "YOU HAVE IT" : "carried") : f.dropped ? "dropped" : "home"}`,
          )
          .join(" · ")
      : mode === "infection"
        ? p.zombie
          ? "Infect humans · Hold jump to climb"
          : "Survive · Build defenses"
        : state.jet === "pickup"
          ? "Jetpack beacon at the central bridge"
          : "";
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
      b.disabled = p.zombie && Number(b.dataset.weapon) !== 4;
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
  if (/^Digit[1-6]$/.test(e.code)) input.weapon = Number(e.code.slice(-1)) - 1;
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
      input.weapon = (input.weapon + (e.deltaY > 0 ? 1 : 5)) % 6;
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
  input.weapon = local?.zombie ? 4 : weapon;
  if (input.weapon < 4) lastGun = input.weapon;
  if (local) {
    local.weapon = input.weapon;
    updateHud();
  }
  if (input.weapon >= 4) {
    input.aim = false;
    const button = document.querySelector<HTMLButtonElement>(
      '[data-action="aim"]',
    )!;
    button.classList.remove("held");
    button.setAttribute("aria-pressed", "false");
  }
  const tools = input.weapon >= 4 && !local?.zombie;
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
$("switch-weapon").onclick = () => {
  const open = $("weapon-picker").classList.contains("hidden");
  show("weapon-picker", open);
  $("switch-weapon").setAttribute("aria-expanded", String(open));
};
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-weapon]",
))
  button.onclick = () => chooseWeapon(Number(button.dataset.weapon));
$("build-mode").onclick = () => chooseWeapon(input.weapon >= 4 ? lastGun : 5);
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
$("practice").onclick = async () => {
  const button = $<HTMLButtonElement>("practice");
  button.disabled = true;
  try {
    await refreshRooms();
    const existing = rooms.find(
      (r) =>
        r.name === "Scout Practice" && r.mode === "tdm" && r.npcSlots === 4,
    );
    const room =
      existing ??
      (await api("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Scout Practice",
          mode: "tdm",
          jet: "all",
          bots: 4,
          limit: 16,
          duration: 300,
        }),
      }));
    await refreshRooms();
    await join(room.id);
  } catch (e) {
    $("status").textContent = (e as Error).message;
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
async function sendInput() {
  if (!connected) return;
  const commands = (
    networkMode === "ws"
      ? pendingInputs.filter((c) => c.seq > sentCommand)
      : pendingInputs
  ).slice(0, 32);
  if (networkMode === "ws") {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ type: "input", commands, epoch: predictionEpoch }),
      );
      if (commands.length) sentCommand = commands[commands.length - 1].seq;
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
      const result = await api("/api/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: roomId,
          token: httpToken,
          commands,
          epoch: predictionEpoch,
          revision: (world as any).revision ?? 0,
          cursor: httpCursor,
          round: state?.round,
        }),
      });
      if (httpToken !== activeToken || !connected) return;
      ping = Math.round(performance.now() - start);
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
      if ((e as Error).message.includes("Session"))
        disconnect("Session expired. Rejoin the match.");
      else $("network").textContent = "Connection unstable";
    } finally {
      httpBusy = false;
    }
  }
}
let lastFrame = performance.now(),
  accumulator = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  terrain.update(2);
  if (connected && local) {
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
      input.weapon < 4 &&
      !local.reload &&
      local.ammo[input.weapon] > 0 &&
      now >= nextShotFeedback
    ) {
      // Immediate cosmetic response; hits, damage and ammo remain authoritative.
      sound.play("shot");
      lastShot = now;
      predictedShotTimes.push(now);
      nextShotFeedback = now + WEAPONS[input.weapon].interval * 1000;
    }
    accumulator += dt;
    while (accumulator >= TICK) {
      if (pendingInputs.length < 60) {
        const command = { ...input, seq: ++seq };
        for (const [key, on] of Object.entries(pulses))
          if (on) (command as any)[key] = true;
        pendingInputs.push(command);
        input.seq = seq;
        for (const key of Object.keys(pulses))
          delete pulses[key as keyof Input];
        if (local.dead <= 0)
          move(local, command, world, TICK, local.zombie, local.jetpack);
      }
      accumulator -= TICK;
    }
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
    show("crosshair", local.dead <= 0);
    camera.fov =
      settings.fov -
      (input.aim && local.dead <= 0 ? (local.weapon === 3 ? 37 : 14) : 0);
    camera.updateProjectionMatrix();
    weaponGroup.visible = local.dead <= 0;
    weaponGroup.position.y =
      local.reload > 0
        ? -0.15
        : Math.sin(now * 0.01) *
          Math.min(0.012, Math.hypot(local.vx, local.vz) * 0.002);
    weaponGroup.position.z = Math.max(0, 1 - (now - lastShot) / 110) * 0.05;
    weaponGroup.position.x = input.aim ? -0.15 : 0;
    if (modelWeapon !== local.weapon) {
      modelWeapon = local.weapon;
      setWeaponModel(modelWeapon);
    }
    if (
      local.ground &&
      Math.hypot(local.vx, local.vz) > 1 &&
      now - stepAt > 370
    ) {
      sound.play("step", 0.3);
      stepAt = now;
    }
    if (
      input.jet &&
      local.jetpack &&
      local.fuel > 0 &&
      now - jetSoundAt > 110
    ) {
      sound.play("jet", 0.4);
      jetSoundAt = now;
    }
    const hit = ray(world, ep, direction(yaw, pitch), 6);
    outline.visible = !!hit && local.dead <= 0;
    if (hit) outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    terrain.distance(local.x, local.z, settings.distance);
    if (now - lastNet > (networkMode === "http" ? 100 : 50)) {
      lastNet = now;
      void sendInput();
    }
    show("hitmarker", now < hitUntil);
    $("vignette").style.background =
      now < damageUntil
        ? "radial-gradient(ellipse,transparent 30%,#d7464b66)"
        : "none";
    for (const r of remote.values()) {
      const renderAt = now - Math.max(110, Math.min(300, ping * 0.6 + 50));
      while (r.samples.length > 2 && r.samples[1].at < renderAt)
        r.samples.shift();
      const a = r.samples[0] ?? r.target,
        b = r.samples[1] ?? a,
        t = Math.max(0, Math.min(1, (renderAt - a.at) / (b.at - a.at || 1)));
      r.group.position.set(
        THREE.MathUtils.lerp(a.x, b.x, t),
        THREE.MathUtils.lerp(a.y, b.y, t),
        THREE.MathUtils.lerp(a.z, b.z, t),
      );
      const diff = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
      r.group.rotation.y = a.yaw + diff * t;
      r.group.scale.y = r.target.crouch ? 0.68 : 1;
      r.group.visible =
        r.target.dead <= 0 &&
        r.group.position.distanceTo(camera.position) < settings.distance;
      if (r.group.userData.gun) {
        r.group.userData.gun.visible = r.target.weapon < 4;
        r.group.userData.gun.rotation.x = r.target.pitch;
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
    }
    for (let n = 0; n < 2; n++) {
      const f = state.flags[n];
      flagMeshes[n].visible = state.mode === "relay";
      flagMeshes[n].position.set(f.pos.x, f.pos.y, f.pos.z);
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
    outline.visible = false;
    flagMeshes.forEach((f) => (f.visible = false));
    terrain.distance(W / 2, D / 2, 160);
  }
  skyDome.position.copy(camera.position);
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
};

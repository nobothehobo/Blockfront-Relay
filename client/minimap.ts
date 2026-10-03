import {
  World,
  W,
  H,
  D,
  CHUNK,
  palette,
  mapTheme,
  basePosition,
} from "../shared/game.js";
import { Sector, SupplyStation } from "../shared/battlefield.js";
type Dot = { id: string; x: number; z: number; team: number; dead: number };
type MapState = {
  mode: string;
  jet: string;
  controlPoints?: Sector[];
  supplyStations?: SupplyStation[];
  players: Dot[];
  flags: {
    team: number;
    pos: { x: number; z: number };
    carrier: string | null;
  }[];
};
export function surfacePixel(
  world: World,
  x: number,
  z: number,
): [number, number, number, number] {
  const stride = W * D;
  let y = H - 1;
  while (y > 0 && !world.blocks[x + W * z + y * stride]) y--;
  let color = palette[world.blocks[x + W * z + y * stride]] ?? 0x445b62;
  if (y < 7 && x > W * 0.25 && x < W * 0.75 && Math.abs(z - D / 2) < 14)
    color = mapTheme(world.seed).water;
  const shade = 0.72 + Math.min(1, y / 32) * 0.28;
  return [
    Math.round(((color >> 16) & 255) * shade),
    Math.round(((color >> 8) & 255) * shade),
    Math.round((color & 255) * shade),
    255,
  ];
}
export function friendlyDots(players: Dot[], local: Dot) {
  return players.filter(
    (p) => p.id !== local.id && p.team === local.team && p.dead <= 0,
  );
}
export class MiniMap {
  terrain = document.createElement("canvas");
  image: ImageData;
  dirty = new Set<number>();
  background: CanvasRenderingContext2D;
  context: CanvasRenderingContext2D;
  lastDraw = 0;
  expanded = false;
  draws = 0;
  friendCount = 0;
  constructor(
    public world: World,
    public canvas: HTMLCanvasElement,
    public panel: HTMLElement,
    public button: HTMLButtonElement,
  ) {
    this.terrain.width = W;
    this.terrain.height = D;
    this.background = this.terrain.getContext("2d")!;
    this.image = this.background.createImageData(W, D);
    canvas.width = 256;
    canvas.height = 256;
    this.context = canvas.getContext("2d")!;
    button.onclick = () => this.toggle();
    this.reset();
  }
  reset() {
    this.image.data.fill(0);
    this.background.clearRect(0, 0, W, D);
    for (let x = 0; x < W / CHUNK; x++)
      for (let z = 0; z < D / CHUNK; z++) this.dirty.add(x + (W / CHUNK) * z);
  }
  edit(x: number, z: number) {
    this.dirty.add(Math.floor(x / CHUNK) + (W / CHUNK) * Math.floor(z / CHUNK));
  }
  toggle() {
    this.expanded = !this.expanded;
    this.panel.classList.toggle("expanded", this.expanded);
    this.button.textContent = this.expanded ? "CLOSE MAP" : "MAP ⤢";
    this.button.setAttribute("aria-expanded", String(this.expanded));
  }
  update(now: number, state: MapState, local: Dot & { yaw: number }) {
    let changed = false,
      count = 0;
    const start = performance.now();
    for (const tile of this.dirty) {
      const cx = tile % (W / CHUNK),
        cz = Math.floor(tile / (W / CHUNK));
      for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++)
        for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++)
          this.image.data.set(surfacePixel(this.world, x, z), (x + W * z) * 4);
      this.dirty.delete(tile);
      changed = true;
      if (++count >= 16 || performance.now() - start > 3) break;
    }
    if (changed) this.background.putImageData(this.image, 0, 0);
    if (now - this.lastDraw < 100) return;
    this.lastDraw = now;
    this.draws++;
    const ctx = this.context,
      s = 256;
    ctx.fillStyle = "#15333d";
    ctx.fillRect(0, 0, s, s);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain, 0, 0, s, s);
    ctx.strokeStyle = "#ffffff24";
    ctx.lineWidth = 1;
    for (let n = 1; n < 4; n++) {
      ctx.beginPath();
      ctx.moveTo((n * s) / 4, 0);
      ctx.lineTo((n * s) / 4, s);
      ctx.moveTo(0, (n * s) / 4);
      ctx.lineTo(s, (n * s) / 4);
      ctx.stroke();
    }
    const point = (p: { x: number; z: number }) => [
      Math.max(0, Math.min(s, (p.x / W) * s)),
      Math.max(0, Math.min(s, (p.z / D) * s)),
    ];
    const color = (team: number) => (team === 0 ? "#57ded0" : "#ff9d59");
    for (const team of [0, 1]) {
      const [x, z] = point(basePosition(team));
      ctx.fillStyle = color(team);
      ctx.strokeStyle = "#102c33";
      ctx.lineWidth = 2;
      ctx.fillRect(x - 6, z - 6, 12, 12);
      ctx.strokeRect(x - 6, z - 6, 12, 12);
    }
    if (state.mode === "relay")
      for (const flag of state.flags) {
        const [x, z] = point(flag.pos);
        ctx.beginPath();
        ctx.moveTo(x, z - 8);
        ctx.lineTo(x + 8, z);
        ctx.lineTo(x, z + 8);
        ctx.lineTo(x - 8, z);
        ctx.closePath();
        ctx.fillStyle = color(flag.team);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.stroke();
      }
    if (state.jet === "pickup") {
      const [x, z] = point({ x: W / 2 + 0.5, z: D / 2 + 0.5 });
      ctx.fillStyle = "#ffe28f";
      ctx.fillRect(x - 4, z - 4, 8, 8);
    }
    const friends = friendlyDots(state.players, local);
    for (const supply of state.supplyStations ?? []) {
      if (supply.team !== local.team) continue;
      const [x, z] = point(supply.pos);
      ctx.fillStyle = "#fff1b1";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText("+", x - 5, z + 5);
    }
    if (state.mode === "frontline")
      for (const sector of state.controlPoints ?? []) {
        const [x, z] = point(sector.pos);
        ctx.beginPath();
        ctx.arc(x, z, 8, 0, Math.PI * 2);
        ctx.fillStyle = sector.contested
          ? "#ffe28f"
          : sector.owner < 0
            ? "#a9bbc1"
            : color(sector.owner);
        ctx.fill();
        ctx.fillStyle = "#122a33";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(sector.name, x - 4, z + 4);
      }
    this.friendCount = friends.length;
    for (const p of friends) {
      const [x, z] = point(p);
      ctx.beginPath();
      ctx.arc(x, z, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = color(p.team);
      ctx.fill();
      ctx.strokeStyle = "#17333c";
      ctx.stroke();
    }
    const [x, z] = point(local);
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-local.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = local.dead > 0 ? "#9ba4a4" : "#fff";
    ctx.fill();
    ctx.strokeStyle = "#0d2630";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#15333d";
    ctx.lineWidth = 4;
    ctx.strokeText("N", 10, 24);
    ctx.fillText("N", 10, 24);
  }
}

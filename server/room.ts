import { basePosition, mapTheme, nextMapSeed } from "../shared/game.js";
import { sectors, supplies, Sector } from "../shared/battlefield.js";
import { thinkBot } from "./bots.js";
import { sanitizeInput } from "../shared/prediction.js";
import { FieldGear, gearInfo } from "../shared/gear.js";
import { HitHistory, HitPose } from "./rewind.js";
import {
  CLASSES,
  classInfo,
  validClass,
  allowedWeapon,
  classPrimary,
} from "../shared/classes.js";
import {
  KITS,
  kitCells,
  buildQuarter,
  validateKit,
} from "../shared/fortifications.js";
import { stepProjectile, blastCells } from "./explosives.js";
import {
  neighboringCells,
  detachedComponent,
  coordinates,
} from "./structures.js";
import {
  World,
  Player,
  Input,
  Mode,
  JetMode,
  WEAPONS,
  emptyInput,
  move,
  eye,
  direction,
  ray,
  rayBox,
  W,
  H,
  D,
  Vec,
  TICK,
  Projectile,
  isFirearm,
  demolitionCells,
  demolitionValue,
} from "../shared/game.js";
export type Peer = { send: (data: string) => void; close?: () => void };
export type RoomOptions = {
  name: string;
  mode: Mode;
  jet: JetMode;
  seed: number;
  limit?: number;
  duration?: number;
  target?: number;
  bots?: number;
  arsenal?: "sandbox" | "specialists";
  rewind?: boolean;
  practice?: boolean;
};
export class Room {
  world: World;
  players = new Map<string, Player>();
  peers = new Map<string, Peer>();
  fieldGear: FieldGear[] = [];
  nextGear = 1;
  emptySince = Date.now();
  time = 0;
  remaining = 300;
  phase: "waiting" | "active" | "finished" = "waiting";
  scores = [0, 0];
  winner = "";
  round = 1;
  revision = 0;
  events: any[] = [];
  projectiles: Projectile[] = [];
  nextProjectile = 0;
  collapseSeeds: number[] = [];
  demolitionOriginal = [demolitionCells(0), demolitionCells(1)];
  flags: {
    team: number;
    home: Vec;
    pos: Vec;
    carrier: string | null;
    dropped: number;
  }[] = [];
  warmup = 8;
  controlPoints: Sector[] = [];
  supplyStations = supplies();
  controlClock = 0;
  lastBroadcast = 0;
  hitHistory = new HitHistory();
  limit: number;
  duration: number;
  target: number;
  constructor(
    public id: string,
    public options: RoomOptions,
    cachedWorld?: World,
  ) {
    this.world = cachedWorld ?? new World(options.seed);
    if (options.mode === "demolition") this.prepareDemolition();
    this.limit = Math.min(32, options.limit ?? 32);
    this.duration = options.duration ?? 300;
    this.target =
      options.target ??
      (options.mode === "relay" || options.mode === "ctf"
        ? 3
        : options.mode === "frontline"
          ? 300
          : options.mode === "demolition"
            ? 100
            : 40);
    this.resetFlags();
  }
  base(team: number): Vec {
    return basePosition(team);
  }
  prepareDemolition() {
    for (const team of [0, 1]) {
      const cells = this.demolitionOriginal[team];
      const [cx, , cz] = cells[0];
      for (let x = cx; x <= cx + 8; x++)
        for (let z = cz; z <= cz + 8; z++) {
          for (let y = 1; y < 13; y++)
            this.world.blocks[x + W * (z + D * y)] = 3;
          for (let y = 13; y < 25; y++)
            this.world.blocks[x + W * (z + D * y)] = 0;
        }
      for (const [x, y, z] of cells)
        this.world.blocks[x + W * (z + D * y)] = demolitionValue(team, y);
    }
  }
  demolitionStatus() {
    return this.demolitionOriginal.map((cells, team) => ({
      team,
      total: cells.length,
      remaining: cells.filter(
        ([x, y, z]) =>
          this.world.get(x, y, z) === demolitionValue(team, y) ||
          this.world.get(x, y, z) === (team === 0 ? 7 : 8),
      ).length,
      pos: {
        x: Math.floor(this.base(team).x) + (team === 0 ? 14 : -14),
        y: 21,
        z: D / 2 + 18,
      },
    }));
  }
  queueCollapse(x: number, y: number, z: number) {
    this.collapseSeeds.push(...neighboringCells(x, y, z));
    this.collapseSeeds = [...new Set(this.collapseSeeds)].slice(-256);
  }
  collapse() {
    const seed = this.collapseSeeds.shift();
    if (seed === undefined) return;
    const cells = detachedComponent(this.world, seed);
    if (!cells.length) return;
    const edits = cells.map(
      (i) => [...coordinates(i), 0] as [number, number, number, number],
    );
    const debris = edits
      .slice(0, 24)
      .map(([x, y, z]) => ({ x, y, z, color: this.world.get(x, y, z) }));
    for (const [x, y, z] of edits) {
      this.world.set(x, y, z, 0);
      this.revision++;
    }
    this.broadcast({ type: "edits", edits, revision: this.revision });
    this.event("collapse", `${cells.length} blocks collapsed`, undefined, {
      debris,
    });
  }
  resetFlags() {
    this.controlPoints = sectors(this.world);
    this.controlClock = 0;
    this.flags = [0, 1].map((team) => ({
      team,
      home: this.base(team),
      pos: this.base(team),
      carrier: null,
      dropped: 0,
    }));
  }
  list() {
    return {
      id: this.id,
      name: this.options.name,
      mode: this.options.mode,
      jet: this.options.jet,
      arsenal: this.options.arsenal ?? "sandbox",
      seed: this.options.seed,
      map: mapTheme(this.options.seed).name,
      players: this.players.size,
      humans: [...this.players.values()].filter((p) => !p.bot).length,
      bots: [...this.players.values()].filter((p) => p.bot).length,
      npcSlots: this.options.bots ?? 0,
      max: this.limit,
      duration: this.duration,
      phase: this.phase,
    };
  }
  ensureBots() {
    const humans = [...this.players.values()].filter((p) => !p.bot).length;
    const wanted = humans
      ? Math.min(31, this.options.bots ?? 0, this.limit - humans)
      : 0;
    const bots = [...this.players.values()].filter((p) => p.bot);
    for (const p of bots.slice(wanted)) this.remove(p.id);
    for (let i = bots.length; i < wanted; i++) {
      let n = 1;
      while (this.players.has(`npc-${n}`)) n++;
      this.add(`npc-${n}`, `Scout ${n}`, { send: () => {} }, true, (n - 1) % 5);
    }
  }
  add(id: string, name: string, peer: Peer, bot = false, selectedClass = 0) {
    if (!bot && this.players.size >= this.limit) {
      const npc = [...this.players.values()].find((p) => p.bot);
      if (npc) this.remove(npc.id);
    }
    if (this.players.size >= this.limit) throw Error("Room is full");
    const counts = [0, 0];
    for (const p of this.players.values()) counts[p.team]++;
    const team = counts[0] <= counts[1] ? 0 : 1;
    const p: Player = {
      ...this.base(team),
      vx: 0,
      vy: 0,
      vz: 0,
      ground: false,
      fuel: 100,
      yaw: team === 0 ? -Math.PI / 2 : Math.PI / 2,
      pitch: 0,
      crouch: false,
      id,
      bot,
      name: name.replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 20) || "Builder",
      team,
      zombie: this.options.mode === "infection" && this.phase === "active",
      health: 100,
      dead: 0,
      kills: 0,
      deaths: 0,
      blocks: 80,
      weapon: 0,
      ammo: WEAPONS.map((w) => w.mag),
      reserve: WEAPONS.map((w) => w.reserve),
      reload: 0,
      cooldown: 0,
      editCooldown: 0,
      protected: 3,
      jetpack: false,
      input: emptyInput(),
      lastSeq: 0,
      lastDamage: 0,
      classId: validClass(selectedClass) ? selectedClass : 0,
      nextClass: validClass(selectedClass) ? selectedClass : 0,
    };
    this.players.set(id, p);
    if (!bot) {
      this.peers.set(id, peer);
      this.emptySince = 0;
    }
    this.spawn(p);
    if (!bot) this.ensureBots();
    if (!bot)
      peer.send(
        JSON.stringify({
          type: "welcome",
          id,
          room: this.list(),
          map: this.world.encode(),
          revision: this.revision,
          state: this.state(),
        }),
      );
    this.event("join", `${p.name} joined`, p.id);
    return p;
  }
  remove(id: string) {
    const removed = this.players.get(id);
    for (const f of this.flags)
      if (f.carrier === id) {
        const p = this.players.get(id);
        f.carrier = null;
        f.pos = p ? { x: p.x, y: p.y, z: p.z } : { ...f.home };
        f.dropped = Math.max(this.time, 0.000001);
      }
    this.players.delete(id);
    this.fieldGear = this.fieldGear.filter((g) => g.owner !== id);
    this.peers.delete(id);
    if (!this.peers.size) this.emptySince = Date.now();
    if (removed && !removed.bot) this.ensureBots();
  }
  input(id: string, raw: unknown) {
    const p = this.players.get(id),
      value = sanitizeInput(raw);
    if (!p || !value || value.seq <= p.lastSeq || value.seq > p.lastSeq + 10000)
      return;
    p.input = value;
    if (validClass(value.classId)) p.nextClass = value.classId;
    p.lastSeq = value.seq;
  }
  queueInputs(id: string, raw: unknown, epoch: number) {
    const p = this.players.get(id);
    if (!p || epoch !== p.epoch || !Array.isArray(raw) || raw.length > 64)
      return;
    p.commandMode = true;
    p.commands ??= [];
    p.commandSeq ??= p.lastSeq;
    for (const candidate of raw) {
      const value = sanitizeInput(candidate);
      if (!value || value.seq <= p.commandSeq) continue;
      if (value.seq !== p.commandSeq + 1 || p.commands.length >= 120) break;
      p.commands.push(value);
      p.commandSeq = value.seq;
    }
    if (p.commands.length) p.lastCommandTime = this.time;
  }
  consumeMovement(p: Player) {
    let steps = 0;
    while (
      p.commands?.length &&
      (p.movementCredit ?? 0) + 1e-8 >= TICK &&
      steps++ < 12
    ) {
      const command = p.commands.shift()!;
      p.input = command;
      p.pendingActions ??= {};
      for (const key of [
        "fire",
        "reload",
        "place",
        "dig",
        "grenade",
        "ability",
        "gear",
      ] as const)
        if (command[key]) p.pendingActions[key] = true;
      p.lastSeq = command.seq;
      if (validClass(command.classId)) p.nextClass = command.classId;
      p.movementCredit = Math.max(0, (p.movementCredit ?? 0) - TICK);
      if (p.dead <= 0) {
        const oldVy = p.vy;
        move(p, command, this.world, TICK, p.zombie, p.jetpack);
        if (oldVy < -16 && p.ground)
          this.damage(p, Math.floor((-oldVy - 13) * 4));
      }
    }
  }
  spawn(p: Player) {
    if (validClass(p.nextClass)) p.classId = p.nextClass;
    const role = classInfo(p.classId);
    p.epoch = (p.epoch ?? 0) + 1;
    p.brain = undefined;
    p.commands = [];
    p.pendingActions = {};
    p.commandSeq = 0;
    p.lastSeq = 0;
    p.movementCredit = 0;
    p.lastCommandTime = this.time;
    const b = this.base(p.zombie ? 1 : p.team);
    let spawn = { ...b };
    for (let t = 0; t < 30; t++) {
      const x = b.x + ((t % 5) - 2) * 1.5,
        z = b.z + (Math.floor(t / 5) - 2) * 1.5;
      let y = H - 3;
      while (!this.world.get(Math.floor(x), y - 1, Math.floor(z)) && y > 1) y--;
      if (
        !this.world.get(Math.floor(x), y, Math.floor(z)) &&
        !this.world.get(Math.floor(x), y + 1, Math.floor(z)) &&
        ![...this.players.values()].some(
          (v) =>
            v.id !== p.id && v.dead <= 0 && Math.hypot(v.x - x, v.z - z) < 0.85,
        )
      ) {
        spawn = { x, y: y + 0.01, z };
        break;
      }
    }
    Object.assign(p, spawn, {
      vx: 0,
      vy: 0,
      vz: 0,
      health: p.zombie ? 150 : role.health,
      dead: 0,
      fuel: 100,
      blocks: p.zombie ? 0 : role.blocks,
      weapon: p.zombie
        ? 4
        : classPrimary(p.classId, this.options.arsenal === "specialists"),
      grenades: p.zombie ? 0 : role.grenades,
      grenadeCooldown: 0,
      supplyCooldown: 0,
      supplyProgress: 0,
      abilityCooldown: 0,
      abilityTime: 0,
      gearCharges: p.zombie ? 0 : gearInfo(p.classId).charges,
      gearCooldown: 0,
      ammo: WEAPONS.map((w) => w.mag),
      reserve: WEAPONS.map((w) => w.reserve),
      reload: 0,
      cooldown: 0,
      protected: 3,
      crouch: false,
    });
    p.jetpack =
      this.options.jet === "all" ||
      (this.options.jet === "classes" && !p.zombie && p.classId === 1) ||
      (this.options.jet === "modes" && this.options.mode !== "tdm");
    if (p.zombie) p.weapon = 4;
    p.input = {
      ...emptyInput(),
      weapon: p.weapon,
      yaw: p.yaw,
      pitch: p.pitch,
      classId: p.nextClass,
    };
  }
  start() {
    this.fieldGear = [];
    this.phase = "active";
    this.remaining = this.duration;
    this.scores = [0, 0];
    this.winner = "";
    if (this.options.mode === "infection") {
      let i = 0;
      const zombies = Math.max(1, Math.floor(this.players.size / 5));
      // NPC practice starts humans as survivors; human-only rounds retain join order.
      const participants = [...this.players.values()].sort(
        (a, b) => Number(!!b.bot) - Number(!!a.bot),
      );
      for (const p of participants) {
        p.zombie = i++ < zombies;
        p.team = p.zombie ? 1 : 0;
        this.spawn(p);
      }
      this.event(
        "infection",
        "Outbreak started. Humans: survive. Zombies: infect.",
      );
    } else
      for (const p of this.players.values()) {
        p.zombie = false;
        this.spawn(p);
      }
    this.resetFlags();
  }
  end(winner: string) {
    if (this.phase === "finished") return;
    this.phase = "finished";
    this.winner = winner;
    this.remaining = 10;
    this.projectiles = [];
    this.fieldGear = [];
    this.event("victory", winner);
  }
  restart() {
    this.fieldGear = [];
    this.projectiles = [];
    this.round++;
    this.options.seed = nextMapSeed(this.options.seed, this.round);
    this.world = new World(this.options.seed);
    if (this.options.mode === "demolition") this.prepareDemolition();
    this.collapseSeeds = [];
    this.revision = 0;
    this.phase = "waiting";
    this.warmup = 8;
    this.scores = [0, 0];
    this.winner = "";
    this.remaining = this.duration;
    this.resetFlags();
    for (const p of this.players.values()) {
      p.zombie = false;
      p.kills = 0;
      p.deaths = 0;
      this.spawn(p);
    }
    this.broadcast({
      type: "map",
      map: this.world.encode(),
      revision: 0,
      seed: this.options.seed,
      round: this.round,
    });
  }
  event(kind: string, text: string, id = "", extra: any = {}) {
    this.events.push({ kind, text, id, ...extra });
  }
  broadcast(o: any) {
    const s = JSON.stringify(o);
    for (const peer of this.peers.values())
      try {
        peer.send(s);
      } catch {}
  }
  state() {
    return {
      fieldGear: this.fieldGear,
      time: this.time,
      lagCompensation: this.options.rewind === true,
      remaining: this.remaining,
      phase: this.phase,
      warmup: this.warmup,
      scores: this.scores,
      winner: this.winner,
      round: this.round,
      seed: this.options.seed,
      map: mapTheme(this.options.seed).name,
      mode: this.options.mode,
      arsenal: this.options.arsenal ?? "sandbox",
      jet: this.options.jet,
      revision: this.revision,
      humans: [...this.players.values()].filter((p) => !p.zombie).length,
      flags: this.flags,
      controlPoints: this.controlPoints,
      supplyStations: this.supplyStations,
      target: this.target,
      demolition:
        this.options.mode === "demolition" ? this.demolitionStatus() : [],
      projectiles: this.projectiles.map((p) => ({ ...p })),
      players: [...this.players.values()].map(
        ({
          input,
          brain,
          lastDamage,
          editCooldown,
          cooldown,
          pendingActions,
          commands,
          commandSeq,
          commandMode,
          movementCredit,
          lastCommandTime,
          ...p
        }) => ({
          ...p,
          npcRole:
            p.bot && this.options.mode === "ctf"
              ? (brain?.role ?? "raider")
              : undefined,
          aim: input.aim,
          thrusting: p.dead <= 0 && p.jetpack && input.jet && p.fuel > 0,
          ...Object.fromEntries(
            ["yaw", "pitch", "protected", "reload"].map((key) => [
              key,
              Math.round((p as any)[key] * 1000) / 1000,
            ]),
          ),
        }),
      ),
    };
  }
  tick(dt = TICK) {
    this.time += dt;
    if (this.players.size < 2 && this.phase !== "finished") {
      this.phase = "waiting";
      this.warmup = 8;
    } else if (this.phase === "waiting") {
      this.warmup -= dt;
      if (this.warmup <= 0) this.start();
    } else {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        if (this.phase === "finished") this.restart();
        else
          this.end(
            this.options.mode === "infection"
              ? "Humans survived"
              : this.scores[0] === this.scores[1]
                ? "Draw"
                : `${this.scores[0] > this.scores[1] ? "Azure" : "Ember"} wins`,
          );
      }
    }
    for (const p of this.players.values()) {
      if (p.bot && p.dead <= 0) {
        p.input = thinkBot(p, this);
        p.lastSeq = p.input.seq;
      }
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.editCooldown = Math.max(0, p.editCooldown - dt);
      p.protected = Math.max(0, p.protected - dt);
      p.grenadeCooldown = Math.max(0, (p.grenadeCooldown ?? 0) - dt);
      p.abilityCooldown = Math.max(0, (p.abilityCooldown ?? 0) - dt);
      p.gearCooldown = Math.max(0, (p.gearCooldown ?? 0) - dt);
      this.resupply(p, dt);
      if (p.commandMode) {
        // Retain enough real elapsed time for a delayed HTTP batch, never extra time.
        p.movementCredit = Math.min(2, (p.movementCredit ?? 0) + dt);
        this.consumeMovement(p);
        if (this.time - (p.lastCommandTime ?? 0) > 0.5) {
          p.input = {
            ...emptyInput(),
            seq: p.lastSeq,
            yaw: p.yaw,
            pitch: p.pitch,
            weapon: p.weapon,
          };
          // Do not run unacknowledged physics: replay must start at lastSeq's body.
          // Missing commands freeze movement, while combat/round clocks keep ticking.
        }
      }
      const latestInput = p.input;
      if (p.commandMode) {
        p.input = { ...p.input, ...p.pendingActions };
        p.pendingActions = {};
      }
      if (p.dead > 0) {
        p.input = latestInput;
        p.dead -= dt;
        if (p.dead <= 0) this.spawn(p);
        continue;
      }
      const oldVy = p.vy;
      if (!p.commandMode) move(p, p.input, this.world, dt, p.zombie, p.jetpack);
      if (oldVy < -16 && p.ground)
        this.damage(p, Math.floor((-oldVy - 13) * 4));
      if (p.y < 0) this.damage(p, 999);
      if (p.zombie && this.time - p.lastDamage > 4)
        p.health = Math.min(150, p.health + 8 * dt);
      if (
        this.options.jet === "pickup" &&
        !p.jetpack &&
        Math.hypot(p.x - W / 2 - 0.5, p.z - D / 2 - 0.5) < 3
      ) {
        p.jetpack = true;
        this.event("pickup", `${p.name} collected a jetpack`, p.id);
      }
      const selected = p.zombie
        ? 4
        : allowedWeapon(
              p.classId,
              p.input.weapon,
              this.options.arsenal === "specialists",
            )
          ? p.input.weapon
          : p.weapon;
      if (selected !== p.weapon) {
        p.weapon = selected;
        p.reload = 0;
      }
      if (p.reload > 0) {
        p.reload -= dt;
        if (p.reload <= 0) {
          const need = WEAPONS[p.weapon].mag - p.ammo[p.weapon],
            n = Math.min(need, p.reserve[p.weapon]);
          p.ammo[p.weapon] += n;
          p.reserve[p.weapon] -= n;
          p.reload = 0;
          this.event("reload", "Reloaded", p.id);
        }
      }
      if (
        p.input.reload &&
        !p.reload &&
        isFirearm(p.weapon) &&
        p.ammo[p.weapon] < WEAPONS[p.weapon].mag &&
        p.reserve[p.weapon] > 0
      ) {
        p.reload = WEAPONS[p.weapon].reload;
        this.event("reload", "Reloading", p.id);
      }
      if (this.phase !== "finished") {
        if (p.input.grenade) this.throwGrenade(p);
        if (p.input.ability) this.useAbility(p);
        if (p.input.gear) this.deployGear(p);
        if ((p.input.place || (p.input.fire && p.weapon === 5)) && !p.zombie)
          this.edit(p, true);
        else if (p.input.dig || (p.input.fire && p.weapon === 4))
          this.edit(p, false);
        if (p.input.fire && p.weapon !== 5) this.fire(p);
      }
      p.input = latestInput;
    }
    for (const projectile of [...this.projectiles]) {
      const old = { x: projectile.x, y: projectile.y, z: projectile.z };
      let impact = stepProjectile(projectile, this.world, dt);
      if (projectile.kind === "rocket" && !impact) {
        const delta = {
          x: projectile.x - old.x,
          y: projectile.y - old.y,
          z: projectile.z - old.z,
        };
        const length = Math.hypot(delta.x, delta.y, delta.z);
        if (length > 0) {
          const dir = {
            x: delta.x / length,
            y: delta.y / length,
            z: delta.z / length,
          };
          let nearest = Infinity;
          for (const v of this.players.values())
            if (v.id !== projectile.owner && v.dead <= 0)
              nearest = Math.min(
                nearest,
                rayBox(
                  old,
                  dir,
                  { x: v.x - 0.47, y: v.y - 0.14, z: v.z - 0.47 },
                  {
                    x: v.x + 0.47,
                    y: v.y + (v.crouch ? 1.15 : 1.75) + 0.14,
                    z: v.z + 0.47,
                  },
                ),
              );
          if (nearest <= length) {
            projectile.x = old.x + dir.x * nearest;
            projectile.y = old.y + dir.y * nearest;
            projectile.z = old.z + dir.z * nearest;
            impact = true;
          }
        }
      }
      if (impact) {
        this.projectiles = this.projectiles.filter((p) => p !== projectile);
        this.explode(projectile);
      }
    }
    if (this.phase !== "finished") {
      this.updateGear(dt);
      this.collapse();
    }
    if (this.phase === "active") {
      if (this.options.mode === "demolition") {
        const status = this.demolitionStatus();
        this.scores = status
          .map((s) => Math.round((1 - s.remaining / s.total) * 100))
          .reverse();
        const destroyed = status.find((s) => s.remaining <= s.total * 0.15);
        if (destroyed)
          this.end(
            `${destroyed.team === 0 ? "Ember" : "Azure"} demolished the enemy stronghold`,
          );
      }
      if (this.options.mode === "frontline") this.controlSectors(dt);
      if (this.options.mode === "relay" || this.options.mode === "ctf")
        this.objectives();
      if (this.options.mode === "infection") {
        const humans = [...this.players.values()].filter((p) => !p.zombie);
        if (!humans.length) this.end("Zombies win");
        else if (
          ![...this.players.values()].some((p) => p.zombie) &&
          this.players.size > 1
        ) {
          const p = [...this.players.values()][0];
          p.zombie = true;
          p.team = 1;
          this.spawn(p);
          this.event(
            "infection",
            `${p.name} became the outbreak carrier`,
            p.id,
          );
        }
      }
    }
    if (this.options.rewind)
      this.hitHistory.record(this.time, this.players.values());
    if (this.time - this.lastBroadcast >= 0.099) {
      this.lastBroadcast = this.time;
      this.broadcast({
        type: "state",
        state: this.state(),
        events: this.events.splice(0),
      });
    }
  }
  damage(victim: Player, amount: number, killer?: Player) {
    if (victim.dead > 0 || victim.protected > 0 || this.phase === "finished")
      return;
    victim.health = Math.max(0, victim.health - amount);
    victim.lastDamage = this.time;
    this.event("hit", "", killer?.id ?? "", { target: victim.id, amount });
    if (victim.health > 0) return;
    victim.dead = 3;
    victim.deaths++;
    if (killer && killer.id !== victim.id) {
      killer.kills++;
      if (this.options.mode === "tdm" && this.phase === "active") {
        this.scores[killer.team]++;
        if (this.scores[killer.team] >= this.target)
          this.end(`${killer.team === 0 ? "Azure" : "Ember"} wins`);
      }
    }
    for (const f of this.flags)
      if (f.carrier === victim.id) {
        f.carrier = null;
        f.pos = { x: victim.x, y: victim.y, z: victim.z };
        f.dropped = Math.max(this.time, 0.000001);
      }
    if (
      this.options.mode === "infection" &&
      !victim.zombie &&
      this.phase === "active"
    ) {
      victim.zombie = true;
      victim.team = 1;
      victim.weapon = 4;
      this.event("infection", `${victim.name} was infected`, victim.id);
    }
    this.event(
      "kill",
      `${killer?.name ?? "Terrain"} eliminated ${victim.name}`,
      killer?.id ?? "",
      { target: victim.id },
    );
  }
  fire(p: Player) {
    const w = WEAPONS[p.weapon];
    if (p.cooldown > 0 || p.reload > 0) return;
    if (p.weapon === 6 && this.projectiles.length >= 128) return;
    if (isFirearm(p.weapon) && p.ammo[p.weapon] <= 0) return;
    p.cooldown = w.interval;
    if (isFirearm(p.weapon)) p.ammo[p.weapon]--;
    p.protected = 0;
    const origin = eye(p),
      base = direction(p.yaw, p.pitch);
    if (p.weapon === 6) {
      this.launch(p, "rocket");
      return;
    }
    const damage = new Map<Player, number>();
    const poses = new Map<Player, HitPose>();
    for (const v of this.players.values())
      if (v.id !== p.id && v.dead <= 0 && v.team !== p.team)
        poses.set(
          v,
          this.options.rewind && !p.bot && isFirearm(p.weapon)
            ? this.hitHistory.pose(v, p.input.viewTime, this.time)
            : v,
        );
    const headshots = new Set<Player>();
    const traces: Vec[] = [];
    for (let n = 0; n < w.pellets; n++) {
      const spread =
          w.spread *
          (p.input.aim ? 0.3 : 1) *
          (p.classId === 3 && (p.abilityTime ?? 0) > 0 ? 0.35 : 1),
        d = {
          x: base.x + (Math.random() - 0.5) * spread * 2,
          y: base.y + (Math.random() - 0.5) * spread * 2,
          z: base.z + (Math.random() - 0.5) * spread * 2,
        },
        length = Math.hypot(d.x, d.y, d.z);
      d.x /= length;
      d.y /= length;
      d.z /= length;
      let distance = ray(this.world, origin, d, w.range)?.distance ?? w.range;
      let target: Player | undefined;
      for (const [v, pose] of poses) {
        const hit = rayBox(
          origin,
          d,
          { x: pose.x - 0.33, y: pose.y, z: pose.z - 0.33 },
          {
            x: pose.x + 0.33,
            y: pose.y + (pose.crouch ? 1.15 : 1.75),
            z: pose.z + 0.33,
          },
        );
        if (hit < distance) {
          distance = hit;
          target = v;
        }
      }
      if (target) {
        const head =
          isFirearm(p.weapon) &&
          origin.y + d.y * distance >=
            poses.get(target)!.y + (poses.get(target)!.crouch ? 0.9 : 1.4);
        if (head) headshots.add(target);
        damage.set(
          target,
          (damage.get(target) ?? 0) +
            w.damage *
              (p.zombie ? 1.4 : 1) *
              (head ? (p.weapon === 2 ? 1.15 : 1.5) : 1),
        );
      }
      if (isFirearm(p.weapon))
        traces.push({
          x: origin.x + d.x * distance,
          y: origin.y + d.y * distance,
          z: origin.z + d.z * distance,
        });
    }
    this.event("shot", "", p.id, {
      origin,
      dir: base,
      weapon: p.weapon,
      traces,
    });
    for (const [v, amount] of damage) this.damage(v, amount, p);
    if (headshots.size) this.event("headshot", "", p.id);
  }
  launch(p: Player, kind: "grenade" | "rocket") {
    if (this.projectiles.length >= 128) return;
    const d = direction(p.yaw, p.pitch),
      o = eye(p),
      speed = kind === "rocket" ? 24 : 13;
    const projectile: Projectile = {
      id: ++this.nextProjectile,
      owner: p.id,
      team: p.team,
      kind,
      x: o.x + d.x * 0.45,
      y: o.y + d.y * 0.45,
      z: o.z + d.z * 0.45,
      vx: d.x * speed + p.vx * 0.4,
      vy: d.y * speed + (kind === "grenade" ? 4 : 0),
      vz: d.z * speed + p.vz * 0.4,
      fuse: kind === "rocket" ? 3.8 : 2.2,
    };
    this.projectiles.push(projectile);
    p.protected = 0;
    this.event("launch", "", p.id, { projectile: { ...projectile } });
  }
  throwGrenade(p: Player) {
    if (
      p.zombie ||
      p.dead > 0 ||
      !(p.grenades ?? 0) ||
      (p.grenadeCooldown ?? 0) > 0 ||
      this.projectiles.length >= 128
    )
      return;
    p.grenades!--;
    p.grenadeCooldown = 0.8;
    this.launch(p, "grenade");
  }
  useAbility(p: Player) {
    if (p.zombie || p.dead > 0 || (p.abilityCooldown ?? 0) > 0) return;
    const role = classInfo(p.classId);
    p.abilityCooldown = role.cooldown;
    if (p.classId === 0)
      for (const v of this.players.values()) {
        if (
          v.team === p.team &&
          !v.zombie &&
          v.dead <= 0 &&
          Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z) < 8
        )
          v.health = Math.min(
            classInfo(v.classId).health,
            v.health + (v.id === p.id ? 20 : 15),
          );
      }
    else if (p.classId === 2) {
      p.blocks = Math.min(200, p.blocks + 35);
      p.grenades = Math.min(role.grenades, (p.grenades ?? 0) + 1);
      const hit = ray(this.world, eye(p), direction(p.yaw, p.pitch), 8);
      if (hit) {
        const edits: [number, number, number, number][] = [];
        for (let x = hit.x - 1; x <= hit.x + 1; x++)
          for (let y = hit.y - 1; y <= hit.y + 1; y++)
            for (let z = hit.z - 1; z <= hit.z + 1; z++) {
              if (
                x <= 0 ||
                x >= W - 1 ||
                z <= 0 ||
                z >= D - 1 ||
                y <= 0 ||
                y >= H - 1 ||
                !this.world.get(x, y, z)
              )
                continue;
              if (
                [0, 1].some((t) => {
                  const b = this.base(t);
                  return y < 15 && Math.hypot(x + 0.5 - b.x, z + 0.5 - b.z) < 3;
                })
              )
                continue;
              this.world.set(x, y, z, 0);
              this.revision++;
              this.queueCollapse(x, y, z);
              edits.push([x, y, z, 0]);
            }
        if (edits.length)
          this.broadcast({ type: "edits", edits, revision: this.revision });
        this.event("breach", `${p.name} opened a breach`, p.id, { pos: hit });
      }
    } else if (p.classId === 4) {
      const forward = direction(p.yaw, 0);
      const hit = ray(this.world, eye(p), forward, 4);
      if (hit) {
        const edits: [number, number, number, number][] = [];
        const alongX = Math.abs(forward.x) > Math.abs(forward.z),
          sign = (alongX ? forward.x : forward.z) > 0 ? 1 : -1;
        for (let depth = 0; depth < 3; depth++)
          for (let side = 0; side < 2; side++)
            for (let up = 0; up < 2; up++) {
              const x = hit.x + (alongX ? depth * sign : side),
                z = hit.z + (alongX ? side : depth * sign),
                y = Math.floor(p.y + 0.05) + up;
              if (
                x < 1 ||
                x >= W - 1 ||
                z < 1 ||
                z >= D - 1 ||
                y < 1 ||
                y >= H - 1 ||
                Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y, z + 0.5 - p.z) > 6 ||
                !this.world.get(x, y, z)
              )
                continue;
              if (
                [0, 1].some((t) => {
                  const b = this.base(t);
                  return y < 15 && Math.hypot(x + 0.5 - b.x, z + 0.5 - b.z) < 3;
                })
              )
                continue;
              this.world.set(x, y, z, 0);
              this.queueCollapse(x, y, z);
              this.revision++;
              edits.push([x, y, z, 0]);
            }
        p.blocks = Math.min(200, p.blocks + edits.length);
        if (edits.length)
          this.broadcast({ type: "edits", edits, revision: this.revision });
        this.event("breach", `${p.name} bored a tunnel`, p.id, {
          pos: hit,
          tool: "bore",
        });
      }
    } else p.abilityTime = p.classId === 1 ? 4 : 5;
    this.event("ability", `${p.name}: ${role.ability}`, p.id, {
      pos: eye(p),
      classId: p.classId,
    });
  }
  deployGear(p: Player) {
    if (
      p.zombie ||
      p.dead > 0 ||
      !p.ground ||
      this.phase !== "active" ||
      !p.gearCharges ||
      (p.gearCooldown ?? 0) > 0 ||
      this.fieldGear.length >= 32
    )
      return;
    const d = direction(p.yaw, 0),
      x = p.x + d.x * 2,
      z = p.z + d.z * 2;
    if (
      x < 1 ||
      x >= W - 1 ||
      z < 1 ||
      z >= D - 1 ||
      ray(this.world, eye(p), d, 2)
    )
      return;
    let y = Math.floor(p.y + 1);
    while (y > 0 && y >= p.y - 4 && !this.world.get(x, y, z)) y--;
    y += 1.04;
    if (
      Math.abs(y - p.y) > 4 ||
      !this.world.get(x, y - 0.1, z) ||
      this.world.get(x, y, z) ||
      this.world.get(x, y + 1, z)
    )
      return;
    if (
      [...this.players.values()].some(
        (v) =>
          v.dead <= 0 &&
          Math.hypot(v.x - x, v.z - z) < 0.65 &&
          Math.abs(v.y - y) < 2,
      )
    )
      return;
    const kind = gearInfo(p.classId).kind;
    this.fieldGear.push({
      id: this.nextGear++,
      owner: p.id,
      team: p.team,
      kind,
      x,
      y,
      z,
      life: kind === "charge" ? 3 : 45,
      armed: 2,
    });
    p.gearCharges--;
    p.gearCooldown = 1;
    p.protected = 0;
    this.event("gear", `${p.name} deployed ${gearInfo(p.classId).name}`, p.id, {
      pos: { x, y, z },
      kind,
    });
  }
  updateGear(dt: number) {
    const clearSight = (g: FieldGear, p: Player) => {
      const origin = { x: g.x, y: g.y + 0.35, z: g.z };
      const delta = {
        x: p.x - origin.x,
        y: p.y + 0.6 - origin.y,
        z: p.z - origin.z,
      };
      const length = Math.hypot(delta.x, delta.y, delta.z);
      return (
        length < 0.001 ||
        !ray(
          this.world,
          origin,
          { x: delta.x / length, y: delta.y / length, z: delta.z / length },
          Math.max(0, length - 0.1),
        )
      );
    };
    for (const g of [...this.fieldGear]) {
      g.life -= dt;
      g.armed = Math.max(0, g.armed - dt);
      const supported = this.world.get(g.x, g.y - 0.1, g.z);
      let detonate = g.kind === "charge" && g.life <= 0;
      let consumed = false;
      if (supported && g.life > 0 && g.kind === "medbox") {
        const patient = [...this.players.values()].find(
          (p) =>
            p.dead <= 0 &&
            !p.zombie &&
            p.team === g.team &&
            p.health < classInfo(p.classId).health &&
            Math.hypot(p.x - g.x, p.y - g.y, p.z - g.z) < 1.8 &&
            clearSight(g, p),
        );
        if (patient) {
          patient.health = Math.min(
            classInfo(patient.classId).health,
            patient.health + 30,
          );
          consumed = true;
          this.event("pickup", `${patient.name} used a medbox`, patient.id);
        }
      }
      if (supported && g.kind === "mine" && !g.armed && g.life > 0) {
        detonate = [...this.players.values()].some(
          (p) =>
            p.dead <= 0 &&
            p.team !== g.team &&
            Math.hypot(p.x - g.x, p.y - g.y, p.z - g.z) < 2 &&
            clearSight(g, p),
        );
      }
      if (!supported || g.life <= 0 || consumed || detonate)
        this.fieldGear = this.fieldGear.filter((v) => v.id !== g.id);
      if (detonate && supported)
        this.explode({
          id: -g.id,
          owner: g.owner,
          team: g.team,
          kind: "grenade",
          x: g.x,
          y: g.y + 0.2,
          z: g.z,
          vx: 0,
          vy: 0,
          vz: 0,
          fuse: 0,
        });
    }
  }
  explode(projectile: Projectile) {
    const pos = { x: projectile.x, y: projectile.y, z: projectile.z },
      owner = this.players.get(projectile.owner);
    for (const v of this.players.values()) {
      if (
        v.dead > 0 ||
        (v.team === projectile.team && v.id !== projectile.owner)
      )
        continue;
      const target = { x: v.x, y: v.y + 0.8, z: v.z },
        distance = Math.hypot(
          target.x - pos.x,
          target.y - pos.y,
          target.z - pos.z,
        );
      if (distance > 5.5) continue;
      const d = {
        x: (target.x - pos.x) / Math.max(0.01, distance),
        y: (target.y - pos.y) / Math.max(0.01, distance),
        z: (target.z - pos.z) / Math.max(0.01, distance),
      };
      const cover =
        distance > 0.1 && ray(this.world, pos, d, Math.max(0, distance - 0.4));
      const amount = Math.round(
        (projectile.kind === "rocket" ? 105 : 115) *
          (1 - distance / 5.5) *
          (cover ? 0.25 : 1),
      );
      if (amount > 0) this.damage(v, amount, owner);
    }
    const edits = blastCells(this.world, pos);
    for (const [x, y, z, value] of edits) {
      this.world.set(x, y, z, value);
      this.revision++;
      this.queueCollapse(x, y, z);
    }
    if (edits.length)
      this.broadcast({ type: "edits", edits, revision: this.revision });
    this.event("explosion", "", projectile.owner, {
      pos,
      projectileKind: projectile.kind,
      idProjectile: projectile.id,
    });
  }
  edit(p: Player, place: boolean) {
    if (p.editCooldown > 0 || p.dead > 0) return;
    const hit = ray(
      this.world,
      eye(p),
      direction(p.yaw, p.pitch),
      p.zombie ? 7 : 6,
    );
    if (!hit) return;
    if (place && (p.input.buildKit ?? 0) > 0 && !p.zombie) {
      this.buildKit(p, hit.previous);
      return;
    }
    const b = place ? hit.previous : hit;
    if (
      b.y <= 0 ||
      b.y >= H - 1 ||
      b.x < 1 ||
      b.x >= W - 1 ||
      b.z < 1 ||
      b.z >= D - 1
    )
      return;
    for (const t of [0, 1]) {
      const base = this.base(t);
      if (Math.hypot(b.x + 0.5 - base.x, b.z + 0.5 - base.z) < 3 && b.y < 15)
        return;
    }
    if (place) {
      if (p.blocks <= 0 || this.world.get(b.x, b.y, b.z)) return;
      for (const v of this.players.values())
        if (
          v.dead <= 0 &&
          b.x + 1 > v.x - 0.3 &&
          b.x < v.x + 0.3 &&
          b.z + 1 > v.z - 0.3 &&
          b.z < v.z + 0.3 &&
          b.y + 1 > v.y &&
          b.y < v.y + 1.75
        )
          return;
      p.blocks--;
    } else {
      if (!this.world.get(b.x, b.y, b.z)) return;
      if (!p.zombie) p.blocks = Math.min(200, p.blocks + 1);
    }
    p.editCooldown = p.zombie
      ? 0.16
      : p.classId === 4 && !place
        ? 0.08
        : this.options.arsenal === "specialists" && p.classId === 2 && !place
          ? 0.1
          : 0.22;
    this.world.set(b.x, b.y, b.z, place ? (p.team === 0 ? 7 : 8) : 0);
    if (!place) this.queueCollapse(b.x, b.y, b.z);
    this.revision++;
    this.broadcast({
      type: "edit",
      x: b.x,
      y: b.y,
      z: b.z,
      value: place ? (p.team === 0 ? 7 : 8) : 0,
      revision: this.revision,
    });
    this.event(place ? "place" : "dig", "", p.id, { pos: b });
  }
  buildKit(p: Player, anchor: Vec) {
    const id = p.input.buildKit ?? 0;
    if (
      id < 1 ||
      id >= KITS.length ||
      p.zombie ||
      p.dead > 0 ||
      p.editCooldown > 0
    )
      return;
    const cells = kitCells(id, anchor, buildQuarter(p.yaw));
    const result = validateKit(
      this.world,
      cells,
      [...this.players.values()],
      eye(p),
      p.blocks,
    );
    if (!result.valid) return;
    const value = p.team === 0 ? 7 : 8,
      edits = cells.map((b) => [b.x, b.y, b.z, value]);
    for (const b of cells) {
      this.world.set(b.x, b.y, b.z, value);
      this.revision++;
    }
    p.blocks -= result.cost;
    p.editCooldown = 0.65;
    this.broadcast({ type: "edits", edits, revision: this.revision });
    this.event("place", "", p.id, { pos: anchor, kit: id });
  }
  resupply(p: Player, dt: number) {
    p.supplyCooldown = Math.max(0, (p.supplyCooldown ?? 0) - dt);
    const role = classInfo(p.classId);
    const needs =
      p.health < role.health ||
      p.blocks < role.blocks ||
      (p.grenades ?? 0) < role.grenades ||
      (p.gearCharges ?? 0) < gearInfo(p.classId).charges ||
      WEAPONS.some(
        (w, i) =>
          isFirearm(i) && (p.ammo[i] < w.mag || p.reserve[i] < w.reserve),
      );
    const station = this.supplyStations.find(
      (s) =>
        s.team === p.team &&
        Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 3 &&
        Math.abs(p.y - s.pos.y) < 3,
    );
    if (
      p.zombie ||
      p.dead > 0 ||
      !needs ||
      !station ||
      p.supplyCooldown ||
      this.time - p.lastDamage < 4
    ) {
      p.supplyProgress = 0;
      return;
    }
    p.supplyProgress = (p.supplyProgress ?? 0) + dt;
    if (p.supplyProgress < 3) return;
    p.health = role.health;
    p.blocks = Math.max(p.blocks, role.blocks);
    p.grenades = role.grenades;
    p.gearCharges = gearInfo(p.classId).charges;
    WEAPONS.forEach((w, i) => {
      if (isFirearm(i)) {
        p.ammo[i] = w.mag;
        p.reserve[i] = w.reserve;
      }
    });
    p.reload = 0;
    p.supplyProgress = 0;
    p.supplyCooldown = 25;
    this.event("pickup", `${p.name} replenished at the supply station`, p.id);
  }
  controlSectors(dt: number) {
    for (const point of this.controlPoints) {
      const counts = [0, 0];
      for (const p of this.players.values())
        if (
          p.dead <= 0 &&
          !p.protected &&
          Math.hypot(p.x - point.pos.x, p.z - point.pos.z) < 6 &&
          Math.abs(p.y - point.pos.y) < 4
        )
          counts[p.team]++;
      point.contested = counts[0] > 0 && counts[1] > 0;
      if (point.contested) continue;
      const team = counts[0] ? 0 : counts[1] ? 1 : -1;
      if (team < 0) {
        point.progress = Math.max(0, point.progress - dt * 0.1);
        continue;
      }
      if (team === point.owner) {
        point.progress = 0;
        point.capturing = -1;
        continue;
      }
      if (point.capturing !== team) {
        point.capturing = team;
        point.progress = 0;
      }
      point.progress = Math.min(
        1,
        point.progress + (dt * Math.min(2, counts[team])) / 8,
      );
      if (point.progress >= 1) {
        point.owner = team;
        point.progress = 0;
        point.capturing = -1;
        this.event(
          "objective",
          `${team === 0 ? "Azure" : "Ember"} secured sector ${point.name}`,
        );
      }
    }
    this.controlClock += dt;
    while (this.controlClock >= 1) {
      this.controlClock--;
      for (const point of this.controlPoints)
        if (point.owner >= 0 && !point.contested) this.scores[point.owner]++;
    }
    if (this.scores.some((score) => score >= this.target))
      this.end(
        `${this.scores[0] >= this.target ? "Azure" : "Ember"} controls the frontier`,
      );
  }
  objectives() {
    const noun = this.options.mode === "ctf" ? "flag" : "relay";
    for (const f of this.flags) {
      if (f.carrier) {
        const p = this.players.get(f.carrier);
        if (p) f.pos = { x: p.x, y: p.y + 2, z: p.z };
        else {
          f.carrier = null;
          f.pos = { ...f.home };
        }
      }
      for (const p of this.players.values()) {
        if (
          p.dead > 0 ||
          Math.hypot(p.x - f.pos.x, p.y - f.pos.y, p.z - f.pos.z) > 2.5 ||
          f.carrier
        )
          continue;
        if (p.team === f.team) {
          if (f.dropped) {
            f.pos = { ...f.home };
            f.dropped = 0;
            this.event("objective", `${p.name} returned the ${noun}`);
          }
        } else {
          f.carrier = p.id;
          f.dropped = 0;
          p.protected = 0;
          this.event("objective", `${p.name} took the enemy ${noun}`);
        }
      }
      if (f.dropped && this.time - f.dropped > 25) {
        f.pos = { ...f.home };
        f.dropped = 0;
        this.event(
          "objective",
          `${f.team === 0 ? "Azure" : "Ember"} ${noun} returned home`,
        );
      }
    }
    for (const f of this.flags) {
      if (!f.carrier) continue;
      const p = this.players.get(f.carrier);
      if (!p) continue;
      const own = this.flags[p.team];
      if (
        !own.carrier &&
        !own.dropped &&
        Math.hypot(p.x - own.home.x, p.y - own.home.y, p.z - own.home.z) < 3
      ) {
        this.scores[p.team]++;
        f.carrier = null;
        f.pos = { ...f.home };
        this.event("objective", `${p.name} captured the ${noun}`);
        if (this.scores[p.team] >= this.target)
          this.end(`${p.team === 0 ? "Azure" : "Ember"} wins`);
      }
    }
  }
}

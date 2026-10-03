import { basePosition, mapTheme, nextMapSeed } from "../shared/game.js";
import { thinkBot } from "./bots.js";
import { sanitizeInput } from "../shared/prediction.js";
import { CLASSES, classInfo, validClass } from "../shared/classes.js";
import { stepProjectile, blastCells } from "./explosives.js";
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
};
export class Room {
  world: World;
  players = new Map<string, Player>();
  peers = new Map<string, Peer>();
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
  flags: {
    team: number;
    home: Vec;
    pos: Vec;
    carrier: string | null;
    dropped: number;
  }[] = [];
  warmup = 8;
  lastBroadcast = 0;
  limit: number;
  duration: number;
  target: number;
  constructor(
    public id: string,
    public options: RoomOptions,
    cachedWorld?: World,
  ) {
    this.world = cachedWorld ?? new World(options.seed);
    this.limit = Math.min(32, options.limit ?? 32);
    this.duration = options.duration ?? 300;
    this.target = options.target ?? (options.mode === "relay" ? 3 : 40);
    this.resetFlags();
  }
  base(team: number): Vec {
    return basePosition(team);
  }
  resetFlags() {
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
      seed: this.options.seed,
      map: mapTheme(this.options.seed).name,
      players: this.players.size,
      humans: [...this.players.values()].filter((p) => !p.bot).length,
      bots: [...this.players.values()].filter((p) => p.bot).length,
      npcSlots: this.options.bots ?? 0,
      max: this.limit,
      phase: this.phase,
    };
  }
  ensureBots() {
    const humans = [...this.players.values()].filter((p) => !p.bot).length;
    const wanted = humans
      ? Math.min(8, this.options.bots ?? 0, this.limit - humans)
      : 0;
    const bots = [...this.players.values()].filter((p) => p.bot);
    for (const p of bots.slice(wanted)) this.remove(p.id);
    for (let i = bots.length; i < wanted; i++) {
      let n = 1;
      while (this.players.has(`npc-${n}`)) n++;
      this.add(`npc-${n}`, `Scout ${n}`, { send: () => {} }, true, (n - 1) % 4);
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
    if (!bot) this.peers.set(id, peer);
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
        f.dropped = this.time;
      }
    this.players.delete(id);
    this.peers.delete(id);
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
      weapon: p.zombie ? 4 : role.primary,
      grenades: p.zombie ? 0 : role.grenades,
      grenadeCooldown: 0,
      abilityCooldown: 0,
      abilityTime: 0,
      ammo: WEAPONS.map((w) => w.mag),
      reserve: WEAPONS.map((w) => w.reserve),
      reload: 0,
      cooldown: 0,
      protected: 3,
      crouch: false,
    });
    p.jetpack =
      this.options.jet === "all" ||
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
    this.phase = "active";
    this.remaining = this.duration;
    this.scores = [0, 0];
    this.winner = "";
    if (this.options.mode === "infection") {
      let i = 0;
      const zombies = Math.max(1, Math.floor(this.players.size / 5));
      for (const p of this.players.values()) {
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
    this.event("victory", winner);
  }
  restart() {
    this.projectiles = [];
    this.round++;
    this.options.seed = nextMapSeed(this.options.seed, this.round);
    this.world = new World(this.options.seed);
    this.revision = 0;
    this.phase = "waiting";
    this.warmup = 8;
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
      time: this.time,
      remaining: this.remaining,
      phase: this.phase,
      warmup: this.warmup,
      scores: this.scores,
      winner: this.winner,
      round: this.round,
      seed: this.options.seed,
      map: mapTheme(this.options.seed).name,
      mode: this.options.mode,
      jet: this.options.jet,
      revision: this.revision,
      humans: [...this.players.values()].filter((p) => !p.zombie).length,
      flags: this.flags,
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
          aim: input.aim,
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
      const selected = p.zombie ? 4 : p.input.weapon;
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
        if ((p.input.place || (p.input.fire && p.weapon === 5)) && !p.zombie)
          this.edit(p, true);
        else if (p.input.dig || (p.input.fire && p.weapon === 4))
          this.edit(p, false);
        if (p.input.fire && p.weapon !== 5) this.fire(p);
      }
      p.input = latestInput;
    }
    for (const projectile of [...this.projectiles])
      if (stepProjectile(projectile, this.world, dt)) {
        this.projectiles = this.projectiles.filter((p) => p !== projectile);
        this.explode(projectile);
      }
    if (this.phase === "active") {
      if (this.options.mode === "relay") this.objectives();
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
        f.dropped = this.time;
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
      for (const v of this.players.values()) {
        if (v.id === p.id || v.dead > 0 || v.team === p.team) continue;
        const hit = rayBox(
          origin,
          d,
          { x: v.x - 0.33, y: v.y, z: v.z - 0.33 },
          { x: v.x + 0.33, y: v.y + (v.crouch ? 1.15 : 1.75), z: v.z + 0.33 },
        );
        if (hit < distance) {
          distance = hit;
          target = v;
        }
      }
      if (target)
        damage.set(
          target,
          (damage.get(target) ?? 0) + w.damage * (p.zombie ? 1.4 : 1),
        );
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
    } else p.abilityTime = p.classId === 1 ? 4 : 5;
    this.event("ability", `${p.name}: ${role.ability}`, p.id, {
      pos: eye(p),
      classId: p.classId,
    });
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
    p.editCooldown = p.zombie ? 0.16 : 0.22;
    this.world.set(b.x, b.y, b.z, place ? (p.team === 0 ? 7 : 8) : 0);
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
  objectives() {
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
            this.event("objective", `${p.name} returned the relay`);
          }
        } else {
          f.carrier = p.id;
          f.dropped = 0;
          p.protected = 0;
          this.event("objective", `${p.name} took the enemy relay`);
        }
      }
      if (f.dropped && this.time - f.dropped > 25) {
        f.pos = { ...f.home };
        f.dropped = 0;
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
        this.event("objective", `${p.name} delivered a relay`);
        if (this.scores[p.team] >= this.target)
          this.end(`${p.team === 0 ? "Azure" : "Ember"} wins`);
      }
    }
  }
}

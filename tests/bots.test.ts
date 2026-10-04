import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { World, W, D, idx, emptyInput } from "../shared/game.js";
function room(
  mode: "tdm" | "relay" | "infection" = "tdm",
  bots = 2,
  limit = 8,
) {
  const world = new World(1, false);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) world.blocks[idx(x, 0, z)] = 3;
  return new Room(
    "bots",
    { name: "Bots", mode, jet: "all", seed: 1, bots, limit },
    world,
  );
}
test("NPC option fills room only when humans join and permits replacing NPC slots", () => {
  const r = room("tdm", 4, 4);
  assert.equal(r.players.size, 0);
  const human = r.add("human", "Human", { send: () => {} });
  assert.equal(r.players.size, 4);
  assert.equal([...r.players.values()].filter((p) => p.bot).length, 3);
  const second = r.add("second", "Second", { send: () => {} });
  assert.equal(r.players.size, 4);
  assert.equal(r.peers.size, 2);
  assert.equal(r.state().players.filter((p) => p.bot).length, 2);
  r.remove(human.id);
  assert.equal([...r.players.values()].filter((p) => p.bot).length, 3);
  r.remove(second.id);
  assert.equal(r.players.size, 0);
});
test("NPCs move, shoot through authority, reload, die, respawn and synchronize with a human client", () => {
  const r = room("tdm", 1);
  const packets: any[] = [];
  const human = r.add("human", "Human", {
    send: (s) => packets.push(JSON.parse(s)),
  });
  const bot = [...r.players.values()].find((p) => p.bot)!;
  Object.assign(human, { x: 80, y: 1.01, z: 80, ground: true, protected: 0 });
  Object.assign(bot, { x: 80, y: 1.01, z: 100, ground: true, protected: 0 });
  r.phase = "active";
  const first = bot.z;
  for (let n = 0; n < 75; n++) r.tick();
  assert.ok(
    human.health < 100 || human.dead > 0 || human.deaths > 0,
    "bot hit uses Room.fire damage",
  );
  assert.notEqual(bot.z, first);
  assert.ok(bot.ammo[0] < 24);
  bot.ammo[0] = 0;
  bot.cooldown = 0;
  bot.reload = 0;
  bot.brain = undefined;
  r.tick();
  assert.ok(bot.reload > 0);
  for (let n = 0; n < 60; n++) r.tick();
  assert.ok(bot.ammo[0] > 0);
  r.damage(bot, 999, human);
  assert.ok(bot.dead > 0);
  const epoch = bot.epoch!;
  for (let n = 0; n < 95; n++) r.tick();
  assert.equal(bot.dead, 0);
  assert.ok(bot.epoch! > epoch);
  assert.ok(
    packets.some(
      (p) => p.type === "state" && p.state.players.some((v: any) => v.bot),
    ),
  );
  assert.ok(r.state().players.every((p) => !("brain" in p)));
});
test("NPCs obey terrain occlusion and share infection and relay rules", () => {
  const r = room("tdm", 1),
    human = r.add("h", "Human", { send: () => {} }),
    bot = [...r.players.values()].find((p) => p.bot)!;
  Object.assign(human, { x: 80, y: 1.01, z: 80, ground: true, protected: 0 });
  Object.assign(bot, { x: 80, y: 1.01, z: 100, ground: true, protected: 0 });
  for (let x = 75; x < 85; x++)
    for (let y = 1; y < 8; y++) r.world.set(x, y, 90, 3);
  r.phase = "active";
  for (let n = 0; n < 15; n++) r.tick();
  assert.equal(human.health, 100);
  const infection = room("infection", 1);
  const survivor = infection.add("h", "Human", { send: () => {} });
  const infected = [...infection.players.values()].find((p) => p.bot)!;
  infection.phase = "active";
  infected.zombie = true;
  infected.team = 1;
  infection.spawn(infected);
  Object.assign(infected, {
    x: 80,
    y: 1.01,
    z: 81,
    ground: true,
    protected: 0,
  });
  Object.assign(survivor, {
    x: 80,
    y: 1.01,
    z: 80,
    ground: true,
    protected: 0,
    health: 30,
    team: 0,
  });
  for (let n = 0; n < 30; n++) infection.tick();
  assert.equal(survivor.zombie, true);
  const relay = room("relay", 1);
  relay.add("h", "Human", { send: () => {} });
  const runner = [...relay.players.values()].find((p) => p.bot)!;
  relay.phase = "active";
  runner.protected = 0;
  const enemy = relay.flags[1 - runner.team];
  Object.assign(runner, enemy.home);
  relay.objectives();
  assert.equal(enemy.carrier, runner.id);
  Object.assign(runner, relay.flags[runner.team].home);
  relay.objectives();
  assert.equal(relay.scores[runner.team], 1);
});

test("eight-a-side practice fills fifteen NPCs, yields a human slot, and refills without crowding spawns", () => {
  const r = room("tdm", 15, 16);
  const h = r.add("h", "Human", { send() {} });
  assert.equal(r.players.size, 16);
  assert.deepEqual(
    [0, 1].map(
      (team) => [...r.players.values()].filter((p) => p.team === team).length,
    ),
    [8, 8],
  );
  const peer = r.add("peer", "Friend", { send() {} });
  assert.equal(r.players.size, 16);
  assert.equal([...r.players.values()].filter((p) => p.bot).length, 14);
  for (const p of r.players.values())
    for (const other of r.players.values()) {
      if (p.id !== other.id && Math.abs(p.y - other.y) < 1)
        assert.ok(Math.hypot(p.x - other.x, p.z - other.z) >= 0.85);
    }
  for (let i = 0; i < 120; i++) r.tick();
  assert.ok(r.state().players.every((p) => Number.isFinite(p.x + p.y + p.z)));
  r.remove(peer.id);
  assert.equal(r.players.size, 16);
  r.remove(h.id);
  assert.equal(r.players.size, 0);
});
test("dedicated room NPC capacity respects a configured 32-player ceiling", () => {
  const r = room("tdm", 999, 32);
  r.add("h", "Human", { send() {} });
  assert.equal(r.players.size, 32);
  assert.equal([...r.players.values()].filter((p) => p.bot).length, 31);
});

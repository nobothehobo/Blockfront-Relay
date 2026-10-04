import test from "node:test";
import assert from "node:assert/strict";
import {
  World,
  MAP_PRESETS,
  basePosition,
  collides,
  ray,
  eye,
  emptyInput,
} from "../shared/game.js";
import { battleRoutes, routeField } from "../shared/layout.js";
import { sectors } from "../shared/battlefield.js";
import { approachWaypoint } from "../server/approaches.js";
import { Room } from "../server/room.js";
import { walkHeight } from "../server/navigation.js";

test("all three approaches have continuous supported headroom in every map family and varied seeds", () => {
  for (const seed of [...MAP_PRESETS.map((p) => p.seed), 1, 19, 7280, 7295]) {
    const world = new World(seed),
      field = routeField(seed);
    for (const route of battleRoutes(seed))
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1],
          b = route.points[i],
          steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 3);
        let old = field[Math.floor(a.x) + 320 * Math.floor(a.z)];
        for (let n = 0; n <= steps; n++) {
          const t = n / steps,
            x = Math.floor(a.x + (b.x - a.x) * t) + 0.5,
            z = Math.floor(a.z + (b.z - a.z) * t) + 0.5;
          const height = walkHeight(world, x, z, old + 0.01);
          assert.notEqual(
            height,
            null,
            `walkable ${seed}:${route.name}:${x},${z}`,
          );
          const feet = Math.round(height!);
          assert.ok(
            world.get(x, feet - 1, z),
            `support ${seed}:${route.name}:${x},${z}`,
          );
          assert.equal(
            collides(world, x, feet + 0.01, z),
            false,
            `headroom ${seed}:${route.name}:${x},${z}`,
          );
          assert.ok(
            Math.abs(feet - old) <= 1,
            "each sampled ascent is at most one voxel",
          );
          old = feet;
        }
      }
    for (const point of sectors(world))
      assert.equal(
        collides(world, point.pos.x, point.pos.y + 0.01, point.pos.z),
        false,
        "objectives stand on accessible planned routes",
      );
  }
});

test("approach screens stop spawn-to-spawn sightlines while separate routes branch to either side", () => {
  for (const { seed } of MAP_PRESETS) {
    const world = new World(seed),
      a = basePosition(0),
      b = basePosition(1),
      origin = { ...a, y: a.y + 1.55 };
    assert.ok(
      ray(world, origin, { x: 1, y: 0, z: 0 }, b.x - a.x),
      "old direct sightline is obstructed",
    );
    const routes = battleRoutes(seed);
    assert.ok(routes[0].points.some((p) => p.z < 140));
    assert.ok(routes[2].points.some((p) => p.z > 180));
    for (const route of routes) {
      const length = route.points
        .slice(1)
        .reduce(
          (sum, p, i) =>
            sum + Math.hypot(p.x - route.points[i].x, p.z - route.points[i].z),
          0,
        );
      assert.ok(
        length > (b.x - a.x) * 1.1,
        "route contains meaningful turns rather than a straight lane",
      );
    }
    assert.deepEqual(
      world.blocks,
      new World(seed).blocks,
      "layouts remain seeded and deterministic",
    );
  }
});

test("NPCs can use each strategic lane in both directions without overriding movement authority", () => {
  for (const { seed } of MAP_PRESETS) {
    const r = new Room("lanes", {
      name: "Lanes",
      mode: "ctf",
      seed,
      jet: "off",
    });
    const p = r.add("npc", "NPC", { send: () => {} }, true);
    for (const lane of [0, 1, 2]) {
      Object.assign(p, basePosition(0));
      p.brain = {
        nextThink: 0,
        lastX: p.x,
        lastZ: p.z,
        stuck: 0,
        target: "",
        acquired: 0,
      };
      const before = eye(p),
        command = { ...p.input };
      const next = approachWaypoint(p, r.world, basePosition(1), lane);
      assert.equal(p.brain.approach?.lane, lane);
      assert.ok(Math.hypot(next.x - p.x, next.z - p.z) > 3);
      assert.deepEqual(eye(p), before);
      assert.deepEqual(p.input, command);
      Object.assign(p, basePosition(1));
      p.brain.approach = undefined;
      const back = approachWaypoint(p, r.world, basePosition(0), lane);
      assert.deepEqual(back, battleRoutes(seed)[lane].points.at(-2));
    }
  }
});

test("a lone NPC actually steals and returns a flag through each redesigned map without teleporting", () => {
  for (const { seed } of MAP_PRESETS) {
    const r = new Room("runner", {
      name: "Runner",
      mode: "ctf",
      seed,
      jet: "off",
      bots: 1,
      duration: 600,
    });
    const human = r.add("friendly", "Friendly", { send: () => {} });
    const bot = [...r.players.values()].find((p) => p.bot)!;
    human.team = bot.team = 0;
    human.dead = 1000;
    Object.assign(bot, basePosition(0), {
      ground: true,
      protected: 0,
      yaw: -Math.PI / 2,
      input: emptyInput(),
    });
    bot.brain = undefined;
    r.phase = "active";
    r.remaining = 600;
    let last = { x: bot.x, z: bot.z };
    for (let i = 0; i < 5400 && r.scores[0] === 0; i++) {
      r.tick();
      assert.ok(
        Math.hypot(bot.x - last.x, bot.z - last.z) < 1,
        "no teleport or recovery relocation",
      );
      last = { x: bot.x, z: bot.z };
    }
    assert.ok(
      r.scores[0] > 0,
      `autonomous foot capture on ${seed}: ${JSON.stringify({ x: bot.x, z: bot.z, brain: r.players.get(bot.id)?.brain })}`,
    );
  }
});

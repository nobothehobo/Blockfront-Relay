import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { atmosphere, DAY_SECONDS } from "../shared/environment.js";
import { CITY_SEED, CITY_LIGHTS } from "../shared/city.js";
import { World, collides, palette, basePosition } from "../shared/game.js";
import { sectors, supplies } from "../shared/battlefield.js";
import { Room } from "../server/room.js";
import { meshChunk } from "../client/mesh.js";
import { NeonView } from "../client/neon-view.js";
import { WaterSurface } from "../client/battlefield-view.js";

test("six-minute room-time cycle repeats smoothly through noon, dusk, night and dawn", () => {
  assert.equal(DAY_SECONDS, 360);
  assert.equal(atmosphere(7231, 0).day, 1);
  assert.equal(atmosphere(7231, 180).day, 0);
  assert.ok(atmosphere(7231, 90).twilight > 0.99);
  assert.ok(atmosphere(7231, 270).twilight > 0.99);
  for (const t of [0, 45, 90, 180, 270, 359]) {
    const a = atmosphere(7231, t),
      b = atmosphere(7231, t + 360);
    assert.ok(Math.abs(a.phase - b.phase) < 1e-10);
    const adjacent = atmosphere(7231, t + 0.01);
    assert.ok(Math.abs(a.day - adjacent.day) < 0.002);
    assert.equal(a.night + a.day, 1);
  }
  assert.equal(atmosphere(7231, -5).phase, 0.25);
});

test("water receives the same sky phase without an extra rendering pass", () => {
  const water = new WaterSurface(),
    sky = new THREE.Color(0x303e5b);
  water.atmosphere(0, sky);
  assert.equal(water.material.uniforms.daylight.value, 0);
  assert.ok(water.material.uniforms.skyTint.value.equals(sky));
  water.atmosphere(1, sky);
  assert.equal(water.material.uniforms.daylight.value, 1);
  assert.equal(water.mesh.children.length, 0);
  water.mesh.geometry.dispose();
  water.material.dispose();
});

test("city is locked to midnight and late joins receive the authoritative sky clock", () => {
  const room = new Room("night", {
    name: "Night",
    mode: "ctf",
    jet: "off",
    seed: CITY_SEED,
  });
  room.time = 183.5;
  let welcome: any;
  room.add("late", "Late", {
    send: (s) => {
      welcome = JSON.parse(s);
    },
  });
  assert.deepEqual(welcome.state.atmosphere, atmosphere(CITY_SEED, room.time));
  for (const t of [0, 90, 180, 270, 360, 9000]) {
    assert.equal(atmosphere(CITY_SEED, t).phase, 0.75);
    assert.equal(atmosphere(CITY_SEED, t).day, 0);
    assert.equal(atmosphere(CITY_SEED, t).locked, true);
  }
});

test("city lanes, doorways and supported bridge stairs have walkable headroom", () => {
  const world = new World(CITY_SEED);
  for (const p of [
    ...[0, 1].map(basePosition),
    ...supplies().map((s) => s.pos),
    ...sectors(world).map((s) => s.pos),
  ])
    assert.equal(
      collides(world, p.x, p.y, p.z),
      false,
      "accessible objectives and supplies",
    );
  for (let x = 1; x < 319; x++) {
    assert.ok(world.get(x, 12, 160), "continuous road surface");
    assert.equal(
      collides(world, x + 0.5, 13.01, 160.5),
      false,
      "clear central lane",
    );
  }
  for (const cx of [40, 88, 136, 184, 232, 280])
    for (const cz of [48, 96, 128, 192, 224, 272])
      for (let z = cz - 11; z <= cz + 11; z++)
        assert.equal(
          collides(world, cx + 0.5, 13.01, z + 0.5),
          false,
          "open interior route",
        );
  for (const x of [116, 204]) {
    for (let step = 0; step < 9; step++) {
      assert.ok(world.get(x - 11 + step, 13 + step, 148));
      assert.equal(
        collides(world, x - 10.5 + step, 14.01 + step, 148.5),
        false,
      );
    }
    assert.equal(
      collides(world, x - 1.5, 22.01, 148.5),
      false,
      "open bridge landing",
    );
  }
  assert.ok(world.blocks.every((v) => v < palette.length));
});

test("emissive terrain is batched and every vertex has an emission value", () => {
  const world = new World(0, false);
  world.set(4, 13, 4, 22);
  world.set(7, 13, 7, 27);
  const geometry = meshChunk(world, 0, 0);
  const emission = geometry.getAttribute("emission");
  assert.equal(emission.count, geometry.getAttribute("position").count);
  assert.ok([...emission.array].some((v) => v > 0));
  assert.ok([...emission.array].some((v) => v === 0));
  assert.ok(geometry.getIndex()!.count < 100);
  geometry.dispose();
});

test("street lights are capped, shadowless, switch off on mobile and follow destruction", () => {
  const scene = new THREE.Scene(),
    view = new NeonView(scene),
    world = new World(CITY_SEED);
  const p = CITY_LIGHTS[0],
    position = new THREE.Vector3(p.x, 14, p.z);
  view.update(world, position, true, 0);
  assert.equal(view.lights.length, 2);
  assert.ok(view.lights.some((l) => l.intensity > 0));
  assert.ok(view.lights.every((l) => !l.castShadow));
  world.set(p.x, p.y, p.z, 0);
  view.update(world, position, true, 251);
  assert.ok(
    !view.lights.some(
      (l) =>
        l.intensity > 0 &&
        l.position.x === p.x + 0.5 &&
        l.position.z === p.z + 0.5,
    ),
  );
  view.update(world, position, false, 252);
  assert.ok(view.lights.every((l) => !l.visible));
  world.seed = 7231;
  view.update(world, position, true, 503);
  assert.ok(view.lights.every((l) => !l.visible));
});

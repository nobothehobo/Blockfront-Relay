import { Room } from "../server/room.js";
import { World, emptyInput, TICK } from "../shared/game.js";
for (const count of [16, 32]) {
  const start = performance.now();
  const room = new Room("bench", {
    name: "Bench",
    mode: "tdm",
    jet: "all",
    seed: 7231,
    limit: count,
  });
  const generate = performance.now() - start;
  for (let i = 0; i < count; i++)
    room.add(String(i), `Player ${i}`, { send: () => {} });
  room.phase = "active";
  room.remaining = 3600;
  const times: number[] = [];
  for (let n = 0; n < 900; n++) {
    for (const p of room.players.values())
      room.queueInputs(
        p.id,
        [
          {
            ...emptyInput(),
            seq: n + 1,
            forward: n % 100 < 50 ? 1 : -1,
            yaw: p.team === 0 ? -Math.PI / 2 : Math.PI / 2,
            jet: n % 180 < 20,
          },
        ],
        p.epoch!,
      );
    const tick = performance.now();
    room.tick(TICK);
    times.push(performance.now() - tick);
  }
  times.sort((a, b) => a - b);
  const clone = new World(room.options.seed, false);
  const cached = performance.now();
  for (let n = 0; n < 100; n++) clone.blocks.set(room.world.blocks);
  console.log(
    JSON.stringify({
      players: count,
      mapGenerationMs: +generate.toFixed(2),
      cachedTerrainCopyMs: +((performance.now() - cached) / 100).toFixed(2),
      tickMeanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
      tickP95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2),
      tickMaxMs: +times.at(-1)!.toFixed(2),
      snapshotBytes: Buffer.byteLength(JSON.stringify(room.state())),
      mapJoinBytes: Buffer.byteLength(JSON.stringify(room.world.encode())),
    }),
  );
}

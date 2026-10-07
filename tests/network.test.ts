import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { emptyInput, World } from "../shared/game.js";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
test(
  "real WebSocket clients replicate movement, jetpack, edits, damage, death and respawn",
  { timeout: 20000 },
  async () => {
    const port = 3102,
      child = spawn(process.execPath, ["dist/node/index.js"], {
        env: { ...process.env, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      });
    await new Promise<void>((resolve, reject) => {
      child.stdout.on("data", (s) => {
        if (String(s).includes("listening")) resolve();
      });
      child.on("exit", () => reject(Error("Server failed")));
    });
    let a: WebSocket | undefined,
      b: WebSocket | undefined,
      c: WebSocket | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const packetsA: any[] = [],
        packetsB: any[] = [];
      // The marksman combat check must use a class that actually owns that gun.
      a = new WebSocket(`ws://127.0.0.1:${port}/ws?room=valley&name=NetA&class=3`);
      b = new WebSocket(`ws://127.0.0.1:${port}/ws?room=valley&name=NetB`);
      a.on("message", (s) => packetsA.push(JSON.parse(String(s))));
      b.on("message", (s) => packetsB.push(JSON.parse(String(s))));
      const until = async (predicate: () => boolean, ms = 5000) => {
        const start = Date.now();
        while (!predicate()) {
          if (Date.now() - start > ms)
            throw Error("Timed out waiting for synchronized state");
          await delay(30);
        }
      };
      await until(
        () =>
          packetsA.some((p) => p.type === "welcome") &&
          packetsB.some((p) => p.type === "welcome"),
      );
      const idA = packetsA[0].id,
        idB = packetsB[0].id;
      const get = (packets: any[], id: string) =>
        [...packets]
          .reverse()
          .find((p) => p.type === "state")
          ?.state.players.find((p: any) => p.id === id);
      let seqA = 0,
        seqB = 0,
        activeA: any = emptyInput(),
        activeB: any = emptyInput(),
        tracking = false;
      const sendA = (input: any) => {
        activeA = { ...emptyInput(), ...input };
        a!.send(
          JSON.stringify({ type: "input", input: { ...activeA, seq: ++seqA } }),
        );
      };
      const sendB = (input: any) => {
        activeB = { ...emptyInput(), ...input };
        b!.send(
          JSON.stringify({ type: "input", input: { ...activeB, seq: ++seqB } }),
        );
      };
      heartbeat = setInterval(() => {
        if (tracking) {
          const pa = get(packetsA, idA),
            pb = get(packetsA, idB);
          if (pa && pb) {
            activeA.yaw = Math.atan2(-(pb.x - pa.x), -(pb.z - pa.z));
            activeA.pitch = Math.atan2(
              pb.y + 1.15 - pa.y - 1.55,
              Math.hypot(pb.x - pa.x, pb.z - pa.z),
            );
          }
        }
        if (a?.readyState === WebSocket.OPEN) sendA(activeA);
        if (b?.readyState === WebSocket.OPEN) sendB(activeB);
      }, 50);
      sendA({ forward: 1, yaw: -Math.PI / 2 });
      await delay(650);
      sendA({ yaw: -Math.PI / 2, pitch: -0.4, dig: true });
      await until(() =>
        packetsB.some((p) => p.type === "edit" && p.value === 0),
      );
      const broken = packetsB.find((p) => p.type === "edit" && p.value === 0);
      sendA({ yaw: -Math.PI / 2, pitch: -0.4 });
      await delay(300);
      sendA({ yaw: -Math.PI / 2, pitch: -0.4, place: true });
      await until(() =>
        packetsB.some((p) => p.type === "edit" && p.value !== 0),
      );
      sendA({ yaw: -Math.PI / 2 });
      const placed = packetsB.find((p) => p.type === "edit" && p.value !== 0);
      let welcome: any;
      c = new WebSocket(`ws://127.0.0.1:${port}/ws?room=valley&name=Late`);
      c.on("message", (s) => {
        const p = JSON.parse(String(s));
        if (p.type === "welcome") welcome = p;
      });
      await until(() => !!welcome);
      const lateWorld = new World(0, false);
      lateWorld.decode(welcome.map);
      assert.equal(lateWorld.get(placed.x, placed.y, placed.z), placed.value);
      c.close();
      await delay(300);
      // Launch both players above the bastions along the same sightline; the server owns their trajectories.
      sendA({ yaw: -Math.PI / 2, forward: 1, sprint: true, jet: true });
      sendB({ yaw: Math.PI / 2, forward: 1, sprint: true, jet: true });
      await delay(2200);
      assert.ok(get(packetsB, idA).fuel < 50, "Remote fuel replicates");
      assert.ok(get(packetsB, idA).x > 20, "Remote movement replicates");
      tracking = true;
      sendA({ yaw: -Math.PI / 2, fire: true, jet: true, weapon: 3, aim: true });
      sendB({ yaw: Math.PI / 2, jet: true });
      await until(() => get(packetsB, idB)?.health < 100, 5000);
      await until(() => get(packetsB, idB)?.dead > 0, 5000);
      await until(() => get(packetsA, idB)?.health === 0);
      tracking = false;
      sendA({ yaw: -Math.PI / 2 });
      sendB({ yaw: Math.PI / 2 });
      await until(
        () =>
          get(packetsB, idB)?.dead === 0 && get(packetsB, idB)?.health === 100,
        5000,
      );
      assert.ok(
        packetsA.some(
          (p) =>
            p.type === "state" && p.events?.some((e: any) => e.kind === "kill"),
        ),
      );
      console.log(
        "Verified two real WebSocket clients: terrain replication, late-join map, jetpack, combat, death and respawn",
      );
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      a?.close();
      b?.close();
      c?.close();
      child.kill("SIGTERM");
    }
  },
);

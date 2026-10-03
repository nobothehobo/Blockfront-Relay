import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { emptyInput } from "../shared/game.js";
test(
  "32 actual WebSocket connections receive acknowledged authoritative movement snapshots",
  { timeout: 20000 },
  async () => {
    const child = spawn(process.execPath, ["dist/node/index.js"], {
      env: { ...process.env, PORT: "3103" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const sockets: WebSocket[] = [];
    const players: {
      socket: WebSocket;
      id: string;
      epoch: number;
      seq: number;
      ack: number;
      states: number;
    }[] = [];
    let interval: ReturnType<typeof setInterval> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.on("data", (d) => {
          if (String(d).includes("listening")) resolve();
        });
        child.on("exit", () => reject(Error("Server exited")));
      });
      await Promise.all(
        Array.from(
          { length: 32 },
          (_, i) =>
            new Promise<void>((resolve, reject) => {
              const socket = new WebSocket(
                `ws://127.0.0.1:3103/ws?room=valley&name=Load${i}`,
              );
              sockets.push(socket);
              socket.on("error", reject);
              socket.on("message", (raw) => {
                const msg = JSON.parse(String(raw));
                if (msg.type === "welcome") {
                  players.push({
                    socket,
                    id: msg.id,
                    epoch: msg.state.players.find((p: any) => p.id === msg.id)
                      .epoch,
                    seq: 0,
                    ack: 0,
                    states: 0,
                  });
                  resolve();
                }
                if (msg.type === "state") {
                  const self = players.find((p) => p.socket === socket);
                  if (!self) return;
                  const p = msg.state.players.find(
                    (p: any) => p.id === self.id,
                  );
                  self.ack = p.lastSeq;
                  self.states++;
                }
              });
            }),
        ),
      );
      interval = setInterval(() => {
        for (const p of players)
          p.socket.send(
            JSON.stringify({
              type: "input",
              epoch: p.epoch,
              commands: [
                { ...emptyInput(), seq: ++p.seq, yaw: 0.3, strafe: 0.3 },
              ],
            }),
          );
      }, 34);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      assert.equal(players.length, 32);
      assert.ok(players.every((p) => p.ack > 20 && p.states >= 5));
      console.log(
        "Verified 32 connected WebSocket clients, with movement acknowledgments and state delivery to every client",
      );
    } finally {
      if (interval) clearInterval(interval);
      sockets.forEach((s) => s.close());
      child.kill("SIGTERM");
    }
  },
);

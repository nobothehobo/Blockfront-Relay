import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { Room, RoomOptions } from "./room.js";
import { randomUUID } from "node:crypto";
const rooms = new Map<string, Room>();
for (const [id, mode, jet] of [
  ["valley", "tdm", "all"],
  ["relay", "relay", "pickup"],
  ["outbreak", "infection", "modes"],
] as const)
  rooms.set(
    id,
    new Room(id, {
      name:
        mode === "tdm"
          ? "Copperwater Skirmish"
          : mode === "relay"
            ? "Relay Runners"
            : "Nightfall Outbreak",
      mode,
      jet,
      seed: 7231,
    }),
  );
const origins = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);
const root = path.resolve("dist/client");
const app = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? "";
  if (origins.length && origin && !origins.includes(origin)) {
    res.writeHead(403);
    return res.end("Origin denied");
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const json = (status: number, o: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(o));
  };
  if (url.pathname === "/api/rooms")
    return json(
      200,
      [...rooms.values()].map((r) => r.list()),
    );
  if (url.pathname === "/api/health")
    return json(200, {
      ok: true,
      rooms: rooms.size,
      players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0),
    });
  if (url.pathname === "/api/create" && req.method === "POST") {
    if (rooms.size >= 8) return json(429, { error: "Room limit reached" });
    let body = "";
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) throw Error("Request too large");
      }
      const o = JSON.parse(body);
      if (
        !["tdm", "relay", "infection"].includes(o.mode) ||
        !["off", "all", "pickup", "modes", "classes"].includes(o.jet) ||
        (o.arsenal !== undefined &&
          !["sandbox", "specialists"].includes(o.arsenal))
      )
        throw Error("Invalid settings");
      const id = randomUUID().slice(0, 8),
        options: RoomOptions = {
          name: String(o.name || "Custom match").slice(0, 30),
          mode: o.mode,
          jet: o.jet,
          arsenal: o.arsenal ?? "sandbox",
          seed: Number.isInteger(o.seed) ? o.seed : Date.now() >>> 0,
          limit: Math.max(2, Math.min(32, Number(o.limit) || 32)),
          bots: Math.max(0, Math.min(8, Number(o.bots) || 0)) | 0,
          duration: Math.max(120, Math.min(900, Number(o.duration) || 300)),
        };
      rooms.set(id, new Room(id, options));
      return json(201, { id });
    } catch {
      return json(400, { error: "Invalid room request" });
    }
  }
  if (url.pathname.startsWith("/api/"))
    return json(404, { error: "Not found" });
  try {
    const filename = path.resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!filename.startsWith(root + path.sep)) throw Error("Invalid path");
    const file = await readFile(filename);
    const mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".json": "application/json",
    };
    res.writeHead(200, {
      "Content-Type":
        mime[path.extname(filename)] ?? "application/octet-stream",
      "Cache-Control": filename.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Build client first: npm run build");
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
app.on("upgrade", (req, socket, head) => {
  const origin = req.headers.origin ?? "";
  if (origins.length && !origins.includes(origin)) {
    socket.destroy();
    return;
  }
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`),
    r = rooms.get(url.searchParams.get("room") ?? "valley");
  if (
    url.pathname !== "/ws" ||
    !r ||
    (r.players.size >= r.limit &&
      ![...r.players.values()].some((p) => p.bot)) ||
    wss.clients.size >= 128
  ) {
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const id = randomUUID();
    let messages = 0,
      windowStart = Date.now(),
      lastInput = Date.now();
    r.add(
      id,
      url.searchParams.get("name") ?? "Builder",
      {
        send: (data) => {
          if (
            ws.readyState === WebSocket.OPEN &&
            ws.bufferedAmount < 512 * 1024
          )
            ws.send(data);
          else if (ws.bufferedAmount >= 512 * 1024)
            ws.close(1013, "Slow connection");
        },
      },
      false,
      Number(url.searchParams.get("class") ?? 0),
    );
    ws.on("message", (data) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        messages = 0;
      }
      if (++messages > 90) {
        ws.close(1008, "Input rate exceeded");
        return;
      }
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === "input") {
          if (msg.commands) r.queueInputs(id, msg.commands, msg.epoch);
          else r.input(id, msg.input);
          lastInput = now;
        } else if (msg.type === "ping")
          ws.send(JSON.stringify({ type: "pong", at: msg.at }));
      } catch {
        ws.close(1008, "Invalid message");
      }
    });
    const timeout = setInterval(() => {
      if (Date.now() - lastInput > 1500) {
        const p = r.players.get(id);
        if (p)
          p.input = {
            ...p.input,
            forward: 0,
            strafe: 0,
            fire: false,
            jet: false,
            place: false,
            dig: false,
            jump: false,
          };
      }
      if (Date.now() - lastInput > 60000) ws.close(1001, "Idle");
    }, 1000);
    ws.on("close", () => {
      clearInterval(timeout);
      r.remove(id);
    });
    ws.on("error", () => {});
  });
});
setInterval(() => {
  for (const r of rooms.values()) r.tick();
}, 1000 / 30);
app.listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST ?? "0.0.0.0",
  () =>
    console.log(`Blockfront Relay listening on :${process.env.PORT ?? 3000}`),
);
process.on("SIGTERM", () => {
  for (const ws of wss.clients) ws.close(1001, "Server restarting");
  app.close(() => process.exit(0));
});

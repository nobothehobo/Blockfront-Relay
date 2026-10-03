// Local test harness for the hosted Worker. Never shipped as the production Node server.
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../worker/index.js";
const database = new DatabaseSync(":memory:");
database.exec(readFileSync("drizzle/0000_blushing_zombie.sql", "utf8"));
const DB: any = {
  prepare: (sql: string) => {
    const statement = database.prepare(sql);
    let args: any[] = [];
    const query: any = {
      bind: (...a: any[]) => {
        args = a;
        return query;
      },
      first: async () => statement.get(...args),
      all: async () => ({ results: statement.all(...args) }),
      run: async () => ({
        meta: { changes: Number(statement.run(...args).changes) },
      }),
    };
    return query;
  },
};
const server = http.createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      ...(body ? { body } : {}),
    });
    const result = await worker.fetch(request, { DB });
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end();
  }
});
server.listen(Number(process.env.PORT ?? 3101), "127.0.0.1", () =>
  console.log("Hosted shim listening"),
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));

/* 知华科技（上海如静知华信息科技有限公司） | https://www.zhuatech.cn/ | 商业咨询微信：zhuatech / zhuatech2 */
import { createServer } from "node:http";
import { openDatabase } from "./database.mjs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../dist/server/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const dbPath = resolve(process.env.DB_PATH || join(root, ".local/events.sqlite"));
await mkdir(dirname(dbPath), { recursive: true });
const db = openDatabase(dbPath);

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 16384) {
        outgoing.writeHead(413, { "content-type": "application/json; charset=utf-8" });
        outgoing.end(JSON.stringify({ error: "请求内容过长。" }));
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
      method: incoming.method, headers: incoming.headers,
      ...(body.length ? { body } : {})
    });
    const response = await worker.fetch(request, { DB: db });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500);
    outgoing.end("Internal error");
  }
}).listen(port, host, () => console.log(`活动抽奖服务已启动，端口 ${port}`));
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => server.close(() => { db.close(); process.exit(0); }));

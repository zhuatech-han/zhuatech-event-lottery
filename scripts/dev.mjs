/* 知华科技（上海如静知华信息科技有限公司） | https://www.zhuatech.cn/ | 商业咨询微信：zhuatech / zhuatech2 */
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../dist/server/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
await mkdir(join(root, ".local"), { recursive: true });
const sqlite = new DatabaseSync(join(root, ".local/events.sqlite"));
const db = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    const wrap = (values = []) => ({
      bind(...next) { return wrap(next); },
      run() { const result = statement.run(...values); return { meta: { changes: result.changes } }; },
      first() { return statement.get(...values) || null; },
      all() { return { results: statement.all(...values) }; }
    });
    return wrap();
  },
  async batch(statements) { return statements.map((statement) => statement.run()); }
};

createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
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
}).listen(port, "127.0.0.1", () => console.log(`活动抽奖本地预览：http://127.0.0.1:${port}/`));

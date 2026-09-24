/* 知华科技（上海如静知华信息科技有限公司） | https://www.zhuatech.cn/ | 商业咨询微信：zhuatech / zhuatech2 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import worker from "../dist/server/index.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  return {
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
}

async function call(db, path, method = "GET", body, token) {
  const response = await worker.fetch(new Request(`https://example.test${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  }), { DB: db });
  return { status: response.status, data: await response.json() };
}

test("scanned attendee self-checks in, organizer receives names and can close/delete", async () => {
  const db = database();
  const created = await call(db, "/api/events", "POST", { title: "测试活动" });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const { id } = created.data.event;
  const token = created.data.adminToken;
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal((await call(db, `/api/events/${id}`)).data.event.title, "测试活动");
  assert.equal((await call(db, `/api/events/${id}/checkins`, "POST", { name: "张三" })).status, 201);
  const duplicate = await call(db, `/api/events/${id}/checkins`, "POST", { name: "张三" });
  assert.equal(duplicate.data.duplicate, true);
  assert.equal((await call(db, `/api/events/${id}/participants`)).status, 401);
  const list = await call(db, `/api/events/${id}/participants`, "GET", undefined, token);
  assert.deepEqual(list.data.participants.map((entry) => entry.name), ["张三"]);
  assert.equal((await call(db, `/api/events/${id}/status`, "POST", { open: false }, token)).status, 200);
  assert.equal((await call(db, `/api/events/${id}/checkins`, "POST", { name: "李四" })).status, 409);
  assert.equal((await call(db, `/api/events/${id}`, "DELETE", undefined, token)).status, 200);
  assert.equal((await call(db, `/api/events/${id}`)).status, 404);
});

test("invalid attendee names and organizer credentials are rejected", async () => {
  const db = database();
  const created = await call(db, "/api/events", "POST", { title: "测试活动" });
  const { id } = created.data.event;
  assert.equal((await call(db, `/api/events/${id}/checkins`, "POST", { name: "a\nb" })).status, 400);
  assert.equal((await call(db, `/api/events/${id}/participants`, "GET", undefined, "0".repeat(64))).status, 401);
});

test("branded logo is served as an image, not serialized byte numbers", async () => {
  const response = await worker.fetch(new Request("https://example.test/assets/zhuatech-logo.jpg"), {});
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.deepEqual([...bytes.slice(0, 3)], [0xff, 0xd8, 0xff]);
});

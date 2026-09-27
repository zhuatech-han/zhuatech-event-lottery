/* 知华科技（上海如静知华信息科技有限公司） | https://www.zhuatech.cn/ | 商业咨询微信：zhuatech / zhuatech2 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../scripts/database.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import worker from "../dist/server/index.js";

function database() {
  return openDatabase(":memory:");
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

test("legacy event tables migrate without losing attendees and survive a database reopen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lottery-migration-"));
  const path = join(dir, "events.sqlite");
  const old = new DatabaseSync(path);
  old.exec("CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT NOT NULL, admin_hash TEXT NOT NULL, open INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, expires_at TEXT NOT NULL); CREATE TABLE checkins (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, name TEXT NOT NULL, normalized_name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(event_id, normalized_name)); CREATE INDEX checkins_event_idx ON checkins(event_id);");
  const id = crypto.randomUUID();
  old.prepare("INSERT INTO events VALUES (?, ?, ?, 1, ?, ?)").run(id, "旧版测试活动", "0".repeat(64), new Date().toISOString(), "2099-01-01T00:00:00Z");
  old.prepare("INSERT INTO checkins VALUES (?, ?, ?, ?, ?)").run(crypto.randomUUID(), id, "旧来宾编号", "旧来宾编号", new Date().toISOString());
  old.close();
  let db = openDatabase(path);
  try {
    assert.equal((await call(db, "/health")).status, 200);
    assert.equal((await call(db, `/api/events/${id}`)).data.event.title, "旧版测试活动");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM checkins").first().count, 1);
    assert.equal(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").first().version, 1);
    db.close();
    db = openDatabase(path);
    assert.equal((await call(db, "/health")).status, 200);
    assert.equal((await call(db, `/api/events/${id}/checkins`, "POST", { name: "新来宾编号" })).status, 201);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM checkins").first().count, 2);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("failed batch deletion rolls back and health does not expose database or credentials", async () => {
  const db = database();
  try {
    const created = await call(db, "/api/events", "POST", { title: "事务测试" });
    await assert.rejects(db.batch([
      db.prepare("DELETE FROM events"),
      db.prepare("INSERT INTO missing_table VALUES (1)")
    ]));
    assert.equal((await call(db, `/api/events/${created.data.event.id}`)).status, 200);
    assert.deepEqual((await call(db, "/health")).data, { status: "ok" });
    assert.equal((await call(undefined, "/health")).status, 503);
  } finally { db.close(); }
});

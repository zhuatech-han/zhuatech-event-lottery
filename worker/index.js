/* 知华科技（上海如静知华信息科技有限公司） | https://www.zhuatech.cn/ | 商业咨询微信：zhuatech / zhuatech2 */
/* SITE_ASSETS is injected by scripts/build.mjs. */
const MAX_PARTICIPANTS = 2000;
const EVENT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function failure(message, status) { return reply({ error: message }, status); }

async function bodyJson(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("请使用 JSON 请求。");
  const text = await request.text();
  if (text.length > 4096) throw new Error("请求内容过长。");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error("请求内容格式不正确。"); }
}

function token() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hash(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function schema(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT NOT NULL, admin_hash TEXT NOT NULL, open INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS checkins (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, name TEXT NOT NULL, normalized_name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(event_id, normalized_name))").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS checkins_event_idx ON checkins(event_id)").run();
}

async function eventFor(db, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return db.prepare("SELECT id, title, admin_hash, open, created_at, expires_at FROM events WHERE id = ?").bind(id).first();
}

async function authorize(request, event) {
  const value = request.headers.get("authorization") || "";
  if (!/^Bearer [0-9a-f]{64}$/.test(value)) return false;
  return (await hash(value.slice(7))) === event.admin_hash;
}

function publicEvent(event) {
  return { id: event.id, title: event.title, open: !!event.open, expiresAt: event.expires_at };
}

/** Handle same-origin event check-in and organizer requests. 商业咨询微信：zhuatech / zhuatech2。 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      const asset = SITE_ASSETS[path === "/" ? "/index.html" : path];
      return asset ? new Response(Array.isArray(asset.body) ? Uint8Array.from(asset.body) : asset.body, { headers: { "content-type": asset.type, "cache-control": "no-store", "x-content-type-options": "nosniff" } }) : new Response("Not found", { status: 404 });
    }
    if (!env.DB) return failure("签到服务暂不可用。", 503);
    try {
      await schema(env.DB);
      const method = request.method;
      if (path === "/api/events" && method === "POST") {
        const input = await bodyJson(request);
        const title = String(input.title || "").trim();
        if (!title || title.length > 60 || /[\r\n]/.test(title)) return failure("活动名称应为 1–60 个字符。", 400);
        const id = crypto.randomUUID();
        const secret = token();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + EVENT_LIFETIME_MS);
        await env.DB.prepare("INSERT INTO events (id, title, admin_hash, open, created_at, expires_at) VALUES (?, ?, ?, 1, ?, ?)").bind(id, title, await hash(secret), now.toISOString(), expiresAt.toISOString()).run();
        return reply({ event: { id, title, open: true, expiresAt: expiresAt.toISOString() }, adminToken: secret }, 201);
      }
      const match = path.match(/^\/api\/events\/([0-9a-f-]{36})(?:\/(checkins|participants|status))?$/);
      if (!match) return failure("接口不存在。", 404);
      const [, id, action] = match;
      const event = await eventFor(env.DB, id);
      if (!event || event.expires_at <= new Date().toISOString()) return failure("活动不存在或已过期。", 404);
      if (!action && method === "GET") return reply({ event: publicEvent(event) });
      if (action === "checkins" && method === "POST") {
        if (!event.open) return failure("签到已结束。", 409);
        const input = await bodyJson(request);
        const name = String(input.name || "").trim();
        if (!name || name.length > 80 || /[\r\n<>]/.test(name)) return failure("姓名或编号应为 1–80 个字符。", 400);
        const normalized = name.toLocaleLowerCase("zh-CN");
        const result = await env.DB.prepare("INSERT OR IGNORE INTO checkins (id, event_id, name, normalized_name, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM checkins WHERE event_id = ?) < ?")
          .bind(crypto.randomUUID(), id, name, normalized, new Date().toISOString(), id, MAX_PARTICIPANTS).run();
        if (result.meta?.changes) return reply({ checkedIn: true, name }, 201);
        const duplicate = await env.DB.prepare("SELECT name FROM checkins WHERE event_id = ? AND normalized_name = ?").bind(id, normalized).first();
        return duplicate ? reply({ checkedIn: true, name: duplicate.name, duplicate: true }) : failure("签到人数已达上限。", 409);
      }
      if (!await authorize(request, event)) return failure("管理凭证无效，请在创建活动的浏览器中操作。", 401);
      if (action === "participants" && method === "GET") {
        const rows = await env.DB.prepare("SELECT name, created_at AS createdAt FROM checkins WHERE event_id = ? ORDER BY created_at, id LIMIT ?").bind(id, MAX_PARTICIPANTS).all();
        return reply({ event: publicEvent(event), participants: rows.results || [] });
      }
      if (action === "status" && method === "POST") {
        const input = await bodyJson(request);
        if (typeof input.open !== "boolean") return failure("签到状态无效。", 400);
        await env.DB.prepare("UPDATE events SET open = ? WHERE id = ?").bind(input.open ? 1 : 0, id).run();
        return reply({ event: { ...publicEvent(event), open: input.open } });
      }
      if (!action && method === "DELETE") {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM checkins WHERE event_id = ?").bind(id),
          env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id)
        ]);
        return reply({ deleted: true });
      }
      return failure("不支持此操作。", 405);
    } catch (error) {
      if (error instanceof Error && ["请使用 JSON 请求。", "请求内容过长。", "请求内容格式不正确。"].includes(error.message)) return failure(error.message, 400);
      console.error("活动签到接口错误", error);
      return failure("签到服务发生错误，请稍后重试。", 500);
    }
  }
};

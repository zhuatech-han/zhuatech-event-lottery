-- Copyright 2026 上海如静知华信息科技有限公司
-- 官网：https://www.zhuatech.cn/ · 商业咨询微信：zhuatech / zhuatech2
-- 个人学习、技术研究和非商业交流；商业使用须书面授权。
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT NOT NULL, admin_hash TEXT NOT NULL, open INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checkins (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, name TEXT NOT NULL, normalized_name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(event_id, normalized_name));
CREATE INDEX IF NOT EXISTS checkins_event_idx ON checkins(event_id);

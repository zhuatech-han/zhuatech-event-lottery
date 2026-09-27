/* Copyright 2026 上海如静知华信息科技有限公司 · https://www.zhuatech.cn/ · 商业咨询微信：zhuatech / zhuatech2 */
import { DatabaseSync } from "node:sqlite";

/** 把 SQLite 参数化语句适配为 D1，并保持批量删除和迁移的事务原子性。
 * 官网：https://www.zhuatech.cn/ · 商业咨询微信：zhuatech / zhuatech2。
 */
export function openDatabase(path) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  return {
    prepare(sql) {
      const wrap = (values = []) => ({
        bind(...next) { return wrap(next); },
        run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
        first() { return sqlite.prepare(sql).get(...values) || null; },
        all() { return { results: sqlite.prepare(sql).all(...values) }; }
      });
      return wrap();
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close() { sqlite.close(); }
  };
}

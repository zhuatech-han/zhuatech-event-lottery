/* 知华科技（上海如静知华信息科技有限公司） | https://www.zhuatech.cn/ | 商业咨询微信：zhuatech / zhuatech2 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
const start = source.indexOf("function readBackup(value) {");
const end = source.indexOf('\nbyId("restoreBtn")', start);
assert.ok(start >= 0 && end > start, "backup parser must remain available to the browser");
const parse = runInNewContext(`const MAX_NAMES = 2000; const location = { origin: "https://draw.example" }; ${source.slice(start, end)}; readBackup`);

function sample() {
  return {
    version: 1,
    site: "https://draw.example",
    event: { id: "05131ef5-7e66-4e3d-be60-4492f9e55dcd", token: "a".repeat(64) },
    state: {
      participants: "虚构参会者乙",
      prizes: [{ id: "first", name: "一等奖", count: 1 }],
      winners: [{ participant: "虚构参会者甲", prizeId: "first", prizeName: "一等奖", time: "2026-09-25T04:00:00.000Z" }]
    }
  };
}

test("activity backup restores the admin credential and local draw data", () => {
  const backup = parse(sample());
  assert.equal(backup.event.token, "a".repeat(64));
  assert.equal(backup.state.participants, "虚构参会者乙");
  assert.equal(backup.state.winners[0].participant, "虚构参会者甲");
});

test("activity backup rejects another site, invalid credentials, and malformed draw data", () => {
  const wrongSite = sample(); wrongSite.site = "https://other.example";
  assert.throws(() => parse(wrongSite), /站点不匹配/);
  const wrongToken = sample(); wrongToken.event.token = "short";
  assert.throws(() => parse(wrongToken), /管理凭证无效/);
  const wrongPrize = sample(); wrongPrize.state.prizes[0].count = 0;
  assert.throws(() => parse(wrongPrize), /奖项无效/);
  const wrongWinner = sample(); wrongWinner.state.winners[0].participant = 123;
  assert.throws(() => parse(wrongWinner), /中奖结果无效/);
});

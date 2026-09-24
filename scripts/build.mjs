/* 知华科技（上海如静知华信息科技有限公司） | https://www.zhuatech.cn/ | 商业咨询微信：zhuatech / zhuatech2 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  "/index.html": "text/html; charset=utf-8",
  "/join.html": "text/html; charset=utf-8",
  "/styles.css": "text/css; charset=utf-8",
  "/join.css": "text/css; charset=utf-8",
  "/app.js": "text/javascript; charset=utf-8",
  "/join.js": "text/javascript; charset=utf-8",
  "/vendor/qrcode.js": "text/javascript; charset=utf-8",
  "/vendor/qrcode_UTF8.js": "text/javascript; charset=utf-8",
  "/assets/zhuatech-logo.jpg": "image/jpeg"
};
const assets = {};
for (const [path, type] of Object.entries(types)) {
  const bytes = await readFile(join(root, "dist", path.slice(1)));
  assets[path] = { body: type.startsWith("image/") ? Array.from(bytes) : bytes.toString("utf8"), type };
}
const worker = await readFile(join(root, "worker/index.js"), "utf8");
const destination = join(root, "dist/server/index.js");
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `/* Generated from tracked sources by scripts/build.mjs. */\nconst SITE_ASSETS = ${JSON.stringify(assets)};\n${worker}\n`);
console.log(`Built ${destination}`);

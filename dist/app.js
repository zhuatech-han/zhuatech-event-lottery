/* 知华科技（上海如静知华信息科技有限公司） | https://www.zhuatech.cn/ | 商业咨询微信：zhuatech / zhuatech2 */
const STORAGE_KEY = "zhuatech-event-lottery-v1";
const EVENT_KEY = "zhuatech-event-lottery-checkin-v1";
const MAX_NAMES = 2000;

const byId = (id) => document.getElementById(id);
const els = {
  participants: byId("participants"), participantCount: byId("participantCount"), namesHint: byId("namesHint"),
  importBtn: byId("importBtn"), importFile: byId("importFile"),
  prizeList: byId("prizeList"), prizeSelect: byId("prizeSelect"), stage: byId("stage"),
  stagePrize: byId("stagePrize"), stageTitle: byId("stageTitle"), stageCaption: byId("stageCaption"),
  stageCount: byId("stageCount"), drawBtn: byId("drawBtn"), stageDrawBtn: byId("stageDrawBtn"),
  drawMessage: byId("drawMessage"), saveStatus: byId("saveStatus"),
  winnerCount: byId("winnerCount"), resultGrid: byId("resultGrid"), emptyResults: byId("emptyResults"),
  exportBtn: byId("exportBtn"), resetBtn: byId("resetBtn"), fullscreenBtn: byId("fullscreenBtn"),
  onlineCount: byId("onlineCount"), createEventPanel: byId("createEventPanel"), activeEventPanel: byId("activeEventPanel"),
  eventName: byId("eventName"), activeEventTitle: byId("activeEventTitle"), checkinQr: byId("checkinQr"),
  checkinLink: byId("checkinLink"), checkinHint: byId("checkinHint"), toggleCheckinBtn: byId("toggleCheckinBtn"),
  backgroundTheme: byId("backgroundTheme"), backgroundFile: byId("backgroundFile"),
  backgroundPosition: byId("backgroundPosition"), backgroundShade: byId("backgroundShade"), backgroundHint: byId("backgroundHint")
};

const defaults = () => ({
  participants: "",
  prizes: [
    { id: "first", name: "一等奖", count: 1 },
    { id: "second", name: "二等奖", count: 2 },
    { id: "third", name: "三等奖", count: 3 }
  ],
  winners: []
});

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw.participants !== "string" || !Array.isArray(raw.prizes) || !Array.isArray(raw.winners)) return defaults();
    const prizes = raw.prizes.filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Number.isInteger(p.count) && p.count > 0 && p.count <= MAX_NAMES).slice(0, 20);
    const winners = raw.winners.filter((w) => w && typeof w.participant === "string" && typeof w.prizeName === "string" && typeof w.prizeId === "string" && typeof w.time === "string").slice(0, MAX_NAMES);
    return { participants: raw.participants.slice(0, 200000), prizes: prizes.length ? prizes : defaults().prizes, winners };
  } catch { return defaults(); }
}

let state = loadState();
let selectedPrizeId = state.prizes[0]?.id || null;
let drawing = false;
let ticker = null;
let remoteNames = [];
let onlineEvent = loadOnlineEvent();

function loadOnlineEvent() {
  try {
    const value = JSON.parse(localStorage.getItem(EVENT_KEY));
    return value && /^[0-9a-f-]{36}$/.test(value.id) && /^[0-9a-f]{64}$/.test(value.token) ? value : null;
  } catch { return null; }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    els.saveStatus.textContent = "已保存在此浏览器";
  } catch {
    els.saveStatus.textContent = "无法保存：请检查浏览器存储空间";
    message("浏览器未能保存数据，请及时导出结果。", true);
  }
}

function message(text, isError = false) {
  els.drawMessage.textContent = text;
  els.drawMessage.style.color = isError ? "#b74e53" : "#65778c";
}

function names() {
  return [...new Set([...state.participants.split(/\r?\n/), ...remoteNames].map((name) => name.trim()).filter(Boolean))];
}

function eligibleNames() {
  const used = new Set(state.winners.map((winner) => winner.participant));
  return names().filter((name) => !used.has(name));
}

function selectedPrize() {
  return state.prizes.find((prize) => prize.id === selectedPrizeId) || null;
}

function awardedCount(id) {
  return state.winners.filter((winner) => winner.prizeId === id).length;
}

function remainingPrizeSlots(prize) {
  return Math.max(0, prize.count - awardedCount(prize.id));
}

function updateNames() {
  const list = names();
  const entered = state.participants.split(/\r?\n/).map((n) => n.trim()).filter(Boolean).length;
  els.participantCount.textContent = `${list.length} 人`;
  els.namesHint.style.color = "";
  els.namesHint.textContent = list.length > MAX_NAMES
    ? `最多支持 ${MAX_NAMES} 人，请删减名单。`
    : list.some((name) => name.length > 80) ? "姓名或编号最多 80 个字符，请检查名单。"
    : `手动 ${entered} 条，扫码 ${remoteNames.length} 条；同名合并。手动名单只保存在此浏览器。`;
  updateStage();
}

function makeInput(className, value, label, type = "text") {
  const input = document.createElement("input");
  input.className = className;
  input.type = type;
  input.value = value;
  input.setAttribute("aria-label", label);
  return input;
}

function renderPrizes() {
  els.prizeList.replaceChildren();
  for (const prize of state.prizes) {
    const row = document.createElement("div");
    row.className = "prize-row";
    const name = makeInput("prize-name", prize.name, "奖项名称");
    name.maxLength = 32;
    name.disabled = drawing;
    name.addEventListener("input", () => { prize.name = name.value; els.stage.classList.remove("is-winner"); save(); renderPrizeSelect(); updateStage(); });
    name.addEventListener("blur", () => { prize.name = prize.name.trim() || "未命名奖项"; name.value = prize.name; save(); renderPrizeSelect(); updateStage(); });
    const quota = makeInput("prize-quota", String(prize.count), `${prize.name} 名额`, "number");
    quota.min = String(Math.max(1, awardedCount(prize.id)));
    quota.max = String(MAX_NAMES);
    quota.disabled = drawing;
    quota.addEventListener("change", () => {
      const parsed = Number(quota.value);
      if (!Number.isInteger(parsed) || parsed < Number(quota.min) || parsed > MAX_NAMES) {
        quota.value = String(prize.count);
        message(`名额应为 ${quota.min}–${MAX_NAMES} 的整数。`, true);
        return;
      }
      prize.count = parsed;
      els.stage.classList.remove("is-winner");
      save(); renderPrizes(); renderPrizeSelect(); updateStage(); message("");
    });
    const remove = document.createElement("button");
    remove.className = "prize-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `删除${prize.name}`);
    remove.disabled = drawing || awardedCount(prize.id) > 0;
    remove.title = awardedCount(prize.id) ? "该奖项已有中奖结果，重置结果后可删除" : "删除奖项";
    remove.addEventListener("click", () => {
      state.prizes = state.prizes.filter((item) => item.id !== prize.id);
      if (selectedPrizeId === prize.id) selectedPrizeId = state.prizes[0]?.id || null;
      els.stage.classList.remove("is-winner");
      save(); renderPrizes(); renderPrizeSelect(); updateStage();
    });
    const progress = document.createElement("div");
    progress.className = "prize-progress";
    progress.textContent = `已抽 ${awardedCount(prize.id)} / ${prize.count} 人`;
    row.append(name, quota, remove, progress);
    els.prizeList.append(row);
  }
}

function renderPrizeSelect() {
  els.prizeSelect.replaceChildren();
  if (!state.prizes.length) {
    const empty = document.createElement("option"); empty.textContent = "请先添加奖项"; empty.value = ""; els.prizeSelect.append(empty);
  }
  for (const prize of state.prizes) {
    const option = document.createElement("option");
    option.value = prize.id;
    option.textContent = `${prize.name.trim() || "未命名奖项"} · 剩余 ${remainingPrizeSlots(prize)} 名`;
    els.prizeSelect.append(option);
  }
  if (!state.prizes.some((p) => p.id === selectedPrizeId)) selectedPrizeId = state.prizes[0]?.id || null;
  els.prizeSelect.value = selectedPrizeId || "";
  els.prizeSelect.disabled = drawing;
}

function updateStage() {
  const prize = selectedPrize();
  els.stagePrize.textContent = prize ? (prize.name.trim() || "未命名奖项") : "请选择奖项";
  els.stageCount.textContent = `${eligibleNames().length} 人待抽取`;
  const validNames = names().length <= MAX_NAMES && names().every((name) => name.length <= 80);
  const canDraw = !!prize && validNames && remainingPrizeSlots(prize) > 0 && eligibleNames().length > 0;
  els.drawBtn.disabled = !drawing && !canDraw;
  els.stageDrawBtn.disabled = !drawing && !canDraw;
  if (!drawing && !els.stage.classList.contains("is-winner")) {
    els.stageTitle.textContent = "准备开始";
    els.stageCaption.textContent = !names().length ? "扫码签到或录入名单后，点击开始抽奖" : !validNames ? "请检查名单人数及单条长度" : !prize ? "请先添加奖项" : remainingPrizeSlots(prize) === 0 ? "当前奖项名额已抽完" : eligibleNames().length === 0 ? "名单中已无可抽取人员" : `本奖项剩余 ${remainingPrizeSlots(prize)} 个名额`;
  }
}

function randomIndex(length) {
  const limit = Math.floor(0x100000000 / length) * length;
  const values = new Uint32Array(1);
  do { crypto.getRandomValues(values); } while (values[0] >= limit);
  return values[0] % length;
}

function setDrawButtons(text, stopping) {
  els.drawBtn.textContent = text;
  els.stageDrawBtn.textContent = text;
  els.drawBtn.classList.toggle("is-stop", stopping);
  els.stageDrawBtn.classList.toggle("is-stop", stopping);
}

function toggleDraw() {
  if (drawing) {
    clearInterval(ticker);
    ticker = null;
    drawing = false;
    els.stageTitle.setAttribute("aria-live", "polite");
    const candidates = eligibleNames();
    const prize = selectedPrize();
    if (!candidates.length || !prize || !remainingPrizeSlots(prize)) {
      els.stage.classList.remove("is-drawing");
      setDrawButtons("开始抽奖", false); renderPrizes(); renderPrizeSelect(); updateStage();
      message("名单或奖项已发生变化，请检查后重试。", true);
      return;
    }
    const winner = candidates[randomIndex(candidates.length)];
    state.winners.push({ participant: winner, prizeId: prize.id, prizeName: prize.name.trim() || "未命名奖项", time: new Date().toISOString() });
    els.stage.classList.remove("is-drawing");
    els.stage.classList.add("is-winner");
    els.stageTitle.textContent = winner;
    els.stageCaption.textContent = "恭喜中奖";
    setDrawButtons("开始抽奖", false);
    save(); renderPrizes(); renderPrizeSelect(); renderResults(); updateStage();
    message(`${prize.name}：${winner}。${remainingPrizeSlots(prize) ? "继续点击可抽取下一位。" : "此奖项已抽完，可选择其他奖项。"}`);
    return;
  }
  const prize = selectedPrize();
  const candidates = eligibleNames();
  if (!prize || !remainingPrizeSlots(prize) || !candidates.length || names().length > MAX_NAMES || names().some((name) => name.length > 80)) { updateStage(); return; }
  drawing = true;
  els.stageTitle.setAttribute("aria-live", "off");
  els.stage.classList.remove("is-winner");
  els.stage.classList.add("is-drawing");
  els.stageCaption.textContent = "点击停止，确定本轮中奖者";
  els.stageTitle.textContent = candidates[randomIndex(candidates.length)];
  ticker = setInterval(() => { els.stageTitle.textContent = candidates[randomIndex(candidates.length)]; }, 90);
  setDrawButtons("停止抽奖", true);
  els.participants.disabled = true;
  els.importBtn.disabled = true;
  byId("addPrizeBtn").disabled = true;
  els.prizeSelect.disabled = true;
  renderPrizes();
  message("");
}

function unlockSetup() {
  els.participants.disabled = drawing;
  els.importBtn.disabled = drawing;
  byId("addPrizeBtn").disabled = drawing;
}

function renderResults() {
  els.winnerCount.textContent = `${state.winners.length} 人`;
  els.emptyResults.hidden = state.winners.length > 0;
  els.resultGrid.hidden = state.winners.length === 0;
  els.exportBtn.disabled = !state.winners.length;
  els.resetBtn.disabled = !state.winners.length;
  els.resultGrid.replaceChildren();
  for (const winner of [...state.winners].reverse()) {
    const card = document.createElement("article"); card.className = "result-card";
    const label = document.createElement("span"); label.className = "result-prize"; label.textContent = winner.prizeName;
    const name = document.createElement("strong"); name.textContent = winner.participant;
    const time = document.createElement("time"); time.dateTime = winner.time;
    time.textContent = new Date(winner.time).toLocaleString("zh-CN", { hour12: false });
    card.append(label, name, time); els.resultGrid.append(card);
  }
}

function csvCell(value) {
  const raw = String(value).replace(/\r|\n/g, " ");
  const safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportResults() {
  if (!state.winners.length) return;
  const rows = [["奖项", "姓名或编号", "抽取时间"], ...state.winners.map((w) => [w.prizeName, w.participant, w.time])];
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `抽奖结果-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && !field) quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\r" || character === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else field += character;
  }
  if (quoted) throw new Error("CSV 引号未闭合，请检查文件。");
  row.push(field); rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function isNameHeader(value) {
  const label = value.trim().toLowerCase().replace(/[\s_-]/g, "");
  return ["姓名", "名字", "参与者", "参与人", "员工姓名", "员工编号", "编号", "工号", "name", "participant", "participantname"].includes(label) || label.endsWith("姓名");
}

function importedNames(filename, content) {
  const text = content.replace(/^\uFEFF/, "");
  if (text.includes("\uFFFD")) throw new Error("文件编码无法识别；请另存为 UTF-8 CSV，或直接粘贴 Excel 姓名列。");
  let values;
  if (/\.csv$/i.test(filename)) {
    const rows = parseCsv(text);
    const columns = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    const header = rows[0] || [];
    let column = 0;
    let start = 0;
    if (columns > 1) {
      column = header.findIndex((cell) => /姓名|名字|name/i.test(cell.trim()));
      if (column < 0) column = header.findIndex(isNameHeader);
      if (column < 0) throw new Error("多列 CSV 未找到姓名或编号列；请只保留一列，或直接复制 Excel 姓名列粘贴。");
      start = 1;
    } else if (isNameHeader(header[0] || "")) start = 1;
    values = rows.slice(start).map((row) => row[column] || "");
  } else values = text.split(/\r?\n/);
  const trimmed = values.map((value) => value.trim()).filter(Boolean);
  if (!trimmed.length) throw new Error("文件中没有可用的姓名或编号。");
  if (trimmed.some((value) => value.length > 80 || /[\r\n]/.test(value))) throw new Error("姓名或编号需为单行文字，且不超过 80 个字符。");
  const unique = [...new Set(trimmed)];
  if (unique.length > MAX_NAMES) throw new Error(`最多支持 ${MAX_NAMES} 人，请删减名单。`);
  return { names: unique, duplicates: trimmed.length - unique.length };
}

els.participants.value = state.participants;
els.participants.addEventListener("input", () => {
  state.participants = els.participants.value;
  els.stage.classList.remove("is-winner");
  save(); updateNames();
});
els.importBtn.addEventListener("click", () => {
  if (drawing) return;
  if (state.winners.length) { message("请先导出并重置中奖结果，再导入新名单。", true); return; }
  els.importFile.click();
});
els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  if (!file) return;
  try {
    if (!/\.(csv|txt)$/i.test(file.name)) throw new Error("请选择 CSV 或 TXT 文件。");
    if (file.size > 256 * 1024) throw new Error("文件超过 256 KB，请删减名单后重试。");
    const imported = importedNames(file.name, await file.text());
    if (state.participants.trim() && !confirm("导入文件会替换当前名单，继续吗？")) return;
    state.participants = imported.names.join("\n");
    els.participants.value = state.participants;
    els.stage.classList.remove("is-winner");
    save(); updateNames();
    message(`已导入 ${imported.names.length} 人${imported.duplicates ? `，合并 ${imported.duplicates} 个同名条目` : ""}。`);
  } catch (error) {
    els.namesHint.textContent = error.message;
    els.namesHint.style.color = "#b74e53";
    message(error.message, true);
  } finally { els.importFile.value = ""; }
});
byId("exampleBtn").addEventListener("click", () => {
  if (drawing) return;
  if (state.participants.trim() && !confirm("填入示例会替换当前名单，继续吗？")) return;
  state.participants = Array.from({ length: 24 }, (_, index) => `参与者 ${String(index + 1).padStart(2, "0")}`).join("\n");
  els.participants.value = state.participants;
  els.stage.classList.remove("is-winner"); save(); updateNames(); message("已填入虚构示例名单。");
});
byId("clearNamesBtn").addEventListener("click", () => {
  if (drawing || !state.participants || !confirm("清空参与名单？已有中奖结果会保留。")) return;
  state.participants = ""; els.participants.value = "";
  els.stage.classList.remove("is-winner"); save(); updateNames();
});
byId("addPrizeBtn").addEventListener("click", () => {
  if (drawing || state.prizes.length >= 20) { message("最多可设置 20 个奖项。", true); return; }
  const id = crypto.randomUUID();
  state.prizes.push({ id, name: `奖项 ${state.prizes.length + 1}`, count: 1 });
  els.stage.classList.remove("is-winner");
  selectedPrizeId = id; save(); renderPrizes(); renderPrizeSelect(); updateStage();
});
els.prizeSelect.addEventListener("change", () => {
  selectedPrizeId = els.prizeSelect.value;
  els.stage.classList.remove("is-winner"); updateStage(); message("");
});
els.drawBtn.addEventListener("click", () => { toggleDraw(); unlockSetup(); });
els.stageDrawBtn.addEventListener("click", () => { toggleDraw(); unlockSetup(); });
els.exportBtn.addEventListener("click", exportResults);
els.resetBtn.addEventListener("click", () => {
  if (drawing || !state.winners.length || !confirm("清空全部中奖结果？此操作不可撤销。")) return;
  state.winners = []; els.stage.classList.remove("is-winner");
  save(); renderPrizes(); renderPrizeSelect(); renderResults(); updateStage(); message("中奖结果已清空。");
});
els.fullscreenBtn.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement === els.stage) await document.exitFullscreen();
    else await els.stage.requestFullscreen();
  } catch { message("当前浏览器无法进入全屏，可使用浏览器的全屏功能。", true); }
});
document.addEventListener("fullscreenchange", () => {
  const full = document.fullscreenElement === els.stage;
  els.fullscreenBtn.setAttribute("aria-label", full ? "退出全屏" : "进入全屏");
  els.fullscreenBtn.innerHTML = full ? "⛶ <span>退出全屏</span>" : "⛶ <span>全屏投放</span>";
});
document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = "已复制"; setTimeout(() => { button.textContent = button.dataset.copy; }, 1500); }
  catch { message(`请手动复制微信号：${button.dataset.copy}`); }
}));

async function api(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  let data;
  try { data = await response.json(); } catch { throw new Error("签到服务没有返回有效结果。"); }
  if (!response.ok) throw new Error(data.error || "签到服务暂不可用。");
  return data;
}

function adminOptions(method, body) {
  return { method, headers: { "authorization": `Bearer ${onlineEvent.token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) };
}

function renderCheckin() {
  const active = !!onlineEvent;
  els.createEventPanel.hidden = active;
  els.activeEventPanel.hidden = !active;
  if (!active) { els.onlineCount.textContent = "未创建"; return; }
  const joinUrl = `${location.origin}/join.html?event=${encodeURIComponent(onlineEvent.id)}`;
  els.activeEventTitle.textContent = onlineEvent.title;
  els.checkinLink.href = joinUrl;
  els.checkinLink.textContent = joinUrl;
  els.onlineCount.textContent = `${remoteNames.length} 人扫码`;
  els.toggleCheckinBtn.textContent = onlineEvent.open ? "结束签到" : "重新开放签到";
  els.checkinQr.replaceChildren();
  try {
    const qr = qrcode(0, "M");
    qr.addData(joinUrl);
    qr.make();
    els.checkinQr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  } catch { els.checkinQr.textContent = "二维码暂不可用，请复制签到链接。"; }
}

let polling = false;
async function refreshCheckins() {
  if (!onlineEvent || polling) return;
  polling = true;
  try {
    const data = await api(`/api/events/${onlineEvent.id}/participants`, adminOptions("GET"));
    remoteNames = data.participants.map((item) => item.name);
    onlineEvent.title = data.event.title;
    onlineEvent.open = data.event.open;
    localStorage.setItem(EVENT_KEY, JSON.stringify(onlineEvent));
    renderCheckin();
    updateNames();
    els.checkinHint.textContent = `${data.event.open ? "签到开放中" : "签到已结束"}，每 3 秒更新名单。请用另一部手机确认签到链接可访问。`;
  } catch (error) { els.checkinHint.textContent = `同步失败：${error.message} 已获取的名单仍保留在本页。`; }
  finally { polling = false; }
}

byId("createEventBtn").addEventListener("click", async () => {
  const title = els.eventName.value.trim();
  if (!title) { els.checkinHint.textContent = "请先填写活动名称。"; return; }
  if (state.winners.length) { els.checkinHint.textContent = "请先导出并重置上场活动的中奖结果。"; return; }
  const button = byId("createEventBtn");
  button.disabled = true;
  try {
    const data = await api("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    onlineEvent = { ...data.event, token: data.adminToken };
    localStorage.setItem(EVENT_KEY, JSON.stringify(onlineEvent));
    remoteNames = [];
    renderCheckin();
    await refreshCheckins();
  } catch (error) { els.checkinHint.textContent = `创建失败：${error.message}`; }
  finally { button.disabled = false; }
});

byId("copyCheckinBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(els.checkinLink.href); els.checkinHint.textContent = "签到链接已复制。"; }
  catch { els.checkinHint.textContent = "复制失败，请长按或手动复制上方链接。"; }
});

els.toggleCheckinBtn.addEventListener("click", async () => {
  if (!onlineEvent) return;
  els.toggleCheckinBtn.disabled = true;
  try {
    const data = await api(`/api/events/${onlineEvent.id}/status`, adminOptions("POST", { open: !onlineEvent.open }));
    onlineEvent.open = data.event.open;
    localStorage.setItem(EVENT_KEY, JSON.stringify(onlineEvent));
    renderCheckin();
    els.checkinHint.textContent = onlineEvent.open ? "签到已重新开放。" : "签到已结束，已有名单仍可抽奖。";
  } catch (error) { els.checkinHint.textContent = error.message; }
  finally { els.toggleCheckinBtn.disabled = false; }
});

byId("deleteEventBtn").addEventListener("click", async () => {
  if (!onlineEvent || !confirm("删除活动及服务器上的全部扫码签到记录？请先导出需要保留的结果。此操作不可撤销。")) return;
  try {
    await api(`/api/events/${onlineEvent.id}`, adminOptions("DELETE"));
    onlineEvent = null;
    remoteNames = [];
    localStorage.removeItem(EVENT_KEY);
    renderCheckin(); updateNames();
    els.checkinHint.textContent = "活动和扫码签到记录已删除。";
  } catch (error) { els.checkinHint.textContent = error.message; }
});

const backgroundKey = "zhuatech-event-lottery-background-v1";
const gradients = {
  ocean: "radial-gradient(circle at 50% 51%, #15375a 0, #0d2744 36%, #081a30 74%, #071527 100%)",
  violet: "radial-gradient(circle at 50% 45%, #564683 0, #30235c 45%, #15102d 100%)",
  gold: "radial-gradient(circle at 50% 45%, #72562b 0, #423018 45%, #18140f 100%)"
};
let background = { theme: "ocean", position: 50, shade: 50 };
let backgroundUrl = null;
try { background = { ...background, ...JSON.parse(localStorage.getItem(backgroundKey)) }; } catch { /* 默认主题 */ }
if (!gradients[background.theme]) background.theme = "ocean";
background.position = Math.max(0, Math.min(100, Number.isFinite(Number(background.position)) ? Number(background.position) : 50));
background.shade = Math.max(0, Math.min(85, Number.isFinite(Number(background.shade)) ? Number(background.shade) : 50));

function applyBackground() {
  const shade = background.shade / 100;
  els.stage.style.backgroundImage = backgroundUrl ? `linear-gradient(rgba(0,0,0,${shade}), rgba(0,0,0,${shade})), url("${backgroundUrl}")` : gradients[background.theme];
  els.stage.style.backgroundSize = "cover";
  els.stage.style.backgroundPosition = `center ${background.position}%`;
  els.backgroundTheme.value = background.theme;
  els.backgroundPosition.value = String(background.position);
  els.backgroundShade.value = String(background.shade);
  byId("backgroundRemoveBtn").disabled = !backgroundUrl;
}

function openBackgroundDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("zhuatech-event-lottery-assets", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("assets");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function backgroundAsset(mode, value) {
  const db = await openBackgroundDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("assets", mode === "get" ? "readonly" : "readwrite");
      const request = mode === "get" ? transaction.objectStore("assets").get("background") : mode === "put" ? transaction.objectStore("assets").put(value, "background") : transaction.objectStore("assets").delete("background");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

function showBackgroundBlob(blob) {
  if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
  backgroundUrl = blob ? URL.createObjectURL(blob) : null;
  applyBackground();
}

els.backgroundTheme.addEventListener("change", () => {
  background.theme = els.backgroundTheme.value;
  localStorage.setItem(backgroundKey, JSON.stringify(background));
  applyBackground();
});
for (const [element, key] of [[els.backgroundPosition, "position"], [els.backgroundShade, "shade"]]) {
  element.addEventListener("input", () => { background[key] = Number(element.value); localStorage.setItem(backgroundKey, JSON.stringify(background)); applyBackground(); });
}
byId("backgroundUploadBtn").addEventListener("click", () => els.backgroundFile.click());
els.backgroundFile.addEventListener("change", async () => {
  const file = els.backgroundFile.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    els.backgroundHint.textContent = "请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片。";
    els.backgroundFile.value = "";
    return;
  }
  try { await backgroundAsset("put", file); showBackgroundBlob(file); els.backgroundHint.textContent = "背景已保存到当前浏览器。"; }
  catch { els.backgroundHint.textContent = "浏览器无法保存图片，请检查存储权限。"; }
  finally { els.backgroundFile.value = ""; }
});
byId("backgroundRemoveBtn").addEventListener("click", async () => {
  try { await backgroundAsset("delete"); showBackgroundBlob(null); els.backgroundHint.textContent = "已移除背景图片。"; }
  catch { els.backgroundHint.textContent = "移除失败，请重试。"; }
});

updateNames(); renderPrizes(); renderPrizeSelect(); renderResults(); updateStage();
renderCheckin();
applyBackground();
backgroundAsset("get").then((blob) => { if (blob) showBackgroundBlob(blob); }).catch(() => { els.backgroundHint.textContent = "当前浏览器不支持保存背景图片。"; });
if (onlineEvent) refreshCheckins();
setInterval(refreshCheckins, 3000);

function registerBrowserTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const tools = [
    {
      name: "read_draw_status",
      title: "查看抽奖状态",
      description: "查看名单人数、可抽人数和各奖项剩余名额，不返回名单内容。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        return { participantCount: names().length, eligibleCount: eligibleNames().length, winnerCount: state.winners.length, prizes: state.prizes.map((p) => ({ id: p.id, name: p.name, remaining: remainingPrizeSlots(p) })) };
      }
    },
    {
      name: "configure_draw",
      title: "设置抽奖名单与奖项",
      description: "在尚无中奖结果时，批量设置名单与奖项，并同步更新页面。",
      inputSchema: {
        type: "object",
        properties: {
          participants: { type: "array", minItems: 1, maxItems: MAX_NAMES, items: { type: "string" } },
          prizes: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", properties: { name: { type: "string" }, count: { type: "integer", minimum: 1, maximum: MAX_NAMES } }, required: ["name", "count"], additionalProperties: false } }
        },
        required: ["participants", "prizes"], additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (drawing || state.winners.length) throw new Error("已有中奖结果或正在抽取，请先在页面中处理当前抽奖。");
        if (!Array.isArray(input?.participants) || !Array.isArray(input?.prizes) || input.participants.length < 1 || input.participants.length > MAX_NAMES || input.prizes.length < 1 || input.prizes.length > 20) throw new Error("名单或奖项数量无效。");
        const participants = input.participants.map((value) => typeof value === "string" ? value.trim() : "");
        const prizes = input.prizes.map((p) => ({ id: crypto.randomUUID(), name: typeof p?.name === "string" ? p.name.trim() : "", count: p?.count }));
        if (participants.some((p) => !p || p.length > 80 || /[\r\n]/.test(p)) || new Set(participants).size !== participants.length || prizes.some((p) => !p.name || p.name.length > 32 || !Number.isInteger(p.count) || p.count < 1 || p.count > MAX_NAMES)) throw new Error("名单需为不重复的单行文字，奖项名称和名额需有效。");
        state.participants = participants.join("\n"); state.prizes = prizes; selectedPrizeId = prizes[0].id;
        els.participants.value = state.participants; els.stage.classList.remove("is-winner");
        save(); updateNames(); renderPrizes(); renderPrizeSelect(); updateStage();
        return { participantCount: participants.length, prizeCount: prizes.length };
      }
    },
    {
      name: "draw_next_winner",
      title: "抽取一位中奖者",
      description: "从当前未中奖名单中，为指定奖项随机抽取一位并显示结果。",
      inputSchema: { type: "object", properties: { prizeId: { type: "string" } }, required: ["prizeId"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (drawing) throw new Error("正在抽取，请先停止当前抽奖。");
        const prize = state.prizes.find((p) => p.id === input?.prizeId);
        if (!prize || !remainingPrizeSlots(prize) || !eligibleNames().length || names().length > MAX_NAMES || names().some((name) => name.length > 80)) throw new Error("奖项不可用，或名单超出限制、已无可抽取人员。");
        selectedPrizeId = prize.id; renderPrizeSelect(); updateStage();
        toggleDraw(); toggleDraw(); unlockSetup();
        const winner = state.winners.at(-1);
        return { prize: winner.prizeName, participant: winner.participant, time: winner.time, remaining: remainingPrizeSlots(prize) };
      }
    }
  ];
  for (const tool of tools) {
    try { void Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch { /* 页面仍可手动操作 */ }
  }
}
registerBrowserTools();

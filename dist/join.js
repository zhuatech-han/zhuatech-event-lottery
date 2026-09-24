/* 知华科技（上海如静知华信息科技有限公司） | https://www.zhuatech.cn/ | 商业咨询微信：zhuatech / zhuatech2 */
const eventId = new URLSearchParams(location.search).get("event");
const title = document.getElementById("eventTitle");
const form = document.getElementById("checkinForm");
const nameInput = document.getElementById("name");
const button = document.getElementById("submitBtn");
const message = document.getElementById("message");

/** Read only public event details; the organizer token is never present in the QR link. 商业咨询微信：zhuatech / zhuatech2。 */
async function loadEvent() {
  if (!eventId || !/^[0-9a-f-]{36}$/.test(eventId)) { title.textContent = "签到链接无效"; return; }
  try {
    const response = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法读取活动");
    title.textContent = data.event.title;
    form.hidden = !data.event.open;
    if (!data.event.open) message.textContent = "签到已结束。";
  } catch (error) { title.textContent = "暂时无法签到"; message.textContent = error.message; }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  button.disabled = true;
  message.textContent = "正在提交…";
  try {
    const response = await fetch(`/api/events/${eventId}/checkins`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "签到失败");
    form.hidden = true;
    message.textContent = data.duplicate ? `${data.name} 已签到，无需重复提交。` : `${data.name}，签到成功！`;
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});

loadEvent();

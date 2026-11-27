const $ = (id) => document.getElementById(id);
let latest = null;
let busy = false;

function savedTheme() {
  const stored = localStorage.getItem("olrb-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const icon = theme === "dark" ? "☀️" : "🌙";
  const title = theme === "dark" ? "Light mode par jayein" : "Dark mode par jayein";
  for (const id of ["themeBtn", "themeBtnTop"]) {
    const button = $(id);
    if (!button) continue;
    button.textContent = icon;
    button.title = title;
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("olrb-theme", next);
  applyTheme(next);
}

applyTheme(savedTheme());

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.ok !== true) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function timeAgo(iso) {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s pehle`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m pehle`;
  return `${Math.floor(seconds / 3600)}h pehle`;
}

function setPill(id, icon, label, value, tone = "") {
  const el = $(id);
  el.className = `pill ${tone}`.trim();
  el.innerHTML = `<span></span><b></b><em></em>`;
  el.querySelector("span").textContent = icon;
  el.querySelector("b").textContent = label;
  el.querySelector("em").textContent = value;
}

function renderLog(entries = []) {
  const box = $("log");
  box.textContent = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = "Abhi koi event nahi — Reset ya Send dabayein.";
    box.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "log-item";
    const time = document.createElement("time");
    time.textContent = timeAgo(entry.at);
    const tag = document.createElement("span");
    tag.className = `tag ${entry.type}`;
    tag.textContent = entry.type === "reset" ? "♻ RESET" : "💬 TEST";
    const detail = document.createElement("span");
    detail.textContent =
      entry.type === "reset"
        ? `IP ${entry.oldIp} → ${entry.newIp} · session ${entry.sessionChanged ? "changed ✅" : "same"} · HTTP ${entry.statusCode}`
        : `${entry.model || "model"} · HTTP ${entry.statusCode} · ${entry.ok ? "OK ✅" : "FAIL ❌"}`;
    row.append(time, tag, detail);
    box.appendChild(row);
  }
}

function renderMechanism(s) {
  const list = $("mechanismList");
  list.textContent = "";
  const items = [];
  const reset = s.lastReset;
  const test = s.lastTest;
  items.push([reset ? "✅" : "⏳", `Reset trigger: ${reset ? timeAgo(reset.at) : "abhi tak nahi"}`]);
  if (reset) {
    items.push([reset.sessionChanged ? "✅" : "⚠️", `Session change: ${reset.sessionChanged ? "ho gaya" : "same raha"}`]);
    items.push([reset.ipChanged ? "✅" : "⚠️", `IP change: ${reset.ipChanged ? "ho gaya" : "same raha"}`]);
    items.push([reset.ok ? "✅" : "❌", `Reset status code: ${reset.statusCode}`]);
  }
  if (test) {
    items.push([test.statusCode === 200 ? "✅" : "❌", `Model test status: ${test.statusCode}`]);
    const u = test.usage;
    items.push([
      u ? "✅" : "⚠️",
      `Usage: ${u ? `${u.prompt_tokens ?? u.promptTokens ?? "?"} in / ${u.completion_tokens ?? u.completionTokens ?? "?"} out` : "upstream ne nahi bheja"}`,
    ]);
  }
  items.push([s.limitState === "full" ? "❌" : s.limitState === "ok" ? "✅" : "⏳", `Limit state: ${s.limitState}`]);
  for (const [icon, text] of items) {
    const li = document.createElement("li");
    li.textContent = `${icon} ${text}`;
    li.className = icon === "✅" ? "good" : icon === "❌" ? "bad" : "";
    list.appendChild(li);
  }
}

function renderStatus(s) {
  latest = s;
  const limitLabel = s.limitState === "full" ? "🚫 Limit FULL" : s.limitState === "ok" ? "✅ Limit OK" : "⏳ Limit unknown";
  $("limitBadge").textContent = limitLabel;
  $("limitBadge").className = `badge ${s.limitState === "full" ? "full" : s.limitState === "ok" ? "ok" : ""}`;
  setPill("pillLimit", "🚦", "Limit", s.limitState, s.limitState === "full" ? "off" : s.limitState === "ok" ? "" : "warn");
  setPill("pillWarp", "🛡️", "WARP", s.warp.installed ? (s.warp.connected ? "connected ✅" : "disconnected ❌") : "not installed ❌", s.warp.connected ? "" : "off");
  setPill("pillBg", "🧵", "Background", s.warp.backgroundRunning ? "running ✅" : "not running ❌", s.warp.backgroundRunning ? "" : "off");
  setPill("pillProxy", "🔌", "Proxy 8118", s.proxy.available ? "available ✅" : "offline ❌", s.proxy.available ? "" : "off");
  $("enabledToggle").checked = s.enabled;
  $("enabledHint").textContent = s.enabled ? "enabled — reset allowed" : "disabled — reset blocked";
  $("sessionText").textContent = s.session || "—";
  $("sessionValid").textContent = s.sessionValid ? "canonical ✅" : "invalid ❌";
  $("ipText").textContent = s.ip || "—";
  $("lastResetTime").textContent = s.lastReset ? timeAgo(s.lastReset.at) : "—";
  $("lastStatus").textContent = s.lastTest ? `HTTP ${s.lastTest.statusCode}` : "—";
  renderLog(s.history);
  renderMechanism(s);
}

async function refresh() {
  try {
    renderStatus(await api("/api/status"));
  } catch (e) {
    toast(`Status error: ${e.message}`);
  }
}

async function loadModels() {
  try {
    const data = await api("/api/models");
    const select = $("modelSelect");
    select.textContent = "";
    for (const model of data.models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = `${model.id.includes("free") ? "🆓" : "🤖"} ${model.name || model.id}`;
      select.appendChild(option);
    }
    const preferred = ["deepseek-v4.1-flash-free", "beam-free", "hy4-flash-free"].find((id) =>
      data.models.some((m) => m.id === id),
    );
    if (preferred) select.value = preferred;
    $("modelSource").textContent = `(${data.source} · ${data.models.length})`;
  } catch (e) {
    toast(`Model load error: ${e.message}`);
  }
}

async function send() {
  if (busy) return;
  const model = $("modelSelect").value;
  const message = $("messageInput").value.trim();
  if (!model || !message) return toast("Model aur message dono chahiye");
  busy = true;
  const btn = $("sendBtn");
  btn.disabled = true;
  btn.textContent = "…";
  $("responseBox").textContent = "Upstream se jawab aa raha hai…";
  $("errorBox").textContent = "";
  $("statusBadge").textContent = "⏳ calling…";
  $("statusBadge").className = "badge";
  $("usageChips").textContent = "";
  try {
    const result = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ model, message }),
    });
    $("statusBadge").textContent = `HTTP ${result.statusCode}`;
    $("statusBadge").className = `badge ${result.ok ? "ok" : "full"}`;
    $("responseBox").textContent = result.response || "(khali response — upriver ne text nahi bheja)";
    $("errorBox").textContent = result.error || "";
    const usage = result.usage || {};
    const chips = [
      `in: ${usage.prompt_tokens ?? usage.promptTokens ?? "?"}`,
      `out: ${usage.completion_tokens ?? usage.completionTokens ?? "?"}`,
      `total: ${usage.total_tokens ?? usage.totalTokens ?? "?"}`,
    ];
    for (const label of chips) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = label;
      $("usageChips").appendChild(chip);
    }
    $("limitBadge").textContent = result.statusCode === 429 ? "🚫 Limit FULL" : result.ok ? "✅ Limit OK" : `⚠️ HTTP ${result.statusCode}`;
    toast(result.ok ? "✅ Model jawab de gaya" : `❌ HTTP ${result.statusCode}`);
  } catch (e) {
    $("statusBadge").textContent = "❌ error";
    $("errorBox").textContent = e.message;
    toast(`Chat error: ${e.message}`);
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = "➤ Send";
    await refresh();
  }
}

async function resetLimit() {
  const btn = $("resetBtn");
  btn.disabled = true;
  btn.textContent = "♻️ Rotating…";
  try {
    const result = await api("/api/reset", { method: "POST" });
    toast(result.ok ? "♻️ Reset ho gaya — naya IP + session" : "⚠️ Rotation fail, details log me");
    await refresh();
  } catch (e) {
    toast(`Reset error: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "♻️ Limit Reset";
  }
}

async function toggleEnabled() {
  const enabled = $("enabledToggle").checked;
  try {
    await api("/api/toggle", { method: "POST", body: JSON.stringify({ enabled }) });
    toast(enabled ? "✅ Mechanism enabled" : "⏸️ Mechanism disabled");
  } catch (e) {
    toast(`Toggle error: ${e.message}`);
  }
  await refresh();
}

$("themeBtn").addEventListener("click", toggleTheme);
$("themeBtnTop").addEventListener("click", toggleTheme);
$("sendBtn").addEventListener("click", send);
$("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") send();
});
$("resetBtn").addEventListener("click", resetLimit);
$("refreshBtn").addEventListener("click", () => {
  refresh();
  loadModels();
});
$("reloadModels").addEventListener("click", loadModels);
$("enabledToggle").addEventListener("change", toggleEnabled);
$("copySession").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(latest?.session || "");
    toast("🔑 Session copy ho gaya");
  } catch {
    toast("Clipboard available nahi");
  }
});
$("collapseBtn").addEventListener("click", () => {
  $("sheet").classList.add("closed");
  $("app").classList.add("sheet-closed");
});
$("openSheet").addEventListener("click", () => {
  $("sheet").classList.remove("closed");
  $("app").classList.remove("sheet-closed");
});
$("openBtn").addEventListener("click", () => window.open("https://github.com/HassanAmeer/auto-code-ide/tree/opencode-limit-reset-bypass/opencode-limit-reset-bypass", "_blank", "noopener"));

refresh();
loadModels();
setInterval(refresh, 15000);

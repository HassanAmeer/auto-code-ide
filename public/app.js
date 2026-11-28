const $ = (id) => document.getElementById(id);
let latest = null;
let busy = false;
let chatMessages = [];
let resumeTimer = null;

function scheduleAutoResume(result) {
  if (!result.resetAt || !$("autoResumeToggle").checked) return;
  clearTimeout(resumeTimer);
  const pending = {
    model: $("modelSelect").value,
    messages: chatMessages.slice(0, -1),
    last: chatMessages.at(-1)?.content || "",
    resetAt: result.resetAt,
  };
  localStorage.setItem("olrb-pending", JSON.stringify(pending));
  const delay = Math.max(4000, Date.parse(result.resetAt) - Date.now() + 5000);
  resumeTimer = setTimeout(() => runPending(), delay);
}

function runPending() {
  const raw = localStorage.getItem("olrb-pending");
  if (!raw) return;
  try {
    const p = JSON.parse(raw);
    localStorage.removeItem("olrb-pending");
    chatMessages = Array.isArray(p.messages) ? p.messages : [];
    if (p.model) $("modelSelect").value = p.model;
    $("messageInput").value = p.last || "";
    toast("⏳ Limit reset ho gaya — auto-resume kar rahe hain");
    send();
  } catch {}
}

function addBubble(role, text, meta = "") {
  const empty = $("chatEmpty");
  if (empty) empty.remove();
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text || "(khali response)";
  if (meta) {
    const small = document.createElement("small");
    small.textContent = meta;
    bubble.appendChild(small);
  }
  $("chat").appendChild(bubble);
  $("chat").scrollTop = $("chat").scrollHeight;
}

function startNewChat() {
  chatMessages = [];
  $("chat").textContent = "";
  const empty = document.createElement("div");
  empty.className = "chat-empty";
  empty.id = "chatEmpty";
  empty.textContent = "💬 Chat shuru karein — pehla message bhejein";
  $("chat").appendChild(empty);
  $("resetBanner").hidden = true;
  $("statusBadge").textContent = "— status";
  $("statusBadge").className = "badge";
  $("usageChips").textContent = "";
  $("errorBox").textContent = "";
}

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

function updateCountdown() {
  const el = $("resetCountdown");
  if (!el || !latest?.limitResetAt) {
    if (el) el.textContent = "—";
    return;
  }
  const seconds = Math.max(0, Math.round((Date.parse(latest.limitResetAt) - Date.now()) / 1000));
  if (!seconds) {
    el.textContent = "ab reset ho sakta hai ♻️";
    return;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  el.textContent = `${h ? `${h}h ` : ""}${m}m ${s}s`;
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

function renderAiLogs(entries = []) {
  const box = $("aiLogs");
  if (!box) return;
  box.textContent = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = "Abhi koi model call nahi — chat me message bhejein.";
    box.appendChild(empty);
    return;
  }
  const kindClass = { ok: "log-ok", usage_limit: "log-limit", timeout: "log-warn", error: "log-error" };
  for (const entry of entries) {
    const card = document.createElement("div");
    card.className = `ai-log-card ${entry.errorKind || (entry.ok ? "ok" : "error")}`;

    // Header
    const head = document.createElement("div");
    head.className = "ai-log-header";
    const title = document.createElement("div");
    title.className = "ai-log-title";
    const badge = document.createElement("span");
    badge.className = `badge ${kindClass[entry.errorKind] || "log-error"}`;
    badge.textContent = entry.statusCode === 200 ? "200 OK" : `HTTP ${entry.statusCode || 500}`;
    const modelSpan = document.createElement("span");
    modelSpan.textContent = `🤖 ${entry.model || "unknown"}`;
    title.append(badge, modelSpan);

    const meta = document.createElement("div");
    meta.className = "ai-log-meta";
    if (entry.autoReset) {
      const resetTag = document.createElement("span");
      resetTag.textContent = "♻️ auto-reset";
      resetTag.style.color = "var(--warn)";
      meta.appendChild(resetTag);
    }
    const ms = document.createElement("span");
    ms.textContent = `⏱️ ${entry.durationMs ?? 0}ms`;
    const time = document.createElement("time");
    time.textContent = timeAgo(entry.at);
    meta.append(ms, time);
    head.append(title, meta);

    // Tokens Row
    const tokenRow = document.createElement("div");
    tokenRow.className = "ai-log-tokens";
    const u = entry.usage;
    if (u) {
      tokenRow.innerHTML = `
        <span class="token-pill">📥 Input: <b>${u.prompt_tokens ?? u.promptTokens ?? 0}</b></span>
        <span class="token-pill">📤 Output: <b>${u.completion_tokens ?? u.completionTokens ?? 0}</b></span>
        ${u.reasoning_tokens ? `<span class="token-pill">🧠 Reasoning: <b>${u.reasoning_tokens}</b></span>` : ""}
        <span class="token-pill highlight">📊 Total: <b>${u.total_tokens ?? u.totalTokens ?? 0}</b></span>
      `;
    } else {
      tokenRow.innerHTML = `<span class="token-pill">📊 Tokens: <b>N/A</b></span>`;
    }

    // Snippet & Action
    const bottomRow = document.createElement("div");
    bottomRow.style.display = "flex";
    bottomRow.style.justifyContent = "space-between";
    bottomRow.style.alignItems = "center";
    bottomRow.style.gap = "8px";

    const snippet = document.createElement("div");
    snippet.className = "muted";
    snippet.style.fontSize = "12px";
    snippet.style.overflow = "hidden";
    snippet.style.textOverflow = "ellipsis";
    snippet.style.whiteSpace = "nowrap";
    snippet.style.flex = "1";
    snippet.textContent = entry.responseSnippet || (entry.ok ? "Success" : "Error");

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "ai-log-expand-btn";
    toggleBtn.textContent = "🔍 View Full Details";

    bottomRow.append(snippet, toggleBtn);

    // Details box
    const details = document.createElement("div");
    details.className = "ai-log-details";
    const copyBtn = document.createElement("button");
    copyBtn.className = "ai-log-copy-btn";
    copyBtn.textContent = "📋 Copy JSON";
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
      toast("JSON copied to clipboard!");
    };

    details.innerHTML = `
      <div class="lbl">Prompt / Input</div>
      <pre>${escapeHtml(entry.prompt || "(not recorded)")}</pre>
      <div class="lbl">Response / Output</div>
      <pre>${escapeHtml(entry.response || entry.error || "(empty)")}</pre>
    `;
    details.prepend(copyBtn);

    toggleBtn.onclick = () => {
      const isOpen = details.classList.toggle("open");
      toggleBtn.textContent = isOpen ? "▲ Hide Details" : "🔍 View Full Details";
    };

    card.append(head, tokenRow, bottomRow, details);
    box.appendChild(card);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
    items.push([
      test.errorKind === "ok" ? "✅" : "❌",
      `Error kind: ${test.errorKind || "unknown"}`,
    ]);
    if (test.resetAt) {
      items.push(["⏳", `Upstream reset after: ${((test.retryAfterSeconds || 0) / 3600).toFixed(1)}h — sheet me countdown dekhein`]);
    }
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
  updateCountdown();
  renderLog(s.history);
  renderAiLogs(s.aiLogs);
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
  $("messageInput").value = "";
  $("errorBox").textContent = "";
  $("statusBadge").textContent = "⏳ calling…";
  $("statusBadge").className = "badge";
  $("usageChips").textContent = "";
  addBubble("user", message);
  chatMessages.push({ role: "user", content: message });
  try {
    const result = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        model,
        messages: chatMessages,
        autoReset: $("autoResetToggle").checked,
      }),
    });
    chatMessages.push({ role: "assistant", content: result.response || "(khali response)" });
    chatMessages = chatMessages.slice(-20);
    const usage = result.usage || {};
    const meta = `HTTP ${result.statusCode}${usage.total_tokens ?? usage.totalTokens ? ` · ${usage.total_tokens ?? usage.totalTokens} tokens` : ""}`;
    addBubble(result.ok ? "assistant" : "error", result.response || result.error || "(khali response)", meta);
    $("statusBadge").textContent = `HTTP ${result.statusCode}`;
    $("statusBadge").className = `badge ${result.ok ? "ok" : "full"}`;
    $("errorBox").textContent = result.error || "";
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
    const banner = $("resetBanner");
    if (result.resetPerformed) {
      const r = result.resetPerformed;
      banner.hidden = false;
      banner.textContent = `♻️ 429 limit mili — WARP IP ${r.oldIp} → ${r.newIp} aur session ${r.oldSession} → ${r.newSession} rotate kiya, dobara retry (HTTP ${result.statusCode}).`;
    } else {
      banner.hidden = true;
    }
    if (result.ok) {
      localStorage.removeItem("olrb-pending");
      clearTimeout(resumeTimer);
    } else {
      scheduleAutoResume(result);
    }
    $("limitBadge").textContent = result.statusCode === 429 ? "🚫 Limit FULL" : result.ok ? "✅ Limit OK" : `⚠️ HTTP ${result.statusCode}`;
    toast(result.ok ? "✅ Jawab mil gaya" : `❌ HTTP ${result.statusCode}`);
  } catch (e) {
    addBubble("error", e.message);
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
    toast(result.ok ? "♻️ WARP IP + session rotate ho gaya" : "⚠️ Reset fail, details log me");
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

async function runSystemCheck() {
  const panel = $("checkPanel");
  panel.hidden = false;
  const list = $("checkList");
  list.textContent = "";
  const loading = document.createElement("span");
  loading.className = "muted";
  loading.textContent = "⏳ Sab checks chal rahe hain…";
  list.appendChild(loading);
  try {
    const data = await api("/api/check");
    list.textContent = "";
    for (const item of data.checks) {
      const row = document.createElement("div");
      row.className = `check-row ${item.ok ? "pass" : "fail"}`;
      const icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = item.ok ? "✅" : "❌";
      const label = document.createElement("span");
      label.textContent = item.label;
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = item.detail;
      row.append(icon, label, detail);
      list.appendChild(row);
    }
    const failed = data.checks.filter((c) => !c.ok).length;
    toast(failed ? `⚠️ ${failed} check fail` : "✅ Sab checks pass");
  } catch (e) {
    list.textContent = "";
    const err = document.createElement("span");
    err.className = "muted";
    err.textContent = `❌ Check error: ${e.message}`;
    list.appendChild(err);
    toast(`Check error: ${e.message}`);
  }
}

async function controlWarp(action) {
  try {
    const result = await api(`/api/warp/${action}`, { method: "POST" });
    toast(result.ok ? `🛡️ WARP ${action} ho gaya` : `⚠️ WARP ${action} fail`);
  } catch (e) {
    toast(`WARP error: ${e.message}`);
  }
  await refresh();
}

$("warpStart").addEventListener("click", () => controlWarp("start"));
$("warpPause").addEventListener("click", () => controlWarp("pause"));
$("warpStop").addEventListener("click", () => controlWarp("stop"));
$("infoBtn").addEventListener("click", () => {
  const panel = $("infoPanel");
  panel.hidden = !panel.hidden;
});
$("checkBtn").addEventListener("click", runSystemCheck);
$("autoResumeToggle").checked = localStorage.getItem("olrb-auto-resume") !== "false";
$("autoResumeToggle").addEventListener("change", () => {
  localStorage.setItem("olrb-auto-resume", String($("autoResumeToggle").checked));
  toast($("autoResumeToggle").checked ? "⏳ Auto-resume on" : "⏸️ Auto-resume off");
});
const storedPending = localStorage.getItem("olrb-pending");
if (storedPending && $("autoResumeToggle").checked) {
  try {
    const p = JSON.parse(storedPending);
    const delay = Math.max(4000, Date.parse(p.resetAt) - Date.now() + 5000);
    resumeTimer = setTimeout(runPending, delay);
  } catch {}
}
$("autoResetToggle").checked = localStorage.getItem("olrb-auto-reset") !== "false";
$("autoResetToggle").addEventListener("change", () => {
  localStorage.setItem("olrb-auto-reset", String($("autoResetToggle").checked));
  toast($("autoResetToggle").checked ? "♻️ Auto reset on" : "⏸️ Auto reset off");
});
$("clearChat").addEventListener("click", startNewChat);
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

refresh();
loadModels();
setInterval(refresh, 15000);
setInterval(updateCountdown, 1000);

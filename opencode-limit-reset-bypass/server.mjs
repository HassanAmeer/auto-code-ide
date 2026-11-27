import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const STATE_FILE = path.join(ROOT, "data", "state.json");
const PORT = Number(process.env.OLRB_PORT || 8791);
const HOST = process.env.OLRB_HOST || "127.0.0.1";
const UPSTREAM = (process.env.OLRB_UPSTREAM || "https://opencode.ai").replace(/\/+$/, "");
const CHAT_URL = `${UPSTREAM}/inference/openai/v1/chat/completions`;
const MODELS_URL = `${UPSTREAM}/inference/v1/models`;
const PROXY = process.env.OLRB_PROXY || "http://127.0.0.1:8118";
const UA = "opencode/latest/2.1.4/cli";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const STATUS_MARK = "\n__OLRB_STATUS__:";
const FALLBACK_MODELS = [
  "deepseek-v4.1-flash-free",
  "beam-free",
  "glm-5.3-flash-free",
  "hy4-flash-free",
  "minimax-m3.1-flash-free",
];

let counter = 1;
let state = loadState();

const TOOLS = [
  {
    name: "read",
    description:
      "Read the contents of a file or directory. Supports text files, images, and PDFs. Images and PDFs are presented directly to the model. Each text line is prefixed by its 1-based line number as <line>: <content>. The prefix is for reference and is not part of the file content. Directory entries are returned one per line. Use offset and limit to read large files or directories in sections. Prefer one larger read over many small slices, and use grep to find specific content in large files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory to read" },
        offset: {
          type: "integer",
          minimum: 0,
          description: "The line or directory entry to start reading from (1-based)",
        },
        limit: {
          type: "integer",
          minimum: 0,
          description:
            "The maximum number of lines or directory entries to read (defaults to and capped at 2000)",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "shell",
    description:
      "Execute a shell command and return its output. Commands run on Linux using bash. Quote file paths containing spaces or special characters. Prefer dedicated tools over shell commands when possible. When output is large, the full result is saved to a file and a truncated preview is returned. Rely on automatic truncation unless filtering the output is more useful. Commands accept an optional timeout, background commands have no timeout by default. Background commands return immediately, and you will be notified when they complete.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command string to execute" },
        workdir: {
          type: "string",
          description:
            "Working directory to execute the command in. Defaults to the current working directory. When possible, avoid changing directories in the command and set the working directory here instead.",
        },
        timeout: {
          type: "integer",
          minimum: 0,
          description:
            "Timeout in milliseconds. Set to 0 to disable the timeout. Defaults to 120000 for foreground commands. Background commands have no timeout by default.",
        },
        background: {
          type: "boolean",
          description:
            "Run the command in the background and return immediately (useful for dev servers and long-running builds). You do not need to use '&' at the end of the command when using this parameter. You will be notified when it completes. DO NOT poll for completion.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
];

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      enabled: parsed.enabled !== false,
      session: parsed.session || mintSession(),
      lastReset: parsed.lastReset || null,
      lastTest: parsed.lastTest || null,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 40) : [],
    };
  } catch {
    return { enabled: true, session: mintSession(), lastReset: null, lastTest: null, history: [] };
  }
}

function saveState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, STATE_FILE);
}

function mintSession() {
  const ts = BigInt(Date.now());
  const c = BigInt((counter++ % 62) + 1);
  const raw = ~((ts << 12n) | c) & 0xffffffffffffn;
  const timePart = raw.toString(16).padStart(12, "0");
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  const rand = Array.from(bytes, (b) => BASE62[b % 62]).join("");
  return `ses_${timePart}${rand}`;
}

function isCanonical(id) {
  return /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/.test(id || "") && /^[0-9a-f]{9}f[c-f][0-9a-f]$/.test((id || "").slice(4, 16));
}

function portOpen(host, port, timeout = 700) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

async function proxyAvailable() {
  const u = new URL(PROXY);
  return portOpen(u.hostname, Number(u.port || 80));
}

function run(cmd, args, { timeout = 20000, input = null, onChild = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT });
    let out = "";
    let err = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) child.kill("SIGKILL");
    }, timeout);
    onChild?.(child);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      finished = true;
      clearTimeout(timer);
      resolve({ code: -1, out, err: String(e) });
    });
    child.on("close", (code) => {
      finished = true;
      clearTimeout(timer);
      resolve({ code, out, err });
    });
    if (input !== null) child.stdin.write(input);
    child.stdin.end();
  });
}

function splitStatus(out) {
  const i = out.lastIndexOf(STATUS_MARK);
  if (i < 0) return { body: out, status: 0 };
  const status = Number(out.slice(i + STATUS_MARK.length).trim()) || 0;
  return { body: out.slice(0, i), status };
}

function curlArgs(url, { method = "GET", headers = [], timeout = 20, proxy = true } = {}) {
  const args = ["-sS", "-m", String(timeout), "-X", method];
  if (proxy) args.push("-x", PROXY);
  for (const h of headers) args.push("-H", h);
  args.push("-w", STATUS_MARK + "%{http_code}", url);
  return args;
}

async function getEgressIp() {
  const useProxy = await proxyAvailable();
  const r = await run("curl", curlArgs("https://cloudflare.com/cdn-cgi/trace", { timeout: 8, proxy: useProxy }), {
    timeout: 10000,
  });
  const match = r.out.match(/^ip=(.+)$/m);
  if (match?.[1]) return match[1].trim();
  const alt = await run("curl", curlArgs("https://api.ipify.org", { timeout: 8, proxy: useProxy }), {
    timeout: 10000,
  });
  return alt.out.trim().slice(0, 80) || "unknown";
}

function warpStatus() {
  const result = spawnSync("warp-cli", ["--accept-tos", "status"], {
    encoding: "utf8",
    timeout: 4000,
  });
  if (result.error?.code === "ENOENT") {
    return { installed: false, connected: false, text: "warp-cli not installed", backgroundRunning: false };
  }
  const text = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const connected = /connected|healthy/i.test(text);
  return {
    installed: true,
    connected,
    text: text.split("\n")[0] || "unknown",
    backgroundRunning: connected,
  };
}

function parseSse(raw) {
  let content = "";
  let reasoning = "";
  let usage = null;
  let streamError = null;
  let done = false;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (data === "[DONE]") {
      done = true;
      continue;
    }
    try {
      const j = JSON.parse(data);
      if (j?.error) {
        const e = j.error;
        streamError = typeof e === "string" ? e : e?.message || JSON.stringify(e);
        continue;
      }
      const delta = j?.choices?.[0]?.delta || {};
      content += delta.content ?? j?.choices?.[0]?.text ?? "";
      reasoning += delta.reasoning_content ?? delta.reasoning ?? delta.thought ?? "";
      if (j?.usage) usage = j.usage;
    } catch {}
  }
  return { content, reasoning, usage, streamError, done };
}

function bypassHeaders(session, stream = true) {
  return [
    "content-type: application/json",
    "authorization: Bearer public",
    `user-agent: ${UA}`,
    "x-opencode-client: cli",
    `x-opencode-session: ${session}`,
    `x-opencode-session-id: ${session}`,
    `x-session-affinity: ${session}`,
    `x-session-id: ${session}`,
    "x-opencode-project: global",
    `accept: ${stream ? "text/event-stream" : "*/*"}`,
  ];
}

async function testModel(model, messages, session, onChild = null) {
  const useProxy = await proxyAvailable();
  const systemNote =
    "IMPORTANT: You are in direct conversational code generation mode. Do NOT invoke any tools (like `read` or `shell`). Instead, write and present the complete code, solution and explanations directly in your text response.";
  const body = JSON.stringify({
    model,
    max_tokens: 512,
    stream: true,
    messages: [{ role: "system", content: systemNote }, ...messages],
    tools: TOOLS.map((t) => ({ type: "function", function: t })),
  });
  const args = curlArgs(CHAT_URL, {
    method: "POST",
    headers: bypassHeaders(session),
    timeout: 90,
    proxy: useProxy,
  });
  args.splice(args.indexOf("-w"), 0, "--data-binary", "@-");
  const r = await run("curl", args, { timeout: 95000, input: body, onChild });
  const { body: raw, status } = splitStatus(r.out);
  const parsed = parseSse(raw);
  let detail = parsed.streamError || "";
  if (!detail && status !== 200) {
    try {
      const j = JSON.parse(raw);
      detail = j?.message || j?.error?.message || j?.error || raw;
    } catch {
      detail = raw;
    }
  }
  return {
    ok: status === 200 && !parsed.streamError,
    statusCode: status || (parsed.streamError ? 429 : 500),
    response: parsed.content || parsed.reasoning || "",
    usage: parsed.usage,
    error: detail.slice(0, 2000),
    raw: raw.trim().slice(0, 4000),
    done: parsed.done,
  };
}

async function loadModels() {
  const useProxy = await proxyAvailable();
  const r = await run("curl", curlArgs(MODELS_URL, { headers: bypassHeaders(state.session, false), timeout: 15, proxy: useProxy }), {
    timeout: 18000,
  });
  const { body } = splitStatus(r.out);
  try {
    const j = JSON.parse(body);
    const list = Array.isArray(j?.data) ? j.data : [];
    const models = list
      .map((m) => ({ id: String(m.id || ""), name: String(m.name || m.id || "") }))
      .filter((m) => m.id);
    if (models.length) {
      models.sort((a, b) => Number(b.id.includes("free")) - Number(a.id.includes("free")) || a.id.localeCompare(b.id));
      return { models, source: "live" };
    }
  } catch {}
  return { models: FALLBACK_MODELS.map((id) => ({ id, name: id })), source: "fallback" };
}

const FAILOVER_ORDER = ["td", "OpenRouter", "wusrouter", "vpsm"];
let freeRoutesCache = null;
let freeRoutesAt = 0;

function readFreeRoutes() {
  if (freeRoutesCache && Date.now() - freeRoutesAt < 30_000) return freeRoutesCache;
  let sqlite;
  try {
    sqlite = nodeRequire("node:sqlite");
  } catch {
    return [];
  }
  if (!sqlite?.DatabaseSync) return [];
  const homes = [
    process.env.AUTOCODE_HOME,
    process.env.T3CODE_BASE_DIR,
    process.env.T3CODE_HOME,
    "/root/autojobs/data",
    "/root/bot-autojobs/data",
  ].filter((v) => typeof v === "string" && v.trim().length > 0);
  for (const home of homes) {
    for (const dbPath of [
      path.join(home, "userdata", "statev2.sqlite"),
      path.join(home, "statev2.sqlite"),
    ]) {
      if (!fs.existsSync(dbPath)) continue;
      try {
        const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
        const rows = db
          .prepare("SELECT name, base_url, api_key, headers, models, enabled FROM app_custom_providers")
          .all();
        db.close();
        const routes = [];
        for (const row of rows) {
          if (!row.enabled || !row.base_url || !row.api_key) continue;
          let models = [];
          try {
            const parsed = JSON.parse(row.models || "[]");
            models = parsed
              .map((m) => (typeof m === "string" ? m : m?.id))
              .filter((m) => typeof m === "string" && m);
          } catch {}
          let headers = {};
          try {
            const parsed = JSON.parse(row.headers || "[]");
            for (const h of parsed) {
              if (h?.key && typeof h.value === "string") headers[h.key] = h.value;
            }
          } catch {}
          const freeModels = models.filter((m) => /free/i.test(m));
          if (!freeModels.length) continue;
          routes.push({
            name: String(row.name || ""),
            baseUrl: String(row.base_url).replace(/\/+$/, ""),
            apiKey: String(row.api_key),
            headers,
            freeModels,
          });
        }
        freeRoutesCache = routes;
        freeRoutesAt = Date.now();
        return routes;
      } catch {}
    }
  }
  return [];
}

function freeRouteCandidates() {
  const routes = readFreeRoutes();
  const ordered = [
    ...FAILOVER_ORDER.map((name) => routes.find((r) => r.name === name)).filter(Boolean),
    ...routes.filter((r) => !FAILOVER_ORDER.includes(r.name)),
  ];
  return ordered
    .filter((r) => r.freeModels.length)
    .map((route) => ({ route, model: route.freeModels[0] }))
    .slice(0, 4);
}

function pickFreeRoute() {
  return freeRouteCandidates()[0] || null;
}

async function callFreeRoute(selection, messages) {
  const useProxy = await proxyAvailable();
  const headers = [
    "content-type: application/json",
    `authorization: Bearer ${selection.route.apiKey}`,
    ...Object.entries(selection.route.headers).map(([k, v]) => `${k}: ${v}`),
  ];
  const args = curlArgs(`${selection.route.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    timeout: 25,
    proxy: useProxy,
  });
  args.splice(args.indexOf("-w"), 0, "--data-binary", "@-");
  const body = JSON.stringify({ model: selection.model, messages, stream: false, max_tokens: 512 });
  const r = await run("curl", args, { timeout: 30000, input: body });
  const { body: raw, status } = splitStatus(r.out);
  try {
    const j = JSON.parse(raw);
    const text = j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.text ?? "";
    return {
      ok: status === 200 && Boolean(text),
      statusCode: status,
      response: text,
      usage: j?.usage || null,
      error: j?.error?.message || "",
      raw: raw.trim().slice(0, 2000),
    };
  } catch {
    return { ok: false, statusCode: status, response: "", usage: null, error: raw.slice(0, 500) };
  }
}

async function statusPayload() {
  const [ip, warp, proxy] = await Promise.all([getEgressIp(), Promise.resolve(warpStatus()), proxyAvailable()]);
  const limitState =
    state.lastTest?.statusCode === 429 ? "full" : state.lastTest?.statusCode === 200 ? "ok" : "unknown";
  return {
    ok: true,
    enabled: state.enabled,
    session: state.session,
    sessionValid: isCanonical(state.session),
    ip,
    limitState,
    proxy: { available: proxy, endpoint: PROXY },
    warp: { ...warp, backgroundRunning: warp.backgroundRunning && proxy },
    lastReset: state.lastReset,
    lastTest: state.lastTest,
    history: state.history.slice(0, 12),
  };
}

function pushHistory(entry) {
  state.history.unshift({ at: new Date().toISOString(), ...entry });
  state.history = state.history.slice(0, 40);
}

function json(res, data, code = 200) {
  const payload = JSON.stringify(data);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (d) => {
      data += d;
      if (data.length > 200000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

async function resetSessionOnly() {
  const started = Date.now();
  const oldSession = state.session;
  const oldIp = await getEgressIp();
  const newSession = mintSession();
  state.session = newSession;
  const record = {
    type: "reset",
    at: new Date().toISOString(),
    ok: true,
    durationMs: Date.now() - started,
    oldIp,
    newIp: oldIp,
    ipChanged: false,
    oldSession,
    newSession,
    sessionChanged: oldSession !== newSession,
    statusCode: 200,
    mode: "session-only",
    isolated: true,
  };
  state.lastReset = record;
  pushHistory(record);
  saveState();
  return record;
}

async function handleReset(res) {
  if (!state.enabled) return json(res, { ok: false, error: "Reset mechanism disabled" }, 409);
  const record = await resetSessionOnly();
  return json(res, { ok: record.ok, ...record });
}

function certCheck() {
  const r = spawnSync(
    "openssl",
    ["x509", "-in", "/etc/letsencrypt/live/oc.tokendeal.cloud/fullchain.pem", "-noout", "-enddate"],
    { encoding: "utf8", timeout: 3000 },
  );
  const match = (r.stdout || "").match(/notAfter=(.+)/);
  if (!match?.[1]) return { ok: false, detail: "cert nahi mila" };
  const days = Math.floor((Date.parse(match[1].trim()) - Date.now()) / 86400000);
  return { ok: days > 5, detail: `${days} din baqi` };
}

async function runChecks() {
  const checks = [];
  const add = (id, label, ok, detail) => checks.push({ id, label, ok: Boolean(ok), detail });
  const [proxy, socksOpen, warp, ip] = await Promise.all([
    proxyAvailable(),
    portOpen("127.0.0.1", 40000),
    Promise.resolve(warpStatus()),
    getEgressIp(),
  ]);
  const nginxFile = "/etc/nginx/sites-enabled/oc.tokendeal.cloud";
  let nginxOk = false;
  try {
    nginxOk = fs.readFileSync(nginxFile, "utf8").includes("127.0.0.1:8791");
  } catch {}
  add("server", "Node service /api check", true, "server.mjs jawab de raha hai");
  add("nginx", "nginx vhost oc.tokendeal.cloud", nginxOk, nginxOk ? "→ 127.0.0.1:8791" : "vhost ya proxy missing");
  const cert = certCheck();
  add("cert", "SSL certificate", cert.ok, cert.detail);
  add("proxy", "Privoxy HTTP 8118", proxy, proxy ? PROXY : "offline");
  add("warp", "Cloudflare WARP", warp.connected, warp.text);
  add("socks", "WARP SOCKS 40000", socksOpen, socksOpen ? "listening" : "band");
  add("ip", "Egress IP", ip && ip !== "unknown", ip);
  add("session", "Canonical session", isCanonical(state.session), state.session);
  const upstream = await run(
    "curl",
    curlArgs(MODELS_URL, { headers: bypassHeaders(state.session, false), timeout: 12, proxy }),
    { timeout: 15000 },
  );
  const upstreamStatus = splitStatus(upstream.out).status;
  add("upstream", "opencode.ai free lane", upstreamStatus === 200, `HTTP ${upstreamStatus}`);
  add("sessionGen", "Local session generator", isCanonical(mintSession()), "naya ses_... mint ho sakta hai");
  const freeRoute = pickFreeRoute();
  add(
    "freeRoute",
    "Free provider failover",
    Boolean(freeRoute),
    freeRoute ? `${freeRoute.route.name} → ${freeRoute.model}` : "koi free route configured nahi",
  );
  add("autoReset", "Reset mechanism", state.enabled, state.enabled ? "enabled" : "disabled");
  return { ok: checks.every((c) => c.ok), checks };
}

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/status") return json(res, await statusPayload());
    if (url.pathname === "/api/check") return json(res, await runChecks());
    if (url.pathname === "/api/models") return json(res, await loadModels());
    if (url.pathname === "/api/reset" && req.method === "POST") return await handleReset(res);
    if (url.pathname === "/api/toggle" && req.method === "POST") {
      const body = await readBody(req);
      state.enabled = body.enabled !== false;
      saveState();
      return json(res, { ok: true, enabled: state.enabled });
    }
    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = await readBody(req);
      const model = String(body.model || "").trim();
      const rawMessages = Array.isArray(body.messages)
        ? body.messages
        : [{ role: "user", content: body.message }];
      const messages = rawMessages
        .slice(-20)
        .map((m) => ({
          role: ["user", "assistant", "system"].includes(m?.role) ? m.role : "user",
          content: String(m?.content || "").slice(0, 8000),
        }))
        .filter((m) => m.content);
      if (!model || !messages.length) {
        return json(res, { ok: false, error: "model and message are required" }, 400);
      }
      let child = null;
      req.on("aborted", () => child?.kill("SIGKILL"));
      let result = await testModel(model, messages, state.session, (c) => (child = c));
      let resetPerformed = null;
      let failover = null;
      let failoverError = null;
      if (result.statusCode === 429 && state.enabled && body.autoReset !== false) {
        resetPerformed = await resetSessionOnly();
        result = await testModel(model, messages, state.session, (c) => (child = c));
        if (result.statusCode === 429) {
          const candidates = freeRouteCandidates();
          const errors = [];
          for (const selection of candidates) {
            const alt = await callFreeRoute(selection, messages);
            if (alt.ok) {
              failover = { provider: selection.route.name, model: selection.model };
              result = { ...alt, done: true };
              break;
            }
            errors.push(`${selection.route.name}: HTTP ${alt.statusCode}`.slice(0, 60));
          }
          failoverError = failover
            ? null
            : errors.length
              ? errors.join(" | ").slice(0, 300)
              : "Koi configured free provider route nahi mila";
        }
      }
      const record = {
        type: "test",
        at: new Date().toISOString(),
        ok: result.ok,
        model: failover?.model || model,
        statusCode: result.statusCode,
        usage: result.usage,
        autoReset: Boolean(resetPerformed),
        failover,
      };
      state.lastTest = record;
      pushHistory(record);
      saveState();
      return json(res, {
        ...result,
        session: state.session,
        resetPerformed,
        failover,
        failoverError,
        at: new Date().toISOString(),
      });
    }

    const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return json(res, { ok: false, error: "Not found" }, 404);
    }
    res.writeHead(200, { "content-type": `${MIME[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    json(res, { ok: false, error: String(e?.message || e) }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[OLRB] ready → http://${HOST}:${PORT}`);
  console.log(`[OLRB] upstream=${CHAT_URL} proxy=${PROXY}`);
});

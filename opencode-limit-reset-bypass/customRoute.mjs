import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

function candidateDbPaths() {
  const homes = [
    process.env.AUTOCODE_HOME,
    process.env.T3CODE_BASE_DIR,
    process.env.T3CODE_HOME,
    "/root/bot-autojobs/data",
    "/root/autojobs/data",
    "/root/bot-autojobs",
    "/root/autojobs",
  ].filter((v) => typeof v === "string" && v.trim().length > 0);
  const out = [];
  for (const home of homes) {
    out.push(NodePath.join(home, "userdata", "statev2.sqlite"));
    out.push(NodePath.join(home, "statev2.sqlite"));
  }
  return [...new Set(out)];
}

function readCustomProviders() {
  let sqlite;
  try {
    sqlite = nodeRequire("node:sqlite");
  } catch {
    return [];
  }
  if (!sqlite?.DatabaseSync) return [];
  for (const dbPath of candidateDbPaths()) {
    if (!NodeFS.existsSync(dbPath)) continue;
    try {
      const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
      const rows = db
        .prepare("SELECT id, name, base_url, api_key, headers, models, enabled FROM app_custom_providers")
        .all();
      db.close();
      const out = [];
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
        out.push({
          id: String(row.id || ""),
          name: String(row.name || ""),
          baseUrl: String(row.base_url).replace(/\/+$/, ""),
          apiKey: String(row.api_key),
          headers,
          models,
        });
      }
      if (out.length) return out;
    } catch {}
  }
  return [];
}

let cache = null;
let cacheAt = 0;

function providers() {
  if (cache === null || Date.now() - cacheAt > 30_000) {
    cache = readCustomProviders();
    cacheAt = Date.now();
  }
  return cache;
}

export function resolveCustomRoute(model) {
  const slug = String(model || "").trim();
  if (!slug) return null;
  for (const provider of providers()) {
    if (!provider.baseUrl || !provider.models.includes(slug)) continue;
    return {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      headers: provider.headers,
      model: slug,
      providerName: provider.name,
    };
  }
  return null;
}

export function customModelEntries() {
  const entries = [];
  const seen = new Set();
  for (const provider of providers()) {
    for (const model of provider.models) {
      const key = `${provider.name}::${model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ id: model, name: model, providerName: provider.name });
    }
  }
  return entries;
}

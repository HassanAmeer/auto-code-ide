// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
/**
 * Model -> upstream route resolution for the bypass client.
 *
 * The chat thread can stay bound to `opencodebypasssetup` while the user picks
 * a model that actually belongs to a configured custom provider (e.g. a
 * wusrouter/OpenRouter model). Without this resolver the bypass driver sends
 * that model to opencode.ai, which answers 400 "Model is unavailable".
 *
 * This module reads the app's custom-provider catalog (SQLite
 * `app_custom_providers`, written by AppSettingsStore) and returns the correct
 * base URL / API key / headers for the selected model. Zero new dependencies:
 * it uses the same `node:sqlite` builtin the server already relies on.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

export interface CustomRoute {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly headers: Record<string, string>;
  readonly model: string;
  readonly providerName: string;
}

function candidateDbPaths(): string[] {
  const homes = [
    process.env.AUTOCODE_HOME,
    process.env.T3CODE_BASE_DIR,
    process.env.T3CODE_HOME,
    "/root/autojobs/data",
    "/root/bot-autojobs/data",
  ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  const out: string[] = [];
  for (const home of homes) {
    out.push(NodePath.join(home, "userdata", "statev2.sqlite"));
    out.push(NodePath.join(home, "statev2.sqlite"));
  }
  return [...new Set(out)];
}

function readCustomProviders(): Array<{
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  models: string[];
  enabled: boolean;
}> {
  let sqlite: typeof import("node:sqlite") | null = null;
  try {
    sqlite = nodeRequire("node:sqlite") as typeof import("node:sqlite");
  } catch {
    return [];
  }
  if (!sqlite?.DatabaseSync) return [];

  for (const dbPath of candidateDbPaths()) {
    if (!NodeFS.existsSync(dbPath)) continue;
    try {
      const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        const rows = db
          .prepare(
            "SELECT id, name, base_url, api_key, headers, models, enabled FROM app_custom_providers",
          )
          .all() as any[];
        const out: Array<{
          id: string;
          name: string;
          baseUrl: string;
          apiKey: string;
          headers: Record<string, string>;
          models: string[];
          enabled: boolean;
        }> = [];
        for (const row of rows) {
          const models: string[] = [];
          try {
            const parsed = JSON.parse(row.models || "[]");
            if (Array.isArray(parsed)) {
              for (const m of parsed) {
                if (typeof m === "string") models.push(m);
                else if (m && typeof m.id === "string") models.push(m.id);
              }
            }
          } catch {}
          const headers: Record<string, string> = {};
          try {
            const parsed = JSON.parse(row.headers || "[]");
            if (Array.isArray(parsed)) {
              for (const h of parsed) {
                if (h && typeof h.key === "string" && typeof h.value === "string") {
                  headers[h.key] = h.value;
                }
              }
            }
          } catch {}
          out.push({
            id: String(row.id || ""),
            name: String(row.name || ""),
            baseUrl: String(row.base_url || "").replace(/\/+$/, ""),
            apiKey: String(row.api_key || ""),
            headers,
            models,
            enabled: Boolean(row.enabled),
          });
        }
        if (out.length > 0) return out;
      } finally {
        db.close();
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

let cachedProviders: ReturnType<typeof readCustomProviders> | null = null;
let cacheTime = 0;

/** Resolve a model to a custom-provider upstream, or null for the opencode.ai free lane. */
export function resolveCustomRoute(model: string): CustomRoute | null {
  const now = Date.now();
  if (cachedProviders === null || now - cacheTime > 30_000) {
    cachedProviders = readCustomProviders();
    cacheTime = now;
  }
  const slug = String(model || "").trim();
  if (!slug) return null;

  for (const provider of cachedProviders ?? []) {
    if (!provider.enabled || !provider.baseUrl) continue;
    // Exact match first (most custom catalogs ship full slug lists).
    if (provider.models.includes(slug)) {
      return {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        headers: provider.headers,
        model: slug,
        providerName: provider.name,
      };
    }
  }
  return null;
}

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalDate:off
import * as NodeFS from "node:fs";
import { createRequire } from "node:module";
import * as NodePath from "node:path";

const nodeRequire = createRequire(import.meta.url);

export interface CustomHeaderConfig {
  key: string;
  value: string;
}

export interface CustomModelConfig {
  id: string;
  name?: string;
}

export interface StoredCustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  headers?: CustomHeaderConfig[];
  models: CustomModelConfig[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function getNodeSqlite() {
  try {
    // The server runs as ESM, where a bare `require` is undefined. Without
    // createRequire the store silently fell back to the JSON mirror and the
    // settings never reached the live database.
    return nodeRequire("node:sqlite") as typeof import("node:sqlite");
  } catch {
    return null;
  }
}

let dbInstance: any = null;
let currentDbPath: string | null = null;

function getDb(dbPath: string) {
  const sqlite = getNodeSqlite();
  if (!sqlite || !sqlite.DatabaseSync) return null;
  try {
    if (dbInstance && currentDbPath === dbPath) return dbInstance;
    if (dbInstance) {
      try {
        dbInstance.close();
      } catch {}
      dbInstance = null;
    }
    const db = new sqlite.DatabaseSync(dbPath);
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_user_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_custom_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT,
        headers TEXT,
        models TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    dbInstance = db;
    currentDbPath = dbPath;
    return db;
  } catch (err) {
    console.error("Failed to initialize SQLite for app settings:", err);
    return null;
  }
}

function getAppSettingsFilePath(dbPath: string): string {
  const dir = NodePath.dirname(dbPath);
  return NodePath.resolve(dir, "app-settings.json");
}

function getCustomProvidersFilePath(dbPath: string): string {
  const dir = NodePath.dirname(dbPath);
  return NodePath.resolve(dir, "custom-providers-cache.json");
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (NodeFS.existsSync(filePath)) {
      const content = NodeFS.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch {}
  return fallback;
}

function writeJsonFile(filePath: string, data: unknown): void {
  try {
    const dir = NodePath.dirname(filePath);
    if (!NodeFS.existsSync(dir)) {
      NodeFS.mkdirSync(dir, { recursive: true });
    }
    NodeFS.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Failed writing to ${filePath}:`, err);
  }
}

export function getAllAppSettings(dbPath: string): Record<string, any> {
  const fileSettings = readJsonFile<Record<string, any>>(getAppSettingsFilePath(dbPath), {});
  const db = getDb(dbPath);
  if (!db) return fileSettings;

  try {
    const stmt = db.prepare("SELECT key, value FROM app_user_settings");
    const rows = stmt.all() as Array<{ key: string; value: string }>;
    const dbSettings: Record<string, any> = {};
    for (const row of rows) {
      try {
        dbSettings[row.key] = JSON.parse(row.value);
      } catch {
        dbSettings[row.key] = row.value;
      }
    }
    // Settings that only ever lived in the JSON mirror (written before the
    // store could reach SQLite) move into the live database on first read.
    for (const [key, value] of Object.entries(fileSettings)) {
      if (key in dbSettings) continue;
      setAppSetting(dbPath, key, value);
      dbSettings[key] = value;
    }
    return { ...fileSettings, ...dbSettings };
  } catch (err) {
    console.error("Error reading settings from SQLite:", err);
    return fileSettings;
  }
}

export function setAppSetting(dbPath: string, key: string, value: any): void {
  const fileSettings = readJsonFile<Record<string, any>>(getAppSettingsFilePath(dbPath), {});
  fileSettings[key] = value;
  writeJsonFile(getAppSettingsFilePath(dbPath), fileSettings);

  const db = getDb(dbPath);
  if (!db) return;

  try {
    const stmt = db.prepare(`
      INSERT INTO app_user_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(key, JSON.stringify(value), new Date().toISOString());
  } catch (err) {
    console.error("Error writing setting to SQLite:", err);
  }
}

export function normalizeStoredCustomProvider(p: any): StoredCustomProvider {
  const rawId = p?.id ?? p?.instanceId ?? `custom_${Date.now()}`;
  const strId = String(rawId);
  const cleanId = strId.startsWith("custom_") ? strId : `custom_${strId}`;
  const name = String(p?.name ?? p?.displayName ?? "Custom Provider");
  const baseUrl = String(p?.baseUrl ?? p?.base_url ?? "");
  const apiKey = p?.apiKey ?? p?.api_key ?? "";

  let headers: CustomHeaderConfig[] = [];
  if (Array.isArray(p?.headers)) {
    headers = p.headers;
  } else if (typeof p?.headers === "string") {
    try {
      const parsed = JSON.parse(p.headers);
      if (Array.isArray(parsed)) headers = parsed;
    } catch {}
  }

  let models: CustomModelConfig[] = [];
  if (Array.isArray(p?.models)) {
    models = p.models;
  } else if (typeof p?.models === "string") {
    try {
      const parsed = JSON.parse(p.models);
      if (Array.isArray(parsed)) models = parsed;
    } catch {}
  }

  const enabled = p?.enabled !== undefined ? Boolean(p.enabled) : true;
  const createdAt = p?.createdAt ?? p?.created_at ?? new Date().toISOString();
  const updatedAt = p?.updatedAt ?? p?.updated_at ?? new Date().toISOString();

  return {
    id: cleanId,
    name,
    baseUrl,
    apiKey,
    headers,
    models,
    enabled,
    createdAt,
    updatedAt,
  };
}

export function listCustomProviders(dbPath: string): StoredCustomProvider[] {
  const fileProviders = readJsonFile<any[]>(getCustomProvidersFilePath(dbPath), []);
  const normalizedFileProviders = (Array.isArray(fileProviders) ? fileProviders : [])
    .filter((p) => Boolean(p && typeof p === "object"))
    .map(normalizeStoredCustomProvider);

  const db = getDb(dbPath);
  if (!db) return normalizedFileProviders;

  try {
    const stmt = db.prepare("SELECT * FROM app_custom_providers ORDER BY updated_at DESC");
    const rows = stmt.all() as any[];
    if (rows.length === 0 && normalizedFileProviders.length > 0) {
      for (const p of normalizedFileProviders) {
        saveCustomProvider(dbPath, p);
      }
      return normalizedFileProviders;
    }
    return rows.map((row) => normalizeStoredCustomProvider(row));
  } catch (err) {
    console.error("Error listing custom providers from SQLite:", err);
    return normalizedFileProviders;
  }
}

export function saveCustomProvider(dbPath: string, provider: StoredCustomProvider): void {
  const norm = normalizeStoredCustomProvider(provider);
  const providers = readJsonFile<StoredCustomProvider[]>(getCustomProvidersFilePath(dbPath), []);
  const idx = providers.findIndex(
    (p) => p && (p.id === norm.id || (p as any).instanceId === norm.id),
  );
  if (idx !== -1) {
    providers[idx] = norm;
  } else {
    providers.push(norm);
  }
  writeJsonFile(getCustomProvidersFilePath(dbPath), providers);

  const db = getDb(dbPath);
  if (!db) return;

  try {
    const stmt = db.prepare(`
      INSERT INTO app_custom_providers (id, name, base_url, api_key, headers, models, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        base_url = excluded.base_url,
        api_key = excluded.api_key,
        headers = excluded.headers,
        models = excluded.models,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      norm.id,
      norm.name,
      norm.baseUrl,
      norm.apiKey ?? "",
      JSON.stringify(norm.headers ?? []),
      JSON.stringify(norm.models ?? []),
      norm.enabled ? 1 : 0,
      norm.createdAt || new Date().toISOString(),
      norm.updatedAt || new Date().toISOString(),
    );
  } catch (err) {
    console.error("Error saving custom provider to SQLite:", err);
  }
}

export function deleteCustomProvider(dbPath: string, id: string): void {
  if (!id) return;
  const rawId = String(id);
  const cleanId = rawId.startsWith("custom_") ? rawId : `custom_${rawId}`;
  const providers = readJsonFile<StoredCustomProvider[]>(getCustomProvidersFilePath(dbPath), []);
  const filtered = providers.filter(
    (p) =>
      p &&
      p.id !== rawId &&
      p.id !== cleanId &&
      (p as any).instanceId !== rawId &&
      (p as any).instanceId !== cleanId,
  );
  writeJsonFile(getCustomProvidersFilePath(dbPath), filtered);

  const db = getDb(dbPath);
  if (!db) return;

  try {
    const stmt = db.prepare("DELETE FROM app_custom_providers WHERE id = ? OR id = ?");
    stmt.run(rawId, cleanId);
  } catch (err) {
    console.error("Error deleting custom provider from SQLite:", err);
  }
}

export function syncCustomProviders(dbPath: string, providers: StoredCustomProvider[]): void {
  const normalized = (Array.isArray(providers) ? providers : [])
    .filter((p) => Boolean(p && typeof p === "object"))
    .map(normalizeStoredCustomProvider);
  writeJsonFile(getCustomProvidersFilePath(dbPath), normalized);
  for (const p of normalized) {
    saveCustomProvider(dbPath, p);
  }
}

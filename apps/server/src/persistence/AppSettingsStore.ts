// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalDate:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:sqlite") as typeof import("node:sqlite");
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
    if (rows.length === 0 && Object.keys(fileSettings).length > 0) {
      for (const [k, v] of Object.entries(fileSettings)) {
        setAppSetting(dbPath, k, v);
      }
      return fileSettings;
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

export function listCustomProviders(dbPath: string): StoredCustomProvider[] {
  const fileProviders = readJsonFile<StoredCustomProvider[]>(
    getCustomProvidersFilePath(dbPath),
    [],
  );
  const db = getDb(dbPath);
  if (!db) return fileProviders;

  try {
    const stmt = db.prepare("SELECT * FROM app_custom_providers ORDER BY updated_at DESC");
    const rows = stmt.all() as any[];
    if (rows.length === 0 && fileProviders.length > 0) {
      for (const p of fileProviders) {
        saveCustomProvider(dbPath, p);
      }
      return fileProviders;
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key || "",
      headers: typeof row.headers === "string" ? JSON.parse(row.headers) : (row.headers ?? []),
      models: typeof row.models === "string" ? JSON.parse(row.models) : (row.models ?? []),
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    console.error("Error listing custom providers from SQLite:", err);
    return fileProviders;
  }
}

export function saveCustomProvider(dbPath: string, provider: StoredCustomProvider): void {
  const providers = readJsonFile<StoredCustomProvider[]>(getCustomProvidersFilePath(dbPath), []);
  const idx = providers.findIndex((p) => p.id === provider.id);
  if (idx !== -1) {
    providers[idx] = provider;
  } else {
    providers.push(provider);
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
      provider.id,
      provider.name,
      provider.baseUrl,
      provider.apiKey ?? "",
      JSON.stringify(provider.headers ?? []),
      JSON.stringify(provider.models ?? []),
      provider.enabled ? 1 : 0,
      provider.createdAt || new Date().toISOString(),
      provider.updatedAt || new Date().toISOString(),
    );
  } catch (err) {
    console.error("Error saving custom provider to SQLite:", err);
  }
}

export function deleteCustomProvider(dbPath: string, id: string): void {
  const providers = readJsonFile<StoredCustomProvider[]>(getCustomProvidersFilePath(dbPath), []);
  const filtered = providers.filter((p) => p.id !== id);
  writeJsonFile(getCustomProvidersFilePath(dbPath), filtered);

  const db = getDb(dbPath);
  if (!db) return;

  try {
    const stmt = db.prepare("DELETE FROM app_custom_providers WHERE id = ?");
    stmt.run(id);
  } catch (err) {
    console.error("Error deleting custom provider from SQLite:", err);
  }
}

export function syncCustomProviders(dbPath: string, providers: StoredCustomProvider[]): void {
  writeJsonFile(getCustomProvidersFilePath(dbPath), providers);
  for (const p of providers) {
    saveCustomProvider(dbPath, p);
  }
}

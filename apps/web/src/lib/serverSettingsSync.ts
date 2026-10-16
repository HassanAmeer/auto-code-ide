import type { CustomProvider } from "./customProviders";

let isInitialized = false;
let isSyncing = false;

export async function fetchServerCustomProviders(): Promise<CustomProvider[] | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/custom-provider/list");
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; providers?: CustomProvider[] };
    if (data.ok && Array.isArray(data.providers)) {
      return data.providers;
    }
  } catch (err) {
    console.warn("Failed to fetch custom providers from server:", err);
  }
  return null;
}

export async function syncCustomProvidersToServer(providers: CustomProvider[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/custom-provider/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers }),
    });
  } catch (err) {
    console.warn("Failed to sync custom providers to server:", err);
  }
}

export async function fetchServerAppSettings(): Promise<Record<string, any> | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/app-settings");
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; settings?: Record<string, any> };
    if (data.ok && data.settings) {
      return data.settings;
    }
  } catch (err) {
    console.warn("Failed to fetch app settings from server:", err);
  }
  return null;
}

export async function saveServerSetting(key: string, value: any): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // 1. Immediately cache in localStorage for instant synchronous reads
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));

    // 2. Persist to server SQLite database
    void fetch("/api/app-settings/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    }).catch(() => {});
  } catch (err) {
    console.warn(`Failed to save setting ${key}:`, err);
  }
}

export function loadServerSetting<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch {
    return fallback;
  }
}

export async function initServerSettingsSync(): Promise<void> {
  if (typeof window === "undefined" || isSyncing) return;
  isSyncing = true;

  try {
    // 1. Sync custom providers
    const serverProviders = await fetchServerCustomProviders();
    const localRaw = localStorage.getItem("t3_custom_providers_v1");
    let localProviders: CustomProvider[] = [];
    if (localRaw) {
      try {
        localProviders = JSON.parse(localRaw) as CustomProvider[];
      } catch {}
    }

    if (serverProviders && serverProviders.length > 0) {
      // Server has providers: update localStorage and dispatch update event
      localStorage.setItem("t3_custom_providers_v1", JSON.stringify(serverProviders));
      window.dispatchEvent(
        new CustomEvent("t3_custom_providers_updated", { detail: serverProviders }),
      );
    } else if (localProviders.length > 0) {
      // Server empty but client has local providers: seed server database
      void syncCustomProvidersToServer(localProviders);
    }

    // 2. Sync general app settings (TinyFish API key, STT settings, auto-retry, etc.)
    const serverSettings = await fetchServerAppSettings();
    if (serverSettings && Object.keys(serverSettings).length > 0) {
      for (const [key, val] of Object.entries(serverSettings)) {
        if (val !== undefined && val !== null) {
          localStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
        }
      }
      // Dispatch notifications so reactive hooks update
      window.dispatchEvent(new CustomEvent("t3_tinyfish_config_updated"));
      window.dispatchEvent(new CustomEvent("t3_stt_settings_updated"));
      window.dispatchEvent(new CustomEvent("t3_autoretry_settings_updated"));
      window.dispatchEvent(
        new CustomEvent("t3_server_settings_synced", { detail: serverSettings }),
      );
    } else {
      // Seed server database with any existing local settings
      const seedKeys = [
        "t3_tinyfish_config",
        "t3_stt_settings_v1",
        "t3_autoretry_settings_v1",
        "t3_terminal_ssh",
        "t3_terminal_keys",
      ];
      const initialSettings: Record<string, any> = {};
      for (const k of seedKeys) {
        const item = localStorage.getItem(k);
        if (item) {
          try {
            initialSettings[k] = JSON.parse(item);
          } catch {
            initialSettings[k] = item;
          }
        }
      }
      if (Object.keys(initialSettings).length > 0) {
        void fetch("/api/app-settings/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: initialSettings }),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("Error in initServerSettingsSync:", err);
  } finally {
    isSyncing = false;
  }

  if (!isInitialized) {
    isInitialized = true;
    window.addEventListener("focus", () => {
      void initServerSettingsSync();
    });
    window.addEventListener("online", () => {
      void initServerSettingsSync();
    });
  }
}

import { type CustomProvider, normalizeCustomProvider } from "./customProviders";

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

/**
 * Client settings that follow the user to every machine: the ones that
 * describe how the assistant should behave, not how this particular screen
 * looks. They are stored in the server's live database (the same
 * `app_user_settings` table the other settings use) and read back on boot.
 */
export const SHARED_CLIENT_SETTINGS_KEY = "t3code:client-settings-shared:v1";

export const SHARED_CLIENT_SETTING_KEYS = [
  "favorites",
  "providerModelPreferences",
  "pullRequestMergeMethodOverrides",
  "sidebarProjectGroupingMode",
  "sidebarProjectGroupingOverrides",
  "sidebarProjectSortOrder",
  "sidebarThreadSortOrder",
  "sidebarThreadPreviewCount",
  "sidebarWorkingShelfEnabled",
  "legacySidebarEnabled",
  "showSkillsInSlashMenu",
  "followUpBehavior",
  "planModeEnabled",
  "composerRichTextEnabled",
  "composerCollapseOnScroll",
  "sendShortcut",
  "diffLayout",
  "diffIgnoreWhitespace",
  "diffFilesCollapsed",
  "diffColorScheme",
  "timestampFormat",
  "wordWrap",
  "fontSizeInterface",
  "fontSizePrompt",
  "fontSizeCode",
  "fontSizeTerminal",
  "fontFamilyCode",
  "fontFamilyComposer",
  "fontFamilySans",
  "fontFamilyTerminal",
  "fontSmoothing",
  "appearanceContrast",
  "glassOpacity",
  "panelAnimationDurationMs",
  "chatWidth",
  "loadBalancingEnabled",
  "loadBalancingWeights",
  "contextWindowMeterEnabled",
  "proactivePanelsEnabled",
  "persistComposerContextStrip",
  "notificationMode",
  "inAppNotificationsEnabled",
  "dismissedProviderUpdateNotificationKeys",
  "confirmQuit",
  "confirmThreadArchive",
  "confirmThreadDelete",
  "confirmThreadUnpin",
  "environmentIdentificationMode",
] as const;

export type SharedClientSettingKey = (typeof SHARED_CLIENT_SETTING_KEYS)[number];

/** The shared subset of the client settings, ready for the server. */
export function pickSharedClientSettings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const shared: Record<string, unknown> = {};
  for (const key of SHARED_CLIENT_SETTING_KEYS) {
    const value = settings[key];
    if (value !== undefined) shared[key] = value;
  }
  return shared;
}

/** Mirror the shared client settings into the server's live database. */
export async function saveSharedClientSettings(settings: Record<string, unknown>): Promise<void> {
  const shared = pickSharedClientSettings(settings);
  if (Object.keys(shared).length === 0) return;
  await saveServerSetting(SHARED_CLIENT_SETTINGS_KEY, shared);
}

/** The shared client settings the server holds, or null when it has none. */
export async function fetchSharedClientSettings(): Promise<Record<string, unknown> | null> {
  const serverSettings = await fetchServerAppSettings();
  const shared = serverSettings?.[SHARED_CLIENT_SETTINGS_KEY];
  if (!shared || typeof shared !== "object") return null;
  return shared as Record<string, unknown>;
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
      const normalized = serverProviders
        .map(normalizeCustomProvider)
        .filter((p): p is CustomProvider => p !== null);
      if (normalized.length > 0) {
        localStorage.setItem("t3_custom_providers_v1", JSON.stringify(normalized));
        window.dispatchEvent(
          new CustomEvent("t3_custom_providers_updated", { detail: normalized }),
        );
      }
    } else if (localProviders.length > 0) {
      // Server empty but client has local providers: seed server database
      void syncCustomProvidersToServer(localProviders);
    }

    // 2. Sync general app settings (TinyFish API key, STT settings, auto-retry, etc.)
    const serverSettings = await fetchServerAppSettings();

    // The shared client settings the server holds win over this device's copy:
    // that is what makes another machine pick up the same favourites, model
    // preferences and behaviour settings.
    const sharedClientSettings = serverSettings?.[SHARED_CLIENT_SETTINGS_KEY];
    if (sharedClientSettings && typeof sharedClientSettings === "object") {
      window.dispatchEvent(
        new CustomEvent("t3_shared_client_settings_received", {
          detail: sharedClientSettings as Record<string, unknown>,
        }),
      );
    }

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
        "t3_tinyfish_config_v1",
        "t3code:speech:stt-settings:v1",
        "t3code:auto-retry-settings:v2",
        "adc_terminal_ssh_profiles",
        "adc_terminal_access_keys",
        "t3_execution_engine_settings",
        "t3_composer_web_search_enabled",
        "t3code:speech:tts-settings:v1",
        "t3_app_sound_settings",
        "t3_app_notification_settings",
        "t3code:speech:voice-call-settings:v1",
        "t3:last_selected_model",
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

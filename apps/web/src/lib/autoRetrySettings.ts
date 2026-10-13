import { useState, useEffect } from "react";

export interface AutoRetrySettings {
  enabled: boolean;
  delaySeconds: number;
}

const STORAGE_KEY = "t3code:auto-retry-settings:v1";

export const DEFAULT_AUTO_RETRY_SETTINGS: AutoRetrySettings = {
  enabled: false,
  delaySeconds: 5,
};

export function loadAutoRetrySettings(): AutoRetrySettings {
  if (typeof window === "undefined") return DEFAULT_AUTO_RETRY_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUTO_RETRY_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      enabled:
        typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_AUTO_RETRY_SETTINGS.enabled,
      delaySeconds:
        typeof parsed.delaySeconds === "number" && parsed.delaySeconds > 0
          ? parsed.delaySeconds
          : DEFAULT_AUTO_RETRY_SETTINGS.delaySeconds,
    };
  } catch {
    return DEFAULT_AUTO_RETRY_SETTINGS;
  }
}

export function saveAutoRetrySettings(patch: Partial<AutoRetrySettings>): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadAutoRetrySettings();
    const updated: AutoRetrySettings = {
      ...current,
      ...patch,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("t3-auto-retry-settings-changed", { detail: updated }));
  } catch (err) {
    console.warn("Failed to save auto-retry settings:", err);
  }
}

export function subscribeAutoRetrySettings(
  callback: (settings: AutoRetrySettings) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<AutoRetrySettings>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(loadAutoRetrySettings());
    }
  };
  window.addEventListener("t3-auto-retry-settings-changed", handler);
  return () => {
    window.removeEventListener("t3-auto-retry-settings-changed", handler);
  };
}

export function useAutoRetrySettings(): [
  AutoRetrySettings,
  (patch: Partial<AutoRetrySettings>) => void,
] {
  const [settings, setSettings] = useState<AutoRetrySettings>(loadAutoRetrySettings);

  useEffect(() => {
    setSettings(loadAutoRetrySettings());
    return subscribeAutoRetrySettings(setSettings);
  }, []);

  return [settings, saveAutoRetrySettings];
}

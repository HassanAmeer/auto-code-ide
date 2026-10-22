import { useState, useEffect } from "react";
import { saveServerSetting } from "../serverSettingsSync";

export interface AppNotificationSettings {
  readonly masterEnabled: boolean;
  readonly desktopEnabled: boolean;
  readonly inAppEnabled: boolean;
  readonly onCompletion: boolean;
  readonly onError: boolean;
  readonly onInputNeeded: boolean;
  readonly soundEnabled: boolean;
  readonly presentationStyle: "toast" | "card";
}

export const DEFAULT_NOTIFICATION_SETTINGS: AppNotificationSettings = {
  masterEnabled: true,
  desktopEnabled: true,
  inAppEnabled: true,
  onCompletion: true,
  onError: true,
  onInputNeeded: true,
  soundEnabled: true,
  presentationStyle: "toast",
};

const STORAGE_KEY = "t3_app_notification_settings";

type Listener = (settings: AppNotificationSettings) => void;
const listeners = new Set<Listener>();

export function loadNotificationSettings(): AppNotificationSettings {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      masterEnabled: parsed.masterEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.masterEnabled,
      desktopEnabled: parsed.desktopEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.desktopEnabled,
      inAppEnabled: parsed.inAppEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.inAppEnabled,
      onCompletion: parsed.onCompletion ?? DEFAULT_NOTIFICATION_SETTINGS.onCompletion,
      onError: parsed.onError ?? DEFAULT_NOTIFICATION_SETTINGS.onError,
      onInputNeeded: parsed.onInputNeeded ?? DEFAULT_NOTIFICATION_SETTINGS.onInputNeeded,
      soundEnabled: parsed.soundEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.soundEnabled,
      presentationStyle:
        parsed.presentationStyle === "card"
          ? "card"
          : DEFAULT_NOTIFICATION_SETTINGS.presentationStyle,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function saveNotificationSettings(
  settings: Partial<AppNotificationSettings>,
): AppNotificationSettings {
  const current = loadNotificationSettings();
  const next: AppNotificationSettings = { ...current, ...settings };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      void saveServerSetting(STORAGE_KEY, next);
    } catch {
      // Storage error ignored
    }
  }
  listeners.forEach((listener) => listener(next));
  return next;
}

export function subscribeNotificationSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNotificationSettings(): [
  AppNotificationSettings,
  (update: Partial<AppNotificationSettings>) => void,
] {
  const [settings, setSettings] = useState<AppNotificationSettings>(loadNotificationSettings);

  useEffect(() => {
    return subscribeNotificationSettings((newSettings) => {
      setSettings(newSettings);
    });
  }, []);

  return [settings, saveNotificationSettings];
}

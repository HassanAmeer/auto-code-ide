import { useState, useEffect } from "react";

export interface AppSoundSettings {
  readonly masterSoundEnabled: boolean;
  readonly responseDoneSound: boolean;
  readonly waitingWaveSound: boolean;
  readonly notificationSound: boolean;
  readonly errorSound: boolean;
  readonly timeoutSound: boolean;
  readonly soundVolume: number; // 0.0 to 1.0
}

export const DEFAULT_SOUND_SETTINGS: AppSoundSettings = {
  masterSoundEnabled: true,
  responseDoneSound: true,
  waitingWaveSound: true,
  notificationSound: true,
  errorSound: true,
  timeoutSound: true,
  soundVolume: 0.7,
};

const STORAGE_KEY = "t3_app_sound_settings";

type Listener = (settings: AppSoundSettings) => void;
const listeners = new Set<Listener>();

export function loadSoundSettings(): AppSoundSettings {
  if (typeof window === "undefined") return DEFAULT_SOUND_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOUND_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      masterSoundEnabled: parsed.masterSoundEnabled ?? DEFAULT_SOUND_SETTINGS.masterSoundEnabled,
      responseDoneSound: parsed.responseDoneSound ?? DEFAULT_SOUND_SETTINGS.responseDoneSound,
      waitingWaveSound: parsed.waitingWaveSound ?? DEFAULT_SOUND_SETTINGS.waitingWaveSound,
      notificationSound: parsed.notificationSound ?? DEFAULT_SOUND_SETTINGS.notificationSound,
      errorSound: parsed.errorSound ?? DEFAULT_SOUND_SETTINGS.errorSound,
      timeoutSound: parsed.timeoutSound ?? DEFAULT_SOUND_SETTINGS.timeoutSound,
      soundVolume:
        typeof parsed.soundVolume === "number"
          ? Math.max(0, Math.min(1, parsed.soundVolume))
          : DEFAULT_SOUND_SETTINGS.soundVolume,
    };
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
}

export function saveSoundSettings(settings: Partial<AppSoundSettings>): AppSoundSettings {
  const current = loadSoundSettings();
  const next: AppSoundSettings = { ...current, ...settings };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage error ignored
    }
  }
  listeners.forEach((listener) => listener(next));
  return next;
}

export function subscribeSoundSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSoundSettings(): [
  AppSoundSettings,
  (update: Partial<AppSoundSettings>) => void,
] {
  const [settings, setSettings] = useState<AppSoundSettings>(loadSoundSettings);

  useEffect(() => {
    return subscribeSoundSettings((newSettings) => {
      setSettings(newSettings);
    });
  }, []);

  return [settings, saveSoundSettings];
}

import { useState, useEffect } from "react";

export interface VoiceCallSettings {
  thinkingWaveSound: boolean;
}

const STORAGE_KEY = "t3code:speech:voice-call-settings:v1";

export const DEFAULT_VOICE_CALL_SETTINGS: VoiceCallSettings = {
  thinkingWaveSound: true,
};

export function loadVoiceCallSettings(): VoiceCallSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_CALL_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_CALL_SETTINGS;
    return { ...DEFAULT_VOICE_CALL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VOICE_CALL_SETTINGS;
  }
}

export function saveVoiceCallSettings(settings: Partial<VoiceCallSettings>): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadVoiceCallSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("t3-voice-call-settings-changed", { detail: updated }));
  } catch (err) {
    console.warn("Failed to save voice call settings:", err);
  }
}

export function subscribeVoiceCallSettings(
  callback: (settings: VoiceCallSettings) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<VoiceCallSettings>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(loadVoiceCallSettings());
    }
  };
  window.addEventListener("t3-voice-call-settings-changed", handler);
  return () => {
    window.removeEventListener("t3-voice-call-settings-changed", handler);
  };
}

export function useVoiceCallSettings(): [
  VoiceCallSettings,
  (patch: Partial<VoiceCallSettings>) => void,
] {
  const [settings, setSettings] = useState<VoiceCallSettings>(loadVoiceCallSettings);

  useEffect(() => {
    return subscribeVoiceCallSettings(setSettings);
  }, []);

  const update = (patch: Partial<VoiceCallSettings>) => {
    saveVoiceCallSettings(patch);
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  return [settings, update];
}

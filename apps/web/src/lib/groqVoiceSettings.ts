/**
 * Groq AI Voice Settings Store (apps/web/src/lib/groqVoiceSettings.ts)
 *
 * Persists Groq API Key, toggle state, and selected model for the Super Call Assistant.
 */

import { useState, useEffect } from "react";

export interface GroqVoiceSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
}

const STORAGE_KEY = "t3_voice_groq_settings";

export const GROQ_MODEL_OPTIONS = [
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B (Recommended)",
    description: "Flagship accuracy & fast reasoning",
  },
  {
    id: "llama-3.1-8b-instant",
    name: "Llama 3.1 8B Instant",
    description: "Ultra-fast response latency",
  },
  {
    id: "mixtral-8x7b-32768",
    name: "Mixtral 8x7B 32k",
    description: "High speed mixture-of-experts",
  },
  {
    id: "gemma2-9b-it",
    name: "Gemma 2 9B IT",
    description: "Compact Google instruction model",
  },
];

export function loadGroqSettings(): GroqVoiceSettings {
  if (typeof window === "undefined") {
    return { enabled: false, apiKey: "", model: "llama-3.3-70b-versatile" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed.enabled),
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        model: parsed.model || "llama-3.3-70b-versatile",
      };
    }
  } catch {}
  return { enabled: false, apiKey: "", model: "llama-3.3-70b-versatile" };
}

export function saveGroqSettings(settings: Partial<GroqVoiceSettings>): GroqVoiceSettings {
  const current = loadGroqSettings();
  const next: GroqVoiceSettings = {
    ...current,
    ...settings,
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("groq-voice-settings-changed", { detail: next }));
  }
  return next;
}

export function useGroqSettings() {
  const [settings, setSettings] = useState<GroqVoiceSettings>(loadGroqSettings);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<GroqVoiceSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      } else {
        setSettings(loadGroqSettings());
      }
    };

    window.addEventListener("groq-voice-settings-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("groq-voice-settings-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (partial: Partial<GroqVoiceSettings>) => {
    const updated = saveGroqSettings(partial);
    setSettings(updated);
  };

  return [settings, update] as const;
}

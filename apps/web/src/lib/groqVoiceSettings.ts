/**
 * Groq AI Voice Settings Store (apps/web/src/lib/groqVoiceSettings.ts)
 *
 * Persists Groq API Key, toggle state, active models, and selected model for the Super Call Assistant.
 */

import { useState, useEffect } from "react";

export interface GroqModelOption {
  id: string;
  name: string;
  description: string;
  contextWindow?: number;
  ownedBy?: string;
}

export interface GroqVoiceSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  availableModels?: GroqModelOption[];
}

const STORAGE_KEY = "t3_voice_groq_settings";

export const DEFAULT_GROQ_MODELS: GroqModelOption[] = [
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B (Recommended)",
    description: "128k context, flagship accuracy & fast reasoning",
  },
  {
    id: "llama-3.1-8b-instant",
    name: "Llama 3.1 8B Instant",
    description: "128k context, ultra-fast response latency",
  },
  {
    id: "deepseek-r1-distill-llama-70b",
    name: "DeepSeek R1 Distill Llama 70B",
    description: "128k context, advanced deep reasoning",
  },
  {
    id: "qwen-qwq-32b",
    name: "Qwen QwQ 32B",
    description: "128k context, math & technical coding specialist",
  },
];

export const GROQ_MODEL_OPTIONS = DEFAULT_GROQ_MODELS;

export function loadGroqSettings(): GroqVoiceSettings {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      apiKey: "",
      model: "llama-3.3-70b-versatile",
      availableModels: DEFAULT_GROQ_MODELS,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const availableModels =
        Array.isArray(parsed.availableModels) && parsed.availableModels.length > 0
          ? parsed.availableModels
          : DEFAULT_GROQ_MODELS;

      return {
        enabled: Boolean(parsed.enabled),
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        model: parsed.model || "llama-3.3-70b-versatile",
        availableModels,
      };
    }
  } catch {}
  return {
    enabled: false,
    apiKey: "",
    model: "llama-3.3-70b-versatile",
    availableModels: DEFAULT_GROQ_MODELS,
  };
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

export async function fetchGroqLiveModels(apiKey: string): Promise<{
  ok: boolean;
  models?: GroqModelOption[];
  error?: string;
}> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { ok: false, error: "Please enter your Groq API key first." };
  }

  // 1. Try server proxy endpoint first
  try {
    const res = await fetch("/api/groq/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: cleanKey }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json()) as any;
    if (res.ok && data.ok && Array.isArray(data.models) && data.models.length > 0) {
      saveGroqSettings({ availableModels: data.models });
      return { ok: true, models: data.models };
    }
    if (data.error) {
      return { ok: false, error: data.error };
    }
  } catch (err) {
    console.warn("Server groq models fetch failed, trying direct browser fetch:", err);
  }

  // 2. Fallback to direct client-side fetch from Groq API
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `Groq returned HTTP ${res.status}` };
    }
    const raw = Array.isArray(data?.data) ? data.data : [];
    const chatModels: GroqModelOption[] = raw
      .filter((m: any) => {
        const id = String(m?.id || "").toLowerCase();
        if (m?.active === false) return false;
        if (
          id.includes("whisper") ||
          id.includes("distil") ||
          id.includes("embed") ||
          id.includes("tts")
        ) {
          return false;
        }
        return true;
      })
      .map((m: any) => {
        const id = String(m.id);
        let name = id;
        let description = "Groq High-Speed Model";
        if (id.includes("llama-3.3-70b")) {
          name = "Llama 3.3 70B (Recommended)";
          description = "128k context, versatile flagship reasoning";
        } else if (id.includes("llama-3.1-8b")) {
          name = "Llama 3.1 8B Instant";
          description = "128k context, ultra-low latency";
        } else if (id.includes("deepseek-r1")) {
          name = "DeepSeek R1 Distill Llama 70B";
          description = "128k context, deep chain-of-thought reasoning";
        } else if (id.includes("qwen-qwq")) {
          name = "Qwen QwQ 32B";
          description = "128k context, math & code specialist";
        }
        return {
          id,
          name,
          description,
          contextWindow: m.context_window,
          ownedBy: m.owned_by,
        };
      });

    if (chatModels.length > 0) {
      saveGroqSettings({ availableModels: chatModels });
      return { ok: true, models: chatModels };
    }
    return { ok: false, error: "No active chat models found on Groq account." };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
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

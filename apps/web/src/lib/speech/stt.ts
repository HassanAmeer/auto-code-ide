/**
 * Browser Speech-to-Text (STT) Engine using Web Speech API (webkitSpeechRecognition / SpeechRecognition)
 * Chrome & Chromium natively supported.
 */

import { transliterateUrduToRoman } from "./romanUrduTransliterate";

export type SttLanguageMode = "auto" | "roman-urdu" | "natural-urdu" | "hindi" | "english";

export interface SttSettings {
  language: SttLanguageMode;
  continuous: boolean;
  interimResults: boolean;
}

const STT_STORAGE_KEY = "t3code:speech:stt-settings:v1";

export const DEFAULT_STT_SETTINGS: SttSettings = {
  language: "auto",
  continuous: true,
  interimResults: true,
};

export function loadSttSettings(): SttSettings {
  if (typeof window === "undefined") return DEFAULT_STT_SETTINGS;
  try {
    const raw = localStorage.getItem(STT_STORAGE_KEY);
    if (!raw) return DEFAULT_STT_SETTINGS;
    return { ...DEFAULT_STT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STT_SETTINGS;
  }
}

export function saveSttSettings(settings: SttSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STT_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("t3-stt-settings-changed", { detail: settings }));
  } catch (err) {
    console.warn("Failed to persist STT settings:", err);
  }
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
}

export function getRecognitionLanguageCode(mode: SttLanguageMode): string {
  switch (mode) {
    case "natural-urdu":
      return "ur-PK";
    case "roman-urdu":
      return "ur-PK";
    case "hindi":
      return "hi-IN";
    case "english":
      return "en-US";
    case "auto":
    default:
      return "ur-PK";
  }
}

export interface SttController {
  start: () => void;
  stop: () => void;
  isListening: boolean;
}

export const isMobileDevice =
  typeof navigator !== "undefined" &&
  (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && typeof window !== "undefined" && window.innerWidth < 800));

export function createSttSession({
  mode,
  onResult,
  onError,
  onStateChange,
}: {
  mode?: SttLanguageMode;
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onStateChange?: (isListening: boolean) => void;
}): SttController {
  if (!isSpeechRecognitionSupported()) {
    onError?.("Speech Recognition is not supported in this browser. Please use Google Chrome.");
    return { start: () => {}, stop: () => {}, isListening: false };
  }

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognitionClass();

  const settings = loadSttSettings();
  const selectedMode = mode || settings.language;
  recognition.lang = getRecognitionLanguageCode(selectedMode);
  // On mobile Android/iOS, continuous=true frequently fails or drops audio.
  recognition.continuous = !isMobileDevice;
  recognition.interimResults = true;

  let listening = false;

  recognition.onstart = () => {
    listening = true;
    onStateChange?.(true);
  };

  recognition.onend = () => {
    if (isMobileDevice && listening) {
      try {
        recognition.start();
        return;
      } catch {
        // fall through
      }
    }
    listening = false;
    onStateChange?.(false);
  };

  recognition.onerror = (event: any) => {
    console.warn("Speech recognition error:", event.error);
    if (isMobileDevice && event.error === "no-speech" && listening) {
      return;
    }
    onError?.(event.error);
  };

  recognition.onresult = (event: any) => {
    let accumulatedFinal = "";
    let currentInterim = "";

    for (let i = 0; i < event.results.length; ++i) {
      const item = event.results[i];
      if (item.isFinal) {
        accumulatedFinal += (accumulatedFinal ? " " : "") + item[0].transcript.trim();
      } else {
        currentInterim += (currentInterim ? " " : "") + item[0].transcript.trim();
      }
    }

    const processTranscript = (raw: string) => {
      if (selectedMode === "roman-urdu" || selectedMode === "auto") {
        return transliterateUrduToRoman(raw);
      }
      return raw;
    };

    const fullRaw = (accumulatedFinal + (currentInterim ? " " + currentInterim : "")).trim();
    if (fullRaw) {
      onResult(processTranscript(fullRaw), !currentInterim);
    }
  };

  return {
    start: () => {
      try {
        recognition.start();
      } catch (e) {
        console.warn("Recognition start failed or already active", e);
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch (e) {
        // ignore
      }
    },
    get isListening() {
      return listening;
    },
  };
}

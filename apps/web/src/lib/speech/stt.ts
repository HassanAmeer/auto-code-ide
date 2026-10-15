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
  getInterimTranscript?: () => string;
}

export const isMobileDevice =
  typeof navigator !== "undefined" &&
  (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && typeof window !== "undefined" && window.innerWidth < 800));

export function createSttSession({
  mode,
  onResult,
  onInterim,
  onError,
  onStateChange,
}: {
  mode?: SttLanguageMode;
  onResult: (transcript: string, isFinal: boolean, cumulativeTranscript?: string) => void;
  onInterim?: (interim: string) => void;
  onError?: (error: string) => void;
  onStateChange?: (isListening: boolean) => void;
}): SttController {
  if (!isSpeechRecognitionSupported()) {
    onError?.("Speech Recognition is not supported in this browser. Please use Google Chrome.");
    return {
      start: () => {},
      stop: () => {},
      isListening: false,
      getInterimTranscript: () => "",
    };
  }

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  const settings = loadSttSettings();
  const selectedMode = mode || settings.language;
  const langCode = getRecognitionLanguageCode(selectedMode);

  let isRunning = false;
  let recognition: any = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let lastProcessedFinalIndex = 0;
  let currentInterimText = "";
  let accumulatedSessionText = "";

  const processTranscript = (raw: string) => {
    if (!raw) return "";
    if (selectedMode === "roman-urdu" || selectedMode === "auto") {
      return transliterateUrduToRoman(raw);
    }
    return raw;
  };

  const cleanupInstance = () => {
    if (recognition) {
      try {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      } catch {}
      recognition = null;
    }
  };

  const startInstance = () => {
    if (!isRunning) return;

    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }

    cleanupInstance();

    try {
      recognition = new SpeechRecognitionClass();
      recognition.lang = langCode;
      recognition.continuous = true;
      recognition.interimResults = true;

      lastProcessedFinalIndex = 0;

      recognition.onstart = () => {
        if (!isRunning) return;
        onStateChange?.(true);
      };

      recognition.onresult = (event: any) => {
        if (!isRunning) return;

        let newlyFinalized = "";
        let interim = "";

        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          if (!item || !item[0]) continue;
          if (item.isFinal) {
            if (i >= lastProcessedFinalIndex) {
              const phrase = item[0].transcript.trim();
              if (phrase) {
                newlyFinalized += (newlyFinalized ? " " : "") + phrase;
              }
              lastProcessedFinalIndex = i + 1;
            }
          } else {
            const interimPhrase = item[0].transcript.trim();
            if (interimPhrase) {
              interim += (interim ? " " : "") + interimPhrase;
            }
          }
        }

        currentInterimText = interim;

        if (newlyFinalized) {
          const processedFinal = processTranscript(newlyFinalized).trim();
          if (processedFinal) {
            accumulatedSessionText += (accumulatedSessionText ? " " : "") + processedFinal;
            onResult(processedFinal, true, accumulatedSessionText);
          }
        }

        if (interim) {
          const processedInterim = processTranscript(interim).trim();
          const cumulativeWithInterim = accumulatedSessionText
            ? `${accumulatedSessionText} ${processedInterim}`
            : processedInterim;
          onInterim?.(processedInterim);
          onResult(processedInterim, false, cumulativeWithInterim);
        } else {
          onInterim?.("");
        }
      };

      recognition.onerror = (event: any) => {
        const error = event.error;
        console.warn("Speech recognition error:", error);

        // Standard silence or pause events: keep listening continuously!
        if (error === "no-speech" || error === "aborted") {
          return;
        }

        // Fatal permission error:
        if (error === "not-allowed" || error === "service-not-allowed") {
          isRunning = false;
          cleanupInstance();
          onStateChange?.(false);
          onError?.(error);
          return;
        }

        // Other transient errors (network, audio-capture): onend will restart cleanly
      };

      recognition.onend = () => {
        if (isRunning) {
          // Browser closed the audio stream on pause or timeout:
          // Immediately schedule a fresh seamless restart!
          restartTimer = setTimeout(() => {
            if (isRunning) {
              startInstance();
            }
          }, 60);
          return;
        }

        onStateChange?.(false);
        onInterim?.("");
      };

      recognition.start();
    } catch (err: any) {
      console.warn("Failed to instantiate speech recognition:", err);
      if (isRunning) {
        restartTimer = setTimeout(() => {
          if (isRunning) {
            startInstance();
          }
        }, 200);
      }
    }
  };

  return {
    start: () => {
      isRunning = true;
      currentInterimText = "";
      accumulatedSessionText = "";
      startInstance();
    },
    stop: () => {
      isRunning = false;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }

      // If user stops while there's uncommitted interim text, flush it as final before stopping!
      if (currentInterimText.trim()) {
        const flushed = processTranscript(currentInterimText.trim()).trim();
        if (flushed) {
          accumulatedSessionText += (accumulatedSessionText ? " " : "") + flushed;
          onResult(flushed, true, accumulatedSessionText);
        }
        currentInterimText = "";
      }

      cleanupInstance();
      onStateChange?.(false);
      onInterim?.("");
    },
    get isListening() {
      return isRunning;
    },
    getInterimTranscript: () => currentInterimText,
  };
}

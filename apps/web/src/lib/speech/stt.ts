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

import { saveServerSetting } from "../serverSettingsSync";

export function saveSttSettings(settings: SttSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STT_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("t3-stt-settings-changed", { detail: settings }));
    void saveServerSetting(STT_STORAGE_KEY, settings);
  } catch (err) {
    console.warn("Failed to persist STT settings:", err);
  }
}

export function subscribeSttSettings(callback: (settings: SttSettings) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<SttSettings>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(loadSttSettings());
    }
  };
  window.addEventListener("t3-stt-settings-changed", handler);
  return () => {
    window.removeEventListener("t3-stt-settings-changed", handler);
  };
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
}

export function getRecognitionLanguageCodes(mode: SttLanguageMode): string[] {
  switch (mode) {
    case "natural-urdu":
      return ["ur-PK"];
    case "roman-urdu":
      return ["ur-PK", "hi-IN", "en-IN", "en-US"];
    case "hindi":
      return ["hi-IN", "en-IN"];
    case "english":
      return ["en-US", "en-IN"];
    case "auto":
    default:
      return ["ur-PK", "hi-IN", "en-IN", "en-US"];
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

/**
 * Normalizes a word for comparison by removing punctuation and lowercasing.
 */
export function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Removes immediate consecutive duplicate words that speech recognition engines (especially on mobile) occasionally emit.
 * E.g. "hello hello hello" -> "hello"
 */
export function removeConsecutiveDuplicateWords(text: string): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return text.trim();
  const deduped: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (i === 0) {
      deduped.push(word);
    } else {
      const prevNorm = normalizeWord(words[i - 1]!);
      const currNorm = normalizeWord(word);
      if (prevNorm && currNorm && prevNorm === currNorm) {
        continue;
      }
      deduped.push(word);
    }
  }
  return deduped.join(" ");
}

/**
 * Strips overlapping leading words from incoming text that match trailing words in existing text.
 * E.g. if existing is "hello world" and incoming is "world how are you", returns "how are you".
 * E.g. if existing is "hello" and incoming is "hello", returns "".
 */
export function isRomanUrduSttMode(mode: SttLanguageMode): boolean {
  return mode === "roman-urdu" || mode === "auto";
}

/**
 * The cleanup mode that matches the dictation language, or null when the
 * language needs no script-aware cleanup.
 */
export function getSttCleanupMode(
  mode: SttLanguageMode,
): "roman-urdu" | "natural-urdu" | "hindi" | null {
  switch (mode) {
    case "roman-urdu":
    case "auto":
      return "roman-urdu";
    case "natural-urdu":
      return "natural-urdu";
    case "hindi":
      return "hindi";
    case "english":
      return null;
  }
}

/**
 * Normalizes recognizer output into the user-facing transcript.
 * Roman Urdu modes convert Urdu/Hindi script to phonetic Roman Urdu and
 * replace Urdu punctuation with its Latin equivalent.
 */
export function formatSttTranscript(raw: string, mode: SttLanguageMode): string {
  if (!raw) return "";
  let text = removeConsecutiveDuplicateWords(raw.trim());
  if (isRomanUrduSttMode(mode)) {
    text = transliterateUrduToRoman(text);
    text = text.replace(/؟/g, "?").replace(/۔/g, ".").replace(/،/g, ",").replace(/؛/g, ";");
  }
  return removeConsecutiveDuplicateWords(
    text
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/([,.!?;:])(?=[^\s\d.,!?;:])/g, "$1 ")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

export function deduplicateOverlap(existingText: string, incomingText: string): string {
  if (!existingText || !incomingText) return incomingText.trim();
  const existingWords = existingText.trim().split(/\s+/).filter(Boolean);
  const incomingWords = incomingText.trim().split(/\s+/).filter(Boolean);
  if (!existingWords.length || !incomingWords.length) return incomingText.trim();

  const maxOverlap = Math.min(existingWords.length, incomingWords.length);
  for (let len = maxOverlap; len >= 1; len--) {
    const trailingExisting = existingWords.slice(-len).map(normalizeWord).join(" ");
    const leadingIncoming = incomingWords.slice(0, len).map(normalizeWord).join(" ");
    if (trailingExisting && trailingExisting === leadingIncoming) {
      return incomingWords.slice(len).join(" ").trim();
    }
  }
  return incomingText.trim();
}

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
  const langCodes = getRecognitionLanguageCodes(selectedMode);
  let langCode = langCodes[0] ?? "en-US";
  let langFallbackIndex = 0;

  let isRunning = false;
  let recognition: any = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let lastProcessedFinalIndex = 0;
  let currentInterimText = "";
  let accumulatedSessionText = "";
  let lastFinalizedPhrase = "";
  let lastFinalizedTimestamp = 0;

  const processTranscript = (raw: string) => formatSttTranscript(raw, selectedMode);

  const advanceLanguageFallback = () => {
    if (langFallbackIndex < langCodes.length - 1) {
      langFallbackIndex += 1;
      langCode = langCodes[langFallbackIndex] ?? "en-US";
      return true;
    }
    const navigatorLanguage =
      typeof navigator !== "undefined" && navigator.language ? navigator.language : null;
    if (navigatorLanguage && navigatorLanguage !== langCode) {
      langCode = navigatorLanguage;
      return true;
    }
    return false;
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
      // On mobile browsers, continuous mode causes duplicated chunks and restarts.
      // Setting continuous to false on mobile ensures clean, discrete phrase finalization.
      recognition.continuous = !isMobileDevice;
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

        const startIndex = Math.max(event.resultIndex ?? 0, lastProcessedFinalIndex);

        for (let i = startIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (!item || !item[0]) continue;
          if (item.isFinal) {
            const rawPhrase = item[0].transcript.trim();
            if (rawPhrase) {
              const cleaned = removeConsecutiveDuplicateWords(rawPhrase);
              if (cleaned) {
                newlyFinalized += (newlyFinalized ? " " : "") + cleaned;
              }
            }
            lastProcessedFinalIndex = i + 1;
          } else {
            const interimPhrase = item[0].transcript.trim();
            if (interimPhrase) {
              const cleaned = removeConsecutiveDuplicateWords(interimPhrase);
              if (cleaned) {
                interim += (interim ? " " : "") + cleaned;
              }
            }
          }
        }

        if (newlyFinalized) {
          const processedFinal = processTranscript(newlyFinalized).trim();
          if (processedFinal) {
            const now = Date.now();
            // Deduplicate exact duplicate phrases emitted within rapid succession (2.5s)
            const isRapidDuplicate =
              normalizeWord(processedFinal) === normalizeWord(lastFinalizedPhrase) &&
              now - lastFinalizedTimestamp < 2500;

            if (!isRapidDuplicate) {
              const nonOverlapping = deduplicateOverlap(accumulatedSessionText, processedFinal);
              if (nonOverlapping) {
                lastFinalizedPhrase = processedFinal;
                lastFinalizedTimestamp = now;
                accumulatedSessionText += (accumulatedSessionText ? " " : "") + nonOverlapping;
                currentInterimText = "";
                onResult(nonOverlapping, true, accumulatedSessionText);
              }
            }
          }
        }

        if (interim) {
          const processedInterim = processTranscript(interim).trim();
          const nonOverlappingInterim = deduplicateOverlap(
            accumulatedSessionText,
            processedInterim,
          );
          currentInterimText = nonOverlappingInterim;
          const cumulativeWithInterim = accumulatedSessionText
            ? `${accumulatedSessionText} ${nonOverlappingInterim}`
            : nonOverlappingInterim;
          onInterim?.(nonOverlappingInterim);
          onResult(nonOverlappingInterim, false, cumulativeWithInterim);
        } else {
          currentInterimText = "";
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

        // The browser/engine lacks the selected locale: retry with a related fallback.
        if (error === "language-not-supported") {
          advanceLanguageFallback();
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
          // Browser closed audio stream on pause or timeout:
          // Mobile devices need 200ms to cleanly flush audio buffers before restarting.
          const delay = isMobileDevice ? 200 : 60;
          restartTimer = setTimeout(() => {
            if (isRunning) {
              startInstance();
            }
          }, delay);
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
      lastFinalizedPhrase = "";
      lastFinalizedTimestamp = 0;
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
        const flushed = processTranscript(
          removeConsecutiveDuplicateWords(currentInterimText.trim()),
        ).trim();
        const nonOverlapping = deduplicateOverlap(accumulatedSessionText, flushed);
        if (nonOverlapping) {
          accumulatedSessionText += (accumulatedSessionText ? " " : "") + nonOverlapping;
          onResult(nonOverlapping, true, accumulatedSessionText);
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

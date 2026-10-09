/**
 * Browser Text-to-Speech (TTS) Engine using Web Speech API (window.speechSynthesis)
 */

export type TtsLanguageMode = "roman-urdu" | "natural-urdu" | "english";

export interface TtsSettings {
  language: TtsLanguageMode;
  voiceURI?: string;
  rate: number;
  pitch: number;
  volume: number;
}

const TTS_STORAGE_KEY = "t3code:speech:tts-settings:v1";

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  language: "roman-urdu",
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

export function loadTtsSettings(): TtsSettings {
  if (typeof window === "undefined") return DEFAULT_TTS_SETTINGS;
  try {
    const raw = localStorage.getItem(TTS_STORAGE_KEY);
    if (!raw) return DEFAULT_TTS_SETTINGS;
    return { ...DEFAULT_TTS_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TTS_SETTINGS;
  }
}

export function saveTtsSettings(settings: TtsSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("t3-tts-settings-changed", { detail: settings }));
  } catch (err) {
    console.warn("Failed to persist TTS settings:", err);
  }
}

/**
 * Returns available browser voices.
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

/**
 * Filters voices matching a given language mode, prioritizing male voices.
 */
export function getVoicesForMode(
  voices: SpeechSynthesisVoice[],
  mode: TtsLanguageMode,
): SpeechSynthesisVoice[] {
  const isMale = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    return (
      name.includes("male") ||
      name.includes("david") ||
      name.includes("george") ||
      name.includes("mark") ||
      name.includes("guy")
    );
  };

  switch (mode) {
    case "natural-urdu": {
      const urduOrHindi = voices.filter((v) => v.lang.startsWith("ur") || v.lang.startsWith("hi"));
      if (urduOrHindi.length > 0) {
        return urduOrHindi.sort((a, b) => (isMale(b) ? 1 : 0) - (isMale(a) ? 1 : 0));
      }
      return voices;
    }
    case "roman-urdu": {
      // Roman Urdu is best articulated by Hindi/Urdu voices or smooth English voices
      const urduHindi = voices.filter((v) => v.lang.startsWith("hi") || v.lang.startsWith("ur"));
      const english = voices.filter((v) => v.lang.startsWith("en"));
      const combined = [...urduHindi, ...english];
      return combined.sort((a, b) => (isMale(b) ? 1 : 0) - (isMale(a) ? 1 : 0));
    }
    case "english":
    default: {
      const enVoices = voices.filter((v) => v.lang.startsWith("en"));
      return enVoices.sort((a, b) => (isMale(b) ? 1 : 0) - (isMale(a) ? 1 : 0));
    }
  }
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
const listeners = new Set<(isSpeaking: boolean, speakingText: string | null) => void>();

function notifySpeechState(isSpeaking: boolean, text: string | null = null) {
  for (const fn of listeners) {
    fn(isSpeaking, text);
  }
}

export function subscribeSpeechState(
  cb: (isSpeaking: boolean, speakingText: string | null) => void,
): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isCurrentlySpeaking(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.speaking;
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  activeUtterance = null;
  notifySpeechState(false, null);
}

/**
 * Clean text from markdown formatting for cleaner speech output
 */
export function sanitizeTextForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "Code block omitted.") // skip big code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/#+\s+/g, "") // headers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/!\[.*?\]\(.*?\)/g, "") // images
    .replace(/[>_~#*]/g, "") // extra symbols
    .trim();
}

/**
 * Speak provided text with active or specified settings.
 */
export function speakText(text: string, options?: Partial<TtsSettings>, onEnd?: () => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  stopSpeaking();

  const settings = { ...loadTtsSettings(), ...options };
  const clean = sanitizeTextForSpeech(text);
  if (!clean) return;

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;
  utterance.volume = settings.volume;

  const voices = getAvailableVoices();
  const matchedVoices = getVoicesForMode(voices, settings.language);

  if (settings.voiceURI) {
    const custom = voices.find((v) => v.voiceURI === settings.voiceURI);
    if (custom) utterance.voice = custom;
  } else if (matchedVoices.length > 0 && matchedVoices[0]) {
    utterance.voice = matchedVoices[0];
  }

  // Set appropriate language tag
  if (settings.language === "natural-urdu") {
    utterance.lang = "ur-PK";
  } else if (settings.language === "roman-urdu") {
    utterance.lang = utterance.voice?.lang || "hi-IN";
  } else {
    utterance.lang = "en-US";
  }

  utterance.onstart = () => {
    activeUtterance = utterance;
    notifySpeechState(true, clean);
  };

  utterance.onend = () => {
    activeUtterance = null;
    notifySpeechState(false, null);
    onEnd?.();
  };

  utterance.onerror = () => {
    activeUtterance = null;
    notifySpeechState(false, null);
    onEnd?.();
  };

  window.speechSynthesis.speak(utterance);
}

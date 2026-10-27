/**
 * Browser Text-to-Speech (TTS) Engine using Web Speech API (window.speechSynthesis)
 */

import { saveServerSetting } from "../serverSettingsSync";

export type TtsVoiceId =
  | "english-male"
  | "english-female"
  | "roman-urdu-male"
  | "roman-urdu-female"
  | "natural-urdu-male"
  | "natural-urdu-female";

export type TtsLanguageMode =
  | "english"
  | "roman-urdu"
  | "natural-urdu"
  | "auto-male"
  | "auto-female"
  | TtsVoiceId;

export interface TtsSettings {
  language: TtsLanguageMode;
  voiceURI?: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface TtsAccentPreset {
  id: TtsVoiceId;
  name: string;
  nameUrdu: string;
  category: "english" | "roman-urdu" | "natural-urdu";
  gender: "male" | "female";
  preferredLangs: string[];
  pitch: number;
  rate: number;
  sampleText: string;
  description: string;
}

/**
 * Exactly 6 curated voice presets across 3 languages (English, Roman Urdu, Natural Urdu)
 * with dedicated Male and Female options for each.
 */
export const TTS_ACCENTS: TtsAccentPreset[] = [
  // 1. English Male & Female
  {
    id: "english-male",
    name: "English (Male Voice)",
    nameUrdu: "انگلش (مردانہ آواز)",
    category: "english",
    gender: "male",
    preferredLangs: ["en-US", "en-GB", "en-CA", "en-AU", "en"],
    pitch: 0.88,
    rate: 1.0,
    sampleText: "Hello! This is a test of the English male voice. How can I assist you today?",
    description: "Clear and natural English male voice.",
  },
  {
    id: "english-female",
    name: "English (Female Voice)",
    nameUrdu: "انگلش (زنانہ آواز)",
    category: "english",
    gender: "female",
    preferredLangs: ["en-US", "en-GB", "en-CA", "en-AU", "en"],
    pitch: 1.12,
    rate: 1.0,
    sampleText: "Hello! This is a test of the English female voice. How can I assist you today?",
    description: "Fluent and professional English female voice.",
  },

  // 2. Roman Urdu Male & Female
  {
    id: "roman-urdu-male",
    name: "Roman Urdu (Male Voice)",
    nameUrdu: "رومن اردو (مردانہ آواز)",
    category: "roman-urdu",
    gender: "male",
    preferredLangs: ["hi-IN", "ur-PK", "en-IN", "en-GB", "en-US"],
    pitch: 0.82,
    rate: 0.96,
    sampleText:
      "Assalam o alaikum! Yeh Roman Urdu male voice ka test hai. Main aap ki kya madad kar sakta hoon?",
    description: "Natural Pakistani accent for Roman Urdu chat (Male).",
  },
  {
    id: "roman-urdu-female",
    name: "Roman Urdu (Female Voice)",
    nameUrdu: "رومن اردو (زنانہ آواز)",
    category: "roman-urdu",
    gender: "female",
    preferredLangs: ["hi-IN", "ur-PK", "en-IN", "en-GB", "en-US"],
    pitch: 1.15,
    rate: 1.0,
    sampleText:
      "Assalam o alaikum! Yeh Roman Urdu female voice ka test hai. Main aap ki kya madad kar sakti hoon?",
    description: "Clear and expressive Roman Urdu conversational voice (Female).",
  },

  // 3. Natural Urdu Male & Female
  {
    id: "natural-urdu-male",
    name: "Natural Urdu (Male Voice) - اردو",
    nameUrdu: "نیچرل اردو (مردانہ آواز)",
    category: "natural-urdu",
    gender: "male",
    preferredLangs: ["ur-PK", "ur", "hi-IN", "hi"],
    pitch: 0.8,
    rate: 0.94,
    sampleText: "السلام علیکم! یہ نیچرل اردو مردانہ آواز کا ٹیسٹ ہے۔ میں آپ کی کیا مدد کر سکتا ہوں؟",
    description: "Authentic Pakistani Urdu pronunciation in resonant male tone.",
  },
  {
    id: "natural-urdu-female",
    name: "Natural Urdu (Female Voice) - اردو",
    nameUrdu: "نیچرل اردو (زنانہ آواز)",
    category: "natural-urdu",
    gender: "female",
    preferredLangs: ["ur-PK", "ur", "hi-IN", "hi"],
    pitch: 1.16,
    rate: 0.98,
    sampleText: "السلام علیکم! یہ نیچرل اردو زنانہ آواز کا ٹیسٹ ہے۔ میں آپ کی کیا مدد کر سکتی ہوں؟",
    description: "Polished and fluent native Urdu pronunciation (Female).",
  },
];

const TTS_STORAGE_KEY = "t3code:speech:tts-settings:v1";

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  language: "roman-urdu",
  voiceURI: "roman-urdu-male",
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

/**
 * Returns the active TTS voice preset matching settings or fallbacks.
 */
export function getActiveTtsPreset(settings?: Partial<TtsSettings>): TtsAccentPreset {
  const current = settings || loadTtsSettings();
  const uri = current.voiceURI || "";

  // 1. Direct match with preset id
  const direct = TTS_ACCENTS.find((a) => a.id === uri);
  if (direct) return direct;

  // 2. Legacy / fuzzy match by URI
  const lowerUri = uri.toLowerCase();
  if (lowerUri.includes("english")) {
    return lowerUri.includes("female") ? TTS_ACCENTS[1] : TTS_ACCENTS[0];
  }
  if (lowerUri.includes("natural")) {
    return lowerUri.includes("female") ? TTS_ACCENTS[5] : TTS_ACCENTS[4];
  }
  if (lowerUri.includes("roman")) {
    return lowerUri.includes("female") ? TTS_ACCENTS[3] : TTS_ACCENTS[2];
  }

  // 3. Fallback based on language mode
  const lang = current.language;
  if (lang === "english" || lang === "english-male") return TTS_ACCENTS[0];
  if (lang === "english-female") return TTS_ACCENTS[1];
  if (lang === "natural-urdu" || lang === "natural-urdu-male") return TTS_ACCENTS[4];
  if (lang === "natural-urdu-female") return TTS_ACCENTS[5];
  if (lang === "auto-female" || lang === "roman-urdu-female") return TTS_ACCENTS[3];

  return TTS_ACCENTS[2]; // Default: roman-urdu-male
}

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
    // The server keeps the live copy so the voice follows the user to any
    // other machine.
    void saveServerSetting(TTS_STORAGE_KEY, settings);
    window.dispatchEvent(new CustomEvent("t3-tts-settings-changed", { detail: settings }));
  } catch (err) {
    console.warn("Failed to persist TTS settings:", err);
  }
}

export function subscribeTtsSettings(callback: (settings: TtsSettings) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<TtsSettings>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(loadTtsSettings());
    }
  };
  window.addEventListener("t3-tts-settings-changed", handler);
  return () => {
    window.removeEventListener("t3-tts-settings-changed", handler);
  };
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
 * Detects whether a voice is male.
 */
export function isMaleVoice(v: SpeechSynthesisVoice): boolean {
  const name = v.name.toLowerCase();
  const femaleKeywords = [
    "female",
    "woman",
    "girl",
    "zira",
    "susan",
    "hazel",
    "jenny",
    "samantha",
    "victoria",
    "karen",
    "veena",
    "swara",
    "kalpana",
    "catherine",
    "fiona",
    "moira",
    "tessa",
    "helena",
    "eva",
    "ava",
    "allison",
    "siri",
  ];
  if (femaleKeywords.some((k) => name.includes(k))) {
    return false;
  }
  const maleKeywords = [
    "male",
    "man",
    "david",
    "george",
    "mark",
    "guy",
    "ravi",
    "hemant",
    "daniel",
    "alex",
    "fred",
    "rishi",
    "james",
    "richard",
    "thomas",
    "oliver",
  ];
  if (maleKeywords.some((k) => name.includes(k))) {
    return true;
  }
  // If no gender marker is present, treat non-female voices as compatible
  return true;
}

/**
 * Detects whether a voice is female.
 */
export function isFemaleVoice(v: SpeechSynthesisVoice): boolean {
  const name = v.name.toLowerCase();
  const femaleKeywords = [
    "female",
    "woman",
    "girl",
    "zira",
    "susan",
    "hazel",
    "jenny",
    "samantha",
    "victoria",
    "karen",
    "veena",
    "swara",
    "kalpana",
    "catherine",
    "fiona",
    "moira",
    "tessa",
    "helena",
    "eva",
    "ava",
    "allison",
  ];
  return femaleKeywords.some((k) => name.includes(k));
}

/**
 * Automatically detects whether text is Natural Urdu, Roman Urdu, or English.
 */
export function detectTextLanguage(text: string): "natural-urdu" | "roman-urdu" | "english" {
  if (!text) return "english";

  // 1. Natural Urdu check (Arabic/Urdu Unicode script)
  if (/[\u0600-\u06FF]/.test(text)) {
    return "natural-urdu";
  }

  // 2. Roman Urdu check
  const words = text.toLowerCase().split(/[\s\p{P}]+/u);
  const romanUrduKeywords = new Set([
    "kya",
    "hai",
    "hain",
    "hoon",
    "yeh",
    "woh",
    "hum",
    "tum",
    "aap",
    "ap",
    "kesy",
    "kese",
    "theek",
    "acha",
    "achi",
    "ache",
    "nahi",
    "nhi",
    "mera",
    "meri",
    "mere",
    "apka",
    "apki",
    "karo",
    "karna",
    "karein",
    "raha",
    "rahi",
    "rahe",
    "aur",
    "lekin",
    "bhi",
    "toh",
    "shukriya",
    "salam",
    "bhai",
    "wala",
    "wali",
    "wale",
    "kuch",
    "sab",
    "kaun",
    "kab",
    "kahan",
    "bohat",
    "kar",
    "diya",
    "tha",
    "thi",
    "thay",
    "chal",
    "dekh",
    "batao",
    "batayein",
    "masla",
    "hal",
  ]);

  let matches = 0;
  for (const w of words) {
    if (romanUrduKeywords.has(w)) {
      matches++;
      if (matches >= 2 || (words.length <= 5 && matches >= 1)) {
        return "roman-urdu";
      }
    }
  }

  return "english";
}

/**
 * Filters voices matching a given language mode or gender filter.
 * By default returns male voices prioritized or filtered.
 */
export function getVoicesForMode(
  voices: SpeechSynthesisVoice[],
  mode: TtsLanguageMode,
  onlyMale: boolean = true,
): SpeechSynthesisVoice[] {
  let pool = voices;

  if (onlyMale) {
    const malePool = voices.filter(isMaleVoice);
    if (malePool.length > 0) {
      pool = malePool;
    }
  }

  switch (mode) {
    case "natural-urdu": {
      const urduHindi = pool.filter((v) => v.lang.startsWith("ur") || v.lang.startsWith("hi"));
      return urduHindi.length > 0 ? urduHindi : pool;
    }
    case "roman-urdu": {
      const urduHindi = pool.filter((v) => v.lang.startsWith("hi") || v.lang.startsWith("ur"));
      const english = pool.filter((v) => v.lang.startsWith("en"));
      const combined = [...urduHindi, ...english];
      return combined.length > 0 ? combined : pool;
    }
    case "english": {
      const enVoices = pool.filter((v) => v.lang.startsWith("en"));
      return enVoices.length > 0 ? enVoices : pool;
    }
    case "auto-male":
    case "auto-female":
    default:
      return pool;
  }
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
const activeUtterancesSet = new Set<SpeechSynthesisUtterance>();
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

let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
function clearKeepAliveTimer(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

export function isCurrentlySpeaking(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return Boolean(activeUtterance !== null && window.speechSynthesis.speaking);
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  clearKeepAliveTimer();
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
  activeUtterance = null;
  activeUtterancesSet.clear();
  notifySpeechState(false, null);
}

/**
 * Completely strips code blocks, reasoning/thinking tags, XML tool calls,
 * HTML code tags, and technical diffs (both closed and unclosed/streaming)
 * so that they are NEVER read aloud.
 */
export function stripCodeBlocks(text: string): string {
  if (!text) return "";
  return (
    text
      // 1. Thinking / Reasoning blocks (both closed and streaming unclosed)
      .replace(/<(?:think|thought|reasoning)>[\s\S]*?(?:<\/(?:think|thought|reasoning)>|$)/gi, " ")
      // 2. Fenced code blocks (triple backticks and tildes, both closed and streaming unclosed)
      .replace(/```[\s\S]*?(?:```|$)/g, " ")
      .replace(/~~~[\s\S]*?(?:~~~|$)/g, " ")
      // 3. HTML code / pre blocks (both closed and streaming unclosed)
      .replace(/<(?:pre|code)>[\s\S]*?(?:<\/(?:pre|code)>|$)/gi, " ")
      // 4. Tool call / artifacts / details blocks (both closed and streaming unclosed)
      .replace(
        /<(?:tool_call|antArtifact|artifact|details)>[\s\S]*?(?:<\/(?:tool_call|antArtifact|artifact|details)>|$)/gi,
        " ",
      )
      // 5. Unified diff blocks (e.g. diff --git ... or @@ -1,5 +1,5 @@)
      .replace(
        /(?:^|\n)(?:diff --git|--- a\/|\+\+\+ b\/|@@ -\d+)[^\n]*(\n(?:[-+ @\\].*|\s*))*/g,
        "\n ",
      )
      // 6. Indented code blocks (4+ spaces or tabs on multiple consecutive lines)
      .replace(/(?:^|\n)(?: {4}|\t)[^\n]+(?:\n(?: {4}|\t)[^\n]+)*/g, "\n ")
      // 7. Strip inline code if it is long (>50 chars) or contains code statements/syntax like semicolons, braces, arrows, assignments
      .replace(/`([^`\n]{50,})`/g, " ")
      .replace(/`([^`\n]*[;{}][^`\n]*)`/g, " ")
      .replace(/`([^`\n]*(?:=>|===|!==|==|!=|\+\+|--)[^`\n]*)`/g, " ")
  );
}

/**
 * Clean text from markdown formatting for cleaner speech output
 */
export function sanitizeTextForSpeech(markdown: string): string {
  if (!markdown) return "";
  const withoutCodeBlocks = stripCodeBlocks(markdown);
  return (
    withoutCodeBlocks
      // Clean remaining short inline code (e.g. `foo()` or `name` -> foo, name)
      .replace(/`([^`\n]+)`/g, (_match, inner) => inner.replace(/[()[\]{}]/g, "").trim())
      .replace(/#+\s+/g, "") // headers
      .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
      .replace(/\*([^*]+)\*/g, "$1") // italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
      .replace(/!\[.*?\]\(.*?\)/g, "") // images
      .replace(/^\|[-:\s|]+\|$/gm, "") // markdown table divider rows (|---|---|)
      .replace(/\|/g, " ") // table cell separators
      .replace(/<[^>]+>/g, " ") // remaining html tags
      .replace(/^\s*[-*+]\s+/gm, "") // list bullets
      .replace(/^\s*\d+\.\s+/gm, "") // list numbering
      .replace(/^\s*>\s+/gm, "") // blockquotes
      .replace(/[_~#*]/g, "") // extra symbols
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Speak provided text with active or specified settings.
 */
export function speakText(text: string, options?: Partial<TtsSettings>, onEnd?: () => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  stopSpeaking();

  const baseSettings = loadTtsSettings();
  const settings: TtsSettings = {
    ...baseSettings,
    ...(options
      ? Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined))
      : {}),
  };
  const clean = sanitizeTextForSpeech(text);
  if (!clean) {
    onEnd?.();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(clean);
  const voices = getAvailableVoices();

  // 1. Determine effective language & target gender
  let effectiveLang: "natural-urdu" | "roman-urdu" | "english" = "roman-urdu";
  let targetGender: "male" | "female" = "male";

  if (settings.language === "auto-male") {
    effectiveLang = detectTextLanguage(clean);
    targetGender = "male";
  } else if (settings.language === "auto-female") {
    effectiveLang = detectTextLanguage(clean);
    targetGender = "female";
  } else {
    effectiveLang = settings.language;
    targetGender = "male";
  }

  // 2. Check if an accent preset was selected
  const chosenAccent = settings.voiceURI?.startsWith("accent:")
    ? TTS_ACCENTS.find((a) => a.id === settings.voiceURI)
    : null;

  if (chosenAccent) {
    // Apply tuned accent pitch & rate
    utterance.pitch = Math.max(0.5, Math.min(1.5, settings.pitch * chosenAccent.pitch));
    utterance.rate = Math.max(0.5, Math.min(1.75, settings.rate * chosenAccent.rate));
    targetGender = chosenAccent.gender;

    // Find best voice matching preferred langs and gender
    let matchedVoice: SpeechSynthesisVoice | undefined;
    for (const prefLang of chosenAccent.preferredLangs) {
      const candidates = voices.filter((v) =>
        v.lang.toLowerCase().startsWith(prefLang.toLowerCase()),
      );
      matchedVoice = candidates.find((v) =>
        targetGender === "female" ? isFemaleVoice(v) : isMaleVoice(v),
      );
      if (!matchedVoice && candidates.length > 0) {
        matchedVoice = candidates[0];
      }
      if (matchedVoice) break;
    }

    if (!matchedVoice && voices.length > 0) {
      matchedVoice =
        voices.find((v) => (targetGender === "female" ? isFemaleVoice(v) : isMaleVoice(v))) ||
        voices[0];
    }

    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }
    utterance.lang = chosenAccent.preferredLangs[0] || utterance.voice?.lang || "hi-IN";
  } else {
    // Standard voice or auto voice selection
    utterance.pitch = settings.pitch;
    utterance.rate = settings.rate;

    if (settings.voiceURI && settings.voiceURI !== "auto") {
      const custom = voices.find((v) => v.voiceURI === settings.voiceURI);
      if (custom) utterance.voice = custom;
    } else {
      // Auto voice based on effectiveLang and targetGender
      const matchedPool = getVoicesForMode(voices, effectiveLang, false);
      const genderPool = matchedPool.filter((v) =>
        targetGender === "female" ? isFemaleVoice(v) : isMaleVoice(v),
      );
      if (genderPool.length > 0 && genderPool[0]) {
        utterance.voice = genderPool[0];
      } else if (matchedPool.length > 0 && matchedPool[0]) {
        utterance.voice = matchedPool[0];
      }
    }

    // Set appropriate language tag
    if (effectiveLang === "natural-urdu") {
      utterance.lang = "ur-PK";
    } else if (effectiveLang === "roman-urdu") {
      utterance.lang = utterance.voice?.lang || "hi-IN";
    } else {
      utterance.lang = utterance.voice?.lang || "en-US";
    }
  }

  utterance.volume = settings.volume;

  activeUtterancesSet.add(utterance);

  let hasEnded = false;
  const finishSpeech = () => {
    if (hasEnded) return;
    hasEnded = true;
    clearKeepAliveTimer();
    activeUtterancesSet.delete(utterance);
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
    notifySpeechState(false, null);
    onEnd?.();
  };

  utterance.onstart = () => {
    activeUtterance = utterance;
    clearKeepAliveTimer();
    // Safety interval: keeps Chrome alive and detects early finishes if onend is dropped
    keepAliveTimer = setInterval(() => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          finishSpeech();
        } else {
          try {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          } catch {}
        }
      } else {
        finishSpeech();
      }
    }, 500);
    notifySpeechState(true, clean);
  };

  utterance.onend = () => {
    finishSpeech();
  };

  utterance.onerror = () => {
    finishSpeech();
  };

  // Maximum speech duration timeout: ensures state never hangs permanently
  const maxSpeechDurationMs = Math.max(
    5000,
    Math.ceil((clean.split(/\s+/).length / 1.5) * 1000 + 6000),
  );
  setTimeout(() => {
    if (!hasEnded && activeUtterance === utterance) {
      console.warn("[TTS] Speech reached max expected duration, forcing completion.");
      finishSpeech();
    }
  }, maxSpeechDurationMs);

  window.speechSynthesis.speak(utterance);
}

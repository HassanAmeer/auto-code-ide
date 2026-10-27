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

export const TTS_LANG_LABELS: Record<string, string> = {
  "auto-male": "Auto Detect (Male Voice)",
  "auto-female": "Auto Detect (Female Voice)",
  "roman-urdu": "Roman Urdu",
  "natural-urdu": "Natural Urdu (اردو)",
  english: "English",
};

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
    pitch: 0.9,
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
    pitch: 1.1,
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
    preferredLangs: ["en-IN", "ur-PK", "ur", "hi-IN", "en-GB", "en-US"],
    pitch: 0.88,
    rate: 0.98,
    sampleText:
      "Assalam o alaikum! Yeh Roman Urdu male voice ka test hai. Main aap ki kya madad kar sakta hoon?",
    description: "Natural Pakistani / Subcontinental accent for Roman Urdu (Male).",
  },
  {
    id: "roman-urdu-female",
    name: "Roman Urdu (Female Voice)",
    nameUrdu: "رومن اردو (زنانہ آواز)",
    category: "roman-urdu",
    gender: "female",
    preferredLangs: ["en-IN", "ur-PK", "ur", "hi-IN", "en-GB", "en-US"],
    pitch: 1.05,
    rate: 0.98,
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
    pitch: 0.82,
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
    pitch: 1.12,
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

export function normalizeTtsLanguage(
  lang: unknown,
): "auto-male" | "auto-female" | "roman-urdu" | "natural-urdu" | "english" {
  if (lang === "auto-female") return "auto-female";
  if (lang === "auto" || lang === "auto-male") return "auto-male";
  if (lang === "english" || lang === "english-male" || lang === "english-female") return "english";
  if (lang === "natural-urdu" || lang === "natural-urdu-male" || lang === "natural-urdu-female")
    return "natural-urdu";
  if (lang === "roman-urdu" || lang === "roman-urdu-male" || lang === "roman-urdu-female")
    return "roman-urdu";
  return "roman-urdu";
}

export function loadTtsSettings(): TtsSettings {
  if (typeof window === "undefined") return DEFAULT_TTS_SETTINGS;
  try {
    const raw = localStorage.getItem(TTS_STORAGE_KEY);
    if (!raw) return DEFAULT_TTS_SETTINGS;
    const parsed = JSON.parse(raw);
    const normalizedLang = normalizeTtsLanguage(parsed.language);
    const validPresetIds: TtsVoiceId[] = [
      "english-male",
      "english-female",
      "roman-urdu-male",
      "roman-urdu-female",
      "natural-urdu-male",
      "natural-urdu-female",
    ];
    let voiceURI = parsed.voiceURI;
    if (!validPresetIds.includes(voiceURI)) {
      if (normalizedLang === "english") voiceURI = "english-male";
      else if (normalizedLang === "natural-urdu") voiceURI = "natural-urdu-male";
      else voiceURI = "roman-urdu-male";
    }
    const rate = typeof parsed.rate === "number" && !isNaN(parsed.rate) ? parsed.rate : 1.0;
    const pitch = typeof parsed.pitch === "number" && !isNaN(parsed.pitch) ? parsed.pitch : 1.0;
    const volume = typeof parsed.volume === "number" && !isNaN(parsed.volume) ? parsed.volume : 1.0;
    return {
      language: normalizedLang,
      voiceURI,
      rate,
      pitch,
      volume,
    };
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
  const uri = (v.voiceURI || "").toLowerCase();
  const text = `${name} ${uri}`;

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
    "google us english",
    "google uk english female",
    "google हिन्दी",
    "aria",
    "ayumi",
    "heera",
    "uzma",
    "neerja",
  ];
  if (femaleKeywords.some((k) => text.includes(k))) {
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
    "asif",
    "asad",
    "madhur",
    "prabhat",
    "madhav",
    "salman",
    "tariq",
    "benjamin",
    "arthur",
    "ryan",
    "christopher",
    "eric",
    "tom",
    "uk english male",
  ];
  return maleKeywords.some((k) => text.includes(k));
}

/**
 * Detects whether a voice is female.
 */
export function isFemaleVoice(v: SpeechSynthesisVoice): boolean {
  const name = v.name.toLowerCase();
  const uri = (v.voiceURI || "").toLowerCase();
  const text = `${name} ${uri}`;

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
    "google us english",
    "google uk english female",
    "google हिन्दी",
    "aria",
    "ayumi",
    "heera",
    "uzma",
    "neerja",
  ];
  return femaleKeywords.some((k) => text.includes(k));
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
    case "natural-urdu":
    case "natural-urdu-male":
    case "natural-urdu-female": {
      const urduHindi = pool.filter((v) => v.lang.startsWith("ur") || v.lang.startsWith("hi"));
      return urduHindi.length > 0 ? urduHindi : pool;
    }
    case "roman-urdu":
    case "roman-urdu-male":
    case "roman-urdu-female": {
      const urduHindi = pool.filter((v) => v.lang.startsWith("hi") || v.lang.startsWith("ur"));
      const english = pool.filter((v) => v.lang.startsWith("en"));
      const combined = [...urduHindi, ...english];
      return combined.length > 0 ? combined : pool;
    }
    case "english":
    case "english-male":
    case "english-female": {
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

  // Determine active preset (with dynamic auto-detect if in auto-male or auto-female mode)
  let preset: TtsAccentPreset;
  if (settings.language === "auto-male") {
    const detected = detectTextLanguage(clean);
    if (detected === "natural-urdu") {
      preset = TTS_ACCENTS.find((a) => a.id === "natural-urdu-male") || TTS_ACCENTS[4];
    } else if (detected === "roman-urdu") {
      preset = TTS_ACCENTS.find((a) => a.id === "roman-urdu-male") || TTS_ACCENTS[2];
    } else {
      preset = TTS_ACCENTS.find((a) => a.id === "english-male") || TTS_ACCENTS[0];
    }
  } else if (settings.language === "auto-female") {
    const detected = detectTextLanguage(clean);
    if (detected === "natural-urdu") {
      preset = TTS_ACCENTS.find((a) => a.id === "natural-urdu-female") || TTS_ACCENTS[5];
    } else if (detected === "roman-urdu") {
      preset = TTS_ACCENTS.find((a) => a.id === "roman-urdu-female") || TTS_ACCENTS[3];
    } else {
      preset = TTS_ACCENTS.find((a) => a.id === "english-female") || TTS_ACCENTS[1];
    }
  } else {
    preset = getActiveTtsPreset(settings);
  }

  // Match the best browser voice based on preferred languages and target gender
  let matchedVoice: SpeechSynthesisVoice | undefined;
  let isRealMaleVoice = false;

  if (preset.gender === "male") {
    // 1. First priority: Look for explicit male voice in preferredLangs
    for (const prefLang of preset.preferredLangs) {
      const candidates = voices.filter(
        (v) =>
          v.lang.toLowerCase().startsWith(prefLang.toLowerCase()) ||
          prefLang.toLowerCase().startsWith(v.lang.toLowerCase()),
      );
      const maleCandidate = candidates.find(isMaleVoice);
      if (maleCandidate) {
        matchedVoice = maleCandidate;
        isRealMaleVoice = true;
        break;
      }
    }

    // 2. Second priority: If English male, look for any explicit male English voice
    if (!matchedVoice && preset.category === "english") {
      matchedVoice = voices.find((v) => v.lang.startsWith("en") && isMaleVoice(v));
      if (matchedVoice) isRealMaleVoice = true;
    }

    // 3. Fallback: Select best language candidate
    if (!matchedVoice) {
      for (const prefLang of preset.preferredLangs) {
        const candidate = voices.find(
          (v) =>
            v.lang.toLowerCase().startsWith(prefLang.toLowerCase()) ||
            prefLang.toLowerCase().startsWith(v.lang.toLowerCase()),
        );
        if (candidate) {
          matchedVoice = candidate;
          break;
        }
      }
    }

    // Pitch & rate acoustic engineering for Male:
    // If it's a real male voice, keep natural acoustic timbre.
    // If it's a fallback voice (like Chrome's Google US English or Google Hindi which are female),
    // pitch shift down by 0.74 to transform the formant into an authentic masculine baritone!
    const userPitch = settings.pitch || 1.0;
    const userRate = settings.rate || 1.0;

    if (isRealMaleVoice) {
      utterance.pitch = Math.max(0.5, Math.min(1.5, userPitch * preset.pitch));
      utterance.rate = Math.max(0.5, Math.min(1.75, userRate * preset.rate));
    } else {
      utterance.pitch = Math.max(0.5, Math.min(1.5, userPitch * 0.74));
      utterance.rate = Math.max(0.5, Math.min(1.75, userRate * 0.94));
    }
  } else {
    // Gender: Female
    for (const prefLang of preset.preferredLangs) {
      const candidates = voices.filter(
        (v) =>
          v.lang.toLowerCase().startsWith(prefLang.toLowerCase()) ||
          prefLang.toLowerCase().startsWith(v.lang.toLowerCase()),
      );
      const femaleCandidate = candidates.find(isFemaleVoice);
      if (femaleCandidate) {
        matchedVoice = femaleCandidate;
        break;
      }
      if (candidates.length > 0 && !matchedVoice) {
        matchedVoice = candidates[0];
      }
    }

    const userPitch = settings.pitch || 1.0;
    const userRate = settings.rate || 1.0;

    if (matchedVoice && isMaleVoice(matchedVoice)) {
      utterance.pitch = Math.max(0.5, Math.min(1.5, userPitch * 1.3));
      utterance.rate = Math.max(0.5, Math.min(1.75, userRate * 1.0));
    } else {
      utterance.pitch = Math.max(0.5, Math.min(1.5, userPitch * preset.pitch));
      utterance.rate = Math.max(0.5, Math.min(1.75, userRate * preset.rate));
    }
  }

  if (!matchedVoice && voices.length > 0) {
    matchedVoice = voices[0];
  }

  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  // Set appropriate language tag
  if (preset.category === "natural-urdu") {
    utterance.lang = matchedVoice?.lang?.startsWith("ur") ? matchedVoice.lang : "ur-PK";
  } else if (preset.category === "roman-urdu") {
    utterance.lang = matchedVoice?.lang?.startsWith("en")
      ? matchedVoice.lang
      : matchedVoice?.lang?.startsWith("ur")
        ? matchedVoice.lang
        : "en-IN";
  } else {
    utterance.lang = matchedVoice?.lang || "en-US";
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
    // Safety interval for Desktop Chromium bug (long speech > 15s pausing unexpectedly).
    // Uses gentle 10s resume tick. Crucially, NEVER call pause()/resume() at 500ms intervals,
    // and NEVER prematurely finishSpeech() here, because Android Chrome TTS engines choke
    // and cancel the utterance after 1-2 words.
    keepAliveTimer = setInterval(() => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        if (window.speechSynthesis.speaking) {
          try {
            window.speechSynthesis.resume();
          } catch {}
        }
      }
    }, 10000);
    notifySpeechState(true, clean);
  };

  utterance.onend = () => {
    finishSpeech();
  };

  utterance.onerror = () => {
    finishSpeech();
  };

  // Maximum speech duration timeout: ensures state never hangs permanently while allowing complete natural speech
  const wordsCount = clean.split(/\s+/).filter(Boolean).length;
  const maxSpeechDurationMs = Math.max(15000, Math.ceil((wordsCount / 0.7) * 1000 + 20000));
  setTimeout(() => {
    if (!hasEnded && activeUtterance === utterance) {
      console.warn("[TTS] Speech reached max expected duration, forcing completion.");
      finishSpeech();
    }
  }, maxSpeechDurationMs);

  window.speechSynthesis.speak(utterance);
}

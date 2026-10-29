/**
 * Browser Text-to-Speech (TTS) Engine using Web Speech API (window.speechSynthesis)
 */

import { saveServerSetting } from "../serverSettingsSync";
import { adaptRomanUrduForVoice } from "./romanUrduSpeechAdapter";

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

export type TtsDeliveryStyleId = "natural" | "business" | "promo" | "explainer" | "calm";

export interface VoiceDeliveryStyle {
  id: TtsDeliveryStyleId;
  label: string;
  geminiActingPrefix: string;
  edgePreset: { rate: string; pitch: string; volume: string };
  // Backwards-compatible accessors for existing UI components
  rate: string;
  pitch: string;
  volume: string;
}

export const VOCAL_STYLES: Record<string, VoiceDeliveryStyle> = {
  natural: {
    id: "natural",
    label: "Normal (Natural human voice)",
    geminiActingPrefix: "",
    edgePreset: { rate: "+0%", pitch: "+0Hz", volume: "+0%" },
    rate: "+0%",
    pitch: "+0Hz",
    volume: "+0%",
  },
  explainer: {
    id: "explainer",
    label: "Explainer (Friendly, clear & unhurried)",
    geminiActingPrefix:
      "Say this like a friendly expert explaining something simply — relaxed, clear and unhurried:",
    edgePreset: { rate: "-6%", pitch: "+0Hz", volume: "+0%" },
    rate: "-6%",
    pitch: "+0Hz",
    volume: "+0%",
  },
  business: {
    id: "business",
    label: "Business (Confident brand voice)",
    geminiActingPrefix:
      "Say this in a confident, polished corporate voice — warm, clear and authoritative:",
    edgePreset: { rate: "+4%", pitch: "+5Hz", volume: "+6%" },
    rate: "+4%",
    pitch: "+5Hz",
    volume: "+6%",
  },
  promo: {
    id: "promo",
    label: "Energetic (Fast & punchy)",
    geminiActingPrefix:
      "Say this like an excited product promo — fast, punchy, high energy, selling it:",
    edgePreset: { rate: "+18%", pitch: "+30Hz", volume: "+12%" },
    rate: "+18%",
    pitch: "+30Hz",
    volume: "+12%",
  },
  calm: {
    id: "calm",
    label: "Calm (Slow & soothing narration)",
    geminiActingPrefix:
      "Say this calmly and slowly, like a narrator reading to someone at the end of the day:",
    edgePreset: { rate: "-14%", pitch: "-20Hz", volume: "-4%" },
    rate: "-14%",
    pitch: "-20Hz",
    volume: "-4%",
  },
};

export const VOICE_DELIVERY_STYLES = VOCAL_STYLES;

export function getGeminiActingPrefix(styleId?: string): string {
  const style =
    (styleId && (VOCAL_STYLES[styleId] || VOICE_DELIVERY_STYLES[styleId])) || VOCAL_STYLES.natural;
  return style.geminiActingPrefix || "";
}

export function getDeliveryStyleMultipliers(styleId?: string): {
  rateMultiplier: number;
  pitchMultiplier: number;
  volumeMultiplier: number;
} {
  const style =
    (styleId && (VOCAL_STYLES[styleId] || VOICE_DELIVERY_STYLES[styleId])) || VOCAL_STYLES.natural;

  const rateStr = style.edgePreset?.rate || style.rate || "+0%";
  const pitchStr = style.edgePreset?.pitch || style.pitch || "+0Hz";
  const volStr = style.edgePreset?.volume || style.volume || "+0%";

  const rateMatch = rateStr.match(/([+-]?\d+)%/);
  const ratePct = rateMatch ? parseInt(rateMatch[1], 10) : 0;
  const rateMultiplier = 1 + ratePct / 100;

  const pitchMatch = pitchStr.match(/([+-]?\d+)Hz/);
  const pitchHz = pitchMatch ? parseInt(pitchMatch[1], 10) : 0;
  const pitchMultiplier = 1 + pitchHz / 200;

  const volMatch = volStr.match(/([+-]?\d+)%/);
  const volPct = volMatch ? parseInt(volMatch[1], 10) : 0;
  const volumeMultiplier = 1 + volPct / 100;

  return { rateMultiplier, pitchMultiplier, volumeMultiplier };
}

export interface TtsSettings {
  language: TtsLanguageMode;
  voiceURI?: string;
  rate: number;
  pitch: number;
  volume: number;
  deliveryStyle?: TtsDeliveryStyleId;
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

  // 2. Roman Urdu Male & Female (High Accuracy Pakistani Accent)
  {
    id: "roman-urdu-male",
    name: "Roman Urdu (Male HD - High Accuracy)",
    nameUrdu: "رومن اردو (مردانہ آواز - ہائی ایکوریسی)",
    category: "roman-urdu",
    gender: "male",
    preferredLangs: ["ur-PK", "ur", "en-IN", "hi-IN", "en-GB", "en-US"],
    pitch: 0.9,
    rate: 0.96,
    sampleText:
      "Assalam o alaikum! Yeh Roman Urdu male high accuracy voice ka test hai. Main aap ki kya madad kar sakta hoon?",
    description: "Authentic Pakistani Roman Urdu accent with enhanced phonetic clarity (Male).",
  },
  {
    id: "roman-urdu-female",
    name: "Roman Urdu (Female HD - High Accuracy)",
    nameUrdu: "رومن اردو (زنانہ آواز - ہائی ایکوریسی)",
    category: "roman-urdu",
    gender: "female",
    preferredLangs: ["ur-PK", "ur", "en-IN", "hi-IN", "en-GB", "en-US"],
    pitch: 1.06,
    rate: 0.96,
    sampleText:
      "Assalam o alaikum! Yeh Roman Urdu female high accuracy voice ka test hai. Main aap ki kya madad kar sakti hoon?",
    description: "Clear and fluent Pakistani Roman Urdu conversational voice (Female).",
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
  deliveryStyle: "natural",
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
    const validStyles: TtsDeliveryStyleId[] = ["natural", "business", "promo", "explainer", "calm"];
    const deliveryStyle: TtsDeliveryStyleId = validStyles.includes(parsed.deliveryStyle)
      ? parsed.deliveryStyle
      : "natural";
    return {
      language: normalizedLang,
      voiceURI,
      rate,
      pitch,
      volume,
      deliveryStyle,
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
let activeSpokenText: string | null = null;
const activeUtterancesSet = new Set<SpeechSynthesisUtterance>();
const listeners = new Set<(isSpeaking: boolean, speakingText: string | null) => void>();
let isNotifyingSpeechState = false;

function notifySpeechState(isSpeaking: boolean, text: string | null = null) {
  if (isNotifyingSpeechState) return;
  isNotifyingSpeechState = true;
  try {
    activeSpokenText = isSpeaking ? text : null;
    for (const fn of Array.from(listeners)) {
      try {
        fn(isSpeaking, text);
      } catch (err) {
        console.warn("[TTS] Error in speech state listener:", err);
      }
    }
  } finally {
    isNotifyingSpeechState = false;
  }
}

export function getActiveSpokenText(): string | null {
  return isCurrentlySpeaking() ? activeSpokenText : null;
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
      // Clean URLs (http/https) to avoid speaking long links in voice calls
      .replace(/https?:\/\/[^\s)]+/gi, "")
      // Clean absolute/relative file paths (e.g. /home/user/app or src/components/...)
      .replace(/(?:^|\s)(?:\/[\w.-]+)+\b/g, " ")
      .replace(/(?:^|\s)(?:[a-zA-Z]:\\[\w.-]+)+\b/g, " ")
      // Clean remaining short inline code (e.g. `foo()` or `name` -> foo, name)
      .replace(/`([^`\n]+)`/g, (_match, inner) => inner.replace(/[()[\]{}]/g, "").trim())
      .replace(/#+\s+/g, "") // headers (###)
      .replace(/\*\*([^*]+)\*\*/g, "$1") // bold (**)
      .replace(/\*([^*]+)\*/g, "$1") // italic (*)
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
 * Neural Voices Priority (Inspired by Digi-Labs / Microsoft Edge Neural Voices)
 * Matches top-tier human sounding voices in Chromium/Edge/Windows/Android platforms.
 */
export const DIGI_LABS_NEURAL_VOICE_NAMES = [
  "ur-pk-asadneural",
  "ur-pk-uzmaneural",
  "hi-in-madhurneural",
  "hi-in-swaraneural",
  "en-us-andrewmultilingualneural",
  "en-us-brianmultilingualneural",
  "en-us-avamultilingualneural",
  "en-us-emmamultilingualneural",
  "asad",
  "uzma",
  "madhur",
  "swara",
  "andrew",
  "brian",
  "ava",
  "emma",
];

export function getNeuralVoiceScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const uri = (voice.voiceURI || "").toLowerCase();
  const text = `${name} ${uri}`;

  // Top tier: Exact Edge/Digi-Labs neural voices
  if (text.includes("asad") || text.includes("uzma")) return 100;
  if (text.includes("madhur") || text.includes("swara")) return 90;
  if (text.includes("andrew") || text.includes("brian")) return 85;
  if (text.includes("neural") || text.includes("natural") || text.includes("online")) return 75;
  if (name.includes("google") || uri.includes("google")) return 50;
  return 10;
}

/**
 * Injects subtle breath pauses at Urdu clause boundaries and conjunctions,
 * inspired by Digi-Labs natural cadence tuning.
 * Prevents speech engines from rushing through long sentences without breathing.
 */
export function injectNaturalCadencePauses(text: string): string {
  if (!text) return "";

  let result = text
    // 1. Standardize Urdu Unicode punctuation to natural speech pauses
    .replace(/،/g, ", ")
    .replace(/۔/g, ". ")
    .replace(/؟/g, "? ")
    .replace(/؛/g, "; ");

  // 2. Add micro-pause after conversational honorifics and acknowledgments if no punctuation follows
  result = result.replace(
    /\b(assalam[\s-]o[\s-]alaikum|walaikum[\s-]assalam|ji boss|haan ji|jee haan|acha boss|shukriya|meherbani)\b(?!\s*[,.?!;:])/gi,
    "$1,",
  );

  // 3. Add breath micro-pause before Subcontinental conjunctions when not preceded by punctuation
  result = result.replace(
    /([^\s,;:.?!۔،])\s+(lekin|magar|kyunki|kyunkay|taake|is\s+liye|halanke|warna|balkay|phir\s+bhi)\b/gi,
    "$1, $2",
  );

  // 4. Clean up any accidental double commas or weird spaces
  result = result
    .replace(/,\s*,+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/\.\s*\.+/g, ".")
    .replace(/\s+\./g, ".")
    .replace(/\.\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return result;
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
  const sanitized = sanitizeTextForSpeech(text);
  const clean = injectNaturalCadencePauses(sanitized);
  if (!clean) {
    onEnd?.();
    return;
  }

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

  // Match the best browser voice based on preferred languages and target gender (prioritizing neural voices)
  let matchedVoice: SpeechSynthesisVoice | undefined;
  let targetPitch = 1.0;
  let targetRate = 1.0;
  const userPitch = settings.pitch || 1.0;
  const userRate = settings.rate || 1.0;

  if (preset.gender === "male") {
    let isRealMaleVoice = false;
    // 1. First priority: Look for explicit male voice in preferredLangs (prioritizing neural)
    for (const prefLang of preset.preferredLangs) {
      const candidates = voices
        .filter(
          (v) =>
            v.lang.toLowerCase().startsWith(prefLang.toLowerCase()) ||
            prefLang.toLowerCase().startsWith(v.lang.toLowerCase()),
        )
        .filter(isMaleVoice)
        .sort((a, b) => getNeuralVoiceScore(b) - getNeuralVoiceScore(a));

      if (candidates.length > 0) {
        matchedVoice = candidates[0];
        isRealMaleVoice = true;
        break;
      }
    }

    // 2. Second priority: If English male, look for any explicit male English voice (prioritizing neural)
    if (!matchedVoice && preset.category === "english") {
      const candidates = voices
        .filter((v) => v.lang.startsWith("en") && isMaleVoice(v))
        .sort((a, b) => getNeuralVoiceScore(b) - getNeuralVoiceScore(a));
      if (candidates.length > 0) {
        matchedVoice = candidates[0];
        isRealMaleVoice = true;
      }
    }

    // 3. Fallback: Select best language candidate (prioritizing neural)
    if (!matchedVoice) {
      for (const prefLang of preset.preferredLangs) {
        const candidates = voices
          .filter(
            (v) =>
              v.lang.toLowerCase().startsWith(prefLang.toLowerCase()) ||
              prefLang.toLowerCase().startsWith(v.lang.toLowerCase()),
          )
          .sort((a, b) => getNeuralVoiceScore(b) - getNeuralVoiceScore(a));
        if (candidates.length > 0) {
          matchedVoice = candidates[0];
          break;
        }
      }
    }

    // Pitch & rate acoustic engineering for Male:
    // If it's a real male voice, keep natural acoustic timbre.
    // If it's a fallback voice (like Chrome's Google US English or Google Hindi which are female),
    // pitch shift down by 0.74 to transform the formant into an authentic masculine baritone!
    if (isRealMaleVoice) {
      targetPitch = Math.max(0.5, Math.min(1.5, userPitch * preset.pitch));
      targetRate = Math.max(0.5, Math.min(1.75, userRate * preset.rate));
    } else {
      targetPitch = Math.max(0.5, Math.min(1.5, userPitch * 0.74));
      targetRate = Math.max(0.5, Math.min(1.75, userRate * 0.94));
    }
  } else {
    // Gender: Female (prioritizing neural voices)
    for (const prefLang of preset.preferredLangs) {
      const candidates = voices
        .filter(
          (v) =>
            v.lang.toLowerCase().startsWith(prefLang.toLowerCase()) ||
            prefLang.toLowerCase().startsWith(v.lang.toLowerCase()),
        )
        .filter(isFemaleVoice)
        .sort((a, b) => getNeuralVoiceScore(b) - getNeuralVoiceScore(a));
      if (candidates.length > 0) {
        matchedVoice = candidates[0];
        break;
      }
    }

    if (!matchedVoice) {
      for (const prefLang of preset.preferredLangs) {
        const candidates = voices
          .filter(
            (v) =>
              v.lang.toLowerCase().startsWith(prefLang.toLowerCase()) ||
              prefLang.toLowerCase().startsWith(v.lang.toLowerCase()),
          )
          .sort((a, b) => getNeuralVoiceScore(b) - getNeuralVoiceScore(a));
        if (candidates.length > 0) {
          matchedVoice = candidates[0];
          break;
        }
      }
    }

    if (matchedVoice && isMaleVoice(matchedVoice)) {
      targetPitch = Math.max(0.5, Math.min(1.5, userPitch * 1.3));
      targetRate = Math.max(0.5, Math.min(1.75, userRate * 1.0));
    } else {
      targetPitch = Math.max(0.5, Math.min(1.5, userPitch * preset.pitch));
      targetRate = Math.max(0.5, Math.min(1.75, userRate * preset.rate));
    }
  }

  if (!matchedVoice && voices.length > 0) {
    matchedVoice = voices[0];
  }

  // Apply Vocal Delivery Style co-tuning multipliers (Digi-Labs Rate, Pitch, and Volume co-tuning)
  const deliveryMultipliers = getDeliveryStyleMultipliers(settings.deliveryStyle);
  targetPitch = Math.max(0.5, Math.min(1.5, targetPitch * deliveryMultipliers.pitchMultiplier));
  targetRate = Math.max(0.5, Math.min(1.75, targetRate * deliveryMultipliers.rateMultiplier));
  const finalVolume = Math.max(
    0,
    Math.min(1.0, (settings.volume ?? 1.0) * deliveryMultipliers.volumeMultiplier),
  );

  // High accuracy text adaptation for Roman Urdu & language tags
  let spokenText = clean;
  let targetLang = "en-IN";

  if (preset.category === "roman-urdu") {
    const adapted = adaptRomanUrduForVoice(clean, matchedVoice);
    spokenText = adapted.text;
    targetLang = adapted.lang;
  } else if (preset.category === "natural-urdu") {
    spokenText = clean;
    targetLang = matchedVoice?.lang?.startsWith("ur") ? matchedVoice.lang : "ur-PK";
  } else {
    spokenText = clean;
    targetLang = matchedVoice?.lang || "en-US";
  }

  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.pitch = targetPitch;
  utterance.rate = targetRate;
  utterance.lang = targetLang;
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }
  utterance.volume = finalVolume;

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

  // Maximum speech duration timeout: ensures state never hangs permanently while allowing complete natural speech.
  // Dynamically accounts for slow rates, non-English & Urdu phonemes/scripts so speech is NEVER cut off mid-sentence.
  const charCount = clean.length;
  const wordsCount = Math.max(clean.split(/\s+/).filter(Boolean).length, Math.ceil(charCount / 5));
  const isNonEnglishOrUrdu =
    /[\u0600-\u06FF]/.test(clean) ||
    Boolean(options?.language && !options.language.toLowerCase().startsWith("en"));
  const wps = isNonEnglishOrUrdu ? 0.6 : 1.0;
  const effectiveRate = Math.max(0.25, Math.min(2.0, options?.rate ?? 1.0));
  const adjustedWps = Math.max(0.3, wps * effectiveRate);
  const estimatedMs = Math.ceil((wordsCount / adjustedWps) * 1000 + 45000);
  const maxSpeechDurationMs = Math.max(60000, estimatedMs);
  setTimeout(() => {
    if (!hasEnded && activeUtterance === utterance) {
      console.warn("[TTS] Speech reached max expected duration, forcing completion.");
      finishSpeech();
    }
  }, maxSpeechDurationMs);

  window.speechSynthesis.speak(utterance);
}

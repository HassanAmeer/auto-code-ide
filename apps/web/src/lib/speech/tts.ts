/**
 * Browser Text-to-Speech (TTS) Engine using Web Speech API (window.speechSynthesis)
 */

export type TtsLanguageMode =
  | "auto-male"
  | "auto-female"
  | "roman-urdu"
  | "natural-urdu"
  | "english";

export interface TtsSettings {
  language: TtsLanguageMode;
  voiceURI?: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface TtsAccentPreset {
  id: string;
  name: string;
  category: "roman-urdu" | "natural-urdu" | "hindi" | "english";
  gender: "male" | "female";
  preferredLangs: string[];
  pitch: number;
  rate: number;
  description: string;
}

export const TTS_ACCENTS: TtsAccentPreset[] = [
  // Roman Urdu Accents (2 Male, 2 Female)
  {
    id: "accent:roman-urdu-male-1",
    name: "Roman Urdu - Male Accent 1 (Smooth Pakistani)",
    category: "roman-urdu",
    gender: "male",
    preferredLangs: ["hi-IN", "ur-PK", "en-IN", "en-US"],
    pitch: 0.9,
    rate: 0.98,
    description: "Natural conversational tone suited for daily Roman Urdu chat.",
  },
  {
    id: "accent:roman-urdu-male-2",
    name: "Roman Urdu - Male Accent 2 (Deep Narrative)",
    category: "roman-urdu",
    gender: "male",
    preferredLangs: ["hi-IN", "ur-PK", "en-IN", "en-US"],
    pitch: 0.82,
    rate: 0.95,
    description: "Deep, resonant tone for clear explanation of code and steps.",
  },
  {
    id: "accent:roman-urdu-female-1",
    name: "Roman Urdu - Female Accent 1 (Melodic Clear)",
    category: "roman-urdu",
    gender: "female",
    preferredLangs: ["hi-IN", "ur-PK", "en-IN", "en-US"],
    pitch: 1.16,
    rate: 1.02,
    description: "Clear and fluent female voice for Roman Urdu assistance.",
  },
  {
    id: "accent:roman-urdu-female-2",
    name: "Roman Urdu - Female Accent 2 (Soft Expressive)",
    category: "roman-urdu",
    gender: "female",
    preferredLangs: ["hi-IN", "ur-PK", "en-IN", "en-US"],
    pitch: 1.25,
    rate: 0.96,
    description: "Gentle and expressive tone for conversational feedback.",
  },

  // Natural Urdu Accents (2 Male, 2 Female)
  {
    id: "accent:natural-urdu-male-1",
    name: "Natural Urdu - Male Accent 1 (Standard Lahori/Karachi)",
    category: "natural-urdu",
    gender: "male",
    preferredLangs: ["ur-PK", "ur", "hi-IN", "hi"],
    pitch: 0.88,
    rate: 0.96,
    description: "Authentic Pakistani Urdu pronunciation and cadence.",
  },
  {
    id: "accent:natural-urdu-male-2",
    name: "Natural Urdu - Male Accent 2 (Classical Radio)",
    category: "natural-urdu",
    gender: "male",
    preferredLangs: ["ur-PK", "ur", "hi-IN", "hi"],
    pitch: 0.8,
    rate: 0.92,
    description: "Deep classical voice inspired by traditional radio broadcasts.",
  },
  {
    id: "accent:natural-urdu-female-1",
    name: "Natural Urdu - Female Accent 1 (Standard Clear)",
    category: "natural-urdu",
    gender: "female",
    preferredLangs: ["ur-PK", "ur", "hi-IN", "hi"],
    pitch: 1.18,
    rate: 1.0,
    description: "Polished native female pronunciation for Nastaliq text.",
  },
  {
    id: "accent:natural-urdu-female-2",
    name: "Natural Urdu - Female Accent 2 (Soft Eloquent)",
    category: "natural-urdu",
    gender: "female",
    preferredLangs: ["ur-PK", "ur", "hi-IN", "hi"],
    pitch: 1.28,
    rate: 0.95,
    description: "Eloquent and relaxed tempo for reading lengthy answers.",
  },

  // Hindi Accents (2 Male, 2 Female)
  {
    id: "accent:hindi-male-1",
    name: "Hindi - Male Accent 1 (Delhi Standard)",
    category: "hindi",
    gender: "male",
    preferredLangs: ["hi-IN", "hi", "en-IN"],
    pitch: 0.92,
    rate: 1.0,
    description: "Standard North Indian Hindi/Hindustani accent.",
  },
  {
    id: "accent:hindi-male-2",
    name: "Hindi - Male Accent 2 (Deep Resonance)",
    category: "hindi",
    gender: "male",
    preferredLangs: ["hi-IN", "hi", "en-IN"],
    pitch: 0.84,
    rate: 0.94,
    description: "Deep voice with clear Hindi articulation.",
  },
  {
    id: "accent:hindi-female-1",
    name: "Hindi - Female Accent 1 (Modern Clear)",
    category: "hindi",
    gender: "female",
    preferredLangs: ["hi-IN", "hi", "en-IN"],
    pitch: 1.15,
    rate: 1.02,
    description: "Modern, crisp female accent for Hindi & Romanized content.",
  },
  {
    id: "accent:hindi-female-2",
    name: "Hindi - Female Accent 2 (Melodic Expressive)",
    category: "hindi",
    gender: "female",
    preferredLangs: ["hi-IN", "hi", "en-IN"],
    pitch: 1.26,
    rate: 0.98,
    description: "Warm, melodious Hindi female vocal tone.",
  },

  // English Accents (2 Male, 2 Female)
  {
    id: "accent:english-male-1",
    name: "English - Male Accent 1 (US Natural)",
    category: "english",
    gender: "male",
    preferredLangs: ["en-US", "en"],
    pitch: 0.9,
    rate: 1.0,
    description: "Standard American English male accent.",
  },
  {
    id: "accent:english-male-2",
    name: "English - Male Accent 2 (UK Classical)",
    category: "english",
    gender: "male",
    preferredLangs: ["en-GB", "en"],
    pitch: 0.92,
    rate: 0.96,
    description: "Refined British English male articulation.",
  },
  {
    id: "accent:english-female-1",
    name: "English - Female Accent 1 (US Clear)",
    category: "english",
    gender: "female",
    preferredLangs: ["en-US", "en"],
    pitch: 1.15,
    rate: 1.0,
    description: "Clear and professional American English female voice.",
  },
  {
    id: "accent:english-female-2",
    name: "English - Female Accent 2 (UK Polished)",
    category: "english",
    gender: "female",
    preferredLangs: ["en-GB", "en"],
    pitch: 1.2,
    rate: 0.98,
    description: "Polished and fluent British English female voice.",
  },
];

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

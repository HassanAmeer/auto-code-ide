/**
 * CludeGods Echo Filter Engine
 *
 * Standalone, zero-dependency acoustic echo cancellation, sequence matching,
 * and instant barge-in detection inspired by CludeGods (skills/gods/bin/listen.py).
 *
 * Core Capabilities:
 * 1. Playhead Timeline Windowing: Correlates assistant utterance playback windows [t_start - 300ms, t_end + 1500ms]
 *    with STT transcript arrival times to distinguish real user speech from speaker acoustic bleed.
 * 2. Multi-Tier Loose Word Equivalence (mine_word):
 *    - Exact word match
 *    - Compound split (|w| >= 4 and substring of joined assistant speech)
 *    - 4-character prefix match
 *    - Length-1 edit distance (Levenshtein <= 1 or substring)
 *    - Fuzzy sequence ratio (LCS >= 0.80)
 * 3. Stopword Shielding: Protects user prepositions & conjunctions flanked by user words so they are not stripped.
 * 4. Contiguous User Run Extraction (his_runs): Requires >=2 contiguous unflagged words for user speech blocks,
 *    preventing isolated acoustic artifacts from triggering false barge-ins.
 * 5. Sliding Character Sequence Matching (char_echo): Catches phonetically garbled STT transcriptions where
 *    words are misrecognized (char_echo >= 0.58 for partials, >= 0.62 for turns).
 * 6. Bilingual Roman Urdu & English Support: Transliteration normalization, numeric expansion (1 -> one),
 *    and explicit interrupt command bypass ("Stop", "Ruko", "Wait").
 * 7. Ultra-Low Latency (<2.5ms typical, strictly <5ms budget).
 */

export interface SpokenUtterance {
  id: string;
  text: string;
  startTime: number;
  endTime: number | null; // null if currently playing
}

export interface EchoFilterDecision {
  action: "drop" | "barge" | "emit";
  cleanedText: string;
  reason: string;
  isBargeIn: boolean;
  charEchoScore: number;
  wordOverlapRatio: number;
}

export interface CludeGodsEchoFilterOptions {
  leadMs?: number; // default: 300ms
  tailMs?: number; // default: 1500ms
  sttLatencyMs?: number; // default: 300ms
  bargeMinContentWords?: number; // default: 2
  bargeMinWords?: number; // default: 2
  echoShareThreshold?: number; // default: 0.60 (if >=60% echo, require +1 content word)
  echoTextShareThreshold?: number; // default: 0.80
  charEchoThresholdPartial?: number; // default: 0.58
  charEchoThresholdTurn?: number; // default: 0.62
  charEchoMinChars?: number; // default: 8
  contiguousRunMin?: number; // default: 2
  staleLineTimeoutMs?: number; // default: 180000 (180s)
  recentUtteranceTtlMs?: number; // default: 60000 (60s)
  isHeadphones?: () => boolean;
  clock?: () => number;
}

// Common English & Roman Urdu stopwords that cannot alone constitute content words
const COMMON_STOPWORDS = new Set<string>([
  // English stopwords
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "and",
  "or",
  "but",
  "so",
  "if",
  "that",
  "this",
  "it",
  "its",
  "is",
  "was",
  "be",
  "as",
  "are",
  "were",
  "been",
  "am",
  "do",
  "did",
  "does",
  "have",
  "has",
  "had",
  "he",
  "she",
  "they",
  "we",
  "you",
  "i",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "their",
  "our",
  "there",
  "here",
  "then",
  "up",
  "out",
  "about",
  "into",
  "over",
  "after",
  "can",
  "could",
  "will",
  "would",
  "shall",
  "should",

  // Roman Urdu stopwords & particles
  "ka",
  "ki",
  "ke",
  "ko",
  "se",
  "par",
  "pe",
  "mein",
  "main",
  "aur",
  "ya",
  "bhi",
  "to",
  "toh",
  "jo",
  "kar",
  "ho",
  "hai",
  "hain",
  "tha",
  "thi",
  "the",
  "ab",
  "yeh",
  "ye",
  "woh",
  "wo",
  "mera",
  "meri",
  "mere",
  "hamara",
  "apka",
  "iska",
  "unka",
  "in",
  "un",
  "is",
  "us",
  "kuch",
  "sab",
  "sirf",
  "hi",
  "hun",
  "hoon",
]);

// Non-content conversational fillers / backchannels that alone do not trigger barge-in
const BARGE_STOPWORDS = new Set<string>([
  ...COMMON_STOPWORDS,
  "um",
  "uh",
  "ah",
  "er",
  "hmm",
  "hm",
  "oh",
  "okay",
  "ok",
  "yeah",
  "yes",
  "theek",
  "thik",
  "acha",
  "achha",
  "sahi",
  "haan",
  "jee",
  "ji",
]);

// Explicit interrupt commands (English & Roman Urdu) that instantly bypass echo stripping
const EXPLICIT_INTERRUPT_KEYWORDS = [
  "stop",
  "ruko",
  "wait",
  "suno",
  "bas",
  "halt",
  "cancel",
  "thahro",
  "chup",
  "pause",
  "ruk jao",
  "rukjao",
  "bas karo",
  "baskaro",
  "rok do",
  "rokdo",
  "shut up",
  "quiet",
  "silence",
  "hold on",
];

// Number to word mappings for English and Roman Urdu numeral expansion
const NUMERAL_MAP: Record<string, string> = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  "11": "eleven",
  "12": "twelve",
  "13": "thirteen",
  "14": "fourteen",
  "15": "fifteen",
  "16": "sixteen",
  "17": "seventeen",
  "18": "eighteen",
  "19": "nineteen",
  "20": "twenty",
  "30": "thirty",
  "40": "forty",
  "50": "fifty",
  "60": "sixty",
  "70": "seventy",
  "80": "eighty",
  "90": "ninety",
  "100": "hundred",
  "1000": "thousand",
};

// Common Roman Urdu spelling normalizations
const ROMAN_URDU_NORMALIZATION_MAP: Record<string, string> = {
  mein: "main",
  kia: "kya",
  kyu: "kyun",
  ye: "yeh",
  wo: "woh",
  bhee: "bhi",
  rha: "raha",
  rhay: "rahe",
  rhi: "rahi",
  gae: "gaye",
  gai: "gayi",
  gya: "gaya",
  dya: "diya",
  krna: "karna",
  krte: "karte",
  krti: "karti",
  ap: "aap",
  apka: "aapka",
  apki: "aapki",
  apke: "aapke",
  shukria: "shukriya",
  thik: "theek",
  hun: "hoon",
  he: "hai",
  hein: "hain",
  vps: "vps",
};

/**
 * Fast Levenshtein edit distance using single flat Int32Array (O(min(N, M)) space)
 */
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  let a = s1;
  let b = s2;
  if (a.length > b.length) {
    a = s2;
    b = s1;
  }

  const m = a.length;
  const n = b.length;
  let prevRow = new Int32Array(m + 1);
  let currRow = new Int32Array(m + 1);

  for (let i = 0; i <= m; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= n; j++) {
    currRow[0] = j;
    const charB = b.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const cost = a.charCodeAt(i - 1) === charB ? 0 : 1;
      const currLeft = currRow[i - 1] ?? 0;
      const prevAbove = prevRow[i] ?? 0;
      const prevDiag = prevRow[i - 1] ?? 0;
      currRow[i] = Math.min(
        currLeft + 1, // insertion
        prevAbove + 1, // deletion
        prevDiag + cost, // substitution
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[m] ?? 0;
}

/**
 * Fast Longest Common Subsequence (LCS) length with two-row DP
 */
export function lcsLength(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return s1.length;

  let a = s1;
  let b = s2;
  if (a.length > b.length) {
    a = s2;
    b = s1;
  }

  const m = a.length;
  const n = b.length;
  let prev = new Int32Array(m + 1);
  let curr = new Int32Array(m + 1);

  for (let j = 1; j <= n; j++) {
    const charB = b.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      if (a.charCodeAt(i - 1) === charB) {
        curr[i] = (prev[i - 1] ?? 0) + 1;
      } else {
        curr[i] = Math.max(prev[i] ?? 0, curr[i - 1] ?? 0);
      }
    }
    const temp = prev;
    prev = curr;
    curr = temp;
  }

  return prev[m] ?? 0;
}

/**
 * Normalized sequence similarity ratio: 2 * LCS(s1, s2) / (|s1| + |s2|)
 */
export function sequenceRatio(s1: string, s2: string): number {
  const total = s1.length + s2.length;
  if (total === 0) return 1.0;
  return (2.0 * lcsLength(s1, s2)) / total;
}

/**
 * Clean string to lowercase alphanumeric only (strips punctuation and spaces)
 */
export function cleanAlphanumeric(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Expands numbers in text to their English word equivalents
 */
export function expandNumerals(text: string): string {
  return text.replace(/\b\d+\b/g, (match) => {
    return NUMERAL_MAP[match] || match;
  });
}

/**
 * Normalizes Roman Urdu phonetic variations and common transliteration discrepancies
 */
export function normalizeRomanUrduWord(word: string): string {
  const lower = word.toLowerCase().trim();
  return ROMAN_URDU_NORMALIZATION_MAP[lower] || lower;
}

/**
 * Tokenizes text into normalized words with numeric expansion and Urdu normalization
 */
export function tokenizeWords(text: string): string[] {
  const expanded = expandNumerals(text);
  const words = expanded
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  return words.map(normalizeRomanUrduWord);
}

/**
 * Checks if a word is an explicit interrupt command
 */
export function isExplicitInterruptWord(text: string): boolean {
  const norm = cleanAlphanumeric(text);
  for (const kw of EXPLICIT_INTERRUPT_KEYWORDS) {
    const cleanKw = cleanAlphanumeric(kw);
    if (norm === cleanKw || norm.startsWith(cleanKw)) {
      return true;
    }
  }
  return false;
}

/**
 * Loose word equivalence matching according to CludeGods specification:
 * 1. Exact match in said words
 * 2. Compound split (|w| >= 4 and w is a substring of joined said words)
 * 3. 4-character prefix match (|w| >= 4 and |s| >= 4 and w[0..4] === s[0..4])
 * 4. Length-1 edit distance (||w| - |s|| <= 1 and (w sub s or s sub w or Levenshtein <= 1))
 * 5. Sequence ratio >= 0.80
 */
export function isLooseWordMatch(
  heardWord: string,
  saidWords: string[],
  saidJoined: string,
): boolean {
  if (saidWords.includes(heardWord)) return true;

  if (heardWord.length >= 4 && saidJoined.includes(heardWord)) {
    return true;
  }

  for (const s of saidWords) {
    if (heardWord.length >= 4 && s.length >= 4 && heardWord.slice(0, 4) === s.slice(0, 4)) {
      return true;
    }

    if (Math.abs(heardWord.length - s.length) <= 1) {
      if (heardWord.length >= 3 && s.length >= 3) {
        if (heardWord.includes(s) || s.includes(heardWord)) return true;
        if (levenshteinDistance(heardWord, s) <= 1) return true;
      }
    }

    if (heardWord.length >= 3 && s.length >= 3) {
      if (sequenceRatio(heardWord, s) >= 0.8) return true;
    }
  }

  return false;
}

export class CludeGodsEchoFilter {
  private utterances: SpokenUtterance[] = [];
  private options: Required<CludeGodsEchoFilterOptions>;
  private lastBargeIn: { text: string; timestamp: number } | null = null;

  constructor(options?: CludeGodsEchoFilterOptions) {
    this.options = {
      leadMs: options?.leadMs ?? 300,
      tailMs: options?.tailMs ?? 1500,
      sttLatencyMs: options?.sttLatencyMs ?? 300,
      bargeMinContentWords: options?.bargeMinContentWords ?? 2,
      bargeMinWords: options?.bargeMinWords ?? 2,
      echoShareThreshold: options?.echoShareThreshold ?? 0.6,
      echoTextShareThreshold: options?.echoTextShareThreshold ?? 0.8,
      charEchoThresholdPartial: options?.charEchoThresholdPartial ?? 0.58,
      charEchoThresholdTurn: options?.charEchoThresholdTurn ?? 0.62,
      charEchoMinChars: options?.charEchoMinChars ?? 8,
      contiguousRunMin: options?.contiguousRunMin ?? 2,
      staleLineTimeoutMs: options?.staleLineTimeoutMs ?? 180000,
      recentUtteranceTtlMs: options?.recentUtteranceTtlMs ?? 60000,
      isHeadphones: options?.isHeadphones ?? (() => false),
      clock: options?.clock ?? (() => Date.now()),
    };
  }

  /**
   * Register the start of an assistant audio utterance
   */
  public registerPlaybackStart(id: string, text: string, startTime?: number): void {
    const now = startTime ?? this.options.clock();
    this.purgeStaleUtterances(now);

    // If an utterance with this id exists, update it
    const existing = this.utterances.find((u) => u.id === id);
    if (existing) {
      existing.text = text;
      existing.startTime = now;
      existing.endTime = null;
    } else {
      this.utterances.push({
        id,
        text,
        startTime: now,
        endTime: null,
      });
    }
  }

  /**
   * Register the completion or cancellation of an assistant audio utterance
   */
  public registerPlaybackEnd(id: string, endTime?: number): void {
    const now = endTime ?? this.options.clock();
    const utterance = this.utterances.find((u) => u.id === id);
    if (utterance) {
      utterance.endTime = now;
    } else {
      // If id not specified or unmatched, mark any still-playing utterance as ended
      for (const u of this.utterances) {
        if (u.endTime === null) {
          u.endTime = now;
        }
      }
    }
  }

  /**
   * Reset internal utterance history and barge-in state
   */
  public reset(): void {
    this.utterances = [];
    this.lastBargeIn = null;
  }

  /**
   * Get all active or recent utterances
   */
  public getUtterances(): readonly SpokenUtterance[] {
    return this.utterances;
  }

  /**
   * Process an interim STT transcript (partial recognition result)
   */
  public processInterimTranscript(
    rawTranscript: string,
    eventTimestamp?: number,
  ): EchoFilterDecision {
    const now = eventTimestamp ?? this.options.clock();
    const cleanRaw = rawTranscript.trim();

    if (!cleanRaw) {
      return {
        action: "drop",
        cleanedText: "",
        reason: "empty_transcript",
        isBargeIn: false,
        charEchoScore: 0,
        wordOverlapRatio: 0,
      };
    }

    // 1. Check relevant utterances in playhead window [t_start - lead, t_end + tail]
    const relevantUtterances = this.getRelevantUtterances(now);
    const saidTexts = relevantUtterances.map((u) => u.text);
    const allSaidWords: string[] = [];
    for (const t of saidTexts) {
      allSaidWords.push(...tokenizeWords(t));
    }

    // 2. Explicit interrupt command check (ALWAYS bypasses echo filter unless it is an echo of assistant's words)
    if (this.hasExplicitInterrupt(cleanRaw, allSaidWords)) {
      this.lastBargeIn = { text: cleanRaw, timestamp: now };
      return {
        action: "barge",
        cleanedText: cleanRaw,
        reason: "explicit_interrupt_command",
        isBargeIn: true,
        charEchoScore: 0,
        wordOverlapRatio: 0,
      };
    }

    // 3. Check if headphones mode is active
    if (this.options.isHeadphones()) {
      const words = tokenizeWords(cleanRaw);
      const isSpeaking = this.isAssistantSpeakingAt(now);
      if (isSpeaking && words.length >= this.options.bargeMinWords) {
        this.lastBargeIn = { text: cleanRaw, timestamp: now };
        return {
          action: "barge",
          cleanedText: cleanRaw,
          reason: "headphones_barge_in",
          isBargeIn: true,
          charEchoScore: 0,
          wordOverlapRatio: 0,
        };
      }
      return {
        action: "emit",
        cleanedText: cleanRaw,
        reason: "headphones_active",
        isBargeIn: false,
        charEchoScore: 0,
        wordOverlapRatio: 0,
      };
    }

    // If assistant is not speaking and has not spoken recently, emit user speech
    if (relevantUtterances.length === 0) {
      return {
        action: "emit",
        cleanedText: cleanRaw,
        reason: "no_active_assistant_speech",
        isBargeIn: false,
        charEchoScore: 0,
        wordOverlapRatio: 0,
      };
    }

    // 4. Sliding character sequence matching (char_echo) against relevant speech
    const charEchoScore = this.computeSlidingCharEchoScore(cleanRaw, saidTexts);

    if (charEchoScore >= this.options.charEchoThresholdPartial) {
      return {
        action: "drop",
        cleanedText: "",
        reason: "speaker_bleed_char_echo",
        isBargeIn: false,
        charEchoScore,
        wordOverlapRatio: 1.0,
      };
    }

    // 5. Multi-tier loose word equivalence & stopword shielding
    const heardWords = tokenizeWords(cleanRaw);
    if (heardWords.length === 0) {
      return {
        action: "drop",
        cleanedText: "",
        reason: "no_valid_tokens",
        isBargeIn: false,
        charEchoScore,
        wordOverlapRatio: 0,
      };
    }

    const { flags, wordOverlapRatio } = this.analyzeWordFlags(heardWords, saidTexts);

    // If word overlap ratio exceeds echo threshold and utterance is long enough -> drop
    if (
      wordOverlapRatio >= this.options.echoTextShareThreshold &&
      heardWords.length >= this.options.bargeMinWords
    ) {
      return {
        action: "drop",
        cleanedText: "",
        reason: "speaker_bleed_text_share",
        isBargeIn: false,
        charEchoScore,
        wordOverlapRatio,
      };
    }

    // 6. Contiguous user run extraction
    const userWords = this.extractContiguousUserRuns(heardWords, flags);

    // 7. Content words evaluation
    const contentWords = userWords.filter((w) => !BARGE_STOPWORDS.has(w));
    const requiredContentWords =
      wordOverlapRatio >= this.options.echoShareThreshold
        ? this.options.bargeMinContentWords + 1
        : this.options.bargeMinContentWords;

    if (
      contentWords.length >= requiredContentWords &&
      userWords.length >= this.options.bargeMinWords
    ) {
      const cleanedText = userWords.join(" ");
      this.lastBargeIn = { text: cleanedText, timestamp: now };
      return {
        action: "barge",
        cleanedText,
        reason: "barge_in_content_threshold",
        isBargeIn: true,
        charEchoScore,
        wordOverlapRatio,
      };
    }

    // Insufficient user words over assistant speech -> drop interim
    return {
      action: "drop",
      cleanedText: "",
      reason: "insufficient_user_content",
      isBargeIn: false,
      charEchoScore,
      wordOverlapRatio,
    };
  }

  /**
   * Process a final STT transcript (turn completion)
   */
  public processFinalTranscript(
    rawTranscript: string,
    eventTimestamp?: number,
  ): EchoFilterDecision {
    const now = eventTimestamp ?? this.options.clock();
    const cleanRaw = rawTranscript.trim();

    if (!cleanRaw) {
      return {
        action: "drop",
        cleanedText: "",
        reason: "empty_final_transcript",
        isBargeIn: false,
        charEchoScore: 0,
        wordOverlapRatio: 0,
      };
    }

    // 1. Deduplication against recent barge-in (after_barge)
    if (this.lastBargeIn && now - this.lastBargeIn.timestamp < 20000) {
      const bargedWords = tokenizeWords(this.lastBargeIn.text);
      const finalWords = tokenizeWords(cleanRaw);
      const bargedNorm = bargedWords.join(" ");
      const finalNorm = finalWords.join(" ");

      // If exact duplicate of already-barged speech -> drop
      if (finalNorm === bargedNorm) {
        this.lastBargeIn = null;
        return {
          action: "drop",
          cleanedText: "",
          reason: "duplicate_barge_in",
          isBargeIn: false,
          charEchoScore: 0,
          wordOverlapRatio: 1.0,
        };
      }

      // If final starts with barged speech, strip barged prefix and emit remainder
      if (finalNorm.startsWith(bargedNorm)) {
        const remainderWords = finalWords.slice(bargedWords.length);
        this.lastBargeIn = null;
        if (remainderWords.length > 0) {
          return {
            action: "emit",
            cleanedText: remainderWords.join(" "),
            reason: "barge_in_turn_extension",
            isBargeIn: false,
            charEchoScore: 0,
            wordOverlapRatio: 0,
          };
        }
      }
    }

    // 2. Headphones mode bypass
    if (this.options.isHeadphones()) {
      return {
        action: "emit",
        cleanedText: cleanRaw,
        reason: "headphones_active",
        isBargeIn: false,
        charEchoScore: 0,
        wordOverlapRatio: 0,
      };
    }

    // 3. Find relevant utterances within active bleed window or recent TTL (60s)
    const relevantUtterances = this.getRelevantUtterances(now, true);
    if (relevantUtterances.length === 0) {
      return {
        action: "emit",
        cleanedText: cleanRaw,
        reason: "no_active_assistant_speech",
        isBargeIn: false,
        charEchoScore: 0,
        wordOverlapRatio: 0,
      };
    }

    const saidTexts = relevantUtterances.map((u) => u.text);
    const allSaidWords: string[] = [];
    for (const t of saidTexts) {
      allSaidWords.push(...tokenizeWords(t));
    }

    // 4. Pure explicit interrupt command check (e.g. "stop", "ruko", "wait")
    const heardTokens = tokenizeWords(cleanRaw);
    if (heardTokens.length <= 2 && this.hasExplicitInterrupt(cleanRaw, allSaidWords)) {
      return {
        action: "barge",
        cleanedText: cleanRaw,
        reason: "explicit_interrupt_command",
        isBargeIn: true,
        charEchoScore: 0,
        wordOverlapRatio: 0,
      };
    }

    // 5. Sliding character sequence matching for turns (threshold 0.62)
    const charEchoScore = this.computeSlidingCharEchoScore(cleanRaw, saidTexts);
    if (charEchoScore >= this.options.charEchoThresholdTurn) {
      return {
        action: "drop",
        cleanedText: "",
        reason: "turn_char_echo",
        isBargeIn: false,
        charEchoScore,
        wordOverlapRatio: 1.0,
      };
    }

    // 6. Word tokenization, loose matching, stopword shielding, and run extraction
    const { flags, wordOverlapRatio } = this.analyzeWordFlags(heardTokens, saidTexts);

    // If whole turn matches recent assistant speech (>= 80% overlap) -> drop echo turn
    if (
      wordOverlapRatio >= this.options.echoTextShareThreshold &&
      heardTokens.length >= this.options.bargeMinWords
    ) {
      return {
        action: "drop",
        cleanedText: "",
        reason: "turn_text_echo",
        isBargeIn: false,
        charEchoScore,
        wordOverlapRatio,
      };
    }

    // Extract surviving contiguous user runs
    const userWords = this.extractContiguousUserRuns(heardTokens, flags);

    // If no user words survived -> drop
    if (userWords.length === 0) {
      return {
        action: "drop",
        cleanedText: "",
        reason: "no_user_speech_survived_echo_strip",
        isBargeIn: false,
        charEchoScore,
        wordOverlapRatio,
      };
    }

    const cleanedText = userWords.join(" ");
    const isAssistantTalking = this.isAssistantSpeakingAt(now);

    return {
      action: "emit",
      cleanedText,
      reason: isAssistantTalking ? "barge_in_turn_cleaned" : "clean_user_turn",
      isBargeIn: isAssistantTalking,
      charEchoScore,
      wordOverlapRatio,
    };
  }

  /**
   * Helper: check if text contains an explicit interrupt keyword that is NOT
   * merely an echo of the assistant's own active speech.
   */
  private hasExplicitInterrupt(text: string, activeSaidWords: string[] = []): boolean {
    const tokens = tokenizeWords(text);
    if (tokens.length === 0) return false;

    for (const token of tokens) {
      if (isExplicitInterruptWord(token)) {
        // If this keyword is in the assistant's own active speech, it is likely echo
        if (!activeSaidWords.includes(token)) {
          return true;
        }
      }
    }

    // Check multi-word explicit phrases like "ruk jao", "bas karo", "shut up", "hold on"
    const lower = text.toLowerCase().trim();
    for (const phrase of EXPLICIT_INTERRUPT_KEYWORDS) {
      if (phrase.includes(" ")) {
        const regex = new RegExp(`(^|\\b)${phrase}(\\b|$)`, "i");
        if (regex.test(lower)) {
          const phraseTokens = tokenizeWords(phrase);
          const allInSaid = phraseTokens.every((pt) => activeSaidWords.includes(pt));
          if (!allInSaid) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Helper: check if assistant was actively speaking at a given timestamp
   */
  private isAssistantSpeakingAt(timestamp: number): boolean {
    for (const u of this.utterances) {
      if (u.endTime === null) return true;
      if (
        timestamp >= u.startTime - this.options.leadMs &&
        timestamp <= u.endTime + this.options.tailMs
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Helper: retrieve utterances matching playhead window [startTime - leadMs, endTime + tailMs]
   */
  private getRelevantUtterances(timestamp: number, includeRecent = false): SpokenUtterance[] {
    const audioTime = timestamp - this.options.sttLatencyMs;
    const ttlLimit = timestamp - this.options.recentUtteranceTtlMs;

    return this.utterances.filter((u) => {
      // Currently playing
      if (u.endTime === null) return true;

      // In playhead window
      const winStart = u.startTime - this.options.leadMs;
      const winEnd = u.endTime + this.options.tailMs;
      if (audioTime >= winStart && audioTime <= winEnd) {
        return true;
      }

      // If includeRecent is true, include utterances within recent TTL
      if (includeRecent && u.endTime >= ttlLimit) {
        return true;
      }

      return false;
    });
  }

  /**
   * Helper: compute sliding character sequence matching score (char_echo)
   */
  private computeSlidingCharEchoScore(heardText: string, saidTexts: string[]): number {
    const cleanHeard = cleanAlphanumeric(heardText);
    if (cleanHeard.length < this.options.charEchoMinChars) {
      return 0;
    }

    let maxScore = 0;
    const hLen = cleanHeard.length;

    for (const said of saidTexts) {
      const cleanSaid = cleanAlphanumeric(said);
      if (cleanSaid.length < this.options.charEchoMinChars) continue;

      // If said is shorter or comparable in length to heard
      if (cleanSaid.length <= hLen + 4) {
        const score = sequenceRatio(cleanHeard, cleanSaid);
        if (score > maxScore) maxScore = score;
        if (maxScore >= 1.0) return 1.0;
        continue;
      }

      // Slide window over cleanSaid with widths: hLen - 2, hLen, hLen + 3
      const windowWidths = [hLen - 2, hLen, hLen + 3].filter(
        (w) => w >= 6 && w <= cleanSaid.length,
      );

      for (const w of windowWidths) {
        const maxStart = cleanSaid.length - w;
        for (let i = 0; i <= maxStart; i++) {
          const slice = cleanSaid.slice(i, i + w);
          const score = sequenceRatio(cleanHeard, slice);
          if (score > maxScore) {
            maxScore = score;
            if (maxScore >= 0.98) return maxScore;
          }
        }
      }
    }

    return maxScore;
  }

  /**
   * Helper: analyze heard words against said speech, applying loose word matching,
   * bigram compound checks, and stopword shielding.
   */
  private analyzeWordFlags(
    heardWords: string[],
    saidTexts: string[],
  ): { flags: boolean[]; wordOverlapRatio: number } {
    const allSaidWords: string[] = [];
    for (const t of saidTexts) {
      allSaidWords.push(...tokenizeWords(t));
    }
    const joinedSaid = allSaidWords.join("");

    const flags = new Array<boolean>(heardWords.length).fill(false);

    // 1. Loose word equivalence
    for (let i = 0; i < heardWords.length; i++) {
      const hw = heardWords[i];
      if (hw && isLooseWordMatch(hw, allSaidWords, joinedSaid)) {
        flags[i] = true;
      }
    }

    // 2. Bigram compound check (e.g. "out box" -> "outbox")
    for (let i = 0; i < heardWords.length - 1; i++) {
      const w1 = heardWords[i];
      const w2 = heardWords[i + 1];
      if (!w1 || !w2) continue;
      const bigram = w1 + w2;
      if (bigram.length >= 4) {
        if (allSaidWords.includes(bigram) || joinedSaid.includes(bigram)) {
          flags[i] = true;
          flags[i + 1] = true;
        }
      }
    }

    // 3. Stopword Shielding:
    // If heardWords[i] is a stopword flagged as echo, but flanked by unflagged user words,
    // unflag it so the user's preposition / conjunction is protected!
    for (let i = 1; i < heardWords.length - 1; i++) {
      const hw = heardWords[i];
      if (hw && flags[i] && COMMON_STOPWORDS.has(hw)) {
        if (!flags[i - 1] && !flags[i + 1]) {
          flags[i] = false;
        }
      }
    }

    // Handle 2 consecutive stopwords flanked by user words (e.g. "look [at the] code")
    for (let i = 1; i < heardWords.length - 2; i++) {
      const hw1 = heardWords[i];
      const hw2 = heardWords[i + 1];
      if (
        flags[i] &&
        flags[i + 1] &&
        hw1 &&
        hw2 &&
        COMMON_STOPWORDS.has(hw1) &&
        COMMON_STOPWORDS.has(hw2)
      ) {
        if (!flags[i - 1] && !flags[i + 2]) {
          flags[i] = false;
          flags[i + 1] = false;
        }
      }
    }

    const echoCount = flags.filter(Boolean).length;
    const wordOverlapRatio = heardWords.length > 0 ? echoCount / heardWords.length : 0;

    return { flags, wordOverlapRatio };
  }

  /**
   * Helper: extract contiguous runs of unflagged user words (run >= contiguousRunMin).
   * Single scattered unflagged words are dropped as acoustic distortion.
   */
  private extractContiguousUserRuns(heardWords: string[], flags: boolean[]): string[] {
    const userWords: string[] = [];
    const n = heardWords.length;
    let i = 0;

    while (i < n) {
      if (!flags[i]) {
        let j = i;
        while (j < n && !flags[j]) {
          j++;
        }
        const runLen = j - i;
        if (runLen >= this.options.contiguousRunMin) {
          for (let k = i; k < j; k++) {
            const word = heardWords[k];
            if (word) {
              userWords.push(word);
            }
          }
        }
        i = j;
      } else {
        i++;
      }
    }

    return userWords;
  }

  /**
   * Helper: purge utterances older than staleLineTimeoutMs
   */
  private purgeStaleUtterances(now: number): void {
    const cutoff = now - this.options.staleLineTimeoutMs;
    this.utterances = this.utterances.filter((u) => {
      if (u.endTime === null) return true; // Keep currently playing
      return u.endTime >= cutoff;
    });
  }
}

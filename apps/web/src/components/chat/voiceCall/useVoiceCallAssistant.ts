import { useState, useRef, useEffect, useCallback } from "react";
import {
  isSpeechRecognitionSupported,
  getRecognitionLanguageCodes,
  formatSttTranscript,
  removeConsecutiveDuplicateWords,
  loadSttSettings,
  saveSttSettings,
  subscribeSttSettings,
  isMobileDevice,
  type SttLanguageMode,
  type SttSettings,
} from "~/lib/speech/stt";
import { transliterateUrduToRoman } from "~/lib/speech/romanUrduTransliterate";
import {
  speakText,
  stopSpeaking,
  subscribeSpeechState,
  isCurrentlySpeaking,
  loadTtsSettings,
  subscribeTtsSettings,
  type TtsSettings,
} from "~/lib/speech/tts";
import { thinkingAmbientSound } from "./thinkingAmbientSound";
import { setVoiceCallActiveState } from "./voiceCallState";
import { startMobileVoiceKeepAlive, stopMobileVoiceKeepAlive } from "./mobileVoiceKeepAlive";
import { StreamingTtsPlayer, extractSpeechChunks } from "./streamingTtsPlayer";
import { addVoiceCallLog } from "~/lib/speech/voiceCallLogger";
import {
  createAcousticNoiseShield,
  type AcousticNoiseShieldController,
} from "~/lib/speech/acousticNoiseShield";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";
import type { ChatMessage, SessionPhase } from "~/types";

// How long (ms) after TTS finishes to keep echo-guard active (prevents loopback from laptop speaker).
// Must be long enough to span the inter-chunk gap between sequential streaming TTS sentences.
// 400ms was too short — speaker echo from the previous chunk triggered false barge-in during the gap.
const ACOUSTIC_ECHO_COOLDOWN_MS = 1500;

const END_CALL_TRIGGERS = [
  "end call",
  "stop call",
  "call khatam",
  "call band karo",
  "call khatam karo",
  "call band kar do",
  "call kato",
  "call kaat do",
  "call kat do",
  "hang up",
  "disconnect call",
  "call disconnect",
  "call close",
  "bye call",
];

const FAREWELL_END_CALL_TRIGGERS = [
  // Roman Urdu / Hindi farewells
  "allah hafiz",
  "allah hafez",
  "khuda hafiz",
  "khuda hafez",
  "rab rakha",
  "alvida",
  "alwida",
  "bye",
  "bye bye",
  "by bye",
  "byby",
  "goodbye",
  "good bye",
  "ok bye",
  "okay bye",
  "acha bye",
  "accha bye",
  "chalo bye",
  "theek hai bye",
  "thik hai bye",
  "see you",
  "see you later",
  "see ya",
  "tata",
  "phir milenge",
  "phir milte hain",
  "phir baat hogi",
  // Call termination commands (Urdu / Roman Urdu)
  "call kato",
  "call kaat do",
  "call kat do",
  "call band",
  "call band karo",
  "call band kar do",
  "call band kr do",
  "call khatam",
  "call khatam karo",
  "call khatam kr do",
  "call end",
  "call end karo",
  "call cut karo",
  "call disconnect karo",
  "call close karo",
  // English commands
  "end call",
  "stop call",
  "hang up",
  "disconnect call",
  "disconnect",
  "close call",
  "exit call",
  "terminate call",
];

const INTERRUPT_COMMAND_TRIGGERS = [
  // "stop" variants:
  "stop",
  "stop please",
  "please stop",
  "stop it",
  "stop now",
  "stop talking",
  "stop speaking",
  "stop karo",
  "stop kar do",
  "stop ho jao",
  "ruko",
  "ruk jao",
  "ruk jao please",
  "ruk",
  "ruko ruko",
  "thamb jao",
  "ek second",
  "ek sec",
  "one second",
  "wait",
  "wait please",
  "please wait",
  "wait wait",
  "hold on",
  "pause",
  // "listen" variants:
  "listen",
  "listen to me",
  "please listen",
  "listen please",
  "just listen",
  "suno",
  "sun lo",
  "sunen",
  "suno please",
  "please suno",
  "suno bhai",
  "bhai suno",
  "aray suno",
  "arey suno",
  "meri baat suno",
  "baat suno",
  "ek baat suno",
  "ek minute suno",
  "ek minute",
  // Urdu / Roman Urdu speech interruption & silence commands:
  "chup",
  "chup karo",
  "chup kar",
  "chup ho jao",
  "chup raho",
  "khamosh",
  "khamosh raho",
  "bas",
  "bas karo",
  "bas kar do",
  "thehro",
  "thahro",
  "aray ruko",
  "arey ruko",
  "nahi ruko",
  "nahi nahi",
  "aram se",
  // Urdu script:
  "سٹاپ",
  "روکو",
  "رک جاؤ",
  "رک",
  "سنو",
  "سنیں",
  "ایک سیکنڈ",
  "ایک منٹ",
  "ٹھہرو",
  "چپ",
  "چپ کرو",
  "چپ ہو جاؤ",
  "خاموش",
  "بس",
  "بس کرو",
];

const FILLERS = [
  "please",
  "bhai",
  "yaar",
  "sir",
  "bro",
  "ok",
  "okay",
  "hey",
  "ab",
  "zara",
  "ek minute",
  "one second",
  "just",
];

const SILENCE_TIMEOUT_MS = 1500;
const FAST_FINAL_DISPATCH_MS = 1500;

function cleanForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'۔،؟]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isFarewellOrEndCall(text: string): {
  isFarewell: boolean;
  phrase: string;
  isUrdu: boolean;
} {
  const clean = cleanForComparison(text);
  if (!clean) return { isFarewell: false, phrase: "", isUrdu: false };

  // 1. Urdu script checks
  const urduPatterns = [
    { regex: /اللہ\s*حافظ/, phrase: "اللہ حافظ", isUrdu: true },
    { regex: /اللہ\s*نگہبان/, phrase: "اللہ نگہبان", isUrdu: true },
    { regex: /خدا\s*حافظ/, phrase: "خدا حافظ", isUrdu: true },
    { regex: /الوداع/, phrase: "الوداع", isUrdu: true },
    { regex: /(?:^|\s)بائے(?:\s|$)/, phrase: "بائے", isUrdu: true },
    { regex: /کال\s*(?:بند|کاٹ|ختم)/, phrase: "کال بند", isUrdu: true },
    { regex: /فون\s*بند/, phrase: "فون بند", isUrdu: true },
  ];
  for (const item of urduPatterns) {
    if (item.regex.test(text)) {
      return { isFarewell: true, phrase: item.phrase, isUrdu: true };
    }
  }

  // 2. Exact word or phrase matches for Roman Urdu & English
  for (const trigger of FAREWELL_END_CALL_TRIGGERS) {
    const cleanTrigger = cleanForComparison(trigger);
    if (!cleanTrigger) continue;

    const isUrduTrigger =
      cleanTrigger.includes("allah") ||
      cleanTrigger.includes("khuda") ||
      cleanTrigger.includes("kato") ||
      cleanTrigger.includes("band") ||
      cleanTrigger.includes("khatam") ||
      cleanTrigger.includes("alvida") ||
      cleanTrigger.includes("rab");

    // Short single words like "bye" or "tata" must match as whole word
    if (cleanTrigger.length <= 4) {
      const wordRegex = new RegExp(`(?:^|\\s)${cleanTrigger}(?:\\s|$)`, "i");
      if (wordRegex.test(clean)) {
        return { isFarewell: true, phrase: trigger, isUrdu: isUrduTrigger };
      }
    } else {
      if (clean.includes(cleanTrigger)) {
        return { isFarewell: true, phrase: trigger, isUrdu: isUrduTrigger };
      }
    }
  }

  return { isFarewell: false, phrase: "", isUrdu: false };
}

function isPureInterruptCommand(text: string): boolean {
  const clean = cleanForComparison(text);
  if (!clean) return false;

  for (const trigger of INTERRUPT_COMMAND_TRIGGERS) {
    const cleanTrigger = cleanForComparison(trigger);
    if (clean === cleanTrigger) return true;

    for (const filler of FILLERS) {
      if (
        clean === `${cleanTrigger} ${filler}` ||
        clean === `${filler} ${cleanTrigger}` ||
        clean === `${filler} ${cleanTrigger} ${filler}`
      ) {
        return true;
      }
    }
  }

  // Repetition: "stop stop", "listen listen", "suno suno"
  if (/^(?:stop|listen|suno)(\s+(?:stop|listen|suno))+$/i.test(clean)) {
    return true;
  }

  return false;
}

export function containsInterruptCommand(text: string): boolean {
  const clean = cleanForComparison(text);
  if (!clean) return false;

  if (isPureInterruptCommand(clean)) return true;

  for (const trigger of INTERRUPT_COMMAND_TRIGGERS) {
    const cleanTrigger = cleanForComparison(trigger);
    const prefixRegex = new RegExp(`^(?:(?:${FILLERS.join("|")})\\s+)?${cleanTrigger}\\b`, "i");
    if (prefixRegex.test(clean)) {
      return true;
    }
  }

  // Exact word boundary for stop or listen or suno or ruko or wait or chup or bas
  if (/\b(?:stop|listen|suno|ruko|wait|pause|ruk|bas|chup|khamosh)\b/i.test(clean)) {
    return true;
  }

  // Urdu script
  if (/(?:سٹاپ|سنو|سنیں|روکو|رک|ٹھہرو|بس|چپ|خاموش)/.test(clean)) {
    return true;
  }

  return false;
}

function stripInterruptCommand(text: string): string {
  let cleaned = text;
  const sortedTriggers = [...INTERRUPT_COMMAND_TRIGGERS].sort((a, b) => b.length - a.length);

  for (const trigger of sortedTriggers) {
    const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `^\\s*(?:(?:${FILLERS.join("|")})\\s+)*${escaped}(?:\\s+(?:${FILLERS.join("|")}))*[,!.\\s-]*`;
    const regex = new RegExp(pattern, "i");
    cleaned = cleaned.replace(regex, "").trim();
  }

  return cleaned;
}

/**
 * Detects whether an utterance heard by the microphone is an acoustic echo
 * of text that the assistant is currently speaking or spoke recently.
 * Supports Urdu script transliteration, Roman Urdu, and word-overlap similarity.
 */
export function isUtteranceEchoOfAi(text: string, aiPhrases: string[]): boolean {
  if (!text || !text.trim() || !aiPhrases || aiPhrases.length === 0) return false;

  const clean = cleanForComparison(text);
  if (!clean || clean.length < 3) return false;
  const romanClean = cleanForComparison(transliterateUrduToRoman(text));

  const candidates = [clean, romanClean].filter((c) => c && c.length >= 3);
  if (candidates.length === 0) return false;

  for (const source of aiPhrases) {
    if (!source || !source.trim()) continue;
    const cleanSource = cleanForComparison(source);
    if (!cleanSource || cleanSource.length < 3) continue;
    const romanCleanSource = cleanForComparison(transliterateUrduToRoman(source));

    const sourceCandidates = [cleanSource, romanCleanSource].filter((s) => s && s.length >= 3);

    for (const cand of candidates) {
      for (const src of sourceCandidates) {
        // 1. Direct substring match:
        // Candidate is contained within the AI source (speaker picked up a snippet of AI speech):
        if (cand.length >= 3 && src.includes(cand)) return true;
        // AI source is contained within candidate only if lengths are comparable (pure echo, not mixed user speech):
        if (src.length >= 4 && cand.includes(src) && Math.abs(cand.length - src.length) <= 5)
          return true;

        // 2. Tokenized word overlap check
        const candWords = cand.split(/\s+/).filter((w) => w.length >= 3);
        if (candWords.length > 0) {
          let matches = 0;
          for (const w of candWords) {
            if (src.includes(w)) {
              matches++;
            }
          }
          const ratio = matches / candWords.length;
          // Substantial majority of candidate's words must match AI source:
          if (candWords.length >= 2 && ratio >= 0.7) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Strips any AI-spoken words that leaked into the microphone from the speakers.
 * Checks for word-level prefix overlap and sentence-level matches against the active
 * or current AI turn text.
 */
export function stripAiSpeechFromTranscript(transcript: string, aiPhrases: string[]): string {
  if (!transcript || !transcript.trim()) return "";
  let result = transcript.trim();

  // 1. Check if an AI phrase was echoed at the beginning of the transcript (e.g. AI bleeds into mic before user speaks)
  for (const rawPhrase of aiPhrases) {
    if (!rawPhrase || !rawPhrase.trim()) continue;
    const cleanPhrase = rawPhrase.trim().replace(/[.,!?;:۔()"'`]/g, "");
    const phraseWords = cleanPhrase.toLowerCase().split(/\s+/).filter(Boolean);
    if (phraseWords.length < 3) continue;

    const resultWords = result.split(/\s+/);
    let matchCount = 0;
    const checkLen = Math.min(resultWords.length, phraseWords.length);
    for (let i = 0; i < checkLen; i++) {
      const rw = resultWords[i].toLowerCase().replace(/[.,!?;:۔()"'`]/g, "");
      const pw = phraseWords[i];
      if (rw === pw || (rw.length >= 3 && pw.includes(rw))) {
        matchCount++;
      } else {
        break;
      }
    }

    // Require at least 3 consecutive matching words from the AI phrase to strip as a prefix
    if (matchCount >= 3) {
      result = resultWords.slice(matchCount).join(" ").trim();
      if (!result) return "";
    }
  }

  // 2. If the remaining transcript is a pure echo of any AI phrase via fuzzy / word-overlap match:
  if (result.length > 0 && isUtteranceEchoOfAi(result, aiPhrases)) {
    return "";
  }

  return result;
}

export interface UseVoiceCallAssistantOptions {
  onTranscriptChange: (text: string) => void;
  onAutoSend: (text?: string) => void;
  prompt: string;
  phase: SessionPhase;
  promptHistoryMessages?: ReadonlyArray<ChatMessage>;
  disabled?: boolean;
  onInterrupt?: () => void;
  canInterrupt?: boolean;
  threadId?: string | null;
  isUserEditing?: boolean;
}

export interface UseVoiceCallAssistantReturn {
  isCallActive: boolean;
  callStatus: VoiceCallStatus;
  analyserNode: AnalyserNode | null;
  toggleCall: () => void;
  endCall: () => void;
  interruptSpeaking: () => void;
  callLanguage: "urdu" | "english";
  setCallLanguage: (lang: "urdu" | "english") => void;
  liveTranscript: string;
  assistantSpokenText: string;
  isMicMuted: boolean;
  toggleMicMute: () => void;
}

export function useVoiceCallAssistant({
  onTranscriptChange,
  onAutoSend,
  prompt,
  phase,
  promptHistoryMessages,
  disabled = false,
  onInterrupt,
  canInterrupt = false,
  threadId,
  isUserEditing = false,
}: UseVoiceCallAssistantOptions) {
  const isUserEditingRef = useRef(Boolean(isUserEditing));
  isUserEditingRef.current = Boolean(isUserEditing);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<VoiceCallStatus>("idle");
  const [callLanguage, setCallLanguageState] = useState<"urdu" | "english">(() => {
    const current = loadSttSettings().language;
    return current === "english" ? "english" : "urdu";
  });
  const callLanguageRef = useRef<"urdu" | "english">(
    loadSttSettings().language === "english" ? "english" : "urdu",
  );
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [assistantSpokenText, setAssistantSpokenText] = useState<string>("");
  const isUserMutedRef = useRef(false);
  const [isMicMuted, setIsMicMuted] = useState(false);

  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const noiseShieldRef = useRef<AcousticNoiseShieldController | null>(null);
  const recognitionRef = useRef<any>(null);
  const recognitionLanguageIndexRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dedicated silence engine refs: tracks real timestamp of last spoken words
  const lastSpeechTimestampRef = useRef<number>(0);
  const hasPendingSpeechRef = useRef<boolean>(false);
  const peakEnergyInTurnRef = useRef<number>(0);

  // Streaming sentence TTS player refs
  const streamingPlayerRef = useRef<StreamingTtsPlayer | null>(null);
  const processedTextOffsetRef = useRef<number>(0);
  const activeAssistantMessageIdRef = useRef<string | null>(null);

  // Acoustic echo isolation timestamps: prevents microphone from capturing laptop speakers
  const lastTtsEndedTimestampRef = useRef<number>(0);

  // Memory of recent AI spoken phrases & words to detect and eliminate acoustic echo
  const recentAiSpokenPhrasesRef = useRef<string[]>([]);
  const recentAiSpokenWordsSetRef = useRef<Set<string>>(new Set());
  const processedChunksSetRef = useRef<Set<string>>(new Set());
  const isEndingCallRef = useRef<boolean>(false);
  const finalDispatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allTurnAiTextRef = useRef<string>("");
  const currentPlayingTtsChunkRef = useRef<string>("");
  const activeTtsTextRef = useRef<string>("");

  // Recognition lifecycle & turn buffer refs
  const isRecognitionRunningRef = useRef(false);
  const isAbortingRef = useRef(false);
  const accumulatedTurnFinalRef = useRef<string>("");
  const lastFinalizedIndexRef = useRef<number>(-1);
  const turnStartResultIndexRef = useRef<number>(0);
  const currentEventResultsLengthRef = useRef<number>(0);
  const recentEmittedTranscriptsRef = useRef<Set<string>>(new Set());
  const interruptSpeakingRef = useRef<() => void>(() => {});
  const startFreshRecognitionRef = useRef<() => void>(() => {});
  const isInterruptingRef = useRef(false);

  // Store latest state in refs for stable timer/recognition callbacks
  const isCallActiveRef = useRef(false);
  const callStatusRef = useRef<VoiceCallStatus>("idle");

  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const promptHistoryMessagesRef = useRef(promptHistoryMessages);
  promptHistoryMessagesRef.current = promptHistoryMessages;

  const onTranscriptChangeRef = useRef(onTranscriptChange);
  onTranscriptChangeRef.current = onTranscriptChange;

  const onAutoSendRef = useRef(onAutoSend);
  onAutoSendRef.current = onAutoSend;

  const onInterruptRef = useRef(onInterrupt);
  onInterruptRef.current = onInterrupt;

  const canInterruptRef = useRef(canInterrupt);
  canInterruptRef.current = canInterrupt;

  // Track speech vs manual edits
  const lastTranscribedTextRef = useRef<string>("");
  const manualBaselineRef = useRef<string>("");

  // Lock flag while TTS is actively speaking or in post-TTS acoustic cooldown
  const isTtsActiveRef = useRef(false);

  // Guard flag during auto-sending to prevent manual baseline re-entry
  const isAutoSendingRef = useRef(false);

  // Turn tracking: snapshot message IDs present before turn was dispatched
  const preTurnMessageIdsRef = useRef<Set<string>>(new Set());
  const waitingForAssistantResponseRef = useRef(false);
  const turnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTurnTimeout = useCallback(() => {
    if (turnTimeoutRef.current) {
      clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }
  }, []);

  const updateCallStatus = useCallback((next: VoiceCallStatus) => {
    callStatusRef.current = next;
    setCallStatus(next);
  }, []);

  const clearFinalDispatchTimer = useCallback(() => {
    if (finalDispatchTimerRef.current) {
      clearTimeout(finalDispatchTimerRef.current);
      finalDispatchTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const clearTtsCooldownTimer = useCallback(() => {
    if (ttsCooldownTimerRef.current) {
      clearTimeout(ttsCooldownTimerRef.current);
      ttsCooldownTimerRef.current = null;
    }
  }, []);

  // Physically mute / unmute microphone tracks to guarantee zero echo leakage into audio analyser
  const setMicrophoneMuted = useCallback((muted: boolean) => {
    const shouldMute = muted || isUserMutedRef.current;
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !shouldMute;
      });
    }
  }, []);

  const toggleMicMute = useCallback(() => {
    setIsMicMuted((prev) => {
      const next = !prev;
      isUserMutedRef.current = next;
      setMicrophoneMuted(next);
      return next;
    });
  }, [setMicrophoneMuted]);

  // Completely aborts and detaches event listeners from current SpeechRecognition instance
  const cleanupRecognition = useCallback(() => {
    isAbortingRef.current = true;
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      isRecognitionRunningRef.current = false;
      try {
        rec.onstart = null;
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        rec.abort();
      } catch {
        // ignore
      }
    }
  }, []);

  const endCall = useCallback(() => {
    isAbortingRef.current = true;
    isCallActiveRef.current = false;
    isTtsActiveRef.current = false;
    isAutoSendingRef.current = false;
    hasPendingSpeechRef.current = false;
    lastSpeechTimestampRef.current = 0;
    waitingForAssistantResponseRef.current = false;
    activeAssistantMessageIdRef.current = null;
    processedTextOffsetRef.current = 0;
    manualBaselineRef.current = "";
    lastTranscribedTextRef.current = "";
    accumulatedTurnFinalRef.current = "";
    lastFinalizedIndexRef.current = -1;
    turnStartResultIndexRef.current = 0;
    recentEmittedTranscriptsRef.current.clear();
    preTurnMessageIdsRef.current.clear();
    isEndingCallRef.current = false;
    allTurnAiTextRef.current = "";
    currentPlayingTtsChunkRef.current = "";
    recentAiSpokenPhrasesRef.current = [];
    recentAiSpokenWordsSetRef.current.clear();
    processedChunksSetRef.current.clear();
    setIsMicMuted(false);
    isUserMutedRef.current = false;
    setLiveTranscript("");
    setAssistantSpokenText("");

    setVoiceCallActiveState(false, null);
    stopMobileVoiceKeepAlive();

    if (streamingPlayerRef.current) {
      streamingPlayerRef.current.stop();
      streamingPlayerRef.current = null;
    }

    clearFinalDispatchTimer();
    clearRestartTimer();
    clearTtsCooldownTimer();
    clearTurnTimeout();
    cleanupRecognition();

    // Instantly abort any active parent generation/turn/dispatch
    if (canInterruptRef.current && onInterruptRef.current) {
      onInterruptRef.current();
    }

    if (levelCheckIntervalRef.current) {
      clearInterval(levelCheckIntervalRef.current);
      levelCheckIntervalRef.current = null;
    }

    // Stop mic stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    // Close AudioContext & Noise Shield
    if (noiseShieldRef.current) {
      noiseShieldRef.current.dispose();
      noiseShieldRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    // Stop ambient thinking sound
    thinkingAmbientSound.stop();

    // Silence any ongoing TTS audio
    stopSpeaking();

    updateCallStatus("idle");
    setIsCallActive(false);
  }, [
    clearRestartTimer,
    clearTtsCooldownTimer,
    clearTurnTimeout,
    cleanupRecognition,
    updateCallStatus,
  ]);

  const addAiSpokenPhrase = useCallback((phrase: string) => {
    if (!phrase) return;
    const clean = cleanForComparison(phrase);
    if (!clean || clean.length < 3) return;

    const phrases = recentAiSpokenPhrasesRef.current;
    phrases.push(clean);
    if (phrases.length > 25) {
      phrases.shift();
    }

    const words = clean.split(/\s+/).filter((w) => w.length > 2);
    for (const w of words) {
      recentAiSpokenWordsSetRef.current.add(w);
    }
    if (recentAiSpokenWordsSetRef.current.size > 250) {
      recentAiSpokenWordsSetRef.current.clear();
      for (const p of phrases) {
        for (const w of p.split(/\s+/).filter((w) => w.length > 2)) {
          recentAiSpokenWordsSetRef.current.add(w);
        }
      }
    }
  }, []);

  const isAcousticEchoOfAi = useCallback(
    (text: string): boolean => {
      if (!text || !text.trim()) return false;

      // Acoustic echo physically occurs while the AI is speaking or within the acoustic echo cooldown window
      const isWithinEchoWindow =
        isTtsActiveRef.current ||
        isCurrentlySpeaking() ||
        Date.now() - lastTtsEndedTimestampRef.current < ACOUSTIC_ECHO_COOLDOWN_MS;

      if (!isWithinEchoWindow) {
        return false;
      }

      const aiSources = [
        activeTtsTextRef.current,
        currentPlayingTtsChunkRef.current,
        assistantSpokenText,
        allTurnAiTextRef.current,
        ...recentAiSpokenPhrasesRef.current,
      ].filter(Boolean);

      return isUtteranceEchoOfAi(text, aiSources);
    },
    [assistantSpokenText],
  );

  const handleFarewellAndEndCall = useCallback(
    (triggerPhrase: string, isUrdu: boolean) => {
      if (!isCallActiveRef.current || isEndingCallRef.current) return;
      isEndingCallRef.current = true;

      clearFinalDispatchTimer();
      clearRestartTimer();

      // Immediately halt any ongoing stream / TTS
      if (streamingPlayerRef.current) {
        streamingPlayerRef.current.stop();
        streamingPlayerRef.current = null;
      }
      stopSpeaking();
      thinkingAmbientSound.stop();

      if (canInterruptRef.current && onInterruptRef.current) {
        onInterruptRef.current();
      }

      // Clear composer so farewell text is never sent or displayed
      promptRef.current = "";
      lastTranscribedTextRef.current = "";
      manualBaselineRef.current = "";
      hasPendingSpeechRef.current = false;
      onTranscriptChangeRef.current("");

      const farewellMessage = isUrdu
        ? "Allah Hafiz! Apna khayal rakhiyega."
        : "Goodbye! Have a great day.";

      setLiveTranscript("");
      setAssistantSpokenText(farewellMessage);
      updateCallStatus("speaking");
      isTtsActiveRef.current = true;

      let hasEnded = false;
      const safeEnd = () => {
        if (!hasEnded) {
          hasEnded = true;
          endCall();
          isEndingCallRef.current = false;
        }
      };

      const currentTts = loadTtsSettings();
      speakText(farewellMessage, currentTts, safeEnd);
      setTimeout(safeEnd, 2000);
    },
    [clearFinalDispatchTimer, clearRestartTimer, endCall, updateCallStatus],
  );

  // Creates and starts a SpeechRecognition instance (keeps ONE single instance alive across turns)
  const startFreshRecognition = useCallback(() => {
    // Only proceed if call is active and not disabled
    if (!isCallActiveRef.current || disabled) {
      return;
    }

    // If an instance already exists, do NOT destroy it; just ensure it is running
    if (recognitionRef.current) {
      if (!isRecognitionRunningRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          // already started or transitioning
        }
      }
      return;
    }

    clearRestartTimer();
    isAbortingRef.current = false;

    // Ensure mic hardware track is unmuted so speech and "stop" interrupts can be detected
    setMicrophoneMuted(false);

    try {
      const SpeechRecognitionClass =
        (window as unknown as { SpeechRecognition: any }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition: any }).webkitSpeechRecognition;

      if (!SpeechRecognitionClass) return;

      const recognition = new SpeechRecognitionClass();
      const sttSettings = loadSttSettings();
      const effectiveMode: SttLanguageMode =
        callLanguageRef.current === "english"
          ? "english"
          : sttSettings.language === "english"
            ? "roman-urdu"
            : sttSettings.language;
      const languageCodes = getRecognitionLanguageCodes(effectiveMode);
      recognition.lang =
        languageCodes[Math.min(recognitionLanguageIndexRef.current, languageCodes.length - 1)] ??
        (callLanguageRef.current === "english" ? "en-US" : "ur-PK");
      // continuous=true keeps the speech recognition session open continuously across pauses
      // so user speech is not abruptly terminated between short pauses.
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        isRecognitionRunningRef.current = true;
        turnStartResultIndexRef.current = 0;
        currentEventResultsLengthRef.current = 0;
        if (
          !isTtsActiveRef.current &&
          callStatusRef.current !== "speaking" &&
          callStatusRef.current !== "thinking" &&
          !isCurrentlySpeaking()
        ) {
          updateCallStatus("listening");
        }
      };

      recognition.onresult = (event: any) => {
        if (!isCallActiveRef.current || disabled) {
          return;
        }
        currentEventResultsLengthRef.current = event.results?.length || 0;

        const isStreamingPlayerBusy = Boolean(
          streamingPlayerRef.current &&
          !streamingPlayerRef.current.isStopped() &&
          (streamingPlayerRef.current.getIsPlaying() ||
            streamingPlayerRef.current.getQueueLength() > 0 ||
            streamingPlayerRef.current.hasEnqueuedChunks()),
        );

        const isAiSpeakingOrBusy =
          isTtsActiveRef.current ||
          callStatusRef.current === "speaking" ||
          callStatusRef.current === "thinking" ||
          isCurrentlySpeaking() ||
          isStreamingPlayerBusy ||
          Date.now() - lastTtsEndedTimestampRef.current < ACOUSTIC_ECHO_COOLDOWN_MS;

        // ACOUSTIC ECHO SHIELD, SELF-SPEECH GUARD & INSTANT BARGE-IN:
        // While AI is speaking, playing TTS audio, thinking, or during the post-TTS cooldown:
        // The speaker audio is playing directly into the microphone.
        if (isAiSpeakingOrBusy) {
          let recentUtterance = "";
          for (let i = Math.max(0, event.results.length - 2); i < event.results.length; ++i) {
            const item = event.results[i];
            if (item && item[0]) {
              recentUtterance += (recentUtterance ? " " : "") + (item[0].transcript || "").trim();
            }
          }
          if (!recentUtterance.trim()) {
            return;
          }

          const formattedRecent = formatSttTranscript(recentUtterance, effectiveMode);
          const rawOrFormatted = (formattedRecent || recentUtterance).trim();
          const wordsList = rawOrFormatted.split(/\s+/).filter(Boolean);

          // 1. Check for explicit interrupt commands from user FIRST ("ruko", "stop", "chup", "suno", etc.)
          const isExplicitInterrupt =
            containsInterruptCommand(formattedRecent) || containsInterruptCommand(recentUtterance);

          // 2. All AI sources for echo detection:
          const aiSources = [
            activeTtsTextRef.current,
            currentPlayingTtsChunkRef.current,
            assistantSpokenText,
            allTurnAiTextRef.current,
            ...recentAiSpokenPhrasesRef.current,
          ].filter(Boolean);

          const isAiSelfEcho =
            !isExplicitInterrupt &&
            (isUtteranceEchoOfAi(recentUtterance, aiSources) ||
              isUtteranceEchoOfAi(formattedRecent, aiSources));

          if (isAiSelfEcho) {
            // Speaker audio echoed into the mic while AI is speaking.
            // Discard immediately: Advance baseline past this echo so it is never reprocessed!
            turnStartResultIndexRef.current = event.results.length;
            accumulatedTurnFinalRef.current = "";
            addVoiceCallLog({
              category: "NOISE_GATE",
              title: "Acoustic Speaker Echo Blocked",
              detail: `Echo discarded: "${formattedRecent || recentUtterance}"`,
            });
            return;
          }

          // 3. User Barge-in validation:
          // A single isolated word or low-confidence syllable heard while AI is speaking
          // (that is NOT an explicit interrupt command) is likely background noise or faint echo.
          // DO NOT interrupt the AI unless:
          // a) User gave an explicit interrupt command ("ruko", "stop", "suno"), OR
          // b) During active streaming playback: user spoke 3+ real words (more aggressive protection)
          // c) Outside streaming (single TTS chunk): user spoke 2+ real words
          const isStreamingBusy = Boolean(
            streamingPlayerRef.current &&
            !streamingPlayerRef.current.isStopped() &&
            (streamingPlayerRef.current.getIsPlaying() ||
              streamingPlayerRef.current.getQueueLength() > 0 ||
              streamingPlayerRef.current.hasEnqueuedChunks()),
          );
          const bargeInWordThreshold = isStreamingBusy ? 3 : 2;
          const isUserBargeIn = isExplicitInterrupt || wordsList.length >= bargeInWordThreshold;

          if (!isUserBargeIn) {
            // Faint non-command sound or 1-word artifact: do NOT halt the AI!
            turnStartResultIndexRef.current = event.results.length;
            accumulatedTurnFinalRef.current = "";
            return;
          }

          // Real user speaking (barge-in):
          // Immediately halt AI playback within 5ms:
          interruptSpeakingRef.current();
          stopSpeaking();
          if (streamingPlayerRef.current) {
            streamingPlayerRef.current.stop();
          }
          isTtsActiveRef.current = false;
          waitingForAssistantResponseRef.current = false;
          thinkingAmbientSound.stop();
          updateCallStatus("user-speaking");

          addVoiceCallLog({
            category: "INTERRUPT",
            title: isExplicitInterrupt
              ? "Call Interrupted (User Commanded Stop/Ruko)"
              : "Call Interrupted (User Started Speaking)",
            detail: `User said: "${formattedRecent || recentUtterance}"`,
          });

          // DO NOT advance turnStartResultIndexRef past user speech!
          // Fall through directly to normal turn extraction below so the user's complete sentence
          // from the very first word is preserved and placed into the input field!
        }

        // Clean turn extraction: only process speech that occurred in THIS turn
        let startIndex = turnStartResultIndexRef.current;
        if (startIndex > event.results.length) {
          startIndex = 0;
          turnStartResultIndexRef.current = 0;
        } else if (startIndex === event.results.length) {
          // No new speech results past the turn start index yet
          return;
        }

        let fullSessionFinalized = "";
        let currentInterim = "";

        for (let i = startIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (!item || !item[0]) continue;
          const transcript = item[0].transcript || "";
          if (item.isFinal) {
            fullSessionFinalized += (fullSessionFinalized ? " " : "") + transcript.trim();
          } else {
            currentInterim += (currentInterim ? " " : "") + transcript.trim();
          }
        }

        const rawSpeech = (
          fullSessionFinalized
            ? fullSessionFinalized + (currentInterim ? " " + currentInterim : "")
            : currentInterim
        ).trim();

        if (!rawSpeech) return;

        // NOISE GATING & AMBIENT NOISE FILTER (Acoustic Noise Shield):
        // Filter out ambient mic hiss, fan rumble, breath noise, and low-energy noise syllables
        const trimmedRaw = rawSpeech.trim();
        const noiseSyllableRegex = /^(?:[اہاوہمہمامآہاوع]|ah|uh|um|hmm|shh|psst|oh)+$/i;
        const isNoiseSyllable = noiseSyllableRegex.test(trimmedRaw);
        const wordsList = trimmedRaw.split(/\s+/).filter(Boolean);

        // Check Acoustic Noise Shield gate state:
        const isShieldGated = Boolean(
          noiseShieldRef.current && !noiseShieldRef.current.isGateOpen() && wordsList.length <= 3,
        );

        // If audio energy never exceeded speech threshold (12) during this utterance,
        // OR if noise shield gate was closed, OR if it's an isolated low-confidence noise syllable:
        const isAmbientNoise =
          isShieldGated ||
          (peakEnergyInTurnRef.current < 12 && wordsList.length <= 2) ||
          (isNoiseSyllable && wordsList.length <= 2);

        if (isAmbientNoise) {
          addVoiceCallLog({
            category: "NOISE_GATE",
            title: isShieldGated
              ? "Acoustic Noise Shield (Fan/Echo Dropped)"
              : "Ambient Noise Filtered",
            detail: `Dropped background sound: "${trimmedRaw}" (Peak Energy: ${peakEnergyInTurnRef.current.toFixed(1)})`,
          });
          return;
        }

        // Deduplicate immediate duplicate words that recognition engines emit
        const cleanSpeech = removeConsecutiveDuplicateWords(rawSpeech);
        if (!cleanSpeech) return;

        // Strip any AI spoken words that might have bled into speech from the speakers
        const aiSourcesForStripping = [
          activeTtsTextRef.current,
          currentPlayingTtsChunkRef.current,
          assistantSpokenText,
          allTurnAiTextRef.current,
          ...recentAiSpokenPhrasesRef.current,
        ].filter(Boolean);

        const strippedOfAi = stripAiSpeechFromTranscript(cleanSpeech, aiSourcesForStripping);
        if (!strippedOfAi.trim()) {
          // Entire utterance was AI speech from the speakers! Drop it!
          addVoiceCallLog({
            category: "NOISE_GATE",
            title: "Speaker Echo Blocked (Tail)",
            detail: `Dropped delayed echo: "${cleanSpeech}"`,
          });
          turnStartResultIndexRef.current = event.results.length;
          accumulatedTurnFinalRef.current = "";
          return;
        }

        const processedSpeech = formatSttTranscript(strippedOfAi, effectiveMode);

        // 2. Farewell / End call command ("bye", "allah hafiz", "call kato", etc.):
        const farewellCheck = isFarewellOrEndCall(processedSpeech).isFarewell
          ? isFarewellOrEndCall(processedSpeech)
          : isFarewellOrEndCall(cleanSpeech);

        if (farewellCheck.isFarewell) {
          handleFarewellAndEndCall(farewellCheck.phrase, farewellCheck.isUrdu);
          return;
        }

        // 3. Acoustic Echo Isolation check:
        if (isAcousticEchoOfAi(processedSpeech) || isAcousticEchoOfAi(cleanSpeech)) {
          addVoiceCallLog({
            category: "NOISE_GATE",
            title: "Acoustic Echo Filtered (Delayed)",
            detail: `Dropped echo: "${processedSpeech || cleanSpeech}"`,
          });
          turnStartResultIndexRef.current = event.results.length;
          accumulatedTurnFinalRef.current = "";
          return;
        }

        // 4. This is real user speech:
        const stripped = stripInterruptCommand(processedSpeech);
        const speechToUse = stripped.length > 0 ? stripped : processedSpeech;

        const combinedText =
          isUserEditingRef.current && manualBaselineRef.current
            ? (manualBaselineRef.current + " " + speechToUse).trim()
            : speechToUse.trim();

        if (!combinedText) return;

        // Track emitted transcript to avoid manualBaseline feedback loop
        recentEmittedTranscriptsRef.current.add(combinedText);
        if (recentEmittedTranscriptsRef.current.size > 50) {
          recentEmittedTranscriptsRef.current.clear();
          recentEmittedTranscriptsRef.current.add(combinedText);
        }

        // Store transcribed user text in composer input field & reset silence timer
        promptRef.current = combinedText;
        lastTranscribedTextRef.current = combinedText;
        lastSpeechTimestampRef.current = Date.now();
        hasPendingSpeechRef.current = true;
        setLiveTranscript(speechToUse);
        onTranscriptChangeRef.current(combinedText);

        addVoiceCallLog({
          category: "STT",
          title: "Speech Transcribed",
          detail: `"${combinedText}" (Energy: ${peakEnergyInTurnRef.current.toFixed(1)})`,
        });

        // Normal listening state:
        updateCallStatus("user-speaking");

        // Clear any previous dispatch timer: auto-send ONLY happens after 1.5s of TRUE SILENCE via heartbeat
        clearFinalDispatchTimer();
      };

      recognition.onerror = (event: any) => {
        // "aborted" and "no-speech" are routine browser events.
        // DO NOT log warnings and DO NOT restart from them (onend will handle clean restart).
        if (event.error === "aborted" || event.error === "no-speech") {
          return;
        }
        addVoiceCallLog({
          category: "STT",
          title: "Speech Recognition Event",
          detail: `Event: ${event?.error}`,
          level: event?.error === "not-allowed" ? "error" : "warn",
        });
        console.warn("Speech recognition error:", event?.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          if (callStatusRef.current === "idle") {
            endCall();
          }
        }
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;
        // Always-On Mic (True Full Duplex): Auto-revive immediately via 0ms loop
        if (
          isCallActiveRef.current &&
          !isAbortingRef.current &&
          !disabled &&
          !isUserMutedRef.current
        ) {
          clearRestartTimer();
          const restartMic = () => {
            if (
              isCallActiveRef.current &&
              !isAbortingRef.current &&
              !isRecognitionRunningRef.current &&
              !isUserMutedRef.current
            ) {
              try {
                if (recognitionRef.current === recognition) {
                  recognition.start();
                } else if (recognitionRef.current) {
                  recognitionRef.current.start();
                } else {
                  startFreshRecognitionRef.current();
                }
              } catch {
                // Micro-fallback if browser was in transitioning state
                restartTimerRef.current = setTimeout(() => {
                  if (
                    isCallActiveRef.current &&
                    !isRecognitionRunningRef.current &&
                    !isUserMutedRef.current
                  ) {
                    try {
                      recognitionRef.current?.start?.();
                    } catch {}
                  }
                }, 40);
              }
            }
          };
          restartTimerRef.current = setTimeout(restartMic, 0);
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
      } catch (startErr: any) {
        console.warn("SpeechRecognition start exception:", startErr?.message || startErr);
      }
    } catch (err) {
      console.warn("Failed to instantiate fresh speech recognition:", err);
    }
  }, [
    clearRestartTimer,
    disabled,
    endCall,
    handleFarewellAndEndCall,
    isAcousticEchoOfAi,
    setMicrophoneMuted,
    updateCallStatus,
  ]);
  startFreshRecognitionRef.current = startFreshRecognition;

  const scheduleRestartRecognition = useCallback(
    (delay = 150) => {
      if (!isCallActiveRef.current) {
        return;
      }
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        if (!isCallActiveRef.current) return;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {}
        } else {
          startFreshRecognition();
        }
      }, delay);
    },
    [clearRestartTimer, startFreshRecognition],
  );

  const setCallLanguage = useCallback(
    (lang: "urdu" | "english") => {
      callLanguageRef.current = lang;
      setCallLanguageState(lang);
      const currentSettings = loadSttSettings();
      let targetMode: SttLanguageMode = currentSettings.language;
      if (lang === "urdu") {
        if (targetMode === "english") {
          targetMode = "natural-urdu";
        }
      } else {
        targetMode = "english";
      }
      saveSttSettings({ ...currentSettings, language: targetMode });
      recognitionLanguageIndexRef.current = 0;
      if (isCallActiveRef.current) {
        cleanupRecognition();
        scheduleRestartRecognition(50);
      }
    },
    [cleanupRecognition, scheduleRestartRecognition],
  );

  useEffect(() => {
    return subscribeSttSettings((newSettings) => {
      const mapped = newSettings.language === "english" ? "english" : "urdu";
      callLanguageRef.current = mapped;
      setCallLanguageState(mapped);
      if (isCallActiveRef.current) {
        recognitionLanguageIndexRef.current = 0;
        cleanupRecognition();
        scheduleRestartRecognition(50);
      }
    });
  }, [cleanupRecognition, scheduleRestartRecognition]);

  useEffect(() => {
    return subscribeTtsSettings((newSettings) => {
      if (streamingPlayerRef.current) {
        streamingPlayerRef.current.updateTtsOptions(newSettings);
      }
    });
  }, []);

  // Global subscription to TTS speech state (e.g. speakText(), Read Aloud, or voice tests)
  // Ensures microphone is synchronized whenever ANY audio speech starts or finishes
  useEffect(() => {
    if (disabled) return;
    return subscribeSpeechState((isSpeaking, speakingText) => {
      if (!isCallActiveRef.current) {
        if (isSpeaking) {
          isTtsActiveRef.current = true;
          lastTtsEndedTimestampRef.current = Date.now();
        } else {
          lastTtsEndedTimestampRef.current = Date.now();
          setTimeout(() => {
            if (!isCurrentlySpeaking()) {
              isTtsActiveRef.current = false;
            }
          }, ACOUSTIC_ECHO_COOLDOWN_MS);
        }
        return;
      }

      // During active voice call:
      if (isSpeaking) {
        isTtsActiveRef.current = true;
        activeTtsTextRef.current = speakingText || "";
        noiseShieldRef.current?.setBotSpeaking(true);
        updateCallStatus("speaking");
        thinkingAmbientSound.stop();
        if (speakingText) {
          setAssistantSpokenText(speakingText);
          addAiSpokenPhrase(speakingText);
        }
      } else {
        activeTtsTextRef.current = "";
        // If a streaming player is currently actively playing sentence chunks or has queued chunks waiting,
        // do not switch status or reset state yet (the player's onFinished handler will transition when all chunks conclude).
        const isStreamingPlayerBusy = Boolean(
          streamingPlayerRef.current &&
          !streamingPlayerRef.current.isStopped() &&
          (streamingPlayerRef.current.getIsPlaying() ||
            streamingPlayerRef.current.getQueueLength() > 0 ||
            streamingPlayerRef.current.hasEnqueuedChunks()),
        );
        if (isStreamingPlayerBusy) {
          return;
        }

        lastTtsEndedTimestampRef.current = Date.now();
        setAssistantSpokenText("");
        waitingForAssistantResponseRef.current = false;
        clearTurnTimeout();

        clearTtsCooldownTimer();
        ttsCooldownTimerRef.current = setTimeout(() => {
          const isPlayerStillBusy = Boolean(
            streamingPlayerRef.current &&
            !streamingPlayerRef.current.isStopped() &&
            (streamingPlayerRef.current.getIsPlaying() ||
              streamingPlayerRef.current.getQueueLength() > 0),
          );
          if (!isCurrentlySpeaking() && !isPlayerStillBusy && isCallActiveRef.current) {
            isTtsActiveRef.current = false;
            noiseShieldRef.current?.setBotSpeaking(false);
            waitingForAssistantResponseRef.current = false;

            // Only switch to listening if user is not currently speaking!
            if (!hasPendingSpeechRef.current && callStatusRef.current !== "user-speaking") {
              updateCallStatus("listening");
            }

            // CRITICAL: NEVER wipe user's prompt (promptRef, lastTranscribedTextRef, onTranscriptChange)
            // and NEVER call recognition.abort()! User speech during or right after TTS MUST be preserved!
            if (
              isCallActiveRef.current &&
              recognitionRef.current &&
              !isRecognitionRunningRef.current
            ) {
              try {
                recognitionRef.current.start();
              } catch {}
            }
          }
        }, ACOUSTIC_ECHO_COOLDOWN_MS);
      }
    });
  }, [clearTtsCooldownTimer, clearTurnTimeout, disabled, updateCallStatus, addAiSpokenPhrase]);

  const dispatchAutoSend = useCallback(() => {
    clearRestartTimer();

    // Never auto-send if call is inactive, user is editing, or if TTS is actively speaking or thinking
    if (
      !isCallActiveRef.current ||
      isUserEditingRef.current ||
      isTtsActiveRef.current ||
      callStatusRef.current === "speaking" ||
      callStatusRef.current === "thinking"
    ) {
      if (isUserEditingRef.current) {
        hasPendingSpeechRef.current = false;
      }
      return;
    }

    const currentText = (promptRef.current || lastTranscribedTextRef.current || "").trim();
    if (!currentText) {
      hasPendingSpeechRef.current = false;
      if (isCallActiveRef.current) {
        updateCallStatus("listening");
      }
      return;
    }

    // Set auto-sending flag so immediate prompt prop re-renders are not treated as manual edits
    isAutoSendingRef.current = true;
    hasPendingSpeechRef.current = false;

    // Reset turn state for the new turn
    waitingForAssistantResponseRef.current = true;
    activeAssistantMessageIdRef.current = null;
    processedTextOffsetRef.current = 0;
    processedChunksSetRef.current.clear();
    allTurnAiTextRef.current = "";
    currentPlayingTtsChunkRef.current = "";

    // Snapshot pre-turn message IDs so only NEW assistant messages from this turn are spoken
    const preIds = new Set<string>();
    (promptHistoryMessagesRef.current || []).forEach((m) => preIds.add(m.id));
    preTurnMessageIdsRef.current = preIds;

    // Create fresh StreamingTtsPlayer for low-latency streaming chunk-by-chunk playback
    if (streamingPlayerRef.current) {
      streamingPlayerRef.current.stop();
    }

    const currentTts = loadTtsSettings();
    streamingPlayerRef.current = new StreamingTtsPlayer({
      ttsOptions: currentTts,
      onStartSpeaking: () => {
        clearTurnTimeout();
        thinkingAmbientSound.stop();
        updateCallStatus("speaking");
        isTtsActiveRef.current = true;
        setMicrophoneMuted(false);
        addVoiceCallLog({ category: "TTS", title: "TTS Playback Started", level: "info" });
      },
      onChunkStarted: (chunk: string) => {
        currentPlayingTtsChunkRef.current = chunk;
        setAssistantSpokenText(chunk);
        addAiSpokenPhrase(chunk);
        addVoiceCallLog({
          category: "TTS",
          title: "TTS Speaking Sentence",
          detail: chunk,
          level: "info",
        });
      },
      onFinished: () => {
        addVoiceCallLog({ category: "TTS", title: "TTS Playback Completed", level: "success" });
        currentPlayingTtsChunkRef.current = "";
        setAssistantSpokenText("");
        waitingForAssistantResponseRef.current = false;
        clearTurnTimeout();
        lastTtsEndedTimestampRef.current = Date.now();
        thinkingAmbientSound.stop();

        // Ensure composer is clean and transition back to listening
        promptRef.current = "";
        lastTranscribedTextRef.current = "";
        manualBaselineRef.current = "";
        accumulatedTurnFinalRef.current = "";
        hasPendingSpeechRef.current = false;
        onTranscriptChangeRef.current("");
        setLiveTranscript("");

        clearTtsCooldownTimer();
        ttsCooldownTimerRef.current = setTimeout(() => {
          if (!isCurrentlySpeaking() && isCallActiveRef.current) {
            isTtsActiveRef.current = false;
            updateCallStatus("listening");
            if (
              isCallActiveRef.current &&
              recognitionRef.current &&
              !isRecognitionRunningRef.current
            ) {
              try {
                recognitionRef.current.start();
              } catch {}
            }
          }
        }, ACOUSTIC_ECHO_COOLDOWN_MS);
      },
    });

    // Ensure promptRef and composer have current text synchronized before dispatch
    promptRef.current = currentText;
    onTranscriptChangeRef.current(currentText);
    setLiveTranscript("");

    // Switch call status to thinking & start ambient sound
    updateCallStatus("thinking");
    thinkingAmbientSound.start();

    // Safety turn timeout: If assistant fails to stream or backend errors out, return to listening after 15s
    clearTurnTimeout();
    turnTimeoutRef.current = setTimeout(() => {
      const isPlayerBusy = Boolean(
        streamingPlayerRef.current &&
        !streamingPlayerRef.current.isStopped() &&
        (streamingPlayerRef.current.getIsPlaying() ||
          streamingPlayerRef.current.getQueueLength() > 0),
      );
      if (
        waitingForAssistantResponseRef.current &&
        !isCurrentlySpeaking() &&
        !isTtsActiveRef.current &&
        !isPlayerBusy
      ) {
        console.warn("[VoiceCall] Assistant turn response timeout, returning to listening");
        waitingForAssistantResponseRef.current = false;
        thinkingAmbientSound.stop();
        updateCallStatus("listening");
        if (isCallActiveRef.current && recognitionRef.current && !isRecognitionRunningRef.current) {
          try {
            recognitionRef.current.start();
          } catch {}
        }
      }
    }, 15000);

    // Clear transcript baselines and turn buffers for the next turn
    manualBaselineRef.current = "";
    lastTranscribedTextRef.current = "";
    accumulatedTurnFinalRef.current = "";
    lastFinalizedIndexRef.current = -1;
    // Advance turn start index to the current length of recognition results
    // so next turn only picks up fresh speech without aborting recognition!
    turnStartResultIndexRef.current = currentEventResultsLengthRef.current;

    // DO NOT abort SpeechRecognition! In Chromium, aborting kills the active audio stream,
    // causing a 300-800ms gap that swallows the beginning of the next sentence or drops trailing speech.
    // By keeping SpeechRecognition alive, the microphone is truly 100% full-duplex always-on.

    addVoiceCallLog({
      category: "SYSTEM",
      title: "Voice Turn Auto-Dispatched",
      detail: currentText,
    });
    peakEnergyInTurnRef.current = 0;

    // Auto-send prompt turn
    onAutoSendRef.current(currentText);
  }, [
    clearRestartTimer,
    clearTtsCooldownTimer,
    clearTurnTimeout,
    setMicrophoneMuted,
    updateCallStatus,
  ]);

  // Dedicated periodic silence heartbeat and speaking state watchdog
  useEffect(() => {
    if (!isCallActive) return;

    const interval = setInterval(() => {
      // 0. Always-On Mic Watchdog: Ensure SpeechRecognition is active if call is alive and not muted by user
      if (
        isCallActiveRef.current &&
        !isUserMutedRef.current &&
        !isAbortingRef.current &&
        !isRecognitionRunningRef.current
      ) {
        try {
          if (recognitionRef.current) {
            recognitionRef.current.start();
          } else {
            startFreshRecognitionRef.current();
          }
        } catch {}
      }

      // 1. Speaking watchdog: If call status is "speaking", but audio speech has concluded
      // and acoustic cooldown has elapsed, restore status to "listening" (grey wave) immediately.
      // This prevents the visualizer or mic from ever remaining hung in "speaking" (green).
      if (callStatusRef.current === "speaking") {
        const isActuallySpeaking =
          isCurrentlySpeaking() ||
          Boolean(
            streamingPlayerRef.current &&
            !streamingPlayerRef.current.isStopped() &&
            (streamingPlayerRef.current.getIsPlaying() ||
              streamingPlayerRef.current.getQueueLength() > 0),
          );

        if (!isActuallySpeaking) {
          const cooldownElapsed = Date.now() - lastTtsEndedTimestampRef.current;
          if (cooldownElapsed >= ACOUSTIC_ECHO_COOLDOWN_MS) {
            isTtsActiveRef.current = false;
            waitingForAssistantResponseRef.current = false;
            setAssistantSpokenText("");
            updateCallStatus("listening");
            if (
              isCallActiveRef.current &&
              recognitionRef.current &&
              !isRecognitionRunningRef.current
            ) {
              try {
                recognitionRef.current.start();
              } catch {}
            }
          }
        }
      }

      if (
        !isCallActiveRef.current ||
        isUserEditingRef.current ||
        isTtsActiveRef.current ||
        callStatusRef.current === "thinking" ||
        callStatusRef.current === "speaking" ||
        !hasPendingSpeechRef.current
      ) {
        if (isUserEditingRef.current) {
          hasPendingSpeechRef.current = false;
        }
        return;
      }

      const elapsed = Date.now() - lastSpeechTimestampRef.current;
      const currentText = (promptRef.current || lastTranscribedTextRef.current || "").trim();
      if (!currentText) {
        hasPendingSpeechRef.current = false;
        return;
      }

      const words = currentText.split(/\s+/).filter(Boolean);
      // Dynamic silence threshold:
      // - 1 word: wait 3800ms so momentary words ("jo", "kya", "haan") are never prematurely dispatched while user is forming their thought.
      // - 2 words: wait 2800ms so 2-word pauses don't cut off the rest of the sentence.
      // - 3+ words: wait 1800ms which provides a natural breathing pause before auto-dispatching.
      const requiredSilence = words.length <= 1 ? 3800 : words.length === 2 ? 2800 : 1800;

      if (elapsed >= requiredSilence) {
        hasPendingSpeechRef.current = false;
        dispatchAutoSend();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isCallActive, dispatchAutoSend, updateCallStatus]);

  // Handle external/manual edits in the input box:
  useEffect(() => {
    promptRef.current = prompt;

    // During auto-send dispatch: wait for the prompt to be cleared by the composer submission
    if (isAutoSendingRef.current) {
      if (prompt === "") {
        isAutoSendingRef.current = false;
        manualBaselineRef.current = "";
        lastTranscribedTextRef.current = "";
        hasPendingSpeechRef.current = false;
      }
      return;
    }

    if (prompt === "") {
      hasPendingSpeechRef.current = false;
      manualBaselineRef.current = "";
      lastTranscribedTextRef.current = "";
      return;
    }

    // If this prompt was emitted by STT, do NOT treat it as manual typing
    if (
      recentEmittedTranscriptsRef.current.has(prompt.trim()) ||
      prompt === lastTranscribedTextRef.current
    ) {
      return;
    }

    // Detect true manual typing
    if (isUserEditingRef.current || prompt !== lastTranscribedTextRef.current) {
      manualBaselineRef.current = prompt;
      lastTranscribedTextRef.current = prompt;

      if (prompt.trim().length > 0) {
        lastSpeechTimestampRef.current = Date.now();
        hasPendingSpeechRef.current = true;
      } else {
        hasPendingSpeechRef.current = false;
      }
    }
  }, [prompt]);

  // User-facing interrupt action (e.g. click wave visualizer or press Stop/Escape or say "stop")
  const interruptSpeaking = useCallback(() => {
    if (isInterruptingRef.current) return;
    isInterruptingRef.current = true;
    try {
      clearFinalDispatchTimer();
      clearRestartTimer();
      clearTurnTimeout();

      // 1. Instantly halt audio synthesis playback
      if (streamingPlayerRef.current) {
        streamingPlayerRef.current.stop();
        streamingPlayerRef.current = null;
      }
      stopSpeaking();

      // 2. Stop ambient thinking sound
      thinkingAmbientSound.stop();

      // 3. Abort model stream / tool execution if active
      if (canInterruptRef.current && onInterruptRef.current) {
        try {
          onInterruptRef.current();
        } catch (err) {
          console.warn("[VoiceCall] onInterrupt error:", err);
        }
      }

      // 4. Reset turn tracking
      isTtsActiveRef.current = false;
      activeTtsTextRef.current = "";
      currentPlayingTtsChunkRef.current = "";
      lastTtsEndedTimestampRef.current = Date.now();
      waitingForAssistantResponseRef.current = false;
      activeAssistantMessageIdRef.current = null;
      processedTextOffsetRef.current = 0;
      isAutoSendingRef.current = false;
      hasPendingSpeechRef.current = false;
      manualBaselineRef.current = "";
      lastTranscribedTextRef.current = "";
      accumulatedTurnFinalRef.current = "";
      promptRef.current = "";
      onTranscriptChangeRef.current("");
      setLiveTranscript("");
      setAssistantSpokenText("");

      // 5. CRITICAL: Instantly abort recognition so all speaker audio in the buffer is destroyed!
      try {
        recognitionRef.current?.abort();
      } catch {}

      // 6. Instantly return to listening state
      updateCallStatus("listening");
      setMicrophoneMuted(false);
      if (!recognitionRef.current && isCallActiveRef.current) {
        startFreshRecognitionRef.current();
      } else if (
        isCallActiveRef.current &&
        recognitionRef.current &&
        !isRecognitionRunningRef.current
      ) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
    } finally {
      isInterruptingRef.current = false;
    }
  }, [
    clearFinalDispatchTimer,
    clearRestartTimer,
    clearTurnTimeout,
    updateCallStatus,
    setMicrophoneMuted,
  ]);
  interruptSpeakingRef.current = interruptSpeaking;

  // Global keydown handler to allow pressing Escape to interrupt speaking/thinking
  useEffect(() => {
    if (!isCallActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (callStatusRef.current === "speaking" || callStatusRef.current === "thinking") {
          e.preventDefault();
          interruptSpeaking();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCallActive, interruptSpeaking]);

  const startCall = useCallback(async () => {
    if (disabled) return;
    if (!isSpeechRecognitionSupported()) {
      addVoiceCallLog({
        category: "SYSTEM",
        title: "Speech Recognition Notice",
        detail:
          "Speech recognition is limited in this browser. Please use Google Chrome or Edge for full Roman Urdu / English STT.",
        level: "warn",
      });
    }

    try {
      waitingForAssistantResponseRef.current = false;
      activeAssistantMessageIdRef.current = null;
      processedTextOffsetRef.current = 0;
      recognitionLanguageIndexRef.current = 0;
      isCallActiveRef.current = true;
      isTtsActiveRef.current = false;
      isAutoSendingRef.current = false;
      hasPendingSpeechRef.current = false;
      lastSpeechTimestampRef.current = 0;
      manualBaselineRef.current = promptRef.current;
      lastTranscribedTextRef.current = promptRef.current;

      setVoiceCallActiveState(true, threadIdRef.current);

      updateCallStatus("listening");
      setIsCallActive(true);

      // On mobile devices, DO NOT capture a persistent WebRTC mic stream via getUserMedia
      // because mobile operating systems (Android/iOS) enforce exclusive mic access and
      // will block SpeechRecognition from recording audio!
      if (!isMobileDevice && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: { ideal: true },
              noiseSuppression: { ideal: true },
              autoGainControl: { ideal: true },
            },
          });
          micStreamRef.current = stream;

          const AudioCtxClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioCtx = new AudioCtxClass();
          if (audioCtx.state === "suspended") {
            void audioCtx.resume();
          }
          audioContextRef.current = audioCtx;

          // Wire Acoustic Noise Shield (Fan Denoise + Audio Gate + Speaker Bleed Blocker)
          const shield = createAcousticNoiseShield(audioCtx, stream);
          noiseShieldRef.current = shield;
          analyserRef.current = shield.analyserNode;

          const analyser = shield.analyserNode;

          const freqData = new Uint8Array(analyser.frequencyBinCount);
          levelCheckIntervalRef.current = setInterval(() => {
            if (!isCallActiveRef.current || !analyserRef.current) return;

            if (
              isTtsActiveRef.current ||
              callStatusRef.current === "speaking" ||
              callStatusRef.current === "thinking" ||
              isCurrentlySpeaking()
            ) {
              return;
            }

            analyserRef.current.getByteFrequencyData(freqData);

            let sum = 0;
            for (let i = 0; i < freqData.length; i++) {
              sum += freqData[i] ?? 0;
            }
            const avg = sum / (freqData.length || 1);
            if (avg > peakEnergyInTurnRef.current) {
              peakEnergyInTurnRef.current = avg;
            }

            if (callStatusRef.current === "listening" && avg > 18) {
              updateCallStatus("user-speaking");
            } else if (callStatusRef.current === "user-speaking" && avg <= 12) {
              updateCallStatus("listening");
            }
          }, 100);
        } catch (mediaErr) {
          console.warn("Desktop audio analyser setup optional warning:", mediaErr);
        }
      }

      // Resume speech synthesis to ensure audio context is active inside user gesture
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.resume();
        } catch {}
      }

      // Start mobile OS sleep keep-alive (Screen WakeLock, silent audio loop, MediaSession)
      startMobileVoiceKeepAlive({
        onResumeNeeded: () => {
          if (!isCallActiveRef.current) return;
          if (audioContextRef.current && audioContextRef.current.state === "suspended") {
            void audioContextRef.current.resume().catch(() => {});
          }
          if (
            !isTtsActiveRef.current &&
            callStatusRef.current !== "speaking" &&
            callStatusRef.current !== "thinking" &&
            !isCurrentlySpeaking()
          ) {
            if (recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch {}
            } else {
              startFreshRecognition();
            }
          }
        },
        onHangup: () => {
          endCall();
        },
      });

      // Start fresh speech recognition instance
      startFreshRecognition();
    } catch (err) {
      console.error("Failed to start voice call assistant:", err);
      endCall();
    }
  }, [disabled, endCall, startFreshRecognition, updateCallStatus]);

  const toggleCall = useCallback(() => {
    if (disabled) return;
    if (isCallActive) {
      endCall();
    } else {
      void startCall();
    }
  }, [disabled, isCallActive, endCall, startCall]);

  // If disabled becomes true while call is active, terminate immediately
  useEffect(() => {
    if (disabled && isCallActiveRef.current) {
      endCall();
    }
  }, [disabled, endCall]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  // Monitor phase during active call
  useEffect(() => {
    if (!isCallActive) return;

    if (phase === "running") {
      if (callStatusRef.current !== "thinking" && callStatusRef.current !== "speaking") {
        updateCallStatus("thinking");
        thinkingAmbientSound.start();
      }
    } else {
      // Phase is idle/ready:
      // Only transition to listening if we are NOT waiting for an assistant response,
      // and NOT actively speaking or playing TTS chunks!
      const isPlayerActive = Boolean(
        streamingPlayerRef.current &&
        !streamingPlayerRef.current.isStopped() &&
        (streamingPlayerRef.current.getIsPlaying() ||
          streamingPlayerRef.current.getQueueLength() > 0),
      );
      if (
        !waitingForAssistantResponseRef.current &&
        !isCurrentlySpeaking() &&
        !isTtsActiveRef.current &&
        !isPlayerActive
      ) {
        thinkingAmbientSound.stop();
        if (callStatusRef.current === "thinking" || callStatusRef.current === "speaking") {
          updateCallStatus("listening");
        }
      }
    }
  }, [isCallActive, phase, updateCallStatus]);

  // Monitor streaming assistant tokens in real time & feed into streaming sentence TTS player
  useEffect(() => {
    if (!isCallActive || !promptHistoryMessages || promptHistoryMessages.length === 0) return;
    if (!waitingForAssistantResponseRef.current) return;

    // 1. Identify the assistant message belonging to this turn
    let targetMessage: ChatMessage | undefined;

    if (activeAssistantMessageIdRef.current) {
      targetMessage = promptHistoryMessages.find(
        (m) => m.id === activeAssistantMessageIdRef.current,
      );
    }

    if (!targetMessage) {
      // Find the latest assistant message that was NOT present before dispatch
      targetMessage = [...promptHistoryMessages]
        .reverse()
        .find((m) => m.role === "assistant" && !preTurnMessageIdsRef.current.has(m.id));

      if (targetMessage) {
        activeAssistantMessageIdRef.current = targetMessage.id;
        // Do not reset offset if current offset is already valid within the message
        if (processedTextOffsetRef.current > targetMessage.text.length) {
          processedTextOffsetRef.current = 0;
        }
      }
    }

    if (!targetMessage || !streamingPlayerRef.current) return;

    allTurnAiTextRef.current = targetMessage.text;

    // 2. Extract ready-to-speak sentence chunks from the incoming stream (code blocks stripped)
    const isComplete = !targetMessage.streaming;
    const { chunks, newOffset } = extractSpeechChunks(
      targetMessage.text,
      processedTextOffsetRef.current,
      isComplete,
    );

    for (const chunk of chunks) {
      const sig = cleanForComparison(chunk);
      if (sig && !processedChunksSetRef.current.has(sig)) {
        processedChunksSetRef.current.add(sig);
        addAiSpokenPhrase(chunk);
        streamingPlayerRef.current.enqueue(chunk);
      }
    }
    processedTextOffsetRef.current = newOffset;

    // 3. If stream has completed, mark stream finished on the player and reset active turn
    if (isComplete) {
      streamingPlayerRef.current.markStreamFinished();
      waitingForAssistantResponseRef.current = false;
      activeAssistantMessageIdRef.current = null;
      processedTextOffsetRef.current = 0;
    }
  }, [isCallActive, promptHistoryMessages, addAiSpokenPhrase]);

  return {
    isCallActive,
    callStatus,
    analyserNode: analyserRef.current,
    toggleCall,
    endCall,
    interruptSpeaking,
    callLanguage,
    setCallLanguage,
    liveTranscript,
    assistantSpokenText,
    isMicMuted,
    toggleMicMute,
  };
}

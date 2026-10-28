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
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";
import type { ChatMessage, SessionPhase } from "~/types";

const ACOUSTIC_ECHO_COOLDOWN_MS = 300;

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
  "thamb jao",
  "ek second",
  "ek sec",
  "one second",
  "wait",
  "wait please",
  "please wait",
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
  "ek minute suno",
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
  const recognitionRef = useRef<any>(null);
  const recognitionLanguageIndexRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dedicated silence engine refs: tracks real timestamp of last spoken words
  const lastSpeechTimestampRef = useRef<number>(0);
  const hasPendingSpeechRef = useRef<boolean>(false);

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

  // Recognition lifecycle & turn buffer refs
  const isRecognitionRunningRef = useRef(false);
  const isAbortingRef = useRef(false);
  const accumulatedTurnFinalRef = useRef<string>("");
  const lastFinalizedIndexRef = useRef<number>(-1);
  const recentEmittedTranscriptsRef = useRef<Set<string>>(new Set());
  const interruptSpeakingRef = useRef<() => void>(() => {});
  const startFreshRecognitionRef = useRef<() => void>(() => {});

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

    if (levelCheckIntervalRef.current) {
      clearInterval(levelCheckIntervalRef.current);
      levelCheckIntervalRef.current = null;
    }

    // Stop mic stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    // Close AudioContext
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

  const isAcousticEchoOfAi = useCallback((text: string): boolean => {
    // Interrupt commands (stop, chup, ruko, bas) are explicit user intentions and NEVER an AI echo!
    if (containsInterruptCommand(text)) {
      return false;
    }

    // Acoustic echo can occur while the AI is speaking or within the echo cooldown window,
    // OR if the recognized text is a direct repeat of what the AI recently uttered!
    const isWithinEchoWindow =
      isTtsActiveRef.current ||
      isCurrentlySpeaking() ||
      Date.now() - lastTtsEndedTimestampRef.current < ACOUSTIC_ECHO_COOLDOWN_MS;

    const clean = cleanForComparison(text);
    if (!clean) return false;
    if (containsInterruptCommand(clean)) return false;
    const romanClean = cleanForComparison(transliterateUrduToRoman(text));

    // Check against all text generated by AI this turn, currently playing chunk, and recent spoken phrases
    const aiSources = [
      allTurnAiTextRef.current,
      currentPlayingTtsChunkRef.current,
      ...recentAiSpokenPhrasesRef.current,
    ];

    for (const source of aiSources) {
      if (!source) continue;
      const cleanSource = cleanForComparison(source);
      if (!cleanSource) continue;
      const romanCleanSource = cleanForComparison(transliterateUrduToRoman(source));

      const candidates = [clean, romanClean];
      const sourceCandidates = [cleanSource, romanCleanSource];

      for (const cand of candidates) {
        if (!cand || cand.length < 4) continue;
        for (const src of sourceCandidates) {
          if (!src || src.length < 4) continue;

          // 1. Direct substring match
          if (cand.length >= 5 && src.includes(cand)) return true;
          if (src.length >= 5 && cand.includes(src)) return true;

          // 2. Tokenized word overlap check
          const words = cand.split(/\s+/).filter((w) => w.length >= 3);
          if (words.length >= 2) {
            let matches = 0;
            for (const w of words) {
              if (src.includes(w)) matches++;
            }
            if (matches / words.length >= 0.45) return true;
          }
        }
      }
    }

    return false;
  }, []);

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

        const isStreamingPlayerBusy = Boolean(
          streamingPlayerRef.current &&
          !streamingPlayerRef.current.isStopped() &&
          (streamingPlayerRef.current.getIsPlaying() ||
            streamingPlayerRef.current.getQueueLength() > 0),
        );

        const isAiSpeakingOrBusy =
          isTtsActiveRef.current ||
          callStatusRef.current === "speaking" ||
          callStatusRef.current === "thinking" ||
          isCurrentlySpeaking() ||
          isStreamingPlayerBusy ||
          Date.now() - lastTtsEndedTimestampRef.current < ACOUSTIC_ECHO_COOLDOWN_MS;

        // Build entire session transcript from event.results from 0 to end (never drops chunks!)
        let fullSessionFinalized = "";
        let currentInterim = "";

        for (let i = 0; i < event.results.length; ++i) {
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

        // ACOUSTIC ECHO SHIELD & INTERRUPT DETECTOR:
        // While AI is speaking, playing TTS audio, or during the 300ms post-TTS cooldown:
        // The laptop speaker is blaring audio directly into the laptop microphone!
        // We MUST DROP ALL incoming speech so the speaker sound is NEVER transcribed.
        // The ONLY exception is an explicit user interruption command ("stop", "ruko", "chup", "bas", "wait").
        if (isAiSpeakingOrBusy) {
          const formatted = formatSttTranscript(rawSpeech, effectiveMode);
          const isInterrupt =
            containsInterruptCommand(formatted) || containsInterruptCommand(rawSpeech);

          if (isInterrupt) {
            // User explicitly commanded stop/chup/ruko/bas: immediately halt playback!
            interruptSpeakingRef.current();
            try {
              recognitionRef.current?.abort();
            } catch {}
          }
          // Discard turn buffers during AI speech so speaker audio NEVER leaks into input field!
          accumulatedTurnFinalRef.current = "";
          return;
        }

        // Deduplicate immediate duplicate words that recognition engines emit
        const cleanSpeech = removeConsecutiveDuplicateWords(rawSpeech);
        if (!cleanSpeech) return;

        const processedSpeech = formatSttTranscript(cleanSpeech, effectiveMode);

        // 2. Farewell / End call command ("bye", "allah hafiz", "call kato", etc.):
        const farewellCheck = isFarewellOrEndCall(processedSpeech).isFarewell
          ? isFarewellOrEndCall(processedSpeech)
          : isFarewellOrEndCall(cleanSpeech);

        if (farewellCheck.isFarewell) {
          handleFarewellAndEndCall(farewellCheck.phrase, farewellCheck.isUrdu);
          return;
        }

        // 3. Acoustic Echo Isolation check
        if (isAcousticEchoOfAi(processedSpeech) || isAcousticEchoOfAi(cleanSpeech)) {
          return;
        }

        // 4. This is real user speech:
        const stripped = stripInterruptCommand(processedSpeech);
        const speechToUse = stripped.length > 0 ? stripped : processedSpeech;

        const combinedText = manualBaselineRef.current
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
        console.warn("Speech recognition error:", event?.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          if (callStatusRef.current === "idle") {
            endCall();
          }
        }
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;
        // When speech recognition session ends naturally on mobile, resume the SAME instance cleanly
        if (isCallActiveRef.current && !isAbortingRef.current && !disabled) {
          clearRestartTimer();
          restartTimerRef.current = setTimeout(() => {
            if (
              isCallActiveRef.current &&
              !isAbortingRef.current &&
              !isRecognitionRunningRef.current &&
              recognitionRef.current === recognition
            ) {
              try {
                recognition.start();
              } catch {
                // already active or starting
              }
            }
          }, 150);
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
        updateCallStatus("speaking");
        thinkingAmbientSound.stop();
        if (speakingText) {
          setAssistantSpokenText(speakingText);
          addAiSpokenPhrase(speakingText);
        }
      } else {
        // If a streaming player is currently actively playing sentence chunks or has queued chunks waiting,
        // do not switch status or reset state yet (the player's onFinished handler will transition when all chunks conclude).
        const isStreamingPlayerBusy = Boolean(
          streamingPlayerRef.current &&
          !streamingPlayerRef.current.isStopped() &&
          (streamingPlayerRef.current.getIsPlaying() ||
            streamingPlayerRef.current.getQueueLength() > 0),
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
            waitingForAssistantResponseRef.current = false;
            promptRef.current = "";
            lastTranscribedTextRef.current = "";
            manualBaselineRef.current = "";
            accumulatedTurnFinalRef.current = "";
            hasPendingSpeechRef.current = false;
            onTranscriptChangeRef.current("");
            setLiveTranscript("");
            updateCallStatus("listening");

            // Ensure recognition session remains alive
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
      },
      onChunkStarted: (chunk: string) => {
        currentPlayingTtsChunkRef.current = chunk;
        setAssistantSpokenText(chunk);
        addAiSpokenPhrase(chunk);
      },
      onFinished: () => {
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

    // Reset SpeechRecognition session so that the next user turn starts clean from index 0
    try {
      recognitionRef.current?.abort();
    } catch {}

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
      // If user has only spoken 1 or 2 short words (e.g. "Main ne", "Aap"), wait 2.2s so we don't prematurely cut them off while thinking!
      // Once they have spoken a complete phrase (3+ words), 1.4s of silence is plenty.
      const requiredSilence = words.length <= 2 ? 2200 : 1400;

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
      onInterruptRef.current();
    }

    // 4. Reset turn tracking
    isTtsActiveRef.current = false;
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

    // 5. Instantly return to listening state
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
      alert(
        "Speech recognition is not supported in this browser. Please use Google Chrome or Edge.",
      );
      return;
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

          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.8;
          source.connect(analyser);
          analyserRef.current = analyser;

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

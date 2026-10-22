import { useState, useRef, useEffect, useCallback } from "react";
import {
  isSpeechRecognitionSupported,
  getRecognitionLanguageCodes,
  formatSttTranscript,
  loadSttSettings,
  isMobileDevice,
} from "~/lib/speech/stt";
import {
  speakText,
  stopSpeaking,
  subscribeSpeechState,
  isCurrentlySpeaking,
} from "~/lib/speech/tts";
import { thinkingAmbientSound } from "./thinkingAmbientSound";
import { setVoiceCallActiveState } from "./voiceCallState";
import { startMobileVoiceKeepAlive, stopMobileVoiceKeepAlive } from "./mobileVoiceKeepAlive";
import { StreamingTtsPlayer, extractSpeechChunks } from "./streamingTtsPlayer";
import type { VoiceCallStatus } from "./VoiceVisualizerWaves";
import type { ChatMessage, SessionPhase } from "~/types";

const END_CALL_TRIGGERS = [
  "end call",
  "stop call",
  "call khatam",
  "call band karo",
  "call khatam karo",
  "call band kar do",
  "call kato",
  "hang up",
  "disconnect call",
  "call disconnect",
  "call close",
  "bye call",
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
  // Urdu script:
  "سٹاپ",
  "سنو",
  "سنیں",
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

const SILENCE_TIMEOUT_MS = 2000;
const ACOUSTIC_ECHO_COOLDOWN_MS = 600;

function cleanForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'۔،؟]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function containsInterruptCommand(text: string): boolean {
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

  // Exact word boundary for stop or listen or suno
  if (/\b(?:stop|listen|suno)\b/i.test(clean)) {
    return true;
  }

  // Urdu script
  if (/(?:سٹاپ|سنو|سنیں)/.test(clean)) {
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
  onAutoSend: () => void;
  prompt: string;
  phase: SessionPhase;
  promptHistoryMessages?: ReadonlyArray<ChatMessage>;
  disabled?: boolean;
  onInterrupt?: () => void;
  canInterrupt?: boolean;
  threadId?: string | null;
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
}: UseVoiceCallAssistantOptions) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<VoiceCallStatus>("idle");

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

  const updateCallStatus = useCallback((next: VoiceCallStatus) => {
    callStatusRef.current = next;
    setCallStatus(next);
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
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }, []);

  // Completely aborts and detaches event listeners from current SpeechRecognition instance
  const cleanupRecognition = useCallback(() => {
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
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
    preTurnMessageIdsRef.current.clear();

    setVoiceCallActiveState(false, null);
    stopMobileVoiceKeepAlive();

    if (streamingPlayerRef.current) {
      streamingPlayerRef.current.stop();
      streamingPlayerRef.current = null;
    }

    clearRestartTimer();
    clearTtsCooldownTimer();
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
  }, [clearRestartTimer, clearTtsCooldownTimer, cleanupRecognition, updateCallStatus]);

  // Creates and starts a fresh SpeechRecognition instance
  const startFreshRecognition = useCallback(() => {
    // Only proceed if call is active
    if (!isCallActiveRef.current) {
      return;
    }

    cleanupRecognition();
    clearRestartTimer();

    // Ensure mic hardware track is unmuted so speech and "stop" interrupts can be detected
    setMicrophoneMuted(false);

    try {
      const SpeechRecognitionClass =
        (window as unknown as { SpeechRecognition: any }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition: any }).webkitSpeechRecognition;

      if (!SpeechRecognitionClass) return;

      const recognition = new SpeechRecognitionClass();
      const sttSettings = loadSttSettings();
      const languageCodes = getRecognitionLanguageCodes(sttSettings.language);
      recognition.lang =
        languageCodes[Math.min(recognitionLanguageIndexRef.current, languageCodes.length - 1)] ??
        "en-US";
      // On mobile devices (Android/iOS), continuous=true frequently fails or drops audio.
      recognition.continuous = !isMobileDevice;
      recognition.interimResults = true;

      recognition.onstart = () => {
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
        if (!isCallActiveRef.current) {
          return;
        }

        let accumulatedFinal = "";
        let currentInterim = "";

        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item?.isFinal) {
            accumulatedFinal += (accumulatedFinal ? " " : "") + item[0].transcript.trim();
          } else if (item?.[0]) {
            currentInterim += (currentInterim ? " " : "") + item[0].transcript.trim();
          }
        }

        const rawSpeech = (accumulatedFinal + (currentInterim ? " " + currentInterim : "")).trim();
        if (!rawSpeech) return;

        const processedSpeech = formatSttTranscript(rawSpeech, sttSettings.language);

        // 1. Check for end call triggers in both the formatted and raw transcript
        const endCallCandidates = [processedSpeech.toLowerCase(), rawSpeech.toLowerCase()];
        for (const trigger of END_CALL_TRIGGERS) {
          if (endCallCandidates.some((candidate) => candidate.includes(trigger))) {
            endCall();
            return;
          }
        }

        const currentStatus = callStatusRef.current;

        // --- 1. Assistant is actively SPEAKING: only listen for interrupt command ("stop", "ruko", etc.) ---
        if (currentStatus === "speaking" || isCurrentlySpeaking()) {
          const isInterrupt =
            containsInterruptCommand(processedSpeech) || containsInterruptCommand(rawSpeech);
          if (!isInterrupt) {
            // Speaker feedback or ambient non-interrupt chatter: ignore completely to prevent corrupting input
            return;
          }

          // User explicitly commanded STOP or interrupt!
          interruptSpeaking();

          const remaining = stripInterruptCommand(processedSpeech);
          if (remaining.length > 0) {
            promptRef.current = remaining;
            lastTranscribedTextRef.current = remaining;
            lastSpeechTimestampRef.current = Date.now();
            hasPendingSpeechRef.current = true;
            updateCallStatus("user-speaking");
            onTranscriptChangeRef.current(remaining);
          } else {
            promptRef.current = "";
            lastTranscribedTextRef.current = "";
            hasPendingSpeechRef.current = false;
            updateCallStatus("listening");
            onTranscriptChangeRef.current("");
          }
          return;
        }

        // --- 2. Assistant is THINKING / EXECUTING ---
        if (currentStatus === "thinking") {
          if (isPureInterruptCommand(processedSpeech) || isPureInterruptCommand(rawSpeech)) {
            thinkingAmbientSound.stop();
            if (canInterruptRef.current && onInterruptRef.current) {
              onInterruptRef.current();
            }
            waitingForAssistantResponseRef.current = false;
            updateCallStatus("listening");
            manualBaselineRef.current = "";
            lastTranscribedTextRef.current = "";
            promptRef.current = "";
            hasPendingSpeechRef.current = false;
            onTranscriptChangeRef.current("");
            return;
          }

          // User is asking something while AI is thinking: interrupt and capture new text
          thinkingAmbientSound.stop();
          if (canInterruptRef.current && onInterruptRef.current) {
            onInterruptRef.current();
          }

          const newText = stripInterruptCommand(processedSpeech) || processedSpeech;
          lastTranscribedTextRef.current = newText;
          promptRef.current = newText;
          lastSpeechTimestampRef.current = Date.now();
          hasPendingSpeechRef.current = true;
          updateCallStatus("user-speaking");
          onTranscriptChangeRef.current(newText);
          return;
        }

        // --- 3. Normal LISTENING / USER-SPEAKING state ---
        if (isPureInterruptCommand(processedSpeech) || isPureInterruptCommand(rawSpeech)) {
          if (canInterruptRef.current && onInterruptRef.current) {
            onInterruptRef.current();
          }
          waitingForAssistantResponseRef.current = false;
          updateCallStatus("listening");
          manualBaselineRef.current = "";
          lastTranscribedTextRef.current = "";
          promptRef.current = "";
          hasPendingSpeechRef.current = false;
          onTranscriptChangeRef.current("");
          return;
        }

        const stripped = stripInterruptCommand(processedSpeech);
        const speechToUse = stripped.length > 0 ? stripped : processedSpeech;

        const combinedText = manualBaselineRef.current
          ? (manualBaselineRef.current + " " + speechToUse).trim()
          : speechToUse.trim();

        if (combinedText) {
          promptRef.current = combinedText;
          lastTranscribedTextRef.current = combinedText;
          lastSpeechTimestampRef.current = Date.now();
          hasPendingSpeechRef.current = true;
          updateCallStatus("user-speaking");
          onTranscriptChangeRef.current(combinedText);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event?.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          endCall();
        } else if (event.error === "audio-capture") {
          // Hardware mic conflict on mobile: clean any streams and restart
          if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach((track) => track.stop());
            micStreamRef.current = null;
          }
          scheduleRestartRecognition(300);
        } else if (event.error === "no-speech") {
          if (isCallActiveRef.current) {
            scheduleRestartRecognition(80);
          }
        } else if (event.error === "aborted") {
          if (typeof document === "undefined" || document.visibilityState === "visible") {
            scheduleRestartRecognition(120);
          }
        } else if (event.error === "language-not-supported") {
          const languageCodes = getRecognitionLanguageCodes(loadSttSettings().language);
          if (recognitionLanguageIndexRef.current < languageCodes.length - 1) {
            recognitionLanguageIndexRef.current += 1;
          }
          scheduleRestartRecognition(200);
        } else if (event.error === "network") {
          scheduleRestartRecognition(200);
        } else {
          if (isCallActiveRef.current) {
            scheduleRestartRecognition(isMobileDevice ? 100 : 250);
          }
        }
      };

      recognition.onend = () => {
        if (isCallActiveRef.current) {
          if (typeof document === "undefined" || document.visibilityState === "visible") {
            scheduleRestartRecognition(isMobileDevice ? 60 : 100);
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Failed to instantiate fresh speech recognition:", err);
      if (isCallActiveRef.current) {
        scheduleRestartRecognition(500);
      }
    }
  }, [cleanupRecognition, clearRestartTimer, endCall, updateCallStatus, setMicrophoneMuted]);

  const scheduleRestartRecognition = useCallback(
    (delay = 150) => {
      if (!isCallActiveRef.current) {
        return;
      }
      clearRestartTimer();
      restartTimerRef.current = setTimeout(() => {
        startFreshRecognition();
      }, delay);
    },
    [clearRestartTimer, startFreshRecognition],
  );

  // Global subscription to TTS speech state (e.g. Read Aloud button or settings voice tests)
  // Ensures microphone is physically aborted whenever ANY audio speech occurs outside the call
  useEffect(() => {
    return subscribeSpeechState((isSpeaking) => {
      // In active voice call mode, recognition stays alive to listen for "stop" keyword!
      if (isCallActiveRef.current) return;

      if (isSpeaking) {
        isTtsActiveRef.current = true;
        lastTtsEndedTimestampRef.current = Date.now();
        cleanupRecognition();
      } else {
        lastTtsEndedTimestampRef.current = Date.now();
        setTimeout(() => {
          if (!isCurrentlySpeaking()) {
            isTtsActiveRef.current = false;
          }
        }, ACOUSTIC_ECHO_COOLDOWN_MS);
      }
    });
  }, [cleanupRecognition]);

  const dispatchAutoSend = useCallback(() => {
    clearRestartTimer();

    // Never auto-send if call is inactive, or if TTS is actively speaking or thinking
    if (
      !isCallActiveRef.current ||
      isTtsActiveRef.current ||
      callStatusRef.current === "speaking" ||
      callStatusRef.current === "thinking"
    ) {
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

    // Snapshot pre-turn message IDs so only NEW assistant messages from this turn are spoken
    const preIds = new Set<string>();
    (promptHistoryMessagesRef.current || []).forEach((m) => preIds.add(m.id));
    preTurnMessageIdsRef.current = preIds;

    // Create fresh StreamingTtsPlayer for low-latency streaming chunk-by-chunk playback
    if (streamingPlayerRef.current) {
      streamingPlayerRef.current.stop();
    }

    streamingPlayerRef.current = new StreamingTtsPlayer({
      maxChunks: 4,
      onStartSpeaking: () => {
        thinkingAmbientSound.stop();
        updateCallStatus("speaking");
        isTtsActiveRef.current = true;
        setMicrophoneMuted(false);
        if (!recognitionRef.current && isCallActiveRef.current) {
          startFreshRecognition();
        }
      },
      onFinished: () => {
        isTtsActiveRef.current = false;
        lastTtsEndedTimestampRef.current = Date.now();
        clearTtsCooldownTimer();
        ttsCooldownTimerRef.current = setTimeout(() => {
          if (!isCallActiveRef.current) return;
          manualBaselineRef.current = "";
          lastTranscribedTextRef.current = "";
          setMicrophoneMuted(false);
          updateCallStatus("listening");
          if (!recognitionRef.current) {
            startFreshRecognition();
          }
        }, ACOUSTIC_ECHO_COOLDOWN_MS);
      },
    });

    // Ensure promptRef and composer have current text synchronized before dispatch
    promptRef.current = currentText;
    onTranscriptChangeRef.current(currentText);

    // Switch call status to thinking & start ambient sound
    updateCallStatus("thinking");
    thinkingAmbientSound.start();

    // Clear transcript baselines for the next turn
    manualBaselineRef.current = "";
    lastTranscribedTextRef.current = "";

    // Auto-send prompt turn
    onAutoSendRef.current();
  }, [
    clearRestartTimer,
    clearTtsCooldownTimer,
    cleanupRecognition,
    setMicrophoneMuted,
    startFreshRecognition,
    updateCallStatus,
  ]);

  // Dedicated periodic silence heartbeat: automatically dispatches message after exactly 2000ms of silence
  useEffect(() => {
    if (!isCallActive) return;

    const interval = setInterval(() => {
      if (
        !isCallActiveRef.current ||
        isTtsActiveRef.current ||
        callStatusRef.current === "thinking" ||
        callStatusRef.current === "speaking" ||
        !hasPendingSpeechRef.current
      ) {
        return;
      }

      const elapsed = Date.now() - lastSpeechTimestampRef.current;
      if (elapsed >= SILENCE_TIMEOUT_MS) {
        const text = (promptRef.current || lastTranscribedTextRef.current || "").trim();
        if (text.length > 0) {
          hasPendingSpeechRef.current = false;
          dispatchAutoSend();
        } else {
          hasPendingSpeechRef.current = false;
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isCallActive, dispatchAutoSend]);

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

    // Detect manual typing
    if (prompt !== lastTranscribedTextRef.current) {
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

  // User-facing interrupt action (e.g. click wave visualizer or press Stop/Escape)
  const interruptSpeaking = useCallback(() => {
    if (streamingPlayerRef.current) {
      streamingPlayerRef.current.stop();
      streamingPlayerRef.current = null;
    }

    stopSpeaking();
    clearTtsCooldownTimer();
    thinkingAmbientSound.stop();

    if (canInterruptRef.current && onInterruptRef.current) {
      onInterruptRef.current();
    }

    isTtsActiveRef.current = false;
    lastTtsEndedTimestampRef.current = Date.now();
    waitingForAssistantResponseRef.current = false;
    activeAssistantMessageIdRef.current = null;
    processedTextOffsetRef.current = 0;
    isAutoSendingRef.current = false;
    hasPendingSpeechRef.current = false;
    manualBaselineRef.current = "";
    lastTranscribedTextRef.current = "";
    promptRef.current = "";
    onTranscriptChangeRef.current("");

    updateCallStatus("listening");
    setMicrophoneMuted(false);
    startFreshRecognition();
  }, [clearTtsCooldownTimer, startFreshRecognition, updateCallStatus, setMicrophoneMuted]);

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
            startFreshRecognition();
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
  }, [endCall, startFreshRecognition, updateCallStatus]);

  const toggleCall = useCallback(() => {
    if (isCallActive) {
      endCall();
    } else {
      void startCall();
    }
  }, [isCallActive, endCall, startCall]);

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
      // Phase is idle/ready: if not waiting and not speaking, stop ambient sound
      if (callStatusRef.current === "thinking" && !waitingForAssistantResponseRef.current) {
        thinkingAmbientSound.stop();
        updateCallStatus("listening");
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
    } else {
      // Find the latest assistant message that was NOT present before dispatch
      targetMessage = [...promptHistoryMessages]
        .reverse()
        .find((m) => m.role === "assistant" && !preTurnMessageIdsRef.current.has(m.id));

      if (targetMessage) {
        activeAssistantMessageIdRef.current = targetMessage.id;
        processedTextOffsetRef.current = 0;
      }
    }

    if (!targetMessage || !streamingPlayerRef.current) return;

    // 2. Extract ready-to-speak sentence chunks from the incoming stream (code blocks stripped)
    const isComplete = !targetMessage.streaming;
    const { chunks, newOffset } = extractSpeechChunks(
      targetMessage.text,
      processedTextOffsetRef.current,
      isComplete,
    );

    for (const chunk of chunks) {
      streamingPlayerRef.current.enqueue(chunk);
    }
    processedTextOffsetRef.current = newOffset;

    // 3. If stream has completed, mark stream finished on the player and reset active turn
    if (isComplete) {
      streamingPlayerRef.current.markStreamFinished();
      waitingForAssistantResponseRef.current = false;
      activeAssistantMessageIdRef.current = null;
      processedTextOffsetRef.current = 0;
    }
  }, [isCallActive, promptHistoryMessages]);

  return {
    isCallActive,
    callStatus,
    analyserNode: analyserRef.current,
    toggleCall,
    endCall,
    interruptSpeaking,
  };
}

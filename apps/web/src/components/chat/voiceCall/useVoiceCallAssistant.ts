import { useState, useRef, useEffect, useCallback } from "react";
import {
  isSpeechRecognitionSupported,
  getRecognitionLanguageCode,
  loadSttSettings,
  isMobileDevice,
} from "~/lib/speech/stt";
import { transliterateUrduToRoman } from "~/lib/speech/romanUrduTransliterate";
import {
  speakText,
  stopSpeaking,
  subscribeSpeechState,
  isCurrentlySpeaking,
} from "~/lib/speech/tts";
import { thinkingAmbientSound } from "./thinkingAmbientSound";
import { setVoiceCallActiveState } from "./voiceCallState";
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
  "stop",
  "ruk jao",
  "ruko",
  "ruk ja",
  "ruk",
  "chup",
  "chup karo",
  "chup kar",
  "chup ho jao",
  "chup raho",
  "bas",
  "bas karo",
  "pause",
  "wait",
  "hold on",
  "hold up",
  "cancel",
  "shut up",
  "quiet",
  "silence",
  "khamosh",
  "khamosh raho",
  "thehro",
  "thehr jao",
];

const SILENCE_TIMEOUT_MS = 2000;
const ACOUSTIC_ECHO_COOLDOWN_MS = 600;

function isPureInterruptCommand(text: string): boolean {
  const lower = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
  if (!lower) return false;

  for (const trigger of INTERRUPT_COMMAND_TRIGGERS) {
    const cleanTrigger = trigger
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
    if (
      lower === cleanTrigger ||
      lower === `${cleanTrigger} please` ||
      lower === `please ${cleanTrigger}` ||
      lower === `${cleanTrigger} bhai` ||
      lower === `${cleanTrigger} yaar` ||
      lower === `${cleanTrigger} sir`
    ) {
      return true;
    }
  }
  return false;
}

function stripInterruptCommand(text: string): string {
  let cleaned = text;
  for (const trigger of INTERRUPT_COMMAND_TRIGGERS) {
    const pattern = `^\\s*(?:please\\s+)?${trigger.replace(/\s+/g, "\\s+")}(?:\\s+(?:please|bhai|yaar|sir))?[,!.\\s]*`;
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
    // CRITICAL: NEVER start recognition if call is inactive, TTS is speaking, or status is speaking!
    // This physically guarantees the microphone never captures laptop speakers.
    if (
      !isCallActiveRef.current ||
      isTtsActiveRef.current ||
      callStatusRef.current === "speaking" ||
      isCurrentlySpeaking() ||
      Date.now() - lastTtsEndedTimestampRef.current < ACOUSTIC_ECHO_COOLDOWN_MS
    ) {
      return;
    }

    cleanupRecognition();
    clearRestartTimer();

    // Ensure mic hardware track is unmuted
    setMicrophoneMuted(false);

    try {
      const SpeechRecognitionClass =
        (window as unknown as { SpeechRecognition: any }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition: any }).webkitSpeechRecognition;

      if (!SpeechRecognitionClass) return;

      const recognition = new SpeechRecognitionClass();
      const sttSettings = loadSttSettings();
      recognition.lang = getRecognitionLanguageCode(sttSettings.language);
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
        // STRICT ACOUSTIC FIREWALL:
        // Drop any delayed/stale events if call is inactive, TTS is active, speakers are outputting, or during echo drain cooldown
        if (
          !isCallActiveRef.current ||
          isTtsActiveRef.current ||
          callStatusRef.current === "speaking" ||
          isCurrentlySpeaking() ||
          Date.now() - lastTtsEndedTimestampRef.current < ACOUSTIC_ECHO_COOLDOWN_MS
        ) {
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

        const lower = rawSpeech.toLowerCase();

        // 1. Check for end call triggers
        for (const trigger of END_CALL_TRIGGERS) {
          if (lower.includes(trigger)) {
            endCall();
            return;
          }
        }

        let processedSpeech = rawSpeech;
        if (sttSettings.language === "roman-urdu" || sttSettings.language === "auto") {
          processedSpeech = transliterateUrduToRoman(rawSpeech);
        }

        const currentStatus = callStatusRef.current;

        // --- Handle thinking state (AI thinking / executing in background) ---
        if (currentStatus === "thinking") {
          // If user gave a pure stop command
          if (isPureInterruptCommand(processedSpeech)) {
            thinkingAmbientSound.stop();
            if (canInterruptRef.current && onInterruptRef.current) {
              onInterruptRef.current();
            }
            waitingForAssistantResponseRef.current = false;
            updateCallStatus("listening");
            manualBaselineRef.current = "";
            lastTranscribedTextRef.current = "";
            hasPendingSpeechRef.current = false;
            return;
          }

          // User is asking a new question while AI is thinking: interrupt and switch to user
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

        // --- Handle normal listening / user-speaking state ---
        if (isPureInterruptCommand(processedSpeech)) {
          if (canInterruptRef.current && onInterruptRef.current) {
            onInterruptRef.current();
          }
          waitingForAssistantResponseRef.current = false;
          updateCallStatus("listening");
          manualBaselineRef.current = "";
          lastTranscribedTextRef.current = "";
          hasPendingSpeechRef.current = false;
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
          // Standard silence event on mobile Android
          if (
            isCallActiveRef.current &&
            !isTtsActiveRef.current &&
            callStatusRef.current !== "speaking"
          ) {
            scheduleRestartRecognition(80);
          }
        } else if (event.error === "language-not-supported" || event.error === "network") {
          if (recognition.lang !== "en-US") {
            recognition.lang = navigator.language || "en-US";
          }
          scheduleRestartRecognition(200);
        } else {
          // Non-fatal error; schedule restart ONLY if TTS is not speaking
          if (
            !isTtsActiveRef.current &&
            callStatusRef.current !== "speaking" &&
            !isCurrentlySpeaking() &&
            Date.now() - lastTtsEndedTimestampRef.current >= ACOUSTIC_ECHO_COOLDOWN_MS
          ) {
            scheduleRestartRecognition(isMobileDevice ? 100 : 250);
          }
        }
      };

      recognition.onend = () => {
        if (
          isCallActiveRef.current &&
          !isTtsActiveRef.current &&
          callStatusRef.current !== "speaking" &&
          !isCurrentlySpeaking() &&
          Date.now() - lastTtsEndedTimestampRef.current >= ACOUSTIC_ECHO_COOLDOWN_MS
        ) {
          scheduleRestartRecognition(isMobileDevice ? 60 : 100);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Failed to instantiate fresh speech recognition:", err);
      if (!isTtsActiveRef.current) {
        scheduleRestartRecognition(500);
      }
    }
  }, [cleanupRecognition, clearRestartTimer, endCall, updateCallStatus, setMicrophoneMuted]);

  const scheduleRestartRecognition = useCallback(
    (delay = 150) => {
      if (
        !isCallActiveRef.current ||
        isTtsActiveRef.current ||
        callStatusRef.current === "speaking" ||
        isCurrentlySpeaking() ||
        Date.now() - lastTtsEndedTimestampRef.current < ACOUSTIC_ECHO_COOLDOWN_MS
      ) {
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
  // Ensures microphone is physically aborted whenever ANY audio speech occurs in the app
  useEffect(() => {
    return subscribeSpeechState((isSpeaking) => {
      if (isSpeaking) {
        isTtsActiveRef.current = true;
        lastTtsEndedTimestampRef.current = Date.now();
        cleanupRecognition();
      } else {
        lastTtsEndedTimestampRef.current = Date.now();
        setTimeout(() => {
          if (!isCurrentlySpeaking()) {
            isTtsActiveRef.current = false;
            if (
              isCallActiveRef.current &&
              callStatusRef.current === "listening" &&
              !waitingForAssistantResponseRef.current
            ) {
              startFreshRecognition();
            }
          }
        }, ACOUSTIC_ECHO_COOLDOWN_MS);
      }
    });
  }, [cleanupRecognition, startFreshRecognition]);

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
      onStartSpeaking: () => {
        thinkingAmbientSound.stop();
        updateCallStatus("speaking");
        isTtsActiveRef.current = true;
        cleanupRecognition();
        setMicrophoneMuted(true);
      },
      onFinished: () => {
        isTtsActiveRef.current = false;
        lastTtsEndedTimestampRef.current = Date.now();
        clearTtsCooldownTimer();
        // Post-speech cooldown ensures room reverb and audio buffers have completely drained
        ttsCooldownTimerRef.current = setTimeout(() => {
          if (!isCallActiveRef.current) return;
          manualBaselineRef.current = "";
          lastTranscribedTextRef.current = "";
          setMicrophoneMuted(false);
          updateCallStatus("listening");
          startFreshRecognition();
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

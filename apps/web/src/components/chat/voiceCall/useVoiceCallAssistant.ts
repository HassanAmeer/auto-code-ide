import { useState, useRef, useEffect, useCallback } from "react";
import {
  isSpeechRecognitionSupported,
  getRecognitionLanguageCode,
  loadSttSettings,
} from "~/lib/speech/stt";
import { transliterateUrduToRoman } from "~/lib/speech/romanUrduTransliterate";
import { speakText, stopSpeaking, sanitizeTextForSpeech } from "~/lib/speech/tts";
import { thinkingAmbientSound } from "./thinkingAmbientSound";
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

const SILENCE_TIMEOUT_MS = 1500;

function isInterruptCommand(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return INTERRUPT_COMMAND_TRIGGERS.some((trigger) => {
    const regex = new RegExp(`\\b${trigger.replace(/\s+/g, "\\s+")}\\b`, "i");
    return regex.test(lower);
  });
}

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

function isLikelyTtsEcho(spokenText: string, ttsText: string): boolean {
  if (!ttsText || !spokenText) return false;

  const cleanSpoken = spokenText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
  const cleanTts = ttsText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
  if (!cleanSpoken || !cleanTts) return false;

  if (cleanTts.includes(cleanSpoken)) return true;

  const spokenWords = cleanSpoken.split(/\s+/).filter((w) => w.length > 1);
  if (spokenWords.length === 0) return false;

  const ttsWords = new Set(cleanTts.split(/\s+/).filter((w) => w.length > 1));
  let matchCount = 0;
  for (const word of spokenWords) {
    if (ttsWords.has(word)) matchCount++;
  }

  return matchCount / spokenWords.length >= 0.7;
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
}: UseVoiceCallAssistantOptions) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<VoiceCallStatus>("idle");

  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Store latest state in refs for stable timer/recognition callbacks
  const isCallActiveRef = useRef(false);
  const callStatusRef = useRef<VoiceCallStatus>("idle");

  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  const promptHistoryMessagesRef = useRef(promptHistoryMessages);
  promptHistoryMessagesRef.current = promptHistoryMessages;

  const onInterruptRef = useRef(onInterrupt);
  onInterruptRef.current = onInterrupt;

  const canInterruptRef = useRef(canInterrupt);
  canInterruptRef.current = canInterrupt;

  // Track speech vs manual edits to ensure manual corrections are NEVER overwritten
  const lastTranscribedTextRef = useRef<string>("");
  const manualBaselineRef = useRef<string>("");

  // Lock flag while TTS is speaking or in post-TTS echo-cooldown
  const isTtsActiveRef = useRef(false);
  const currentlySpokenAssistantTextRef = useRef<string>("");

  // Anchor to ensure previous conversation history is NEVER spoken on call startup
  const lastSpokenAssistantMessageIdRef = useRef<string | null>(null);
  // Only speak if user actually initiated a turn during the active call session
  const hasUserSentTurnInCallRef = useRef(false);

  const updateCallStatus = useCallback((next: VoiceCallStatus) => {
    callStatusRef.current = next;
    setCallStatus(next);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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
    hasUserSentTurnInCallRef.current = false;
    currentlySpokenAssistantTextRef.current = "";
    manualBaselineRef.current = "";
    lastTranscribedTextRef.current = "";
    lastSpokenAssistantMessageIdRef.current = null;

    clearSilenceTimer();
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
  }, [
    clearSilenceTimer,
    clearRestartTimer,
    clearTtsCooldownTimer,
    cleanupRecognition,
    updateCallStatus,
  ]);

  // Creates and starts a fresh SpeechRecognition instance
  const startFreshRecognition = useCallback(() => {
    if (!isCallActiveRef.current) {
      return;
    }

    cleanupRecognition();
    clearRestartTimer();

    try {
      const SpeechRecognitionClass =
        (window as unknown as { SpeechRecognition: any }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition: any }).webkitSpeechRecognition;

      if (!SpeechRecognitionClass) return;

      const recognition = new SpeechRecognitionClass();
      const sttSettings = loadSttSettings();
      recognition.lang = getRecognitionLanguageCode(sttSettings.language);
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        if (
          !isTtsActiveRef.current &&
          callStatusRef.current !== "speaking" &&
          callStatusRef.current !== "thinking"
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
          if (item.isFinal) {
            accumulatedFinal += (accumulatedFinal ? " " : "") + item[0].transcript.trim();
          } else {
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

        // --- Handle speaking state (TTS active / Barge-in) ---
        if (currentStatus === "speaking" || isTtsActiveRef.current) {
          // If this is just loudspeaker echo of the assistant's own TTS output, ignore it
          if (
            currentlySpokenAssistantTextRef.current &&
            isLikelyTtsEcho(processedSpeech, currentlySpokenAssistantTextRef.current) &&
            !isInterruptCommand(processedSpeech)
          ) {
            return;
          }

          // User spoke while assistant was speaking: Barge-in / Interrupt!
          stopSpeaking();
          clearTtsCooldownTimer();
          isTtsActiveRef.current = false;
          currentlySpokenAssistantTextRef.current = "";

          // Stop running background agent if applicable
          if (canInterruptRef.current && onInterruptRef.current) {
            onInterruptRef.current();
          }

          // If user gave a pure stop command ("stop", "ruk jao", "chup karo")
          if (isPureInterruptCommand(processedSpeech)) {
            updateCallStatus("listening");
            manualBaselineRef.current = "";
            lastTranscribedTextRef.current = "";
            clearSilenceTimer();
            return;
          }

          // User asked something or gave new query (strip leading stop word if present)
          const newText = stripInterruptCommand(processedSpeech) || processedSpeech;
          lastTranscribedTextRef.current = newText;
          updateCallStatus("user-speaking");
          onTranscriptChange(newText);
          resetSilenceTimer();
          return;
        }

        // --- Handle thinking state (AI thinking / executing in background) ---
        if (currentStatus === "thinking") {
          // If user gave a pure stop command
          if (isPureInterruptCommand(processedSpeech)) {
            thinkingAmbientSound.stop();
            if (canInterruptRef.current && onInterruptRef.current) {
              onInterruptRef.current();
            }
            updateCallStatus("listening");
            manualBaselineRef.current = "";
            lastTranscribedTextRef.current = "";
            clearSilenceTimer();
            return;
          }

          // User is asking a new question while AI is thinking: interrupt and switch to user
          thinkingAmbientSound.stop();
          if (canInterruptRef.current && onInterruptRef.current) {
            onInterruptRef.current();
          }

          const newText = stripInterruptCommand(processedSpeech) || processedSpeech;
          lastTranscribedTextRef.current = newText;
          updateCallStatus("user-speaking");
          onTranscriptChange(newText);
          resetSilenceTimer();
          return;
        }

        // --- Handle normal listening / user-speaking state ---
        if (isPureInterruptCommand(processedSpeech)) {
          if (canInterruptRef.current && onInterruptRef.current) {
            onInterruptRef.current();
          }
          updateCallStatus("listening");
          manualBaselineRef.current = "";
          lastTranscribedTextRef.current = "";
          clearSilenceTimer();
          return;
        }

        const stripped = stripInterruptCommand(processedSpeech);
        const speechToUse = stripped.length > 0 ? stripped : processedSpeech;

        const combinedText = manualBaselineRef.current
          ? (manualBaselineRef.current + " " + speechToUse).trim()
          : speechToUse.trim();

        if (combinedText) {
          lastTranscribedTextRef.current = combinedText;
          updateCallStatus("user-speaking");
          onTranscriptChange(combinedText);
          resetSilenceTimer();
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          endCall();
        } else {
          // Non-fatal ("no-speech", "network", etc.); keep continuous listening alive
          scheduleRestartRecognition(250);
        }
      };

      recognition.onend = () => {
        if (isCallActiveRef.current) {
          scheduleRestartRecognition(100);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Failed to instantiate fresh speech recognition:", err);
      scheduleRestartRecognition(500);
    }
  }, [
    cleanupRecognition,
    clearRestartTimer,
    endCall,
    onTranscriptChange,
    updateCallStatus,
    clearSilenceTimer,
  ]);

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

  const dispatchAutoSend = useCallback(() => {
    clearSilenceTimer();

    const currentText = promptRef.current.trim();
    if (!currentText) {
      if (isCallActiveRef.current && callStatusRef.current !== "speaking") {
        updateCallStatus("listening");
      }
      return;
    }

    // Mark that user has sent a turn in this call session
    hasUserSentTurnInCallRef.current = true;

    // Switch call status to thinking & start ambient sound
    updateCallStatus("thinking");
    thinkingAmbientSound.start();

    // Clear transcript baselines for the next turn
    manualBaselineRef.current = "";
    lastTranscribedTextRef.current = "";

    // Auto-send prompt turn
    onAutoSend();
  }, [clearSilenceTimer, onAutoSend, updateCallStatus]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (
        isCallActiveRef.current &&
        !isTtsActiveRef.current &&
        callStatusRef.current !== "thinking" &&
        callStatusRef.current !== "speaking"
      ) {
        dispatchAutoSend();
      }
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer, dispatchAutoSend]);

  // Handle external/manual edits in the input box:
  useEffect(() => {
    promptRef.current = prompt;

    // Detect manual edit: prompt changed, but not through our onTranscriptChange callback
    if (prompt !== lastTranscribedTextRef.current) {
      manualBaselineRef.current = prompt;
      lastTranscribedTextRef.current = prompt;

      if (
        isCallActiveRef.current &&
        !isTtsActiveRef.current &&
        callStatusRef.current !== "thinking" &&
        callStatusRef.current !== "speaking"
      ) {
        startFreshRecognition();
      }

      if (prompt.trim().length > 0) {
        resetSilenceTimer();
      } else {
        clearSilenceTimer();
      }
    }
  }, [prompt, startFreshRecognition, resetSilenceTimer, clearSilenceTimer]);

  const startCall = useCallback(async () => {
    if (!isSpeechRecognitionSupported()) {
      alert(
        "Speech recognition is not supported in this browser. Please use Google Chrome or Edge.",
      );
      return;
    }

    try {
      // 1. Immediately anchor previous history messages BEFORE any React re-render
      // This strictly guarantees that old completed responses are NEVER spoken on call start!
      const existingLatestAssistant = promptHistoryMessagesRef.current
        ? [...promptHistoryMessagesRef.current]
            .reverse()
            .find((m) => m.role === "assistant" && m.text.trim().length > 0 && !m.streaming)
        : null;
      lastSpokenAssistantMessageIdRef.current =
        existingLatestAssistant?.id ?? "__call_start_anchor__";

      hasUserSentTurnInCallRef.current = false;
      isCallActiveRef.current = true;
      isTtsActiveRef.current = false;
      currentlySpokenAssistantTextRef.current = "";
      manualBaselineRef.current = promptRef.current;
      lastTranscribedTextRef.current = promptRef.current;

      updateCallStatus("listening");
      setIsCallActive(true);

      // 2. Request microphone access with full acoustic echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        },
      });
      micStreamRef.current = stream;

      // 3. Setup Web Audio AnalyserNode
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

      // 4. Audio volume monitoring for reactive speech state and VAD
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      levelCheckIntervalRef.current = setInterval(() => {
        if (!isCallActiveRef.current || !analyserRef.current) return;

        // If assistant is actively speaking or thinking, don't trigger volume state flips
        if (
          isTtsActiveRef.current ||
          callStatusRef.current === "speaking" ||
          callStatusRef.current === "thinking"
        ) {
          return;
        }

        analyserRef.current.getByteFrequencyData(freqData);

        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i] ?? 0;
        }
        const avg = sum / (freqData.length || 1);

        // User speaking vs silence state detection
        if (callStatusRef.current === "listening" && avg > 14) {
          clearSilenceTimer();
          updateCallStatus("user-speaking");
        } else if (callStatusRef.current === "user-speaking" && avg <= 10) {
          // User paused speaking: switch to listening and start the 1.5-second silence timer
          updateCallStatus("listening");
          if (promptRef.current.trim().length > 0) {
            resetSilenceTimer();
          }
        }
      }, 100);

      // 5. Start fresh speech recognition instance
      startFreshRecognition();
    } catch (err) {
      console.error("Failed to start voice call assistant:", err);
      endCall();
    }
  }, [endCall, startFreshRecognition, updateCallStatus, clearSilenceTimer, resetSilenceTimer]);

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
      thinkingAmbientSound.stop();
      if (callStatusRef.current === "thinking") {
        updateCallStatus("listening");
      }
    }
  }, [isCallActive, phase, updateCallStatus]);

  // Speak assistant messages aloud during active call
  useEffect(() => {
    if (!isCallActive || !promptHistoryMessages || promptHistoryMessages.length === 0) return;

    // Find the latest completed assistant message
    const latestAssistantMessage = [...promptHistoryMessages]
      .reverse()
      .find((m) => m.role === "assistant" && m.text.trim().length > 0 && !m.streaming);

    if (!latestAssistantMessage) return;

    // ONLY speak if user has sent a turn in this call AND this message hasn't been spoken yet
    if (
      hasUserSentTurnInCallRef.current &&
      latestAssistantMessage.id !== lastSpokenAssistantMessageIdRef.current
    ) {
      lastSpokenAssistantMessageIdRef.current = latestAssistantMessage.id;
      currentlySpokenAssistantTextRef.current = sanitizeTextForSpeech(latestAssistantMessage.text);

      // Stop ambient thinking sound immediately
      thinkingAmbientSound.stop();

      // Switch status to assistant speaking
      updateCallStatus("speaking");
      isTtsActiveRef.current = true;

      let hasFinished = false;
      const onFinished = () => {
        if (hasFinished) return;
        hasFinished = true;

        clearTtsCooldownTimer();
        ttsCooldownTimerRef.current = setTimeout(() => {
          if (!isCallActiveRef.current) return;

          isTtsActiveRef.current = false;
          currentlySpokenAssistantTextRef.current = "";
          manualBaselineRef.current = "";
          lastTranscribedTextRef.current = "";

          updateCallStatus("listening");
          startFreshRecognition();
        }, 200);
      };

      // Speak response aloud via TTS using user-configured voice & accent
      speakText(latestAssistantMessage.text, undefined, onFinished);

      // Safety fallback timeout in case browser drops onend
      const fallbackTimeoutMs = Math.max(5000, latestAssistantMessage.text.length * 150);
      setTimeout(() => {
        if (!hasFinished && isCallActiveRef.current && callStatusRef.current === "speaking") {
          onFinished();
        }
      }, fallbackTimeoutMs);
    } else if (!hasUserSentTurnInCallRef.current) {
      // Keep anchored to latest message so old history is never spoken on call start
      lastSpokenAssistantMessageIdRef.current = latestAssistantMessage.id;
    }
  }, [
    isCallActive,
    promptHistoryMessages,
    startFreshRecognition,
    clearTtsCooldownTimer,
    updateCallStatus,
  ]);

  return {
    isCallActive,
    callStatus,
    analyserNode: analyserRef.current,
    toggleCall,
    endCall,
  };
}

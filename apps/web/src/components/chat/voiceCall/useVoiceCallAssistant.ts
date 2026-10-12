import { useState, useRef, useEffect, useCallback } from "react";
import {
  isSpeechRecognitionSupported,
  getRecognitionLanguageCode,
  loadSttSettings,
} from "~/lib/speech/stt";
import { transliterateUrduToRoman } from "~/lib/speech/romanUrduTransliterate";
import { speakText, stopSpeaking } from "~/lib/speech/tts";
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

export interface UseVoiceCallAssistantOptions {
  onTranscriptChange: (text: string) => void;
  onAutoSend: () => void;
  prompt: string;
  phase: SessionPhase;
  promptHistoryMessages?: ReadonlyArray<ChatMessage>;
  disabled?: boolean;
}

export function useVoiceCallAssistant({
  onTranscriptChange,
  onAutoSend,
  prompt,
  phase,
  promptHistoryMessages,
  disabled = false,
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
  callStatusRef.current = callStatus;

  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  const promptHistoryMessagesRef = useRef(promptHistoryMessages);
  promptHistoryMessagesRef.current = promptHistoryMessages;

  // Track speech vs manual edits to ensure manual corrections are NEVER overwritten
  const lastTranscribedTextRef = useRef<string>("");
  const manualBaselineRef = useRef<string>("");

  // Lock flag while TTS is speaking or in post-TTS echo-cooldown
  const isTtsActiveRef = useRef(false);

  const lastSpokenAssistantMessageIdRef = useRef<string | null>(null);

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

    setIsCallActive(false);
    setCallStatus("idle");
  }, [clearSilenceTimer, clearRestartTimer, clearTtsCooldownTimer, cleanupRecognition]);

  // Creates and starts a fresh SpeechRecognition instance
  // In Blink/WebKit, reusing an aborted SpeechRecognition object can fail or throw InvalidStateError.
  // Creating a new instance on every restart guarantees continuous and glitch-free listening.
  const startFreshRecognition = useCallback(() => {
    if (
      !isCallActiveRef.current ||
      isTtsActiveRef.current ||
      callStatusRef.current === "thinking" ||
      callStatusRef.current === "speaking"
    ) {
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
          setCallStatus("listening");
        }
      };

      recognition.onresult = (event: any) => {
        if (
          !isCallActiveRef.current ||
          isTtsActiveRef.current ||
          callStatusRef.current === "speaking" ||
          callStatusRef.current === "thinking"
        ) {
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

        const combinedText = manualBaselineRef.current
          ? (manualBaselineRef.current + " " + processedSpeech).trim()
          : processedSpeech.trim();

        if (combinedText) {
          lastTranscribedTextRef.current = combinedText;
          setCallStatus("user-speaking");
          onTranscriptChange(combinedText);
          resetSilenceTimer();
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition event in call:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          endCall();
        } else {
          // "no-speech", "audio-capture", "network" are non-fatal; schedule a restart
          scheduleRestartRecognition();
        }
      };

      recognition.onend = () => {
        if (
          isCallActiveRef.current &&
          !isTtsActiveRef.current &&
          callStatusRef.current !== "thinking" &&
          callStatusRef.current !== "speaking"
        ) {
          scheduleRestartRecognition();
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Failed to instantiate fresh speech recognition:", err);
      scheduleRestartRecognition(600);
    }
  }, [cleanupRecognition, clearRestartTimer, endCall, onTranscriptChange]);

  const scheduleRestartRecognition = useCallback(
    (delay = 200) => {
      if (
        !isCallActiveRef.current ||
        isTtsActiveRef.current ||
        callStatusRef.current === "thinking" ||
        callStatusRef.current === "speaking"
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

  const dispatchAutoSend = useCallback(() => {
    clearSilenceTimer();

    const currentText = promptRef.current.trim();
    if (!currentText) {
      if (isCallActiveRef.current && callStatusRef.current !== "speaking") {
        setCallStatus("listening");
      }
      return;
    }

    // Stop speech recognition while thinking/sending
    cleanupRecognition();

    // Switch call status to thinking & start ambient sound
    setCallStatus("thinking");
    thinkingAmbientSound.start();

    // Clear transcript baselines for the next turn
    manualBaselineRef.current = "";
    lastTranscribedTextRef.current = "";

    // Auto-send prompt turn
    onAutoSend();
  }, [clearSilenceTimer, cleanupRecognition, onAutoSend]);

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
    }, 2000);
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
      isCallActiveRef.current = true;
      isTtsActiveRef.current = false;
      manualBaselineRef.current = promptRef.current;
      lastTranscribedTextRef.current = promptRef.current;

      setIsCallActive(true);
      setCallStatus("listening");

      // 1. Request microphone access with full acoustic echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        },
      });
      micStreamRef.current = stream;

      // 2. Setup Web Audio AnalyserNode
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

      // 3. Audio volume monitoring for reactive speech state and VAD
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      levelCheckIntervalRef.current = setInterval(() => {
        if (!isCallActiveRef.current || !analyserRef.current) return;

        // If assistant is actively speaking through TTS or in echo cooldown, ignore mic levels completely
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
          setCallStatus("user-speaking");
        } else if (callStatusRef.current === "user-speaking" && avg <= 10) {
          // User paused speaking: switch to listening and start the 2-second silence timer
          setCallStatus("listening");
          if (promptRef.current.trim().length > 0) {
            resetSilenceTimer();
          }
        }
      }, 100);

      // 4. Anchor previous chat messages so old history is NEVER spoken on call start!
      const existingLatestAssistant = promptHistoryMessagesRef.current
        ? [...promptHistoryMessagesRef.current]
            .reverse()
            .find((m) => m.role === "assistant" && m.text.trim().length > 0 && !m.streaming)
        : null;
      lastSpokenAssistantMessageIdRef.current =
        existingLatestAssistant?.id ?? "__call_start_anchor__";

      // 5. Start fresh speech recognition instance
      startFreshRecognition();
    } catch (err) {
      console.error("Failed to start voice call assistant:", err);
      endCall();
    }
  }, [endCall, startFreshRecognition]);

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
      cleanupRecognition();
      if (callStatusRef.current !== "thinking") {
        setCallStatus("thinking");
        thinkingAmbientSound.start();
      }
    }
  }, [isCallActive, phase, cleanupRecognition]);

  // Speak assistant messages aloud during active call
  useEffect(() => {
    if (!isCallActive || !promptHistoryMessages || promptHistoryMessages.length === 0) return;

    // Find the latest completed assistant message
    const latestAssistantMessage = [...promptHistoryMessages]
      .reverse()
      .find((m) => m.role === "assistant" && m.text.trim().length > 0 && !m.streaming);

    if (!latestAssistantMessage) return;

    // Only speak new assistant messages that arrived AFTER the call started
    if (latestAssistantMessage.id !== lastSpokenAssistantMessageIdRef.current) {
      lastSpokenAssistantMessageIdRef.current = latestAssistantMessage.id;

      // Lock TTS active flag to completely block microphone feedback
      isTtsActiveRef.current = true;

      // Stop ambient thinking sound immediately
      thinkingAmbientSound.stop();

      // Completely stop recognition so it CANNOT pick up loudspeaker sound!
      cleanupRecognition();

      // Switch status to assistant speaking
      setCallStatus("speaking");

      let hasFinished = false;
      const onFinished = () => {
        if (hasFinished) return;
        hasFinished = true;

        clearTtsCooldownTimer();
        ttsCooldownTimerRef.current = setTimeout(() => {
          if (!isCallActiveRef.current) return;

          isTtsActiveRef.current = false;
          manualBaselineRef.current = "";
          lastTranscribedTextRef.current = "";

          setCallStatus("listening");
          startFreshRecognition();
        }, 700);
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
    }
  }, [
    isCallActive,
    promptHistoryMessages,
    startFreshRecognition,
    cleanupRecognition,
    clearTtsCooldownTimer,
  ]);

  return {
    isCallActive,
    callStatus,
    analyserNode: analyserRef.current,
    toggleCall,
    endCall,
  };
}

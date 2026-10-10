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
  const levelCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Store latest state in refs for stable timer/recognition callbacks
  const isCallActiveRef = useRef(isCallActive);
  isCallActiveRef.current = isCallActive;

  const callStatusRef = useRef(callStatus);
  callStatusRef.current = callStatus;

  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  const lastSpokenAssistantMessageIdRef = useRef<string | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const endCall = useCallback(() => {
    clearSilenceTimer();

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

    // Stop speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    // Stop thinking ambient sound
    thinkingAmbientSound.stop();

    // Silence any ongoing TTS audio
    stopSpeaking();

    setIsCallActive(false);
    setCallStatus("idle");
  }, [clearSilenceTimer]);

  const dispatchAutoSend = useCallback(() => {
    clearSilenceTimer();

    const currentText = promptRef.current.trim();
    if (!currentText) {
      setCallStatus("listening");
      return;
    }

    // Switch call status to thinking & start delay wave sound
    setCallStatus("thinking");
    thinkingAmbientSound.start();

    // Auto-send prompt turn
    onAutoSend();
  }, [clearSilenceTimer, onAutoSend]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (isCallActiveRef.current && callStatusRef.current !== "thinking") {
        dispatchAutoSend();
      }
    }, 2000);
  }, [clearSilenceTimer, dispatchAutoSend]);

  const startCall = useCallback(async () => {
    if (!isSpeechRecognitionSupported()) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    try {
      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

      // 3. Audio volume monitoring for reactive speech state
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      levelCheckIntervalRef.current = setInterval(() => {
        if (!isCallActiveRef.current || !analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(freqData);

        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i] ?? 0;
        }
        const avg = sum / (freqData.length || 1);

        // If audio level exceeds speaking threshold while listening/user-speaking
        if (callStatusRef.current === "listening" && avg > 14) {
          // Interrupt any leftover speech if user started talking
          stopSpeaking();
          setCallStatus("user-speaking");
        } else if (callStatusRef.current === "user-speaking" && avg <= 10) {
          setCallStatus("listening");
        }
      }, 100);

      // 4. Initialize Speech Recognition
      const SpeechRecognitionClass =
        (window as unknown as { SpeechRecognition: any }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition: any }).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();

      const sttSettings = loadSttSettings();
      recognition.lang = getRecognitionLanguageCode(sttSettings.language);
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setCallStatus("listening");
      };

      recognition.onresult = (event: any) => {
        if (!isCallActiveRef.current) return;

        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        const rawText = (finalTranscript || interimTranscript).trim();
        const lower = rawText.toLowerCase();

        // Check voice triggers to end call
        for (const trigger of END_CALL_TRIGGERS) {
          if (lower.includes(trigger)) {
            endCall();
            return;
          }
        }

        // Process transcript (Urdu to Roman Urdu if configured)
        const processed =
          sttSettings.language === "roman-urdu" ? transliterateUrduToRoman(rawText) : rawText;

        if (processed) {
          // If assistant was speaking, interrupt immediately
          if (callStatusRef.current === "speaking") {
            stopSpeaking();
          }

          setCallStatus("user-speaking");
          onTranscriptChange(processed);

          // Reset the 2-second silence auto-send timer
          resetSilenceTimer();
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error in call:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          endCall();
        }
      };

      recognition.onend = () => {
        // Automatically restart recognition while call is active
        if (isCallActiveRef.current) {
          try {
            recognition.start();
          } catch {
            // ignore if already starting
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

      setIsCallActive(true);
      setCallStatus("listening");
    } catch (err) {
      console.error("Failed to start voice call assistant:", err);
      endCall();
    }
  }, [endCall, onTranscriptChange, resetSilenceTimer]);

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

  // Monitor phase and messages during active call
  useEffect(() => {
    if (!isCallActive) return;

    // When turn starts running, ensure thinking delay sound stops if still playing
    if (phase === "running") {
      // thinking sound will stop as soon as assistant response begins
    }
  }, [isCallActive, phase]);

  // Speak assistant messages aloud during active call
  useEffect(() => {
    if (!isCallActive || !promptHistoryMessages || promptHistoryMessages.length === 0) return;

    const lastMessage = promptHistoryMessages[promptHistoryMessages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;

    // If message is new and has non-empty text
    if (
      lastMessage.id !== lastSpokenAssistantMessageIdRef.current &&
      lastMessage.text.trim().length > 0 &&
      !lastMessage.streaming
    ) {
      lastSpokenAssistantMessageIdRef.current = lastMessage.id;

      // Stop ambient delay wave sound immediately
      thinkingAmbientSound.stop();

      // Switch status to assistant speaking
      setCallStatus("speaking");

      // Speak response aloud via TTS
      speakText(lastMessage.text, undefined, () => {
        // Revert smoothly back to Sakin / listening state once speech completes
        if (isCallActiveRef.current) {
          setCallStatus("listening");
        }
      });
    }
  }, [isCallActive, promptHistoryMessages]);

  return {
    isCallActive,
    callStatus,
    analyserNode: analyserRef.current,
    toggleCall,
    endCall,
  };
}

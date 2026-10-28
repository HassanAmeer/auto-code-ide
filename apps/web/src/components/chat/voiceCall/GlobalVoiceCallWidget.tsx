import { memo, useCallback, useState, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { useProjects } from "~/state/entities";
import { VoiceCallFloatingWidget } from "./VoiceCallFloatingWidget";
import { useVoiceCallAssistant } from "./useVoiceCallAssistant";
import { executeSuperAgentInstruction } from "./superAgentEngine";
import { speakText } from "~/lib/speech/tts";

/**
 * Inner component that mounts the voice call assistant hook & floating widget.
 * Rendered conditionally to guarantee zero background speech listeners or interference
 * when the user is navigating on the dedicated /call-assistant or /bot page.
 */
const GlobalVoiceCallWidgetInner = memo(function GlobalVoiceCallWidgetInner() {
  const projects = useProjects();
  const [spokenText, setSpokenText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const spokenTextRef = useRef("");
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const handleTranscriptChange = useCallback((text: string) => {
    spokenTextRef.current = text;
    setSpokenText(text);
  }, []);

  const handleInterrupt = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    setIsProcessing(false);
    stopSpeaking();
  }, []);

  const handleAutoSend = useCallback(async () => {
    const text = spokenTextRef.current.trim();
    if (!text || isProcessing) return;

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    setIsProcessing(true);
    spokenTextRef.current = "";
    setSpokenText("");

    const activeProjId = projects[0]?.id ? String(projects[0].id) : undefined;
    const selectedModel = localStorage.getItem("super_call_assistant_model") || "Gemini 2.5 Flash";

    try {
      const res = await executeSuperAgentInstruction({
        userText: text,
        projects,
        activeProjectId: activeProjId,
        selectedModel,
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        speakText(res.spokenReply);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError" && !controller.signal.aborted) {
        console.error("Global voice assistant error:", err);
      }
    } finally {
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
        setIsProcessing(false);
      }
    }
  }, [isProcessing, projects]);

  const {
    isCallActive,
    callStatus,
    analyserNode,
    toggleCall: toggleVoiceCall,
    interruptSpeaking,
    callLanguage,
    setCallLanguage,
    liveTranscript,
    assistantSpokenText,
    isMicMuted,
    toggleMicMute,
  } = useVoiceCallAssistant({
    onTranscriptChange: handleTranscriptChange,
    onAutoSend: handleAutoSend,
    onInterrupt: handleInterrupt,
    canInterrupt: true,
    prompt: spokenText,
    phase: isProcessing ? "running" : "ready",
    disabled: false,
  });

  return (
    <VoiceCallFloatingWidget
      isCallActive={isCallActive}
      callStatus={callStatus}
      analyserNode={analyserNode}
      onToggleCall={toggleVoiceCall}
      onInterrupt={interruptSpeaking}
      callLanguage={callLanguage}
      onSwitchLanguage={setCallLanguage}
      liveTranscript={liveTranscript}
      assistantSpokenText={assistantSpokenText}
      isMicMuted={isMicMuted}
      onToggleMicMute={toggleMicMute}
    />
  );
});

/**
 * Global Voice Call Assistant Widget
 * Floats across the Auto Code IDE on regular workspace pages.
 * On the dedicated `/call-assistant` or `/bot` page, it completely unmounts and yields
 * so that view renders its own full layout without any parallel speech recognition listeners.
 */
export const GlobalVoiceCallWidget = memo(function GlobalVoiceCallWidget() {
  const location = useLocation();

  const isCallAssistantPage =
    location.pathname.startsWith("/bot") || location.pathname.startsWith("/call-assistant");

  // If user is already on the dedicated /call-assistant screen or /bot, completely yield
  // and do NOT mount any speech recognition listeners, hooks, or floating widgets.
  if (isCallAssistantPage) {
    return null;
  }

  return <GlobalVoiceCallWidgetInner />;
});

import { memo, useCallback, useState, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { useProjects } from "~/state/entities";
import { VoiceCallFloatingWidget } from "./VoiceCallFloatingWidget";
import { useVoiceCallAssistant } from "./useVoiceCallAssistant";
import { executeSuperAgentInstruction } from "./superAgentEngine";
import { speakText } from "~/lib/speech/tts";

/**
 * Global Voice Call Assistant Widget
 * Floats permanently across the entire Auto Code IDE (on all routes, including /).
 * On the dedicated `/call-assistant` page, it yields so that view renders its own full layout.
 */
export const GlobalVoiceCallWidget = memo(function GlobalVoiceCallWidget() {
  const location = useLocation();
  const projects = useProjects();
  const [spokenText, setSpokenText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const spokenTextRef = useRef("");

  const isCallAssistantPage = location.pathname.startsWith("/call-assistant");

  const handleTranscriptChange = useCallback((text: string) => {
    spokenTextRef.current = text;
    setSpokenText(text);
  }, []);

  const handleAutoSend = useCallback(async () => {
    const text = spokenTextRef.current.trim();
    if (!text || isProcessing) return;

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
      });

      speakText(res.spokenReply);
    } catch (err) {
      console.error("Global voice assistant error:", err);
    } finally {
      setIsProcessing(false);
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
    prompt: spokenText,
    phase: isProcessing ? "running" : "ready",
  });

  // If user is already on the dedicated /call-assistant screen, that page renders its own focused layout
  if (isCallAssistantPage) {
    return null;
  }

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

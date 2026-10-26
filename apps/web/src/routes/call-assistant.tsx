import { createFileRoute } from "@tanstack/react-router";
import { SuperCallAssistantView } from "../components/chat/voiceCall/SuperCallAssistantView";

export const Route = createFileRoute("/call-assistant")({
  component: SuperCallAssistantView,
});

import { createFileRoute } from "@tanstack/react-router";
import { TtsSettingsPanel } from "../components/settings/TtsSettingsPanel";

function SettingsTtsRoute() {
  return <TtsSettingsPanel />;
}

export const Route = createFileRoute("/settings/tts")({
  component: SettingsTtsRoute,
});

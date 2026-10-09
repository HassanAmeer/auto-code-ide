import { createFileRoute } from "@tanstack/react-router";
import { SttTtsSettingsPanel } from "../components/settings/SttTtsSettingsPanel";

function SettingsTtsRoute() {
  return <SttTtsSettingsPanel />;
}

export const Route = createFileRoute("/settings/tts")({
  component: SettingsTtsRoute,
});

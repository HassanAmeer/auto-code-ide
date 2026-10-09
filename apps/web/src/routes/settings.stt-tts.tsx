import { createFileRoute } from "@tanstack/react-router";
import { SttTtsSettingsPanel } from "../components/settings/SttTtsSettingsPanel";

function SettingsSttTtsRoute() {
  return <SttTtsSettingsPanel />;
}

export const Route = createFileRoute("/settings/stt-tts")({
  component: SettingsSttTtsRoute,
});

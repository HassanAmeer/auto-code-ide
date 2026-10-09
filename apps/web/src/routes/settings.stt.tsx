import { createFileRoute } from "@tanstack/react-router";
import { SttTtsSettingsPanel } from "../components/settings/SttTtsSettingsPanel";

function SettingsSttRoute() {
  return <SttTtsSettingsPanel />;
}

export const Route = createFileRoute("/settings/stt")({
  component: SettingsSttRoute,
});

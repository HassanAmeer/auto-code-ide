import { createFileRoute } from "@tanstack/react-router";
import { SttSettingsPanel } from "../components/settings/SttSettingsPanel";

function SettingsSttRoute() {
  return <SttSettingsPanel />;
}

export const Route = createFileRoute("/settings/stt")({
  component: SettingsSttRoute,
});

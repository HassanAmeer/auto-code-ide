import { createFileRoute } from "@tanstack/react-router";
import { SoundSettingsPanel } from "../components/settings/SoundSettingsPanel";

function SettingsSoundRoute() {
  return <SoundSettingsPanel />;
}

export const Route = createFileRoute("/settings/sound")({
  component: SettingsSoundRoute,
});

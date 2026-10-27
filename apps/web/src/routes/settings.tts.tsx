import { createFileRoute } from "@tanstack/react-router";
import { SttTtsSettingsPanel } from "../components/settings/SttTtsSettingsPanel";

function SettingsTtsRoute() {
  return <SttTtsSettingsPanel />;
}

function SettingsTtsError({ error }: { error: unknown }) {
  console.error("TTS settings route error:", error);
  return (
    <div className="p-6 text-sm text-destructive">
      Failed to load Speech settings: {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export const Route = createFileRoute("/settings/tts")({
  component: SettingsTtsRoute,
  errorComponent: SettingsTtsError,
});

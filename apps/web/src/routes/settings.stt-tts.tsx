import { createFileRoute } from "@tanstack/react-router";
import { SttTtsSettingsPanel } from "../components/settings/SttTtsSettingsPanel";

function SettingsSttTtsRoute() {
  return <SttTtsSettingsPanel />;
}

function SettingsSttTtsError({ error }: { error: unknown }) {
  console.error("STT/TTS settings route error:", error);
  return (
    <div className="p-6 text-sm text-destructive">
      Failed to load Speech settings: {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export const Route = createFileRoute("/settings/stt-tts")({
  component: SettingsSttTtsRoute,
  errorComponent: SettingsSttTtsError,
});

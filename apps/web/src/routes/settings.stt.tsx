import { createFileRoute } from "@tanstack/react-router";
import { SttTtsSettingsPanel } from "../components/settings/SttTtsSettingsPanel";

function SettingsSttRoute() {
  return <SttTtsSettingsPanel />;
}

function SettingsSttError({ error }: { error: unknown }) {
  console.error("STT settings route error:", error);
  return (
    <div className="p-6 text-sm text-destructive">
      Failed to load Speech settings: {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export const Route = createFileRoute("/settings/stt")({
  component: SettingsSttRoute,
  errorComponent: SettingsSttError,
});

import { createFileRoute } from "@tanstack/react-router";
import { CustomProvidersSettingsPanel } from "../components/settings/CustomProvidersSettingsPanel";

function SettingsCustomProvidersRoute() {
  return <CustomProvidersSettingsPanel />;
}

export const Route = createFileRoute("/settings/custom-providers")({
  component: SettingsCustomProvidersRoute,
});

import { createFileRoute } from "@tanstack/react-router";
import { IpRotationSettingsPage } from "../components/settings/IpRotationSettingsPage";

function SettingsIpRotationRoute() {
  return <IpRotationSettingsPage />;
}

export const Route = createFileRoute("/settings/ip-rotation")({
  component: SettingsIpRotationRoute,
});

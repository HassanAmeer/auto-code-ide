import { createFileRoute } from "@tanstack/react-router";
import { NotificationSettingsPanel } from "../components/settings/NotificationSettingsPanel";

function SettingsNotificationsRoute() {
  return <NotificationSettingsPanel />;
}

export const Route = createFileRoute("/settings/notifications")({
  component: SettingsNotificationsRoute,
});

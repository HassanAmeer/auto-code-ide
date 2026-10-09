import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/connections")({
  component: () => <Navigate to="/settings/general" />,
});

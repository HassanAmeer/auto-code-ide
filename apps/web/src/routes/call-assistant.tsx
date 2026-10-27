import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/call-assistant")({
  beforeLoad: () => {
    throw redirect({ to: "/bot" });
  },
});

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pair")({
  beforeLoad: async () => {
    throw redirect({ to: "/", replace: true });
  },
  component: () => null,
});

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { terminalStore } from "../components/chat/terminal";

function AiTerminalRouteHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    terminalStore.setScopeMode("root");
    terminalStore.setActiveCwd("/");
    terminalStore.setQuickBarOpen(true);
    void navigate({ to: "/" });
  }, [navigate]);
  return null;
}

export const Route = createFileRoute("/ai-terminal")({
  component: AiTerminalRouteHandler,
});

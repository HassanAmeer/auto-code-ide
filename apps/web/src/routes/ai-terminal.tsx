import { createFileRoute } from "@tanstack/react-router";

import { AiTerminalPage } from "../components/terminal/AiTerminalPage";

export const Route = createFileRoute("/ai-terminal")({
  component: AiTerminalPage,
});

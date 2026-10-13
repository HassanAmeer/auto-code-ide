import { createFileRoute } from "@tanstack/react-router";
import { BrowserSettingsPanel } from "../components/settings/BrowserSettings";

export const Route = createFileRoute("/settings/browser")({ component: BrowserSettingsPanel });

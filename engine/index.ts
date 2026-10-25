/**
 * AutoCode Unified Engine Registry
 * Exposes:
 * 1. OpenCode Full Engine (Original OpenCode standalone runtime)
 * 2. OpenCode Adapter (External CLI bridge for optional remote/local CLI)
 * 3. External ACP Adapter (Claude / Cursor CLI bridge)
 */

export * from "./adapters/opencode-adapter";
export * from "./adapters/external-acp-adapter";

export type SupportedEngineType =
  | "opencode-full-engine"
  | "opencode-adapter"
  | "external-acp-adapter";

export interface EngineDescriptor {
  readonly id: SupportedEngineType;
  readonly name: string;
  readonly description: string;
  readonly isStandalone: boolean;
  readonly memoryFootprint: string;
}

export const AVAILABLE_ENGINES: Record<SupportedEngineType, EngineDescriptor> = {
  "opencode-full-engine": {
    id: "opencode-full-engine",
    name: "OpenCode Full Engine",
    description:
      "Official OpenCode full agent engine. Includes tool execution, file editing, diffs, and session memory. Zero external CLI needed.",
    isStandalone: true,
    memoryFootprint: "~45MB - 60MB RAM",
  },
  "opencode-adapter": {
    id: "opencode-adapter",
    name: "OpenCode CLI Adapter",
    description: "Connects to an external local/remote OpenCode CLI process.",
    isStandalone: false,
    memoryFootprint: "Varies (depends on external CLI)",
  },
  "external-acp-adapter": {
    id: "external-acp-adapter",
    name: "External ACP Adapter",
    description: "Agent Client Protocol bridge for third-party Claude Code / Cursor CLIs.",
    isStandalone: false,
    memoryFootprint: "Varies",
  },
};

export function getAvailableEngines(): EngineDescriptor[] {
  return Object.values(AVAILABLE_ENGINES);
}

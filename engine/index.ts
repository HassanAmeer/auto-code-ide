/**
 * AutoCode Unified Engine Registry
 * Exposes:
 * 1. OpenCode Full Engine (Original OpenCode standalone runtime)
 * 2. OpenCode Adapter (External OpenCode CLI bridge)
 * 3. Others Adapter (Claude Code, Cursor ACP, and Third-party CLI bridge)
 */

export * from "./adapters/opencode-adapter";
export * from "./adapters/others";
export * from "./runtimes/opencode-full-engine";

export type SupportedEngineType = "opencode-full-engine" | "opencode-adapter" | "others";

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
  others: {
    id: "others",
    name: "Others (Claude Code / Cursor)",
    description:
      "Adapter for third-party coding agents such as Claude Code, Cursor, and external ACP agents.",
    isStandalone: false,
    memoryFootprint: "Varies",
  },
};

export function getAvailableEngines(): EngineDescriptor[] {
  return Object.values(AVAILABLE_ENGINES);
}

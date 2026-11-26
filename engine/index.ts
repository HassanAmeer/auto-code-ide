/**
 * AutoCode Unified Engine Registry
 * Exposes the standalone OpenCode Full Engine runtime.
 */

export * from "./runtimes/opencode-full-engine";

export type SupportedEngineType = "opencode-full-engine";

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
};

export function getAvailableEngines(): EngineDescriptor[] {
  return Object.values(AVAILABLE_ENGINES);
}

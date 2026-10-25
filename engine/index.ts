/**
 * AutoCode Unified Engine Registry
 * Allows seamless switching between:
 * 1. OpenCode Core Engine (Pure TypeScript standalone runtime)
 * 2. Native Engine (Direct Node.js tool runner)
 * 3. OpenCode Adapter (External CLI bridge)
 * 4. External ACP Adapter (Claude / Cursor CLI bridge)
 */

export * from "./adapters/opencode-adapter";
export * from "./adapters/external-acp-adapter";
export * from "./runtimes/native-engine";

export type SupportedEngineType =
  | "opencode-core"
  | "native-engine"
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
  "opencode-core": {
    id: "opencode-core",
    name: "OpenCode Full Engine (Core TS)",
    description: "Official OpenCode TypeScript agent engine. Zero external CLI needed.",
    isStandalone: true,
    memoryFootprint: "~45MB - 60MB RAM",
  },
  "native-engine": {
    id: "native-engine",
    name: "Native AutoCode Tool Runner",
    description: "Direct lightweight Node.js tool executor (file edit, diff, bash).",
    isStandalone: true,
    memoryFootprint: "~30MB - 45MB RAM",
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

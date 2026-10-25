/**
 * Others Adapter (Claude Code, Cursor ACP, Third-party Agents)
 * Connects AutoCode to third-party coding agents such as Claude Code, Cursor, or external ACP agents.
 */

export interface OthersAdapterConfig {
  readonly agentName?: "claude-code" | "cursor" | "custom";
  readonly agentCommand?: string;
  readonly socketPath?: string;
}

export class OthersAdapter {
  readonly name = "others";
  readonly type = "third-party-cli";
  private agentName: string;
  private agentCommand: string;

  constructor(config?: OthersAdapterConfig) {
    this.agentName = config?.agentName || "claude-code";
    this.agentCommand = config?.agentCommand || "claude-code";
  }

  getAgentName(): string {
    return this.agentName;
  }

  getCommand(): string {
    return this.agentCommand;
  }

  isSupported(): boolean {
    return true;
  }
}

export const othersAdapter = new OthersAdapter();

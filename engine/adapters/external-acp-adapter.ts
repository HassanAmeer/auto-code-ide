/**
 * External ACP Adapter (Agent Client Protocol)
 * Connects to third-party coding agents such as Claude Code, Cursor ACP, or custom ACP agents.
 */

export interface AcpAdapterConfig {
  readonly agentCommand?: string;
  readonly socketPath?: string;
}

export class ExternalAcpAdapter {
  readonly name = "external-acp-adapter";
  readonly type = "third-party-cli";
  private agentCommand: string;

  constructor(config?: AcpAdapterConfig) {
    this.agentCommand = config?.agentCommand || "claude-code";
  }

  getCommand(): string {
    return this.agentCommand;
  }

  isSupported(): boolean {
    return true;
  }
}

export const externalAcpAdapter = new ExternalAcpAdapter();

/**
 * Others Adapter (Claude Code, Cursor ACP, Third-party Agents)
 * Connects AutoCode to third-party coding agents such as Claude Code, Cursor, or external ACP agents.
 */

export interface OthersAdapterConfig {
  readonly agentName?: "claude-code" | "cursor" | "custom";
  readonly agentCommand?: string;
  readonly socketPath?: string;
}

import * as fs from "node:fs";
import * as path from "node:path";

function commandExistsOnPath(command: string): boolean {
  // Absolute path given?
  if (path.isAbsolute(command)) {
    return fs.existsSync(command);
  }
  const pathVar = process.env.PATH || "";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      try {
        const candidate = path.join(dir, command + ext);
        fs.accessSync(candidate, fs.constants.X_OK);
        return true;
      } catch {
        // keep looking
      }
    }
  }
  return false;
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
    // Honest health check: only report supported when the CLI actually exists.
    return commandExistsOnPath(this.agentCommand);
  }
}

export const othersAdapter = new OthersAdapter();

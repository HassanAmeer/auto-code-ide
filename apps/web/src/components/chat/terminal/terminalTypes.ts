export interface TerminalExecResult {
  ok: boolean;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  error?: string | undefined;
}

export interface SshProfile {
  id: string;
  label: string;
  user: string;
  host: string;
  port: number;
}

export type TerminalKeyType = "ssh" | "api" | "server" | "custom";

export interface TerminalAccessKey {
  id: string;
  name: string;
  type: TerminalKeyType;
  host?: string | undefined;
  user?: string | undefined;
  port?: number | undefined;
  secret?: string | undefined;
  enabled: boolean;
  notes?: string | undefined;
}

export interface TerminalTab {
  id: string;
  name: string;
  type: "bash" | "logs";
  cwd?: string | undefined;
  createdAt: number;
}

export interface TerminalCommandRun {
  id: string;
  tabId?: string | undefined;
  executionId?: string | undefined;
  command: string;
  cwd: string;
  status: "running" | "success" | "error";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timestamp: number;
  explanation?: string | undefined;
  nextSteps?: string[] | undefined;
  suggestedFix?:
    | {
        cause: string;
        explanation: string;
        suggestedFixCommand?: string | undefined;
        fixLabel?: string | undefined;
      }
    | undefined;
  targetHost?: string | undefined;
  mode?: "bash" | "ai" | undefined;
  aiPrompt?: string | undefined;
  activeKeys?: TerminalAccessKey[] | undefined;
}

export interface TerminalChatSession {
  id: string;
  threadId?: string | undefined;
  environmentId?: string | undefined;
  title: string;
  createdAt: number;
  projectId?: string | null | undefined;
  projectName?: string | null | undefined;
  projectPath?: string | null | undefined;
  sshKeyId?: string | null | undefined;
  sshKeyName?: string | null | undefined;
  lastPrompt?: string | null | undefined;
}

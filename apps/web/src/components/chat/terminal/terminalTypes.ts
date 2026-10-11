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

export interface TerminalCommandRun {
  id: string;
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
  targetHost?: string | undefined;
  mode?: "bash" | "ai" | undefined;
  aiPrompt?: string | undefined;
  activeKeys?: TerminalAccessKey[] | undefined;
}

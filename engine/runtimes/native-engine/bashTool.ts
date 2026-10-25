import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface BashExecResult {
  readonly success: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export async function executeBash(
  command: string,
  cwd: string,
  timeoutMs = 60_000,
): Promise<BashExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      success: true,
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      success: false,
      stdout: err.stdout?.toString() || "",
      stderr: err.stderr?.toString() || err.message || "Execution error",
      exitCode: typeof err.code === "number" ? err.code : 1,
    };
  }
}

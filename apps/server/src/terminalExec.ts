// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
// @effect-diagnostics globalDate:off

import * as NodeChildProcess from "node:child_process";

export interface TerminalExecutionPayload {
  ok: boolean;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export function runBashCommandOnHost(
  command: string,
  cwd: string = "/",
  timeoutMs: number = 120_000,
): Promise<TerminalExecutionPayload> {
  return new Promise<TerminalExecutionPayload>((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let finished = false;

    const child = NodeChildProcess.spawn("/bin/bash", ["-c", command], {
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        PAGER: "cat",
      },
    });

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve({
          ok: false,
          command,
          cwd,
          stdout,
          stderr: stderr + `\n[Execution timed out after ${Math.round(timeoutMs / 1000)}s]`,
          exitCode: 124,
          durationMs: Date.now() - startTime,
        });
      }
    }, timeoutMs);

    child.stdout?.on("data", (data: { toString(encoding: string): string }) => {
      stdout += data.toString("utf8");
      if (stdout.length > 2 * 1024 * 1024) {
        stdout = stdout.slice(-2 * 1024 * 1024);
      }
    });

    child.stderr?.on("data", (data: { toString(encoding: string): string }) => {
      stderr += data.toString("utf8");
      if (stderr.length > 1 * 1024 * 1024) {
        stderr = stderr.slice(-1 * 1024 * 1024);
      }
    });

    child.on("error", (err: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        command,
        cwd,
        stdout,
        stderr: (stderr ? stderr + "\n" : "") + err.message,
        exitCode: 1,
        durationMs: Date.now() - startTime,
      });
    });

    child.on("close", (code: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        command,
        cwd,
        stdout,
        stderr,
        exitCode: code ?? 0,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

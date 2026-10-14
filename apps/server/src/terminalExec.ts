// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
// @effect-diagnostics globalDate:off

import * as NodeChildProcess from "node:child_process";
import * as Stream from "effect/Stream";
import * as Effect from "effect/Effect";

export interface TerminalExecutionPayload {
  ok: boolean;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

interface ActiveProcessEntry {
  child: NodeChildProcess.ChildProcess;
  kill: () => void;
}

const activeTerminalProcesses = new Map<string, ActiveProcessEntry>();

export function killTerminalProcess(executionId: string): boolean {
  const entry = activeTerminalProcesses.get(executionId);
  if (entry) {
    entry.kill();
    activeTerminalProcesses.delete(executionId);
    return true;
  }
  return false;
}

export function runBashCommandOnHost(
  command: string,
  cwd: string = process.cwd(),
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
        FORCE_COLOR: "1",
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

/**
 * Creates a real-time Server-Sent Events (SSE) stream of bash process output chunks.
 * Emits JSON events:
 * - { type: "stdout", data: string }
 * - { type: "stderr", data: string }
 * - { type: "exit", exitCode: number, ok: boolean, durationMs: number }
 */
import * as NodeStream from "@effect/platform-node/NodeStream";
import * as NodeStreamPromises from "node:stream";

/**
 * Creates an SSE (Server-Sent Events) live streaming response.
 * Emits JSON events:
 * - { type: "stdout", data: string }
 * - { type: "stderr", data: string }
 * - { type: "exit", exitCode: number, ok: boolean, durationMs: number }
 */
export function createTerminalEventStream(
  executionId: string,
  command: string,
  cwd: string = process.cwd(),
  timeoutMs: number = 300_000,
): Stream.Stream<Uint8Array> {
  const passThrough = new NodeStreamPromises.PassThrough();
  const startTime = Date.now();
  let finished = false;

  const child = NodeChildProcess.spawn("/bin/bash", ["-c", command], {
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      PAGER: "cat",
      FORCE_COLOR: "1",
    },
  });

  const sendEvent = (event: Record<string, unknown>) => {
    try {
      const payload = `data: ${JSON.stringify(event)}\n\n`;
      passThrough.write(Buffer.from(payload, "utf8"));
    } catch {
      // ignore
    }
  };

  activeTerminalProcesses.set(executionId, {
    child,
    kill: () => {
      if (!finished) {
        finished = true;
        activeTerminalProcesses.delete(executionId);
        try {
          child.kill("SIGTERM");
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              // ignore
            }
          }, 800);
        } catch {
          // ignore
        }
        sendEvent({
          type: "stderr",
          data: "\n[Process cancelled by user (SIGINT)]\n",
        });
        sendEvent({
          type: "exit",
          exitCode: 130,
          ok: false,
          durationMs: Date.now() - startTime,
        });
        passThrough.end();
      }
    },
  });

  const timer = setTimeout(() => {
    if (!finished) {
      finished = true;
      activeTerminalProcesses.delete(executionId);
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      sendEvent({
        type: "stderr",
        data: `\n[Execution timed out after ${Math.round(timeoutMs / 1000)}s]\n`,
      });
      sendEvent({
        type: "exit",
        exitCode: 124,
        ok: false,
        durationMs: Date.now() - startTime,
      });
      passThrough.end();
    }
  }, timeoutMs);

  child.stdout?.on("data", (chunk: { toString(enc: string): string }) => {
    sendEvent({
      type: "stdout",
      data: chunk.toString("utf8"),
    });
  });

  child.stderr?.on("data", (chunk: { toString(enc: string): string }) => {
    sendEvent({
      type: "stderr",
      data: chunk.toString("utf8"),
    });
  });

  child.on("error", (err: Error) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    activeTerminalProcesses.delete(executionId);
    sendEvent({
      type: "stderr",
      data: `\n[Process spawn error]: ${err.message}\n`,
    });
    sendEvent({
      type: "exit",
      exitCode: 1,
      ok: false,
      durationMs: Date.now() - startTime,
    });
    passThrough.end();
  });

  child.on("close", (code: number | null) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    activeTerminalProcesses.delete(executionId);
    const exitCode = code !== null ? code : 0;
    sendEvent({
      type: "exit",
      exitCode,
      ok: exitCode === 0,
      durationMs: Date.now() - startTime,
    });
    passThrough.end();
  });

  return NodeStream.fromReadable<Uint8Array>({
    evaluate: () => passThrough,
  });
}

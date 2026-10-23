/**
 * Autonomous Auto-Debug Service (opencode debug)
 *
 * Automatically inspects terminal and build failures, diagnoses root causes,
 * edits files, and re-verifies commands in an autonomous loop.
 */

export function isAutoDebugCommand(text: string): boolean {
  return /^\/debug(?:\s|$)/i.test(text.trim());
}

export function parseAutoDebugCommand(text: string): {
  isDebug: boolean;
  targetCommand?: string | undefined;
} {
  const trimmed = text.trim();
  const match = /^\/debug(?:\s+(.+))?$/i.exec(trimmed);
  if (!match) {
    return { isDebug: false };
  }
  return {
    isDebug: true,
    targetCommand: match[1]?.trim() || undefined,
  };
}

export function buildAutoDebugPrompt(customCommand?: string, lastErrorOutput?: string): string {
  const target = customCommand && customCommand.trim() ? customCommand.trim() : "npm run build";
  const errorSection = lastErrorOutput
    ? `\n\nRecent Terminal Error Output:\n\`\`\`\n${lastErrorOutput.slice(-3000)}\n\`\`\``
    : "";

  return `[Autonomous Auto-Debug Mode (opencode debug)]
🎯 Target Command to Fix: \`${target}\`${errorSection}

Autonomous Workflow:
1. Execute \`${target}\` using \`run_command\` to observe the exact failure, exit code, and compiler / test output.
2. Carefully analyze the error messages, stack trace, and identify the exact file(s) and line number(s) causing the failure.
3. Use file reading and editing tools to fix the root cause. Preserve all surrounding logic and comments.
4. Re-run \`${target}\` to verify if your fix resolved the issue.
5. If errors remain, analyze the new output and adjust your fix (perform up to 3 autonomous verification iterations).
6. Once the command completes successfully with exit code 0, provide a clear, concise summary in Roman Urdu detailing the bug and the solution applied.`;
}

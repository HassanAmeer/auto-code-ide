import { memo, useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import {
  Terminal,
  SendHorizontal,
  Loader2,
  X,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Folder,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Key,
  Square,
} from "lucide-react";

import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { translatePromptToBashCommand } from "./terminalClient";
import type { TerminalCommandRun } from "./terminalTypes";
import { TerminalCommandsMenu } from "./TerminalCommandsMenu";
import { toastManager } from "../../ui/toast";
import { parseAnsiToHtml } from "./ansiParser";

export interface AiTerminalCommandBarProps {
  projectCwd?: string | undefined;
  className?: string | undefined;
}

export const AiTerminalCommandBar = memo(function AiTerminalCommandBar({
  projectCwd,
  className = "",
}: AiTerminalCommandBarProps) {
  const store = useTerminalStore();
  const [command, setCommand] = useState("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<TerminalCommandRun | null>(
    () => store.runs[0] ?? null,
  );
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCommandsMenu, setShowCommandsMenu] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleAskAiToFix = () => {
    if (!latestRun) return;
    const prompt = `I ran the terminal command:\n\`${latestRun.command}\`\n\nIt failed with exit code ${latestRun.exitCode ?? "error"}.\nError / Output:\n\`\`\`\n${latestRun.stderr || latestRun.stdout || "Command failed with no output"}\n\`\`\`\nPlease diagnose the cause of this error and tell me how to fix it or give me the fixed command to run.`;
    window.dispatchEvent(new CustomEvent("t3:insert-speech-text", { detail: { text: prompt } }));
    toastManager.add({
      type: "info",
      title: "Sent to AI Chat",
      description: "Terminal error diagnosis prompt inserted into composer.",
    });
  };

  // Update latestRun when runs change
  useEffect(() => {
    if (store.runs.length > 0) {
      setLatestRun(store.runs[0] ?? null);
    }
  }, [store.runs]);

  // Determine active CWD and Scope Mode:
  const isRootScope = store.scopeMode === "root";
  const projectTitle = store.selectedProjectTitle;
  const projectPath = store.lastProjectPath || (store.selectedProjectId ? store.activeCwd : null);

  const effectiveCwd = isRootScope ? "/" : projectPath || projectCwd || store.activeCwd || "/";
  const scopeName = isRootScope ? "root" : projectTitle || "project";

  const handleExecute = useCallback(
    async (overrideCommand?: string) => {
      const raw = typeof overrideCommand === "string" ? overrideCommand : command;
      const trimmed = raw.trim();
      if (!trimmed || isRunning) return;

      // Clear screen shortcut
      if (trimmed === "clear" || trimmed === "cls") {
        setCommand("");
        setLatestRun(null);
        terminalStore.clearRuns();
        return;
      }

      // Translate Roman Urdu or natural shortcut (e.g. "free ram dekho" -> "free -h", "deploy" -> deploy pipeline)
      const translated = translatePromptToBashCommand(
        trimmed,
        effectiveCwd,
        store.accessKeys.filter((k) => k.enabled),
      );

      // Clear command immediately so input feels responsive and doesn't get stuck in the field!
      setCommand("");

      // Auto-elevate with sudo if command is marked as always-allowed or user is in full-access mode for root commands
      let finalCommandToRun = translated || trimmed;
      if (
        !finalCommandToRun.startsWith("sudo ") &&
        (store.isCommandAlwaysAllowed(finalCommandToRun) ||
          (store.permissionMode === "full-access" &&
            (finalCommandToRun.startsWith("apt ") ||
              finalCommandToRun.startsWith("systemctl ") ||
              finalCommandToRun.startsWith("service "))))
      ) {
        finalCommandToRun = `sudo ${finalCommandToRun}`;
      }

      const optimisticRun: TerminalCommandRun = {
        id: "temp_" + Date.now(),
        command: finalCommandToRun,
        cwd: effectiveCwd,
        status: "running",
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: 0,
        timestamp: Date.now(),
        targetHost: isRootScope ? "VPS Host (Root)" : `VPS Host (${scopeName})`,
        mode: "bash",
      };
      setLatestRun(optimisticRun);
      setIsRunning(true);
      setIsOutputCollapsed(false);
      setHistoryIndex(null);
      try {
        const run = await terminalStore.runCommand(finalCommandToRun, effectiveCwd);
        setLatestRun(run);
        setIsOutputCollapsed(false);
      } catch (err) {
        console.error("Command execution error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        const failedRun: TerminalCommandRun = {
          id: "err_" + Date.now(),
          command: finalCommandToRun,
          cwd: effectiveCwd,
          status: "error",
          exitCode: 1,
          stdout: "",
          stderr: errMsg || "Failed to execute command.",
          durationMs: 0,
          timestamp: Date.now(),
          targetHost: isRootScope ? "VPS Host (Root)" : `VPS Host (${scopeName})`,
          mode: "bash",
        };
        setLatestRun(failedRun);
        setIsOutputCollapsed(false);
        toastManager.add({
          type: "error",
          title: "Execution Error",
          description: errMsg || "Command failed to execute.",
        });
      } finally {
        setIsRunning(false);
        inputRef.current?.focus();
      }
    },
    [
      command,
      isRunning,
      effectiveCwd,
      store.accessKeys,
      store.permissionMode,
      store.alwaysAllowedCommands,
    ],
  );

  const handleKill = useCallback(async () => {
    if (!latestRun) return;
    try {
      await terminalStore.killRunningCommand(latestRun.id);
      toastManager.add({
        type: "info",
        title: "Process Cancelled",
        description: "Sent SIGINT (Ctrl+C) to cancel running command.",
      });
    } catch (err) {
      console.error("Failed to kill command:", err);
    }
  }, [latestRun]);

  const handleAllowOnce = useCallback(
    async (cmd: string) => {
      if (!cmd || isRunning) return;
      setIsRunning(true);
      try {
        const sudoCmd = cmd.trim().startsWith("sudo ") ? cmd.trim() : `sudo ${cmd.trim()}`;
        const run = await terminalStore.runCommand(sudoCmd, effectiveCwd);
        setLatestRun(run);
        setIsOutputCollapsed(false);
        toastManager.add({
          type: "success",
          title: "Allowed & Executed with Sudo",
          description: `Ran '${sudoCmd}' successfully with elevated permissions.`,
        });
      } catch (err) {
        console.error("Sudo execution failed:", err);
        toastManager.add({
          type: "error",
          title: "Sudo Execution Failed",
          description: err instanceof Error ? err.message : "Failed to run with sudo.",
        });
      } finally {
        setIsRunning(false);
        inputRef.current?.focus();
      }
    },
    [effectiveCwd, isRunning],
  );

  const handleAllowAlways = useCallback(
    async (cmd: string) => {
      if (!cmd || isRunning) return;
      terminalStore.allowAlwaysCommand(cmd);
      setIsRunning(true);
      try {
        const sudoCmd = cmd.trim().startsWith("sudo ") ? cmd.trim() : `sudo ${cmd.trim()}`;
        const run = await terminalStore.runCommand(sudoCmd, effectiveCwd);
        setLatestRun(run);
        setIsOutputCollapsed(false);
        toastManager.add({
          type: "success",
          title: "Saved: Always Allowed",
          description: `Command added to always-allowed permissions and executed with sudo.`,
        });
      } catch (err) {
        console.error("Allow Always execution failed:", err);
        toastManager.add({
          type: "error",
          title: "Execution Failed",
          description: err instanceof Error ? err.message : "Command failed to run.",
        });
      } finally {
        setIsRunning(false);
        inputRef.current?.focus();
      }
    },
    [effectiveCwd, isRunning],
  );

  const handleDeny = useCallback(() => {
    if (latestRun) {
      terminalStore.removeRun(latestRun.id);
      setLatestRun(null);
    }
    toastManager.add({
      type: "info",
      title: "Command Permission Denied",
      description: "Permission not granted; command output dismissed.",
    });
  }, [latestRun]);

  const isPermissionError = Boolean(
    latestRun &&
    latestRun.status === "error" &&
    (latestRun.exitCode === 126 ||
      latestRun.stderr?.toLowerCase().includes("permission denied") ||
      latestRun.stderr?.toLowerCase().includes("eacces") ||
      latestRun.stderr?.toLowerCase().includes("operation not permitted") ||
      latestRun.stderr?.toLowerCase().includes("requires root") ||
      latestRun.stderr?.toLowerCase().includes("must be run as root")),
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+C / Cmd+C cancels running process
    if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
      if (isRunning && latestRun) {
        e.preventDefault();
        e.stopPropagation();
        void handleKill();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      void handleExecute(command);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (store.history.length === 0) return;
      const nextIndex =
        historyIndex === null ? store.history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      const histCmd = store.history[nextIndex];
      if (histCmd) setCommand(histCmd);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= store.history.length) {
        setHistoryIndex(null);
        setCommand("");
      } else {
        setHistoryIndex(nextIndex);
        const histCmd = store.history[nextIndex];
        if (histCmd) setCommand(histCmd);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      terminalStore.setQuickBarOpen(false);
    }
  };

  const handleCopyOutput = () => {
    if (!latestRun) return;
    const text = [latestRun.stdout, latestRun.stderr].filter(Boolean).join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "w-full mb-2 space-y-1.5 transition-all animate-in fade-in-50 duration-200",
        className,
      )}
    >
      {/* Latest Execution Output Drawer - Rendered ABOVE the Command Input Bar */}
      {latestRun && (
        <div className="rounded-[8px] border border-white/[0.12] bg-[#141416]/95 shadow-xl overflow-hidden backdrop-blur-xl transition-all text-xs animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-white/[0.04] border-b border-white/[0.06] select-none">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-3xs font-semibold text-emerald-400 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400" />$ {latestRun.command}
              </span>
              <span
                className={cn(
                  "text-4xs font-mono px-1.5 py-0.2 rounded-[4px]",
                  latestRun.status === "success"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : latestRun.status === "error"
                      ? "bg-destructive/15 text-destructive border border-destructive/30"
                      : "bg-white/[0.06] text-zinc-400",
                )}
              >
                {latestRun.status === "running"
                  ? "Running..."
                  : latestRun.exitCode !== undefined
                    ? `exit ${latestRun.exitCode}`
                    : latestRun.status}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Cancel / Stop button if process is running */}
              {latestRun.status === "running" && (
                <button
                  type="button"
                  onClick={() => void handleKill()}
                  title="Stop running process (Ctrl+C)"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-medium text-4xs transition-all cursor-pointer mr-0.5 active:scale-95"
                >
                  <Square className="size-2 fill-current" />
                  <span>Stop</span>
                </button>
              )}

              {/* Ask AI to Fix Button if command failed */}
              {(latestRun.status === "error" ||
                (latestRun.exitCode !== undefined && latestRun.exitCode !== 0) ||
                (latestRun.stderr && latestRun.stderr.length > 0)) && (
                <button
                  type="button"
                  onClick={handleAskAiToFix}
                  title="Ask AI to diagnose and fix this terminal error"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 font-medium text-4xs transition-all cursor-pointer shadow-xs mr-0.5"
                >
                  <Sparkles className="size-2.5 text-purple-400" />
                  <span>Fix with AI</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCopyOutput}
                title="Copy output"
                className="p-1 rounded-[4px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="size-3 text-emerald-400" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsOutputCollapsed(!isOutputCollapsed)}
                title={isOutputCollapsed ? "Expand output" : "Collapse output"}
                className="p-1 rounded-[4px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                {isOutputCollapsed ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronUp className="size-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  terminalStore.removeRun(latestRun.id);
                  setLatestRun(null);
                }}
                title="Dismiss output"
                className="p-1 rounded-[4px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>

          {/* Interactive Permission Elevation Card */}
          {isPermissionError && (
            <div className="m-2 p-2.5 rounded-[8px] bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/35 flex flex-col gap-2 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-2xs">
                  <ShieldAlert className="size-3.5 shrink-0 text-amber-400" />
                  <span>Permission Elevation Required</span>
                </div>
                <span className="text-4xs text-amber-300/80 font-mono bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                  Exit {latestRun.exitCode}
                </span>
              </div>
              <p className="text-3xs text-zinc-300 font-sans leading-relaxed">
                This command requires elevated system rights to execute in{" "}
                <code className="text-amber-300 font-mono bg-black/40 px-1 py-0.5 rounded text-4xs">
                  {effectiveCwd}
                </code>
                . You can allow it once or save permission permanently.
              </p>
              <div className="flex items-center gap-2 pt-0.5">
                {/* Allow Once (Run with Sudo) */}
                <button
                  type="button"
                  onClick={() => handleAllowOnce(latestRun.command)}
                  disabled={isRunning}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[5px] bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-3xs shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <Check className="size-3" />
                  <span>Allow (Run with Sudo)</span>
                </button>

                {/* Allow Always */}
                <button
                  type="button"
                  onClick={() => handleAllowAlways(latestRun.command)}
                  disabled={isRunning}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[5px] bg-sky-600 hover:bg-sky-500 text-white font-medium text-3xs shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <Zap className="size-3" />
                  <span>Allow Always</span>
                </button>

                {/* Deny */}
                <button
                  type="button"
                  onClick={handleDeny}
                  disabled={isRunning}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-[5px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-3xs border border-white/[0.08] active:scale-95 transition-all cursor-pointer"
                >
                  <X className="size-3" />
                  <span>Deny</span>
                </button>
              </div>
            </div>
          )}

          {!isOutputCollapsed && (
            <div className="p-3 max-h-60 sm:max-h-72 overflow-y-auto font-mono text-3xs leading-relaxed space-y-1 bg-black/75 border-t border-white/[0.08] select-text">
              {latestRun.stdout && (
                <div
                  className="text-zinc-100 whitespace-pre-wrap break-all"
                  dangerouslySetInnerHTML={{ __html: parseAnsiToHtml(latestRun.stdout) }}
                />
              )}
              {latestRun.stderr && (
                <div
                  className="text-rose-400 whitespace-pre-wrap break-all"
                  dangerouslySetInnerHTML={{ __html: parseAnsiToHtml(latestRun.stderr) }}
                />
              )}
              {!latestRun.stdout && !latestRun.stderr && latestRun.status === "running" && (
                <div className="flex items-center gap-1.5 text-zinc-300 italic py-1 select-none">
                  <Loader2 className="size-3.5 animate-spin text-emerald-400" />
                  <span>Executing command on VPS host...</span>
                </div>
              )}
              {!latestRun.stdout && !latestRun.stderr && latestRun.status === "success" && (
                <span className="text-zinc-500 italic">
                  (Command completed successfully with no output)
                </span>
              )}
              {!latestRun.stdout && !latestRun.stderr && latestRun.status === "error" && (
                <span className="text-rose-400 italic">
                  (Command exited with error code {latestRun.exitCode ?? 1})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sleek Single-Line Command Input Bar - Cupertino iOS Style */}
      <div className="flex items-center gap-1.5 rounded-[9px] border border-white/[0.12] bg-[#18181b]/95 backdrop-blur-xl px-2 py-1 shadow-md focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
        {/* Dropdown Button with Scope Badge (root or Project Name) */}
        <button
          type="button"
          onClick={() => setShowCommandsMenu(true)}
          title={`Common Commands & Directory Shortcuts (${scopeName})`}
          className="flex items-center gap-1 px-1.5 h-[22px] rounded-[5px] bg-[#242428] hover:bg-[#2e2e33] text-zinc-300 border border-white/[0.08] transition-all cursor-pointer shrink-0 shadow-xs active:scale-[0.98]"
        >
          <span className="font-mono text-4xs font-semibold max-w-[120px] sm:max-w-[150px] truncate text-emerald-400">
            {scopeName}
          </span>
          <ChevronDown className="size-2.5 shrink-0 opacity-80 text-zinc-400" />
        </button>

        {/* Terminal Icon & Prompt */}
        <div className="flex items-center gap-1 shrink-0 select-none text-emerald-400">
          <Terminal className="size-3" />
          <span
            className="font-mono text-4xs font-semibold text-zinc-500 hidden sm:inline"
            title={`CWD: ${effectiveCwd}`}
          >
            {store.selectedProjectId && !isRootScope ? `${scopeName}:` : "/:"}
          </span>
        </div>

        {/* Command Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder={
            store.selectedProjectId && !isRootScope
              ? `Run command in ${scopeName}...`
              : "Run command in root (/)..."
          }
          className="flex-1 min-w-0 bg-transparent text-[12px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-mono"
        />

        {/* Send / Run or Stop Button */}
        <div className="flex items-center gap-1 shrink-0">
          {isRunning ? (
            <button
              type="button"
              onClick={() => void handleKill()}
              title="Stop running command (Ctrl+C)"
              className="inline-flex items-center justify-center size-[26px] rounded-[6px] bg-rose-500 hover:bg-rose-600 text-white shadow-xs transition-all cursor-pointer active:scale-[0.96]"
            >
              <Square className="size-2.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleExecute(command);
              }}
              disabled={!command.trim() || isRunning}
              title="Execute Command (Enter)"
              className={cn(
                "inline-flex items-center justify-center size-[26px] rounded-[6px] transition-all cursor-pointer",
                command.trim() && !isRunning
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs active:scale-[0.96]"
                  : "text-zinc-600 hover:text-zinc-400 cursor-not-allowed",
              )}
            >
              <SendHorizontal className="size-3" />
            </button>
          )}

          {/* Close Bar Button */}
          <button
            type="button"
            onClick={() => terminalStore.setQuickBarOpen(false)}
            title="Close Terminal Bar"
            className="inline-flex items-center justify-center size-[26px] rounded-[6px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Categorized Common Commands Modal */}
      <TerminalCommandsMenu
        isOpen={showCommandsMenu}
        onClose={() => setShowCommandsMenu(false)}
        onSelectCommand={(cmd, autoRun) => {
          if (autoRun) {
            void handleExecute(cmd);
          } else {
            setCommand(cmd);
            inputRef.current?.focus();
          }
        }}
      />
    </div>
  );
});

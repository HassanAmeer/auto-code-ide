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
  Maximize2,
  Minimize2,
  Plus,
  Play,
  RotateCcw,
} from "lucide-react";

import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { translatePromptToBashCommand, executeTerminalCommand } from "./terminalClient";
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
  const [rawTerminalInput, setRawTerminalInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<TerminalCommandRun | null>(
    () => store.runs[0] ?? null,
  );
  const [isTrayCollapsed, setIsTrayCollapsed] = useState(false);
  const [isTrayMaximized, setIsTrayMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<"bash" | "logs">("bash");
  const [logsOutput, setLogsOutput] = useState<string | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCommandsMenu, setShowCommandsMenu] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const rawTerminalInputRef = useRef<HTMLInputElement>(null);
  const terminalScreenRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal screen to bottom on new run or chunk
  useEffect(() => {
    if (terminalScreenRef.current) {
      terminalScreenRef.current.scrollTop = terminalScreenRef.current.scrollHeight;
    }
  }, [store.runs, latestRun?.stdout, latestRun?.stderr, isRunning]);

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

  const handleAskAiToFix = useCallback(() => {
    if (!latestRun) return;
    const prompt = `I ran the terminal command:\n\`${latestRun.command}\`\n\nIt failed with exit code ${latestRun.exitCode ?? "error"}.\nError / Output:\n\`\`\`\n${latestRun.stderr || latestRun.stdout || "Command failed with no output"}\n\`\`\`\nPlease diagnose the cause of this error and tell me how to fix it or give me the fixed command to run.`;
    window.dispatchEvent(new CustomEvent("t3:insert-speech-text", { detail: { text: prompt } }));
    toastManager.add({
      type: "info",
      title: "Sent to AI Chat",
      description: "Terminal error diagnosis prompt inserted into composer.",
    });
  }, [latestRun]);

  const handleExecute = useCallback(
    async (overrideCommand?: string) => {
      const raw = typeof overrideCommand === "string" ? overrideCommand : command;
      const trimmed = raw.trim();
      if (!trimmed || isRunning) return;

      // Clear screen shortcut
      if (trimmed === "clear" || trimmed === "cls") {
        setCommand("");
        setRawTerminalInput("");
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

      // Clear commands immediately so input feels responsive
      setCommand("");
      setRawTerminalInput("");

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
      setIsTrayCollapsed(false);
      setHistoryIndex(null);
      setActiveTab("bash");

      try {
        const run = await terminalStore.runCommand(finalCommandToRun, effectiveCwd);
        setLatestRun(run);
        setIsTrayCollapsed(false);
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
        setIsTrayCollapsed(false);
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
      isRootScope,
      scopeName,
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

  // Load journalctl server logs for Tab 2
  const handleLoadLogs = useCallback(async () => {
    setActiveTab("logs");
    setIsLoadingLogs(true);
    try {
      const res = await executeTerminalCommand(
        "journalctl -u autojobs.service -n 50 --no-pager",
        "/",
      );
      if (res.stdout) {
        setLogsOutput(res.stdout);
      } else if (res.stderr) {
        setLogsOutput(res.stderr);
      } else {
        setLogsOutput("No logs available for autojobs.service");
      }
    } catch (err) {
      setLogsOutput(err instanceof Error ? err.message : "Failed to load logs.");
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  const handleAllowOnce = useCallback(
    async (cmd: string) => {
      if (!cmd || isRunning) return;
      setIsRunning(true);
      try {
        const sudoCmd = cmd.trim().startsWith("sudo ") ? cmd.trim() : `sudo ${cmd.trim()}`;
        const run = await terminalStore.runCommand(sudoCmd, effectiveCwd);
        setLatestRun(run);
        setIsTrayCollapsed(false);
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
        setIsTrayCollapsed(false);
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
    // Ctrl+C cancels running process
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

  const handleRawTerminalKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      void handleExecute(rawTerminalInput);
    }
  };

  const handleCopyOutput = () => {
    if (!latestRun) return;
    const text = [latestRun.stdout, latestRun.stderr].filter(Boolean).join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Quick Action Chips definitions
  const quickChips = [
    { label: "📁 ls -la", cmd: "ls -la" },
    { label: "💾 free -h", cmd: "free -h" },
    { label: "⚡ git status", cmd: "git status" },
    { label: "⏱ uptime", cmd: "uptime" },
    { label: "⚙️ autojobs status", cmd: "systemctl status autojobs.service --no-pager" },
    { label: "💿 df -h /", cmd: "df -h /" },
  ];

  // History runs to display chronologically in the terminal screen
  const runsToDisplay = store.runs.slice(0, 8).reverse();

  return (
    <div
      className={cn(
        "w-full h-full flex flex-col bg-[#07070a] text-zinc-100 font-sans select-none overflow-hidden",
        className,
      )}
    >
      {/* ============================================================== */}
      {/* 1. TOP TAB & ACTION CONTROLS BAR (SPLIT STUDIO HEADER)         */}
      {/* ============================================================== */}
      <div className="flex items-center justify-between px-3 h-10 bg-[#111116] border-b border-white/[0.08] select-none text-xs shrink-0">
        {/* Left Tabs */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Tab 1: bash */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("bash");
            }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] font-mono text-3xs font-semibold border transition-all cursor-pointer active:scale-95",
              activeTab === "bash"
                ? "bg-[#1f1f28] text-emerald-400 border-white/[0.14] shadow-xs"
                : "text-zinc-400 hover:text-zinc-200 border-transparent",
            )}
          >
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            <span>1: bash ({scopeName})</span>
          </button>

          {/* Tab 2: server logs */}
          <button
            type="button"
            onClick={() => {
              void handleLoadLogs();
            }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] font-mono text-3xs font-medium border transition-all cursor-pointer active:scale-95",
              activeTab === "logs"
                ? "bg-[#1f1f28] text-sky-400 border-white/[0.14] shadow-xs"
                : "text-zinc-400 hover:text-zinc-200 border-transparent",
            )}
          >
            <span>2: server logs</span>
          </button>

          {/* Plus Tab (Focus Input) */}
          <button
            type="button"
            onClick={() => {
              setCommand("");
              setRawTerminalInput("");
              inputRef.current?.focus();
            }}
            title="Focus Terminal Prompt"
            className="p-1 rounded-[4px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Plus className="size-3" />
          </button>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-1.5 text-zinc-400 shrink-0">
          {/* Simulated Loading Status during execution */}
          {isRunning && (
            <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-4xs font-medium mr-1 animate-pulse">
              <Loader2 className="size-3 animate-spin text-emerald-400" />
              <span className="hidden sm:inline">Executing on VPS...</span>
            </div>
          )}

          {/* Stop Button if process is running */}
          {isRunning && (
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
          {(latestRun?.status === "error" ||
            (latestRun?.exitCode !== undefined && latestRun?.exitCode !== 0) ||
            (latestRun?.stderr && latestRun.stderr.length > 0)) && (
            <button
              type="button"
              onClick={handleAskAiToFix}
              title="Ask AI in Left Pane to diagnose and fix this error"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 font-medium text-4xs transition-all cursor-pointer shadow-xs mr-0.5 active:scale-95"
            >
              <Sparkles className="size-2.5 text-purple-400" />
              <span>✨ Fix with AI</span>
            </button>
          )}

          {/* Copy Output */}
          <button
            type="button"
            onClick={handleCopyOutput}
            title="Copy Terminal Output"
            className="p-1 rounded-[4px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          </button>

          {/* Clear Console */}
          <button
            type="button"
            onClick={() => {
              terminalStore.clearRuns();
              setLatestRun(null);
              setLogsOutput(null);
            }}
            title="Clear Terminal Output"
            className="px-1.5 py-0.5 rounded-[4px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] text-4xs font-mono transition-colors cursor-pointer"
          >
            Clear
          </button>

          {/* Close Entire Studio Pane */}
          <button
            type="button"
            onClick={() => terminalStore.setQuickBarOpen(false)}
            title="Close Terminal Pane"
            className="p-1 rounded-[4px] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer ml-1"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. DEDICATED MONOSPACE TERMINAL SCREEN BODY (FULL HEIGHT)       */}
      {/* ============================================================== */}
      <div
        ref={terminalScreenRef}
        className="flex-1 p-3 overflow-y-auto font-mono text-3xs leading-relaxed space-y-2.5 bg-[#050508] text-zinc-200 select-text [scrollbar-width:thin] scroll-smooth"
      >
        {/* Banner line */}
        <div className="text-zinc-500 pb-1.5 border-b border-white/[0.06] select-none flex items-center justify-between text-4xs">
          <span>
            AutoCode Linux VPS Terminal v2.4 (Host: {isRootScope ? "VPS Root" : scopeName})
          </span>
          <span className="text-zinc-600">cwd: {effectiveCwd}</span>
        </div>

        {/* TAB 1: BASH RUNS & INTERACTIVE PROMPT */}
        {activeTab === "bash" && (
          <>
            {/* Sudo Permission Required Prompt Card */}
            {isPermissionError && (
              <div className="p-2.5 rounded-[8px] bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/35 flex flex-col gap-2 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-2xs">
                    <ShieldAlert className="size-3.5 shrink-0 text-amber-400" />
                    <span>Permission Elevation Required</span>
                  </div>
                  <span className="text-4xs text-amber-300/80 font-mono bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                    Exit {latestRun?.exitCode}
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
                  <button
                    type="button"
                    onClick={() => latestRun && handleAllowOnce(latestRun.command)}
                    disabled={isRunning}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[5px] bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-3xs shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Check className="size-3" />
                    <span>Allow (Run with Sudo)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => latestRun && handleAllowAlways(latestRun.command)}
                    disabled={isRunning}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[5px] bg-sky-600 hover:bg-sky-500 text-white font-medium text-3xs shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Zap className="size-3" />
                    <span>Allow Always</span>
                  </button>
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

            {/* Render recent runs chronologically */}
            {runsToDisplay.length === 0 ? (
              <div className="text-zinc-600 italic py-3 text-center">
                Terminal ready. Type a command below or click a quick run chip to execute directly
                on VPS host.
              </div>
            ) : (
              runsToDisplay.map((run) => (
                <div key={run.id} className="space-y-1 pt-1.5 border-t border-white/[0.04]">
                  <div className="flex items-center justify-between text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-semibold">
                        root@{scopeName}:{effectiveCwd}#
                      </span>
                      <span className="text-white font-semibold">{run.command}</span>
                    </div>
                    <span
                      className={cn(
                        "text-4xs px-1.5 py-0.2 rounded-[4px] font-mono",
                        run.status === "success"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : run.status === "error"
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : "bg-white/[0.06] text-zinc-400",
                      )}
                    >
                      {run.status === "running"
                        ? "running..."
                        : run.exitCode !== undefined
                          ? `exit ${run.exitCode} (${run.durationMs}ms)`
                          : run.status}
                    </span>
                  </div>

                  {run.stdout && (
                    <div
                      className="text-zinc-100 whitespace-pre-wrap break-all pl-2 font-mono"
                      dangerouslySetInnerHTML={{ __html: parseAnsiToHtml(run.stdout) }}
                    />
                  )}
                  {run.stderr && (
                    <div
                      className="text-rose-400 whitespace-pre-wrap break-all pl-2 font-mono"
                      dangerouslySetInnerHTML={{ __html: parseAnsiToHtml(run.stderr) }}
                    />
                  )}
                  {!run.stdout && !run.stderr && run.status === "success" && (
                    <div className="text-zinc-500 italic pl-2">
                      (Command completed with no output)
                    </div>
                  )}
                  {!run.stdout && !run.stderr && run.status === "running" && (
                    <div className="flex items-center gap-1.5 text-zinc-400 italic py-0.5 pl-2">
                      <Loader2 className="size-3 animate-spin text-emerald-400" />
                      <span>Executing command on host...</span>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Direct Command Input Line inside Terminal */}
            <div className="flex items-center gap-1.5 pt-2 border-t border-white/[0.06]">
              <span className="text-emerald-400 font-semibold shrink-0 select-none">
                root@{scopeName}:#
              </span>
              <input
                ref={rawTerminalInputRef}
                type="text"
                value={rawTerminalInput}
                onChange={(e) => setRawTerminalInput(e.target.value)}
                onKeyDown={handleRawTerminalKeyDown}
                placeholder="Type raw bash command here (Enter to run)..."
                disabled={isRunning}
                className="flex-1 bg-transparent text-3xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
          </>
        )}

        {/* TAB 2: SERVER SYSTEMD LOGS */}
        {activeTab === "logs" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between pb-1 border-b border-white/[0.06] text-zinc-400">
              <span className="text-sky-400 font-semibold">
                journalctl -u autojobs.service -n 50
              </span>
              <button
                type="button"
                onClick={() => void handleLoadLogs()}
                disabled={isLoadingLogs}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-4xs font-mono cursor-pointer"
              >
                <RotateCcw className={cn("size-2.5", isLoadingLogs && "animate-spin")} />
                <span>Refresh</span>
              </button>
            </div>
            {isLoadingLogs ? (
              <div className="flex items-center gap-2 text-zinc-400 py-3">
                <Loader2 className="size-3.5 animate-spin text-sky-400" />
                <span>Fetching live journalctl logs from host...</span>
              </div>
            ) : logsOutput ? (
              <div
                className="text-zinc-300 whitespace-pre-wrap break-all text-3xs font-mono"
                dangerouslySetInnerHTML={{ __html: parseAnsiToHtml(logsOutput) }}
              />
            ) : (
              <div className="text-zinc-500 italic py-2">
                Click Refresh to fetch service journalctl logs.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 3. BOTTOM ACTION & INPUT DOCK (SPLIT STUDIO BOTTOM)           */}
      {/* ============================================================== */}
      <div className="p-2.5 bg-[#0d0d12] border-t border-white/[0.08] shrink-0 space-y-2">
        {/* Quick Action Chips */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 px-0.5 text-xs select-none [scrollbar-width:none]">
          <span className="text-4xs text-zinc-500 font-mono uppercase font-semibold shrink-0 mr-0.5">
            QUICK:
          </span>
          {quickChips.map((chip) => (
            <button
              key={chip.cmd}
              type="button"
              onClick={() => void handleExecute(chip.cmd)}
              disabled={isRunning}
              className="flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-[#1a1a22] hover:bg-[#252530] text-zinc-300 hover:text-white font-mono text-4xs border border-white/[0.07] transition-all cursor-pointer shrink-0 active:scale-95 shadow-xs"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Sleek Command Input Bar */}
        <div className="flex items-center gap-1.5 rounded-[8px] border border-white/[0.12] bg-[#15151a] px-2 py-1 shadow-md focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
          {/* Dropdown Button with Scope Badge */}
          <button
            type="button"
            onClick={() => setShowCommandsMenu(true)}
            title={`Common Commands & Shortcuts (${scopeName})`}
            className="flex items-center gap-1 px-1.5 h-[22px] rounded-[5px] bg-[#22222a] hover:bg-[#2a2a35] text-zinc-300 border border-white/[0.08] transition-all cursor-pointer shrink-0 shadow-xs active:scale-[0.98]"
          >
            <span className="font-mono text-4xs font-semibold max-w-[100px] truncate text-emerald-400">
              {scopeName}
            </span>
            <ChevronDown className="size-2.5 shrink-0 opacity-80 text-zinc-400" />
          </button>

          {/* Terminal Prompt Prefix */}
          <span className="font-mono text-4xs font-semibold text-emerald-400 shrink-0 select-none">
            root@{scopeName}:#
          </span>

          {/* Input field */}
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

          {/* Action Button: Send or Stop */}
          <div className="flex items-center gap-1 shrink-0">
            {isRunning ? (
              <button
                type="button"
                onClick={() => void handleKill()}
                title="Stop running command (Ctrl+C)"
                className="inline-flex items-center justify-center size-[24px] rounded-[5px] bg-rose-500 hover:bg-rose-600 text-white shadow-xs transition-all cursor-pointer active:scale-[0.96]"
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
                  "inline-flex items-center justify-center size-[24px] rounded-[5px] transition-all cursor-pointer",
                  command.trim() && !isRunning
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs active:scale-[0.96]"
                    : "text-zinc-600 hover:text-zinc-400 cursor-not-allowed",
                )}
              >
                <SendHorizontal className="size-3" />
              </button>
            )}
          </div>
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

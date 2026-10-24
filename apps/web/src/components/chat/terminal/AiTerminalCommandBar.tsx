import { memo, useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import {
  Terminal,
  SendHorizontal,
  Loader2,
  X,
  Check,
  Copy,
  Sparkles,
  ShieldAlert,
  Zap,
  Square,
  Plus,
  RotateCcw,
} from "lucide-react";

import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { executeTerminalCommand } from "./terminalClient";
import type { TerminalCommandRun } from "./terminalTypes";
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
  const [logsOutput, setLogsOutput] = useState<string | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const terminalScreenRef = useRef<HTMLDivElement>(null);

  // Active Tab from store or fallback
  const activeTabId = store.activeTabId || store.terminalTabs[0]?.id || "term_tab_1";
  const activeTabObj =
    store.terminalTabs.find((t) => t.id === activeTabId) || store.terminalTabs[0];
  const isLogsTab = activeTabObj?.type === "logs";

  // Auto-scroll terminal screen to bottom on new run or chunk
  useEffect(() => {
    if (terminalScreenRef.current) {
      terminalScreenRef.current.scrollTop = terminalScreenRef.current.scrollHeight;
    }
  }, [store.runs, latestRun?.stdout, latestRun?.stderr, isRunning, activeTabId]);

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
  const scopeName = isRootScope ? "root" : projectTitle || "op";
  const cwdDisplay =
    effectiveCwd === "/" ? "/" : effectiveCwd.split("/").filter(Boolean).pop() || effectiveCwd;

  const handleAskAiToFix = useCallback(() => {
    if (!latestRun) return;
    const prompt = `I ran the terminal command in ${scopeName}:\n\`${latestRun.command}\`\n\nIt failed with exit code ${latestRun.exitCode ?? "error"}.\nError Output:\n\`\`\`\n${latestRun.stderr || latestRun.stdout || "Command failed with no output"}\n\`\`\`\nPlease diagnose the cause of this error and tell me how to fix it or give me the fixed command to run.`;
    window.dispatchEvent(new CustomEvent("t3:insert-speech-text", { detail: { text: prompt } }));
    toastManager.add({
      type: "info",
      title: "Sent to AI Chat",
      description: "Terminal error diagnosis prompt inserted into conversation.",
    });
  }, [latestRun, scopeName]);

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

      // Clear command input immediately so user sees responsiveness
      setCommand("");

      // Auto-elevate with sudo if command is marked as always-allowed or user is in full-access mode for systemctl/apt
      let finalCommandToRun = trimmed;
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
        tabId: activeTabId,
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
      setHistoryIndex(null);

      try {
        const run = await terminalStore.runCommand(finalCommandToRun, effectiveCwd);
        setLatestRun(run);
      } catch (err) {
        console.error("Command execution error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        const failedRun: TerminalCommandRun = {
          id: "err_" + Date.now(),
          tabId: activeTabId,
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
      store.permissionMode,
      store.isCommandAlwaysAllowed,
      activeTabId,
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

  // Load journalctl server logs for Logs Tab
  const handleLoadLogs = useCallback(async () => {
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
        toastManager.add({
          type: "success",
          title: "Executed with Sudo",
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

  const handleCopyOutput = () => {
    if (!latestRun) return;
    const text = [latestRun.stdout, latestRun.stderr].filter(Boolean).join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 2-Line Smart Action Suggestions (Title on top, muted exact bash command below)
  const smartSuggestions = [
    { title: "📁 List Directory", cmd: "ls -la", desc: "View all files & folders" },
    { title: "💾 Check Free RAM", cmd: "free -h", desc: "RAM usage & buffer" },
    { title: "⚡ Git Status", cmd: "git status", desc: "Branch & modified files" },
    { title: "⏱ VPS Uptime", cmd: "uptime", desc: "Server load & uptime" },
    {
      title: "⚙️ AutoJobs Service",
      cmd: "systemctl status autojobs.service --no-pager",
      desc: "Check service health",
    },
    { title: "💿 Disk Usage", cmd: "df -h /", desc: "Available root storage" },
    { title: "🔄 Pull Latest Code", cmd: "git pull origin main", desc: "Fetch & pull latest code" },
    { title: "🔍 Active Ports", cmd: "ss -tulpn", desc: "List listening ports" },
    { title: "🧹 Clear Screen", cmd: "clear", desc: "Clear console history" },
  ];

  // Runs to display chronologically in the terminal screen
  const runsToDisplay = store.runs.slice(0, 15).reverse();

  return (
    <div
      className={cn(
        "w-full h-full flex flex-col bg-[#07070a] text-zinc-100 font-sans select-none overflow-hidden",
        className,
      )}
    >
      {/* ============================================================== */}
      {/* 1. MULTI-TERMINAL TAB BAR & ACTION CONTROLS                    */}
      {/* ============================================================== */}
      <div className="flex items-center justify-between px-3 h-10 bg-[#101015] border-b border-white/[0.08] select-none text-xs shrink-0">
        {/* Dynamic Multi-Terminal Tabs */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto [scrollbar-width:none]">
          {store.terminalTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => {
                  terminalStore.setActiveTabId(tab.id);
                  if (tab.type === "logs") {
                    void handleLoadLogs();
                  }
                }}
                className={cn(
                  "group flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] font-mono text-3xs font-semibold border transition-all cursor-pointer active:scale-95 shrink-0",
                  isActive
                    ? tab.type === "logs"
                      ? "bg-[#1c1c28] text-sky-400 border-sky-500/40 shadow-xs"
                      : "bg-[#181822] text-emerald-400 border-emerald-500/40 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200 border-white/[0.04] hover:bg-white/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full shrink-0",
                    isActive
                      ? tab.type === "logs"
                        ? "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]"
                        : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                      : "bg-zinc-600",
                  )}
                />
                <span className="truncate max-w-[110px]">{tab.name}</span>
                {store.terminalTabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      terminalStore.closeTerminalTab(tab.id);
                    }}
                    title="Close Terminal Tab"
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-400 transition-opacity ml-0.5"
                  >
                    <X className="size-2.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Plus Tab: Add New Terminal Instance */}
          <button
            type="button"
            onClick={() => {
              const newTabId = terminalStore.addTerminalTab();
              inputRef.current?.focus();
              toastManager.add({
                type: "info",
                title: "New Terminal Opened",
                description: `Created dedicated session: Terminal ${store.terminalTabs.length + 1}`,
              });
            }}
            title="Open New Terminal Session (+)"
            className="flex items-center gap-1 px-2 py-1 rounded-[6px] text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-3xs font-mono transition-all cursor-pointer shrink-0"
          >
            <Plus className="size-3" />
            <span className="hidden sm:inline">New Terminal</span>
          </button>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-1.5 text-zinc-400 shrink-0 ml-2">
          {/* Live Spinner when running */}
          {isRunning && (
            <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-4xs font-medium mr-1 animate-pulse">
              <Loader2 className="size-3 animate-spin text-emerald-400" />
              <span className="hidden sm:inline">Executing...</span>
            </div>
          )}

          {/* Stop Button (Ctrl+C) */}
          {isRunning && (
            <button
              type="button"
              onClick={() => void handleKill()}
              title="Stop running process (Ctrl+C)"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-medium text-4xs transition-all cursor-pointer active:scale-95"
            >
              <Square className="size-2 fill-current" />
              <span>Stop</span>
            </button>
          )}

          {/* Ask AI to Fix Button (on error) */}
          {(latestRun?.status === "error" ||
            (latestRun?.exitCode !== undefined && latestRun?.exitCode !== 0) ||
            (latestRun?.stderr && latestRun.stderr.length > 0)) && (
            <button
              type="button"
              onClick={handleAskAiToFix}
              title="Ask AI in Left Pane to diagnose and fix this error"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 font-medium text-4xs transition-all cursor-pointer shadow-xs active:scale-95"
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
            title="Clear Console Output"
            className="px-1.5 py-0.5 rounded-[4px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] text-4xs font-mono transition-colors cursor-pointer"
          >
            Clear
          </button>

          {/* Close Panel Button */}
          <button
            type="button"
            onClick={() => terminalStore.setQuickBarOpen(false)}
            title="Close Terminal Studio"
            className="p-1 rounded-[4px] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer ml-1"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. DEDICATED FULL-HEIGHT TERMINAL CONSOLE SCREEN               */}
      {/* ============================================================== */}
      <div
        ref={terminalScreenRef}
        className="flex-1 p-3 overflow-y-auto font-mono text-3xs leading-relaxed space-y-2.5 bg-[#050508] text-zinc-200 select-text [scrollbar-width:thin] scroll-smooth"
      >
        {/* Banner line */}
        <div className="text-zinc-500 pb-1.5 border-b border-white/[0.06] select-none flex items-center justify-between text-4xs">
          <span>
            AutoCode Linux VPS Terminal v2.5 (Host: {isRootScope ? "VPS Root" : scopeName})
          </span>
          <span className="text-zinc-600">cwd: {effectiveCwd}</span>
        </div>

        {/* TAB: BASH EXECUTION SCREEN */}
        {!isLogsTab && (
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
                  .
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
              <div className="text-zinc-600 italic py-4 text-center">
                Terminal ready. Select a suggestion card below or type any command to run on VPS
                host.
              </div>
            ) : (
              runsToDisplay.map((run) => (
                <div key={run.id} className="space-y-1 pt-1.5 border-t border-white/[0.04]">
                  <div className="flex items-center justify-between text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-semibold">
                        root@{scopeName}:{effectiveCwd === "/" ? "/" : cwdDisplay}#
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
                      (Command executed with no output)
                    </div>
                  )}
                  {!run.stdout && !run.stderr && run.status === "running" && (
                    <div className="flex items-center gap-1.5 text-zinc-400 italic py-0.5 pl-2">
                      <Loader2 className="size-3 animate-spin text-emerald-400" />
                      <span>Executing command on VPS host...</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* TAB: SYSTEMD JOURNALCTL LOGS */}
        {isLogsTab && (
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
                <span>Refresh Logs</span>
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
                Click Refresh Logs to fetch service journalctl logs.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 3. 2-LINE SMART SUGGESTIONS & SINGLE DIRECT TERMINAL PROMPT    */}
      {/* ============================================================== */}
      <div className="p-2.5 bg-[#0e0e14] border-t border-white/[0.08] shrink-0 space-y-2">
        {/* Horizontal Scrollable 2-Line Smart Action Cards */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 px-0.5 [scrollbar-width:thin] select-none">
          {smartSuggestions.map((item) => (
            <button
              key={item.cmd}
              type="button"
              onClick={() => void handleExecute(item.cmd)}
              disabled={isRunning}
              className="flex flex-col text-left px-2.5 py-1.5 rounded-lg bg-[#15151e] hover:bg-[#20202d] border border-white/[0.08] hover:border-emerald-500/50 transition-all cursor-pointer shrink-0 active:scale-95 group shadow-xs"
            >
              <span className="text-3xs font-semibold text-zinc-200 group-hover:text-emerald-400 transition-colors">
                {item.title}
              </span>
              <span className="text-4xs font-mono text-zinc-500 group-hover:text-zinc-400">
                $ {item.cmd}
              </span>
            </button>
          ))}
        </div>

        {/* The ONLY Clean Direct Terminal Input Prompt (No Duplicate Boxes!) */}
        <div className="flex items-center gap-2 rounded-lg bg-[#08080c] border border-white/[0.12] px-2.5 py-1.5 focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all shadow-md">
          <span className="text-emerald-400 font-mono font-bold text-xs select-none shrink-0">
            root@{scopeName}:{cwdDisplay}#
          </span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder="Type command (e.g. ls, free -h, git status) and press Enter..."
            className="flex-1 min-w-0 bg-transparent text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none"
          />
          {isRunning ? (
            <button
              type="button"
              onClick={() => void handleKill()}
              title="Stop running command (Ctrl+C)"
              className="p-1 rounded bg-rose-500/30 hover:bg-rose-500 text-rose-300 hover:text-white transition-all cursor-pointer shrink-0 active:scale-95"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleExecute(command)}
              disabled={!command.trim() || isRunning}
              title="Run Command (Enter)"
              className={cn(
                "p-1 rounded transition-all cursor-pointer shrink-0",
                command.trim() && !isRunning
                  ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-xs font-bold active:scale-95"
                  : "text-zinc-600 cursor-not-allowed",
              )}
            >
              <SendHorizontal className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

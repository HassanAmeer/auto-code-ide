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
  ShieldCheck,
  Zap,
  Square,
  Plus,
  RotateCcw,
  FolderGit2,
  Server,
  Key,
} from "lucide-react";

import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { executeTerminalCommand } from "./terminalClient";
import type { TerminalCommandRun } from "./terminalTypes";
import { toastManager } from "../../ui/toast";
import { parseAnsiToHtml } from "./ansiParser";
import { SshKeysSheet } from "./SshKeysSheet";

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
  const [suggestionCategory, setSuggestionCategory] = useState<string>("all");

  const promptInputRef = useRef<HTMLInputElement>(null);
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
  }, [store.runs, latestRun?.stdout, latestRun?.stderr, isRunning, activeTabId, command]);

  // Update latestRun when runs change or activeTab changes
  useEffect(() => {
    const tabRuns = store.runs.filter((r) => !r.tabId || r.tabId === activeTabId);
    setLatestRun(tabRuns[0] ?? null);
  }, [store.runs, activeTabId]);

  // By default, terminal opens in root ("/")
  const isRootScope = store.scopeMode === "root";
  const projectTitle = store.selectedProjectTitle || "op";
  const projectPath =
    store.lastProjectPath ||
    (store.selectedProjectId ? store.activeCwd : null) ||
    "/root/autojobs/projects/autocode-storage/op";

  const activeTab = store.terminalTabs.find((t) => t.id === activeTabId);
  const effectiveCwd =
    activeTab?.cwd || store.activeCwd || (isRootScope ? "/" : projectPath || "/");
  const scopeName = isRootScope ? "vps" : projectTitle;

  // Format prompt path like genuine Linux bash (e.g. / -> /, /root -> ~, /root/autojobs -> ~/autojobs, /dev -> /dev)
  const formatPromptPath = useCallback((pathStr?: string | null): string => {
    if (!pathStr || pathStr === "/") return "/";
    if (pathStr === "/root") return "~";
    if (pathStr.startsWith("/root/")) return "~" + pathStr.slice(5);
    return pathStr;
  }, []);

  const cwdDisplay = formatPromptPath(effectiveCwd);

  const handleAskAiToFix = useCallback(() => {
    if (!latestRun) return;
    const prompt = `I ran the terminal command in ${scopeName} (${effectiveCwd}):\n\`${latestRun.command}\`\n\nIt failed with exit code ${latestRun.exitCode ?? "error"}.\nError Output:\n\`\`\`\n${latestRun.stderr || latestRun.stdout || "Command failed with no output"}\n\`\`\`\nPlease diagnose the cause of this error and tell me how to fix it or give me the fixed command to run.`;
    window.dispatchEvent(new CustomEvent("t3:insert-speech-text", { detail: { text: prompt } }));
    toastManager.add({
      type: "info",
      title: "Sent to AI Chat",
      description: "Terminal error diagnosis prompt inserted into conversation.",
    });
  }, [latestRun, scopeName, effectiveCwd]);

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

      setCommand("");

      // Run command directly as requested (VPS execution operates with native host root privileges)
      const finalCommandToRun = trimmed;

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
        promptInputRef.current?.focus();
      }
    },
    [command, isRunning, effectiveCwd, store.permissionMode, activeTabId, isRootScope, scopeName],
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
        promptInputRef.current?.focus();
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
        promptInputRef.current?.focus();
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

  // Categorized Smart Action Suggestions (Title on top, muted exact bash command below)
  const suggestionCategories = [
    { id: "all", label: "All" },
    { id: "system", label: "System 📊" },
    { id: "services", label: "Services ⚙️" },
    { id: "git", label: "Git 🌿" },
    { id: "network", label: "Network 🌐" },
    { id: "cleanup", label: "Cleanup 🧹" },
  ];

  const smartSuggestions: Array<{
    category: "system" | "services" | "git" | "network" | "cleanup";
    title: string;
    cmd: string;
  }> = [
    // 📊 SYSTEM & RESOURCES
    { category: "system", title: "📁 List Directory", cmd: "ls -la" },
    { category: "system", title: "💾 Check Free RAM", cmd: "free -h" },
    { category: "system", title: "💿 Disk Usage", cmd: "df -h /" },
    { category: "system", title: "🔥 Top CPU Tasks", cmd: "ps aux --sort=-%cpu | head -n 8" },
    { category: "system", title: "🧠 Top Memory Tasks", cmd: "ps aux --sort=-%mem | head -n 8" },
    { category: "system", title: "⏱ VPS Uptime & Load", cmd: "uptime" },
    {
      category: "system",
      title: "🖥️ OS & Kernel Info",
      cmd: "uname -srm && cat /etc/os-release | grep PRETTY",
    },
    { category: "system", title: "📊 Inode Usage", cmd: "df -ih /" },

    // ⚙️ SERVICES & SERVERS
    {
      category: "services",
      title: "⚙️ AutoJobs Service",
      cmd: "systemctl status autojobs.service --no-pager",
    },
    {
      category: "services",
      title: "🔄 Restart AutoJobs",
      cmd: "systemctl restart autojobs.service",
    },
    {
      category: "services",
      title: "📜 AutoJobs Logs",
      cmd: "journalctl -u autojobs.service -n 35 --no-pager",
    },
    { category: "services", title: "🌐 Nginx Status", cmd: "systemctl status nginx --no-pager" },
    { category: "services", title: "🔄 Reload Nginx", cmd: "systemctl reload nginx" },
    {
      category: "services",
      title: "🐳 Docker Containers",
      cmd: "docker ps -a 2>/dev/null || echo 'Docker not running'",
    },
    { category: "services", title: "🛡️ Firewall (UFW)", cmd: "ufw status verbose" },
    { category: "services", title: "🔍 Failed Services", cmd: "systemctl --failed" },

    // 🌿 GIT & REPOSITORY
    { category: "git", title: "⚡ Git Status", cmd: "git status" },
    { category: "git", title: "🔄 Pull Latest Code", cmd: "git pull origin main" },
    { category: "git", title: "📜 Recent Git Logs", cmd: "git log --oneline -n 8" },
    { category: "git", title: "🌱 Git Branches", cmd: "git branch -a" },
    { category: "git", title: "🔍 Git Diff Stat", cmd: "git diff --stat" },
    { category: "git", title: "📦 Node & PNPM Ver", cmd: "node -v && pnpm -v" },
    { category: "git", title: "🌿 Git Fetch Prune", cmd: "git fetch --all --prune" },
    { category: "git", title: "📦 Git Stash List", cmd: "git stash list" },

    // 🌐 NETWORK & PORTS
    { category: "network", title: "🔌 Active Ports", cmd: "ss -tulpn | grep LISTEN" },
    { category: "network", title: "🌐 Public IP Check", cmd: "curl -s4 ifconfig.me" },
    { category: "network", title: "🏓 Ping Test (DNS)", cmd: "ping -c 3 8.8.8.8" },
    { category: "network", title: "📡 Open TCP Sockets", cmd: "ss -tan | head -n 15" },
    { category: "network", title: "🌐 Route Table", cmd: "ip route show" },
    { category: "network", title: "🔍 Resolv DNS", cmd: "cat /etc/resolv.conf" },

    // 🧹 CLEANUP & UTILITIES
    {
      category: "cleanup",
      title: "📁 Find Large Files",
      cmd: "find / -xdev -type f -size +100M 2>/dev/null | head -n 10",
    },
    { category: "cleanup", title: "🧹 Vacuum Journals", cmd: "journalctl --vacuum-time=3d" },
    {
      category: "cleanup",
      title: "🧹 Clean Apt Cache",
      cmd: "apt-get clean && apt-get autoremove -y",
    },
    {
      category: "cleanup",
      title: "🧹 Prune PNPM Store",
      cmd: "pnpm store prune 2>/dev/null || true",
    },
    { category: "cleanup", title: "🧹 Clear Screen", cmd: "clear" },
    { category: "cleanup", title: "📂 Current PWD", cmd: "pwd" },
    { category: "cleanup", title: "👥 Active Users", cmd: "who && w" },
  ];

  const filteredSuggestions =
    suggestionCategory === "all"
      ? smartSuggestions
      : smartSuggestions.filter((item) => item.category === suggestionCategory);

  const halfSuggestions = Math.ceil(filteredSuggestions.length / 2);
  const row1Suggestions = filteredSuggestions.slice(0, halfSuggestions);
  const row2Suggestions = filteredSuggestions.slice(halfSuggestions);

  // Runs to display chronologically in the terminal screen for active tab
  const activeTabRuns = store.runs.filter((r) => !r.tabId || r.tabId === activeTabId);
  const baseRuns = activeTabRuns.slice(0, 30).reverse();
  const runsToDisplay =
    latestRun &&
    (!latestRun.tabId || latestRun.tabId === activeTabId) &&
    !baseRuns.some((r) => r.id === latestRun.id)
      ? [...baseRuns, latestRun]
      : baseRuns;

  return (
    <div
      className={cn(
        "w-full h-full flex flex-col bg-[#07070a] text-zinc-100 font-mono select-none overflow-hidden border-l border-white/[0.08]",
        className,
      )}
      onClick={() => promptInputRef.current?.focus()}
    >
      {/* ============================================================== */}
      {/* 1. AUTHENTIC TERMINAL WINDOW TOP BAR & TABS                    */}
      {/* ============================================================== */}
      <div className="flex items-center justify-between px-3 h-10 bg-[#0d0d12] border-b border-white/[0.08] select-none text-xs shrink-0">
        {/* Dynamic Multi-Terminal Tabs */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto [scrollbar-width:none]">
          {store.terminalTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={(e) => {
                  e.stopPropagation();
                  terminalStore.setActiveTabId(tab.id);
                  if (tab.type === "logs") {
                    void handleLoadLogs();
                  }
                  promptInputRef.current?.focus();
                }}
                className={cn(
                  "group flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] text-3xs font-semibold border transition-all cursor-pointer active:scale-95 shrink-0",
                  isActive
                    ? tab.type === "logs"
                      ? "bg-[#181824] text-sky-400 border-sky-500/40 shadow-xs"
                      : "bg-[#141816] text-emerald-400 border-emerald-500/40 shadow-xs"
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
            onClick={(e) => {
              e.stopPropagation();
              terminalStore.addTerminalTab();
              promptInputRef.current?.focus();
              toastManager.add({
                type: "info",
                title: "New Terminal Opened",
                description: `Created dedicated session: Terminal ${store.terminalTabs.length + 1}`,
              });
            }}
            title="Open New Terminal Session (+)"
            className="flex items-center gap-1 px-2 py-1 rounded-[5px] text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-3xs transition-all cursor-pointer shrink-0"
          >
            <Plus className="size-3" />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>

        {/* Right Action Controls: Scope Pill + Clear + Copy + Close */}
        <div className="flex items-center gap-1.5 text-zinc-400 shrink-0 ml-2">
          {/* Scope indicator badge (Default: Root /) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const nextMode = isRootScope ? "project" : "root";
              terminalStore.setScopeMode(nextMode);
              toastManager.add({
                type: "info",
                title:
                  nextMode === "root"
                    ? "Switched to Root (/)"
                    : `Switched to Project (${projectTitle})`,
                description:
                  nextMode === "root"
                    ? "Commands will execute from Linux VPS root (/)."
                    : `Commands will execute in ${projectPath}`,
              });
            }}
            title={`Current Scope: ${isRootScope ? "Root (/)" : `Project (${projectTitle})`}. Click to toggle.`}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-4xs font-semibold transition-all cursor-pointer border active:scale-95 shrink-0",
              isRootScope
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-sky-500/15 text-sky-400 border-sky-500/30",
            )}
          >
            {isRootScope ? (
              <>
                <Server className="size-2.5 shrink-0 text-emerald-400" />
                <span>root@vps (/)</span>
              </>
            ) : (
              <>
                <FolderGit2 className="size-2.5 shrink-0 text-sky-400" />
                <span>{projectTitle}</span>
              </>
            )}
          </button>

          {/* Ask AI to Fix Button (on error) */}
          {(latestRun?.status === "error" ||
            (latestRun?.exitCode !== undefined && latestRun?.exitCode !== 0) ||
            (latestRun?.stderr && latestRun.stderr.length > 0)) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAskAiToFix();
              }}
              title="Ask AI to fix this terminal error"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 text-4xs transition-all cursor-pointer active:scale-95"
            >
              <Sparkles className="size-2.5 text-purple-400" />
              <span>Fix with AI</span>
            </button>
          )}

          {/* Copy Output */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopyOutput();
            }}
            title="Copy Terminal Output"
            className="p-1 rounded-[4px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          </button>

          {/* SSH Keys trigger */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              terminalStore.setSshSheetOpen(true);
            }}
            title="Manage SSH Keys & Remote Servers"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.06] text-4xs transition-colors cursor-pointer"
          >
            <Key className="size-2.5 text-amber-400" />
            <span>SSH</span>
          </button>

          {/* Clear Console */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              terminalStore.clearRuns(activeTabId);
              setLatestRun(null);
              setLogsOutput(null);
            }}
            title="Clear Console Output"
            className="px-1.5 py-0.5 rounded-[4px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] text-4xs transition-colors cursor-pointer"
          >
            Clear
          </button>

          {/* Close Panel Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              terminalStore.setQuickBarOpen(false);
            }}
            title="Close Terminal Studio"
            className="p-1 rounded-[4px] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer ml-0.5"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. PROPER TERMINAL SCREEN (WITH INLINE ACTIVE SHELL PROMPT)    */}
      {/* ============================================================== */}
      <div
        ref={terminalScreenRef}
        className="flex-1 p-3 overflow-y-auto text-3xs leading-relaxed space-y-2 bg-[#050508] text-zinc-200 select-text [scrollbar-width:thin] scroll-smooth font-mono cursor-text"
        onClick={() => promptInputRef.current?.focus()}
      >
        {/* Terminal Header Banner */}
        <div className="text-zinc-500 pb-1.5 border-b border-white/[0.06] select-none flex items-center justify-between text-4xs">
          <span>AutoCode Linux VPS Terminal v2.5 (Host: root@{scopeName})</span>
          <span className="text-zinc-600">cwd: {effectiveCwd}</span>
        </div>

        {/* TAB: BASH EXECUTION SCREEN */}
        {!isLogsTab && (
          <>
            {/* Sudo Permission Required Prompt Card */}
            {isPermissionError && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="p-2.5 rounded-[6px] bg-amber-500/10 border border-amber-500/30 flex flex-col gap-1.5 shadow-sm animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-2xs">
                    <ShieldAlert className="size-3.5 shrink-0 text-amber-400" />
                    <span>Permission Required (Exit {latestRun?.exitCode})</span>
                  </div>
                </div>
                <p className="text-4xs text-zinc-300 font-sans leading-relaxed">
                  This command requires root elevation in{" "}
                  <code className="text-amber-300 font-mono bg-black/40 px-1 py-0.5 rounded text-4xs">
                    {effectiveCwd}
                  </code>
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => latestRun && handleAllowOnce(latestRun.command)}
                    disabled={isRunning}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-4xs shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Check className="size-2.5" />
                    <span>Run with Sudo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => latestRun && handleAllowAlways(latestRun.command)}
                    disabled={isRunning}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium text-4xs shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Zap className="size-2.5" />
                    <span>Always Allow</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeny}
                    disabled={isRunning}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-4xs border border-white/[0.08] active:scale-95 transition-all cursor-pointer"
                  >
                    <X className="size-2.5" />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            )}

            {/* Introductory notice if empty */}
            {runsToDisplay.length === 0 && (
              <div className="text-zinc-600 py-3 select-none text-4xs space-y-0.5">
                <div>
                  Terminal ready in {isRootScope ? "Root (/)" : `Project (${projectTitle})`}.
                </div>
                <div>Type any bash command at the prompt below or click a quick action.</div>
              </div>
            )}

            {/* Historical completed runs */}
            {runsToDisplay.map((run) => (
              <div key={run.id} className="space-y-1 pt-1 border-t border-white/[0.04]">
                <div className="flex items-center justify-between text-zinc-400">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-emerald-400 font-semibold select-none">
                      root@{scopeName}:{formatPromptPath(run.cwd)}#
                    </span>
                    <span className="text-white font-semibold select-text">{run.command}</span>
                  </div>
                  <span
                    className={cn(
                      "text-4xs px-1.5 py-0.2 rounded font-mono shrink-0 select-none",
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
                  <div className="text-zinc-600 italic pl-2 text-4xs">
                    (Command executed with no output)
                  </div>
                )}
                {!run.stdout && !run.stderr && run.status === "error" && (
                  <div className="text-rose-400/80 italic pl-2 text-4xs">
                    (Command exited with status code {run.exitCode ?? 1})
                  </div>
                )}
                {!run.stdout && !run.stderr && run.status === "running" && (
                  <div className="flex items-center gap-1.5 text-zinc-400 italic py-0.5 pl-2">
                    <Loader2 className="size-3 animate-spin text-emerald-400" />
                    <span>Executing on VPS host...</span>
                  </div>
                )}
              </div>
            ))}

            {/* ACTIVE INLINE PROMPT (Authentic CLI prompt directly inside the terminal) */}
            <div className="pt-2 flex items-center gap-1.5 text-zinc-200">
              <span className="text-emerald-400 font-mono font-bold select-none shrink-0">
                root@{scopeName}:{cwdDisplay}#
              </span>
              <input
                ref={promptInputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isRunning}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="flex-1 min-w-0 bg-transparent text-3xs font-mono text-zinc-100 placeholder:text-zinc-700 focus:outline-none"
                placeholder={isRunning ? "Executing..." : ""}
              />
              {isRunning && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleKill();
                  }}
                  title="Stop execution (Ctrl+C)"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/30 hover:bg-rose-500 text-rose-300 hover:text-white transition-all cursor-pointer shrink-0 text-4xs font-mono"
                >
                  <Square className="size-2 fill-current" />
                  <span>Stop</span>
                </button>
              )}
            </div>
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
                onClick={(e) => {
                  e.stopPropagation();
                  void handleLoadLogs();
                }}
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
              <div className="text-zinc-500 italic py-2 text-4xs">
                Click Refresh Logs to fetch service journalctl logs.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 2.5 MOBILE HACKER KEYBOARD ACCESSORY TOOLBAR (Concept 2)       */}
      {/* ============================================================== */}
      <div
        className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0a0a0f] border-t border-white/[0.08] overflow-x-auto [scrollbar-width:none] shrink-0 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            setCommand("");
            promptInputRef.current?.focus();
          }}
          className="px-2 py-1 rounded-[5px] bg-[#161622] active:bg-white/[0.15] text-zinc-300 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1]"
        >
          ESC
        </button>
        <button
          type="button"
          onClick={() => {
            setCommand((prev) => prev + "  ");
            promptInputRef.current?.focus();
          }}
          className="px-2 py-1 rounded-[5px] bg-[#161622] active:bg-white/[0.15] text-zinc-300 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1]"
        >
          TAB
        </button>
        <button
          type="button"
          onClick={() => void handleKill()}
          disabled={!isRunning}
          className={cn(
            "px-2 py-1 rounded-[5px] font-mono text-3xs font-semibold shrink-0 border transition-all",
            isRunning
              ? "bg-rose-500/20 active:bg-rose-500/40 text-rose-300 border-rose-500/40 shadow-xs"
              : "bg-[#161622] text-zinc-500 border-white/[0.06] opacity-60",
          )}
        >
          Ctrl+C
        </button>
        <button
          type="button"
          onClick={() => {
            setCommand((prev) => prev + " | ");
            promptInputRef.current?.focus();
          }}
          className="px-2 py-1 rounded-[5px] bg-[#161622] active:bg-white/[0.15] text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30"
        >
          |
        </button>
        <button
          type="button"
          onClick={() => {
            setCommand((prev) => prev + "~");
            promptInputRef.current?.focus();
          }}
          className="px-2 py-1 rounded-[5px] bg-[#161622] active:bg-white/[0.15] text-cyan-400 font-mono text-3xs font-bold shrink-0 border border-cyan-500/30"
        >
          ~
        </button>
        <button
          type="button"
          onClick={() => {
            setCommand((prev) => prev + "/");
            promptInputRef.current?.focus();
          }}
          className="px-2 py-1 rounded-[5px] bg-[#161622] active:bg-white/[0.15] text-zinc-200 font-mono text-3xs font-bold shrink-0 border border-white/[0.1]"
        >
          /
        </button>
        <button
          type="button"
          onClick={() => void handleExecute("cd ..")}
          className="px-2 py-1 rounded-[5px] bg-[#161622] active:bg-white/[0.15] text-amber-300 font-mono text-3xs font-semibold shrink-0 border border-amber-500/30"
        >
          cd ..
        </button>
        <button
          type="button"
          onClick={() => {
            terminalStore.clearRuns(activeTabId);
            setLatestRun(null);
            setLogsOutput(null);
          }}
          className="px-2 py-1 rounded-[5px] bg-[#161622] active:bg-white/[0.15] text-zinc-400 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1]"
        >
          clear
        </button>
        <button
          type="button"
          onClick={() => {
            if (store.history.length === 0) return;
            const nextIndex =
              historyIndex === null ? store.history.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(nextIndex);
            const histCmd = store.history[nextIndex];
            if (histCmd) setCommand(histCmd);
            promptInputRef.current?.focus();
          }}
          className="px-2.5 py-1 rounded-[5px] bg-[#161622] active:bg-white/[0.15] text-zinc-300 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1]"
          title="Previous command"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => {
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
            promptInputRef.current?.focus();
          }}
          className="px-2.5 py-1 rounded-[5px] bg-[#161622] active:bg-white/[0.15] text-zinc-300 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1]"
          title="Next command"
        >
          ▼
        </button>
      </div>

      {/* ============================================================== */}
      {/* 3. BOTTOM SUGGESTIONS ROW (Categorized Smart Action Buttons)   */}
      {/* ============================================================== */}
      <div
        className="px-2.5 py-1.5 bg-[#0c0c11] border-t border-white/[0.08] shrink-0 select-none space-y-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Category Filter Badges */}
        <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] px-0.5">
          {suggestionCategories.map((cat) => {
            const count =
              cat.id === "all"
                ? smartSuggestions.length
                : smartSuggestions.filter((s) => s.category === cat.id).length;
            const isSelected = suggestionCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSuggestionCategory(cat.id)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-4xs font-mono font-medium shrink-0 transition-all cursor-pointer border active:scale-95",
                  isSelected
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs font-semibold"
                    : "bg-white/[0.03] text-zinc-400 hover:text-zinc-200 border-white/[0.06] hover:bg-white/[0.06]",
                )}
              >
                <span>{cat.label}</span>
                <span
                  className={cn(
                    "px-1 py-0.1 rounded text-[9px]",
                    isSelected
                      ? "bg-emerald-400/20 text-emerald-300 font-bold"
                      : "bg-black/40 text-zinc-500",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* LINE 1 (Ooper Wali Line): Command Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] py-0.5 px-0.5">
          {row1Suggestions.map((item) => (
            <button
              key={"row1_" + item.cmd}
              type="button"
              onClick={() => void handleExecute(item.cmd)}
              disabled={isRunning}
              title={`Click to execute on VPS:\n$ ${item.cmd}`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[#14141d] hover:bg-[#1f1f2d] border border-white/[0.08] hover:border-emerald-500/40 text-left transition-all cursor-pointer shrink-0 active:scale-95 group shadow-xs"
            >
              <span className="text-3xs font-medium text-zinc-300 group-hover:text-emerald-400 transition-colors">
                {item.title}
              </span>
              <span className="text-4xs font-mono text-zinc-500 group-hover:text-zinc-400">
                ${item.cmd.length > 22 ? item.cmd.slice(0, 20) + "..." : item.cmd}
              </span>
            </button>
          ))}
        </div>

        {/* LINE 2 (Neechy Wali Line): Command Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] py-0.5 px-0.5">
          {row2Suggestions.map((item) => (
            <button
              key={"row2_" + item.cmd}
              type="button"
              onClick={() => void handleExecute(item.cmd)}
              disabled={isRunning}
              title={`Click to execute on VPS:\n$ ${item.cmd}`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[#14141d] hover:bg-[#1f1f2d] border border-white/[0.08] hover:border-emerald-500/40 text-left transition-all cursor-pointer shrink-0 active:scale-95 group shadow-xs"
            >
              <span className="text-3xs font-medium text-zinc-300 group-hover:text-emerald-400 transition-colors">
                {item.title}
              </span>
              <span className="text-4xs font-mono text-zinc-500 group-hover:text-zinc-400">
                ${item.cmd.length > 22 ? item.cmd.slice(0, 20) + "..." : item.cmd}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* SSH Keys & Remote Servers Management Sheet */}
      <SshKeysSheet />
    </div>
  );
});

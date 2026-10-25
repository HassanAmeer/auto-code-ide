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
  Minus,
  Type,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
import { AiTerminalHeaderStrip } from "./AiTerminalHeaderStrip";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

export interface AiTerminalCommandBarProps {
  projectCwd?: string | undefined;
  activeProject?: EnvironmentProject | null | undefined;
  className?: string | undefined;
}

export const AiTerminalCommandBar = memo(function AiTerminalCommandBar({
  projectCwd,
  activeProject,
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

  // Terminal Output Font Size (Persisted in localStorage with 12px default, min 4px)
  const [terminalFontSize, setTerminalFontSize] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("adc_terminal_font_size");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 4 && parsed <= 72) return parsed;
      }
    }
    return 12;
  });

  const handleSetFontSize = useCallback((newSize: number) => {
    const clamped = Math.max(4, Math.min(72, newSize));
    setTerminalFontSize(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("adc_terminal_font_size", String(clamped));
    }
  }, []);

  const [isFontSizeOpen, setIsFontSizeOpen] = useState(false);
  const fontSizeDropdownRef = useRef<HTMLDivElement>(null);
  const [customSizeInput, setCustomSizeInput] = useState<string>(() => String(terminalFontSize));

  useEffect(() => {
    setCustomSizeInput(String(terminalFontSize));
  }, [terminalFontSize]);

  useEffect(() => {
    if (!isFontSizeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (fontSizeDropdownRef.current && !fontSizeDropdownRef.current.contains(e.target as Node)) {
        setIsFontSizeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFontSizeOpen]);

  const FONT_PRESETS = [4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32];

  const promptInputRef = useRef<HTMLInputElement>(null);
  const terminalScreenRef = useRef<HTMLDivElement>(null);
  const suggestionsScrollRef = useRef<HTMLDivElement>(null);

  const handleInsertToken = useCallback(
    (token: string) => {
      if (promptInputRef.current) {
        const input = promptInputRef.current;
        const start = input.selectionStart ?? command.length;
        const end = input.selectionEnd ?? command.length;
        const next = command.slice(0, start) + token + command.slice(end);
        setCommand(next);
        input.focus();
        setTimeout(() => {
          const nextPos = start + token.length;
          input.setSelectionRange(nextPos, nextPos);
        }, 0);
      } else {
        setCommand((prev) => prev + token);
      }
    },
    [command],
  );

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
    { id: "logs", label: "Logs 📜" },
    { id: "git", label: "Git 🌿" },
    { id: "network", label: "Network 🌐" },
    { id: "docker", label: "Docker 🐳" },
    { id: "processes", label: "Processes ⚡" },
    { id: "database", label: "Database 🗄️" },
    { id: "security", label: "Security 🛡️" },
    { id: "cleanup", label: "Cleanup 🧹" },
  ];

  const smartSuggestions: Array<{
    category:
      | "system"
      | "services"
      | "logs"
      | "git"
      | "network"
      | "docker"
      | "processes"
      | "database"
      | "security"
      | "cleanup";
    title: string;
    cmd: string;
  }> = [
    // 📊 SYSTEM & RESOURCES
    { category: "system", title: "📁 List Directory", cmd: "ls -lah" },
    { category: "system", title: "💾 Check Free RAM", cmd: "free -h" },
    { category: "system", title: "💿 Disk Usage", cmd: "df -h /" },
    { category: "system", title: "⏱ VPS Uptime & Load", cmd: "uptime" },
    {
      category: "system",
      title: "🖥️ OS & Kernel Info",
      cmd: "uname -srm && cat /etc/os-release | grep PRETTY",
    },
    { category: "system", title: "📊 Inode Usage", cmd: "df -ih /" },
    {
      category: "system",
      title: "🔥 CPU Cores & Model",
      cmd: "lscpu | grep -E 'Model name|CPU\\(s\\):|Thread'",
    },
    { category: "system", title: "🔋 Swap Usage", cmd: "swapon --show 2>/dev/null || free -h" },
    {
      category: "system",
      title: "📂 Disk I/O Stats",
      cmd: "iostat 1 2 2>/dev/null || vmstat 1 2",
    },

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
    { category: "services", title: "🧪 Test Nginx Config", cmd: "nginx -t" },
    { category: "services", title: "🔄 Reload Nginx", cmd: "systemctl reload nginx" },
    { category: "services", title: "🔍 Failed Services", cmd: "systemctl --failed" },
    {
      category: "services",
      title: "📋 Running Services",
      cmd: "systemctl list-units --type=service --state=running | head -n 15",
    },
    {
      category: "services",
      title: "⏰ Crontab Jobs",
      cmd: "crontab -l 2>/dev/null || echo 'No crontab for current user'",
    },
    {
      category: "services",
      title: "🔄 Reload Systemd",
      cmd: "systemctl daemon-reload",
    },

    // 📜 SYSTEM & SERVICE LOGS
    {
      category: "logs",
      title: "📜 Tail AutoJobs (50)",
      cmd: "journalctl -u autojobs.service -n 50 --no-pager",
    },
    {
      category: "logs",
      title: "🔴 AutoJobs Errors",
      cmd: "journalctl -u autojobs.service -p err -n 25 --no-pager",
    },
    {
      category: "logs",
      title: "🌐 Nginx Error Log",
      cmd: "tail -n 35 /var/log/nginx/error.log 2>/dev/null || echo 'No nginx error log'",
    },
    {
      category: "logs",
      title: "🌐 Nginx Access Log",
      cmd: "tail -n 25 /var/log/nginx/access.log 2>/dev/null || echo 'No nginx access log'",
    },
    {
      category: "logs",
      title: "🚨 Boot Errors",
      cmd: "journalctl -b -p err -n 30 --no-pager",
    },
    {
      category: "logs",
      title: "🖥️ Kernel Messages (dmesg)",
      cmd: "dmesg -T | tail -n 25",
    },
    {
      category: "logs",
      title: "🔒 Auth / SSH Log",
      cmd: "tail -n 25 /var/log/auth.log 2>/dev/null || journalctl -u ssh -n 25 --no-pager",
    },
    {
      category: "logs",
      title: "📜 Syslog Tail",
      cmd: "tail -n 30 /var/log/syslog 2>/dev/null || journalctl -n 30 --no-pager",
    },

    // 🌿 GIT & REPOSITORY
    { category: "git", title: "⚡ Git Status", cmd: "git status" },
    { category: "git", title: "🔄 Pull Latest Code", cmd: "git pull origin main" },
    { category: "git", title: "📜 Recent Git Logs", cmd: "git log --oneline --graph -n 8" },
    { category: "git", title: "🌱 Git Branches", cmd: "git branch -a" },
    { category: "git", title: "🔍 Git Diff Stat", cmd: "git diff --stat" },
    { category: "git", title: "🌿 Git Fetch Prune", cmd: "git fetch --all --prune" },
    { category: "git", title: "📦 Git Stash List", cmd: "git stash list" },
    { category: "git", title: "🔗 Git Remote URLs", cmd: "git remote -v" },
    { category: "git", title: "📦 Node & PNPM Ver", cmd: "node -v && pnpm -v && git --version" },
    { category: "git", title: "🏷️ Recent Tags", cmd: "git tag -l -n1 | tail -n 5" },

    // 🌐 NETWORK & PORTS
    { category: "network", title: "🔌 Active Ports", cmd: "ss -tulpn | grep LISTEN" },
    { category: "network", title: "🌐 Public IP Check", cmd: "curl -s4 ifconfig.me" },
    { category: "network", title: "🏓 Ping Test (DNS)", cmd: "ping -c 3 8.8.8.8" },
    {
      category: "network",
      title: "📡 Established TCP",
      cmd: "ss -tan state established | head -n 15",
    },
    { category: "network", title: "🌐 Route Table", cmd: "ip route show" },
    { category: "network", title: "🔍 Resolv DNS", cmd: "cat /etc/resolv.conf" },
    { category: "network", title: "🛡️ Firewall (UFW)", cmd: "ufw status verbose" },
    { category: "network", title: "⚡ Interface IPs", cmd: "ip -brief address" },
    {
      category: "network",
      title: "🔎 Port 3000 Check",
      cmd: "lsof -i :3000 2>/dev/null || ss -tulpn | grep 3000",
    },
    {
      category: "network",
      title: "🔎 Port 80/443 Check",
      cmd: "ss -tulpn | grep -E ':80|:443'",
    },

    // 🐳 DOCKER CONTAINERS
    {
      category: "docker",
      title: "🐳 Running Containers",
      cmd: "docker ps 2>/dev/null || echo 'Docker not running'",
    },
    {
      category: "docker",
      title: "📋 All Containers",
      cmd: "docker ps -a 2>/dev/null || echo 'Docker not running'",
    },
    {
      category: "docker",
      title: "📊 Container Stats",
      cmd: "docker stats --no-stream 2>/dev/null || echo 'Docker not running'",
    },
    {
      category: "docker",
      title: "🖼️ Docker Images",
      cmd: "docker images 2>/dev/null || echo 'Docker not running'",
    },
    {
      category: "docker",
      title: "📜 Latest Docker Logs",
      cmd: "docker logs --tail 50 $(docker ps -q | head -n 1) 2>/dev/null || echo 'No container running'",
    },
    {
      category: "docker",
      title: "🐙 Compose Containers",
      cmd: "docker compose ps 2>/dev/null || docker-compose ps 2>/dev/null || echo 'Compose not found'",
    },
    {
      category: "docker",
      title: "🧹 Docker Disk Usage",
      cmd: "docker system df 2>/dev/null || echo 'Docker not running'",
    },
    {
      category: "docker",
      title: "🔄 Docker Daemon Status",
      cmd: "systemctl status docker --no-pager 2>/dev/null || echo 'Docker service not found'",
    },

    // ⚡ PROCESSES & RUNTIME
    { category: "processes", title: "🔥 Top CPU Tasks", cmd: "ps aux --sort=-%cpu | head -n 10" },
    {
      category: "processes",
      title: "🧠 Top Memory Tasks",
      cmd: "ps aux --sort=-%mem | head -n 10",
    },
    {
      category: "processes",
      title: "🌳 Process Tree",
      cmd: "pstree -ap 2>/dev/null || ps -ejH | head -n 25",
    },
    {
      category: "processes",
      title: "💀 Zombie Processes",
      cmd: "ps aux | awk '{if ($8 ~ /Z/) print $0}' || echo 'No zombie processes'",
    },
    {
      category: "processes",
      title: "⚡ Node.js Processes",
      cmd: "pgrep -a node || echo 'No node process found'",
    },
    {
      category: "processes",
      title: "🐍 Python Processes",
      cmd: "pgrep -a python || echo 'No python process found'",
    },
    { category: "processes", title: "📂 Open Files Limit", cmd: "cat /proc/sys/fs/file-nr" },
    {
      category: "processes",
      title: "🛑 Kill Port 3000",
      cmd: "fuser -k 3000/tcp 2>/dev/null || echo 'Port 3000 free'",
    },

    // 🗄️ DATABASE & CACHE
    {
      category: "database",
      title: "🐘 PostgreSQL Status",
      cmd: "systemctl status postgresql --no-pager 2>/dev/null || echo 'PostgreSQL not installed'",
    },
    {
      category: "database",
      title: "⚡ Redis Ping Test",
      cmd: "redis-cli ping 2>/dev/null || systemctl status redis --no-pager 2>/dev/null || echo 'Redis not running'",
    },
    {
      category: "database",
      title: "🐬 MySQL / MariaDB Status",
      cmd: "systemctl status mysql --no-pager 2>/dev/null || systemctl status mariadb --no-pager 2>/dev/null || echo 'MySQL not installed'",
    },
    {
      category: "database",
      title: "📦 Prisma Migration Status",
      cmd: "pnpm prisma migrate status 2>/dev/null || npx prisma migrate status 2>/dev/null || echo 'Prisma not found'",
    },
    {
      category: "database",
      title: "📁 Find SQLite DBs",
      cmd: "find . -maxdepth 3 -name '*.sqlite' -o -name '*.db' 2>/dev/null | head -n 6",
    },

    // 🛡️ SECURITY & ACCESS
    { category: "security", title: "🛡️ UFW Rules List", cmd: "ufw status numbered" },
    { category: "security", title: "👥 Active Users", cmd: "who && w" },
    {
      category: "security",
      title: "🚫 Failed SSH Logins",
      cmd: "grep 'Failed password' /var/log/auth.log 2>/dev/null | tail -n 10 || journalctl -u ssh -g 'Failed' -n 10 --no-pager",
    },
    { category: "security", title: "🔄 Recent Reboots", cmd: "last reboot | head -n 5" },
    {
      category: "security",
      title: "👤 Sudoers Group",
      cmd: "getent group sudo || getent group wheel",
    },
    {
      category: "security",
      title: "🔑 Listening Sockets",
      cmd: "netstat -tuln 2>/dev/null || ss -tuln",
    },
    {
      category: "security",
      title: "🔒 Check /tmp Permissions",
      cmd: "ls -ld /tmp /var/tmp",
    },

    // 🧹 CLEANUP & UTILITIES
    {
      category: "cleanup",
      title: "📁 Find Large Files (>100M)",
      cmd: "find / -xdev -type f -size +100M 2>/dev/null | head -n 10",
    },
    { category: "cleanup", title: "🧹 Vacuum Journals (3d)", cmd: "journalctl --vacuum-time=3d" },
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
    {
      category: "cleanup",
      title: "🗑️ Empty Old /tmp Files",
      cmd: "find /tmp -type f -atime +7 -delete 2>/dev/null || echo '/tmp cleaned'",
    },
    { category: "cleanup", title: "🧹 Clear Screen", cmd: "clear" },
    { category: "cleanup", title: "📂 Current PWD", cmd: "pwd" },
  ];

  const filteredSuggestions =
    suggestionCategory === "all"
      ? smartSuggestions
      : smartSuggestions.filter((item) => item.category === suggestionCategory);

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
      {/* 0. AI TERMINAL HEADER STRIP (Projects, SSH Keys & New Chat)    */}
      {/* ============================================================== */}
      <AiTerminalHeaderStrip
        activeProject={activeProject ?? null}
        onNewTerminalThread={() => {
          window.dispatchEvent(new CustomEvent("t3:new-terminal-thread"));
        }}
      />

      {/* ============================================================== */}
      {/* 1. AUTHENTIC TERMINAL WINDOW TOP BAR & TABS                    */}
      {/* ============================================================== */}
      <div className="flex items-center justify-between px-2.5 h-8 bg-[#0d0d12] border-b border-white/[0.08] select-none text-xs shrink-0">
        {/* Dynamic Multi-Terminal Tabs (Plus Button at FULL LEFT) */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto [scrollbar-width:none]">
          {/* Plus Tab: Add New Terminal Instance (FULL LEFT) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              terminalStore.addTerminalTab();
              promptInputRef.current?.focus();
            }}
            title="Create New Terminal Tab (+)"
            className="flex items-center justify-center p-1 rounded-[4px] text-zinc-400 hover:text-emerald-400 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-3xs transition-all cursor-pointer shrink-0 shadow-xs active:scale-95"
          >
            <Plus className="size-3" />
          </button>

          {store.terminalTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={(e) => {
                  e.stopPropagation();
                  terminalStore.setActiveTabId(tab.id);
                  promptInputRef.current?.focus();
                }}
                className={cn(
                  "group flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-3xs font-semibold border transition-all cursor-pointer active:scale-95 shrink-0 select-none",
                  isActive
                    ? "bg-[#141816] text-emerald-400 border-emerald-500/40 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200 border-white/[0.04] hover:bg-white/[0.04]",
                )}
              >
                <Terminal className="size-2.5 shrink-0 text-emerald-400" />
                <span className="truncate max-w-[120px]">{tab.name}</span>
                {store.terminalTabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      terminalStore.closeTerminalTab(tab.id);
                    }}
                    title="Delete Terminal Tab"
                    className="opacity-70 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition-colors ml-0.5"
                  >
                    <X className="size-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Action Controls: Copy + Font Size + Clear */}
        <div className="flex items-center gap-1.5 text-zinc-400 shrink-0 ml-2">
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

          {/* Custom Pixel Font Size Dropdown Pill (Clean: just "{size}px" and dropdown icon) */}
          <div className="relative shrink-0" ref={fontSizeDropdownRef}>
            <button
              type="button"
              onClick={() => setIsFontSizeOpen((prev) => !prev)}
              title="Change terminal font size (min 4px)"
              className="flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#14141d] hover:bg-[#1c1c28] border border-white/[0.08] hover:border-cyan-500/40 text-zinc-200 hover:text-white transition-all cursor-pointer select-none shadow-xs text-3xs font-mono font-semibold"
            >
              <span>{terminalFontSize}px</span>
              <ChevronDown
                className={cn(
                  "size-2.5 text-zinc-400 transition-transform duration-150 shrink-0",
                  isFontSizeOpen && "rotate-180 text-cyan-400",
                )}
              />
            </button>

            {/* Custom Floating Dropdown Menu */}
            {isFontSizeOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-44 rounded-[8px] bg-[#0e0e16] border border-white/[0.14] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md space-y-2"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Custom Input Header */}
                <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08] text-4xs font-mono gap-1.5">
                  <span className="text-zinc-400 font-medium">Custom Size:</span>
                  <div className="flex items-center gap-1 bg-black/60 border border-white/[0.12] focus-within:border-cyan-400/60 rounded px-1.5 py-0.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={customSizeInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setCustomSizeInput(val);
                        const num = parseInt(val, 10);
                        if (!isNaN(num) && num >= 4 && num <= 72) {
                          handleSetFontSize(num);
                        }
                      }}
                      onBlur={() => {
                        const num = parseInt(customSizeInput, 10);
                        if (isNaN(num) || num < 4) {
                          handleSetFontSize(4);
                          setCustomSizeInput("4");
                        } else if (num > 72) {
                          handleSetFontSize(72);
                          setCustomSizeInput("72");
                        } else {
                          handleSetFontSize(num);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                          setIsFontSizeOpen(false);
                        }
                      }}
                      className="w-6 text-center bg-transparent text-3xs font-mono font-bold text-cyan-300 focus:outline-none p-0 cursor-text"
                      title="Type custom font size (min 4px)"
                    />
                    <span className="text-zinc-500 text-4xs">px</span>
                  </div>
                </div>

                {/* Preset Chips Grid (Starts from 4px) */}
                <div className="grid grid-cols-4 gap-1">
                  {FONT_PRESETS.map((size) => {
                    const isSelected = terminalFontSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          handleSetFontSize(size);
                          setIsFontSizeOpen(false);
                        }}
                        className={cn(
                          "py-1 rounded-[4px] text-3xs font-mono font-medium transition-all cursor-pointer text-center",
                          isSelected
                            ? "bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 font-bold shadow-xs"
                            : "text-zinc-300 hover:text-white hover:bg-white/[0.08] bg-white/[0.03] border border-transparent",
                        )}
                      >
                        {size}px
                      </button>
                    );
                  })}
                </div>

                {/* Range Slider for fast fine-tuning (4px to 48px) */}
                <div className="pt-1.5 border-t border-white/[0.06] space-y-1">
                  <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
                    <span>4px</span>
                    <span className="text-zinc-400">Drag Slider</span>
                    <span>48px</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={48}
                    value={terminalFontSize}
                    onChange={(e) => handleSetFontSize(Number(e.target.value))}
                    className="w-full accent-cyan-400 h-1 bg-white/[0.1] rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

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
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. PROPER TERMINAL SCREEN (WITH INLINE ACTIVE SHELL PROMPT)    */}
      {/* ============================================================== */}
      <div
        ref={terminalScreenRef}
        style={{ fontSize: `${terminalFontSize}px` }}
        className="flex-1 p-2.5 overflow-y-auto leading-relaxed space-y-1.5 bg-[#050508] text-zinc-200 select-text [scrollbar-width:thin] scroll-smooth font-mono cursor-text"
        onClick={() => promptInputRef.current?.focus()}
      >
        {/* Terminal Header Banner */}
        <div className="text-zinc-500 pb-1 border-b border-white/[0.06] select-none flex items-center justify-between text-4xs">
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
                style={{ fontSize: `${terminalFontSize}px` }}
                className="flex-1 min-w-0 bg-transparent font-mono text-zinc-100 placeholder:text-zinc-700 focus:outline-none"
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
                style={{ fontSize: `${terminalFontSize}px` }}
                className="text-zinc-300 whitespace-pre-wrap break-all font-mono"
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
      {/* 2.5 OPERATOR & KEYBOARD TOOLBAR (All Bash Operators & Keys)    */}
      {/* ============================================================== */}
      <div
        className="flex items-center gap-1 px-2 py-0.5 bg-[#0a0a0f] border-t border-white/[0.08] overflow-x-auto [scrollbar-width:none] shrink-0 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ESC */}
        <button
          type="button"
          onClick={() => {
            setCommand("");
            promptInputRef.current?.focus();
          }}
          title="Clear current input line (ESC)"
          className="px-2 py-0.5 rounded-[4px] bg-[#161622] hover:bg-[#222232] active:bg-white/[0.15] text-zinc-300 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1] transition-colors cursor-pointer"
        >
          ESC
        </button>

        {/* TAB */}
        <button
          type="button"
          onClick={() => handleInsertToken("  ")}
          title="Tab indent (2 spaces)"
          className="px-2 py-0.5 rounded-[4px] bg-[#161622] hover:bg-[#222232] active:bg-white/[0.15] text-zinc-300 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1] transition-colors cursor-pointer"
        >
          TAB
        </button>

        {/* Ctrl+C */}
        <button
          type="button"
          onClick={() => {
            if (isRunning) {
              void handleKill();
            } else {
              setCommand("");
              promptInputRef.current?.focus();
            }
          }}
          title={isRunning ? "Interrupt running process (Ctrl+C)" : "Clear input (Ctrl+C)"}
          className={cn(
            "px-2 py-0.5 rounded-[4px] font-mono text-3xs font-semibold shrink-0 border transition-all cursor-pointer",
            isRunning
              ? "bg-rose-500/20 active:bg-rose-500/40 text-rose-300 border-rose-500/40 shadow-xs"
              : "bg-[#161622] hover:bg-[#222232] text-zinc-400 border-white/[0.08]",
          )}
        >
          Ctrl+C
        </button>

        <div className="w-[1px] h-3.5 bg-white/[0.08] shrink-0 mx-0.5" />

        {/* Main Operators */}
        <button
          type="button"
          onClick={() => handleInsertToken(" | ")}
          title="Pipe stdout to next command"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30 transition-colors cursor-pointer"
        >
          |
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken(" && ")}
          title="Logical AND (run if previous succeeded)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30 transition-colors cursor-pointer"
        >
          &&
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken(" || ")}
          title="Logical OR (run if previous failed)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30 transition-colors cursor-pointer"
        >
          ||
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken("; ")}
          title="Command separator"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30 transition-colors cursor-pointer"
        >
          ;
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken(" > ")}
          title="Redirect stdout (overwrite)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30 transition-colors cursor-pointer"
        >
          &gt;
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken(" >> ")}
          title="Redirect stdout (append)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30 transition-colors cursor-pointer"
        >
          &gt;&gt;
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken(" < ")}
          title="Redirect stdin"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30 transition-colors cursor-pointer"
        >
          &lt;
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken(" 2>&1")}
          title="Redirect stderr to stdout"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30 transition-colors cursor-pointer"
        >
          2&gt;&amp;1
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken(" &")}
          title="Run in background (&)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-emerald-500/20 active:bg-emerald-500/30 text-emerald-400 font-mono text-3xs font-bold shrink-0 border border-emerald-500/30 transition-colors cursor-pointer"
        >
          &amp;
        </button>

        <div className="w-[1px] h-3.5 bg-white/[0.08] shrink-0 mx-0.5" />

        {/* Path, Symbols & Modifiers */}
        <button
          type="button"
          onClick={() => handleInsertToken("~")}
          title="Home directory (~)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-400 font-mono text-3xs font-bold shrink-0 border border-cyan-500/30 transition-colors cursor-pointer"
        >
          ~
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken("/")}
          title="Root / Path separator (/)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-400 font-mono text-3xs font-bold shrink-0 border border-cyan-500/30 transition-colors cursor-pointer"
        >
          /
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken("\\")}
          title="Escape / Line continuation (\)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-400 font-mono text-3xs font-bold shrink-0 border border-cyan-500/30 transition-colors cursor-pointer"
        >
          \
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken("+")}
          title="Plus (+)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-400 font-mono text-3xs font-bold shrink-0 border border-cyan-500/30 transition-colors cursor-pointer"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken("-")}
          title="Single dash (-)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-400 font-mono text-3xs font-bold shrink-0 border border-cyan-500/30 transition-colors cursor-pointer"
        >
          -
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken(" --")}
          title="Double dash flag (--)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-400 font-mono text-3xs font-bold shrink-0 border border-cyan-500/30 transition-colors cursor-pointer"
        >
          --
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken("*")}
          title="Wildcard (*)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-400 font-mono text-3xs font-bold shrink-0 border border-cyan-500/30 transition-colors cursor-pointer"
        >
          *
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken("$")}
          title="Shell variable ($)"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-cyan-500/20 active:bg-cyan-500/30 text-cyan-400 font-mono text-3xs font-bold shrink-0 border border-cyan-500/30 transition-colors cursor-pointer"
        >
          $
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken('"')}
          title='Double quote (")'
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-300 font-mono text-3xs font-bold shrink-0 border border-amber-500/30 transition-colors cursor-pointer"
        >
          &quot;
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken("'")}
          title="Single quote (')"
          className="px-2 py-0.5 rounded-[4px] bg-[#14141f] hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-300 font-mono text-3xs font-bold shrink-0 border border-amber-500/30 transition-colors cursor-pointer"
        >
          &#39;
        </button>

        <div className="w-[1px] h-3.5 bg-white/[0.08] shrink-0 mx-0.5" />

        {/* Quick Commands & Navigation */}
        <button
          type="button"
          onClick={() => handleInsertToken("sudo ")}
          title="Insert sudo prefix"
          className="px-2 py-0.5 rounded-[4px] bg-[#181524] hover:bg-purple-500/20 active:bg-purple-500/30 text-purple-300 font-mono text-3xs font-semibold shrink-0 border border-purple-500/30 transition-colors cursor-pointer"
        >
          sudo
        </button>

        <button
          type="button"
          onClick={() => handleInsertToken("grep ")}
          title="Insert grep pattern filter"
          className="px-2 py-0.5 rounded-[4px] bg-[#181524] hover:bg-purple-500/20 active:bg-purple-500/30 text-purple-300 font-mono text-3xs font-semibold shrink-0 border border-purple-500/30 transition-colors cursor-pointer"
        >
          grep
        </button>

        <button
          type="button"
          onClick={() => void handleExecute("cd ..")}
          title="Change to parent directory (cd ..)"
          className="px-2 py-0.5 rounded-[4px] bg-[#161622] hover:bg-[#222232] active:bg-white/[0.15] text-amber-300 font-mono text-3xs font-semibold shrink-0 border border-amber-500/30 transition-colors cursor-pointer"
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
          title="Clear screen runs"
          className="px-2 py-0.5 rounded-[4px] bg-[#161622] hover:bg-[#222232] active:bg-white/[0.15] text-zinc-400 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1] transition-colors cursor-pointer"
        >
          clear
        </button>

        <div className="w-[1px] h-3.5 bg-white/[0.08] shrink-0 mx-0.5" />

        {/* History Navigation */}
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
          className="px-2 py-0.5 rounded-[4px] bg-[#161622] hover:bg-[#222232] active:bg-white/[0.15] text-zinc-300 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1] transition-colors cursor-pointer"
          title="Previous command (Up Arrow)"
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
          className="px-2 py-0.5 rounded-[4px] bg-[#161622] hover:bg-[#222232] active:bg-white/[0.15] text-zinc-300 font-mono text-3xs font-semibold shrink-0 border border-white/[0.1] transition-colors cursor-pointer"
          title="Next command (Down Arrow)"
        >
          ▼
        </button>
      </div>

      {/* ============================================================== */}
      {/* 3. BOTTOM SUGGESTIONS ROW (Single Line + Pagination Arrows)    */}
      {/* ============================================================== */}
      <div
        className="px-2 py-1 bg-[#0c0c11] border-t border-white/[0.08] shrink-0 select-none space-y-1"
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
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-4xs font-mono font-medium shrink-0 transition-all cursor-pointer border active:scale-95",
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

        {/* Single Line of Command Buttons with Left & Right Scroll Pagination Arrows */}
        <div className="flex items-center gap-1">
          {/* Full Left Scroll Arrow Button */}
          <button
            type="button"
            onClick={() => {
              suggestionsScrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
            }}
            title="Scroll to beginning (Full Left)"
            className="p-1 rounded-[5px] bg-[#14141d] hover:bg-[#20202e] border border-white/[0.08] hover:border-emerald-500/40 text-zinc-400 hover:text-emerald-400 transition-all cursor-pointer shrink-0 active:scale-95 shadow-xs"
          >
            <ChevronLeft className="size-3" />
          </button>

          {/* Scrollable single row of command action buttons */}
          <div
            ref={suggestionsScrollRef}
            className="flex-1 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] py-0.5 px-0.5 scroll-smooth"
          >
            {filteredSuggestions.map((item) => (
              <button
                key={item.category + "_" + item.cmd}
                type="button"
                onClick={() => void handleExecute(item.cmd)}
                disabled={isRunning}
                title={`Click to execute on VPS:\n$ ${item.cmd}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded-[5px] bg-[#14141d] hover:bg-[#1f1f2d] border border-white/[0.08] hover:border-emerald-500/40 text-left transition-all cursor-pointer shrink-0 active:scale-95 group shadow-xs whitespace-nowrap"
              >
                <span className="text-3xs font-medium text-zinc-300 group-hover:text-emerald-400 transition-colors">
                  {item.title}
                </span>
                <span className="text-4xs font-mono text-zinc-500 group-hover:text-zinc-400">
                  ${item.cmd.length > 24 ? item.cmd.slice(0, 22) + "..." : item.cmd}
                </span>
              </button>
            ))}
          </div>

          {/* Full Right Scroll Arrow Button */}
          <button
            type="button"
            onClick={() => {
              if (suggestionsScrollRef.current) {
                suggestionsScrollRef.current.scrollTo({
                  left: suggestionsScrollRef.current.scrollWidth,
                  behavior: "smooth",
                });
              }
            }}
            title="Scroll to end (Full Right)"
            className="p-1 rounded-[5px] bg-[#14141d] hover:bg-[#20202e] border border-white/[0.08] hover:border-emerald-500/40 text-zinc-400 hover:text-emerald-400 transition-all cursor-pointer shrink-0 active:scale-95 shadow-xs"
          >
            <ChevronRight className="size-3" />
          </button>
        </div>
      </div>

      {/* SSH Keys & Remote Servers Management Sheet */}
      <SshKeysSheet />
    </div>
  );
});

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
} from "lucide-react";

import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import type { TerminalCommandRun } from "./terminalTypes";
import { TerminalCommandsMenu } from "./TerminalCommandsMenu";
import { toastManager } from "../../ui/toast";

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
  const [latestRun, setLatestRun] = useState<TerminalCommandRun | null>(null);
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

  // Determine active CWD, Scope Mode, and Input Mode:
  const isRootScope = store.scopeMode === "root";
  const isAiMode = store.inputMode === "ai";
  const projectTitle = store.selectedProjectTitle;
  const projectPath = store.lastProjectPath || (store.selectedProjectId ? store.activeCwd : null);

  const effectiveCwd = isRootScope ? "/" : projectPath || projectCwd || store.activeCwd || "/";

  // Label for scope: "Root (/)" if root selected, or project title
  const scopeName = isRootScope ? "Root (/)" : projectTitle || "Project";

  const handleExecute = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed || isRunning) return;

    setIsRunning(true);
    setHistoryIndex(null);
    try {
      const run = await terminalStore.runCommand(trimmed, effectiveCwd, store.inputMode);
      setLatestRun(run);
      setIsOutputCollapsed(false);
      setCommand("");
    } catch (err) {
      console.error("Command execution error:", err);
    } finally {
      setIsRunning(false);
      inputRef.current?.focus();
    }
  }, [command, isRunning, effectiveCwd, store.inputMode]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleExecute();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (store.history.length === 0) return;
      const nextIndex =
        historyIndex === null ? store.history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      const histCmd = store.history[nextIndex];
      if (histCmd) setCommand(histCmd);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
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
      {/* Latest Execution Output Drawer */}
      {latestRun && (
        <div className="rounded-2xl border border-border/70 bg-card/95 shadow-md overflow-hidden backdrop-blur-sm transition-all text-xs">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/40 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-3xs font-semibold text-emerald-400 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400" />$ {latestRun.command}
              </span>
              <span
                className={cn(
                  "text-3xs font-mono px-1.5 py-0.2 rounded-full",
                  latestRun.status === "success"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : latestRun.status === "error"
                      ? "bg-destructive/15 text-destructive border border-destructive/30"
                      : "bg-muted text-muted-foreground",
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
              {/* Ask AI to Fix Button if command failed */}
              {(latestRun.status === "error" ||
                (latestRun.exitCode !== undefined && latestRun.exitCode !== 0) ||
                (latestRun.stderr && latestRun.stderr.length > 0)) && (
                <button
                  type="button"
                  onClick={handleAskAiToFix}
                  title="Ask AI to diagnose and fix this terminal error"
                  className="flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 font-medium text-3xs transition-all cursor-pointer shadow-xs mr-1"
                >
                  <Sparkles className="size-3 text-purple-400" />
                  <span>Fix with AI</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCopyOutput}
                title="Copy output"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
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
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
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
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>

          {!isOutputCollapsed && (
            <div className="p-3 max-h-48 overflow-y-auto font-mono text-3xs leading-relaxed space-y-1 bg-black/40">
              {latestRun.stdout && (
                <pre className="text-zinc-200 whitespace-pre-wrap break-all select-text">
                  {latestRun.stdout}
                </pre>
              )}
              {latestRun.stderr && (
                <pre className="text-rose-400 whitespace-pre-wrap break-all select-text">
                  {latestRun.stderr}
                </pre>
              )}
              {!latestRun.stdout && !latestRun.stderr && latestRun.status === "success" && (
                <span className="text-muted-foreground italic">
                  (Command completed with no output)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Scope & Mode Selector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1 bg-zinc-950/80 border border-zinc-800/80 rounded-xl text-3xs font-mono select-none backdrop-blur-xs">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-zinc-500 font-sans text-4xs uppercase tracking-wider font-semibold shrink-0">
            Scope:
          </span>

          {/* Root Scope Button */}
          <button
            type="button"
            onClick={() => terminalStore.setScopeMode("root")}
            title="Switch to Root (/) - Full Root Access to manage, read, edit, delete, and run any system command"
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-[5px] transition-all cursor-pointer border text-3xs shrink-0",
              isRootScope
                ? "bg-amber-500/15 text-amber-300 border-amber-500/40 font-semibold shadow-xs"
                : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border-zinc-800",
            )}
          >
            <ShieldAlert className="size-2.5 text-amber-400" />
            <span>Root (/)</span>
          </button>

          {/* Project Scope Button */}
          {(projectTitle || projectPath) && (
            <button
              type="button"
              onClick={() => terminalStore.setScopeMode("project")}
              title={`Switch to Project (${projectPath || effectiveCwd})`}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-[5px] transition-all cursor-pointer border text-3xs shrink-0 min-w-0",
                !isRootScope
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 font-semibold shadow-xs"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border-zinc-800",
              )}
            >
              <Folder className="size-2.5 text-emerald-400 shrink-0" />
              <span className="truncate max-w-[110px] sm:max-w-[180px]">
                {projectTitle || "Project"}
              </span>
            </button>
          )}

          {/* Mode Switcher: Direct Bash vs AI Commander */}
          <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-zinc-800 shrink-0">
            <button
              type="button"
              onClick={() => terminalStore.setInputMode("bash")}
              title="Direct Bash Shell Execution (commands run verbatim)"
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-[5px] transition-all cursor-pointer border text-3xs shrink-0",
                !isAiMode
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 font-semibold shadow-xs"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border-zinc-800",
              )}
            >
              <Terminal className="size-2.5" />
              <span>Direct Bash</span>
            </button>
            <button
              type="button"
              onClick={() => terminalStore.setInputMode("ai")}
              title="AI Commander Mode: Natural language prompts (Roman Urdu/English) are translated & executed"
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-[5px] transition-all cursor-pointer border text-3xs shrink-0",
                isAiMode
                  ? "bg-purple-500/20 text-purple-200 border-purple-500/50 font-semibold shadow-xs"
                  : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border-zinc-800",
              )}
            >
              <Sparkles className="size-2.5 text-purple-400" />
              <span>AI Commander</span>
            </button>
          </div>
        </div>

        {/* Path Indicator */}
        <div className="flex items-center gap-1 text-4xs text-zinc-400 truncate max-w-[150px] sm:max-w-[280px] ml-auto font-mono">
          <span className="text-zinc-600 shrink-0">path:</span>
          <span className="text-zinc-300 truncate" title={effectiveCwd}>
            {effectiveCwd}
          </span>
        </div>
      </div>

      {/* Sleek Single-Line Command Input Bar */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl bg-card/90 px-3 py-1.5 shadow-sm transition-all border",
          isAiMode
            ? "border-purple-500/40 focus-within:border-purple-500/70 focus-within:ring-2 focus-within:ring-purple-500/20"
            : "border-emerald-500/35 focus-within:border-emerald-500/70 focus-within:ring-2 focus-within:ring-emerald-500/20",
        )}
      >
        {/* Dropdown Button with Scope Badge (root or Project Name) */}
        <button
          type="button"
          onClick={() => setShowCommandsMenu(true)}
          title={`Common Commands Dropdown (${scopeName})`}
          className={cn(
            "flex items-center gap-1.5 px-2 h-6 rounded-[5px] border transition-all cursor-pointer shrink-0 shadow-xs",
            isAiMode
              ? "bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/30"
              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          )}
        >
          <span className="font-mono text-3xs font-semibold max-w-[120px] sm:max-w-[150px] truncate">
            {scopeName}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-80" />
        </button>

        {/* Terminal or AI Icon & Prompt */}
        <div
          className={cn(
            "flex items-center gap-1.5 shrink-0 select-none",
            isAiMode ? "text-purple-400" : "text-emerald-400",
          )}
        >
          {isAiMode ? (
            <Sparkles className="size-3.5 animate-pulse" />
          ) : (
            <Terminal className="size-3.5" />
          )}
          <span
            className="font-mono text-3xs font-semibold text-muted-foreground hidden sm:inline"
            title={`CWD: ${effectiveCwd}`}
          >
            {isAiMode ? "ai:" : !isRootScope ? `${scopeName}:` : "/:"}
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
            isAiMode
              ? !isRootScope
                ? `Ask AI to check, deploy, or run in ${scopeName} (e.g. 'last commit dekho', 'deploy karo', 'push to git')...`
                : "Ask AI to manage VPS root (e.g. 'swap memory check karo', 'autojobs restart karo', 'storage dekho')..."
              : !isRootScope
                ? `Run command in ${scopeName} (${effectiveCwd})...`
                : "Run root command in / (full system access: read, edit, delete, admin)..."
          }
          className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none font-mono"
        />

        {/* Send / Run Button */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleExecute}
            disabled={!command.trim() || isRunning}
            title={isAiMode ? "Execute with AI (Enter)" : "Execute Command (Enter)"}
            className={cn(
              "inline-flex items-center justify-center size-7 rounded-xl transition-all cursor-pointer",
              command.trim() && !isRunning
                ? isAiMode
                  ? "bg-purple-600 hover:bg-purple-700 text-white shadow-xs"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs"
                : "text-muted-foreground/40 hover:text-muted-foreground cursor-not-allowed",
            )}
          >
            {isRunning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isAiMode ? (
              <Sparkles className="size-3.5" />
            ) : (
              <SendHorizontal className="size-3.5" />
            )}
          </button>

          {/* Close Bar Button */}
          <button
            type="button"
            onClick={() => terminalStore.setQuickBarOpen(false)}
            title="Close Terminal Bar"
            className="inline-flex items-center justify-center size-7 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Categorized Common Commands Modal */}
      <TerminalCommandsMenu
        isOpen={showCommandsMenu}
        onClose={() => setShowCommandsMenu(false)}
        onSelectCommand={(cmd, autoRun) => {
          setCommand(cmd);
          if (autoRun) {
            void handleExecute();
          } else {
            inputRef.current?.focus();
          }
        }}
      />
    </div>
  );
});

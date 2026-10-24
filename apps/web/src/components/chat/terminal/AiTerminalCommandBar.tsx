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
import { isNaturalLanguagePrompt, translatePromptToBashCommand } from "./terminalClient";
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

  // Determine active CWD and Scope Mode:
  const isRootScope = store.scopeMode === "root";
  const projectTitle = store.selectedProjectTitle;
  const projectPath = store.lastProjectPath || (store.selectedProjectId ? store.activeCwd : null);

  const effectiveCwd = isRootScope ? "/" : projectPath || projectCwd || store.activeCwd || "/";
  const scopeName = isRootScope ? "root" : projectTitle || "project";

  const handleExecute = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed || isRunning) return;

    // Check if user input is natural language intended for AI thinking/tool-calling
    const isNatural = isNaturalLanguagePrompt(trimmed);
    const translated = isNatural
      ? translatePromptToBashCommand(
          trimmed,
          effectiveCwd,
          store.accessKeys.filter((k) => k.enabled),
        )
      : trimmed;

    // If it's natural language and didn't map to a raw bash shortcut, route directly to AI Chat
    if (isNatural && translated === trimmed) {
      window.dispatchEvent(
        new CustomEvent("t3:insert-speech-text", {
          detail: { text: trimmed, autoSend: true },
        }),
      );
      setCommand("");
      toastManager.add({
        type: "info",
        title: "Sent to AI Assistant",
        description: "Executing your request with AI assistant...",
      });
      return;
    }

    setIsRunning(true);
    setHistoryIndex(null);
    try {
      const run = await terminalStore.runCommand(trimmed, effectiveCwd);
      setLatestRun(run);
      setIsOutputCollapsed(false);
      setCommand("");
    } catch (err) {
      console.error("Command execution error:", err);
    } finally {
      setIsRunning(false);
      inputRef.current?.focus();
    }
  }, [command, isRunning, effectiveCwd, store.accessKeys]);

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
        <div className="rounded-[8px] border border-white/[0.08] bg-[#141416]/95 shadow-md overflow-hidden backdrop-blur-xl transition-all text-xs">
          <div className="flex items-center justify-between px-2.5 py-1 bg-white/[0.03] border-b border-white/[0.06] select-none">
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

          {!isOutputCollapsed && (
            <div className="p-2.5 max-h-44 overflow-y-auto font-mono text-3xs leading-relaxed space-y-1 bg-black/50">
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
                <span className="text-zinc-500 italic">(Command completed with no output)</span>
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

        {/* Send / Run Button */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleExecute}
            disabled={!command.trim() || isRunning}
            title="Execute Command (Enter)"
            className={cn(
              "inline-flex items-center justify-center size-[26px] rounded-[6px] transition-all cursor-pointer",
              command.trim() && !isRunning
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs active:scale-[0.96]"
                : "text-zinc-600 hover:text-zinc-400 cursor-not-allowed",
            )}
          >
            {isRunning ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <SendHorizontal className="size-3" />
            )}
          </button>

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

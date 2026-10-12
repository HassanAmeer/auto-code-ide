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
} from "lucide-react";

import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import type { TerminalCommandRun } from "./terminalTypes";

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
  const inputRef = useRef<HTMLInputElement>(null);

  // Do not auto-focus on mount — let the chat composer keep focus.

  // Update latestRun when runs change
  useEffect(() => {
    if (store.runs.length > 0) {
      setLatestRun(store.runs[0] ?? null);
    }
  }, [store.runs]);

  const effectiveCwd = projectCwd || store.activeCwd || "/";

  const handleExecute = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed || isRunning) return;

    setIsRunning(true);
    setHistoryIndex(null);
    try {
      const run = await terminalStore.runCommand(trimmed, effectiveCwd, "bash");
      setLatestRun(run);
      setIsOutputCollapsed(false);
      setCommand("");
    } catch (err) {
      console.error("Command execution error:", err);
    } finally {
      setIsRunning(false);
      inputRef.current?.focus();
    }
  }, [command, isRunning, effectiveCwd]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleExecute();
      return;
    }

    // Command history traversal with ArrowUp / ArrowDown
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const history = store.history;
      if (history.length === 0) return;
      const nextIndex = historyIndex === null ? 0 : Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex] ?? "");
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex - 1;
      if (nextIndex < 0) {
        setHistoryIndex(null);
        setCommand("");
      } else {
        setHistoryIndex(nextIndex);
        setCommand(store.history[nextIndex] ?? "");
      }
      return;
    }

    if (e.key === "Escape") {
      terminalStore.setQuickBarOpen(false);
    }
  };

  const handleCopyOutput = useCallback(() => {
    if (!latestRun) return;
    const text = [`$ ${latestRun.command}`, latestRun.stdout, latestRun.stderr]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [latestRun]);

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

      {/* Sleek Single-Line Command Input Bar */}
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/35 bg-card/90 px-3 py-1.5 shadow-sm focus-within:border-emerald-500/70 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
        {/* Terminal Icon & Prompt */}
        <div className="flex items-center gap-1.5 shrink-0 select-none text-emerald-400">
          <Terminal className="size-3.5" />
          <span className="font-mono text-3xs font-semibold text-muted-foreground hidden sm:inline">
            cmd:
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
          placeholder="Run shell command directly (e.g. ls -la, git status, bun run dev)..."
          className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none font-mono"
        />

        {/* Send / Run Button */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleExecute}
            disabled={!command.trim() || isRunning}
            title="Execute Command (Enter)"
            className={cn(
              "inline-flex items-center justify-center size-7 rounded-xl transition-all cursor-pointer",
              command.trim() && !isRunning
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs"
                : "text-muted-foreground/40 hover:text-muted-foreground cursor-not-allowed",
            )}
          >
            {isRunning ? (
              <Loader2 className="size-3.5 animate-spin" />
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
    </div>
  );
});

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Terminal,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Sparkles,
  X,
  ArrowRight,
  Folder,
  Server,
  Globe,
  Key,
  Search,
  Square,
  Wrench,
  AlertTriangle,
  Play,
} from "lucide-react";
import type { TerminalCommandRun } from "./terminalTypes";
import { terminalStore } from "./terminalStore";
import { parseAnsiToHtml, stripAnsiCodes } from "./ansiParser";

export interface TerminalCommandBoxProps {
  run: TerminalCommandRun;
  onSelectSuggestion?: ((command: string) => void) | undefined;
  onDismiss?: (() => void) | undefined;
}

export function TerminalCommandBox({
  run,
  onSelectSuggestion,
  onDismiss,
}: TerminalCommandBoxProps) {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedOut, setCopiedOut] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const outputContainerRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom while running
  useEffect(() => {
    if (run.status === "running" && outputContainerRef.current) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight;
    }
  }, [run.stdout, run.stderr, run.status]);

  const handleCopyCmd = useCallback(() => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(run.command);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1500);
  }, [run.command]);

  const handleCopyOut = useCallback(() => {
    if (!navigator.clipboard) return;
    const cleanOut = stripAnsiCodes(run.stdout);
    const cleanErr = stripAnsiCodes(run.stderr);
    const text = [cleanOut, cleanErr].filter(Boolean).join("\n");
    void navigator.clipboard.writeText(text);
    setCopiedOut(true);
    setTimeout(() => setCopiedOut(false), 1500);
  }, [run.stdout, run.stderr]);

  const handleRerun = useCallback(async () => {
    setIsRerunning(true);
    try {
      await terminalStore.runCommand(run.command, run.cwd, "bash");
    } finally {
      setIsRerunning(false);
    }
  }, [run.command, run.cwd]);

  const handleKill = useCallback(async () => {
    setIsKilling(true);
    try {
      await terminalStore.killRunningCommand(run.id);
    } finally {
      setIsKilling(false);
    }
  }, [run.id]);

  const handleApplyFix = useCallback(async () => {
    if (!run.suggestedFix?.suggestedFixCommand) return;
    const fixCmd = run.suggestedFix.suggestedFixCommand;
    if (onSelectSuggestion) {
      onSelectSuggestion(fixCmd);
    } else {
      await terminalStore.runCommand(fixCmd, run.cwd, "bash");
    }
  }, [run.suggestedFix, run.cwd, onSelectSuggestion]);

  const hasOutput = Boolean(run.stdout || run.stderr);
  const isSsh = run.targetHost?.startsWith("SSH:");

  // ANSI parsed HTML
  const stdoutHtml = useMemo(() => parseAnsiToHtml(run.stdout), [run.stdout]);
  const stderrHtml = useMemo(() => parseAnsiToHtml(run.stderr), [run.stderr]);

  // Output filtering for search
  const filteredStdoutLines = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const lines = run.stdout.split("\n");
    const q = searchQuery.toLowerCase();
    return lines.filter((l) => stripAnsiCodes(l).toLowerCase().includes(q));
  }, [run.stdout, searchQuery]);

  const searchMatchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    const q = searchQuery.toLowerCase();
    const cleanOut = stripAnsiCodes(run.stdout).toLowerCase();
    const cleanErr = stripAnsiCodes(run.stderr).toLowerCase();
    const countOut = (cleanOut.match(new RegExp(q, "g")) || []).length;
    const countErr = (cleanErr.match(new RegExp(q, "g")) || []).length;
    return countOut + countErr;
  }, [run.stdout, run.stderr, searchQuery]);

  return (
    <div className="w-full my-2.5 flex flex-col gap-2 font-sans select-text">
      {/* 1. Terminal Window Frame */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0c1017] shadow-xl text-zinc-100 transition-all">
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-[#161b22] px-3.5 py-2 text-xs select-none">
          {/* macOS traffic light dots & window title */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-[#ff5f56]/90 border border-[#e0443e]/40" />
              <span className="size-3 rounded-full bg-[#ffbd2e]/90 border border-[#dea123]/40" />
              <span className="size-3 rounded-full bg-[#27c93f]/90 border border-[#1aab29]/40" />
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-xs pl-1">
              {isSsh ? (
                <Globe className="size-3.5 text-sky-400" />
              ) : (
                <Terminal className="size-3.5 text-emerald-400" />
              )}
              <span className="font-semibold text-zinc-200">{isSsh ? "remote-ssh" : "bash"}</span>
              <span className="text-zinc-600">·</span>
              <span
                className="flex items-center gap-1 text-zinc-400 max-w-56 truncate"
                title={run.targetHost || run.cwd}
              >
                {isSsh ? (
                  <Server className="size-3 text-sky-400/80" />
                ) : (
                  <Folder className="size-3 text-amber-400/80" />
                )}
                <span>{run.targetHost ? run.targetHost : run.cwd}</span>
              </span>
              {run.activeKeys && run.activeKeys.length > 0 && (
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 text-3xs font-mono"
                  title={`Executed with credentials from: ${run.activeKeys.map((k) => k.name).join(", ")}`}
                >
                  <Key className="size-2.5 text-amber-400" />
                  <span>{run.activeKeys.map((k) => k.name).join(", ")}</span>
                </span>
              )}
            </div>
          </div>

          {/* Status Badge & Controls */}
          <div className="flex items-center gap-2">
            {/* Status indicator */}
            {run.status === "running" ? (
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
                  <span className="size-1.5 rounded-full bg-amber-400" />
                  Streaming Live...
                </span>
                {/* Active Kill / Cancel button */}
                <button
                  type="button"
                  onClick={handleKill}
                  disabled={isKilling}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-2xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                  title="Send SIGTERM / SIGKILL to cancel process (Ctrl+C)"
                >
                  <Square className="size-2.5 fill-rose-400 text-rose-400" />
                  <span>{isKilling ? "Killing..." : "Kill (Ctrl+C)"}</span>
                </button>
              </div>
            ) : run.status === "success" ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Check className="size-3" />
                Exit 0 {run.durationMs > 0 && `· ${run.durationMs}ms`}
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                <X className="size-3" />
                Exit {run.exitCode ?? 1} {run.durationMs > 0 && `· ${run.durationMs}ms`}
              </span>
            )}

            {/* Quick Actions */}
            <div className="flex items-center gap-1 text-zinc-400 border-l border-zinc-800/80 pl-2">
              {/* Output Search Button */}
              {hasOutput && (
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  className={`p-1 rounded transition-colors ${
                    isSearchOpen
                      ? "bg-primary/20 text-primary"
                      : "hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                  title="Search terminal output"
                >
                  <Search className="size-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={handleRerun}
                disabled={isRerunning || run.status === "running"}
                className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-40"
                title="Re-run command"
              >
                <RotateCw className={`size-3.5 ${isRerunning ? "animate-spin" : ""}`} />
              </button>

              <button
                type="button"
                onClick={handleCopyCmd}
                className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                title={copiedCmd ? "Copied command!" : "Copy command"}
              >
                {copiedCmd ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>

              {hasOutput && (
                <button
                  type="button"
                  onClick={handleCopyOut}
                  className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                  title={copiedOut ? "Copied clean output!" : "Copy terminal output"}
                >
                  <span className="text-2xs font-mono">{copiedOut ? "✓" : "out"}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                title={isCollapsed ? "Expand output" : "Collapse output"}
              >
                {isCollapsed ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronUp className="size-3.5" />
                )}
              </button>

              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="p-1 rounded hover:bg-zinc-800 hover:text-rose-400 transition-colors"
                  title="Dismiss terminal box"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* In-Terminal Search Filter Bar */}
        {isSearchOpen && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-[#0e141e] border-b border-zinc-800 text-xs">
            <Search className="size-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in output (regex or keyword)..."
              className="flex-1 bg-transparent border-0 text-zinc-200 text-xs focus:outline-none placeholder:text-zinc-600"
              autoFocus
            />
            {searchQuery && (
              <span className="text-3xs font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                {searchMatchCount} {searchMatchCount === 1 ? "match" : "matches"}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setIsSearchOpen(false);
              }}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-300"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        {/* Terminal Content Body */}
        <div className="p-3.5 font-mono text-xs leading-relaxed">
          {/* AI Prompt label (if triggered from natural language mode) */}
          {run.mode === "ai" && run.aiPrompt && (
            <div className="flex items-center gap-1.5 text-2xs text-primary mb-1.5 font-sans font-medium">
              <Sparkles className="size-3" />
              <span>Prompt: "{run.aiPrompt}"</span>
            </div>
          )}

          {/* Command execution line */}
          <div className="flex items-start gap-2 text-sm text-zinc-100 font-semibold mb-2">
            <span className="text-emerald-400 select-none font-bold">$</span>
            <span className="break-all">{run.command}</span>
          </div>

          {/* Collapsible stdout / stderr */}
          {!isCollapsed && (
            <div
              ref={outputContainerRef}
              className="mt-2.5 rounded-lg bg-[#070a0f] p-3 border border-zinc-900 overflow-y-auto max-h-96 scrollbar-thin scrollbar-thumb-zinc-800"
            >
              {run.status === "running" ? (
                <div className="flex items-center justify-between text-zinc-400 italic text-2xs py-1 mb-2 border-b border-zinc-800/50 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>Streaming live process output...</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleKill}
                    disabled={isKilling}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-3xs font-mono not-italic hover:bg-rose-500/30"
                  >
                    <Square className="size-2 fill-rose-400" />
                    <span>{isKilling ? "Sending SIGKILL..." : "Cancel (Ctrl+C)"}</span>
                  </button>
                </div>
              ) : null}

              {/* Render Search Filtered Lines OR ANSI Parsed HTML */}
              {filteredStdoutLines ? (
                <div className="whitespace-pre-wrap font-mono text-xs text-zinc-300">
                  {filteredStdoutLines.length > 0 ? (
                    filteredStdoutLines.map((line, idx) => (
                      <div key={idx} dangerouslySetInnerHTML={{ __html: parseAnsiToHtml(line) }} />
                    ))
                  ) : (
                    <span className="text-zinc-500 italic text-2xs">
                      No lines matching "{searchQuery}"
                    </span>
                  )}
                </div>
              ) : (
                <>
                  {stdoutHtml ? (
                    <div
                      className="whitespace-pre-wrap font-mono text-xs text-zinc-300 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: stdoutHtml }}
                    />
                  ) : null}

                  {stderrHtml ? (
                    <div
                      className="whitespace-pre-wrap font-mono text-xs text-rose-400/90 mt-1 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: stderrHtml }}
                    />
                  ) : null}
                </>
              )}

              {!hasOutput && run.status !== "running" ? (
                <div className="text-zinc-500 italic text-2xs">
                  (Process exited with code {run.exitCode ?? 0} with no output stream)
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* 2. 1-Click "Fix with AI" Auto-Healer Card (Non-Zero Exit Code) */}
      {run.suggestedFix && run.exitCode !== 0 && run.status !== "running" && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5 text-xs text-foreground shadow-md transition-all animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 font-semibold text-rose-400">
              <Wrench className="size-3.5 text-rose-400" />
              <span>AI Auto-Healer & Root Cause</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-3xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Exit Code {run.exitCode ?? 1}
            </span>
          </div>

          <div className="text-zinc-200 font-medium mb-1">{run.suggestedFix.cause}</div>
          <p className="text-zinc-400 text-2xs leading-relaxed font-sans mb-3">
            {run.suggestedFix.explanation}
          </p>

          {/* 1-Click Action Button */}
          {run.suggestedFix.suggestedFixCommand && (
            <div className="flex items-center gap-2 pt-2 border-t border-rose-500/20">
              <button
                type="button"
                onClick={handleApplyFix}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow hover:shadow-emerald-900/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="size-3 fill-white" />
                <span>Run 1-Click Fix: {run.suggestedFix.fixLabel || "Auto-Repair"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!navigator.clipboard || !run.suggestedFix?.suggestedFixCommand) return;
                  void navigator.clipboard.writeText(run.suggestedFix.suggestedFixCommand);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-2xs border border-zinc-700/60 transition-colors"
                title="Copy suggested fix command"
              >
                <Copy className="size-3" />
              </button>

              <span className="text-3xs font-mono text-zinc-500 truncate max-w-64">
                $ {run.suggestedFix.suggestedFixCommand}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3. AI Explanation & Next Steps Section */}
      {run.explanation && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground shadow-sm">
          <div className="flex items-center gap-2 mb-2 font-semibold text-primary">
            <Sparkles className="size-3.5" />
            <span>AI Explanation & Status</span>
          </div>

          <p className="text-zinc-300 leading-relaxed font-sans mb-3">{run.explanation}</p>

          {/* Suggested Next Steps / Commands */}
          {run.nextSteps && run.nextSteps.length > 0 && (
            <div className="pt-2 border-t border-border/30">
              <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Recommended Next Commands:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {run.nextSteps.map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() =>
                      onSelectSuggestion
                        ? onSelectSuggestion(step)
                        : void terminalStore.runCommand(step, run.cwd, "bash")
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/60 hover:bg-secondary text-secondary-foreground font-mono text-2xs border border-border/40 hover:border-primary/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span>$ {step}</span>
                    <ArrowRight className="size-2.5 text-primary" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

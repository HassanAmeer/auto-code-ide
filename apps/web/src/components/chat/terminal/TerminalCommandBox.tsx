import { useState, useCallback } from "react";
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
} from "lucide-react";
import type { TerminalCommandRun } from "./terminalTypes";
import { terminalStore } from "./terminalStore";

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

  const handleCopyCmd = useCallback(() => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(run.command);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1500);
  }, [run.command]);

  const handleCopyOut = useCallback(() => {
    if (!navigator.clipboard) return;
    const text = [run.stdout, run.stderr].filter(Boolean).join("\n");
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

  const hasOutput = Boolean(run.stdout || run.stderr);
  const isSsh = run.targetHost?.startsWith("SSH:");

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
            </div>
          </div>

          {/* Status Badge & Controls */}
          <div className="flex items-center gap-2">
            {/* Status indicator */}
            {run.status === "running" ? (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
                <span className="size-1.5 rounded-full bg-amber-400" />
                Running...
              </span>
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
                  title={copiedOut ? "Copied output!" : "Copy terminal output"}
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
            <div className="mt-2.5 rounded-lg bg-[#070a0f] p-3 border border-zinc-900 overflow-hidden">
              {run.status === "running" ? (
                <div className="flex items-center gap-2 text-zinc-400 italic text-2xs py-1">
                  <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
                  Executing process in background...
                </div>
              ) : null}

              {run.stdout ? (
                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-zinc-300 scrollbar-thin scrollbar-thumb-zinc-800">
                  {run.stdout}
                </pre>
              ) : null}

              {run.stderr ? (
                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-rose-400/90 mt-1 scrollbar-thin scrollbar-thumb-zinc-800">
                  {run.stderr}
                </pre>
              ) : null}

              {!hasOutput && run.status !== "running" ? (
                <div className="text-zinc-500 italic text-2xs">
                  (Process exited with code {run.exitCode ?? 0} with no output stream)
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* 2. AI Explanation & Next Steps Section */}
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

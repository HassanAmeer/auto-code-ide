import { memo, useRef, useEffect, useState } from "react";
import {
  Terminal,
  Play,
  RotateCw,
  Copy,
  Check,
  Sparkles,
  Trash2,
  Folder,
  ShieldAlert,
  Server,
  Loader2,
  HardDrive,
  Cpu,
  Clock,
  Activity,
  Layers,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import type { TerminalCommandRun } from "./terminalTypes";
import { toastManager } from "../../ui/toast";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

export interface AiTerminalTimelineProps {
  activeProject?: EnvironmentProject | null;
  onClose?: () => void;
  className?: string;
}

const QUICK_COMMANDS = [
  { label: "Last Changes & Diff", cmd: "git log -1 -p --stat", icon: Folder },
  { label: "Memory & 10GB Swap", cmd: "free -h && swapon --show", icon: Cpu },
  {
    label: "Jobi Service Status",
    cmd: "systemctl status autojobs.service --no-pager",
    icon: Activity,
  },
  { label: "Disk Space (NVMe)", cmd: "df -h /", icon: HardDrive },
  { label: "Top RAM Processes", cmd: "ps aux --sort=-%mem | head -n 10", icon: Layers },
  { label: "System Uptime", cmd: "uptime", icon: Clock },
];

export const AiTerminalTimeline = memo(function AiTerminalTimeline({
  activeProject,
  onClose,
  className = "",
}: AiTerminalTimelineProps) {
  const store = useTerminalStore();
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeChat = store.terminalChats.find((c) => c.id === store.activeChatId);
  const runs = store.runs;

  // Auto-scroll to bottom on new run or chunk
  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [runs.length, runs[0]?.stdout, runs[0]?.stderr]);

  const handleCopy = (run: TerminalCommandRun) => {
    const text = [run.stdout, run.stderr].filter(Boolean).join("\n");
    void navigator.clipboard.writeText(text);
    setCopiedId(run.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRerun = (cmd: string) => {
    void terminalStore.runCommand(cmd);
  };

  const handleAskAiToFix = (run: TerminalCommandRun) => {
    const prompt = `I ran the terminal command:\n\`${run.command}\`\n\nIt failed with exit code ${run.exitCode ?? "error"}.\nOutput / Error:\n\`\`\`\n${run.stderr || run.stdout || "Command failed with no output"}\n\`\`\`\nPlease diagnose the root cause and provide the exact fixed command.`;
    window.dispatchEvent(new CustomEvent("t3:insert-speech-text", { detail: { text: prompt } }));
    toastManager.add({
      type: "info",
      title: "Sent to AI Chat",
      description: "Error diagnosis prompt inserted into composer.",
    });
  };

  const effectiveCwd =
    store.scopeMode === "root"
      ? "/"
      : store.lastProjectPath || store.activeCwd || activeProject?.workspaceRoot || "/";

  return (
    <div
      className={cn(
        "flex flex-col flex-1 h-full min-h-0 bg-[#0c0c0e] text-zinc-100 overflow-hidden font-sans select-text",
        className,
      )}
    >
      {/* AI Terminal Sub-Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center size-6 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Terminal className="size-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs text-zinc-100 truncate">
                {activeChat?.title || "AI Terminal Chat"}
              </span>
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <span className="text-4xs text-zinc-500 font-mono truncate">
              Scope:{" "}
              {store.scopeMode === "root" ? "Root (/)" : store.selectedProjectTitle || "Project"} ·{" "}
              {effectiveCwd}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {runs.length > 0 && (
            <button
              type="button"
              onClick={() => terminalStore.clearRuns()}
              title="Clear terminal session output"
              className="flex items-center gap-1 px-2 py-1 rounded-[5px] text-3xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-800 transition-colors cursor-pointer"
            >
              <Trash2 className="size-3" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Terminal Timeline Canvas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {runs.length === 0 ? (
          /* Empty / Ready State Screen */
          <div className="flex flex-col items-center justify-center min-h-[360px] h-full text-center max-w-lg mx-auto py-8 animate-in fade-in-50 duration-300">
            <div className="relative mb-4">
              <div className="size-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
                <Terminal className="size-7" />
              </div>
              <span className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-emerald-500 border-2 border-zinc-950 flex items-center justify-center">
                <span className="size-1.5 rounded-full bg-white animate-ping" />
              </span>
            </div>

            <h3 className="text-base font-semibold text-zinc-100 mb-1">AI Terminal Ready</h3>
            <p className="text-xs text-zinc-400 max-w-sm mb-4 leading-relaxed">
              Full shell execution access enabled. Run host commands with root access, read, edit,
              delete, or manage services.
            </p>

            {/* Scope & Working Directory Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-3xs font-mono mb-6 text-zinc-300">
              {store.scopeMode === "root" ? (
                <>
                  <ShieldAlert className="size-3 text-amber-400 shrink-0" />
                  <span className="text-amber-300 font-semibold">Root (/)</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400">Full System Access</span>
                </>
              ) : (
                <>
                  <Folder className="size-3 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300 font-semibold">
                    {store.selectedProjectTitle || "Project"}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400 truncate max-w-[200px]">{effectiveCwd}</span>
                </>
              )}
            </div>

            {/* Quick One-Click Command Suggestions */}
            <div className="w-full text-left">
              <span className="text-4xs font-mono uppercase tracking-wider text-zinc-500 mb-2 block font-semibold">
                Quick Diagnostic Commands:
              </span>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_COMMANDS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.cmd}
                      type="button"
                      onClick={() => handleRerun(item.cmd)}
                      className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-zinc-700 text-left transition-all group cursor-pointer"
                    >
                      <Icon className="size-3.5 text-emerald-400/80 group-hover:text-emerald-300 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-3xs font-medium text-zinc-200 truncate">
                          {item.label}
                        </div>
                        <div className="text-4xs font-mono text-zinc-500 truncate group-hover:text-zinc-400">
                          $ {item.cmd}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Execution History Cards (Rendered chronological from oldest to newest) */
          [...runs].reverse().map((run) => (
            <div
              key={run.id}
              className="rounded-2xl border border-zinc-800/90 bg-zinc-950/90 shadow-sm overflow-hidden backdrop-blur-sm transition-all"
            >
              {/* Natural Language AI Prompt Banner (if triggered via AI Commander) */}
              {run.aiPrompt && (
                <div className="flex items-center gap-2 px-3.5 py-1.5 bg-purple-950/40 border-b border-purple-800/30 text-3xs font-medium text-purple-200 select-none">
                  <Sparkles className="size-3 text-purple-400 shrink-0" />
                  <span className="text-zinc-400 font-sans text-4xs uppercase tracking-wider font-semibold">
                    AI Intent:
                  </span>
                  <span className="text-purple-200 truncate font-mono">"{run.aiPrompt}"</span>
                </div>
              )}

              {/* Card Header: Command & Status */}
              <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/60 border-b border-zinc-800/80 select-none">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-semibold text-emerald-400 flex items-center gap-1.5 truncate">
                    <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />${" "}
                    {run.command}
                  </span>
                  <span
                    className={cn(
                      "text-4xs font-mono px-2 py-0.5 rounded-full shrink-0 border",
                      run.status === "running"
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        : run.status === "success"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/30",
                    )}
                  >
                    {run.status === "running" ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="size-2.5 animate-spin" />
                        Running...
                      </span>
                    ) : run.exitCode !== null ? (
                      `exit ${run.exitCode}`
                    ) : (
                      run.status
                    )}
                  </span>
                  {run.durationMs > 0 && (
                    <span className="text-4xs font-mono text-zinc-500 hidden sm:inline">
                      {run.durationMs}ms
                    </span>
                  )}
                  <span className="text-4xs font-mono text-zinc-600 truncate hidden md:inline">
                    [{run.cwd}]
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Ask AI to fix button if command failed */}
                  {(run.status === "error" || (run.exitCode !== null && run.exitCode !== 0)) && (
                    <button
                      type="button"
                      onClick={() => handleAskAiToFix(run)}
                      title="Ask AI assistant to analyze and fix this error"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-purple-600/25 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 font-medium text-4xs transition-all cursor-pointer shadow-xs mr-1"
                    >
                      <Sparkles className="size-2.5 text-purple-400" />
                      <span>Fix with AI</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRerun(run.command)}
                    title="Rerun command"
                    className="p-1 rounded-[4px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <RotateCw className="size-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopy(run)}
                    title="Copy output"
                    className="p-1 rounded-[4px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    {copiedId === run.id ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Card Body: Console Output */}
              <div className="p-3.5 font-mono text-3xs leading-relaxed space-y-1 bg-black/60 overflow-x-auto max-h-80 overflow-y-auto">
                {run.stdout && (
                  <pre className="text-zinc-200 whitespace-pre-wrap break-all select-text font-mono">
                    {run.stdout}
                  </pre>
                )}
                {run.stderr && (
                  <pre className="text-rose-400 whitespace-pre-wrap break-all select-text font-mono">
                    {run.stderr}
                  </pre>
                )}
                {!run.stdout && !run.stderr && run.status === "success" && (
                  <span className="text-zinc-500 italic">(Command executed with no output)</span>
                )}
                {run.status === "running" && !run.stdout && !run.stderr && (
                  <span className="text-zinc-500 flex items-center gap-1.5 italic">
                    <Loader2 className="size-3 animate-spin text-emerald-400" />
                    Waiting for output...
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomAnchorRef} />
      </div>
    </div>
  );
});

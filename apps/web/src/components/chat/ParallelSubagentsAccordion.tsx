import { memo, useEffect, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Layers,
} from "lucide-react";
import { cn } from "../../lib/utils";

export interface TelemetryWorker {
  id: string;
  role: string;
  status: "running" | "completed" | "failed";
  model: string;
  cwd?: string;
  goal?: string;
  progress?: number;
  projectName?: string;
  startedAt?: number;
  completedAt?: number;
  filesModified?: string[];
  streamingLogs?: string[];
}

export interface ParallelSubagentsAccordionProps {
  activeProjectName?: string;
  activeProjectId?: string;
  className?: string;
}

export const ParallelSubagentsAccordion = memo(function ParallelSubagentsAccordion({
  activeProjectName,
  activeProjectId,
  className,
}: ParallelSubagentsAccordionProps) {
  const [workers, setWorkers] = useState<TelemetryWorker[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [expandedLogWorkerId, setExpandedLogWorkerId] = useState<string | null>(null);

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch("/api/super-agent/workers");
      if (!res.ok) return;
      const data = await res.json();
      const rawWorkers: TelemetryWorker[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.workers)
          ? data.workers
          : [];

      // Filter by active project if available, otherwise show all active/recent
      const filtered = rawWorkers.filter((w) => {
        if (!activeProjectName && !activeProjectId) return true;
        if (
          w.projectName &&
          activeProjectName &&
          w.projectName.toLowerCase() === activeProjectName.toLowerCase()
        ) {
          return true;
        }
        return false;
      });

      setWorkers(filtered.length > 0 ? filtered : rawWorkers);
    } catch {
      // Ignore background fetch error
    }
  }, [activeProjectName, activeProjectId]);

  useEffect(() => {
    void fetchWorkers();

    const handleUpdate = () => {
      void fetchWorkers();
    };

    window.addEventListener("super-agent-state-updated", handleUpdate);
    window.addEventListener("t3-subagents-changed", handleUpdate);
    window.addEventListener("t3-goals-changed", handleUpdate);

    // Poll every 3s while component is mounted
    const interval = setInterval(fetchWorkers, 3000);

    return () => {
      window.removeEventListener("super-agent-state-updated", handleUpdate);
      window.removeEventListener("t3-subagents-changed", handleUpdate);
      window.removeEventListener("t3-goals-changed", handleUpdate);
      clearInterval(interval);
    };
  }, [fetchWorkers]);

  // If no workers exist, do not render anything
  if (workers.length === 0) {
    return null;
  }

  const runningWorkers = workers.filter((w) => w.status === "running");
  const isAnyRunning = runningWorkers.length > 0;
  const completedCount = workers.filter((w) => w.status === "completed").length;

  return (
    <div
      className={cn(
        "my-3 mx-4 rounded-xl border border-border/40 bg-background/80 shadow-sm backdrop-blur-sm transition-all overflow-hidden",
        isAnyRunning ? "border-cyan-500/30 ring-1 ring-cyan-500/10" : "border-emerald-500/20",
        className,
      )}
    >
      {/* Header Bar */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isAnyRunning ? (
            <CircleDashed className="size-4 shrink-0 text-cyan-400 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
          )}

          <div className="flex items-center gap-1.5 truncate font-medium text-foreground">
            <Layers className="size-3.5 text-muted-foreground shrink-0" />
            <span>Parallel Autonomous Subagents</span>
            <span
              className={cn(
                "ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                isAnyRunning
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 animate-pulse"
                  : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
              )}
            >
              {isAnyRunning
                ? `${runningWorkers.length} Active`
                : `${completedCount}/${workers.length} Completed`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground shrink-0">
          <span className="text-[10px] text-muted-foreground/80 hidden sm:inline">
            Isolated Git Worktrees
          </span>
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </div>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div className="border-t border-border/20 px-3.5 py-2.5 space-y-2.5 bg-muted/10">
          {workers.map((worker) => {
            const isRunning = worker.status === "running";
            const isCompleted = worker.status === "completed";
            const isFailed = worker.status === "failed";
            const progress = worker.progress ?? (isCompleted ? 100 : isRunning ? 45 : 0);
            const isLogsOpen = expandedLogWorkerId === worker.id;

            return (
              <div
                key={worker.id}
                className={cn(
                  "rounded-lg border p-2.5 text-xs transition-colors",
                  isRunning
                    ? "border-cyan-500/30 bg-cyan-950/10"
                    : isCompleted
                      ? "border-emerald-500/20 bg-emerald-950/5"
                      : "border-border/30 bg-card/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isRunning ? (
                      <CircleDashed className="size-3 text-cyan-400 animate-spin shrink-0" />
                    ) : isCompleted ? (
                      <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="size-3 text-rose-400 shrink-0" />
                    )}
                    <span className="font-semibold text-foreground truncate">
                      {worker.role || "Autonomous Worker"}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      ({worker.model || "DeepSeek"})
                    </span>
                  </div>

                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wider shrink-0",
                      isRunning
                        ? "text-cyan-400 font-semibold"
                        : isCompleted
                          ? "text-emerald-400"
                          : "text-rose-400",
                    )}
                  >
                    {worker.status}
                  </span>
                </div>

                {worker.goal && (
                  <p className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                    {worker.goal}
                  </p>
                )}

                {/* Progress Bar */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-border/40 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isRunning
                          ? "bg-gradient-to-r from-cyan-500 to-emerald-400 animate-pulse"
                          : isCompleted
                            ? "bg-emerald-500"
                            : "bg-rose-500",
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-8 text-right">
                    {progress}%
                  </span>
                </div>

                {/* Files or Logs Preview if available */}
                {worker.filesModified && worker.filesModified.length > 0 && (
                  <div className="mt-2 text-[10px] text-muted-foreground/80 flex items-center gap-1.5">
                    <span className="font-medium text-foreground/70">Files touched:</span>
                    <span className="truncate">{worker.filesModified.slice(0, 3).join(", ")}</span>
                    {worker.filesModified.length > 3 && (
                      <span>(+{worker.filesModified.length - 3} more)</span>
                    )}
                  </div>
                )}

                {worker.streamingLogs && worker.streamingLogs.length > 0 && (
                  <div className="mt-2 pt-1 border-t border-border/20">
                    <button
                      type="button"
                      onClick={() => setExpandedLogWorkerId(isLogsOpen ? null : worker.id)}
                      className="flex items-center gap-1 text-[10px] text-cyan-400/80 hover:text-cyan-300 font-mono"
                    >
                      <Terminal className="size-2.5" />
                      <span>{isLogsOpen ? "Hide live logs" : "View live output stream"}</span>
                    </button>
                    {isLogsOpen && (
                      <div className="mt-1.5 max-h-32 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[10px] text-emerald-300/90 space-y-0.5">
                        {worker.streamingLogs.slice(-10).map((log, idx) => (
                          <div key={idx} className="leading-tight">
                            {log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

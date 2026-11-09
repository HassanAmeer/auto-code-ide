import { memo, useEffect, useState, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Layers,
  Pause,
  Play,
  OctagonX,
  GitCompareArrows,
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
  activeProjectName?: string | undefined;
  activeProjectId?: string | undefined;
  className?: string | undefined;
}

export const ParallelSubagentsAccordion = memo(function ParallelSubagentsAccordion({
  activeProjectName,
  activeProjectId,
  className,
}: ParallelSubagentsAccordionProps) {
  const [workers, setWorkers] = useState<TelemetryWorker[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [expandedLogWorkerId, setExpandedLogWorkerId] = useState<string | null>(null);
  const wasAnyRunningRef = useRef(false);

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

      // Strict project scoping: only show workers assigned to the active
      // project; never fall back to other projects' workers.
      const filtered = rawWorkers.filter((w) => {
        if (!activeProjectName && !activeProjectId) return false;
        const nameMatch =
          w.projectName &&
          activeProjectName &&
          w.projectName.toLowerCase() === activeProjectName.toLowerCase();
        const idMatch =
          w.projectId && activeProjectId && String(w.projectId) === String(activeProjectId);
        return Boolean(nameMatch || idMatch);
      });

      // Freshness gate: only running workers, or recently finished ones.
      // Anything older than 90s is stale history and hidden from the card.
      const FRESH_WINDOW_MS = 90_000;
      const freshCutoff = Date.now() - FRESH_WINDOW_MS;
      const freshWorkers = filtered.filter(
        (w) => w.status === "running" || (w.completedAt ?? 0) > freshCutoff,
      );

      setWorkers(freshWorkers);
    } catch {
      // Ignore background fetch error
    }
  }, [activeProjectName, activeProjectId]);

  useEffect(() => {
    if (isPaused) return;

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
  }, [fetchWorkers, isPaused]);

  // Auto-collapse into a compact status pill once every worker finishes.
  const isAnyRunningNow = workers.some((w) => w.status === "running");
  useEffect(() => {
    if (wasAnyRunningRef.current && !isAnyRunningNow && workers.length > 0) {
      setIsOpen(false);
    }
    wasAnyRunningRef.current = isAnyRunningNow;
  }, [isAnyRunningNow, workers.length]);

  const handleStopAll = useCallback(async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await fetch("/api/super-agent/workers/stop-all", { method: "POST" });
      window.dispatchEvent(new CustomEvent("super-agent-state-updated"));
      await fetchWorkers();
    } catch {
      // best effort — telemetry refresh will resync
    } finally {
      setIsStopping(false);
    }
  }, [fetchWorkers, isStopping]);

  // If no workers exist, do not render anything
  if (workers.length === 0) {
    return null;
  }

  const runningWorkers = workers.filter((w) => w.status === "running");
  const isAnyRunning = runningWorkers.length > 0;
  const completedCount = workers.filter((w) => w.status === "completed").length;
  const totalChangedFiles = new Set(workers.flatMap((w) => w.filesModified ?? [])).size;

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
            {isPaused ? "Paused by you" : isAnyRunning ? "Isolated Git Worktrees" : "All Completed"}
          </span>
          {isAnyRunning && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPaused((prev) => !prev);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
                title={isPaused ? "Resume live worker stream" : "Pause live worker stream"}
              >
                {isPaused ? (
                  <>
                    <Play className="size-3" />
                    <span>Resume All</span>
                  </>
                ) : (
                  <>
                    <Pause className="size-3" />
                    <span>Pause All</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleStopAll();
                }}
                disabled={isStopping}
                className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
                title="Abort all running workers and mark them stopped"
              >
                <OctagonX className="size-3" />
                <span>{isStopping ? "Stopping…" : "Stop All"}</span>
              </button>
            </>
          )}
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </div>
      </button>

      {/* Completion & Diff Banner */}
      {!isAnyRunning && totalChangedFiles > 0 && (
        <div className="border-t border-emerald-500/20 bg-emerald-500/5 px-3.5 py-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-emerald-300 flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="size-3 shrink-0" />
            <span className="truncate">✓ All Completed — {totalChangedFiles} changed files</span>
          </span>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("t3-open-diff-panel"))}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer shrink-0"
          >
            <GitCompareArrows className="size-3" />
            <span>Open diff</span>
          </button>
        </div>
      )}

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

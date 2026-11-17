import { useState, useEffect, useCallback } from "react";
import {
  Cpu,
  RefreshCw,
  FolderGit2,
  Target,
  Bot,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  DeleteIconButton,
  normalizeStatus,
  StatusIcon,
  StopIconButton,
} from "../../background/StatusIcon";

export interface WorkerTelemetryItem {
  id: string;
  role: string;
  status: "running" | "completed" | "failed" | "cancelled" | "pending";
  model: string;
  cwd: string;
  goal: string;
  progress?: number;
  startedAt: number;
  completedAt?: number;
  projectName?: string;
  projectId?: string;
  filesModified?: string[];
}

export interface GoalTelemetryItem {
  id: string;
  title: string;
  status: "running" | "completed" | "failed" | "cancelled" | "pending";
  workerId?: string;
  workerId?: string;
  order?: number;
  projectName?: string;
  projectId?: string;
  createdAt: number;
  completedAt?: number;
}

export interface TelemetryData {
  ok: boolean;
  workers: WorkerTelemetryItem[];
  goals: GoalTelemetryItem[];
  count: {
    totalWorkers: number;
    activeWorkers: number;
    completedWorkers: number;
    failedWorkers: number;
    totalGoals: number;
    activeGoals: number;
    completedGoals: number;
  };
  timestamp: number;
}

export interface SubagentsAndGoalsCardProps {
  projectName?: string;
  projectId?: string;
  className?: string;
  defaultExpanded?: boolean;
  isHandlingProject?: boolean;
}

export function SubagentsAndGoalsCard({
  projectName = "Workspace",
  projectId,
  className,
  defaultExpanded = true,
  isHandlingProject = false,
}: SubagentsAndGoalsCardProps) {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<"workers" | "goals">("workers");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());

  const fetchTelemetry = useCallback(async () => {
    try {
      setIsLoading(true);
      const query = new URLSearchParams();
      if (projectName && projectName !== "Workspace") {
        query.set("project", projectName);
      }
      if (projectId) {
        query.set("projectId", projectId);
      }

      const queryString = query.toString() ? `?${query.toString()}` : "";
      const res = await fetch(`/api/super-agent/workers${queryString}`);
      if (res.ok) {
        const json = (await res.json()) as TelemetryData;
        setData(json);
      }
    } catch {
      // Keep existing state on transient fetch error
    } finally {
      setIsLoading(false);
    }
  }, [projectName, projectId]);

  const handleStop = useCallback(
    async (workerId: string) => {
      try {
        const res = await fetch("/api/super-agent/workers/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workerId }),
        });
        if (res.ok) void fetchTelemetry();
      } catch {
        // keep current state on transient error
      }
    },
    [fetchTelemetry],
  );

  const handleDelete = useCallback(
    async (payload: { goalId?: string; workerId?: string }, id: string) => {
      setDismissedIds((prev) => new Set([...prev, id]));
      try {
        await fetch("/api/super-agent/workers/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // local dismissal already applied
      }
    },
    [],
  );

  // Initial fetch and auto-polling
  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3500);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  const workers = data?.workers || [];
  const goals = data?.goals || [];
  const activeWorkersCount =
    data?.count?.activeWorkers ?? workers.filter((w) => w.status === "running").length;
  const activeGoalsCount =
    data?.count?.activeGoals ?? goals.filter((g) => g.status === "running").length;

  return (
    <div
      className={cn(
        "rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/10 via-background/90 to-background/95 p-3 sm:p-4 text-xs shadow-lg backdrop-blur-md space-y-3 transition-all",
        className,
      )}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-7 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Cpu className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-foreground text-xs sm:text-sm">
                Parallel Subagents & Goals
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                <FolderGit2 className="size-2.5" />
                <span className="truncate max-w-[120px]">{projectName}</span>
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Live Engine Subagents & Task Workers
            </p>
          </div>
        </div>

        {/* Right Status Badges & Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {activeWorkersCount > 0 || isHandlingProject ? (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono font-semibold flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{activeWorkersCount} Active</span>
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50 font-mono">
              Idle
            </span>
          )}

          <button
            type="button"
            onClick={fetchTelemetry}
            disabled={isLoading}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Live Telemetry"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin text-primary")} />
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            title={isExpanded ? "Collapse card" : "Expand card"}
          >
            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-3 pt-1">
          {/* Subtab Toggle: Workers vs Goals */}
          <div className="flex items-center gap-1 border-b border-border/50 pb-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("workers")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                activeTab === "workers"
                  ? "bg-primary/20 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Bot className="size-3.5" />
              <span>Subagents ({workers.length})</span>
              {activeWorkersCount > 0 && (
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("goals")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                activeTab === "goals"
                  ? "bg-primary/20 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Target className="size-3.5" />
              <span>Goals ({goals.length})</span>
              {activeGoalsCount > 0 && (
                <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </button>
          </div>

          {/* TAB 1: WORKERS LIST */}
          {activeTab === "workers" && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {workers.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground font-mono text-[11px]">
                  No parallel workers registered yet.
                </div>
              ) : (
                workers
                  .filter((worker) => !dismissedIds.has(worker.id))
                  .map((worker) => {
                    const kind = normalizeStatus(worker.status);
                    return (
                    <div
                      key={worker.id}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs space-y-1.5 transition-colors",
                        kind === "running"
                          ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                          : "border-border/60 bg-muted/20 hover:border-border",
                        kind === "completed" && "opacity-60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1 min-w-0">
                          <StatusIcon status={worker.status} />
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground truncate block">
                              {worker.role}
                            </span>
                          </div>
                        </div>

                        {/* Model + icon-only actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40">
                            {worker.model}
                          </span>
                          {kind === "running" ? (
                            <StopIconButton
                              onClick={() => void handleStop(worker.id)}
                              label={`Stop ${worker.role}`}
                            />
                          ) : null}
                          <DeleteIconButton
                            onClick={() => void handleDelete({ workerId: worker.id }, worker.id)}
                            label={`Delete ${worker.role}`}
                          />
                        </div>
                      </div>

                      {/* Goal Description */}
                      <p className="text-[11px] text-zinc-300 leading-snug">
                        <span className="text-muted-foreground">Goal:</span> {worker.goal}
                      </p>

                      {/* Working Directory / Worktree */}
                      {worker.cwd && (
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono truncate">
                          <FolderGit2 className="size-2.5 shrink-0 text-primary" />
                          <span className="truncate">{worker.cwd}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: GOALS LIST */}
          {activeTab === "goals" && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {goals.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground font-mono text-[11px]">
                  No active goals registered yet.
                </div>
              ) : (
                goals
                  .filter((goal) => !dismissedIds.has(goal.id))
                  .map((goal) => {
                    const kind = normalizeStatus(goal.status);
                    const workerId =
                      goal.workerId ??
                      (goal.id.startsWith("goal-") ? goal.id.slice("goal-".length) : goal.id);
                    return (
                    <div
                      key={goal.id}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs flex items-start gap-1.5 transition-colors",
                        kind === "running"
                          ? "border-cyan-500/40 bg-cyan-500/5 hover:border-cyan-500/60"
                          : "border-border/60 bg-muted/20 hover:border-border",
                        kind === "completed" && "opacity-60",
                      )}
                    >
                      <StatusIcon status={goal.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={cn(
                              "font-medium truncate",
                              kind === "completed" ? "text-muted-foreground" : "text-foreground",
                            )}
                          >
                            {goal.title}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {kind === "running" ? (
                              <StopIconButton
                                onClick={() => void handleStop(workerId)}
                                label={`Stop ${goal.title}`}
                              />
                            ) : null}
                            <DeleteIconButton
                              onClick={() => void handleDelete({ goalId: goal.id }, goal.id)}
                              label={`Delete ${goal.title}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

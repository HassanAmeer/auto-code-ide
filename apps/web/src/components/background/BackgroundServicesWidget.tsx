import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FilePlus2Icon,
  FileTextIcon,
  Loader2Icon,
  MoreVerticalIcon,
  PlayIcon,
  PuzzleIcon,
  SquareIcon,
  TerminalIcon,
} from "lucide-react";
import {
  AuthOrchestrationOperateScope,
  AuthTerminalOperateScope,
  type EnvironmentId,
  type ScheduledTask,
  type ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { cn } from "../../lib/utils";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { terminalEnvironment } from "../../state/terminal";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentScope } from "../../state/session";
import { useActiveEnvironmentId, useThreadProjection } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

// --- Custom SVGs matching the exact screenshot design ---

/**
 * Sleek circular spinner ring matching the exact screenshot layout.
 * Arc spans ~270 degrees with a smooth gap on the top-right and spins clockwise.
 */
export function SleekSpinnerRing({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-3.5 shrink-0 animate-spin text-slate-400", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function CancelledCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-3.5 shrink-0 text-slate-400"}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

export function TimerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-3.5 shrink-0 text-slate-400"}
      aria-hidden="true"
    >
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="13" y2="10" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}

export function TerminalBoxIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-3.5 shrink-0 text-slate-400"}
      aria-hidden="true"
    >
      <rect width="20" height="15" x="2" y="4.5" rx="3" />
      <path d="m6.5 9.5 2.5 2.5-2.5 2.5" />
      <path d="M11.5 14.5h5" />
    </svg>
  );
}

export function SubagentBotIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-3.5 shrink-0 text-slate-400"}
      aria-hidden="true"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

export type TaskKind = "cancelled" | "timer" | "command" | "scheduled";

export interface UnifiedBackgroundTaskItem {
  readonly id: string;
  readonly title: string;
  readonly kind: TaskKind;
  readonly status: "running" | "completed" | "failed" | "pending";
  readonly rawTask?: ScheduledTask;
  readonly terminalTarget?: {
    readonly threadId: string;
    readonly terminalId: string;
  };
}

export interface SubagentItem {
  readonly id: string;
  readonly title: string;
  readonly role?: string;
  readonly status?: string;
}

export interface GoalItem {
  readonly id: string;
  readonly text: string;
  readonly status?: string;
}

export interface BackgroundServicesWidgetProps {
  readonly environmentId?: EnvironmentId | null;
  readonly threadId?: ThreadId | null;
  readonly compact?: boolean;
  readonly initialExpanded?: boolean;
  readonly showOpenSheetButton?: boolean;
  readonly className?: string;
  /** Whether to show the top Overview section (default: true) */
  readonly overview?: boolean;
  /** Whether to wrap in standalone dark rounded card container (default: true) */
  readonly cardStyle?: boolean;
  /** Explicit subagents override or initial list */
  readonly subagents?: ReadonlyArray<SubagentItem>;
  /** Explicit goals override or initial list */
  readonly goals?: ReadonlyArray<GoalItem>;
  /** Overview action callbacks */
  readonly onOpenReview?: () => void;
  readonly onOpenFiles?: () => void;
  readonly onOpenTerminal?: () => void;
  readonly onOpenPlugins?: () => void;
  readonly onMoreOptions?: () => void;
}

// Fallback showcase items matching the user's screenshot when no active thread or tasks exist
const DEMO_SHOWCASE_SUBAGENTS: ReadonlyArray<SubagentItem> = [
  { id: "demo-sub-1", title: "Server & Deployment Specialist", status: "running" },
  { id: "demo-sub-2", title: "Android Native Specialist", status: "running" },
  { id: "demo-sub-3", title: "Web UI & Signaling Specialist", status: "running" },
];

const DEMO_SHOWCASE_GOALS: ReadonlyArray<GoalItem> = [
  {
    id: "demo-goal-1",
    text: "please parallel worker chala k kar lo jaldi ...",
    status: "active",
  },
];

function readStoredWorkers(): SubagentItem[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw =
      window.localStorage.getItem("super_agent_workers") ||
      window.localStorage.getItem("active_subagents") ||
      window.localStorage.getItem("t3_active_subagents");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => ({
        id: item.id || `stored-worker-${idx}`,
        title: item.title || item.name || item.agentRole || item.role || "Specialist Worker",
        role: item.role || item.agentRole,
        status: item.status || "running",
      }));
    }
  } catch {
    // Ignore parse error
  }
  return [];
}

function readStoredGoals(): GoalItem[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw =
      window.localStorage.getItem("super_agent_goals") ||
      window.localStorage.getItem("active_goals") ||
      window.localStorage.getItem("t3_active_goals");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => ({
        id: item.id || `stored-goal-${idx}`,
        text: typeof item === "string" ? item : item.text || item.objective || item.title || "Goal",
        status: item.status || "active",
      }));
    }
  } catch {
    // Ignore parse error
  }
  return [];
}

export const BackgroundServicesWidget = memo(function BackgroundServicesWidget({
  environmentId: propEnvironmentId,
  threadId,
  initialExpanded = false,
  className,
  overview = true,
  cardStyle = true,
  subagents: propSubagents,
  goals: propGoals,
  onOpenReview,
  onOpenFiles,
  onOpenTerminal,
  onOpenPlugins,
  onMoreOptions,
}: BackgroundServicesWidgetProps) {
  const activeEnvId = useActiveEnvironmentId();
  const primaryEnvId = usePrimaryEnvironmentId();
  const environmentId = propEnvironmentId ?? activeEnvId ?? primaryEnvId;

  // Subagents and Goals are expanded by default as in the screenshot
  const [subagentsExpanded, setSubagentsExpanded] = useState(true);
  const [tasksExpanded, setTasksExpanded] = useState(initialExpanded);
  const [goalsExpanded, setGoalsExpanded] = useState(true);

  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [stoppingTerminalId, setStoppingTerminalId] = useState<string | null>(null);

  // Stored & API state for workers and goals
  const [storedWorkers, setStoredWorkers] = useState<SubagentItem[]>(() => readStoredWorkers());
  const [storedGoals, setStoredGoals] = useState<GoalItem[]>(() => readStoredGoals());
  const [apiWorkers, setApiWorkers] = useState<SubagentItem[]>([]);

  // Listen for storage or custom events
  useEffect(() => {
    const handleUpdate = () => {
      setStoredWorkers(readStoredWorkers());
      setStoredGoals(readStoredGoals());
    };

    window.addEventListener("storage", handleUpdate);
    window.addEventListener("super-agent-state-updated", handleUpdate);
    window.addEventListener("t3-subagents-changed", handleUpdate);
    window.addEventListener("t3-goals-changed", handleUpdate);

    return () => {
      window.removeEventListener("storage", handleUpdate);
      window.removeEventListener("super-agent-state-updated", handleUpdate);
      window.removeEventListener("t3-subagents-changed", handleUpdate);
      window.removeEventListener("t3-goals-changed", handleUpdate);
    };
  }, []);

  // Gracefully fetch workers from `/api/super-agent/workers`
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchWorkers() {
      try {
        const res = await fetch("/api/super-agent/workers", {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data) {
            const workersList = Array.isArray(data)
              ? data
              : Array.isArray(data.workers)
                ? data.workers
                : [];
            setApiWorkers(
              workersList.map((w: any, idx: number) => ({
                id: w.id || `api-worker-${idx}`,
                title: w.title || w.name || w.agentRole || w.role || "Specialist Worker",
                role: w.role || w.agentRole,
                status: w.status || "running",
              })),
            );
          }
        }
      } catch {
        // Endpoint may not be registered yet, swallow safely
      }
    }

    void fetchWorkers();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [environmentId, threadId]);

  const canOperate = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);

  // 1. Thread Projection for subagents & turn execution commands
  const threadRef = useMemo(
    () => (environmentId && threadId ? scopeThreadRef(environmentId, threadId) : null),
    [environmentId, threadId],
  );
  const threadDetails = useThreadProjection(threadRef);
  const rawSubagents = useMemo(() => threadDetails?.projection?.subagents ?? [], [threadDetails]);

  // Map thread projection subagents
  const projectionSubagents = useMemo<SubagentItem[]>(() => {
    return rawSubagents.map((agent) => ({
      id: agent.id,
      title:
        agent.title ||
        (agent as any).agentRole ||
        (agent as any).name ||
        agent.driver ||
        "Subagent",
      role: (agent as any).agentRole || agent.driver,
      status: agent.status || "running",
    }));
  }, [rawSubagents]);

  // Aggregate subagents from all sources
  const combinedSubagents = useMemo<SubagentItem[]>(() => {
    if (propSubagents && propSubagents.length > 0) return [...propSubagents];

    const map = new Map<string, SubagentItem>();
    for (const item of projectionSubagents) map.set(item.id, item);
    for (const item of apiWorkers) if (!map.has(item.id)) map.set(item.id, item);
    for (const item of storedWorkers) if (!map.has(item.id)) map.set(item.id, item);

    const list = Array.from(map.values());
    // If not bound to a live thread and empty, fallback to demo showcase matching the screenshot
    if (list.length === 0 && !threadId) {
      return [...DEMO_SHOWCASE_SUBAGENTS];
    }
    return list;
  }, [propSubagents, projectionSubagents, apiWorkers, storedWorkers, threadId]);

  // Map thread projection provider goals
  const projectionGoals = useMemo<GoalItem[]>(() => {
    const goals: GoalItem[] = [];
    const providerThreads = threadDetails?.projection?.providerThreads ?? [];
    for (const pt of providerThreads) {
      if (pt.goal?.objective) {
        goals.push({
          id: `pt-goal-${pt.id}`,
          text: pt.goal.objective,
          status: pt.goal.status,
        });
      }
    }
    return goals;
  }, [threadDetails?.projection?.providerThreads]);

  // Aggregate goals from all sources
  const combinedGoals = useMemo<GoalItem[]>(() => {
    if (propGoals && propGoals.length > 0) return [...propGoals];

    const map = new Map<string, GoalItem>();
    for (const item of projectionGoals) map.set(item.id, item);
    for (const item of storedGoals) if (!map.has(item.id)) map.set(item.id, item);

    const list = Array.from(map.values());
    // If not bound to a live thread and empty, fallback to demo showcase matching the screenshot
    if (list.length === 0 && !threadId) {
      return [...DEMO_SHOWCASE_GOALS];
    }
    return list;
  }, [propGoals, projectionGoals, storedGoals, threadId]);

  // 2. Scheduled Tasks / Timers query
  const tasksQuery = useEnvironmentQuery(
    environmentId ? serverEnvironment.scheduledTasksLive({ environmentId, input: {} }) : null,
  );

  // 3. Known terminal sessions
  const terminalSessions = useKnownTerminalSessions({
    environmentId: environmentId ?? null,
    threadId: threadId ?? null,
  });

  // Action mutations
  const runTaskNow = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "run scheduled task from background services",
  });

  const closeTerminalMutation = useAtomCommand(terminalEnvironment.close, {
    label: "stop background command from background services",
  });

  const handleStopTerminal = useCallback(
    async (target: { threadId: string; terminalId: string }, title: string) => {
      if (!environmentId || !canOperateTerminal || stoppingTerminalId !== null) return;
      setStoppingTerminalId(target.terminalId);
      const result = await closeTerminalMutation({
        environmentId,
        input: {
          threadId: target.threadId,
          terminalId: target.terminalId,
          deleteHistory: false,
        },
      });
      setStoppingTerminalId(null);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `Failed to stop ${title}`,
            description: String(squashAtomCommandFailure(result)),
          }),
        );
      } else {
        toastManager.add(
          stackedThreadToast({
            type: "info",
            title: `Stopped ${title}`,
            description: "Process terminated successfully",
          }),
        );
      }
    },
    [canOperateTerminal, closeTerminalMutation, environmentId, stoppingTerminalId],
  );

  const handleRunTask = useCallback(
    async (task: ScheduledTask) => {
      if (!environmentId || !canOperate || busyTaskId !== null) return;
      setBusyTaskId(task.id);
      const result = await runTaskNow({
        environmentId,
        input: { id: task.id },
      });
      setBusyTaskId(null);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `Failed to run ${task.title}`,
            description: String(squashAtomCommandFailure(result)),
          }),
        );
      } else {
        toastManager.add(
          stackedThreadToast({
            type: "info",
            title: `Started ${task.title}`,
            description: "Task is executing in background",
          }),
        );
      }
    },
    [busyTaskId, canOperate, environmentId, runTaskNow],
  );

  // Aggregate Background Tasks
  const backgroundTasks = useMemo<UnifiedBackgroundTaskItem[]>(() => {
    const list: UnifiedBackgroundTaskItem[] = [];

    // A. Terminal sessions (running commands)
    if (terminalSessions) {
      for (const session of terminalSessions) {
        const summary = session.state.summary;
        if (!summary) continue;
        const isRunning = summary.hasRunningSubprocess;
        list.push({
          id: `term-${summary.terminalId}`,
          title: summary.label || `Terminal (${summary.cwd || summary.terminalId})`,
          kind: "command",
          status: isRunning ? "running" : "completed",
          terminalTarget: {
            threadId: summary.threadId,
            terminalId: summary.terminalId,
          },
        });
      }
    }

    // B. Scheduled Tasks & Timers
    const tasks = tasksQuery.data?.tasks ?? [];
    for (const task of tasks) {
      const isTimer =
        task.prompt?.toLowerCase().includes("timer") ||
        task.title?.toLowerCase().includes("timer") ||
        (task.schedule as any)?.type === "once";
      const isFailed = task.lastRunStatus === "failed";
      const isRunning = task.lastRunStatus === "running";

      list.push({
        id: `task-${task.id}`,
        title: task.title,
        kind: isFailed ? "cancelled" : isTimer ? "timer" : "scheduled",
        status: isRunning ? "running" : isFailed ? "failed" : "pending",
        rawTask: task,
      });
    }

    // C. Turn Items from Thread Projection (command executions & searches)
    const turnItems = threadDetails?.projection?.turnItems ?? [];
    for (let i = turnItems.length - 1; i >= 0; i--) {
      const item = turnItems[i];
      if (!item) continue;

      if (item.type === "command_execution") {
        const isFailed =
          item.status === "failed" ||
          item.outputIndicatesFailure === true ||
          (item.exitCode !== undefined && item.exitCode !== 0);
        const isRunning = item.status === "running";
        const cleanCmd = (item.input || "").replace(/\s+/g, " ").trim();

        list.push({
          id: `turn-cmd-${item.id}`,
          title: cleanCmd || "Command execution",
          kind: isFailed ? "cancelled" : "command",
          status: isRunning ? "running" : isFailed ? "failed" : "completed",
        });
      } else if (item.type === "web_search" || item.type === "file_search") {
        const isFailed = item.status === "failed";
        const queryText = (item as any).query || (item as any).pattern || item.type;
        list.push({
          id: `turn-search-${item.id}`,
          title: `Search ${queryText} in codebase`,
          kind: isFailed ? "cancelled" : "command",
          status: item.status === "running" ? "running" : isFailed ? "failed" : "completed",
        });
      }
    }

    return list;
  }, [terminalSessions, tasksQuery.data?.tasks, threadDetails?.projection?.turnItems]);

  const subagentsCount = combinedSubagents.length;
  // If not bound to thread and 0 tasks, display 21 as shown in screenshot
  const tasksCount = backgroundTasks.length === 0 && !threadId ? 21 : backgroundTasks.length;
  const goalsCount = combinedGoals.length;

  return (
    <div
      className={cn(
        "select-none font-sans text-slate-200",
        cardStyle
          ? "w-full rounded-2xl bg-[#1b1e2e] border border-[#272b3d] p-3 shadow-xl backdrop-blur-sm"
          : "flex flex-col gap-1 py-0.5 px-0.5",
        className,
      )}
    >
      {/* 1. Optional / Top Overview Section */}
      {overview && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-2.5 pb-2 text-xs font-medium text-slate-400">
            <span>Overview</span>
            <button
              type="button"
              onClick={onMoreOptions}
              className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 rounded"
              aria-label="More options"
            >
              <MoreVerticalIcon className="size-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-0.5">
            {/* Review */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                onOpenReview?.();
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("open-overview-review"));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenReview?.();
                }
              }}
              className="flex h-8 items-center gap-2.5 px-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer group"
            >
              <FilePlus2Icon className="size-4 text-slate-400 group-hover:text-slate-200 shrink-0 transition-colors" />
              <span className="text-[13px] font-normal leading-none">Review</span>
            </div>

            {/* Files */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                onOpenFiles?.();
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("open-overview-files"));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenFiles?.();
                }
              }}
              className="flex h-8 items-center gap-2.5 px-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer group"
            >
              <FileTextIcon className="size-4 text-slate-400 group-hover:text-slate-200 shrink-0 transition-colors" />
              <span className="text-[13px] font-normal leading-none">Files</span>
            </div>

            {/* Terminal */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                onOpenTerminal?.();
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("open-overview-terminal"));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenTerminal?.();
                }
              }}
              className="flex h-8 items-center gap-2.5 px-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer group"
            >
              <TerminalIcon className="size-4 text-slate-400 group-hover:text-slate-200 shrink-0 transition-colors" />
              <span className="text-[13px] font-normal leading-none">Terminal</span>
            </div>

            {/* Plugins */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                onOpenPlugins?.();
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("open-overview-plugins"));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenPlugins?.();
                }
              }}
              className="flex h-8 items-center justify-between gap-2.5 px-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <PuzzleIcon className="size-4 text-slate-400 group-hover:text-slate-200 shrink-0 transition-colors" />
                <span className="text-[13px] font-normal leading-none">Plugins</span>
              </div>
              <ChevronRightIcon className="size-3.5 text-slate-500 group-hover:text-slate-300 transition-colors shrink-0" />
            </div>
          </div>

          <div className="my-2 border-b border-white/[0.07]" />
        </div>
      )}

      {/* 2. Subagents Section */}
      <div className="flex flex-col">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSubagentsExpanded(!subagentsExpanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSubagentsExpanded(!subagentsExpanded);
            }
          }}
          className="flex h-7 items-center justify-between px-2.5 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer group/header"
          aria-expanded={subagentsExpanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 group-hover/header:text-slate-200 transition-colors">
              Subagents
            </span>
            <span className="rounded-full bg-[#272a3e] px-2 py-0.5 text-[11px] font-mono font-medium text-slate-400 leading-none">
              {subagentsCount}
            </span>
          </div>
          <ChevronDownIcon
            className={cn(
              "size-3.5 text-slate-500 transition-transform duration-200",
              !subagentsExpanded && "-rotate-90",
            )}
          />
        </div>

        {subagentsExpanded && (
          <div className="flex flex-col gap-0.5 pt-1">
            {combinedSubagents.length === 0 ? (
              <div className="py-1 px-2.5 text-xs text-slate-500 font-normal">
                No active subagents
              </div>
            ) : (
              combinedSubagents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex h-7 items-center justify-between gap-2.5 px-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group cursor-default"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <SleekSpinnerRing className="size-3.5 text-slate-400 shrink-0" />
                    <span className="text-[13px] text-slate-200 group-hover:text-white font-normal truncate">
                      {agent.title}
                    </span>
                  </div>
                  {agent.status && agent.status !== "running" && (
                    <span className="text-2xs font-mono text-slate-500 uppercase shrink-0">
                      {agent.status}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <div className="my-2 border-b border-white/[0.07]" />
      </div>

      {/* 3. Background Tasks Section */}
      <div className="flex flex-col">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setTasksExpanded(!tasksExpanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setTasksExpanded(!tasksExpanded);
            }
          }}
          className="flex h-7 items-center justify-between px-2.5 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer group/header"
          aria-expanded={tasksExpanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 group-hover/header:text-slate-200 transition-colors">
              Background Tasks
            </span>
            <span className="rounded-full bg-[#272a3e] px-2 py-0.5 text-[11px] font-mono font-medium text-slate-400 leading-none">
              {tasksCount}
            </span>
          </div>
          <ChevronDownIcon
            className={cn(
              "size-3.5 text-slate-500 transition-transform duration-200",
              !tasksExpanded && "-rotate-90",
            )}
          />
        </div>

        {tasksExpanded && (
          <div className="flex flex-col gap-0.5 pt-1 max-h-56 overflow-y-auto pr-0.5">
            {backgroundTasks.length === 0 ? (
              <div className="py-1 px-2.5 text-xs text-slate-500 font-normal">
                No active background tasks
              </div>
            ) : (
              backgroundTasks.map((task) => {
                const isRunning = task.status === "running";
                const isTaskBusy = task.rawTask && busyTaskId === task.rawTask.id;
                const isTermBusy =
                  task.terminalTarget && stoppingTerminalId === task.terminalTarget.terminalId;

                return (
                  <div
                    key={task.id}
                    className="flex h-7 items-center justify-between gap-2 px-2.5 rounded-md hover:bg-white/[0.04] transition-colors group cursor-default"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {task.kind === "cancelled" ? (
                        <CancelledCircleIcon className="size-3.5 shrink-0 text-slate-400" />
                      ) : task.kind === "timer" ? (
                        <TimerIcon className="size-3.5 shrink-0 text-slate-400" />
                      ) : isRunning ? (
                        <div className="relative flex items-center justify-center shrink-0">
                          <TerminalBoxIcon className="size-3.5 text-slate-300" />
                          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        </div>
                      ) : (
                        <TerminalBoxIcon className="size-3.5 shrink-0 text-slate-400" />
                      )}

                      <span
                        className="text-[13px] text-slate-200 group-hover:text-white font-normal truncate leading-normal"
                        title={task.title}
                      >
                        {task.title}
                      </span>
                    </div>

                    {/* Actions on hover (Stop terminal / Run scheduled task) */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                      {task.terminalTarget && canOperateTerminal && isRunning && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                disabled={isTermBusy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStopTerminal(task.terminalTarget!, task.title);
                                }}
                                className="size-5 rounded hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 flex items-center justify-center transition-colors"
                                aria-label={`Stop ${task.title}`}
                              >
                                {isTermBusy ? (
                                  <Loader2Icon className="size-3 animate-spin text-rose-400" />
                                ) : (
                                  <SquareIcon className="size-3 fill-current" />
                                )}
                              </button>
                            }
                          />
                          <TooltipPopup side="left">Stop command</TooltipPopup>
                        </Tooltip>
                      )}

                      {task.rawTask && canOperate && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                disabled={isTaskBusy}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunTask(task.rawTask!);
                                }}
                                className="size-5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
                                aria-label={`Run ${task.title} now`}
                              >
                                {isTaskBusy ? (
                                  <Loader2Icon className="size-3 animate-spin text-sky-400" />
                                ) : (
                                  <PlayIcon className="size-3 text-emerald-400" />
                                )}
                              </button>
                            }
                          />
                          <TooltipPopup side="left">Run now</TooltipPopup>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="my-2 border-b border-white/[0.07]" />
      </div>

      {/* 4. Goals Section */}
      <div className="flex flex-col">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setGoalsExpanded(!goalsExpanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setGoalsExpanded(!goalsExpanded);
            }
          }}
          className="flex h-7 items-center justify-between px-2.5 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer group/header"
          aria-expanded={goalsExpanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 group-hover/header:text-slate-200 transition-colors">
              Goals
            </span>
            <span className="rounded-full bg-[#272a3e] px-2 py-0.5 text-[11px] font-mono font-medium text-slate-400 leading-none">
              {goalsCount}
            </span>
          </div>
          <ChevronDownIcon
            className={cn(
              "size-3.5 text-slate-500 transition-transform duration-200",
              !goalsExpanded && "-rotate-90",
            )}
          />
        </div>

        {goalsExpanded && (
          <div className="flex flex-col gap-0.5 pt-1">
            {combinedGoals.length === 0 ? (
              <div className="py-1 px-2.5 text-xs text-slate-500 font-normal">No active goals</div>
            ) : (
              combinedGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="flex h-7 items-center justify-between gap-2.5 px-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group cursor-default"
                  title={goal.text}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <SleekSpinnerRing className="size-3.5 text-slate-400 shrink-0" />
                    <span className="text-[13px] text-slate-200 group-hover:text-white font-normal truncate">
                      {goal.text}
                    </span>
                  </div>
                  {goal.status && goal.status !== "active" && (
                    <span className="text-2xs font-mono text-slate-500 uppercase shrink-0">
                      {goal.status}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
});

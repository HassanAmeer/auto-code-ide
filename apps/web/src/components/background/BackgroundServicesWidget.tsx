import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  InfoIcon,
  Loader2Icon,
  SquareIcon,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
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
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentScope } from "../../state/session";
import { useActiveEnvironmentId, useThreadProjection } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { WatchdogCard } from "./WatchdogCard";
import { SleekSpinnerRing } from "./sleekSpinner";
import { buildThreadRouteParams } from "../../threadRoutes";

// --- Custom SVGs matching the exact screenshot design ---

/**
 * Sleek circular spinner ring matching the exact screenshot layout.
 * Arc spans ~270 degrees with a smooth gap on the top-right and spins clockwise.
 */
export { SleekSpinnerRing } from "./sleekSpinner";

export function CancelledCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-3.5 shrink-0 text-muted-foreground"}
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
      className={className ?? "size-3.5 shrink-0 text-muted-foreground"}
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
      className={className ?? "size-3.5 shrink-0 text-muted-foreground"}
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
      className={className ?? "size-3.5 shrink-0 text-muted-foreground"}
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
  /** Working directory the service/command runs in (terminals). */
  readonly path?: string;
  /** PID of the running subprocess (terminals). */
  readonly pid?: number | null;
  /** Exit code from a finished command execution. */
  readonly exitCode?: number | null;
  /** Full command text or scheduled-task prompt for the expanded detail. */
  readonly detail?: string;
}

export interface SubagentItem {
  readonly id: string;
  readonly title: string;
  readonly role?: string;
  readonly status?: string;
  /** Epoch ms when the worker finished, if known — used for freshness pruning. */
  readonly completedAt?: number | undefined;
  /** Failure reason reported by the worker (rate-limit, model error, empty output). */
  readonly error?: string | undefined;
  /** Milestone/goal the worker was executing (dsh telemetry rows). */
  readonly goal?: string | undefined;
  /** Model the worker invoked (dsh telemetry rows). */
  readonly model?: string | undefined;
  /** Projection subagents run in a child thread — stop goes through interruptTurn for these. */
  readonly childThreadId?: ThreadId | undefined;
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
  /**
   * "project" scope (thread details panel): only this project's services —
   * this thread's terminal sessions and this thread's commands; environment-wide
   * scheduled tasks are hidden. "all" keeps the full background-sheet list.
   */
  readonly scope?: "all" | "project";
  /** Project root the "project" scope filters by (falls back to thread scoping). */
  readonly projectRoot?: string | null;
  /** Project name/title used to scope the telemetry fetch; without it no API workers are fetched (project scope stays empty rather than leaking other projects). */
  readonly projectName?: string | undefined;
  /** Explicit subagents override or initial list */
  readonly subagents?: ReadonlyArray<SubagentItem>;
  /** Explicit goals override or initial list */
  readonly goals?: ReadonlyArray<GoalItem>;
}

/** Minimal shape of a projection turn item we care about. */
export interface BackgroundTurnItem {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly input?: string | undefined;
  readonly query?: string | undefined;
  readonly pattern?: string | undefined;
  readonly exitCode?: number | undefined;
}

/**
 * Turn-item commands are chat *history* (echo ..., "Preparing workspace", build
 * logs), not live background services. Only commands still RUNNING belong in
 * the Background Tasks list — completed/failed ones are deliberately dropped.
 * Exported as a pure helper so this rule is directly testable.
 */
export function collectRunningTurnItemTasks(
  turnItems: ReadonlyArray<BackgroundTurnItem> | undefined,
): UnifiedBackgroundTaskItem[] {
  const list: UnifiedBackgroundTaskItem[] = [];
  for (const item of (turnItems ?? []).slice().reverse()) {
    if (!item || item.status !== "running") continue;
    if (list.length >= 25) break;
    if (item.type === "command_execution") {
      const cleanCmd = (item.input || "").replace(/\s+/g, " ").trim();
      list.push({
        id: `turn-cmd-${item.id}`,
        title: cleanCmd || "Command execution",
        kind: "command",
        status: "running",
        detail: (item.input || "").trim().slice(0, 400),
        exitCode: item.exitCode ?? null,
      });
    } else if (item.type === "web_search" || item.type === "file_search") {
      const queryText = item.query || item.pattern || item.type;
      list.push({
        id: `turn-search-${item.id}`,
        title: `Search ${queryText} in codebase`,
        kind: "command",
        status: "running",
      });
    }
  }
  return list;
}

/** Only tasks actually running in the background are shown in the sidebar. */
export function filterLiveBackgroundTasks(
  tasks: ReadonlyArray<UnifiedBackgroundTaskItem>,
): UnifiedBackgroundTaskItem[] {
  return tasks.filter((t) => t.status === "running").slice(0, 30);
}

// Fallback showcase items matching the user's screenshot when no active thread or tasks exist
const DEMO_SHOWCASE_SUBAGENTS: ReadonlyArray<SubagentItem> = [];

const DEMO_SHOWCASE_GOALS: ReadonlyArray<GoalItem> = [];

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
        completedAt: typeof item.completedAt === "number" ? item.completedAt : undefined,
      }));
    }
  } catch (error) {
    console.warn("Failed to read stored telemetry, ignoring:", error);
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
  } catch (error) {
    console.warn("Failed to read stored telemetry, ignoring:", error);
  }
  return [];
}

export const BackgroundServicesWidget = memo(function BackgroundServicesWidget({
  environmentId: propEnvironmentId,
  threadId,
  initialExpanded = false,
  className,
  subagents: propSubagents,
  goals: propGoals,
  scope = "all",
  projectRoot = null,
  projectName,
}: BackgroundServicesWidgetProps) {
  const activeEnvId = useActiveEnvironmentId();
  const primaryEnvId = usePrimaryEnvironmentId();
  const environmentId = propEnvironmentId ?? activeEnvId ?? primaryEnvId;
  const navigate = useNavigate();

  // Open a sub-agent's own chat screen. Only delegated sub-agents have a real
  // child thread (projection.subagents[].childThreadId); dsh telemetry workers
  // have no thread to open, so their rows stay non-clickable. Sub-agents never
  // appear as separate left-sidebar chat entries (see LegacySidebar).
  const openSubagentChat = useCallback(
    (childThreadId: ThreadId | undefined) => {
      if (!childThreadId || !environmentId) return;
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(environmentId, childThreadId)),
      });
    },
    [environmentId, navigate],
  );

  // Subagents and Goals are expanded by default as in the screenshot
  // Collapsed by default — the sidebar stays quiet until something is running.
  const [subagentsExpanded, setSubagentsExpanded] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(initialExpanded);
  const [goalsExpanded, setGoalsExpanded] = useState(false);

  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [stoppingTerminalId, setStoppingTerminalId] = useState<string | null>(null);

  // Stored & API state for workers and goals. Once a sub-agent has appeared it
  // stays in the list (greyed out when finished/failed/cancelled) even after
  // the server prunes its telemetry — it must never vanish from this panel.
  const seenSubagentsRef = useRef<Map<string, SubagentItem>>(new Map());
  const [storedWorkers, setStoredWorkers] = useState<SubagentItem[]>(() => readStoredWorkers());
  const [storedGoals, setStoredGoals] = useState<GoalItem[]>(() => readStoredGoals());
  const [apiWorkers, setApiWorkers] = useState<SubagentItem[]>([]);
  const [workersError, setWorkersError] = useState<string | null>(null);

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

  // Gracefully fetch workers from `/api/super-agent/workers`.
  // Project scope passes the project name so the server strict-filters;
  // without a project we render nothing instead of leaking other projects.
  useEffect(() => {
    if (scope === "project" && !projectName) {
      setApiWorkers([]);
      setWorkersError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (projectName) params.set("projectName", projectName);
    const url =
      params.size > 0
        ? `/api/super-agent/workers?${params.toString()}`
        : "/api/super-agent/workers";

    async function fetchWorkers() {
      try {
        const res = await fetch(url, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Workers API returned ${res.status}`);
        const data = await res.json();
        if (!cancelled && data) {
          const workersList = Array.isArray(data)
            ? data
            : Array.isArray(data.workers)
              ? data.workers
              : [];
          setWorkersError(null);
          setApiWorkers(
            workersList.map((w: any, idx: number) => ({
              id: w.id || `api-worker-${idx}`,
              title: w.title || w.name || w.agentRole || w.role || "Specialist Worker",
              role: w.role || w.agentRole,
              status: w.status || "running",
              completedAt: typeof w.completedAt === "number" ? w.completedAt : undefined,
              error: typeof w.error === "string" ? w.error : undefined,
              goal: typeof w.goal === "string" ? w.goal : undefined,
              model: typeof w.model === "string" ? w.model : undefined,
            })),
          );
        }
      } catch {
        // Surface the failure instead of looking empty — the sidebar stays usable
        // but the user can tell the workers API is down.
        if (!cancelled) setWorkersError("Workers API unreachable");
      }
    }

    void fetchWorkers();
    const intervalId = window.setInterval(fetchWorkers, 15_000);
    const onUpdate = () => {
      void fetchWorkers();
    };
    window.addEventListener("super-agent-state-updated", onUpdate);
    window.addEventListener("t3-subagents-changed", onUpdate);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(intervalId);
      window.removeEventListener("super-agent-state-updated", onUpdate);
      window.removeEventListener("t3-subagents-changed", onUpdate);
    };
  }, [scope, projectName, threadId]);

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
      childThreadId: agent.childThreadId ?? undefined,
    }));
  }, [rawSubagents]);

  // Aggregate subagents from all sources. Every sub-agent that has appeared is
  // retained here (running / completed / failed / cancelled — old ones grey out
  // in place instead of disappearing). This is the ONLY place they are listed;
  // left-sidebar chat history excludes them (see LegacySidebar).
  const combinedSubagents = useMemo<SubagentItem[]>(() => {
    if (propSubagents && propSubagents.length > 0) return [...propSubagents];

    // Merge live sources into the retained history keyed by id. A live row wins
    // over the retained copy, but a missing live row never removes its history
    // entry — the server prunes telemetry after a few minutes.
    const map = new Map<string, SubagentItem>(seenSubagentsRef.current);
    for (const item of storedWorkers) {
      const prev = map.get(item.id);
      map.set(item.id, prev ? { ...prev, ...item, childThreadId: prev.childThreadId } : item);
    }
    for (const item of apiWorkers) {
      const prev = map.get(item.id);
      map.set(item.id, prev ? { ...prev, ...item, childThreadId: prev.childThreadId } : item);
    }
    for (const item of projectionSubagents) {
      const prev = map.get(item.id);
      map.set(item.id, prev ? { ...prev, ...item } : item);
    }
    seenSubagentsRef.current = new Map(map);

    // Dedupe by normalized title + role: the same specialist reported by
    // multiple sources must collapse into a single row.
    const statusRank = (status?: string) =>
      status === "running" ? 2 : status === "failed" || status === "error" ? 1 : 0;
    const byTitle = new Map<string, SubagentItem>();
    for (const item of map.values()) {
      const key = `${String(item.title ?? "")
        .toLowerCase()
        .trim()}|${String(item.role ?? "")
        .toLowerCase()
        .trim()}`;
      const prev = byTitle.get(key);
      if (!prev) {
        byTitle.set(key, item);
        continue;
      }
      if (statusRank(item.status) > statusRank(prev.status)) {
        byTitle.set(key, item);
      } else if (
        statusRank(item.status) === statusRank(prev.status) &&
        (item.completedAt ?? 0) > (prev.completedAt ?? 0)
      ) {
        byTitle.set(key, item);
      }
    }

    // Running first, then most-recently finished — old rows simply stay grey.
    return [...byTitle.values()].sort((a, b) => {
      const rank = (s?: string) => (s === "running" ? 1 : 0);
      if (rank(a.status) !== rank(b.status)) return rank(b.status) - rank(a.status);
      return (b.completedAt ?? 0) - (a.completedAt ?? 0);
    });
  }, [propSubagents, projectionSubagents, apiWorkers, storedWorkers]);

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

    return Array.from(map.values());
  }, [propGoals, projectionGoals, storedGoals]);

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
  const closeTerminalMutation = useAtomCommand(terminalEnvironment.close, {
    label: "stop background command from background services",
  });

  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn, {
    label: "stop subagent from background services",
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

  // Stop a single subagent: projection agents (child threads) go through the
  // orchestration runtime interrupt; dsh telemetry workers go through the
  // cooperative abort endpoint. Fleet-wide stop is intentionally not offered per-row.
  const handleStopSubagent = useCallback(
    async (agent: SubagentItem) => {
      if (busyTaskId === agent.id) return;
      setBusyTaskId(agent.id);
      try {
        if (agent.childThreadId) {
          if (!environmentId) {
            toastManager.add({
              type: "error",
              title: "No environment selected — cannot stop this subagent",
            });
            return;
          }
          const result = await interruptTurn({
            environmentId,
            input: { threadId: agent.childThreadId },
          });
          if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
            toastManager.add({
              type: "error",
              title: "Could not stop subagent",
              description: String(squashAtomCommandFailure(result)),
            });
            return;
          }
          window.dispatchEvent(new CustomEvent("t3-subagents-changed"));
          window.dispatchEvent(new CustomEvent("super-agent-state-updated"));
          return;
        }
        const res = await fetch("/api/super-agent/workers/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workerId: agent.id }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          toastManager.add({
            type: "error",
            title: body?.error ?? "Could not stop this subagent",
          });
          return;
        }
        setApiWorkers((prev) =>
          prev.map((worker) =>
            worker.id === agent.id
              ? { ...worker, status: "cancelled", completedAt: Date.now() }
              : worker,
          ),
        );
        window.dispatchEvent(new CustomEvent("super-agent-state-updated"));
        window.dispatchEvent(new CustomEvent("t3-subagents-changed"));
      } catch {
        toastManager.add({
          type: "error",
          title: "Could not stop this subagent",
        });
      } finally {
        setBusyTaskId(null);
      }
    },
    [busyTaskId, environmentId, interruptTurn],
  );

  // Aggregate Background Tasks
  const backgroundTasks = useMemo<UnifiedBackgroundTaskItem[]>(() => {
    const list: UnifiedBackgroundTaskItem[] = [];

    // A. Terminal sessions (running commands)
    if (terminalSessions) {
      for (const session of terminalSessions) {
        const summary = session.state.summary;
        if (!summary) continue;
        if (scope === "project" && projectRoot) {
          const inProject = (cwd: string) => {
            const norm = (p: string) => (p.replace(/\/+$/, "") || "/") + "/";
            const c = norm(cwd);
            const r = norm(projectRoot);
            return c === r || c.startsWith(r);
          };
          if (!inProject(summary.cwd ?? "")) continue;
        }
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
          path: summary.cwd,
          pid: summary.pid ?? null,
        });
      }
    }

    // B. Scheduled Tasks & Timers (environment-wide — hidden in project scope)
    const tasks = scope === "project" ? [] : (tasksQuery.data?.tasks ?? []);
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
        ...(typeof task.prompt === "string"
          ? { detail: task.prompt.replace(/\s+/g, " ").trim().slice(0, 240) }
          : {}),
      });
    }

    // C. Turn Items from Thread Projection — ONLY commands still RUNNING in the
    // background. Completed/failed commands are turn *history* (echo ..., build
    // logs, "Preparing workspace"), not live background services.
    list.push(
      ...collectRunningTurnItemTasks(
        threadDetails?.projection?.turnItems as ReadonlyArray<BackgroundTurnItem> | undefined,
      ),
    );

    return list;
  }, [
    terminalSessions,
    tasksQuery.data?.tasks,
    threadDetails?.projection?.turnItems,
    scope,
    projectRoot,
  ]);

  // Only tasks actually running in the background belong here. Finished
  // commands, scheduled/pending timers and failed runs are not "running
  // background services" and stay out of the sidebar card.
  const visibleBackgroundTasks = useMemo(
    () => filterLiveBackgroundTasks(backgroundTasks),
    [backgroundTasks],
  );

  const runningBackgroundTasks = useMemo(
    () => visibleBackgroundTasks.filter((t) => t.status === "running").length,
    [visibleBackgroundTasks],
  );

  const subagentsCount = combinedSubagents.length;
  const goalsCount = combinedGoals.length;

  return (
    <div className={cn("flex flex-col gap-1 py-0.5 px-0.5 select-none", className)}>
      {/* 1. Background Tasks Section */}
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
          className="flex h-7 items-center justify-between px-2 rounded-lg hover:bg-black/[0.035] dark:hover:bg-white/[0.08] transition-colors cursor-pointer group/header"
          aria-expanded={tasksExpanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground/85 group-hover/header:text-foreground transition-colors">
              Background Tasks
            </span>
            <span
              title={`${runningBackgroundTasks} running background service${runningBackgroundTasks === 1 ? "" : "s"}`}
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-mono leading-none",
                runningBackgroundTasks > 0
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-muted/60 text-muted-foreground",
              )}
            >
              {runningBackgroundTasks}
            </span>
          </div>
          <ChevronDownIcon
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-200",
              !tasksExpanded && "-rotate-90",
            )}
          />
        </div>

        {tasksExpanded && (
          <div className="flex flex-col gap-0.5 pt-0.5 max-h-72 overflow-y-auto pr-0.5">
            {visibleBackgroundTasks.length === 0 ? (
              <div className="py-1 px-2 text-[11px] text-muted-foreground font-mono">
                No background services running for this project
              </div>
            ) : (
              visibleBackgroundTasks.map((task) => {
                const isTermBusy =
                  task.terminalTarget && stoppingTerminalId === task.terminalTarget.terminalId;

                // Only LIVE background tasks are listed. The row shows a single
                // stop control; the section header is the collapse toggle.
                return (
                  <div
                    key={task.id}
                    className="flex h-7 items-center justify-between gap-2 px-2 rounded-md hover:bg-black/[0.035] dark:hover:bg-white/[0.08] transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="relative flex items-center justify-center shrink-0">
                        <TerminalBoxIcon className="size-3.5 text-foreground/80" />
                        <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      </div>
                      <span
                        className="text-xs text-foreground/85 font-normal truncate leading-normal"
                        title={task.title}
                      >
                        {task.title}
                      </span>
                    </div>

                    {task.terminalTarget && canOperateTerminal ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              disabled={isTermBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleStopTerminal(task.terminalTarget!, task.title);
                              }}
                              className="size-5 shrink-0 rounded hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 flex items-center justify-center transition-colors"
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
                        <TooltipPopup side="left">Stop service</TooltipPopup>
                      </Tooltip>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="my-1 border-b border-border/40" />
      </div>

      {/* 2. Goals Section */}
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
          className="flex h-7 items-center justify-between px-2 rounded-lg hover:bg-black/[0.035] dark:hover:bg-white/[0.08] transition-colors cursor-pointer group/header"
          aria-expanded={goalsExpanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground/85 group-hover/header:text-foreground transition-colors">
              Goals
            </span>
            <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground leading-none">
              {goalsCount}
            </span>
          </div>
          <ChevronDownIcon
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-200",
              !goalsExpanded && "-rotate-90",
            )}
          />
        </div>

        {goalsExpanded && (
          <div className="flex flex-col gap-0.5 pt-0.5 pl-1">
            {combinedGoals.length === 0 ? (
              <div className="py-1 px-2 text-[11px] text-muted-foreground font-mono">
                No active goals
              </div>
            ) : (
              combinedGoals.map((goal) => {
                const goalStatus = goal.status ?? "running";
                const isGoalCompleted = goalStatus === "completed" || goalStatus === "done";
                const isGoalFailed = goalStatus === "failed" || goalStatus === "error";
                const isGoalCancelled = goalStatus === "cancelled";
                return (
                  <div
                    key={goal.id}
                    className="flex h-7 items-center justify-between gap-2 px-2 rounded-md hover:bg-black/[0.035] dark:hover:bg-white/[0.08] transition-colors group cursor-default"
                    title={goal.text}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isGoalCompleted ? (
                        <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                      ) : isGoalFailed ? (
                        <AlertCircle className="size-3.5 text-rose-400 shrink-0" />
                      ) : isGoalCancelled ? (
                        <CancelledCircleIcon className="size-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <SleekSpinnerRing className="size-3.5 text-cyan-400 shrink-0 animate-spin" />
                      )}
                      <span className="text-xs text-foreground/85 group-hover:text-foreground font-normal truncate">
                        {goal.text}
                      </span>
                    </div>
                    {isGoalFailed ? (
                      <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-mono text-rose-400 uppercase shrink-0 leading-none">
                        failed
                      </span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      {/* 3. Watchdog Section — only live supervision of sub-agents + final handoff */}
      <WatchdogCard projectName={projectName} initiallyExpanded={true} />

      {/* 4. Subagents Section */}
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
          className="flex h-7 items-center justify-between px-2 rounded-lg hover:bg-black/[0.035] dark:hover:bg-white/[0.08] transition-colors cursor-pointer group/header"
          aria-expanded={subagentsExpanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground/85 group-hover/header:text-foreground transition-colors">
              Subagents
            </span>
            <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground leading-none">
              {subagentsCount}
            </span>
          </div>
          <ChevronDownIcon
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-200",
              !subagentsExpanded && "-rotate-90",
            )}
          />
        </div>

        {subagentsExpanded && (
          <div className="relative ml-3 flex flex-col gap-0.5 pt-0.5 pl-3 border-l border-cyan-500/25">
            <span className="pointer-events-none absolute -left-[3.5px] top-2 size-1.5 rounded-full bg-cyan-500/40" />
            {workersError ? (
              <div
                role="status"
                className="py-0.5 px-2 text-[10px] text-amber-500/90 flex items-center gap-1"
              >
                <AlertCircle className="size-3 shrink-0" /> {workersError}
              </div>
            ) : null}
            {combinedSubagents.length === 0 ? (
              <div className="py-1 px-2 text-[11px] text-muted-foreground font-mono">
                No active subagents
              </div>
            ) : (
              combinedSubagents.map((agent, agentIdx) => {
                const status = agent.status ?? "running";
                const isRunning = status === "running";
                const isCompleted = status === "completed";
                const isFailed = status === "failed" || status === "error";
                const isCancelled = status === "cancelled";
                // Only delegated sub-agents with a real child thread can open a
                // chat screen. Dsh telemetry workers have no thread, so their
                // rows stay inert. Finished/old rows simply grey out in place.
                const canOpen = Boolean(agent.childThreadId);
                return (
                  <div
                    key={agent.id}
                    {...(canOpen
                      ? {
                          role: "button" as const,
                          tabIndex: 0,
                          "aria-label": `Open ${agent.title} chat`,
                          title: `Open ${agent.title} chat`,
                          onClick: () => openSubagentChat(agent.childThreadId),
                          onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openSubagentChat(agent.childThreadId);
                            }
                          },
                        }
                      : {})}
                    className={cn(
                      "relative flex h-7 items-center justify-between gap-2 px-2 rounded-md hover:bg-black/[0.035] dark:hover:bg-white/[0.08] transition-colors group",
                      canOpen ? "cursor-pointer" : "cursor-default",
                      !isRunning ? "opacity-70" : undefined,
                    )}
                  >
                    <span className="pointer-events-none absolute -left-[15px] top-1/2 h-px w-2 -translate-y-1/2 bg-cyan-500/30" />
                    <span className="pointer-events-none absolute -left-[18px] top-1/2 size-1 -translate-y-1/2 rounded-full bg-cyan-500/35" />
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isCompleted ? (
                        <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                      ) : isFailed ? (
                        <AlertCircle className="size-3.5 text-rose-400 shrink-0" />
                      ) : isCancelled ? (
                        <CancelledCircleIcon className="size-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <SleekSpinnerRing className="size-3.5 text-cyan-400 shrink-0 animate-spin" />
                      )}
                      <span className="text-xs text-foreground/85 group-hover:text-foreground font-normal truncate">
                        {agent.title}
                      </span>
                    </div>
                    {isRunning ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleStopSubagent(agent);
                        }}
                        disabled={busyTaskId === agent.id}
                        className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                        title="Stop Subagent"
                        aria-label={`Stop ${agent.title}`}
                      >
                        <SquareIcon className="size-3 fill-current" />
                      </button>
                    ) : isFailed ? (
                      <span className="flex items-center gap-1 shrink-0">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded p-0.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                aria-label={`Why ${agent.title} failed`}
                              >
                                <InfoIcon className="size-3.5" />
                              </button>
                            }
                          />
                          <TooltipPopup side="left" className="max-w-80 text-left">
                            <span className="flex flex-col gap-1 text-[11px] leading-snug">
                              <span className="font-semibold text-rose-300">
                                Why this subagent failed
                              </span>
                              {agent.goal ? (
                                <span className="text-muted-foreground">Goal: {agent.goal}</span>
                              ) : null}
                              {agent.role ? (
                                <span className="text-muted-foreground/70">Role: {agent.role}</span>
                              ) : null}
                              {agent.model ? (
                                <span className="font-mono text-muted-foreground/70">
                                  Model: {agent.model}
                                </span>
                              ) : null}
                              <span className="text-foreground/85">
                                {agent.error ??
                                  "No failure reason was recorded by the worker. Most often: the model hit a rate-limit (HTTP 429) or produced zero usable files."}
                              </span>
                            </span>
                          </TooltipPopup>
                        </Tooltip>
                        <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-mono text-rose-400 uppercase leading-none">
                          failed
                        </span>
                      </span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="my-1 border-b border-border/40" />
      </div>
    </div>
  );
});

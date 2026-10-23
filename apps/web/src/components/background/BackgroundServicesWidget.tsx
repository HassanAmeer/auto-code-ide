import { memo, useCallback, useMemo, useState } from "react";
import { ChevronDownIcon, PlayIcon, SquareIcon, Loader2Icon } from "lucide-react";
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

function CancelledCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-4 shrink-0 text-zinc-400"}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function TimerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-4 shrink-0 text-zinc-400"}
      aria-hidden="true"
    >
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="13" y2="10" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}

function TerminalBoxIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-4 shrink-0 text-zinc-400"}
      aria-hidden="true"
    >
      <rect width="20" height="15" x="2" y="4.5" rx="3" />
      <path d="m6.5 9.5 2.5 2.5-2.5 2.5" />
      <path d="M11.5 14.5h5" />
    </svg>
  );
}

function SubagentBotIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-4 shrink-0 text-zinc-400"}
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

export interface BackgroundServicesWidgetProps {
  readonly environmentId?: EnvironmentId | null;
  readonly threadId?: ThreadId | null;
  readonly compact?: boolean;
  readonly initialExpanded?: boolean;
  readonly showOpenSheetButton?: boolean;
  readonly className?: string;
}

export const BackgroundServicesWidget = memo(function BackgroundServicesWidget({
  environmentId: propEnvironmentId,
  threadId,
  className,
}: BackgroundServicesWidgetProps) {
  const activeEnvId = useActiveEnvironmentId();
  const primaryEnvId = usePrimaryEnvironmentId();
  const environmentId = propEnvironmentId ?? activeEnvId ?? primaryEnvId;

  const [subagentsExpanded, setSubagentsExpanded] = useState(true);
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [stoppingTerminalId, setStoppingTerminalId] = useState<string | null>(null);

  const canOperate = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);

  // 1. Thread Projection for subagents & turn execution commands
  const threadRef = useMemo(
    () => (environmentId && threadId ? scopeThreadRef(environmentId, threadId) : null),
    [environmentId, threadId],
  );
  const threadDetails = useThreadProjection(threadRef);
  const rawSubagents = useMemo(() => threadDetails?.projection?.subagents ?? [], [threadDetails]);

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

  // Aggregate Background Tasks exactly matching the user's screenshot format
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
        task.schedule?.type === "once";
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

  const subagentsCount = rawSubagents.length;
  const tasksCount = backgroundTasks.length;

  return (
    <div className={cn("flex flex-col gap-3 py-2 px-1 text-zinc-300 select-none", className)}>
      {/* 1. Subagents Section */}
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
          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-white/[0.04] transition-colors cursor-pointer group/header"
          aria-expanded={subagentsExpanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-300 group-hover/header:text-zinc-100 transition-colors">
              Subagents
            </span>
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-zinc-800/80 text-zinc-400 font-mono text-2xs">
              {subagentsCount}
            </span>
          </div>
          <ChevronDownIcon
            className={cn(
              "size-4 text-zinc-500 transition-transform duration-200",
              !subagentsExpanded && "-rotate-90",
            )}
          />
        </div>

        {subagentsExpanded && (
          <div className="flex flex-col gap-1 pt-1 pl-1">
            {rawSubagents.length === 0 ? (
              <div className="py-1 px-2 text-2xs text-zinc-500 font-mono">No active subagents</div>
            ) : (
              rawSubagents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between gap-2.5 py-1.5 px-2 rounded-md hover:bg-white/[0.04] transition-colors group cursor-default"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <SubagentBotIcon className="size-4 shrink-0 text-zinc-400" />
                    <span className="text-xs text-zinc-300 group-hover:text-zinc-100 font-normal truncate">
                      {agent.agentRole || agent.name || "Subagent"}
                    </span>
                  </div>
                  {agent.status && (
                    <span className="text-2xs font-mono text-zinc-500 uppercase">
                      {agent.status}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 2. Background Tasks Section (Matches exact screenshot layout) */}
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
          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-white/[0.04] transition-colors cursor-pointer group/header"
          aria-expanded={tasksExpanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-300 group-hover/header:text-zinc-100 transition-colors">
              Background Tasks
            </span>
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-zinc-800/80 text-zinc-400 font-mono text-2xs">
              {tasksCount}
            </span>
          </div>
          <ChevronDownIcon
            className={cn(
              "size-4 text-zinc-500 transition-transform duration-200",
              !tasksExpanded && "-rotate-90",
            )}
          />
        </div>

        {tasksExpanded && (
          <div className="flex flex-col gap-0.5 pt-1 max-h-72 overflow-y-auto pr-0.5">
            {backgroundTasks.length === 0 ? (
              <div className="py-2 px-2 text-2xs text-zinc-500 font-mono">No background tasks</div>
            ) : (
              backgroundTasks.map((task) => {
                const isRunning = task.status === "running";
                const isTaskBusy = task.rawTask && busyTaskId === task.rawTask.id;
                const isTermBusy =
                  task.terminalTarget && stoppingTerminalId === task.terminalTarget.terminalId;

                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2.5 py-1.5 px-2 rounded-md hover:bg-white/[0.04] transition-colors group cursor-default"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Left Status Icon strictly matching screenshot */}
                      {task.kind === "cancelled" ? (
                        <CancelledCircleIcon className="size-4 shrink-0 text-zinc-400" />
                      ) : task.kind === "timer" ? (
                        <TimerIcon className="size-4 shrink-0 text-zinc-400" />
                      ) : isRunning ? (
                        <div className="relative flex items-center justify-center shrink-0">
                          <TerminalBoxIcon className="size-4 text-zinc-300" />
                          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        </div>
                      ) : (
                        <TerminalBoxIcon className="size-4 shrink-0 text-zinc-400" />
                      )}

                      <span
                        className="text-xs text-zinc-300 group-hover:text-zinc-100 font-normal truncate leading-normal"
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
                                className="size-5 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
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
      </div>
    </div>
  );
});

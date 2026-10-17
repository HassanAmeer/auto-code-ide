import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PauseCircleIcon,
  PlayIcon,
  ServerIcon,
  TerminalIcon,
  XCircleIcon,
  ZapIcon,
} from "lucide-react";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ScheduledTask,
  type ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { useBackgroundModeStore } from "../../lib/backgroundModeStore";
import { cn } from "../../lib/utils";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentScope } from "../../state/session";
import { useActiveEnvironmentId } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useKnownTerminalSessions } from "../../state/terminalSessions";
import { relativeLabel, scheduleLabel } from "../settings/ScheduledTasksSettings";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export type ServiceStatus = "running" | "pending" | "succeeded" | "failed" | "paused";

export interface UnifiedBackgroundService {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly category: "vps" | "task" | "terminal" | "sync";
  readonly categoryLabel: string;
  readonly status: ServiceStatus;
  readonly statusLabel: string;
  readonly lastRunAt?: string | null;
  readonly nextRunAt?: string | null;
  readonly error?: string | null;
  readonly details?: string | null;
  readonly rawTask?: ScheduledTask;
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
  compact = false,
  initialExpanded = false,
  showOpenSheetButton = false,
  className,
}: BackgroundServicesWidgetProps) {
  const activeEnvId = useActiveEnvironmentId();
  const primaryEnvId = usePrimaryEnvironmentId();
  const environmentId = propEnvironmentId ?? activeEnvId ?? primaryEnvId;

  const { isBgEnabled, setModalOpen } = useBackgroundModeStore();
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => new Set());
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const canOperate = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);

  const tasksQuery = useEnvironmentQuery(
    environmentId ? serverEnvironment.scheduledTasksLive({ environmentId, input: {} }) : null,
  );

  const terminalSessions = useKnownTerminalSessions({
    environmentId: environmentId ?? null,
    threadId: threadId ?? null,
  });

  const runTaskNow = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "run scheduled task from background services",
  });

  const toggleItemExpanded = useCallback((id: string) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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

  // Aggregate and normalize background services
  const services = useMemo<UnifiedBackgroundService[]>(() => {
    const list: UnifiedBackgroundService[] = [];

    // 1. VPS 24/7 Background Runner
    list.push({
      id: "vps-24-7-daemon",
      title: "VPS 24/7 Background Runner",
      subtitle: isBgEnabled
        ? "Active continuous agent execution on remote host"
        : "Paused • Only executes while browser is open",
      category: "vps",
      categoryLabel: "VPS Daemon",
      status: isBgEnabled ? "running" : "paused",
      statusLabel: isBgEnabled ? "Active" : "Paused",
      details:
        "Persistent daemon that keeps scheduled jobs and agent tasks running 24/7 even after tab closes.",
    });

    // 2. Scheduled Tasks / Automations
    const tasks = tasksQuery.data?.tasks ?? [];
    for (const task of tasks) {
      let status: ServiceStatus = "pending";
      let statusLabel = "Scheduled";

      if (task.lastRunStatus === "running") {
        status = "running";
        statusLabel = "Running";
      } else if (task.lastRunStatus === "succeeded") {
        status = "succeeded";
        statusLabel = "Completed";
      } else if (task.lastRunStatus === "failed") {
        status = "failed";
        statusLabel = "Failed";
      } else if (!task.enabled) {
        status = "paused";
        statusLabel = "Disabled";
      }

      const scheduleTxt = scheduleLabel(task.schedule);
      const lastRunTxt = task.lastRunAt ? `Last run ${relativeLabel(task.lastRunAt)}` : "Never run";

      list.push({
        id: `task-${task.id}`,
        title: task.title,
        subtitle: `${scheduleTxt} • ${lastRunTxt}`,
        category: "task",
        categoryLabel: "Scheduled Task",
        status,
        statusLabel,
        lastRunAt: task.lastRunAt,
        nextRunAt: task.nextRunAt,
        error: task.lastRunError,
        details: task.prompt,
        rawTask: task,
      });
    }

    // 3. Active Terminal Sessions / Subprocesses
    if (terminalSessions) {
      for (const session of terminalSessions) {
        const summary = session.state.summary;
        if (!summary) continue;

        if (summary.hasRunningSubprocess) {
          list.push({
            id: `term-${summary.terminalId}`,
            title: summary.label || `Terminal ${summary.terminalId}`,
            subtitle: `PID ${summary.pid ?? "?"} • ${summary.cwd}`,
            category: "terminal",
            categoryLabel: "Terminal Process",
            status: "running",
            statusLabel: "Running",
            details: `Running subprocess in directory: ${summary.cwd}`,
          });
        } else if (summary.exitCode !== null) {
          const isSuccess = summary.exitCode === 0;
          list.push({
            id: `term-${summary.terminalId}`,
            title: summary.label || `Terminal ${summary.terminalId}`,
            subtitle: `Exited with code ${summary.exitCode} • ${summary.cwd}`,
            category: "terminal",
            categoryLabel: "Terminal Process",
            status: isSuccess ? "succeeded" : "failed",
            statusLabel: isSuccess ? "Completed" : "Error",
            details: `Process terminated with exit code ${summary.exitCode}`,
          });
        }
      }
    }

    // 4. VPS State SQLite Sync
    list.push({
      id: "vps-state-sync",
      title: "VPS State Persistence Sync",
      subtitle: "Synchronized with /root/autojobs/data/userdata/statev2.sqlite",
      category: "sync",
      categoryLabel: "System Sync",
      status: "succeeded",
      statusLabel: "Synced",
      details:
        "Real-time state synchronization ensuring persistent history, drafts, and thread state.",
    });

    return list;
  }, [isBgEnabled, tasksQuery.data?.tasks, terminalSessions]);

  const runningCount = services.filter((s) => s.status === "running").length;
  const pendingCount = services.filter((s) => s.status === "pending").length;
  const succeededCount = services.filter((s) => s.status === "succeeded").length;
  const failedCount = services.filter((s) => s.status === "failed").length;
  const totalCount = services.length;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-white/10 bg-zinc-950/40 backdrop-blur-md overflow-hidden transition-all duration-200",
        className,
      )}
    >
      {/* Collapsed Header Bar (Antigravity Style) */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 cursor-pointer select-none transition-colors hover:bg-white/[0.04]",
          isExpanded && "border-b border-white/[0.08] bg-white/[0.02]",
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        aria-expanded={isExpanded}
        aria-label="Toggle background services"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "size-6 rounded-lg flex items-center justify-center transition-all shrink-0",
              runningCount > 0
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-zinc-800/80 text-zinc-400 border border-white/10",
            )}
          >
            <ActivityIcon className={cn("size-3.5", runningCount > 0 && "animate-pulse")} />
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-zinc-100 truncate">
              Background Services
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Running/Total Badge */}
          {runningCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-xs">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {runningCount} Running
            </span>
          ) : failedCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <XCircleIcon className="size-3" />
              {failedCount} Failed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-400 bg-zinc-800/80 border border-white/10">
              {totalCount} Active
            </span>
          )}

          {/* Optional Open Sheet Icon Button */}
          {showOpenSheetButton && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="size-6 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
                    aria-label="Open VPS background sheet"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                  </button>
                }
              />
              <TooltipPopup side="bottom">Open VPS Background Sheet</TooltipPopup>
            </Tooltip>
          )}

          {/* Expand/Collapse Chevron Button */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="size-6 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
            aria-label={isExpanded ? "Collapse background services" : "Expand background services"}
          >
            {isExpanded ? (
              <ChevronUpIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Uncollapsed / Expanded List */}
      {isExpanded && (
        <div className="flex flex-col p-2.5 gap-2 bg-black/20">
          {/* Quick Metrics Bar */}
          <div className="flex items-center justify-between px-1 text-[11px] text-zinc-400 font-mono pb-1 border-b border-white/[0.06]">
            <span>{totalCount} Total Services</span>
            <div className="flex items-center gap-2">
              {runningCount > 0 && (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="size-1 rounded-full bg-emerald-400 animate-ping" />
                  {runningCount} Running
                </span>
              )}
              {pendingCount > 0 && (
                <span className="text-amber-400 flex items-center gap-1">
                  <ClockIcon className="size-2.5" />
                  {pendingCount} Pending
                </span>
              )}
              {succeededCount > 0 && (
                <span className="text-emerald-400/80 flex items-center gap-1">
                  <CheckCircle2Icon className="size-2.5" />
                  {succeededCount} Done
                </span>
              )}
              {failedCount > 0 && (
                <span className="text-rose-400 flex items-center gap-1">
                  <XCircleIcon className="size-2.5" />
                  {failedCount} Failed
                </span>
              )}
            </div>
          </div>

          {/* List of Services */}
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-0.5">
            {services.map((service) => {
              const itemExpanded = expandedItemIds.has(service.id);
              const isTaskBusy = service.rawTask && busyTaskId === service.rawTask.id;

              return (
                <div
                  key={service.id}
                  className="rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors p-2 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* Status Icon & Title */}
                    <div className="flex items-center gap-2 min-w-0">
                      {service.status === "running" && (
                        <Loader2Icon className="size-3.5 text-sky-400 animate-spin shrink-0" />
                      )}
                      {service.status === "pending" && (
                        <ClockIcon className="size-3.5 text-amber-400 shrink-0" />
                      )}
                      {service.status === "succeeded" && (
                        <CheckCircle2Icon className="size-3.5 text-emerald-400 shrink-0" />
                      )}
                      {service.status === "failed" && (
                        <XCircleIcon className="size-3.5 text-rose-400 shrink-0" />
                      )}
                      {service.status === "paused" && (
                        <PauseCircleIcon className="size-3.5 text-zinc-500 shrink-0" />
                      )}

                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {service.title}
                        </span>
                        {service.subtitle && (
                          <span className="text-[10px] text-zinc-400 truncate leading-tight">
                            {service.subtitle}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Badge & Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          "text-[9px] font-mono px-1.5 py-0.5 rounded-sm font-semibold uppercase",
                          service.status === "running" &&
                            "bg-sky-500/20 text-sky-300 border border-sky-500/30",
                          service.status === "pending" &&
                            "bg-amber-500/20 text-amber-300 border border-amber-500/30",
                          service.status === "succeeded" &&
                            "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
                          service.status === "failed" &&
                            "bg-rose-500/20 text-rose-300 border border-rose-500/30",
                          service.status === "paused" &&
                            "bg-zinc-800 text-zinc-400 border border-white/10",
                        )}
                      >
                        {service.statusLabel}
                      </span>

                      {/* Run Now for scheduled tasks */}
                      {service.rawTask && canOperate && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                disabled={isTaskBusy}
                                onClick={() => handleRunTask(service.rawTask!)}
                                className="size-5 rounded hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
                                aria-label={`Run ${service.title} now`}
                              >
                                {isTaskBusy ? (
                                  <Loader2Icon className="size-3 animate-spin text-sky-400" />
                                ) : (
                                  <PlayIcon className="size-3 text-emerald-400" />
                                )}
                              </button>
                            }
                          />
                          <TooltipPopup side="bottom">Run now</TooltipPopup>
                        </Tooltip>
                      )}

                      {/* Expand item details toggle */}
                      {(service.details || service.error) && (
                        <button
                          type="button"
                          onClick={() => toggleItemExpanded(service.id)}
                          className="size-5 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 flex items-center justify-center transition-colors"
                          aria-label={itemExpanded ? "Collapse details" : "Expand details"}
                        >
                          {itemExpanded ? (
                            <ChevronUpIcon className="size-3" />
                          ) : (
                            <ChevronDownIcon className="size-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Item Details */}
                  {itemExpanded && (
                    <div className="pt-1.5 pb-0.5 border-t border-white/[0.04] text-[10px] text-zinc-400 flex flex-col gap-1">
                      <div className="flex items-center gap-1 font-mono text-[9px] text-zinc-500">
                        <span>Category: {service.categoryLabel}</span>
                        <span>•</span>
                        <span>ID: {service.id}</span>
                      </div>
                      {service.nextRunAt && (
                        <div>
                          Next scheduled run:{" "}
                          <span className="text-zinc-300">{relativeLabel(service.nextRunAt)}</span>
                        </div>
                      )}
                      {service.details && (
                        <div className="rounded bg-black/40 p-1.5 text-zinc-300 font-mono text-[10px] break-words line-clamp-4">
                          {service.details}
                        </div>
                      )}
                      {service.error && (
                        <div className="rounded bg-rose-950/40 border border-rose-500/30 p-1.5 text-rose-300 font-mono text-[10px] break-words">
                          Error: {service.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

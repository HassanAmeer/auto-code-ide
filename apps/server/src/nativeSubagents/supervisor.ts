// Watchdog supervisor for native OpenCode engine subagents.
// No DeepSeek worker harness, no worktrees, no external daemon.
import {
  executeParallelSubagents,
  type SubagentTaskInput,
} from "../../../../engine/runtimes/opencode-full-engine/index.ts";
import {
  deriveSpecialistRole,
  getTelemetrySnapshot,
  isWorkerAborted,
  markWorkerAborted,
  registerGoalTelemetry,
  registerWorkerTelemetry,
  stopAllRunningTelemetry,
  stopWorkerTelemetry,
  updateGoalTelemetryStatus,
  updateWorkerTelemetryStatus,
} from "./telemetry.ts";

export type WatchdogStatus =
  | "watching"
  | "reviewing"
  | "building"
  | "testing"
  | "completed"
  | "failed"
  | "cancelled";

export function isWatchdogStatusTerminal(status: WatchdogStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export interface WatchdogWorkerRow {
  id: string;
  role: string;
  goal: string;
  status: "running" | "completed" | "failed" | "cancelled";
  filesChanged: number;
  reviewNotes: string[];
  buildRan: boolean;
  buildPassed: boolean | undefined;
  testRan: boolean;
  testPassed: boolean | undefined;
  model?: string | undefined;
  logs?: string[] | undefined;
}

export type ChecklistItem = { text: string; done: boolean };

export interface WatchdogState {
  id: string;
  status: WatchdogStatus;
  projectId: string;
  projectName: string;
  taskTitle: string;
  lastAction: string;
  workers: WatchdogWorkerRow[];
  issues: string[];
  recoveries: number;
  checklist: ChecklistItem[];
  stopped?: boolean | undefined;
  startedAt: number;
  updatedAt: number;
  completedAt: number | undefined;
  verdict: string;
}

const watchdogs = new Map<string, WatchdogState>();
const now = () => Date.now();

const WATCHDOG_TTL_MS = Number(process.env.SUPER_AGENT_WATCHDOG_TTL_MS || 6 * 60 * 60 * 1000);

function pruneWatchdogs(): void {
  const cutoff = now() - WATCHDOG_TTL_MS;
  for (const [id, state] of watchdogs) {
    if (isWatchdogStatusTerminal(state.status) && (state.completedAt ?? state.updatedAt) < cutoff) {
      watchdogs.delete(id);
    }
  }
  const finished = [...watchdogs.values()]
    .filter((s) => isWatchdogStatusTerminal(s.status))
    .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  for (const state of finished.slice(100)) watchdogs.delete(state.id);
}

if (typeof setInterval === "function") {
  const timer = setInterval(pruneWatchdogs, 5 * 60 * 1000);
  (timer as { unref?: () => void }).unref?.();
}

export function getWatchdogSnapshot(filter?: { projectName?: string; projectId?: string }): {
  ok: boolean;
  watchdogs: WatchdogState[];
  active: number;
  timestamp: number;
} {
  let list = [...watchdogs.values()];
  if (filter?.projectName && filter.projectName !== "all" && filter.projectName !== "Workspace") {
    const needle = filter.projectName.toLowerCase();
    list = list.filter((w) => w.projectName.toLowerCase().includes(needle));
  }
  if (filter?.projectId) list = list.filter((w) => w.projectId === filter.projectId);
  list.sort((a, b) => b.startedAt - a.startedAt);
  return {
    ok: true,
    watchdogs: list,
    active: list.filter((w) => !isWatchdogStatusTerminal(w.status)).length,
    timestamp: now(),
  };
}

/** Split a task into parallel milestones from explicit lines/bullets. */
export function splitTaskIntoMilestones(prompt: string, maxWorkers: number): string[] {
  const lines = prompt
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 8 && !/^(requirements|task|context):/i.test(l));
  const unique = [...new Set(lines)];
  if (unique.length <= 1) return [prompt.trim()].slice(0, maxWorkers);
  return unique.slice(0, maxWorkers);
}

export function stopWatchdog(id: string): boolean {
  const state = watchdogs.get(id);
  if (!state || isWatchdogStatusTerminal(state.status)) return false;
  for (const worker of state.workers) {
    if (worker.status === "running") {
      markWorkerAborted(worker.id);
      stopWorkerTelemetry(worker.id);
      worker.status = "cancelled";
    }
  }
  state.stopped = true;
  state.status = "cancelled";
  state.lastAction = "Stopped by user — all native subagents cancelled.";
  state.completedAt = now();
  state.updatedAt = now();
  state.verdict = "Cancelled by user.";
  return true;
}

export function stopAllWatchdogs(): {
  stoppedWatchdogs: number;
  stoppedWorkers: number;
  stoppedGoals: number;
} {
  let stoppedWatchdogs = 0;
  for (const state of watchdogs.values()) {
    if (!isWatchdogStatusTerminal(state.status) && stopWatchdog(state.id)) stoppedWatchdogs += 1;
  }
  const telemetry = stopAllRunningTelemetry();
  return { stoppedWatchdogs, ...telemetry };
}

export interface WatchdogDispatchParams {
  projectId: string;
  projectName: string;
  projectRoot: string;
  taskTitle: string;
  prompt: string;
  model?: string;
  lanes?: string;
  maxWorkers?: number;
  onLog?: (msg: string) => undefined | ((msg: string) => void);
  __isRetry?: boolean;
}

export interface WatchdogDispatchResult {
  ok: boolean;
  watchdogId: string;
  status: WatchdogStatus;
  verdict: string;
  workersCompleted: number;
  workersTotal: number;
  issues: string[];
}

/**
 * Supervise a task with native OpenCode engine subagents. The watchdog owns
 * the milestone split, live telemetry and final verdict — the actual work is
 * done in-process by executeParallelSubagents().
 */
export async function startWatchdogSupervision(
  params: WatchdogDispatchParams,
): Promise<WatchdogDispatchResult> {
  const { projectId, projectName, projectRoot, taskTitle, prompt, lanes, onLog } = params;
  const maxWorkers = Math.max(1, Math.min(params.maxWorkers ?? 4, 12));
  const laneModels = (lanes || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const baseModel =
    params.model && params.model !== "default" ? params.model : "opencode/beam-free";
  const models = laneModels.length > 0 ? laneModels : [baseModel];

  const id = `watchdog-${now()}-${Math.random().toString(36).slice(2, 7)}`;
  const state: WatchdogState = {
    id,
    status: "watching",
    projectId,
    projectName,
    taskTitle,
    lastAction: "Native engine subagents dispatched",
    workers: [],
    issues: [],
    recoveries: 0,
    checklist: [],
    startedAt: now(),
    updatedAt: now(),
    completedAt: undefined,
    verdict: "",
  };
  watchdogs.set(id, state);

  const milestones = splitTaskIntoMilestones(prompt, maxWorkers);
  onLog?.(`🐕 Watchdog ${id} supervising ${milestones.length} native subagent worker(s).`);

  const tasks: SubagentTaskInput[] = milestones.map((milestone, index) => {
    const workerId = `worker-${id}-${index + 1}`;
    const model = models[index % models.length]!;
    const role = deriveSpecialistRole(milestone, undefined, index + 1);
    const logs: string[] = [];
    state.workers.push({
      id: workerId,
      role,
      goal: milestone.slice(0, 120),
      status: "running",
      filesChanged: 0,
      reviewNotes: [],
      buildRan: false,
      buildPassed: undefined,
      testRan: false,
      testPassed: undefined,
      model,
      logs,
    });
    registerWorkerTelemetry({
      id: workerId,
      role,
      status: "running",
      model,
      cwd: projectRoot,
      goal: milestone.slice(0, 120),
      startedAt: now(),
      projectName,
      projectId,
      logs,
    });
    registerGoalTelemetry({
      id: `goal-${workerId}`,
      title: milestone.slice(0, 120),
      status: "running",
      workerId,
      order: index + 1,
      projectName,
      projectId,
      createdAt: now(),
    });
    return {
      agent: "build",
      description: milestone.slice(0, 80),
      prompt: `${taskTitle}\n\n${milestone}`,
      model,
      cwd: projectRoot,
      abortCheck: () => isWorkerAborted(workerId),
      onLog: (msg: string) => {
        logs.push(msg);
        if (logs.length > 40) logs.shift();
        onLog?.(`   [${role}] ${msg}`);
      },
    };
  });

  let results: Awaited<ReturnType<typeof executeParallelSubagents>> = [];
  try {
    results = await executeParallelSubagents(tasks, projectRoot, maxWorkers);
  } catch (error: any) {
    state.issues.push(error?.message || String(error));
  }

  state.status = "reviewing";
  state.updatedAt = now();
  let completed = 0;
  results.forEach((result, index) => {
    const row = state.workers[index];
    if (!row) return;
    if (result.status === "completed") {
      completed += 1;
      row.status = "completed";
      row.filesChanged = result.filesModified.length;
      row.reviewNotes = result.filesModified.map((f) => `Modified ${f}`);
      updateWorkerTelemetryStatus(row.id, "completed", {
        filesModified: result.filesModified,
        progress: 100,
      });
      updateGoalTelemetryStatus(`goal-${row.id}`, "completed");
    } else {
      row.status = result.status === "aborted" ? "cancelled" : "failed";
      row.reviewNotes = result.error ? [result.error] : [];
      state.issues.push(`${row.role}: ${result.error || result.status}`);
      updateWorkerTelemetryStatus(row.id, row.status, { error: result.error });
      updateGoalTelemetryStatus(`goal-${row.id}`, row.status);
    }
  });

  // Workers whose native session was aborted but that produced no result row.
  state.workers.forEach((row, index) => {
    if (results[index] || row.status !== "running") return;
    row.status = "cancelled";
    updateWorkerTelemetryStatus(row.id, "cancelled");
    updateGoalTelemetryStatus(`goal-${row.id}`, "cancelled");
  });

  const ok = completed === state.workers.length && state.issues.length === 0;
  state.status = ok ? "completed" : "failed";
  state.lastAction = ok ? "All native subagents completed" : "Some subagents failed";
  state.verdict = ok
    ? `${completed}/${state.workers.length} native engine subagents completed successfully.`
    : `${completed}/${state.workers.length} completed — ${state.issues.length} issue(s).`;
  state.completedAt = now();
  state.updatedAt = now();

  return {
    ok,
    watchdogId: id,
    status: state.status,
    verdict: state.verdict,
    workersCompleted: completed,
    workersTotal: state.workers.length,
    issues: state.issues,
  };
}

export {
  getTelemetrySnapshot,
  registerWorkerTelemetry,
  updateWorkerTelemetryStatus,
  registerGoalTelemetry,
  updateGoalTelemetryStatus,
  stopAllRunningTelemetry,
  stopWorkerTelemetry,
  pruneStaleTelemetry,
  deriveSpecialistRole,
  isWorkerAborted,
  clearWorkerAbort,
  markWorkerAborted,
  type TelemetrySnapshot,
  type ActiveWorkerTelemetry,
  type ActiveGoalTelemetry,
} from "./telemetry.ts";

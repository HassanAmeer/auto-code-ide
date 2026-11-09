// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off

export interface ActiveWorkerTelemetry {
  id: string;
  role: string;
  status: "running" | "completed" | "failed";
  model: string;
  cwd: string;
  goal: string;
  progress?: number | undefined;
  startedAt: number;
  completedAt?: number | undefined;
  projectName?: string | undefined;
  projectId?: string | undefined;
  filesModified?: string[] | undefined;
  logs?: string[] | undefined;
}

export interface ActiveGoalTelemetry {
  id: string;
  title: string;
  status: "running" | "completed" | "failed";
  workerId?: string | undefined;
  order?: number | undefined;
  projectName?: string | undefined;
  projectId?: string | undefined;
  createdAt: number;
  completedAt?: number | undefined;
}

export interface TelemetrySnapshot {
  ok: boolean;
  workers: ActiveWorkerTelemetry[];
  goals: ActiveGoalTelemetry[];
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

// In-memory thread-safe maps for live worker & goal telemetry
const activeWorkers = new Map<string, ActiveWorkerTelemetry>();
const activeGoals = new Map<string, ActiveGoalTelemetry>();

/**
 * Derives appropriate Specialist Role according to user requirements:
 * e.g. "Server & Deployment Specialist", "Android Native Specialist", "Web UI & Signaling Specialist"
 */
export function deriveSpecialistRole(title: string, category?: string): string {
  const lower = title.toLowerCase();

  if (
    lower.includes("server") ||
    lower.includes("deploy") ||
    lower.includes("vps") ||
    lower.includes("backend") ||
    lower.includes("endpoint") ||
    lower.includes("route") ||
    lower.includes("api")
  ) {
    return "Server & Deployment Specialist";
  }

  if (
    lower.includes("android") ||
    lower.includes("native") ||
    lower.includes("mobile") ||
    lower.includes("kotlin") ||
    lower.includes("java") ||
    lower.includes("webrtc audio")
  ) {
    return "Android Native Specialist";
  }

  if (
    lower.includes("ui") ||
    lower.includes("web") ||
    lower.includes("frontend") ||
    lower.includes("signaling") ||
    lower.includes("telemetry") ||
    lower.includes("screen") ||
    lower.includes("widget") ||
    lower.includes("component") ||
    lower.includes("css") ||
    lower.includes("tailwind")
  ) {
    return "Web UI & Signaling Specialist";
  }

  if (
    lower.includes("database") ||
    lower.includes("schema") ||
    lower.includes("sqlite") ||
    lower.includes("sql") ||
    lower.includes("storage")
  ) {
    return "Database & Storage Specialist";
  }

  if (
    lower.includes("test") ||
    lower.includes("qa") ||
    lower.includes("audit") ||
    lower.includes("review") ||
    lower.includes("syntax")
  ) {
    return "Quality Assurance & Review Specialist";
  }

  if (category === "architecture_schema") return "System Architecture Specialist";
  if (category === "frontend_ui") return "Web UI & Signaling Specialist";
  if (category === "core_logic_api") return "Server & Backend Specialist";
  if (category === "integration_polish") return "Integration & Deployment Specialist";

  return "Autonomous Parallel Specialist";
}

/**
 * Register or update a worker in the live telemetry store
 */
export function registerWorkerTelemetry(worker: ActiveWorkerTelemetry): void {
  activeWorkers.set(worker.id, {
    ...worker,
    startedAt: worker.startedAt || Date.now(),
    model: worker.model || "DeepSeek / Gemini",
  });
}

/**
 * Update the status and optional fields of an existing worker
 */
export function updateWorkerTelemetryStatus(
  id: string,
  status: "running" | "completed" | "failed",
  updates?: Partial<ActiveWorkerTelemetry>,
): void {
  const existing = activeWorkers.get(id);
  if (existing) {
    activeWorkers.set(id, {
      ...existing,
      ...updates,
      status,
      completedAt: status !== "running" ? updates?.completedAt || Date.now() : undefined,
    });
  } else if (updates) {
    // If not found, create new entry with provided details
    activeWorkers.set(id, {
      id,
      role: updates.role || "Autonomous Parallel Specialist",
      status,
      model: updates.model || "DeepSeek / Gemini",
      cwd: updates.cwd || process.cwd(),
      goal: updates.goal || "Autonomous Task Execution",
      startedAt: updates.startedAt || Date.now(),
      completedAt: status !== "running" ? Date.now() : undefined,
      ...updates,
    });
  }
}

/**
 * Register or update a goal in the live telemetry store
 */
export function registerGoalTelemetry(goal: ActiveGoalTelemetry): void {
  activeGoals.set(goal.id, {
    ...goal,
    createdAt: goal.createdAt || Date.now(),
  });
}

/**
 * Update status of an active goal
 */
export function updateGoalTelemetryStatus(
  id: string,
  status: "running" | "completed" | "failed",
  updates?: Partial<ActiveGoalTelemetry>,
): void {
  const existing = activeGoals.get(id);
  if (existing) {
    activeGoals.set(id, {
      ...existing,
      ...updates,
      status,
      completedAt: status !== "running" ? updates?.completedAt || Date.now() : undefined,
    });
  } else if (updates?.title) {
    activeGoals.set(id, {
      id,
      title: updates.title,
      status,
      createdAt: Date.now(),
      completedAt: status !== "running" ? Date.now() : undefined,
      ...updates,
    });
  }
}

/**
 * Abort every still-running worker and goal. Used by the UI "Stop All" control.
 * In-process worker loops are cooperative, so this marks the telemetry as
 * aborted rather than guaranteeing a hard kill; the merged workspace is left
 * untouched for the user to review.
 */
export function stopAllRunningTelemetry(): { stoppedWorkers: number; stoppedGoals: number } {
  let stoppedWorkers = 0;
  let stoppedGoals = 0;
  const now = Date.now();
  for (const [id, worker] of activeWorkers) {
    if (worker.status !== "running") continue;
    activeWorkers.set(id, {
      ...worker,
      status: "failed",
      completedAt: now,
    });
    stoppedWorkers += 1;
  }
  for (const [id, goal] of activeGoals) {
    if (goal.status !== "running") continue;
    activeGoals.set(id, {
      ...goal,
      status: "failed",
      completedAt: now,
    } as ActiveGoalTelemetry);
    stoppedGoals += 1;
  }
  return { stoppedWorkers, stoppedGoals };
}

/**
 * Clear all worker telemetry
 */
export function clearWorkerTelemetry(): void {
  activeWorkers.clear();
  activeGoals.clear();
}

/**
 * Returns a live telemetry snapshot with workers, goals, and counts
 */
export function getTelemetrySnapshot(filter?: {
  projectName?: string | undefined;
  projectId?: string | undefined;
}): TelemetrySnapshot {
  let workers = Array.from(activeWorkers.values());
  let goals = Array.from(activeGoals.values());

  if (filter?.projectName && filter.projectName !== "all" && filter.projectName !== "Workspace") {
    const nameMatch = filter.projectName.toLowerCase();
    const filteredWorkers = workers.filter(
      (w) => w.projectName && w.projectName.toLowerCase().includes(nameMatch),
    );
    if (filteredWorkers.length > 0) {
      workers = filteredWorkers;
    }

    const filteredGoals = goals.filter(
      (g) => g.projectName && g.projectName.toLowerCase().includes(nameMatch),
    );
    if (filteredGoals.length > 0) {
      goals = filteredGoals;
    }
  }

  // Sort: running workers first, then by startedAt descending
  workers.sort((a, b) => {
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    return (b.startedAt || 0) - (a.startedAt || 0);
  });

  // Sort goals by order ascending, then createdAt descending
  goals.sort((a, b) => {
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    return (a.order || 99) - (b.order || 99);
  });

  const activeWorkersCount = workers.filter((w) => w.status === "running").length;
  const completedWorkersCount = workers.filter((w) => w.status === "completed").length;
  const failedWorkersCount = workers.filter((w) => w.status === "failed").length;

  const activeGoalsCount = goals.filter((g) => g.status === "running").length;
  const completedGoalsCount = goals.filter((g) => g.status === "completed").length;

  return {
    ok: true,
    workers,
    goals,
    count: {
      totalWorkers: workers.length,
      activeWorkers: activeWorkersCount,
      completedWorkers: completedWorkersCount,
      failedWorkers: failedWorkersCount,
      totalGoals: goals.length,
      activeGoals: activeGoalsCount,
      completedGoals: completedGoalsCount,
    },
    timestamp: Date.now(),
  };
}

/**
 * Clears telemetry or removes completed entries older than threshold
 */
export function clearTelemetry(olderThanMs?: number): void {
  if (!olderThanMs) {
    activeWorkers.clear();
    activeGoals.clear();
    return;
  }
  const cutoff = Date.now() - olderThanMs;
  for (const [id, worker] of activeWorkers.entries()) {
    if (worker.status !== "running" && (worker.completedAt || 0) < cutoff) {
      activeWorkers.delete(id);
    }
  }
  for (const [id, goal] of activeGoals.entries()) {
    if (goal.status !== "running" && (goal.completedAt || 0) < cutoff) {
      activeGoals.delete(id);
    }
  }
}
